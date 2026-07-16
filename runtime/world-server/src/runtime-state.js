'use strict';
const { createSpatialGraphStore, translationMatrix } = require('./spatial-graph');
const crypto = require('crypto');
const nodePath = require('path');
const { pathToFileURL } = require('url');
const UM_SIGNING_LIB_URL = pathToFileURL(nodePath.join(__dirname, '..', '..', '..', 'web', 'signing', 'index.mjs')).href;
let _umSigningLibPromise = null;
function umSigningLib() {
    if (!_umSigningLibPromise)
        _umSigningLibPromise = import(UM_SIGNING_LIB_URL);
    return _umSigningLibPromise;
}
const UM_DEV_IDENTITY_SEED = new Uint8Array(crypto.createHash('sha256')
    .update('open-spatial-lab-local-identity-v1')
    .digest());
const WOW_OPEN_USER_MANIFEST_DEMO_AGE = 30;
const UM_IDENTITY_NONCANONICAL_LABEL = 'non-canonical additive (x-osl-extension): REAL UM identity signature '
    + '(Ed25519 over JCS-RFC8785 canonical bytes; did:key). standards_conformance stays false; '
    + 'separate from the deferred .msf RS256/x5c engine spine.';
const _umSignedCache = new Map();
async function umSignOpenUserManifest(content) {
    const lib = await umSigningLib();
    const canon = lib.canonicalizeToString(content);
    if (_umSignedCache.has(canon))
        return _umSignedCache.get(canon);
    const signed = await lib.attachSignatureProfileA(content, UM_DEV_IDENTITY_SEED);
    _umSignedCache.set(canon, signed);
    return signed;
}
const FABRIC_PORTAL_FRAME_PRESETS = {
    'location-a': { forward: [0, 0, 1] },
    'location-b': { forward: [-1, 0, 0] },
    'location-lobby': { forward: [0, 0, 1] },
    'location-airport': { forward: [0, 0, 1] },
};
const FABRIC_PORTAL_FRAME_WIDTH_M = 1.8;
const FABRIC_PORTAL_FRAME_HEIGHT_M = 2.8;
const FABRIC_PORTAL_TRIGGER_DEPTH_M = 0.8;
const FABRIC_SPAWN_CLEARANCE_M = 2.4;
const FABRIC_TRIGGER_BOUND_MAX = [
    FABRIC_PORTAL_FRAME_WIDTH_M / 2,
    FABRIC_PORTAL_FRAME_HEIGHT_M / 2,
    0.9,
];
const FABRIC_BACKGROUND_RRGGBB = '0B1020';
const WOW_GEOPOSE_MAPPING = {
    frame: 'demo-local-tangent (NOT georeferenced)',
    lat: '-z in local metres',
    lan: '+x in local metres (spec spells longitude "lan")',
    h: '+y in local metres',
    angles: 'degrees; yaw about +h with 0 facing local +z (scene rotation_y), roll fixed 0',
};
const WOW_LOCAL_USER_ID = 1;
const WOW_PLAYER_VIEW_ID = 1;
const WOW_PRESENCE_USER_ID_BASE = 1000;
const DEMO_SCENE_OBJECT_LIMIT_M = 5.4;
const DEMO_PORTAL_LIMIT_M = 5.0;
const DEMO_WORLD_BASE_COLOR = {
    'location-a': '#143856',
    'location-b': '#592b14',
    'location-lobby': '#1c4030',
    'location-airport': '#15364a',
};
const DEMO_PORTAL_LOADING_BRAND = {
    'location-a': {
        accent_hex: '#3aa0ff',
        tagline: 'Origin Gallery — where the demo begins',
        estimated_load_ms: 2400,
        instructions: ['WASD to walk', 'Space to hop', 'drag to orbit the camera'],
    },
    'location-b': {
        accent_hex: '#ff7a3a',
        tagline: 'Arrival Hall — the far side of the crossing',
        estimated_load_ms: 2800,
        instructions: ['WASD to walk', 'the return portal is behind you', 'drag to orbit the camera'],
    },
    'location-lobby': {
        accent_hex: '#42d68a',
        tagline: 'Lobby — gather here, then choose a destination portal',
        estimated_load_ms: 2000,
        instructions: ['WASD to walk', 'two portals ahead: Location A left, Location B right', 'drag to orbit the camera'],
    },
    'location-airport': {
        accent_hex: '#4db6d6',
        tagline: 'Denver Skyport - Concourse A and Gate A12',
        estimated_load_ms: 2600,
        instructions: ['WASD to walk', 'Gate A12 is down the concourse', 'return portal is behind the entry spawn'],
    },
};
const PRESENCE_TTL_DEFAULT_MS = 10000;
const PRESENCE_TTL_MIN_MS = 1000;
const PRESENCE_TTL_MAX_MS = 60000;
const PRESENCE_SWEEP_INTERVAL_MS = 1000;
const PRESENCE_HEARTBEAT_HINT_MS = 3000;
const PRESENCE_MAX_PLAYERS = 64;
const PRESENCE_DEPART_TOMBSTONE_MS = 5000;
function demoDefaultSceneObjects(locationId) {
    if (locationId === 'location-b') {
        return [
            { object_id: 'obj-b-cube-1', shape: 'box', size_m: 0.8, color: '#ff8c42', position: [-2.4, 0.4, -1.2] },
            { object_id: 'obj-b-sphere-1', shape: 'sphere', size_m: 0.7, color: '#ffd166', position: [1.6, 0.35, 1.8] },
            { object_id: 'obj-b-cube-2', shape: 'box', size_m: 0.6, color: '#c65ccd', position: [-0.8, 0.3, 2.6] },
        ];
    }
    if (locationId === 'location-lobby') {
        return [
            { object_id: 'obj-lobby-marker-1', shape: 'box', size_m: 0.7, color: '#42d68a', position: [0, 0.35, -4.4] },
            { object_id: 'obj-lobby-bench-1', shape: 'box', size_m: 0.6, color: '#9fb0d0', position: [-4.4, 0.3, 1.6] },
            { object_id: 'obj-lobby-bench-2', shape: 'box', size_m: 0.6, color: '#9fb0d0', position: [4.4, 0.3, 1.6] },
        ];
    }
    return [
        { object_id: 'obj-a-cube-1', shape: 'box', size_m: 0.8, color: '#2bd4ff', position: [-2.2, 0.4, 1.6] },
        { object_id: 'obj-a-sphere-1', shape: 'sphere', size_m: 0.7, color: '#6ee7a8', position: [1.8, 0.35, -0.6] },
        { object_id: 'obj-a-cube-2', shape: 'box', size_m: 0.6, color: '#8a7dff', position: [-1.2, 0.3, -2.2] },
    ];
}
function authoredGraphSceneObjects(graph) {
    if (!graph || !Array.isArray(graph.nodes))
        return [];
    const rootId = Number(graph.root);
    return graph.nodes
        .filter(node => node && Number(node.id) !== rootId && node.label !== '__wow_internal_root')
        .map(node => {
        const transform = Array.isArray(node.localTransform) ? node.localTransform : [];
        const extension = node.webofworlds_extension && typeof node.webofworlds_extension === 'object'
            ? JSON.parse(JSON.stringify(node.webofworlds_extension))
            : null;
        const accent = Number(extension && extension.accent);
        return {
            object_id: 'wow-node-' + node.id,
            node_id: Number(node.id),
            label: String(node.label || ('WoW node ' + node.id)),
            shape: 'box',
            size_m: 0.5,
            color: Number.isFinite(accent)
                ? '#' + Math.max(0, Math.min(0xffffff, accent)).toString(16).padStart(6, '0')
                : '#8fc7d9',
            position: [
                Number(transform[12]) || 0,
                Number(transform[13]) || 0,
                Number(transform[14]) || 0,
            ],
            spatial_asset_uri: node.spatialAssetURI || null,
            authored_wow_content: true,
            webofworlds_extension: extension,
        };
    });
}
const FABRIC_DENSITY_FIXTURE_PALETTE = [
    '#2bd4ff', '#6ee7a8', '#8a7dff', '#ff8c42', '#ffd166', '#c65ccd', '#9fb0d0', '#42d68a',
];
function densityFixtureFor(locationId) {
    const raw = process.env.OSL_FABRIC_DENSITY_FIXTURE;
    if (!raw)
        return null;
    try {
        const parsed = JSON.parse(raw);
        const hit = parsed && typeof parsed === 'object' ? parsed[locationId] : null;
        return hit && typeof hit === 'object' ? hit : null;
    }
    catch (e) {
        return null;
    }
}
function densityFixtureSceneObjects(locationId, portals) {
    const fixture = densityFixtureFor(locationId);
    if (!fixture)
        return [];
    const firstPortal = Array.isArray(portals) && portals.length ? portals[0] : null;
    const anchor = firstPortal && firstPortal.trigger
        && Array.isArray(firstPortal.trigger.position)
        ? firstPortal.trigger.position
        : [0, 0, 0];
    const quotas = Array.isArray(fixture.band_quotas) && fixture.band_quotas.length
        ? fixture.band_quotas.map(n => Math.max(0, Math.floor(Number(n) || 0)))
        : [15, 12, 12, 14];
    const roi = Number(fixture.roi_radius_m) > 0 ? Number(fixture.roi_radius_m) : 5.0;
    const beyondMax = Number(fixture.max_radius_m) > 0 ? Number(fixture.max_radius_m) : 9.0;
    const ranges = [
        [0.7, (roi / 3) * 0.94],
        [(roi / 3) * 1.04, ((2 * roi) / 3) * 0.96],
        [((2 * roi) / 3) * 1.03, roi * 0.96],
        [roi * 1.08, beyondMax],
    ];
    const GOLDEN_ANGLE = 2.399963229728653;
    const objects = [];
    let serial = 0;
    quotas.forEach((count, band) => {
        const range = ranges[band] || ranges[ranges.length - 1];
        for (let j = 0; j < count; j += 1) {
            const frac = count <= 1 ? 0.5 : j / (count - 1);
            const r = range[0] + (range[1] - range[0]) * (0.06 + 0.88 * frac);
            const angle = GOLDEN_ANGLE * serial;
            objects.push({
                object_id: 'fixture-' + locationId + '-' + String(serial).padStart(3, '0'),
                shape: serial % 2 === 0 ? 'box' : 'sphere',
                size_m: 0.24,
                color: FABRIC_DENSITY_FIXTURE_PALETTE[serial % FABRIC_DENSITY_FIXTURE_PALETTE.length],
                position: [
                    Number((anchor[0] + r * Math.cos(angle)).toFixed(3)),
                    0.12,
                    Number((anchor[2] + r * Math.sin(angle)).toFixed(3)),
                ],
                fixture: true,
                synthetic_density_fixture: true,
            });
            serial += 1;
        }
    });
    return objects;
}
const WOW_VIEW_CAMERA_RIG = {
    mode: 'over_shoulder_follow',
    follow_distance_m: 3.5,
    follow_height_m: 2.1,
    look_target_height_m: 1.35,
};
function createRuntime(opts) {
    const cfg = opts || {};
    const LOCATION_ID = String(cfg.location_id);
    const WORLD_ID = String(cfg.world_id);
    const SESSION_ID = String(cfg.session_id);
    const HTTP_PORT = Number(cfg.http_port);
    const NODE_ROLE = String(cfg.node_role || 'node');
    const TITLE = String(cfg.title || LOCATION_ID);
    const AUTHORED_WOW_GRAPH = cfg.authored_wow_graph
        ? JSON.parse(JSON.stringify(cfg.authored_wow_graph))
        : null;
    const AUTHORED_SCENE_OBJECTS = authoredGraphSceneObjects(AUTHORED_WOW_GRAPH);
    const ARRIVAL_COMMIT_MODE = String(cfg.arrival_commit_mode || 'sync');
    let stateRevision = 0;
    const subscribers = new Set();
    const state = {
        location: {
            location_id: LOCATION_ID,
            title: TITLE,
            http_port: HTTP_PORT,
            node_role: NODE_ROLE,
        },
        world: {
            world_id: WORLD_ID,
        },
        session: {
            session_id: SESSION_ID,
            world_id: WORLD_ID,
            location_id: LOCATION_ID,
            arrival_count: 0,
            connected_clients: [],
            handoff_bootstrap: null,
        },
        avatar: {
            avatar_id: 'avatar-local-001',
            continuity_id: 'avatar-local-001',
            display_name: 'poc-user',
            transform: {
                position: [0, 0, 0],
                rotation_y: 0,
                orientation: [0, 0, 0, 1],
                scale: [1, 1, 1],
            },
            handoff_context: null,
        },
        portals: (cfg.portals || []).map(p => Object.assign({}, p)),
        scene_objects: (AUTHORED_SCENE_OBJECTS.length
            ? AUTHORED_SCENE_OBJECTS
            : demoDefaultSceneObjects(String(cfg.location_id)))
            .concat(densityFixtureSceneObjects(String(cfg.location_id), cfg.portals || []))
            .map(o => Object.assign({}, o, { position: o.position.slice() })),
        attach_point: {
            version: 1,
            updated_at: new Date().toISOString(),
            last_change: 'init',
        },
        server_tick: 0,
        debug: {
            state_revision: 0,
            last_input_source: 'init',
            handoff: {
                last_handoff_id: null,
                last_exit_intent: null,
                last_arrival: null,
            },
        },
    };
    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }
    function readNumber(value, fallback) {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    }
    function bumpRevision() {
        stateRevision += 1;
        state.debug.state_revision = stateRevision;
    }
    function notifySubscribers() {
        const snapshot = getState();
        for (const subscriber of subscribers) {
            try {
                subscriber(snapshot);
            }
            catch (err) {
                console.error('runtime-state subscriber failed: ' + err.message);
            }
        }
    }
    function getState() {
        const snapshot = clone(state);
        snapshot.session.connected_clients = presenceConnectedClientsProjection();
        return snapshot;
    }
    function getDebugState() {
        const snapshot = clone({
            location: state.location,
            world: state.world,
            portals: state.portals,
            session: state.session,
            avatar: state.avatar,
            server_tick: state.server_tick,
            debug: state.debug,
        });
        snapshot.session.connected_clients = presenceConnectedClientsProjection();
        return snapshot;
    }
    function subscribe(fn) {
        subscribers.add(fn);
        try {
            fn(getState());
        }
        catch (err) { }
        return function unsubscribe() { subscribers.delete(fn); };
    }
    function subscriberCount() {
        return subscribers.size;
    }
    const eventSubscribers = new Set();
    function emitWowEvent(evt) {
        if (!eventSubscribers.size)
            return;
        for (const subscriber of eventSubscribers) {
            try {
                subscriber(evt);
            }
            catch (err) {
                console.error('runtime-state event subscriber failed: ' + err.message);
            }
        }
    }
    function subscribeEvents(fn) {
        eventSubscribers.add(fn);
        return function unsubscribeEvents() { eventSubscribers.delete(fn); };
    }
    function eventSubscriberCount() {
        return eventSubscribers.size;
    }
    function wowUserEvent(type, entry) {
        return {
            type: type,
            ts: new Date().toISOString(),
            user: {
                id: entry.wow_user_id,
                player_id: entry.player_id,
                display_name: entry.display_name,
                avatar_id: entry.avatar_id,
            },
            location_id: LOCATION_ID,
            presence_scope: 'server-side-ttl-registry (local occupancy truth)',
            proof_boundary: getWowProofBoundary(),
        };
    }
    function wowNodeEvent(type, spatialID, node) {
        const n = node && typeof node === 'object' ? node : {};
        return {
            type: type,
            ts: new Date().toISOString(),
            node: (n.label != null)
                ? { id: n.id, label: n.label }
                : { id: n.id },
            spatialID: spatialID,
            location_id: LOCATION_ID,
            proof_boundary: getWowProofBoundary(),
        };
    }
    function liveWowPresenceUsers() {
        const now = Date.now();
        return livePresenceEntries(now).map(entry => ({
            id: entry.wow_user_id,
            player_id: entry.player_id,
            display_name: entry.display_name,
            avatar_id: entry.avatar_id,
            endpoint: '/wow/user/' + entry.wow_user_id,
            source: 'presence-registry',
        }));
    }
    function getWowEventsHello() {
        return {
            type: 'hello',
            ts: new Date().toISOString(),
            location_id: LOCATION_ID,
            world_id: WORLD_ID,
            spatialID: SPATIAL_ID,
            users: liveWowPresenceUsers(),
            convention: 'WS /events (labeled non-canonical; wow-spec/OSL-WOW-CONTRACT.md §6)',
            event_types: ['user_joined', 'user_left', 'node_created', 'node_updated', 'node_deleted'],
            presence_scope: 'server-side-ttl-registry (local occupancy truth; not networked)',
            proof_boundary: getWowProofBoundary(),
        };
    }
    function getWowProofBoundary() {
        return {
            application_level_handoff: true,
            native_teleportxr_teleport: false,
            first_party_teleportxr_browser_rendering: false,
            standards_conformance: false,
        };
    }
    function wowDegrees(rad) {
        const n = Number(rad);
        return Number.isFinite(n) ? Number((n * 180 / Math.PI).toFixed(3)) : 0;
    }
    function wowGeoPoseFromLocal(position, yawRad, pitchRad) {
        const p = Array.isArray(position) ? position : [0, 0, 0];
        return {
            position: {
                lat: Number((-(Number(p[2]) || 0)).toFixed(4)),
                lan: Number((Number(p[0]) || 0).toFixed(4)),
                h: Number((Number(p[1]) || 0).toFixed(4)),
            },
            angles: {
                yaw: wowDegrees(yawRad),
                pitch: wowDegrees(pitchRad),
                roll: 0,
            },
        };
    }
    function getWowWorld() {
        const projected = {
            content: {
                label: state.location.title + ' - world surface',
                age_restriction: 0,
                license: 'local-unsigned-demo (no license claim)',
                cost: 'free',
                version: 0.1,
                duration: 0,
            },
            geoPose: wowGeoPoseFromLocal([0, 0, 0], 0, 0),
            presence: {
                avatar: 'vrm-glb-avatar (client-rendered)',
                navigation: 'walk-wasd-jump',
                gravity: 'y-down-ground-clamp',
                avatars: [{
                        avatar_id: state.avatar.avatar_id,
                        continuity_id: state.avatar.continuity_id,
                        display_name: state.avatar.display_name,
                    }],
            },
            technology: {
                'webXR-immersive': 'not-proven',
                runtime: 'teleportxr-hosted-state-with-threejs-browser-fallback (re-modeled locally)',
            },
            users: {
                active_user_count: subscriberCount(),
                total_user_count: 1,
            },
            views: {
                view_count: 1,
            },
            portals: {
                portal_count: state.portals.length,
            },
            id: state.world.world_id,
            location: {
                id: state.location.location_id,
                title: state.location.title,
                port: state.location.http_port,
                node_role: state.location.node_role,
            },
            session: {
                id: state.session.session_id,
                world_id: state.session.world_id,
                location_id: state.session.location_id,
                arrival_count: state.session.arrival_count,
            },
            webofworlds_extension: {
                schema: 'OpenSpatialWorld API.yaml components.schemas.World + labeled extensions',
                geopose_mapping: WOW_GEOPOSE_MAPPING,
                users: [{ id: WOW_LOCAL_USER_ID, avatar_id: state.avatar.avatar_id, endpoint: '/wow/user/' + WOW_LOCAL_USER_ID }]
                    .concat(liveWowPresenceUsers()),
                views: [{ id: WOW_PLAYER_VIEW_ID, kind: 'player-view-camera', endpoint: '/wow/view/' + WOW_PLAYER_VIEW_ID }],
                portals: state.portals.map((portal, index) => ({
                    id: index + 1,
                    portal_id: portal.portal_id,
                    endpoint: '/wow/portal/' + (index + 1),
                    target_location_id: portal.target_location_id,
                    target_world_id: portal.target_world_id,
                })),
                active_user_count_source: 'live /runtime-state WebSocket subscribers',
            },
            proof_boundary: getWowProofBoundary(),
        };
        const authored = AUTHORED_WOW_GRAPH && AUTHORED_WOW_GRAPH.world;
        if (!authored)
            return projected;
        return Object.assign({}, projected, authored, {
            content: Object.assign({}, projected.content, authored.content || {}),
            presence: Object.assign({}, projected.presence, authored.presence || {}, {
                avatars: projected.presence.avatars,
            }),
            technology: Object.assign({}, projected.technology, authored.technology || {}),
            users: projected.users,
            views: projected.views,
            portals: projected.portals,
            id: WORLD_ID,
            location: projected.location,
            session: projected.session,
            webofworlds_extension: Object.assign({}, authored.webofworlds_extension || {}, projected.webofworlds_extension, {
                authored_graph: {
                    endpoint: '/wow/graph',
                    spatial_id: WORLD_ID,
                    source: 'checked-in OSL-authored world data',
                },
            }),
            proof_boundary: getWowProofBoundary(),
        });
    }
    function getWowLocation() {
        return {
            id: LOCATION_ID,
            title: TITLE,
            node_role: NODE_ROLE,
            world_id: WORLD_ID,
            session_id: SESSION_ID,
            base_url: 'http://127.0.0.1:' + HTTP_PORT,
            coordinate_frame: AUTHORED_WOW_GRAPH && AUTHORED_WOW_GRAPH.units
                ? AUTHORED_WOW_GRAPH.units
                : WOW_GEOPOSE_MAPPING.frame,
            entry_spawn: getFabricSpawnPose(),
            resources: {
                health: '/healthz',
                world: '/wow/world',
                authored_graph: AUTHORED_WOW_GRAPH ? '/wow/graph' : null,
                spatial_graph: '/wow/spatial/' + WORLD_ID,
                region: '/fabric/region',
                presence: '/fabric/presence',
                runtime_state: '/runtime-state',
                portals: state.portals.map((portal, index) => ({
                    portal_id: portal.portal_id,
                    endpoint: '/wow/portal/' + (index + 1),
                })),
                arrival: '/portal/arrival',
            },
            proof_boundary: getWowProofBoundary(),
        };
    }
    function getWowGraph() {
        if (!AUTHORED_WOW_GRAPH)
            return null;
        const graph = clone(AUTHORED_WOW_GRAPH);
        graph.spatialID = WORLD_ID;
        graph.base_url = 'http://127.0.0.1:' + HTTP_PORT;
        graph.spatial_composition_graph_endpoint = '/wow/graph';
        graph.world = Object.assign({}, graph.world || {}, {
            id: WORLD_ID,
            portals: { portal_count: state.portals.length },
            proof_boundary: getWowProofBoundary(),
        });
        graph.portals = state.portals.map((portal, index) => getWowPortalResource(index + 1));
        graph.backend_contract = {
            location_id: LOCATION_ID,
            world_id: WORLD_ID,
            session_id: SESSION_ID,
            node_role: NODE_ROLE,
            authored_content: true,
            client_cutover: false,
            public_deployment: false,
            proof_boundary: getWowProofBoundary(),
        };
        return graph;
    }
    function resolveWowPortal(idOrAlias) {
        const raw = String(idOrAlias == null ? '' : idOrAlias);
        if (/^\d+$/.test(raw)) {
            const index = Number(raw) - 1;
            const portal = state.portals[index];
            return portal ? { portal, wowId: index + 1 } : null;
        }
        const index = state.portals.findIndex(entry => entry.portal_id === raw);
        if (index === -1)
            return null;
        return { portal: state.portals[index], wowId: index + 1 };
    }
    function portalDestination(portal) {
        const address = spatialFabricAddressForPortal(portal);
        const out = {
            target_world_id: portal.target_world_id,
            target_location_id: portal.target_location_id,
            target_base_url: portal.target_base_url,
            spatial_fabric_address: address && address.uri ? address.uri : undefined,
        };
        for (const k of Object.keys(out))
            if (out[k] == null || out[k] === '')
                delete out[k];
        return out;
    }
    function wowPortalNodeId(wowId) {
        return 1 + state.scene_objects.length + (wowId - 1);
    }
    function wowPortalExtension(portal, wowId) {
        const traversal = portalTraversalRule(portal);
        const targetWorldId = portal.target_world_id || null;
        return {
            portal_id: portal.portal_id,
            wow_id: wowId,
            wow_resource: '/wow/portal/' + wowId,
            legacy_alias_endpoint: '/wow/portal/' + portal.portal_id,
            source_location_id: portal.source_location_id,
            source_world_id: portal.source_world_id,
            portal_node_id: wowPortalNodeId(wowId),
            target_spatial_graph_endpoint: targetWorldId ? '/wow/spatial/' + targetWorldId : null,
            target_fixture: portal.target_fixture
                ? clone(portal.target_fixture)
                : undefined,
            exit_endpoint: '/portal/exit-intent',
            arrival_endpoint: '/portal/arrival',
            handoff_behavior: portal.target_fixture
                ? 'client-scene-load (same browser/player; no application-level handoff)'
                : 'application-level-handoff-around-teleportxr',
            native_teleportxr_teleport: false,
            trigger: {
                position: portal.trigger.position,
                radius_m: readNumber(portal.trigger.radius_m, 0),
            },
            arrival: {
                position: portal.arrival.position,
                rotation_y: portal.arrival.rotation_y,
            },
            geopose_mapping: WOW_GEOPOSE_MAPPING,
            zones: portalZones(portal),
            spatial_fabric_address: spatialFabricAddressForPortal(portal),
            traversal_mode: traversal.mode,
            traversal: traversal,
            reciprocal: portalReciprocalRule(portal),
        };
    }
    function portalTraversalRule(portal) {
        const raw = portal.traversal || {};
        const mode = raw.mode === 'one_way' ? 'one_way' : 'bidirectional';
        const allowed = mode === 'one_way'
            ? (raw.allowed_entry_side === 'back' ? 'back' : 'front')
            : 'both';
        const preset = FABRIC_PORTAL_FRAME_PRESETS[portal.source_location_id] || null;
        return {
            mode: mode,
            transition: typeof raw.transition === 'string' && raw.transition
                ? raw.transition
                : undefined,
            allowed_entry_side: allowed,
            blocked_entry_side: mode === 'one_way'
                ? (allowed === 'front' ? 'back' : 'front')
                : null,
            side_reference: 'portal_frame_forward',
            frame_forward: preset ? preset.forward.slice() : [0, 0, 1],
            validation: {
                traversal_direction_standard_conformance: false,
                application_level: true,
            },
        };
    }
    function portalReciprocalRule(portal) {
        const raw = portal.reciprocal || {};
        return {
            mode: raw.mode === 'automatic' ? 'automatic' : 'disabled',
            validation: {
                automatic_reciprocal_standard_conformance: false,
                application_level: true,
            },
        };
    }
    function portalArmedEntrySides(portal) {
        const rule = portalTraversalRule(portal);
        return rule.mode === 'one_way' ? [rule.allowed_entry_side] : ['front', 'back'];
    }
    function portalZones(portal) {
        const sf = portal.spatial_fabric || {};
        const prefetchRadius = readNumber(sf.prefetch_radius_m, 2.5);
        const roiRadius = readNumber(sf.roi_radius_m, 5.0);
        const minPrefetchRadius = FABRIC_PORTAL_FRAME_WIDTH_M / 2 + FABRIC_PORTAL_TRIGGER_DEPTH_M + 0.5;
        const armedEntrySides = portalArmedEntrySides(portal);
        return {
            prefetch: {
                type: 'portal_center_planar_radius',
                radius_m: prefetchRadius,
                hysteresis_ratio: 1.15,
                armed_entry_sides: armedEntrySides.slice(),
                purpose: 'larger OUTER data-loading circle — resolve + preload the '
                    + 'destination spatial fabric neighborhood; NEVER commits traversal',
                widened_by: 'runtime',
                previous_proof_radius_m: 2.5,
                matching_destination_circle: {
                    radius_m: roiRadius,
                    includes_avatars: true,
                    matches_source_circle: roiRadius === prefetchRadius,
                    clamp_reason: roiRadius === prefetchRadius
                        ? null
                        : 'source-side circle is clamped by world geometry (the spawn '
                            + 'contract places the player 3.2 m from a location portal; '
                            + 'the lobby walk-away waypoints bound the exit hysteresis); '
                            + 'the destination-side loading circle keeps the full roi width',
                    rule: 'destination /fabric/region loads all scene entities and '
                        + 'registered avatars within radius_m of the destination '
                        + 'anchor portal',
                },
            },
            traversal: {
                type: 'oval_frame_plane_crossing',
                width_m: FABRIC_PORTAL_FRAME_WIDTH_M,
                height_m: FABRIC_PORTAL_FRAME_HEIGHT_M,
                trigger_depth_m: FABRIC_PORTAL_TRIGGER_DEPTH_M,
                armed_entry_sides: armedEntrySides.slice(),
                purpose: 'smaller commit trigger — walking through transfers the '
                    + 'player; semantics unchanged from the proven crossing gate',
            },
            invariant: 'prefetch.radius_m > width_m/2 + trigger_depth_m + 0.5',
            invariant_min_prefetch_radius_m: Number(minPrefetchRadius.toFixed(3)),
            invariant_ok: prefetchRadius > minPrefetchRadius,
        };
    }
    function spatialFabricAddressForPortal(portal) {
        if (portal.target_fixture || !portal.target_location_id
            || !portal.target_portal_id || !portal.target_base_url)
            return null;
        const sf = portal.spatial_fabric || {};
        const roiRadius = readNumber(sf.roi_radius_m, 5.0);
        const targetLocation = String(portal.target_location_id || '');
        const anchorPortalId = String(portal.target_portal_id || (targetLocation + '-portal'));
        const authority = String(portal.target_base_url || '');
        return {
            profile_version: 'osl.spatial-fabric-address.v0',
            uri: 'osl-fabric+http://' + authority.replace(/^https?:\/\//, '')
                + '/fabric.json#portal=' + anchorPortalId + '&roi_radius_m=' + roiRadius,
            authority: authority,
            fabric_id: 'local-fabric-' + targetLocation,
            world_id: portal.target_world_id || null,
            location_id: targetLocation || null,
            anchor: { type: 'portal', portal_id: anchorPortalId },
            roi_hint: { type: 'portal_neighborhood_radius', radius_m: roiRadius },
            discovery: {
                well_known: '/.well-known/spatial-fabric',
                fabric_manifest: '/fabric.json',
                region_endpoint: '/fabric/region',
                presence_endpoint: '/fabric/presence',
            },
            validation: {
                address_scheme_standard_conformance: false,
                application_level: true,
            },
        };
    }
    function fabricRegionBoundary() {
        return {
            demo_extension: true,
            claim: 'runtime local validation — portal-neighborhood (partial) '
                + 'spatial fabric read. NOT defined by RP1/Spatial Fabric (whitepaper '
                + 'documents proximity+LOD as a principle only), IWPS, Universal '
                + 'Manifest, or Web of Worlds.',
            read_only: true,
            application_level: true,
            roi_standard_conformance: false,
            standards_conformance: false,
            standards_shaped: [
                'rp1-whitepaper-proximity-lod-principle',
                'ogc-3d-tiles-bounding-volume-precedent',
                'oma3-iwps-pre-transit-query-shape',
            ],
        };
    }
    const presenceRegistry = new Map();
    let presenceSweepTimer = null;
    let presenceUserSeq = 0;
    const presenceTombstones = new Map();
    let presenceResurrectionsBlocked = 0;
    function pruneTombstones(nowMs) {
        for (const [playerId, expiresAt] of presenceTombstones) {
            if (expiresAt <= nowMs)
                presenceTombstones.delete(playerId);
        }
    }
    function presenceDepartedRecently(playerId) {
        const expiresAt = presenceTombstones.get(playerId) || 0;
        return expiresAt > Date.now();
    }
    function presenceString(value, fallback, max) {
        const s = value == null ? '' : String(value);
        return (s || fallback || '').slice(0, max || 120);
    }
    function presencePosition(value) {
        if (!Array.isArray(value) || value.length < 3)
            return null;
        const p = value.slice(0, 3).map(entry => Number(entry));
        return p.every(entry => Number.isFinite(entry))
            ? p.map(entry => Number(entry.toFixed(4)))
            : null;
    }
    function presenceEntrySummary(entry, nowMs) {
        return {
            player_id: entry.player_id,
            client_id: entry.client_id,
            avatar_id: entry.avatar_id,
            continuity_id: entry.continuity_id,
            display_name: entry.display_name,
            position: entry.position ? entry.position.slice() : null,
            rotation_y: entry.rotation_y,
            registered_at: entry.registered_at,
            last_seen_at: entry.last_seen_at,
            ttl_ms: entry.ttl_ms,
            expires_in_ms: Math.max(0, entry.expires_at_ms - nowMs),
            heartbeat_count: entry.heartbeat_count,
            registered_via: entry.registered_via,
        };
    }
    function livePresenceEntries(nowMs) {
        const now = Number.isFinite(nowMs) ? nowMs : Date.now();
        return Array.from(presenceRegistry.values())
            .filter(entry => entry.expires_at_ms > now)
            .sort((x, y) => x.registered_at_ms - y.registered_at_ms);
    }
    function presenceConnectedClientsProjection() {
        const now = Date.now();
        return livePresenceEntries(now).map(entry => presenceEntrySummary(entry, now));
    }
    function syncConnectedClients(nowMs) {
        const now = Number.isFinite(nowMs) ? nowMs : Date.now();
        state.session.connected_clients =
            livePresenceEntries(now).map(entry => presenceEntrySummary(entry, now));
    }
    function sweepPresenceRegistry(reason) {
        const now = Date.now();
        pruneTombstones(now);
        const expired = [];
        const expiredEntries = [];
        for (const [playerId, entry] of presenceRegistry) {
            if (entry.expires_at_ms <= now) {
                presenceRegistry.delete(playerId);
                expired.push(playerId);
                expiredEntries.push(entry);
            }
        }
        if (expired.length) {
            syncConnectedClients(now);
            state.debug.last_input_source = 'presence-expired:' + expired.join(',').slice(0, 60);
            bumpRevision();
            notifySubscribers();
            for (const entry of expiredEntries)
                emitWowEvent(wowUserEvent('user_left', entry));
            console.log('[Presence][' + LOCATION_ID + '] EXPIRED ' + JSON.stringify({
                players: expired, reason: reason || 'ttl_sweep',
            }));
        }
        if (presenceRegistry.size === 0)
            stopPresenceSweeper();
        return expired;
    }
    function startPresenceSweeper() {
        if (presenceSweepTimer)
            return;
        presenceSweepTimer = setInterval(() => sweepPresenceRegistry('ttl_sweep'), PRESENCE_SWEEP_INTERVAL_MS);
        if (presenceSweepTimer && typeof presenceSweepTimer.unref === 'function')
            presenceSweepTimer.unref();
    }
    function stopPresenceSweeper() {
        if (presenceSweepTimer) {
            clearInterval(presenceSweepTimer);
            presenceSweepTimer = null;
        }
    }
    function registerPresence(body, via) {
        sweepPresenceRegistry('pre_register');
        const input = body && typeof body === 'object' ? body : {};
        const playerId = presenceString(input.player_id, '', 120);
        if (!playerId)
            throw new Error('player_id required');
        if (!presenceRegistry.has(playerId) && presenceRegistry.size >= PRESENCE_MAX_PLAYERS)
            throw new Error('presence registry full (' + PRESENCE_MAX_PLAYERS + ')');
        const now = Date.now();
        const nowIso = new Date(now).toISOString();
        const requestedTtl = Number(input.requested_ttl_ms);
        const ttl = Number.isFinite(requestedTtl) && requestedTtl > 0
            ? Math.max(PRESENCE_TTL_MIN_MS, Math.min(PRESENCE_TTL_MAX_MS, Math.round(requestedTtl)))
            : PRESENCE_TTL_DEFAULT_MS;
        const previous = presenceRegistry.get(playerId) || null;
        const entry = {
            player_id: playerId,
            wow_user_id: previous ? previous.wow_user_id : (WOW_PRESENCE_USER_ID_BASE + (++presenceUserSeq)),
            client_id: presenceString(input.client_id, playerId, 120),
            avatar_id: presenceString(input.avatar_id, 'avatar-unknown', 80),
            continuity_id: presenceString(input.continuity_id, input.avatar_id || playerId, 80),
            display_name: presenceString(input.display_name, input.avatar_id || 'player', 80),
            position: presencePosition(input.position),
            rotation_y: Number.isFinite(Number(input.rotation_y)) ? Number(input.rotation_y) : null,
            registered_at: previous ? previous.registered_at : nowIso,
            registered_at_ms: previous ? previous.registered_at_ms : now,
            last_seen_at: nowIso,
            last_seen_ms: now,
            ttl_ms: ttl,
            expires_at_ms: now + ttl,
            heartbeat_count: previous ? previous.heartbeat_count : 0,
            registered_via: String(via || 'register'),
        };
        presenceRegistry.set(playerId, entry);
        presenceTombstones.delete(playerId);
        startPresenceSweeper();
        syncConnectedClients(now);
        state.debug.last_input_source = 'presence-register:' + playerId.slice(0, 60);
        bumpRevision();
        notifySubscribers();
        if (!previous)
            emitWowEvent(wowUserEvent('user_joined', entry));
        console.log('[Presence][' + LOCATION_ID + '] REGISTER ' + JSON.stringify({
            player_id: playerId, display_name: entry.display_name,
            via: entry.registered_via, ttl_ms: ttl, registry_size: presenceRegistry.size,
        }));
        return clone({
            ok: true,
            registered: true,
            location_id: LOCATION_ID,
            player: presenceEntrySummary(entry, now),
            ttl_ms: ttl,
            heartbeat_interval_hint_ms: PRESENCE_HEARTBEAT_HINT_MS,
            registered_player_count: presenceRegistry.size,
        });
    }
    function heartbeatPresence(body) {
        sweepPresenceRegistry('pre_heartbeat');
        const input = body && typeof body === 'object' ? body : {};
        const playerId = presenceString(input.player_id, '', 120);
        if (!playerId)
            throw new Error('player_id required');
        const entry = presenceRegistry.get(playerId);
        if (!entry) {
            if (presenceDepartedRecently(playerId)) {
                presenceResurrectionsBlocked += 1;
                console.log('[Presence][' + LOCATION_ID + '] HEARTBEAT_AFTER_DEPART_IGNORED '
                    + JSON.stringify({ player_id: playerId, registry_size: presenceRegistry.size }));
                return clone({
                    ok: true,
                    registered: false,
                    departed: true,
                    upserted: false,
                    location_id: LOCATION_ID,
                    player_id: playerId,
                    reason: 'departed_recently',
                    note: 'runtime: a heartbeat in flight at departure may not '
                        + 'resurrect a departed player; re-register explicitly to return',
                    registered_player_count: presenceRegistry.size,
                });
            }
            const out = registerPresence(body, 'heartbeat_upsert');
            out.upserted = true;
            return out;
        }
        const now = Date.now();
        entry.last_seen_at = new Date(now).toISOString();
        entry.last_seen_ms = now;
        entry.expires_at_ms = now + entry.ttl_ms;
        entry.heartbeat_count += 1;
        const position = presencePosition(input.position);
        if (position)
            entry.position = position;
        if (Number.isFinite(Number(input.rotation_y)))
            entry.rotation_y = Number(input.rotation_y);
        syncConnectedClients(now);
        return clone({
            ok: true,
            registered: true,
            location_id: LOCATION_ID,
            player: presenceEntrySummary(entry, now),
            ttl_ms: entry.ttl_ms,
            heartbeat_interval_hint_ms: PRESENCE_HEARTBEAT_HINT_MS,
            registered_player_count: presenceRegistry.size,
        });
    }
    function departPresence(body) {
        const input = body && typeof body === 'object' ? body : {};
        const playerId = presenceString(input.player_id, '', 120);
        if (!playerId)
            throw new Error('player_id required');
        const departingEntry = presenceRegistry.get(playerId) || null;
        const removed = presenceRegistry.delete(playerId);
        const now = Date.now();
        pruneTombstones(now);
        presenceTombstones.set(playerId, now + PRESENCE_DEPART_TOMBSTONE_MS);
        if (removed) {
            syncConnectedClients(now);
            state.debug.last_input_source = 'presence-depart:' + playerId.slice(0, 60);
            bumpRevision();
            notifySubscribers();
            if (departingEntry)
                emitWowEvent(wowUserEvent('user_left', departingEntry));
            console.log('[Presence][' + LOCATION_ID + '] DEPART ' + JSON.stringify({
                player_id: playerId,
                reason: presenceString(input.reason, 'unspecified', 80),
                registry_size: presenceRegistry.size,
            }));
        }
        if (presenceRegistry.size === 0)
            stopPresenceSweeper();
        return clone({
            ok: true,
            departed: removed,
            known: removed,
            location_id: LOCATION_ID,
            player_id: playerId,
            registered_player_count: presenceRegistry.size,
        });
    }
    function fabricPresenceSummary() {
        const nowMs = Date.now();
        const players = livePresenceEntries(nowMs);
        return {
            occupancy: {
                avatars: players.map(entry => presenceEntrySummary(entry, nowMs)),
                registered_player_count: players.length,
                arrival_count: state.session.arrival_count,
                live_subscriber_count: subscriberCount(),
                source: 'server-side-presence-registry',
            },
            departure_enforcement: {
                _claim: 'runtime: an explicit departure is final — a heartbeat '
                    + 'already in flight cannot upsert a departed player back into this world',
                tombstone_ms: PRESENCE_DEPART_TOMBSTONE_MS,
                active_tombstones: Array.from(presenceTombstones.values())
                    .filter(expiresAt => expiresAt > nowMs).length,
                resurrections_blocked: presenceResurrectionsBlocked,
            },
            hosted_avatar_identity: {
                avatar_id: state.avatar.avatar_id,
                continuity_id: state.avatar.continuity_id,
                display_name: state.avatar.display_name,
                note: 'hosted world avatar identity record, not a registered player',
            },
            presence_scope: 'server-side per-location player registry '
                + ': occupancy.avatars lists the players explicitly '
                + 'registered with THIS location\'s server via register/heartbeat/depart, '
                + 'TTL-expired against ghosts; one presence truth shared with observer '
                + 'views through session.connected_clients',
            registry: {
                registered_player_count: players.length,
                ttl_default_ms: PRESENCE_TTL_DEFAULT_MS,
                ttl_bounds_ms: { min: PRESENCE_TTL_MIN_MS, max: PRESENCE_TTL_MAX_MS },
                heartbeat_interval_hint_ms: PRESENCE_HEARTBEAT_HINT_MS,
                register_endpoint: '/fabric/presence/register',
                heartbeat_endpoint: '/fabric/presence/heartbeat',
                depart_endpoint: '/fabric/presence/depart',
                mutation_rule: 'registration/heartbeat/departure are explicit player '
                    + 'session actions POSTed to the player\'s OWN active server; '
                    + 'GET reads never mutate',
            },
            captured_at: new Date().toISOString(),
            ttl_ms: 4000,
        };
    }
    function getFabricPresence() {
        return clone(Object.assign({
            ok: true,
            location_id: LOCATION_ID,
            world_id: WORLD_ID,
            fabric_id: 'local-fabric-' + LOCATION_ID,
        }, fabricPresenceSummary(), {
            proof_boundary: getWowProofBoundary(),
        }, fabricRegionBoundary()));
    }
    const FABRIC_REGION_MIN_RADIUS_M = 1.0;
    const FABRIC_REGION_MAX_RADIUS_M = 12.0;
    function fabricRegionScan(anchorPortalId, radiusM) {
        const portal = state.portals.find(entry => entry.portal_id === String(anchorPortalId || ''));
        if (!portal)
            throw new Error('unknown anchor portal ' + anchorPortalId + ' on ' + LOCATION_ID);
        const requestedRadius = readNumber(radiusM, 5.0);
        const radius = Math.max(FABRIC_REGION_MIN_RADIUS_M, Math.min(FABRIC_REGION_MAX_RADIUS_M, requestedRadius));
        const anchor = fabricVec3(portal.trigger && portal.trigger.position, [2.8, 0, -2.8]);
        const included = [];
        const beyond = [];
        for (const obj of state.scene_objects) {
            const dx = (obj.position[0] || 0) - anchor[0];
            const dz = (obj.position[2] || 0) - anchor[2];
            const distance = Math.hypot(dx, dz);
            const entry = Object.assign(clone(obj), {
                distance_from_anchor_m: Number(distance.toFixed(3)),
            });
            if (distance <= radius)
                included.push(entry);
            else
                beyond.push(entry);
        }
        return { portal, requestedRadius, radius, anchor, included, beyond };
    }
    function fabricRegionAvatarsInCircle(scan) {
        const nowMs = Date.now();
        const inside = [];
        let unpositioned = 0;
        for (const entry of livePresenceEntries(nowMs)) {
            const summary = presenceEntrySummary(entry, nowMs);
            if (!summary.position) {
                unpositioned += 1;
                continue;
            }
            const dx = summary.position[0] - scan.anchor[0];
            const dz = summary.position[2] - scan.anchor[2];
            const distance = Math.hypot(dx, dz);
            if (distance > scan.radius)
                continue;
            inside.push(Object.assign(summary, {
                entity_kind: 'avatar',
                distance_from_anchor_m: Number(distance.toFixed(3)),
                inside_destination_circle: true,
            }));
        }
        return {
            avatars: inside,
            avatars_in_circle: inside.length,
            avatars_without_position: unpositioned,
            circle: {
                type: 'portal_neighborhood_radius',
                center: scan.anchor.slice(),
                radius_m: scan.radius,
            },
            source: 'presence-registry-read-time-projection',
            read_only: true,
            note: 'runtime — registered players inside the '
                + 'destination-side loading circle at the widened matching radius; '
                + 'live read-time projection (positions from register/heartbeat), '
                + 'excluded from chunk entity/byte budgets and from region totals',
        };
    }
    function getFabricRegion(anchorPortalId, radiusM) {
        const scan = fabricRegionScan(anchorPortalId, radiusM);
        const { portal, requestedRadius, radius, anchor } = scan;
        const entities = scan.included;
        const excluded = scan.beyond.length;
        const avatarsInCircle = fabricRegionAvatarsInCircle(scan);
        return clone(Object.assign({
            ok: true,
            location_id: LOCATION_ID,
            world_id: WORLD_ID,
            fabric_id: 'local-fabric-' + LOCATION_ID,
            version: state.attach_point.version,
            region: {
                type: 'portal_neighborhood_radius',
                anchor_portal_id: portal.portal_id,
                center: anchor.slice(),
                radius_m: radius,
                requested_radius_m: requestedRadius,
                radius_clamped: radius !== requestedRadius,
                includes_avatars_within_circle: true,
            },
            entities: entities,
            portal: demoPortalPose(portal),
            spawn: getFabricSpawnPose(),
            avatars: avatarsInCircle,
            totals: {
                fabric_entities: state.scene_objects.length,
                region_entities: entities.length,
                excluded_entities: excluded,
                truncated: false,
                avatars_in_circle: avatarsInCircle.avatars_in_circle,
            },
            presence: fabricPresenceSummary(),
            freshness: { captured_at: new Date().toISOString(), ttl_ms: 15000 },
            proof_boundary: getWowProofBoundary(),
        }, fabricRegionBoundary()));
    }
    const FABRIC_REGION_BAND_COUNT = 3;
    const FABRIC_REGION_BAND_LABELS = ['near', 'mid', 'far'];
    const FABRIC_REGION_BEYOND_LABEL = 'beyond_roi';
    const FABRIC_REGION_BAND_TTLS_MS = { near: 20000, mid: 40000, far: 60000, beyond_roi: 90000 };
    const FABRIC_REGION_SERVER_MAX_ENTITIES = 64;
    const FABRIC_REGION_SERVER_MAX_BYTES = 65536;
    const FABRIC_REGION_DEFAULT_MAX_ENTITIES = 24;
    const FABRIC_REGION_DEFAULT_MIN_BYTES = 256;
    const FABRIC_REGION_DEFAULT_MAX_BYTES = 16384;
    function fabricBandTtlMs(bandLabel) {
        const base = FABRIC_REGION_BAND_TTLS_MS[bandLabel] || 60000;
        const raw = process.env.OSL_FABRIC_REGION_TTL_OVERRIDES;
        if (!raw)
            return base;
        try {
            const parsed = JSON.parse(raw);
            const forLocation = parsed && typeof parsed === 'object' ? parsed[LOCATION_ID] : null;
            const hit = forLocation && typeof forLocation === 'object' ? Number(forLocation[bandLabel]) : NaN;
            return Number.isFinite(hit) && hit >= 250 ? hit : base;
        }
        catch (e) {
            return base;
        }
    }
    function fabricRegionBands(scan, scope) {
        const radius = scan.radius;
        const step = radius / FABRIC_REGION_BAND_COUNT;
        const bands = [];
        for (let i = 0; i < FABRIC_REGION_BAND_COUNT; i += 1) {
            bands.push({
                band_index: i,
                band_label: FABRIC_REGION_BAND_LABELS[i],
                range_m: [Number((i * step).toFixed(3)), Number(((i + 1) * step).toFixed(3))],
                entities: [],
            });
        }
        if (scope === 'full') {
            bands.push({
                band_index: FABRIC_REGION_BAND_COUNT,
                band_label: FABRIC_REGION_BEYOND_LABEL,
                range_m: [Number(radius.toFixed(3)), null],
                entities: [],
            });
        }
        const sorted = scan.included.slice().sort((a, b) => a.distance_from_anchor_m - b.distance_from_anchor_m
            || String(a.object_id).localeCompare(String(b.object_id)));
        for (const entry of sorted) {
            const idx = Math.min(FABRIC_REGION_BAND_COUNT - 1, Math.floor(entry.distance_from_anchor_m / step));
            bands[idx].entities.push(entry);
        }
        if (scope === 'full') {
            const beyondSorted = scan.beyond.slice().sort((a, b) => a.distance_from_anchor_m - b.distance_from_anchor_m
                || String(a.object_id).localeCompare(String(b.object_id)));
            bands[FABRIC_REGION_BAND_COUNT].entities = beyondSorted;
        }
        return bands;
    }
    function fabricRegionEntityBytes(entity) {
        return Buffer.byteLength(JSON.stringify(entity), 'utf8');
    }
    function getFabricRegionChunk(anchorPortalId, radiusM, opts) {
        const options = opts || {};
        const scope = options.scope == null || options.scope === '' ? 'roi' : String(options.scope);
        if (scope !== 'roi' && scope !== 'full')
            throw new Error('invalid scope "' + scope + '" (roi|full)');
        const maxEntities = Math.max(1, Math.min(FABRIC_REGION_SERVER_MAX_ENTITIES, Math.floor(options.max_entities == null || options.max_entities === ''
            ? FABRIC_REGION_DEFAULT_MAX_ENTITIES
            : readNumber(options.max_entities, FABRIC_REGION_DEFAULT_MAX_ENTITIES))));
        const maxBytes = Math.max(FABRIC_REGION_DEFAULT_MIN_BYTES, Math.min(FABRIC_REGION_SERVER_MAX_BYTES, Math.floor(options.max_bytes == null || options.max_bytes === ''
            ? FABRIC_REGION_DEFAULT_MAX_BYTES
            : readNumber(options.max_bytes, FABRIC_REGION_DEFAULT_MAX_BYTES))));
        const scan = fabricRegionScan(anchorPortalId, radiusM == null || radiusM === '' ? 5.0 : radiusM);
        const bands = fabricRegionBands(scan, scope);
        let bandIndex = 0;
        let offset = 0;
        let cursorProvided = false;
        if (options.cursor != null && options.cursor !== '') {
            cursorProvided = true;
            const match = /^(\d+):(\d+)$/.exec(String(options.cursor));
            if (!match)
                throw new Error('invalid cursor "' + options.cursor + '" (expected <band>:<offset>)');
            bandIndex = Number(match[1]);
            offset = Number(match[2]);
            if (bandIndex >= bands.length)
                throw new Error('invalid cursor band ' + bandIndex + ' (scope ' + scope + ' has ' + bands.length + ' bands)');
            const bandLen = bands[bandIndex].entities.length;
            if (offset !== 0 && offset >= bandLen)
                throw new Error('invalid cursor offset ' + offset + ' (band ' + bandIndex + ' has ' + bandLen + ' entities)');
        }
        if (!cursorProvided) {
            while (bandIndex < bands.length - 1 && bands[bandIndex].entities.length === 0)
                bandIndex += 1;
        }
        const band = bands[bandIndex];
        const chunkEntities = [];
        let chunkBytes = 0;
        let truncationReason = null;
        let byteBudgetExceededBySingleEntity = false;
        for (let i = offset; i < band.entities.length; i += 1) {
            const entity = band.entities[i];
            const entityBytes = fabricRegionEntityBytes(entity);
            if (chunkEntities.length >= maxEntities) {
                truncationReason = 'entity_budget';
                break;
            }
            if (chunkEntities.length > 0 && chunkBytes + entityBytes > maxBytes) {
                truncationReason = 'byte_budget';
                break;
            }
            if (chunkEntities.length === 0 && entityBytes > maxBytes)
                byteBudgetExceededBySingleEntity = true;
            chunkEntities.push(entity);
            chunkBytes += entityBytes;
        }
        const nextOffset = offset + chunkEntities.length;
        let continuation = null;
        if (truncationReason) {
            continuation = {
                cursor: bandIndex + ':' + nextOffset,
                next_band_index: bandIndex,
                next_band_label: band.band_label,
                remaining_entities_in_band: band.entities.length - nextOffset,
            };
        }
        else {
            let nextBand = bandIndex + 1;
            while (nextBand < bands.length && bands[nextBand].entities.length === 0)
                nextBand += 1;
            if (nextBand < bands.length) {
                truncationReason = 'band_boundary';
                continuation = {
                    cursor: nextBand + ':0',
                    next_band_index: nextBand,
                    next_band_label: bands[nextBand].band_label,
                    remaining_entities_in_band: bands[nextBand].entities.length,
                };
            }
        }
        const truncated = continuation !== null;
        const nowIso = new Date().toISOString();
        const ttlMs = fabricBandTtlMs(band.band_label);
        const scopeEntities = scope === 'full'
            ? scan.included.length + scan.beyond.length
            : scan.included.length;
        const response = {
            ok: true,
            location_id: LOCATION_ID,
            world_id: WORLD_ID,
            fabric_id: 'local-fabric-' + LOCATION_ID,
            version: state.attach_point.version,
            region: {
                type: 'portal_neighborhood_radius_chunked',
                anchor_portal_id: scan.portal.portal_id,
                center: scan.anchor.slice(),
                radius_m: scan.radius,
                requested_radius_m: scan.requestedRadius,
                radius_clamped: scan.radius !== scan.requestedRadius,
                scope: scope,
                bands: bands.map(b => ({
                    band_index: b.band_index,
                    band_label: b.band_label,
                    range_m: b.range_m,
                    entity_count: b.entities.length,
                    ttl_ms: fabricBandTtlMs(b.band_label),
                })),
            },
            chunk: {
                chunk_id: scan.portal.portal_id + '#' + scope + '#' + bandIndex + ':' + offset,
                band_index: bandIndex,
                band_label: band.band_label,
                band_range_m: band.range_m,
                entities: chunkEntities,
                entity_count: chunkEntities.length,
                byte_size: chunkBytes,
                byte_size_rule: 'sum of per-entity UTF-8 JSON bytes (measured server-side at serialization)',
                ...(byteBudgetExceededBySingleEntity
                    ? { byte_budget_exceeded_by_single_entity: true }
                    : {}),
                freshness: {
                    generated_at: nowIso,
                    ttl_ms: ttlMs,
                    expires_at: new Date(Date.now() + ttlMs).toISOString(),
                },
            },
            continuation: continuation,
            truncated: truncated,
            truncation_reason: truncated ? truncationReason : null,
            budget: {
                max_entities: maxEntities,
                max_bytes: maxBytes,
                server_max_entities: FABRIC_REGION_SERVER_MAX_ENTITIES,
                server_max_bytes: FABRIC_REGION_SERVER_MAX_BYTES,
            },
            totals: {
                fabric_entities: state.scene_objects.length,
                region_entities: scan.included.length,
                excluded_entities: scan.beyond.length,
                scope_entities: scopeEntities,
                truncated: truncated,
            },
            freshness: { captured_at: nowIso, ttl_ms: ttlMs },
            proof_boundary: getWowProofBoundary(),
        };
        if (!cursorProvided) {
            response.portal = demoPortalPose(scan.portal);
            response.spawn = getFabricSpawnPose();
            response.presence = fabricPresenceSummary();
            response.avatars = fabricRegionAvatarsInCircle(scan);
            response.region.includes_avatars_within_circle = true;
        }
        return clone(Object.assign(response, fabricRegionBoundary(), {
            chunking_standard_conformance: false,
        }));
    }
    function getFabricRegionTilesetHypothesis(anchorPortalId, radiusM) {
        const scan = fabricRegionScan(anchorPortalId, radiusM == null || radiusM === '' ? 5.0 : radiusM);
        const bands = fabricRegionBands(scan, 'full');
        const anchor = scan.anchor;
        const maxObserved = bands.reduce((acc, b) => {
            const last = b.entities.length ? b.entities[b.entities.length - 1] : null;
            return last ? Math.max(acc, last.distance_from_anchor_m) : acc;
        }, scan.radius);
        return clone(Object.assign({
            ok: true,
            location_id: LOCATION_ID,
            world_id: WORLD_ID,
            fabric_id: 'local-fabric-' + LOCATION_ID,
            hypothesis_artifact: true,
            three_d_tiles_shaped: true,
            three_d_tiles_conformance: false,
            purpose: 'runtime labeled hypothesis artifact — expresses the '
                + '/fabric/region distance-band chunk layout in an OGC-3D-Tiles-SHAPED '
                + 'structure (bounding volumes + coarse geometric error + ADD refinement) '
                + 'as a concrete input for future standards conversation. NOT a 3D Tiles '
                + 'tileset; no conformance is claimed or implied.',
            asset_shape: { version_shape: '1.1-shaped', tileset_shape_only: true },
            geometricError: Number((maxObserved * 2).toFixed(3)),
            root: {
                boundingVolume: { sphere: [anchor[0], anchor[1], anchor[2], Number(maxObserved.toFixed(3))] },
                geometricError: Number(scan.radius.toFixed(3)),
                refine: 'ADD',
                children: bands.map(b => {
                    const outer = b.range_m[1] != null ? b.range_m[1] : Number(maxObserved.toFixed(3));
                    return {
                        boundingVolume: { sphere: [anchor[0], anchor[1], anchor[2], outer] },
                        geometricError: Number((outer / FABRIC_REGION_BAND_COUNT).toFixed(3)),
                        content: {
                            uri: '/fabric/region?anchor_portal_id='
                                + encodeURIComponent(scan.portal.portal_id)
                                + '&chunked=1&scope=full&cursor=' + b.band_index + ':0',
                        },
                        extensions: {
                            osl_local_band: {
                                band_index: b.band_index,
                                band_label: b.band_label,
                                range_m: b.range_m,
                                entity_count: b.entities.length,
                                ttl_ms: fabricBandTtlMs(b.band_label),
                            },
                        },
                    };
                }),
            },
            proof_boundary: getWowProofBoundary(),
        }, fabricRegionBoundary(), { chunking_standard_conformance: false }));
    }
    function portalFrameYawRad() {
        const preset = FABRIC_PORTAL_FRAME_PRESETS[LOCATION_ID] || {};
        const f = fabricNormalizeVec3(preset.forward || [0, 0, 1], [0, 0, 1]);
        return Math.hypot(f[0], f[2]) > 1e-6 ? Math.atan2(f[0], f[2]) : 0;
    }
    function getWowPortalResource(idOrAlias) {
        const hit = resolveWowPortal(idOrAlias);
        if (!hit)
            return null;
        const { portal, wowId } = hit;
        return {
            id: wowId,
            geoPose: wowGeoPoseFromLocal(portal.trigger.position, portalFrameYawRad(), 0),
            label: portal.label || ('Portal ' + portal.portal_id),
            destination: portalDestination(portal),
            webofworlds_extension: wowPortalExtension(portal, wowId),
            proof_boundary: getWowProofBoundary(),
        };
    }
    function getWowPortal(portalId) {
        if (/^\d+$/.test(String(portalId == null ? '' : portalId)))
            return getWowPortalResource(portalId);
        const hit = resolveWowPortal(portalId);
        if (!hit)
            return null;
        const { portal, wowId } = hit;
        return {
            id: portal.portal_id,
            label: portal.label || ('Portal ' + portal.portal_id),
            geoPose: {
                position: {
                    x: portal.trigger.position[0],
                    y: portal.trigger.position[1],
                    z: portal.trigger.position[2],
                },
                angles: { yaw: 0, pitch: 0, roll: 0 },
                orientation: { x: 0, y: 0, z: 0, w: 1 },
                radius_m: readNumber(portal.trigger.radius_m, 0),
            },
            destination: portalDestination(portal),
            webofworlds_extension: wowPortalExtension(portal, wowId),
            proof_boundary: getWowProofBoundary(),
        };
    }
    function getWowUser(userId) {
        const a = state.avatar;
        const accepted = [String(WOW_LOCAL_USER_ID), a.avatar_id, a.continuity_id, 'me']
            .filter((alias, index, all) => all.indexOf(alias) === index);
        if (!userId || accepted.indexOf(String(userId)) !== -1) {
            const t = a.transform;
            return {
                id: WOW_LOCAL_USER_ID,
                name: a.display_name,
                AvatarURI: '',
                geoPose: wowGeoPoseFromLocal(t.position, t.rotation_y, 0),
                webofworlds_extension: {
                    avatar_id: a.avatar_id,
                    continuity_id: a.continuity_id,
                    display_name: a.display_name,
                    accepted_aliases: accepted,
                    local_transform: {
                        position: t.position.slice(),
                        rotation_y: t.rotation_y,
                        orientation: t.orientation.slice(),
                        scale: t.scale.slice(),
                    },
                    geopose_mapping: WOW_GEOPOSE_MAPPING,
                    source_session_id: a.handoff_context ? a.handoff_context.source_session_id : SESSION_ID,
                    source_world_id: a.handoff_context ? a.handoff_context.source_world_id : WORLD_ID,
                    source_location_id: a.handoff_context ? a.handoff_context.source_location_id : LOCATION_ID,
                    handoff_context: a.handoff_context,
                },
                proof_boundary: getWowProofBoundary(),
            };
        }
        return getWowPresenceUser(userId);
    }
    function getWowPresenceUser(idOrPlayerId) {
        const key = String(idOrPlayerId == null ? '' : idOrPlayerId);
        if (!key)
            return null;
        const nowMs = Date.now();
        const entry = livePresenceEntries(nowMs)
            .find(e => String(e.wow_user_id) === key || e.player_id === key);
        if (!entry)
            return null;
        const pos = Array.isArray(entry.position) ? entry.position : [0, 0, 0];
        const yaw = Number.isFinite(entry.rotation_y) ? entry.rotation_y : 0;
        return {
            id: entry.wow_user_id,
            name: entry.display_name,
            AvatarURI: '',
            geoPose: wowGeoPoseFromLocal(pos, yaw, 0),
            webofworlds_extension: {
                source: 'presence-registry',
                player_id: entry.player_id,
                client_id: entry.client_id,
                avatar_id: entry.avatar_id,
                continuity_id: entry.continuity_id,
                display_name: entry.display_name,
                registered_at: entry.registered_at,
                last_seen_at: entry.last_seen_at,
                ttl_ms: entry.ttl_ms,
                expires_in_ms: Math.max(0, entry.expires_at_ms - nowMs),
                local_transform: {
                    position: pos.slice(),
                    rotation_y: yaw,
                },
                geopose_mapping: WOW_GEOPOSE_MAPPING,
                presence_scope: 'server-side-ttl-registry (local occupancy truth; not networked)',
            },
            proof_boundary: getWowProofBoundary(),
        };
    }
    async function getWowUserSigned(userId) {
        const user = getWowUser(userId);
        if (!user)
            return null;
        const content = {
            name: user.name,
            age: WOW_OPEN_USER_MANIFEST_DEMO_AGE,
            avatarAssetURI: user.AvatarURI || '',
        };
        try {
            const signed = await umSignOpenUserManifest(content);
            return {
                ...user,
                open_user_manifest: signed,
                open_user_manifest_label: UM_IDENTITY_NONCANONICAL_LABEL,
            };
        }
        catch (e) {
            return {
                ...user,
                open_user_manifest: { ...content, signature: null },
                open_user_manifest_label: 'UNSIGNED / UNVERIFIED — UM identity signer unavailable ('
                    + ((e && e.message) || 'error') + '); degraded honestly.',
            };
        }
    }
    function getWowView(viewId) {
        const accepted = [String(WOW_PLAYER_VIEW_ID), 'player', 'player-camera'];
        if (viewId && accepted.indexOf(String(viewId)) === -1)
            return null;
        const t = state.avatar.transform;
        const yaw = readNumber(t.rotation_y, 0);
        const p = t.position;
        const rig = WOW_VIEW_CAMERA_RIG;
        const forward = [Math.sin(yaw), 0, Math.cos(yaw)];
        const cameraPosition = [
            (Number(p[0]) || 0) - forward[0] * rig.follow_distance_m,
            (Number(p[1]) || 0) + rig.follow_height_m,
            (Number(p[2]) || 0) - forward[2] * rig.follow_distance_m,
        ];
        const lookTarget = [
            Number(p[0]) || 0,
            (Number(p[1]) || 0) + rig.look_target_height_m,
            Number(p[2]) || 0,
        ];
        const pitchRad = Math.atan2(rig.look_target_height_m - rig.follow_height_m, rig.follow_distance_m);
        return {
            id: WOW_PLAYER_VIEW_ID,
            geoPose: wowGeoPoseFromLocal(cameraPosition, yaw, pitchRad),
            webofworlds_extension: {
                view_kind: 'player-view-camera',
                mode: rig.mode,
                derivation: 'server-side projection of the live presence pose through the '
                    + 'PlayerView camera rig constants (matches the browser runtime '
                    + 'PLAYER_CAMERA_DEFAULT: follow 3.5 m, height 2.1 m, look target 1.35 m)',
                rig: {
                    follow_distance_m: rig.follow_distance_m,
                    follow_height_m: rig.follow_height_m,
                    look_target_height_m: rig.look_target_height_m,
                },
                follows_user_id: WOW_LOCAL_USER_ID,
                follows_avatar_id: state.avatar.avatar_id,
                accepted_aliases: accepted,
                local_camera: {
                    position: cameraPosition.map(entry => Number(entry.toFixed(4))),
                    look_target: lookTarget.map(entry => Number(entry.toFixed(4))),
                    yaw_radians: Number(yaw.toFixed(6)),
                    pitch_radians: Number(pitchRad.toFixed(6)),
                },
                geopose_mapping: WOW_GEOPOSE_MAPPING,
            },
            proof_boundary: getWowProofBoundary(),
        };
    }
    const SPATIAL_ID = WORLD_ID;
    const SPATIAL_ACCEPTED_IDS = [WORLD_ID, LOCATION_ID, 'default', 'world'];
    function buildSpatialSeedNodes() {
        const children = [];
        for (const obj of state.scene_objects) {
            children.push({
                label: obj.label || obj.object_id,
                names: [obj.object_id, obj.label, String(obj.shape || 'box')]
                    .filter((name, index, all) => name && all.indexOf(name) === index),
                localTransform: translationMatrix(obj.position),
                spatialAssetURI: obj.spatial_asset_uri || ('osl-primitive:'
                    + encodeURIComponent(String(obj.shape || 'box'))
                    + '?size_m=' + (Number(obj.size_m) || 0)),
                appearanceURI: obj.color ? 'osl-color:' + String(obj.color).replace('#', '') : undefined,
                webofworlds_extension: obj.authored_wow_content
                    ? Object.assign({ authored_wow_content: true, authored_node_id: obj.node_id }, obj.webofworlds_extension || {})
                    : undefined,
            });
        }
        state.portals.forEach((portal, index) => {
            const wowId = index + 1;
            const trigger = portal.trigger || {};
            const targetWorldId = portal.target_world_id || null;
            children.push({
                label: portal.label || ('Portal ' + portal.portal_id),
                names: [portal.portal_id, 'portal', 'wow-portal-' + wowId],
                localTransform: translationMatrix(trigger.position),
                spatialAssetURI: 'osl-portal:?' + [
                    'target_world_id=' + encodeURIComponent(portal.target_world_id || ''),
                    'target_location_id=' + encodeURIComponent(portal.target_location_id || ''),
                    'target_base_url=' + encodeURIComponent(portal.target_base_url || ''),
                    'target_portal_id=' + encodeURIComponent(portal.target_portal_id || ''),
                ].join('&'),
                webofworlds_extension: {
                    role: 'portal',
                    portal_id: portal.portal_id,
                    portal_resource: '/wow/portal/' + wowId,
                    target_spatial_id: targetWorldId,
                    target_spatial_graph_endpoint: targetWorldId ? '/wow/spatial/' + targetWorldId : null,
                    target_world_id: targetWorldId,
                    target_location_id: portal.target_location_id || null,
                    target_base_url: portal.target_base_url || null,
                    traversal_mode: portalTraversalRule(portal).mode,
                    reciprocal: portalReciprocalRule(portal),
                    note: 'LABELED x-osl-extension. Destination is a composition-graph '
                        + 'reference to the sibling world\'s /wow/spatial graph — NOT a canonical '
                        + 'Node field, NOT a signed .msf reference. Rides legally on the open '
                        + 'canonical Node; surfaced by runtime.',
                },
            });
        });
        return {
            root: {
                label: TITLE + ' - spatial composition graph',
                names: [WORLD_ID, LOCATION_ID],
                localTransform: translationMatrix([0, 0, 0]),
            },
            nodes: children,
        };
    }
    const spatialStore = createSpatialGraphStore({
        spatialId: SPATIAL_ID,
        acceptedIds: SPATIAL_ACCEPTED_IDS,
        seedBuilder: buildSpatialSeedNodes,
    });
    function spatialResolve(spatialID) {
        return spatialStore.matches(spatialID) ? spatialStore : null;
    }
    function getSpatialGraphRoot(spatialID) {
        const store = spatialResolve(spatialID);
        return store ? store.getRoot() : null;
    }
    function getSpatialDescriptor(spatialID) {
        const store = spatialResolve(spatialID);
        if (!store)
            return null;
        const root = store.getRoot();
        const rootNodeID = root ? root.id : 0;
        return {
            id: store.spatialId,
            rootNodeID: rootNodeID,
            geoPose: wowGeoPoseFromLocal([0, 0, 0], 0, 0),
            webofworlds_extension: {
                x_osl_extension: true,
                spatial_id: store.spatialId,
                accepted_ids: store.acceptedIds,
                root_node_endpoint: '/wow/spatial/' + store.spatialId + '/node/' + rootNodeID,
                id_type_divergence: 'D4 — the standard types Spatial.id `number`; OSL serves the STRING graph '
                    + 'address in the canonical field (same divergence as the /wow/spatial path param).',
                note: 'CANONICAL Spatial descriptor. It POINTS AT the root node via rootNodeID; the root node '
                    + 'ITSELF is at root_node_endpoint. Served on the versioned opt-in (X-OSL-WoW-Spatial-Form: '
                    + 'descriptor, or ?form=descriptor). The DEFAULT GET keeps returning the root node so existing '
                    + 'clients are not broken (declared, versioned).',
            },
            proof_boundary: getWowProofBoundary(),
        };
    }
    function getSpatialNode(spatialID, nodeId) {
        const store = spatialResolve(spatialID);
        return store ? store.getNode(nodeId) : null;
    }
    function createSpatialNodes(spatialID, parentId, incoming, opts) {
        const store = spatialResolve(spatialID);
        if (!store)
            return { ok: false, status: 404, error: 'spatial_graph_not_found', spatialID: spatialID };
        const r = store.createChildren(parentId, incoming, opts);
        if (r.ok) {
            state.debug.last_input_source = 'wow-spatial-node-create';
            bumpRevision();
            notifySubscribers();
            for (const node of (r.value || []))
                emitWowEvent(wowNodeEvent('node_created', store.spatialId, node));
        }
        return r;
    }
    function updateSpatialNode(spatialID, nodeId, node) {
        const store = spatialResolve(spatialID);
        if (!store)
            return { ok: false, status: 404, error: 'spatial_graph_not_found', spatialID: spatialID };
        const r = store.updateNode(nodeId, node);
        if (r.ok) {
            state.debug.last_input_source = 'wow-spatial-node-update';
            bumpRevision();
            notifySubscribers();
            emitWowEvent(wowNodeEvent('node_updated', store.spatialId, r.value));
        }
        return r;
    }
    function deleteSpatialNode(spatialID, nodeId) {
        const store = spatialResolve(spatialID);
        if (!store)
            return { ok: false, status: 404, error: 'spatial_graph_not_found', spatialID: spatialID };
        const r = store.deleteNode(nodeId);
        if (r.ok) {
            state.debug.last_input_source = 'wow-spatial-node-delete';
            bumpRevision();
            notifySubscribers();
            for (const id of ((r.value && r.value.deleted) || []))
                emitWowEvent(wowNodeEvent('node_deleted', store.spatialId, { id: id }));
        }
        return r;
    }
    function fabricRound(value, digits) {
        const n = Number(value);
        return Number.isFinite(n) ? Number(n.toFixed(digits)) : 0;
    }
    function fabricVec3(value, fallback) {
        const src = Array.isArray(value) ? value : fallback;
        return [
            Number(src && src[0]) || 0,
            Number(src && src[1]) || 0,
            Number(src && src[2]) || 0,
        ];
    }
    function fabricRoundVec3(value, digits) {
        return fabricVec3(value, [0, 0, 0]).map(entry => fabricRound(entry, digits));
    }
    function fabricNormalizeVec3(value, fallback) {
        const v = fabricVec3(value, fallback || [0, 0, 1]);
        const length = Math.hypot(v[0], v[1], v[2]);
        if (length <= 1e-6)
            return fabricVec3(fallback || [0, 0, 1], [0, 0, 1]);
        return v.map(entry => entry / length);
    }
    function getFabricSpawnPose() {
        if (cfg.entry_spawn && Array.isArray(cfg.entry_spawn.position)) {
            const position = fabricVec3(cfg.entry_spawn.position, [0, 0, 0]);
            const rotationY = readNumber(cfg.entry_spawn.rotation_y, 0);
            return {
                position: position,
                rotation_y: rotationY,
                rotation: [0, Math.sin(rotationY / 2), 0, Math.cos(rotationY / 2)],
            };
        }
        const portal = state.portals[0] || null;
        const triggers = state.portals
            .map(p => fabricVec3(p.trigger && p.trigger.position, null))
            .filter(Boolean);
        const trigger = triggers.length
            ? [
                triggers.reduce((s, t) => s + t[0], 0) / triggers.length,
                triggers.reduce((s, t) => s + t[1], 0) / triggers.length,
                triggers.reduce((s, t) => s + t[2], 0) / triggers.length,
            ]
            : fabricVec3(portal && portal.trigger ? portal.trigger.position : null, [2.8, 0, -2.8]);
        const preset = FABRIC_PORTAL_FRAME_PRESETS[LOCATION_ID] || {};
        const forward = fabricRoundVec3(fabricNormalizeVec3(preset.forward || [0, 0, 1], [0, 0, 1]), 6);
        const groundCenter = fabricRoundVec3([trigger[0], 0, trigger[2]], 4);
        const spawnDistance = Math.max(FABRIC_SPAWN_CLEARANCE_M, FABRIC_PORTAL_TRIGGER_DEPTH_M + FABRIC_SPAWN_CLEARANCE_M);
        const position = [
            groundCenter[0] + forward[0] * spawnDistance,
            groundCenter[1] + forward[1] * spawnDistance,
            groundCenter[2] + forward[2] * spawnDistance,
        ];
        position[1] = 0;
        return { position, rotation_y: 0, rotation: [0, 0, 0, 1] };
    }
    function getFabricManifest() {
        const portal = state.portals[0] || null;
        const spawn = getFabricSpawnPose();
        const ownKey = LOCATION_ID.replace('location-', '');
        const children = [
            {
                Head: { Self: 'P-1' },
                Name: 'Avatar Spawn',
                Transform: { Position: spawn.position.slice() },
            },
        ];
        let nextSelf = 2;
        for (let index = 0; index < state.portals.length; index += 1) {
            const entry = state.portals[index];
            const triggerPosition = fabricVec3(entry.trigger && entry.trigger.position, [2.8, 0, -2.8]);
            const targetKey = String(entry.target_location_id || '').replace('location-', '');
            const targetFabricUrl = targetKey ? '/api/' + targetKey + '/fabric.json' : null;
            children.push({
                Head: { Self: 'P-' + nextSelf },
                Name: entry.label || ('Portal to ' + (entry.target_location_id || 'unknown')),
                Type: { bSubtype: 255 },
                Resource: { sReference: targetFabricUrl },
                Transform: { Position: triggerPosition.slice() },
                SpatialFabricAddress: spatialFabricAddressForPortal(entry),
                Zones: portalZones(entry),
                Traversal: portalTraversalRule(entry),
            });
            nextSelf += 1;
            children.push({
                Head: { Self: 'P-' + nextSelf },
                Name: index === 0 ? 'Portal Trigger' : 'Portal Trigger (' + entry.portal_id + ')',
                Resource: {
                    sReference: index === 0
                        ? 'action:portal-' + ownKey + '-trigger'
                        : 'action:portal-' + ownKey + '-' + entry.portal_id + '-trigger',
                },
                Transform: { Position: triggerPosition.slice() },
                Bound: { Max: FABRIC_TRIGGER_BOUND_MAX.slice() },
            });
            nextSelf += 1;
        }
        return {
            container: LOCATION_ID,
            services: [
                { name: 'wow', type: 'web-of-worlds', endpoint: '/wow/world' },
                { name: 'wow-location', type: 'web-of-worlds', endpoint: '/wow/location', default_id: LOCATION_ID },
                { name: 'wow-user', type: 'web-of-worlds', endpoint: '/wow/user/{userId}', default_id: WOW_LOCAL_USER_ID },
                { name: 'wow-portal', type: 'web-of-worlds', endpoint: '/wow/portal/{portalId}', default_id: portal ? 1 : null },
                { name: 'wow-view', type: 'web-of-worlds', endpoint: '/wow/view/{viewId}', default_id: WOW_PLAYER_VIEW_ID },
                { name: 'wow-spatial', type: 'web-of-worlds', endpoint: '/wow/spatial/{spatialID}', default_id: SPATIAL_ID },
                { name: 'wow-spatial-node', type: 'web-of-worlds', endpoint: '/wow/spatial/{spatialID}/node/{nodeId}', default_id: SPATIAL_ID },
            ].concat(AUTHORED_WOW_GRAPH ? [{
                    name: 'wow-authored-graph',
                    type: 'web-of-worlds',
                    endpoint: '/wow/graph',
                    default_id: SPATIAL_ID,
                }] : []),
            modules: [],
            primary: {
                camera: {
                    position: spawn.position.slice(),
                    rotation: spawn.rotation.slice(),
                },
                background: FABRIC_BACKGROUND_RRGGBB,
            },
            data: {
                Head: { Self: 'R-0' },
                Name: 'Root',
                Children: children,
            },
            trust: {
                signed: false,
                format: 'plain-json',
                note: 'unsigned local demonstration fabric; JWS signing not implemented (claim boundary)',
            },
            proof_boundary: getWowProofBoundary(),
        };
    }
    function applyMovement(raw) {
        const input = raw && typeof raw === 'object' ? raw : {};
        const fwd = readNumber(input.forward, 0);
        const strafe = readNumber(input.strafe, 0);
        const turn = readNumber(input.turn, 0);
        state.avatar.transform.rotation_y += turn * 0.15;
        const yaw = state.avatar.transform.rotation_y;
        const speed = 0.2;
        state.avatar.transform.position[0] += (Math.sin(yaw) * fwd + Math.cos(yaw) * strafe) * speed;
        state.avatar.transform.position[2] += (Math.cos(yaw) * fwd - Math.sin(yaw) * strafe) * speed;
        state.debug.last_input_source = String(input.source || 'movement_input').slice(0, 80);
        bumpRevision();
        notifySubscribers();
        return getState();
    }
    function recordPortalExitIntent(portalId, playerId) {
        const portal = state.portals.find(entry => entry.portal_id === portalId) || state.portals[0];
        if (!portal)
            throw new Error('no portal configured on ' + LOCATION_ID);
        const presenceDeparture = playerId
            ? departPresence({ player_id: playerId, reason: 'portal_exit_intent' })
            : null;
        const now = new Date().toISOString();
        const handoffId = LOCATION_ID + '-' + Date.now() + '-' + Math.floor(Math.random() * 1000000);
        const packet = {
            ok: true,
            handoff_id: handoffId,
            behavior: 'application-level-handoff-around-teleportxr',
            native_teleportxr_teleport: false,
            created_at: now,
            source: {
                location_id: LOCATION_ID,
                world_id: WORLD_ID,
                session_id: SESSION_ID,
                base_url: 'http://127.0.0.1:' + HTTP_PORT,
            },
            target: {
                location_id: portal.target_location_id,
                world_id: portal.target_world_id,
                base_url: portal.target_base_url,
                arrival_endpoint: '/portal/arrival',
                session_endpoint: '/sessions',
                arrival_position: portal.arrival.position,
                arrival_rotation_y: portal.arrival.rotation_y,
            },
            portal: {
                portal_id: portal.portal_id,
                source_location_id: portal.source_location_id,
                source_world_id: portal.source_world_id,
                target_location_id: portal.target_location_id,
                target_world_id: portal.target_world_id,
                target_base_url: portal.target_base_url,
                exit_endpoint: '/portal/exit-intent',
                arrival_endpoint: '/portal/arrival',
                handoff_behavior: 'application-level-handoff-around-teleportxr',
                native_teleportxr_teleport: false,
                trigger: {
                    position: portal.trigger.position,
                    radius_m: portal.trigger.radius_m,
                },
                arrival: {
                    position: portal.arrival.position,
                    orientation: [0, 0, 0, 1],
                    rotation_y: portal.arrival.rotation_y,
                },
            },
            avatar_context: {
                avatar_id: state.avatar.avatar_id,
                continuity_id: state.avatar.continuity_id,
                display_name: state.avatar.display_name,
                transform: {
                    position: state.avatar.transform.position.slice(),
                    rotation_y: state.avatar.transform.rotation_y,
                    orientation: state.avatar.transform.orientation.slice(),
                    scale: state.avatar.transform.scale.slice(),
                },
                source_session_id: SESSION_ID,
                source_world_id: WORLD_ID,
                source_location_id: LOCATION_ID,
                state_revision: state.debug.state_revision,
            },
        };
        packet.presence_departure = {
            _claim: 'runtime: the origin departs the crossing player from its OWN '
                + 'presence registry in the same transaction that authorizes the exit — the '
                + 'registry never depends on a separate best-effort goodbye packet',
            player_id: playerId || null,
            requested: !!playerId,
            departed: presenceDeparture ? presenceDeparture.departed : false,
            registered_player_count: presenceDeparture
                ? presenceDeparture.registered_player_count
                : presenceRegistry.size,
        };
        state.debug.handoff.last_exit_intent = {
            handoff_id: handoffId,
            target_location_id: portal.target_location_id,
            target_world_id: portal.target_world_id,
            target_base_url: portal.target_base_url,
            exited_at: now,
            presence_departed: packet.presence_departure.departed,
            presence_player_id: playerId || null,
        };
        state.debug.last_input_source = 'portal-exit-intent';
        bumpRevision();
        notifySubscribers();
        console.log('[PortalHandoff][' + LOCATION_ID + '] EXIT_INTENT '
            + JSON.stringify(state.debug.handoff.last_exit_intent));
        return packet;
    }
    function commitArrival(handoff, now) {
        const target = handoff.target || {};
        const context = handoff.avatar_context || {};
        const arrivalPosition = Array.isArray(target.arrival_position)
            ? target.arrival_position.slice(0, 3).map(v => readNumber(v, 0))
            : [0, 0, 3.6];
        state.avatar.avatar_id = String(context.avatar_id || state.avatar.avatar_id).slice(0, 80);
        state.avatar.continuity_id =
            String(context.continuity_id || context.avatar_id || state.avatar.continuity_id).slice(0, 80);
        state.avatar.display_name = String(context.display_name || state.avatar.display_name).slice(0, 80);
        state.avatar.transform.position = arrivalPosition;
        state.avatar.transform.rotation_y = readNumber(target.arrival_rotation_y, Math.PI);
        state.avatar.transform.orientation = [0, 0, 0, 1];
        state.avatar.handoff_context = {
            handoff_id: String(handoff.handoff_id || 'unknown').slice(0, 120),
            source_location_id: String((handoff.source && handoff.source.location_id) || '').slice(0, 80),
            source_world_id: String((handoff.source && handoff.source.world_id) || '').slice(0, 80),
            source_session_id: String((handoff.source && handoff.source.session_id) || '').slice(0, 80),
            previous_transform: context.transform || null,
            arrived_at: now,
        };
        state.session.arrival_count += 1;
        state.session.handoff_bootstrap = JSON.parse(JSON.stringify(state.avatar.handoff_context));
        state.debug.handoff.last_handoff_id = state.avatar.handoff_context.handoff_id;
        state.debug.handoff.last_arrival = {
            handoff_id: state.avatar.handoff_context.handoff_id,
            source_location_id: state.avatar.handoff_context.source_location_id,
            source_world_id: state.avatar.handoff_context.source_world_id,
            preserved_avatar_id: state.avatar.avatar_id,
            continuity_id: state.avatar.continuity_id,
            arrived_at: now,
        };
        state.debug.last_input_source = 'portal-arrival';
        bumpRevision();
        notifySubscribers();
        console.log('[PortalHandoff][' + LOCATION_ID + '] ARRIVAL '
            + JSON.stringify(state.debug.handoff.last_arrival));
    }
    function recordPortalArrival(packet) {
        const handoff = packet && typeof packet === 'object' ? packet : {};
        const target = handoff.target || {};
        if (target.world_id && target.world_id !== WORLD_ID)
            throw new Error('handoff target world ' + target.world_id + ' does not match ' + WORLD_ID);
        if (target.location_id && target.location_id !== LOCATION_ID)
            throw new Error('handoff target location ' + target.location_id + ' does not match ' + LOCATION_ID);
        const now = new Date().toISOString();
        if (ARRIVAL_COMMIT_MODE === 'deferred') {
            setTimeout(() => commitArrival(handoff, now), 0);
            return { ok: true, deferred: true, handoff_id: handoff.handoff_id };
        }
        commitArrival(handoff, now);
        return getState();
    }
    const DEMO_DEFAULT_PORTAL_TRIGGERS = (cfg.portals || []).map(p => clone(p.trigger || {}));
    const DEMO_DEFAULT_SCENE_OBJECTS = clone(state.scene_objects);
    function demoClampMeters(value, limit, fallback) {
        const n = Number(value);
        if (!Number.isFinite(n))
            return fallback;
        return Math.max(-limit, Math.min(limit, n));
    }
    function demoBumpAttachPoint(reason) {
        state.attach_point.version += 1;
        state.attach_point.updated_at = new Date().toISOString();
        state.attach_point.last_change = String(reason || 'update');
    }
    function demoPortalPose(portalArg) {
        const portal = portalArg || state.portals[0] || null;
        if (!portal)
            return null;
        const preset = FABRIC_PORTAL_FRAME_PRESETS[LOCATION_ID] || { forward: [0, 0, 1] };
        return {
            portal_id: portal.portal_id,
            trigger_position: (portal.trigger && portal.trigger.position || [2.8, 0, -2.8]).slice(),
            trigger_radius_m: readNumber(portal.trigger && portal.trigger.radius_m, 1.25),
            forward: preset.forward.slice(),
            width_m: FABRIC_PORTAL_FRAME_WIDTH_M,
            height_m: FABRIC_PORTAL_FRAME_HEIGHT_M,
            trigger_depth_m: FABRIC_PORTAL_TRIGGER_DEPTH_M,
            target_location_id: portal.target_location_id || null,
            target_world_id: portal.target_world_id || null,
        };
    }
    function demoExtensionBoundary() {
        return {
            demo_extension: true,
            claim: 'runtime demo extension — reloadable hosted portal-view point; '
                + 'NOT a Universal Manifest, IWPS, or Web of Worlds spec resource',
            standards_conformance: false,
            um_conformance: false,
            iwps_conformance: false,
        };
    }
    function demoPortalLoadingContent() {
        const brand = DEMO_PORTAL_LOADING_BRAND[LOCATION_ID] || {};
        const baseHex = DEMO_WORLD_BASE_COLOR[LOCATION_ID] || '#20242e';
        return {
            demo_extension: true,
            standards_conformance: false,
            label: 'runtime DEMO EXTENSION — destination loading-content pointers '
                + '(metaverse.portal.* names from the TeleportVR/UM integration packet; '
                + 'demonstration-only, NOT a published UM/IWPS/WoW spec surface)',
            pointer_host: LOCATION_ID,
            pointer_names: [
                'metaverse.portal.loadingScreen',
                'metaverse.portal.loadingBranding',
                'metaverse.portal.loadingInstructions',
                'metaverse.portal.estimatedLoadTime',
            ],
            consent_key: 'metaverse.portal.preloadContent',
            pointers: {
                'metaverse.portal.loadingScreen': {
                    href: '/demo/portal-view?resolution=snapshot3d',
                    value: {
                        headline: 'Entering ' + TITLE,
                        background_hex: baseHex,
                        accent_hex: brand.accent_hex || '#9fb0d0',
                    },
                },
                'metaverse.portal.loadingBranding': {
                    href: '/demo/portal-view',
                    value: {
                        world_title: TITLE,
                        location_id: LOCATION_ID,
                        world_id: WORLD_ID,
                        brand_color_hex: brand.accent_hex || '#9fb0d0',
                        tagline: brand.tagline || '',
                    },
                },
                'metaverse.portal.loadingInstructions': {
                    href: '/demo/portal-view',
                    value: {
                        instructions: Array.isArray(brand.instructions) ? brand.instructions.slice() : [],
                    },
                },
                'metaverse.portal.estimatedLoadTime': {
                    href: '/demo/portal-view',
                    value: {
                        estimated_load_ms: Number(brand.estimated_load_ms) || 2500,
                    },
                },
            },
            consent: {
                key: 'metaverse.portal.preloadContent',
                granted: true,
                scope: 'demo',
                note: 'demo consent — the source world MAY preload/render this destination '
                    + 'loading content before the handshake completes',
            },
        };
    }
    function getSceneObjects() {
        return clone(Object.assign({
            ok: true,
            location_id: LOCATION_ID,
            world_id: WORLD_ID,
            version: state.attach_point.version,
            updated_at: state.attach_point.updated_at,
            objects: state.scene_objects,
            portal_pose: demoPortalPose(),
        }, demoExtensionBoundary()));
    }
    function moveSceneObject(objectId, position) {
        const obj = state.scene_objects.find(o => o.object_id === String(objectId || ''));
        if (!obj)
            throw new Error('unknown scene object ' + objectId);
        const p = Array.isArray(position) ? position : [];
        obj.position = [
            demoClampMeters(p[0], DEMO_SCENE_OBJECT_LIMIT_M, obj.position[0]),
            obj.position[1],
            demoClampMeters(p[2], DEMO_SCENE_OBJECT_LIMIT_M, obj.position[2]),
        ];
        state.debug.last_input_source = 'demo-scene-object-move';
        demoBumpAttachPoint('scene_object_moved:' + obj.object_id);
        bumpRevision();
        notifySubscribers();
        return clone(obj);
    }
    function movePortal(position) {
        const portal = state.portals[0];
        if (!portal)
            throw new Error('no portal hosted by this node');
        const prev = (portal.trigger && portal.trigger.position) || [2.8, 0, -2.8];
        const p = Array.isArray(position) ? position : [];
        portal.trigger = Object.assign({}, portal.trigger, {
            position: [
                demoClampMeters(p[0], DEMO_PORTAL_LIMIT_M, prev[0]),
                0,
                demoClampMeters(p[2], DEMO_PORTAL_LIMIT_M, prev[2]),
            ],
        });
        state.debug.last_input_source = 'demo-portal-move';
        demoBumpAttachPoint('portal_moved:' + portal.portal_id);
        bumpRevision();
        notifySubscribers();
        return clone(portal);
    }
    function demoPortalViewColor() {
        const pose = demoPortalPose();
        const anchor = pose ? pose.trigger_position : [2.8, 0, -2.8];
        const parse = hex => {
            const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
            const n = m ? parseInt(m[1], 16) : 0x808080;
            return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
        };
        const base = parse(DEMO_WORLD_BASE_COLOR[LOCATION_ID] || '#20242e');
        let r = base[0] * 2, g = base[1] * 2, b = base[2] * 2, w = 2;
        for (const obj of state.scene_objects) {
            const c = parse(obj.color);
            const dx = (obj.position[0] || 0) - anchor[0];
            const dz = (obj.position[2] || 0) - anchor[2];
            const weight = 1 / (1 + Math.hypot(dx, dz));
            r += c[0] * weight;
            g += c[1] * weight;
            b += c[2] * weight;
            w += weight;
        }
        const toHex = v => Math.max(0, Math.min(255, Math.round(v / w))).toString(16).padStart(2, '0');
        return '#' + toHex(r) + toHex(g) + toHex(b);
    }
    function getPortalView(resolution) {
        const res = String(resolution || 'snapshot3d');
        const base = Object.assign({
            ok: true,
            location_id: LOCATION_ID,
            world_id: WORLD_ID,
            version: state.attach_point.version,
            updated_at: state.attach_point.updated_at,
            resolution: res,
            resolution_ladder: ['color', 'snapshot3d', 'splats'],
        }, demoExtensionBoundary());
        base.metaverse_portal = demoPortalLoadingContent();
        if (res === 'color') {
            return clone(Object.assign(base, {
                status: 'available',
                value: {
                    color_hex: demoPortalViewColor(),
                    derivation: 'world base tint blended with hosted object colors, '
                        + 'weighted 1/(1+planar distance to the portal)',
                },
            }));
        }
        if (res === 'snapshot3d') {
            return clone(Object.assign(base, {
                status: 'available',
                value: {
                    kind: '3d_snapshot',
                    room: { size_m: [12, 12], base_color: DEMO_WORLD_BASE_COLOR[LOCATION_ID] || '#20242e' },
                    portal: demoPortalPose(),
                    objects: state.scene_objects,
                    avatar_position: state.avatar.transform.position.slice(),
                },
            }));
        }
        if (res === 'splats') {
            return clone(Object.assign(base, {
                status: 'stub_not_implemented',
                label: 'SPLATS RUNG — STUBBED. Highest resolution (gaussian splats) is '
                    + 'deliberately NOT implemented in this demo; shown only as the ladder\'s top rung.',
                value: null,
            }));
        }
        return null;
    }
    function getUmAttachPoint() {
        return clone(Object.assign({
            ok: true,
            attach_point_id: 'um-attach-point-' + LOCATION_ID,
            model: 'reloadable_hosted_point',
            model_note: 'Demo interpretation of the documented UM attach-point fallback: '
                + 'the Universal Manifest ATTACHES to this server-hosted point and clients '
                + 'RE-READ (reload) it on demand; the UM/server does NOT stream it. Each GET '
                + 'is a fresh reload of current server truth. Project-local model — not '
                + 'defined by any published UM/IWPS/WoW spec.',
            location_id: LOCATION_ID,
            world_id: WORLD_ID,
            version: state.attach_point.version,
            updated_at: state.attach_point.updated_at,
            last_change: state.attach_point.last_change,
            portal_pose: demoPortalPose(),
            metaverse_portal: demoPortalLoadingContent(),
            resolutions: {
                color: { status: 'available', href: '/demo/portal-view?resolution=color' },
                snapshot3d: { status: 'available', href: '/demo/portal-view?resolution=snapshot3d' },
                splats: {
                    status: 'stub_not_implemented',
                    href: '/demo/portal-view?resolution=splats',
                    label: 'highest rung — stubbed, not working yet (labeled)',
                },
            },
            value: getPortalView('snapshot3d').value,
            proof_boundary: getWowProofBoundary(),
        }, demoExtensionBoundary()));
    }
    function reset() {
        state.scene_objects = clone(DEMO_DEFAULT_SCENE_OBJECTS);
        state.portals.forEach((portal, i) => {
            if (DEMO_DEFAULT_PORTAL_TRIGGERS[i])
                portal.trigger = clone(DEMO_DEFAULT_PORTAL_TRIGGERS[i]);
        });
        demoBumpAttachPoint('reset');
        spatialStore.resetToSeed();
        state.republish_rate_ms = 0;
        stopRepublishTimer();
        state.session.arrival_count = 0;
        state.session.handoff_bootstrap = null;
        presenceRegistry.clear();
        stopPresenceSweeper();
        state.session.connected_clients = [];
        state.avatar.avatar_id = 'avatar-local-001';
        state.avatar.continuity_id = 'avatar-local-001';
        state.avatar.display_name = 'poc-user';
        state.avatar.transform.position = [0, 0, 0];
        state.avatar.transform.rotation_y = 0;
        state.avatar.transform.orientation = [0, 0, 0, 1];
        state.avatar.handoff_context = null;
        state.debug.last_input_source = 'reset';
        state.debug.handoff = { last_handoff_id: null, last_exit_intent: null, last_arrival: null };
        bumpRevision();
        notifySubscribers();
        return getDebugState();
    }
    function tick() {
        state.server_tick += 1;
    }
    const DEMO_REPUBLISH_RATE_MIN_MS = 100;
    const DEMO_REPUBLISH_RATE_MAX_MS = 60000;
    const DEMO_REPUBLISH_DRIFT_AMPLITUDE_M = 0.35;
    state.republish_rate_ms = 0;
    let republishTimer = null;
    let republishTickCount = 0;
    const republishDriftSeeds = state.scene_objects.map((o, i) => ({
        object_id: o.object_id,
        home: (o.position || [0, 0, 0]).slice(),
        phase: (i * 1.7) % (Math.PI * 2),
        ampX: DEMO_REPUBLISH_DRIFT_AMPLITUDE_M * (0.6 + 0.4 * ((i * 0.37) % 1)),
        ampZ: DEMO_REPUBLISH_DRIFT_AMPLITUDE_M * (0.6 + 0.4 * ((i * 0.53) % 1)),
        rate: 0.6 + 0.5 * ((i * 0.29) % 1),
    }));
    function republishApplyAmbientDrift() {
        republishTickCount += 1;
        for (const seed of republishDriftSeeds) {
            const obj = state.scene_objects.find(o => o.object_id === seed.object_id);
            if (!obj)
                continue;
            const t = seed.phase + republishTickCount * seed.rate;
            const nx = seed.home[0] + Math.cos(t) * seed.ampX;
            const nz = seed.home[2] + Math.sin(t) * seed.ampZ;
            obj.position = [
                demoClampMeters(nx, DEMO_SCENE_OBJECT_LIMIT_M, obj.position[0]),
                obj.position[1],
                demoClampMeters(nz, DEMO_SCENE_OBJECT_LIMIT_M, obj.position[2]),
            ];
        }
        state.debug.last_input_source = 'demo-republish-ambient-drift';
        demoBumpAttachPoint('republish_ambient_drift:tick_' + republishTickCount);
        bumpRevision();
        notifySubscribers();
    }
    function stopRepublishTimer() {
        if (republishTimer) {
            clearInterval(republishTimer);
            republishTimer = null;
        }
    }
    function startRepublishTimer() {
        stopRepublishTimer();
        const rate = state.republish_rate_ms;
        if (!(rate > 0))
            return;
        republishTimer = setInterval(republishApplyAmbientDrift, rate);
        if (republishTimer && typeof republishTimer.unref === 'function')
            republishTimer.unref();
    }
    function setRepublishRate(rateMs) {
        const raw = Number(rateMs);
        let applied = 0;
        if (Number.isFinite(raw) && raw > 0) {
            applied = Math.max(DEMO_REPUBLISH_RATE_MIN_MS, Math.min(DEMO_REPUBLISH_RATE_MAX_MS, Math.round(raw)));
        }
        state.republish_rate_ms = applied;
        startRepublishTimer();
        return getRepublishRate();
    }
    function getRepublishRate() {
        return clone(Object.assign({
            ok: true,
            location_id: LOCATION_ID,
            world_id: WORLD_ID,
            republish_rate_ms: state.republish_rate_ms,
            enabled: state.republish_rate_ms > 0,
            running: republishTimer != null,
            republish_tick_count: republishTickCount,
            bounds_ms: { min: DEMO_REPUBLISH_RATE_MIN_MS, max: DEMO_REPUBLISH_RATE_MAX_MS },
            model: 'server_side_periodic_state_mutation',
            model_note: 'When > 0, the server applies a small bounded ambient drift to the '
                + 'hosted scene objects at this cadence and bumps the attach-point version. '
                + 'Clients PULL (re-read) the hosted point on their own reload cadence; the '
                + 'server does NOT push/stream this to clients. Default 0 = disabled = pre-runtime '
                + 'behavior (no ambient change).',
            drift_amplitude_m: DEMO_REPUBLISH_DRIFT_AMPLITUDE_M,
            reloadable_not_streaming: true,
        }, demoExtensionBoundary()));
    }
    return {
        LOCATION_ID, WORLD_ID, SESSION_ID, HTTP_PORT, NODE_ROLE,
        getState, getDebugState, subscribe, subscriberCount,
        subscribeEvents, eventSubscriberCount, getWowEventsHello,
        getWowWorld, getWowLocation, getWowGraph,
        getWowPortal, getWowPortalResource, getWowUser, getWowView,
        getWowUserSigned,
        getWowProofBoundary,
        wowGeoPoseFromLocal,
        getSpatialGraphRoot, getSpatialNode,
        getSpatialDescriptor,
        createSpatialNodes, updateSpatialNode, deleteSpatialNode,
        SPATIAL_ID,
        getFabricManifest, getFabricSpawnPose,
        applyMovement, recordPortalExitIntent, recordPortalArrival,
        getSceneObjects, moveSceneObject, movePortal, getPortalView, getUmAttachPoint,
        getFabricRegion, getFabricPresence,
        getFabricRegionChunk, getFabricRegionTilesetHypothesis,
        registerPresence, heartbeatPresence, departPresence, stopPresenceSweeper,
        setRepublishRate, getRepublishRate, stopRepublishTimer,
        reset, tick,
        _raw: state,
    };
}
module.exports = { createRuntime };
