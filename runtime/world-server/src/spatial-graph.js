'use strict';
const fs = require('fs');
const path = require('path');
const ROOT_ID = 0;
const CANONICAL_CHILD_FORM = 'canonical';
const MAX_NODE_TREE_DEPTH = 64;
function classifyChildren(rawChildren) {
    const out = { refs: [], embedded: [], invalid: [], present: false, count: 0 };
    if (!Array.isArray(rawChildren))
        return out;
    out.present = true;
    out.count = rawChildren.length;
    rawChildren.forEach((entry, index) => {
        if (Number.isInteger(entry))
            out.refs.push(entry);
        else if (entry && typeof entry === 'object' && !Array.isArray(entry))
            out.embedded.push(entry);
        else
            out.invalid.push({ index: index, value: entry });
    });
    return out;
}
function inspectIncomingForest(forest, opts) {
    opts = opts || {};
    const flatten = !!opts.flattenEmbedded;
    const base = opts.basePath || '$';
    const idRefPaths = [];
    const embeddedPaths = [];
    const invalidPaths = [];
    let depthExceededPath = null;
    (function walk(nodes, prefix, depth) {
        if (depthExceededPath)
            return;
        if (depth > MAX_NODE_TREE_DEPTH) {
            depthExceededPath = prefix;
            return;
        }
        nodes.forEach((raw, i) => {
            if (depthExceededPath)
                return;
            const at = prefix + '[' + i + ']';
            const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
            const c = classifyChildren(r.children);
            if (!c.present)
                return;
            for (const bad of c.invalid)
                invalidPaths.push({ path: at + '.children[' + bad.index + ']', type: typeofLabel(bad.value) });
            if (c.refs.length)
                idRefPaths.push({ path: at + '.children', refs: c.refs.slice() });
            if (c.embedded.length) {
                embeddedPaths.push({ path: at + '.children', count: c.embedded.length });
                walk(c.embedded, at + '.children', depth + 1);
            }
        });
    })(Array.isArray(forest) ? forest : [], base, 1);
    if (depthExceededPath)
        return {
            ok: false, status: 422, error: 'node_tree_too_deep',
            detail: {
                message: 'children[] nesting exceeds the maximum supported depth of ' + MAX_NODE_TREE_DEPTH + '.',
                path: depthExceededPath,
            },
        };
    if (invalidPaths.length)
        return {
            ok: false, status: 400, error: 'invalid_child_entry',
            detail: {
                message: 'children[] entries must be integer node-id references (OSLFlatNode)'
                    + (flatten ? ' or embedded Node objects' : '')
                    + '; these entries are neither and were REFUSED (never silently dropped).',
                offending_paths: invalidPaths,
            },
        };
    if (idRefPaths.length && !opts.allowIdRefs)
        return {
            ok: false, status: 400, error: 'child_id_refs_not_supported_on_create',
            detail: {
                message: 'This server assigns node ids; a node created by POST starts as a LEAF. '
                    + 'Integer child id-refs on a create body cannot be honoured (they were previously '
                    + 'DROPPED SILENTLY — they are now REFUSED). Create the parent first, then POST its '
                    + 'children to /wow/spatial/{spatialID}/node/{newParentId}.',
                offending_paths: idRefPaths,
            },
        };
    if (embeddedPaths.length && !flatten)
        return {
            ok: false, status: 422, error: 'embedded_children_not_supported',
            detail: {
                message: 'This body carries the CANONICAL WoW `Node` shape (children = embedded Node '
                    + 'objects). This server serves + accepts `OSLFlatNode` — a DECLARED, LABELED '
                    + 'divergence in which children are INTEGER node-id references. Your embedded '
                    + 'children were REFUSED, NOT stored, and NOT silently dropped.',
                served_schema: 'OSLFlatNode',
                canonical_schema: 'Node',
                divergence: 'Node.children: integer id-refs (OSL) vs embedded Node objects (canonical)',
                offending_paths: embeddedPaths,
                remedies: [
                    'Send OSLFlatNode: POST each node with children:[] (or omitted), then POST its '
                        + 'children under the id we return.',
                    'Or opt in to server-side flattening: resend with header '
                        + '`X-OSL-WoW-Node-Form: canonical` (or ?nodeForm=canonical). We will then assign '
                        + 'ids to your embedded subtree, store it, and return EVERY node we stored.',
                ],
            },
        };
    return null;
}
function typeofLabel(v) {
    if (v === null)
        return 'null';
    if (Array.isArray(v))
        return 'array';
    return typeof v;
}
function translationMatrix(position) {
    const p = Array.isArray(position) ? position : [0, 0, 0];
    const x = Number(p[0]) || 0;
    const y = Number(p[1]) || 0;
    const z = Number(p[2]) || 0;
    return [
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        x, y, z, 1,
    ];
}
function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
}
function isEnvOn(name) {
    return /^(1|true|on|yes)$/i.test(String(process.env[name] || ''));
}
function createSpatialGraphStore(opts) {
    opts = opts || {};
    const spatialId = String(opts.spatialId || 'world');
    const acceptedIds = (opts.acceptedIds || [spatialId])
        .map(id => String(id))
        .filter((id, i, all) => id && all.indexOf(id) === i);
    const seedBuilder = typeof opts.seedBuilder === 'function' ? opts.seedBuilder : () => ({ root: rootNode(), nodes: [] });
    const persist = opts.persist != null ? !!opts.persist : isEnvOn('OSL_WOW_SPATIAL_PERSIST');
    const persistDir = String(opts.persistDir
        || process.env.OSL_WOW_SPATIAL_DIR
        || path.join(__dirname, '..', 'spatial-store'));
    const persistFile = path.join(persistDir, spatialId.replace(/[^A-Za-z0-9._-]/g, '_') + '.json');
    let nodes = new Map();
    let nextId = ROOT_ID + 1;
    function rootNode() {
        return {
            id: ROOT_ID,
            label: 'Root',
            names: [spatialId],
            children: [],
            localTransform: translationMatrix([0, 0, 0]),
        };
    }
    function loadSeed() {
        const seed = seedBuilder() || {};
        nodes = new Map();
        const root = normalizeNode(seed.root || rootNode(), ROOT_ID);
        root.id = ROOT_ID;
        root.children = [];
        nodes.set(ROOT_ID, root);
        nextId = ROOT_ID + 1;
        const children = Array.isArray(seed.nodes) ? seed.nodes : [];
        for (const raw of children) {
            const id = nextId++;
            const node = normalizeNode(raw, id);
            node.id = id;
            node.parent = ROOT_ID;
            node.children = Array.isArray(node.children) ? node.children : [];
            nodes.set(id, node);
            root.children.push(id);
        }
    }
    function normalizeNode(raw, fallbackId) {
        const r = raw && typeof raw === 'object' ? raw : {};
        const node = { id: Number.isInteger(r.id) ? r.id : fallbackId };
        if (r.label != null)
            node.label = String(r.label);
        if (Array.isArray(r.names))
            node.names = r.names.map(n => String(n));
        if (Number.isInteger(r.parent))
            node.parent = r.parent;
        const c = classifyChildren(r.children);
        if (c.embedded.length || c.invalid.length)
            console.warn('[spatial-graph] CORRUPT trusted node ' + node.id + ' (' + spatialId + '): '
                + (c.embedded.length + c.invalid.length) + ' of ' + c.count + ' children are not integer '
                + 'id-refs and cannot be stored in the flat graph. This is a store/seed defect, not a '
                + 'client body — client bodies are refused upstream.');
        node.children = c.refs;
        node.localTransform = Array.isArray(r.localTransform) && r.localTransform.length
            ? r.localTransform.map(n => Number(n) || 0)
            : translationMatrix([0, 0, 0]);
        if (r.spatialAssetURI != null)
            node.spatialAssetURI = String(r.spatialAssetURI);
        if (r.appearanceURI != null)
            node.appearanceURI = String(r.appearanceURI);
        if (r.webofworlds_extension && typeof r.webofworlds_extension === 'object')
            node.webofworlds_extension = clone(r.webofworlds_extension);
        return node;
    }
    function persistSave() {
        if (!persist)
            return;
        try {
            if (!fs.existsSync(persistDir))
                fs.mkdirSync(persistDir, { recursive: true });
            const doc = {
                osl_spatial_store: true,
                spatial_id: spatialId,
                accepted_ids: acceptedIds.slice(),
                saved_at: new Date().toISOString(),
                root_id: ROOT_ID,
                next_id: nextId,
                nodes: snapshotNodes(),
            };
            const tmp = persistFile + '.tmp';
            fs.writeFileSync(tmp, JSON.stringify(doc, null, 2) + '\n', 'utf8');
            fs.renameSync(tmp, persistFile);
        }
        catch (e) {
            console.warn('[spatial-graph] persist save failed (' + spatialId + '): ' + e.message);
        }
    }
    function persistLoad() {
        if (!persist)
            return false;
        try {
            if (!fs.existsSync(persistFile))
                return false;
            const doc = JSON.parse(fs.readFileSync(persistFile, 'utf8'));
            if (!doc || !Array.isArray(doc.nodes))
                return false;
            nodes = new Map();
            for (const raw of doc.nodes) {
                const node = normalizeNode(raw, raw && raw.id);
                nodes.set(node.id, node);
            }
            if (!nodes.has(ROOT_ID)) {
                loadSeed();
                return true;
            }
            nextId = Number.isInteger(doc.next_id) ? doc.next_id : computeNextId();
            return true;
        }
        catch (e) {
            console.warn('[spatial-graph] persist load failed (' + spatialId + '): ' + e.message);
            return false;
        }
    }
    function computeNextId() {
        let max = ROOT_ID;
        for (const id of nodes.keys())
            if (id > max)
                max = id;
        return max + 1;
    }
    function snapshotNodes() {
        return Array.from(nodes.values()).map(clone);
    }
    function matches(id) {
        return acceptedIds.indexOf(String(id == null ? '' : id)) !== -1;
    }
    function getRoot() {
        const root = nodes.get(ROOT_ID);
        return root ? clone(root) : null;
    }
    function getNode(nodeId) {
        const id = Number(nodeId);
        if (!Number.isInteger(id))
            return null;
        const node = nodes.get(id);
        return node ? clone(node) : null;
    }
    function listNodes() {
        return snapshotNodes();
    }
    function createChildren(parentId, incoming, opts) {
        opts = opts || {};
        const pid = Number(parentId);
        if (!Number.isInteger(pid))
            return { ok: false, status: 400, error: 'invalid_parent_id' };
        const parent = nodes.get(pid);
        if (!parent)
            return { ok: false, status: 404, error: 'parent_not_found' };
        if (!Array.isArray(incoming) || !incoming.length)
            return { ok: false, status: 400, error: 'expected_non_empty_node_array' };
        const refusal = inspectIncomingForest(incoming, {
            flattenEmbedded: !!opts.flattenEmbedded,
            allowIdRefs: false,
            basePath: '$',
        });
        if (refusal)
            return refusal;
        const created = [];
        let flattened = 0;
        let maxDepth = 0;
        (function attach(rawNodes, attachTo, depth) {
            if (depth > maxDepth)
                maxDepth = depth;
            for (const raw of rawNodes) {
                const id = nextId++;
                const embedded = classifyChildren(raw && raw.children).embedded;
                const rawContent = Object.assign({}, raw && typeof raw === 'object' ? raw : {});
                delete rawContent.children;
                const node = normalizeNode(rawContent, id);
                node.id = id;
                node.parent = attachTo;
                node.children = [];
                nodes.set(id, node);
                const parentNode = nodes.get(attachTo);
                if (parentNode && Array.isArray(parentNode.children))
                    parentNode.children.push(id);
                created.push(id);
                if (embedded.length) {
                    flattened += embedded.length;
                    attach(embedded, id, depth + 1);
                }
            }
        })(incoming, pid, 1);
        persistSave();
        const value = created.map(id => clone(nodes.get(id)));
        return {
            ok: true, status: 200, value: value,
            flattened: flattened,
            depth: maxDepth,
            requested: incoming.length,
            stored: value.length,
        };
    }
    function updateNode(nodeId, incoming) {
        const id = Number(nodeId);
        if (!Number.isInteger(id))
            return { ok: false, status: 400, error: 'invalid_node_id' };
        const existing = nodes.get(id);
        if (!existing)
            return { ok: false, status: 404, error: 'node_not_found' };
        const r = incoming && typeof incoming === 'object' ? incoming : {};
        const c = classifyChildren(r.children);
        if (c.present) {
            const current = Array.isArray(existing.children) ? existing.children : [];
            const echo = c.embedded.length === 0 && c.invalid.length === 0
                && c.refs.length === current.length
                && c.refs.every((v, i) => v === current[i]);
            if (!echo) {
                if (c.embedded.length)
                    return {
                        ok: false, status: 422, error: 'embedded_children_not_supported',
                        detail: {
                            message: 'This PUT body carries the CANONICAL WoW `Node` shape (children = '
                                + 'embedded Node objects). This server serves + accepts `OSLFlatNode` '
                                + '(children = integer node-id refs), and a PUT never restructures a node. '
                                + 'Your embedded children were REFUSED, NOT stored, and NOT silently dropped.',
                            served_schema: 'OSLFlatNode',
                            canonical_schema: 'Node',
                            divergence: 'Node.children: integer id-refs (OSL) vs embedded Node objects (canonical)',
                            current_children: current.slice(),
                            remedies: [
                                'POST /wow/spatial/{spatialID}/node/' + id + ' to CREATE children under this node '
                                    + '(add `X-OSL-WoW-Node-Form: canonical` there to have an embedded subtree '
                                    + 'flattened and stored).',
                                'DELETE /wow/spatial/{spatialID}/node/{childId} to remove one.',
                                'Or PUT with `children` omitted (or echoed unchanged) to edit content only.',
                            ],
                        },
                    };
                return {
                    ok: false, status: 422, error: 'child_restructure_not_supported',
                    detail: {
                        message: 'PUT updates a node\'s CONTENT; it never restructures the graph. The '
                            + '`children` you sent differ from the ones we store, so honouring this body '
                            + 'would mean changing structure — it was REFUSED rather than (as before) '
                            + 'SILENTLY IGNORED.',
                        current_children: current.slice(),
                        requested_children: Array.isArray(r.children) ? r.children.slice() : r.children,
                        remedies: [
                            'POST /wow/spatial/{spatialID}/node/' + id + ' to create children.',
                            'DELETE /wow/spatial/{spatialID}/node/{childId} to remove one.',
                            'Omit `children` (or echo it unchanged) to edit content only.',
                        ],
                    },
                };
            }
        }
        if ('label' in r)
            existing.label = r.label == null ? undefined : String(r.label);
        if ('names' in r)
            existing.names = Array.isArray(r.names) ? r.names.map(n => String(n)) : existing.names;
        if ('localTransform' in r && Array.isArray(r.localTransform))
            existing.localTransform = r.localTransform.map(n => Number(n) || 0);
        if ('spatialAssetURI' in r)
            existing.spatialAssetURI = r.spatialAssetURI == null ? undefined : String(r.spatialAssetURI);
        if ('appearanceURI' in r)
            existing.appearanceURI = r.appearanceURI == null ? undefined : String(r.appearanceURI);
        for (const k of Object.keys(existing))
            if (existing[k] === undefined)
                delete existing[k];
        persistSave();
        return { ok: true, status: 200, value: clone(existing) };
    }
    function deleteNode(nodeId) {
        const id = Number(nodeId);
        if (!Number.isInteger(id))
            return { ok: false, status: 400, error: 'invalid_node_id' };
        if (id === ROOT_ID)
            return { ok: false, status: 400, error: 'cannot_delete_root' };
        const node = nodes.get(id);
        if (!node)
            return { ok: false, status: 404, error: 'node_not_found' };
        const deleted = [];
        const stack = [id];
        while (stack.length) {
            const cur = stack.pop();
            const n = nodes.get(cur);
            if (!n)
                continue;
            deleted.push(cur);
            for (const c of (n.children || []))
                stack.push(c);
            nodes.delete(cur);
        }
        if (Number.isInteger(node.parent)) {
            const parent = nodes.get(node.parent);
            if (parent && Array.isArray(parent.children))
                parent.children = parent.children.filter(c => c !== id);
        }
        persistSave();
        return { ok: true, status: 200, value: { deleted: deleted, count: deleted.length } };
    }
    function resetToSeed() {
        loadSeed();
        persistSave();
        return getRoot();
    }
    loadSeed();
    if (persist) {
        const loaded = persistLoad();
        if (!loaded)
            persistSave();
    }
    return {
        spatialId,
        acceptedIds: acceptedIds.slice(),
        persist,
        persistFile,
        ROOT_ID,
        matches,
        getRoot,
        getNode,
        listNodes,
        createChildren,
        updateNode,
        deleteNode,
        resetToSeed,
    };
}
module.exports = {
    createSpatialGraphStore,
    translationMatrix,
    ROOT_ID,
    classifyChildren,
    inspectIncomingForest,
    CANONICAL_CHILD_FORM,
};
