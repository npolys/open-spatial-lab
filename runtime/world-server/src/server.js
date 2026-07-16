'use strict';
const http = require('http');
const crypto = require('crypto');
const { createRuntime } = require('./runtime-state');
const { makeConfig } = require('./config');
const wowAsset = require('./wow-asset');
const wowMediaTypes = require('./wow-media-types');
function createServer(role, extraOpts) {
    const cfg = makeConfig(role, extraOpts);
    const runtime = createRuntime(cfg);
    const bindPort = Number(cfg.bind_port) || cfg.http_port;
    function sendJson(res, code, obj) {
        const body = JSON.stringify(obj, null, 2);
        res.writeHead(code, {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
            'X-MSF-validation-Boundary': 'application-level-handoff; native-teleport=false; conformance=false',
        });
        res.end(body);
    }
    const WOW_VALIDATE = /^(1|true|on|yes)$/i.test(String(process.env.OSL_WOW_VALIDATE || ''));
    let wowValidator = null;
    function wowValidate(res, kind, obj) {
        if (!WOW_VALIDATE)
            return obj;
        try {
            if (!wowValidator)
                wowValidator = require('../../../wow-spec/validate').getValidator();
            const r = wowValidator.validateResponse(kind, obj);
            try {
                res.setHeader('X-OSL-WoW-Validation', (r.valid ? 'pass' : 'fail') + ':' + r.schema);
            }
            catch (e) { }
            if (!r.valid)
                console.warn('[wow-validate] ' + r.schema + ' response invalid: ' + r.errorsText);
        }
        catch (e) {
            try {
                res.setHeader('X-OSL-WoW-Validation', 'error');
            }
            catch (e2) { }
            console.warn('[wow-validate] validator unavailable: ' + e.message);
        }
        return obj;
    }
    function wowGetValidator() {
        if (!wowValidator)
            wowValidator = require('../../../wow-spec/validate').getValidator();
        return wowValidator;
    }
    function wowValidateNodeResponse(res, obj, isArray) {
        if (!WOW_VALIDATE)
            return obj;
        try {
            const v = wowGetValidator();
            const r = isArray ? v.validateRequest('OSLFlatNode[]', obj) : v.validate('OSLFlatNode', obj);
            try {
                res.setHeader('X-OSL-WoW-Validation', (r.valid ? 'pass' : 'fail') + ':' + r.schema);
            }
            catch (e) { }
            if (!r.valid)
                console.warn('[wow-validate] ' + r.schema + ' response invalid: ' + r.errorsText);
        }
        catch (e) {
            try {
                res.setHeader('X-OSL-WoW-Validation', 'error');
            }
            catch (e2) { }
            console.warn('[wow-validate] validator unavailable: ' + e.message);
        }
        return obj;
    }
    function wowValidateNodeRequest(schemaName, body) {
        if (!WOW_VALIDATE)
            return null;
        try {
            return wowGetValidator().validateRequest(schemaName, body);
        }
        catch (e) {
            return { valid: false, schema: schemaName, errorsText: 'validator unavailable: ' + e.message };
        }
    }
    const PROOF_BOUNDARY_HDR = 'application-level-handoff; native-teleport=false; conformance=false';
    let assetRegistry = null;
    function getAssetRegistry() {
        if (!assetRegistry)
            assetRegistry = wowAsset.createAssetRegistry({
                getSceneObjects: () => (runtime.getSceneObjects().objects || []),
                geoPoseFor: assetGeoPose,
                proofBoundary: runtime.getWowProofBoundary,
            });
        return assetRegistry;
    }
    function assetGeoPose(asset) {
        if (asset && asset.kind === 'primitive' && asset.obj && Array.isArray(asset.obj.position))
            return runtime.wowGeoPoseFromLocal(asset.obj.position, 0, 0);
        return null;
    }
    function serveAsset(req, res, url, path, method) {
        if (method !== 'GET' && method !== 'HEAD') {
            sendJson(res, 405, { ok: false, error: 'method_not_allowed', method, path });
            return true;
        }
        const reg = getAssetRegistry();
        let rest = path.slice(wowAsset.ASSET_BASE_PREFIX.length);
        let wantDescriptor = false;
        const descSuffix = '/wow/asset';
        if (rest.endsWith(descSuffix)) {
            wantDescriptor = true;
            rest = rest.slice(0, -descSuffix.length);
        }
        if (rest.endsWith('/'))
            rest = rest.slice(0, -1);
        const assetId = decodeURIComponent(rest);
        const asset = reg.defineAsset(assetId);
        if (!asset) {
            sendJson(res, 404, { ok: false, error: 'asset_not_found', assetId });
            return true;
        }
        const denied = reg.authorize(asset, req.headers);
        if (denied) {
            res.writeHead(denied.status, { 'Content-Type': 'application/json',
                'X-MSF-validation-Boundary': PROOF_BOUNDARY_HDR });
            res.end(method === 'HEAD' ? undefined
                : JSON.stringify({ ok: false, error: denied.error, assetId, why: denied.why }, null, 2));
            return true;
        }
        if (wantDescriptor) {
            if (asset.elsewhere) {
                res.writeHead(302, { Location: asset.elsewhere, 'X-MSF-validation-Boundary': PROOF_BOUNDARY_HDR });
                res.end();
                return true;
            }
            const body = Buffer.from(JSON.stringify(reg.assetDescriptor(asset), null, 2) + '\n', 'utf8');
            const tag = reg.etagOf(body);
            if (reg.ifNoneMatchHits(req.headers['if-none-match'], tag)) {
                res.writeHead(304, { ETag: tag });
                res.end();
                return true;
            }
            res.writeHead(200, { 'Content-Type': 'application/json', ETag: tag,
                'Content-Length': String(body.length), 'X-MSF-validation-Boundary': PROOF_BOUNDARY_HDR });
            res.end(method === 'HEAD' ? undefined : body);
            return true;
        }
        if (asset.elsewhere) {
            const pointer = Buffer.from(JSON.stringify({ location: asset.elsewhere }), 'utf8');
            const tag = reg.etagOf(pointer);
            if (method === 'HEAD') {
                res.writeHead(200, { ETag: tag, 'X-OSL-Asset-Elsewhere': asset.elsewhere });
                res.end();
                return true;
            }
            res.writeHead(302, { Location: asset.elsewhere, ETag: tag });
            res.end();
            return true;
        }
        const reps = reg.representationsOf(asset);
        const offers = Array.from(reps.keys());
        const chosen = wowMediaTypes.negotiate(req.headers['accept'], offers);
        if (!chosen.mediaType) {
            res.writeHead(406, { 'Content-Type': 'application/json', 'X-OSL-Asset-Offers': offers.join(', ') });
            res.end(method === 'HEAD' ? undefined
                : JSON.stringify({ ok: false, error: 'not_acceptable', assetId, offered: offers }, null, 2));
            return true;
        }
        const rep = reps.get(chosen.mediaType);
        if (reg.ifNoneMatchHits(req.headers['if-none-match'], rep.etag)) {
            res.writeHead(304, { ETag: rep.etag, 'Content-Type': chosen.mediaType });
            res.end();
            return true;
        }
        const headers = {
            'Content-Type': chosen.mediaType,
            ETag: rep.etag,
            'Content-Length': String(rep.bytes.length),
            'Content-Disposition': 'inline; filename="' + assetId + '.' + rep.ext + '"',
            'X-OSL-Asset-Negotiated': chosen.negotiated ? 'content-negotiated' : 'default-representation',
            'X-MSF-validation-Boundary': PROOF_BOUNDARY_HDR,
        };
        if (rep.provisional)
            headers['X-OSL-Asset-Media-Type'] = 'PROVISIONAL (D8; not IANA-registered)';
        res.writeHead(200, headers);
        res.end(method === 'HEAD' ? undefined : rep.bytes);
        return true;
    }
    function readBody(req, cb) {
        let data = '';
        req.on('data', chunk => { data += chunk; if (data.length > 1e6)
            req.destroy(); });
        req.on('end', () => {
            if (!data)
                return cb(null, {});
            try {
                cb(null, JSON.parse(data));
            }
            catch (err) {
                cb(err, null);
            }
        });
    }
    const server = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://127.0.0.1:' + cfg.http_port);
        const path = url.pathname;
        const method = req.method;
        if (method === 'GET' && path === '/healthz')
            return sendJson(res, 200, {
                ok: true,
                location_id: runtime.LOCATION_ID,
                world_id: runtime.WORLD_ID,
                node_role: runtime.NODE_ROLE,
                port: bindPort,
            });
        if (method === 'GET' && path === '/wow/world')
            return sendJson(res, 200, wowValidate(res, 'world', runtime.getWowWorld()));
        if (method === 'GET' && path === '/wow/location')
            return sendJson(res, 200, runtime.getWowLocation());
        if (method === 'GET' && path === '/wow/graph') {
            const graph = runtime.getWowGraph();
            if (!graph)
                return sendJson(res, 404, { ok: false, error: 'authored_graph_not_configured' });
            return sendJson(res, 200, graph);
        }
        if (method === 'GET' && path.startsWith('/wow/portal/')) {
            const portalId = decodeURIComponent(path.slice('/wow/portal/'.length));
            const proj = runtime.getWowPortal(portalId);
            if (!proj)
                return sendJson(res, 404, { ok: false, error: 'portal_not_found', portalId });
            return sendJson(res, 200, wowValidate(res, 'portal', proj));
        }
        if (method === 'GET' && path.startsWith('/wow/user/')) {
            const userId = decodeURIComponent(path.slice('/wow/user/'.length));
            Promise.resolve()
                .then(() => runtime.getWowUserSigned(userId))
                .then((proj) => {
                if (!proj)
                    return sendJson(res, 404, { ok: false, error: 'user_not_found', userId });
                return sendJson(res, 200, wowValidate(res, 'user', proj));
            })
                .catch(() => {
                const proj = runtime.getWowUser(userId);
                if (!proj)
                    return sendJson(res, 404, { ok: false, error: 'user_not_found', userId });
                return sendJson(res, 200, wowValidate(res, 'user', proj));
            });
            return;
        }
        if (method === 'GET' && path.startsWith('/wow/view/')) {
            const viewId = decodeURIComponent(path.slice('/wow/view/'.length));
            const proj = runtime.getWowView(viewId);
            if (!proj)
                return sendJson(res, 404, { ok: false, error: 'view_not_found', viewId });
            return sendJson(res, 200, wowValidate(res, 'view', proj));
        }
        if (path.startsWith(wowAsset.ASSET_BASE_PREFIX))
            return serveAsset(req, res, url, path, method);
        if (path.startsWith('/wow/spatial/')) {
            let rest = path.slice('/wow/spatial/'.length);
            if (rest.endsWith('/'))
                rest = rest.slice(0, -1);
            const marker = '/node/';
            const at = rest.indexOf(marker);
            const spatialID = decodeURIComponent(at === -1 ? rest : rest.slice(0, at));
            const nodeIdRaw = at === -1 ? null : decodeURIComponent(rest.slice(at + marker.length));
            if (!spatialID)
                return sendJson(res, 404, { ok: false, error: 'spatial_graph_not_found', path });
            if (nodeIdRaw === null) {
                if (method === 'GET') {
                    const spatialForm = String(req.headers['x-osl-wow-spatial-form']
                        || url.searchParams.get('form') || '').toLowerCase();
                    if (spatialForm === 'descriptor' || spatialForm === 'spatial') {
                        const desc = runtime.getSpatialDescriptor(spatialID);
                        if (!desc)
                            return sendJson(res, 404, { ok: false, error: 'spatial_graph_not_found', spatialID });
                        try {
                            res.setHeader('X-OSL-WoW-Spatial-Form', 'descriptor');
                        }
                        catch (e) { }
                        return sendJson(res, 200, wowValidate(res, 'Spatial', desc));
                    }
                    const root = runtime.getSpatialGraphRoot(spatialID);
                    if (!root)
                        return sendJson(res, 404, { ok: false, error: 'spatial_graph_not_found', spatialID });
                    try {
                        res.setHeader('X-OSL-WoW-Spatial-Form', 'node');
                    }
                    catch (e) { }
                    return sendJson(res, 200, wowValidateNodeResponse(res, root, false));
                }
                return sendJson(res, 405, { ok: false, error: 'method_not_allowed', method, path });
            }
            if (!/^-?\d+$/.test(nodeIdRaw))
                return sendJson(res, 400, { ok: false, error: 'invalid_node_id', nodeId: nodeIdRaw });
            const nodeId = Number(nodeIdRaw);
            if (method === 'GET') {
                const node = runtime.getSpatialNode(spatialID, nodeId);
                if (!node)
                    return sendJson(res, 404, { ok: false, error: 'node_not_found', spatialID, nodeId });
                return sendJson(res, 200, wowValidateNodeResponse(res, node, false));
            }
            const nodeFormRaw = String(req.headers['x-osl-wow-node-form'] || url.searchParams.get('nodeForm') || '').toLowerCase();
            const wantsCanonicalIn = nodeFormRaw === 'canonical';
            if (method === 'POST') {
                return readBody(req, (err, body) => {
                    if (err)
                        return sendJson(res, 400, { ok: false, error: 'bad_json' });
                    if (!Array.isArray(body))
                        return sendJson(res, 400, { ok: false, error: 'expected_node_array' });
                    const reqSchema = wantsCanonicalIn ? 'Node[]' : 'OSLFlatNode[]';
                    const vr = wowValidateNodeRequest(reqSchema, body);
                    if (vr && !vr.valid) {
                        try {
                            res.setHeader('X-OSL-WoW-Validation', 'fail:' + vr.schema);
                        }
                        catch (e) { }
                        return sendJson(res, 422, { ok: false, error: 'node_validation_failed', details: vr.errorsText });
                    }
                    const r = runtime.createSpatialNodes(spatialID, nodeId, body, { flattenEmbedded: wantsCanonicalIn });
                    if (!r.ok)
                        return sendJson(res, r.status, Object.assign({ ok: false, error: r.error, spatialID, nodeId }, r.detail || {}));
                    try {
                        res.setHeader('X-OSL-WoW-Node-Form', r.flattened ? 'flattened-from-canonical' : 'osl-flat');
                        res.setHeader('X-OSL-WoW-Nodes-Stored', String(r.stored) + '/' + String(r.requested));
                        if (r.flattened)
                            res.setHeader('X-OSL-WoW-Children-Flattened', String(r.flattened));
                    }
                    catch (e) { }
                    return sendJson(res, 200, wowValidateNodeResponse(res, r.value, true));
                });
            }
            if (method === 'PUT') {
                return readBody(req, (err, body) => {
                    if (err)
                        return sendJson(res, 400, { ok: false, error: 'bad_json' });
                    if (!body || typeof body !== 'object' || Array.isArray(body))
                        return sendJson(res, 400, { ok: false, error: 'expected_node_object' });
                    const vr = wowValidateNodeRequest('OSLFlatNode', body);
                    if (vr && !vr.valid) {
                        try {
                            res.setHeader('X-OSL-WoW-Validation', 'fail:' + vr.schema);
                        }
                        catch (e) { }
                        return sendJson(res, 422, { ok: false, error: 'node_validation_failed', details: vr.errorsText });
                    }
                    const r = runtime.updateSpatialNode(spatialID, nodeId, body);
                    if (!r.ok)
                        return sendJson(res, r.status, Object.assign({ ok: false, error: r.error, spatialID, nodeId }, r.detail || {}));
                    return sendJson(res, 200, wowValidateNodeResponse(res, r.value, false));
                });
            }
            if (method === 'DELETE') {
                const r = runtime.deleteSpatialNode(spatialID, nodeId);
                if (!r.ok)
                    return sendJson(res, r.status, { ok: false, error: r.error, spatialID, nodeId });
                return sendJson(res, 200, Object.assign({ ok: true }, r.value));
            }
            return sendJson(res, 405, { ok: false, error: 'method_not_allowed', method, path });
        }
        if (method === 'GET' && path === '/debug/state')
            return sendJson(res, 200, runtime.getDebugState());
        if (method === 'GET' && path === '/fabric.json')
            return sendJson(res, 200, runtime.getFabricManifest());
        if (method === 'GET' && path === '/fabric/region') {
            const anchor = url.searchParams.get('anchor_portal_id')
                || ((runtime.getState().portals[0] || {}).portal_id);
            const radius = url.searchParams.get('radius_m');
            const chunked = url.searchParams.get('chunked');
            try {
                if (chunked === '1' || chunked === 'true') {
                    return sendJson(res, 200, runtime.getFabricRegionChunk(anchor, radius, {
                        scope: url.searchParams.get('scope'),
                        cursor: url.searchParams.get('cursor'),
                        max_entities: url.searchParams.get('max_entities'),
                        max_bytes: url.searchParams.get('max_bytes'),
                    }));
                }
                return sendJson(res, 200, runtime.getFabricRegion(anchor, radius));
            }
            catch (e) {
                return sendJson(res, 400, { ok: false, error: 'fabric_region_rejected', message: e.message });
            }
        }
        if (method === 'GET' && path === '/fabric/region/tileset-hypothesis') {
            const anchor = url.searchParams.get('anchor_portal_id')
                || ((runtime.getState().portals[0] || {}).portal_id);
            try {
                return sendJson(res, 200, runtime.getFabricRegionTilesetHypothesis(anchor, url.searchParams.get('radius_m')));
            }
            catch (e) {
                return sendJson(res, 400, { ok: false, error: 'fabric_region_rejected', message: e.message });
            }
        }
        if (method === 'GET' && path === '/fabric/presence')
            return sendJson(res, 200, runtime.getFabricPresence());
        if (method === 'GET' && path === '/.well-known/spatial-fabric') {
            const s = runtime.getState();
            return sendJson(res, 200, {
                fabric_id: 'local-fabric-' + runtime.LOCATION_ID,
                location: runtime.LOCATION_ID,
                world_url: '/wow/world',
                location_url: '/wow/location',
                authored_graph_url: runtime.getWowGraph() ? '/wow/graph' : null,
                portals: s.portals.map(p => p.portal_id),
                session_endpoint: '/sessions',
                runtime_state_url: '/runtime-state',
                debug_state_url: '/debug/state',
                proof_boundary: runtime.getWowProofBoundary(),
            });
        }
        if (method === 'GET' && path === '/demo/scene-objects')
            return sendJson(res, 200, runtime.getSceneObjects());
        if (method === 'GET' && path === '/demo/um/attach-point')
            return sendJson(res, 200, runtime.getUmAttachPoint());
        if (method === 'GET' && path === '/demo/portal-view') {
            const resolution = url.searchParams.get('resolution') || 'snapshot3d';
            const view = runtime.getPortalView(resolution);
            if (!view)
                return sendJson(res, 404, {
                    ok: false,
                    error: 'unknown_resolution',
                    resolution,
                    available: ['color', 'snapshot3d', 'splats'],
                });
            return sendJson(res, 200, view);
        }
        if (method === 'POST' && path === '/demo/scene-objects/move') {
            return readBody(req, (err, body) => {
                if (err)
                    return sendJson(res, 400, { ok: false, error: 'bad_json' });
                try {
                    const obj = runtime.moveSceneObject(body && body.object_id, body && body.position);
                    return sendJson(res, 200, { ok: true, demo_extension: true, object: obj });
                }
                catch (e) {
                    return sendJson(res, 400, { ok: false, error: 'scene_object_move_rejected', message: e.message });
                }
            });
        }
        if (method === 'POST' && path === '/demo/portal/move') {
            return readBody(req, (err, body) => {
                if (err)
                    return sendJson(res, 400, { ok: false, error: 'bad_json' });
                try {
                    const portal = runtime.movePortal(body && body.position);
                    return sendJson(res, 200, { ok: true, demo_extension: true, portal });
                }
                catch (e) {
                    return sendJson(res, 400, { ok: false, error: 'portal_move_rejected', message: e.message });
                }
            });
        }
        if (method === 'GET' && path === '/demo/republish-rate')
            return sendJson(res, 200, runtime.getRepublishRate());
        if (method === 'POST' && path === '/demo/republish-rate') {
            return readBody(req, (err, body) => {
                if (err)
                    return sendJson(res, 400, { ok: false, error: 'bad_json' });
                try {
                    const out = runtime.setRepublishRate(body && body.republish_rate_ms);
                    return sendJson(res, 200, out);
                }
                catch (e) {
                    return sendJson(res, 400, { ok: false, error: 'republish_rate_rejected', message: e.message });
                }
            });
        }
        if (method === 'POST' && path === '/fabric/presence/register') {
            return readBody(req, (err, body) => {
                if (err)
                    return sendJson(res, 400, { ok: false, error: 'bad_json' });
                try {
                    return sendJson(res, 201, runtime.registerPresence(body || {}));
                }
                catch (e) {
                    return sendJson(res, 400, { ok: false, error: 'presence_register_rejected', message: e.message });
                }
            });
        }
        if (method === 'POST' && path === '/fabric/presence/heartbeat') {
            return readBody(req, (err, body) => {
                if (err)
                    return sendJson(res, 400, { ok: false, error: 'bad_json' });
                try {
                    return sendJson(res, 200, runtime.heartbeatPresence(body || {}));
                }
                catch (e) {
                    return sendJson(res, 400, { ok: false, error: 'presence_heartbeat_rejected', message: e.message });
                }
            });
        }
        if (method === 'POST' && path === '/fabric/presence/depart') {
            return readBody(req, (err, body) => {
                if (err)
                    return sendJson(res, 400, { ok: false, error: 'bad_json' });
                try {
                    return sendJson(res, 200, runtime.departPresence(body || {}));
                }
                catch (e) {
                    return sendJson(res, 400, { ok: false, error: 'presence_depart_rejected', message: e.message });
                }
            });
        }
        if (method === 'POST' && (path === '/portal/exit-intent' || path === '/wow/portal/exit')) {
            return readBody(req, (err, body) => {
                if (err)
                    return sendJson(res, 400, { ok: false, error: 'bad_json' });
                try {
                    const portalId = (body && body.portal_id) || (runtime.getState().portals[0] || {}).portal_id;
                    const playerId = body && body.player_id ? String(body.player_id) : null;
                    const packet = runtime.recordPortalExitIntent(portalId, playerId);
                    return sendJson(res, 201, packet);
                }
                catch (e) {
                    return sendJson(res, 400, { ok: false, error: 'exit_intent_rejected', message: e.message });
                }
            });
        }
        if (method === 'POST' && (path === '/portal/arrival' || path === '/wow/portal/arrival')) {
            return readBody(req, (err, body) => {
                if (err)
                    return sendJson(res, 400, { ok: false, error: 'bad_json' });
                try {
                    const out = runtime.recordPortalArrival(body || {});
                    return sendJson(res, 201, { ok: true, applied: true, state: out });
                }
                catch (e) {
                    return sendJson(res, 400, { ok: false, error: 'portal_arrival_rejected', message: e.message });
                }
            });
        }
        if (method === 'POST' && path === '/movement') {
            return readBody(req, (err, body) => {
                if (err)
                    return sendJson(res, 400, { ok: false, error: 'bad_json' });
                const out = runtime.applyMovement(body || {});
                return sendJson(res, 200, { ok: true, avatar: out.avatar });
            });
        }
        if (method === 'POST' && path === '/reset') {
            const out = runtime.reset();
            return sendJson(res, 200, { ok: true, reset: true, debug_state: out });
        }
        return sendJson(res, 404, { ok: false, error: 'not_found', path });
    });
    server.on('upgrade', (req, socket) => {
        const url = new URL(req.url, 'http://127.0.0.1:' + cfg.http_port);
        const wsPath = url.pathname;
        if (wsPath !== '/runtime-state' && wsPath !== '/events') {
            socket.destroy();
            return;
        }
        const key = req.headers['sec-websocket-key'];
        const accept = crypto.createHash('sha1')
            .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
            .digest('base64');
        socket.write('HTTP/1.1 101 Switching Protocols\r\n' +
            'Upgrade: websocket\r\n' +
            'Connection: Upgrade\r\n' +
            'Sec-WebSocket-Accept: ' + accept + '\r\n\r\n');
        function encodeFrame(str) {
            const payload = Buffer.from(str, 'utf8');
            const len = payload.length;
            let header;
            if (len < 126) {
                header = Buffer.alloc(2);
                header[1] = len;
            }
            else if (len < 65536) {
                header = Buffer.alloc(4);
                header[1] = 126;
                header.writeUInt16BE(len, 2);
            }
            else {
                header = Buffer.alloc(10);
                header[1] = 127;
                header.writeUInt32BE(0, 2);
                header.writeUInt32BE(len, 6);
            }
            header[0] = 0x81;
            return Buffer.concat([header, payload]);
        }
        function sendFrame(obj) {
            try {
                socket.write(encodeFrame(JSON.stringify(obj)));
            }
            catch (e) { }
        }
        let unsubscribe;
        if (wsPath === '/events') {
            sendFrame(runtime.getWowEventsHello());
            unsubscribe = runtime.subscribeEvents(evt => sendFrame(evt));
        }
        else {
            unsubscribe = runtime.subscribe(snapshot => sendFrame({ type: 'state', state: snapshot }));
        }
        socket.on('data', () => { });
        openSockets.add(socket);
        socket.on('close', () => { unsubscribe(); openSockets.delete(socket); });
        socket.on('error', () => { unsubscribe(); openSockets.delete(socket); });
    });
    const openSockets = new Set();
    server.on('connection', s => {
        openSockets.add(s);
        s.on('close', () => openSockets.delete(s));
    });
    function closeAll() {
        return new Promise(resolve => {
            try {
                if (typeof runtime.stopRepublishTimer === 'function')
                    runtime.stopRepublishTimer();
            }
            catch (e) { }
            try {
                if (typeof runtime.stopPresenceSweeper === 'function')
                    runtime.stopPresenceSweeper();
            }
            catch (e) { }
            for (const s of openSockets) {
                try {
                    s.destroy();
                }
                catch (e) { }
            }
            openSockets.clear();
            server.close(() => resolve());
        });
    }
    return { server, runtime, cfg, closeAll, getAssetRegistry };
}
module.exports = { createServer };
