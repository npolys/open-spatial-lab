const IDENTITY_4X4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const MAX_NODES = 20000;
export const FABRIC_UP_AXES = Object.freeze(["z", "y"]);
export const FABRIC_PLACEMENTS = Object.freeze(["in-room", "backdrop"]);
export const FABRIC_SUBTREE_MEMBERS = Object.freeze([
    "fabricURI", "mediaType", "unitsPerMeter", "upAxis", "placement",
    "parallax", "requireVerified", "maxDepth", "epochTicks",
]);
export const FABRIC_SUBTREE_REFUSAL = Object.freeze({
    MISSING_UNITS_PER_METER: "MISSING_UNITS_PER_METER",
    BAD_UNITS_PER_METER: "BAD_UNITS_PER_METER",
    UNKNOWN_UP_AXIS: "UNKNOWN_UP_AXIS",
    UNKNOWN_PLACEMENT: "UNKNOWN_PLACEMENT",
    BAD_SUBTREE: "BAD_SUBTREE",
    MISSING_FABRIC_URI: "MISSING_FABRIC_URI",
    BAD_PARALLAX: "BAD_PARALLAX",
    BAD_MAX_DEPTH: "BAD_MAX_DEPTH",
    BAD_EPOCH_TICKS: "BAD_EPOCH_TICKS",
    BAD_REQUIRE_VERIFIED: "BAD_REQUIRE_VERIFIED",
    UNKNOWN_MEMBER: "UNKNOWN_MEMBER",
});
const SUBTREE_CONTRACT = "SpatialFabricSubtree";
const refuseSubtree = (reason, node_id, detail) => ({
    ok: false, contract: SUBTREE_CONTRACT, reason, node_id: node_id ?? null, detail,
});
export function validateFabricSubtreeContract(subtree, opts = {}) {
    const node_id = opts.node_id ?? null;
    if (!subtree || typeof subtree !== "object" || Array.isArray(subtree))
        return refuseSubtree(FABRIC_SUBTREE_REFUSAL.BAD_SUBTREE, node_id, `spatial_fabric_subtree must be an object; got ${Array.isArray(subtree) ? "array" : typeof subtree}`);
    const unknown = Object.keys(subtree).filter((k) => !FABRIC_SUBTREE_MEMBERS.includes(k));
    if (unknown.length)
        return refuseSubtree(FABRIC_SUBTREE_REFUSAL.UNKNOWN_MEMBER, node_id, `unknown member(s) [${unknown.join(", ")}] — SpatialFabricSubtree is strict `
            + `(additionalProperties:false). A new dial is added to the SCHEMA first, never ridden in silently.`);
    const { fabricURI, mediaType, unitsPerMeter, upAxis, placement, parallax, requireVerified, maxDepth, epochTicks } = subtree;
    if (typeof fabricURI !== "string" || !fabricURI)
        return refuseSubtree(FABRIC_SUBTREE_REFUSAL.MISSING_FABRIC_URI, node_id, "fabricURI is REQUIRED — it is the signed .msf document to transclude.");
    if (unitsPerMeter === undefined || unitsPerMeter === null)
        return refuseSubtree(FABRIC_SUBTREE_REFUSAL.MISSING_UNITS_PER_METER, node_id, "unitsPerMeter is REQUIRED and has NO DEFAULT. The compositor's `auto` rule would compose a "
            + "celestial fabric in AU, which inside a 1:1-metre WoW room silently means 1 AU = 1 METRE. "
            + "Declare the scale (OSL-FAB-XFORM-1 §3).");
    if (typeof unitsPerMeter !== "number" || !Number.isFinite(unitsPerMeter) || unitsPerMeter <= 0)
        return refuseSubtree(FABRIC_SUBTREE_REFUSAL.BAD_UNITS_PER_METER, node_id, `unitsPerMeter must be a finite POSITIVE number (world units per fabric metre); got ${JSON.stringify(unitsPerMeter)}.`);
    if (!FABRIC_UP_AXES.includes(upAxis))
        return refuseSubtree(FABRIC_SUBTREE_REFUSAL.UNKNOWN_UP_AXIS, node_id, `upAxis must be DECLARED as one of [${FABRIC_UP_AXES.join(", ")}]; got ${JSON.stringify(upAxis)}. `
            + "It is never sniffed and never defaults to \"z\" — the corpus is Z-up and WoW is Y-up, and a silent "
            + "guess lays the solar system on its side (OSL-FAB-XFORM-1 §2).");
    if (!FABRIC_PLACEMENTS.includes(placement))
        return refuseSubtree(FABRIC_SUBTREE_REFUSAL.UNKNOWN_PLACEMENT, node_id, `placement must be DECLARED as one of [${FABRIC_PLACEMENTS.join(", ")}]; got ${JSON.stringify(placement)}. `
            + "It SELECTS THE BACKEND and the two backends make DIFFERENT honesty claims (in-room => three, "
            + "depth-correct, NO parity claim; backdrop => filament, measured parity, CANNOT be occluded), so "
            + "defaulting would pick a claim on the author's behalf.");
    if (mediaType !== undefined && typeof mediaType !== "string")
        return refuseSubtree(FABRIC_SUBTREE_REFUSAL.UNKNOWN_MEMBER, node_id, "mediaType must be a string when present.");
    if (parallax !== undefined && (typeof parallax !== "number" || !Number.isFinite(parallax) || parallax < 0 || parallax > 1))
        return refuseSubtree(FABRIC_SUBTREE_REFUSAL.BAD_PARALLAX, node_id, `parallax must be a number in 0..1 (backdrop only); got ${JSON.stringify(parallax)}.`);
    if (requireVerified !== undefined && typeof requireVerified !== "boolean")
        return refuseSubtree(FABRIC_SUBTREE_REFUSAL.BAD_REQUIRE_VERIFIED, node_id, `requireVerified must be a boolean; got ${JSON.stringify(requireVerified)}.`);
    if (maxDepth !== undefined && (!Number.isInteger(maxDepth) || maxDepth < 0))
        return refuseSubtree(FABRIC_SUBTREE_REFUSAL.BAD_MAX_DEPTH, node_id, `maxDepth must be a non-negative integer; got ${JSON.stringify(maxDepth)}.`);
    if (epochTicks !== undefined && (typeof epochTicks !== "number" || !Number.isFinite(epochTicks)))
        return refuseSubtree(FABRIC_SUBTREE_REFUSAL.BAD_EPOCH_TICKS, node_id, `epochTicks must be a finite number; got ${JSON.stringify(epochTicks)}.`);
    return {
        ok: true,
        contract: SUBTREE_CONTRACT,
        node_id,
        effective: {
            fabricURI,
            mediaType: mediaType === undefined ? null : mediaType,
            unitsPerMeter,
            upAxis,
            placement,
            parallax: parallax === undefined ? 0 : parallax,
            requireVerified: requireVerified === undefined ? true : requireVerified,
            maxDepth: maxDepth === undefined ? null : maxDepth,
            epochTicks: epochTicks === undefined ? null : epochTicks,
        },
    };
}
function looksLikeMsfUri(uri) {
    return typeof uri === "string" && /\.msf(\?|#|$)/i.test(uri);
}
const COL_ASSET_EDGE = 0x3aa0ff;
const COL_ASSET_FILL = 0x2bd4ff;
const COL_GROUP = 0x9d7bff;
const COL_ROOT = 0xffd166;
function normalizeGraph(graph) {
    const spatialID = (graph && (graph.spatialID || graph.spatial_id)) || null;
    const nodes = new Map();
    const raw = graph && graph.nodes;
    if (Array.isArray(raw)) {
        for (const n of raw)
            if (n && n.id != null)
                nodes.set(Number(n.id), n);
    }
    else if (raw && typeof raw === "object") {
        for (const k of Object.keys(raw)) {
            const n = raw[k];
            const id = n && n.id != null ? Number(n.id) : Number(k);
            if (Number.isFinite(id))
                nodes.set(id, n);
        }
    }
    let rootId = graph && graph.root != null
        ? Number(graph.root)
        : graph && graph.rootId != null
            ? Number(graph.rootId)
            : null;
    if (rootId == null || !nodes.has(rootId)) {
        let inferred = null;
        for (const [id, n] of nodes) {
            if (!n || n.parent == null) {
                inferred = id;
                break;
            }
        }
        if (inferred == null) {
            const ids = [...nodes.keys()];
            inferred = ids.length ? Math.min(...ids) : null;
        }
        rootId = inferred;
    }
    return { spatialID, rootId, nodes };
}
export function buildWowScene(graph, THREE, opts = {}) {
    const width = opts.width || 1100;
    const height = opts.height || 660;
    const { spatialID, rootId, nodes } = normalizeGraph(graph);
    const scene = new THREE.Scene();
    const bgHex = typeof opts.background === "number" ? opts.background : 0x0b1020;
    scene.background = new THREE.Color(bgHex);
    const root = new THREE.Group();
    root.name = "wow-composition-root";
    scene.add(root);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(24, 24), new THREE.MeshStandardMaterial({ color: 0x161d31, roughness: 0.95, metalness: 0.05 }));
    floor.rotation.x = -Math.PI / 2;
    floor.name = "wow-floor";
    root.add(floor);
    const grid = new THREE.GridHelper(24, 24, 0x4f7fc4, 0x263250);
    if (grid.material) {
        grid.material.transparent = true;
        grid.material.opacity = 0.4;
    }
    root.add(grid);
    root.add(new THREE.AmbientLight(0xffffff, 0.6));
    const key = new THREE.DirectionalLight(0xffffff, 0.85);
    key.position.set(5, 9, 6);
    root.add(key);
    const rim = new THREE.DirectionalLight(0x88aaff, 0.4);
    rim.position.set(-6, 5, -7);
    root.add(rim);
    const counts = {
        graph_nodes: nodes.size,
        rendered_nodes: 0,
        asset_placeholders: 0,
        group_gizmos: 0,
        missing_children: 0,
        cycles_skipped: 0,
        meshes: 1,
        fabric_placeholders: 0,
        fabric_contract_refused: 0,
    };
    const placements = [];
    const nodeObjs = [];
    const assetNodes = [];
    const fabricNodes = [];
    const unspecifiedContractWarnings = [];
    function makeAssetPlaceholder(node, isRoot) {
        const group = new THREE.Group();
        group.name = `wow-asset-placeholder:${node.label || node.id}`;
        const edge = isRoot ? COL_ROOT : COL_ASSET_EDGE;
        const wire = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.9, 0.9, 0.9)), new THREE.LineBasicMaterial({ color: edge, transparent: true, opacity: 0.9 }));
        wire.position.y = 0.45;
        group.add(wire);
        const core = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.MeshStandardMaterial({
            color: COL_ASSET_FILL,
            emissive: COL_ASSET_FILL,
            emissiveIntensity: 0.25,
            transparent: true,
            opacity: 0.55,
            roughness: 0.5,
        }));
        core.position.y = 0.45;
        group.add(core);
        counts.meshes += 2;
        return group;
    }
    function makeGroupGizmo(node, isRoot) {
        const octa = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), new THREE.MeshStandardMaterial({
            color: isRoot ? COL_ROOT : COL_GROUP,
            emissive: isRoot ? COL_ROOT : COL_GROUP,
            emissiveIntensity: 0.4,
            roughness: 0.4,
        }));
        octa.name = `wow-group-gizmo:${node.label || node.id}`;
        counts.meshes += 1;
        return octa;
    }
    let visited = 0;
    function walk(nodeId, parentObj, seen) {
        if (visited >= MAX_NODES)
            return;
        const node = nodes.get(Number(nodeId));
        if (!node) {
            counts.missing_children += 1;
            return;
        }
        if (seen.has(Number(nodeId))) {
            counts.cycles_skipped += 1;
            return;
        }
        seen.add(Number(nodeId));
        visited += 1;
        const isRoot = Number(nodeId) === Number(rootId);
        const obj = new THREE.Group();
        obj.name = `wow:${node.label != null ? node.label : node.id}`;
        const lt = Array.isArray(node.localTransform) && node.localTransform.length === 16
            ? node.localTransform.map(Number)
            : IDENTITY_4X4;
        obj.matrixAutoUpdate = false;
        obj.matrix.fromArray(lt);
        parentObj.add(obj);
        counts.rendered_nodes += 1;
        const label = node.label != null ? String(node.label) : String(node.id);
        const hasAsset = typeof node.spatialAssetURI === "string" && node.spatialAssetURI.length > 0;
        const wowExt = node.webofworlds_extension;
        const subtree = wowExt && typeof wowExt === "object" ? wowExt.spatial_fabric_subtree : undefined;
        const isFabric = subtree !== undefined && subtree !== null;
        if (isFabric) {
            const contract = validateFabricSubtreeContract(subtree, { node_id: Number(nodeId) });
            const placeholder = makeAssetPlaceholder(node, isRoot);
            placeholder.name = `wow-fabric-placeholder:${label}`;
            obj.add(placeholder);
            counts.fabric_placeholders += 1;
            if (!contract.ok) {
                counts.fabric_contract_refused += 1;
                markPlaceholderUnavailable(placeholder, THREE, "wow-fabric-refused");
                placeholder.userData.fabricRefusal = contract;
            }
            fabricNodes.push({
                node_id: Number(nodeId),
                label,
                uri: contract.ok ? contract.effective.fabricURI
                    : (subtree && typeof subtree === "object" && typeof subtree.fabricURI === "string"
                        ? subtree.fabricURI : (hasAsset ? node.spatialAssetURI : null)),
                spatial_asset_uri: hasAsset ? node.spatialAssetURI : null,
                subtree,
                contract,
                group: obj,
                placeholder,
                is_root: isRoot,
                world_matrix: null,
            });
        }
        else if (hasAsset) {
            const placeholder = makeAssetPlaceholder(node, isRoot);
            obj.add(placeholder);
            counts.asset_placeholders += 1;
            assetNodes.push({
                id: Number(nodeId),
                label,
                uri: node.spatialAssetURI,
                group: obj,
                placeholder,
                is_root: isRoot,
            });
            if (looksLikeMsfUri(node.spatialAssetURI)) {
                unspecifiedContractWarnings.push({
                    node_id: Number(nodeId),
                    label,
                    uri: node.spatialAssetURI,
                    warning: "UNSPECIFIED SUBTREE CONTRACT — this node addresses an `.msf` fabric but declares no "
                        + "`webofworlds_extension.spatial_fabric_subtree`. It is NOT treated as a fabric subtree (the suffix is "
                        + "never the discriminator). Its scale (unitsPerMeter), basis (upAxis) and backend (placement) are "
                        + "undeclared and will NOT be guessed. It is handled as a glTF asset and will degrade to a labeled "
                        + "unavailable placeholder. Declare a SpatialFabricSubtree to transclude it.",
                });
            }
        }
        else {
            obj.add(makeGroupGizmo(node, isRoot));
            counts.group_gizmos += 1;
        }
        nodeObjs.push({
            id: Number(nodeId),
            label,
            has_asset: hasAsset,
            asset_uri: hasAsset ? node.spatialAssetURI : null,
            is_fabric_subtree: isFabric,
            local_translation: [lt[12], lt[13], lt[14]],
            obj,
        });
        const children = Array.isArray(node.children) ? node.children : [];
        for (const childId of children)
            walk(childId, obj, seen);
    }
    if (rootId != null)
        walk(rootId, root, new Set());
    root.updateMatrixWorld(true);
    const v = new THREE.Vector3();
    const bbMin = [Infinity, Infinity, Infinity];
    const bbMax = [-Infinity, -Infinity, -Infinity];
    for (const rec of nodeObjs) {
        rec.obj.getWorldPosition(v);
        const wp = [round4(v.x), round4(v.y), round4(v.z)];
        placements.push({
            id: rec.id,
            label: rec.label,
            has_asset: rec.has_asset,
            asset_uri: rec.asset_uri,
            is_fabric_subtree: rec.is_fabric_subtree,
            local_translation: rec.local_translation.map(round4),
            world_position: wp,
        });
        for (let i = 0; i < 3; i++) {
            bbMin[i] = Math.min(bbMin[i], wp[i]);
            bbMax[i] = Math.max(bbMax[i], wp[i]);
        }
    }
    for (const rec of fabricNodes)
        rec.world_matrix = rec.group.matrixWorld.toArray();
    const WALK_PAD_M = 2.5;
    let walkable = { minX: -12, maxX: 12, minZ: -12, maxZ: 12 };
    let spawn = [0, 0, 0, 0];
    if (placements.length && Number.isFinite(bbMin[0])) {
        walkable = {
            minX: Math.min(bbMin[0] - WALK_PAD_M, -4),
            maxX: Math.max(bbMax[0] + WALK_PAD_M, 4),
            minZ: Math.min(bbMin[2] - WALK_PAD_M - 2, -4),
            maxZ: Math.max(bbMax[2] + WALK_PAD_M, 4),
        };
        const cxContent = (bbMin[0] + bbMax[0]) / 2;
        spawn = [round4(cxContent), 0, round4(walkable.minZ + 1.5), 0];
    }
    const wkSpanX = Math.max(2, walkable.maxX - walkable.minX);
    const wkSpanZ = Math.max(2, walkable.maxZ - walkable.minZ);
    const wkCx = (walkable.minX + walkable.maxX) / 2;
    const wkCz = (walkable.minZ + walkable.maxZ) / 2;
    floor.geometry.dispose();
    floor.geometry = new THREE.PlaneGeometry(wkSpanX, wkSpanZ);
    floor.position.set(wkCx, 0, wkCz);
    root.remove(grid);
    const wkGridSpan = Math.max(wkSpanX, wkSpanZ);
    const wkGrid = new THREE.GridHelper(wkGridSpan, Math.max(4, Math.round(wkGridSpan)), 0x4f7fc4, 0x263250);
    wkGrid.position.set(wkCx, 0, wkCz);
    if (wkGrid.material) {
        wkGrid.material.transparent = true;
        wkGrid.material.opacity = 0.4;
    }
    root.add(wkGrid);
    root.updateMatrixWorld(true);
    let cx = 0, cy = 0, cz = 0, spread = 4;
    if (placements.length) {
        cx = (bbMin[0] + bbMax[0]) / 2;
        cy = (bbMin[1] + bbMax[1]) / 2;
        cz = (bbMin[2] + bbMax[2]) / 2;
        const dx = bbMax[0] - bbMin[0];
        const dy = bbMax[1] - bbMin[1];
        const dz = bbMax[2] - bbMin[2];
        spread = Math.max(4, Math.hypot(dx, dy, dz) + 3);
    }
    const dist = spread * 1.6 + 3;
    const camera = new THREE.PerspectiveCamera(50, width / Math.max(1, height), 0.1, 2000);
    camera.position.set(cx + dist * 0.85, cy + spread * 0.9 + 3.0, cz + dist);
    camera.lookAt(cx, Math.max(0.4, cy), cz);
    camera.updateMatrixWorld(true);
    return {
        scene,
        camera,
        root,
        asset_nodes: assetNodes,
        fabric_nodes: fabricNodes,
        render_summary: {
            shape: "wow-composition-graph",
            spatial_id: spatialID,
            source: opts.source || "unknown",
            graph_node_count: nodes.size,
            root_id: rootId,
            rendered: counts,
            placements,
            asset_ingest: {
                asset_nodes: assetNodes.length,
                loader: "async mountWowSceneAssets — reuses the avatar GLTFLoader stack (no second loader)",
                state_at_build: "placeholders shown; the real glTF is not yet mounted (loads asynchronously)",
                fallback: "an unavailable/invalid asset KEEPS a labeled placeholder (recolored to a warn tint) — never silent",
            },
            fabric_subtrees: {
                fabric_nodes: fabricNodes.length,
                contract_ok: fabricNodes.filter((f) => f.contract && f.contract.ok).length,
                contract_refused: counts.fabric_contract_refused,
                discriminator: "a node is a FABRIC node iff it carries the LABELED `webofworlds_extension.spatial_fabric_subtree` "
                    + "contract. The `.msf` SUFFIX IS NEVER SNIFFED — the suffix hides the scale/basis/trust contract that a "
                    + "SUBTREE needs and a LEAF does not.",
                relation: "TRANSCLUSION, not traversal. The fabric is DRAWN HERE in this node's own frame (`<img src>`); it is NOT "
                    + "a door. Traversal is Portal.destination (`<a href>`), and the two are deliberately NOT merged.",
                excluded_from_asset_nodes: "fabric nodes are EXCLUDED from `asset_nodes` — otherwise mountWowSceneAssets would hand the .msf to "
                    + "loadGltf and a signed fabric would read as a broken glTF.",
                state_at_build: "DISCOVERY ONLY — nothing fetched, verified, executed, composed or drawn here. Each fabric node shows a "
                    + "labeled placeholder and carries its COMPOSED world_matrix (column-major, metres) for the async mount "
                    + "pass (runtime -> OSL-FAB-XFORM-1 -> the placement/backend seam).",
                mount_parent_note: "the mount pass must parent the placed fabric to a node whose WORLD matrix is the IDENTITY (the scene root). "
                    + "OSL-FAB-XFORM-1 bakes the placement into WORLD coordinates, so the three backend REFUSES a non-identity "
                    + "parent rather than double-transforming the fabric.",
                fail_closed: "a subtree whose DECLARED contract is broken (missing unitsPerMeter, undeclared upAxis, undeclared "
                    + "placement, unknown member) is REFUSED at build time, before any fetch: it keeps a warn-tinted "
                    + "`wow-fabric-refused:<label>` placeholder and carries a structured refusal. An unverified, unfetchable or "
                    + "tampered fabric is refused the same way at mount, at EVERY nesting level. Never silent, never drawn.",
                verification_note: "`requireVerified` defaults to TRUE when absent (fail-closed). VERIFIED means a valid signature chaining to "
                    + "a SHIPPED TEST ANCHOR — it is NOT an OS-trust / public-PKI claim.",
                unspecified_contract_warnings: unspecifiedContractWarnings,
                standards_note: "SpatialFabricSubtree is a LABELED OSL EXTENSION (x-osl-extension:true, declared divergence D8). A .msf URL "
                    + "in `spatialAssetURI` is spec-LEGAL (the canonical Node types it as a bare string), but the SUBTREE "
                    + "CONTRACT is ours, not the standard's. `standards_conformance` stays FALSE.",
            },
            camera_seed: {
                centroid: [round4(cx), round4(cy), round4(cz)],
                framed_distance: round4(dist),
                note: "generic elevated 3/4 framing of the graph's node cloud so the whole scene is visible/lit for M2 first-light; NOT the consumer first-person pose (that is runtime).",
            },
            walkable_extent: {
                min_x: round4(walkable.minX),
                max_x: round4(walkable.maxX),
                min_z: round4(walkable.minZ),
                max_z: round4(walkable.maxZ),
                span_x: round4(wkSpanX),
                span_z: round4(wkSpanZ),
                spawn,
                pad_m: WALK_PAD_M,
                measured_from: "graph node world-position bounding box + pad (MEASURED per world; NOT the hardcoded ±5.4 procedural clamp).",
            },
            approximation: "WoW composition-graph render: one object per graph node, placed by its 4x4 localTransform (column-major, 1:1 meters) COMPOSED through the parent hierarchy. Node counts + positions are taken VERBATIM from the graph (not procedurally synthesized). Nodes bearing a glTF `spatialAssetURI` render a LABELED wireframe placeholder synchronously, then the REAL glTF is loaded ASYNCHRONOUSLY (runtime, mountWowSceneAssets) and mounted under the node transform — placeholder shown until loaded; an honestly-labeled placeholder is KEPT as the fallback if the asset is unavailable/invalid. Transform-only nodes are small origin gizmos.",
            boundary_note: "M2 first-light standalone render. No native TeleportXR teleport, no first-party TeleportXR rendering, no standards-conformance claim (runtime scope). Renders only what the graph contains. Referenced glTF assets are EXTERNAL URLs fetched from their own hosts (see THIRD_PARTY_NOTICES.md licensing).",
        },
    };
}
function round4(n) {
    return Number((Number(n) || 0).toFixed(4));
}
const COL_ASSET_UNAVAILABLE = 0xff6b3a;
export function resolveAssetUri(uri, baseUrl) {
    if (typeof uri !== "string" || !uri)
        return uri;
    if (/^(https?:|data:|blob:)/i.test(uri))
        return uri;
    try {
        return new URL(uri, baseUrl || undefined).href;
    }
    catch {
        return uri;
    }
}
export async function mountWowSceneAssets(assetNodes, THREE, opts = {}) {
    const nodes = Array.isArray(assetNodes) ? assetNodes : [];
    const loadGltf = typeof opts.loadGltf === "function" ? opts.loadGltf : null;
    const cloneScene = typeof opts.cloneScene === "function"
        ? opts.cloneScene
        : (scene) => {
            let hasSkinnedMesh = false;
            scene.traverse((node) => { if (node.isSkinnedMesh)
                hasSkinnedMesh = true; });
            if (hasSkinnedMesh)
                throw new Error("skinned scene requires an injected skeleton-aware clone");
            return scene.clone(true);
        };
    const baseUrl = opts.baseUrl;
    const cache = opts.cache instanceof Map ? opts.cache : new Map();
    const onAsset = typeof opts.onAsset === "function" ? opts.onAsset : null;
    const shouldMount = typeof opts.shouldMount === "function" ? opts.shouldMount : null;
    const beforeMount = typeof opts.beforeMount === "function" ? opts.beforeMount : null;
    let mountQueue = Promise.resolve();
    const summary = {
        requested: nodes.length,
        loaded: 0,
        failed: 0,
        cancelled: 0,
        network_loads: 0,
        cache_hits: 0,
        unique_uris: new Set(nodes.map((r) => resolveAssetUri(r.uri, baseUrl))).size,
        loader_present: !!loadGltf,
        per_asset: [],
        note: loadGltf
            ? "real glTF `spatialAssetURI` ingest: async load + per-URI cache; labeled placeholder KEPT on failure (never silent). Assets are external URLs fetched from their own hosts."
            : "no glTF loader injected — placeholders left in place (honest no-op).",
    };
    await Promise.all(nodes.map(async (rec) => {
        const resolved = resolveAssetUri(rec.uri, baseUrl);
        const entry = {
            id: rec.id,
            label: rec.label,
            uri: rec.uri,
            resolved_uri: resolved,
            status: "pending",
            mesh_count: 0,
            visible_bounds_world: null,
            authored_world_position: null,
            bounds_center_distance_m: null,
            clone_strategy: typeof opts.cloneScene === "function" ? "injected-skeleton-aware" : "Object3D.clone(true)",
            from_cache: false,
            error: null,
        };
        let mountedModel = null;
        try {
            if (!loadGltf)
                throw new Error("no glTF loader injected");
            let fromCache = true;
            let templatePromise = cache.get(resolved);
            if (!templatePromise) {
                fromCache = false;
                templatePromise = Promise.resolve().then(() => loadGltf(resolved));
                cache.set(resolved, templatePromise);
            }
            const template = await templatePromise;
            if (!template)
                throw new Error("loader returned no scene");
            if (shouldMount && !shouldMount(rec)) {
                entry.status = "cancelled";
                summary.cancelled += 1;
                summary.per_asset.push(entry);
                return entry;
            }
            if (beforeMount) {
                const turn = mountQueue.then(() => beforeMount(rec));
                mountQueue = turn.catch(() => { });
                await turn;
                if (shouldMount && !shouldMount(rec)) {
                    entry.status = "cancelled";
                    summary.cancelled += 1;
                    summary.per_asset.push(entry);
                    return entry;
                }
            }
            if (fromCache)
                summary.cache_hits += 1;
            else
                summary.network_loads += 1;
            entry.from_cache = fromCache;
            const model = cloneScene(template);
            mountedModel = model;
            model.name = `wow-asset:${rec.label}`;
            entry.mesh_count = countObject3DMeshes(model);
            rec.group.add(model);
            rec.group.updateWorldMatrix(true, true);
            const authored = rec.group.getWorldPosition(new THREE.Vector3());
            const visibleBounds = measureVisibleWorldBounds(model, THREE);
            if (!visibleBounds)
                throw new Error("loaded scene has no non-empty visible world-space mesh bounds");
            entry.visible_bounds_world = visibleBounds;
            entry.authored_world_position = [round4(authored.x), round4(authored.y), round4(authored.z)];
            entry.bounds_center_distance_m = round4(Math.hypot(visibleBounds.center[0] - authored.x, visibleBounds.center[1] - authored.y, visibleBounds.center[2] - authored.z));
            if (rec.placeholder && rec.placeholder.parent) {
                rec.placeholder.parent.remove(rec.placeholder);
                disposeObject3D(rec.placeholder);
            }
            rec.loaded = true;
            entry.status = "loaded";
            summary.loaded += 1;
        }
        catch (err) {
            entry.status = "failed";
            entry.error = (err && err.message) || String(err);
            markPlaceholderUnavailable(rec.placeholder, THREE);
            rec.loaded = false;
            rec.asset_unavailable = true;
            summary.failed += 1;
        }
        summary.per_asset.push(entry);
        if (onAsset) {
            try {
                onAsset(entry, mountedModel, rec);
            }
            catch { }
        }
        return entry;
    }));
    summary.per_asset.sort((a, b) => a.id - b.id);
    return summary;
}
function countObject3DMeshes(root) {
    let n = 0;
    if (root && typeof root.traverse === "function") {
        root.traverse((o) => { if (o && (o.isMesh || o.isSkinnedMesh))
            n += 1; });
    }
    return n;
}
function measureVisibleWorldBounds(root, THREE) {
    if (!root || typeof root.traverse !== "function")
        return null;
    root.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3().makeEmpty();
    let visibleMeshes = 0;
    let skinnedMeshes = 0;
    root.traverse((node) => {
        if (!node || (!node.isMesh && !node.isSkinnedMesh) || !node.geometry)
            return;
        for (let cursor = node; cursor; cursor = cursor.parent) {
            if (cursor.visible === false)
                return;
            if (cursor === root)
                break;
        }
        node.updateWorldMatrix(true, false);
        if (!node.geometry.boundingBox)
            node.geometry.computeBoundingBox();
        if (!node.geometry.boundingBox)
            return;
        if (node.isSkinnedMesh)
            skinnedMeshes += 1;
        const meshBounds = node.geometry.boundingBox.clone().applyMatrix4(node.matrixWorld);
        if (meshBounds.isEmpty())
            return;
        bounds.union(meshBounds);
        visibleMeshes += 1;
    });
    if (!visibleMeshes || bounds.isEmpty())
        return null;
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    if (!(size.x > 0 || size.y > 0 || size.z > 0))
        return null;
    return {
        min: [round4(bounds.min.x), round4(bounds.min.y), round4(bounds.min.z)],
        max: [round4(bounds.max.x), round4(bounds.max.y), round4(bounds.max.z)],
        center: [round4(center.x), round4(center.y), round4(center.z)],
        size: [round4(size.x), round4(size.y), round4(size.z)],
        visible_meshes: visibleMeshes,
        skinned_meshes: skinnedMeshes,
    };
}
function disposeObject3D(root) {
    if (!root || typeof root.traverse !== "function")
        return;
    root.traverse((o) => {
        if (o.geometry && typeof o.geometry.dispose === "function")
            o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        for (const m of mats)
            if (m && typeof m.dispose === "function")
                m.dispose();
    });
}
function markPlaceholderUnavailable(placeholder, THREE, namePrefix = "wow-asset-unavailable") {
    if (!placeholder || typeof placeholder.traverse !== "function")
        return;
    placeholder.userData = placeholder.userData || {};
    placeholder.userData.assetUnavailable = true;
    const suffix = String(placeholder.name || "").split(":").slice(1).join(":");
    placeholder.name = `${namePrefix}:${suffix}`;
    placeholder.traverse((o) => {
        const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        for (const m of mats) {
            if (!m)
                continue;
            if (m.color && typeof m.color.setHex === "function")
                m.color.setHex(COL_ASSET_UNAVAILABLE);
            if (m.emissive && typeof m.emissive.setHex === "function")
                m.emissive.setHex(COL_ASSET_UNAVAILABLE);
        }
    });
}
export default {
    buildWowScene,
    normalizeGraph,
    mountWowSceneAssets,
    resolveAssetUri,
    validateFabricSubtreeContract,
    FABRIC_SUBTREE_REFUSAL,
    FABRIC_UP_AXES,
    FABRIC_PLACEMENTS,
    FABRIC_SUBTREE_MEMBERS,
};
