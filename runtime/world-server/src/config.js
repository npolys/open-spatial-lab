'use strict';
const AIRPORT_WORLD_GRAPH = require('../../../web/worlds/denver-skyport.json');
const NODES = {
    lobby: {
        location_id: 'location-lobby',
        world_id: 'demo-lobby',
        session_id: 'local-session-lobby',
        http_port: 18153,
        node_role: 'lobby',
        title: 'Lobby - Pre-Location Gathering',
        portals: [{
                portal_id: 'lobby-portal-a',
                label: 'Portal to Location A',
                source_location_id: 'location-lobby',
                source_world_id: 'demo-lobby',
                target_location_id: 'location-a',
                target_world_id: 'demo-room-a',
                target_base_url: 'http://127.0.0.1:18151',
                target_portal_id: 'location-a-portal',
                trigger: { position: [-2.0, 0, -2.8], radius_m: 1.25 },
                arrival: { position: [0, 0, 3.6], rotation_y: Math.PI },
                spatial_fabric: { prefetch_radius_m: 3.0, roi_radius_m: 5.0 },
                traversal: { mode: 'bidirectional' },
            }, {
                portal_id: 'lobby-portal-b',
                label: 'Portal to Location B',
                source_location_id: 'location-lobby',
                source_world_id: 'demo-lobby',
                target_location_id: 'location-b',
                target_world_id: 'demo-room-b',
                target_base_url: 'http://127.0.0.1:18152',
                target_portal_id: 'location-b-portal',
                trigger: { position: [2.0, 0, -2.8], radius_m: 1.25 },
                arrival: { position: [0, 0, 3.6], rotation_y: Math.PI },
                spatial_fabric: { prefetch_radius_m: 3.0, roi_radius_m: 5.0 },
                traversal: { mode: 'bidirectional' },
            }, {
                portal_id: 'lobby-portal-c',
                label: 'Portal to Denver Skyport',
                source_location_id: 'location-lobby',
                source_world_id: 'demo-lobby',
                target_fixture: {
                    spatial_id: 'world-airport-terminal',
                    graph_endpoint: '/worlds/denver-skyport.json',
                },
                trigger: { position: [0, 0, -4.4], radius_m: 1.25 },
                arrival: { position: [0, 0, -3.0], rotation_y: 0 },
                spatial_fabric: { prefetch_radius_m: 3.0, roi_radius_m: 5.0 },
                traversal: { mode: 'bidirectional', transition: 'client_scene_load' },
                reciprocal: { mode: 'automatic' },
            }],
    },
    a: {
        location_id: 'location-a',
        world_id: 'demo-room-a',
        session_id: 'local-session-a',
        http_port: 18151,
        node_role: 'source',
        title: 'Location A - Origin Gallery',
        portals: [{
                portal_id: 'location-a-portal',
                label: 'Portal to Location B',
                source_location_id: 'location-a',
                source_world_id: 'demo-room-a',
                target_location_id: 'location-b',
                target_world_id: 'demo-room-b',
                target_base_url: 'http://127.0.0.1:18152',
                target_portal_id: 'location-b-portal',
                trigger: { position: [2.8, 0, -2.8], radius_m: 1.25 },
                arrival: { position: [0, 0, 3.6], rotation_y: Math.PI },
                spatial_fabric: { prefetch_radius_m: 3.0, roi_radius_m: 5.0 },
                traversal: { mode: 'bidirectional' },
            }],
    },
    b: {
        location_id: 'location-b',
        world_id: 'demo-room-b',
        session_id: 'local-session-b',
        http_port: 18152,
        node_role: 'target',
        title: 'Location B - Arrival Hall',
        portals: [{
                portal_id: 'location-b-portal',
                label: 'Portal to Location A',
                source_location_id: 'location-b',
                source_world_id: 'demo-room-b',
                target_location_id: 'location-a',
                target_world_id: 'demo-room-a',
                target_base_url: 'http://127.0.0.1:18151',
                target_portal_id: 'location-a-portal',
                trigger: { position: [2.8, 0, -2.8], radius_m: 1.25 },
                arrival: { position: [0, 0, 3.6], rotation_y: Math.PI },
                spatial_fabric: { prefetch_radius_m: 3.0, roi_radius_m: 5.0 },
                traversal: { mode: 'bidirectional' },
            }],
    },
    airport: {
        location_id: 'location-airport',
        world_id: 'world-airport-terminal',
        session_id: 'local-session-airport',
        http_port: Number(process.env.OSL_BACKEND_AIRPORT_PORT) || 18154,
        node_role: 'airport',
        title: 'Denver Skyport - Concourse A',
        authored_wow_graph: AIRPORT_WORLD_GRAPH,
        entry_spawn: { position: [0, 0, -3], rotation_y: 0 },
        portals: [{
                portal_id: 'airport-portal-lobby',
                label: 'Return portal to Lobby',
                source_location_id: 'location-airport',
                source_world_id: 'world-airport-terminal',
                target_location_id: 'location-lobby',
                target_world_id: 'demo-lobby',
                target_base_url: 'http://127.0.0.1:18153',
                target_portal_id: 'lobby-portal-c',
                trigger: { position: [0, 0, -4.4], radius_m: 1.25 },
                arrival: { position: [0, 0, 0.4], rotation_y: 0 },
                spatial_fabric: { prefetch_radius_m: 3.0, roi_radius_m: 5.0 },
                traversal: { mode: 'bidirectional' },
            }],
    },
};
function traversalOverrideFor(portalId) {
    const raw = process.env.OSL_PORTAL_TRAVERSAL_OVERRIDES;
    if (!raw)
        return null;
    try {
        const parsed = JSON.parse(raw);
        const hit = parsed && typeof parsed === 'object' ? parsed[portalId] : null;
        return hit && typeof hit === 'object' ? hit : null;
    }
    catch (e) {
        return null;
    }
}
function makeConfig(role, extraOpts) {
    const key = String(role).toLowerCase().replace('location-', '');
    const base = NODES[key];
    if (!base)
        throw new Error('unknown node role "' + role + '" (expected a|b|lobby|airport|location-a|location-b|location-lobby|location-airport)');
    const cfg = Object.assign({}, base, extraOpts || {});
    cfg.portals = (cfg.portals || []).map(portal => {
        const override = traversalOverrideFor(portal.portal_id);
        return override ? Object.assign({}, portal, { traversal: override }) : portal;
    });
    return cfg;
}
module.exports = { NODES, makeConfig };
