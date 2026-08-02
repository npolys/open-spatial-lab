import { HANDOFF_PHASES, PROVENANCE, validateProofBoundary, } from "./vendor/scene-core/frontend-contract.js";
import { defaultEquippedItems, equipmentCatalog, resolveEquipmentItems, validateEquippedItems, } from "./equipment-view.js";
import { AVATAR_VARIANTS, DEFAULT_AVATAR_VARIANT } from "./avatar-equipment-layer.js";
import { withBase, BASE_PATH } from "./base-path.mjs";
import { resolveFabricReference as resolveFabricReferenceForBase } from "./live-adapter-fabric-reference.mjs";
import { geoPoseShapedFromTransform, } from "./geopose-basic-sdu.mjs";
import { IWPS_CONFORMANCE, } from "./iwps-query-teleport.mjs";
import { UM_CONFORMANCE } from "./conformance/um-conformance.mjs";
import { DEFAULT_LIVE_ADAPTER_TRANSPORT, displayPath, } from "./live-adapter-transport.mjs";
export { API_EVENTS } from "./live-adapter-transport.mjs";
import { PORTAL_EXIT_OFFSET_MIN_M, PORTAL_EXIT_OFFSET_MAX_M, addScaled3, clamp, clonePosition, cloneScale, fabricPortalKey, mapCameraBetweenPortalFrames, normalizePortalTraversal, normalizeVec3, portalEntrySideAllowed, portalFrameForLocation, roundNumber, roundVec3, yawFromVector, yawQuaternion, } from "./live-adapter-portal-geometry.mjs";
export { mapCameraBetweenPortalFrames } from "./live-adapter-portal-geometry.mjs";
import { worldFromLive, wowWorldSpatialId, } from "./live-adapter-world-projection.mjs";
import { createPresenceController, PRESENCE_TIMING, } from "./live-adapter-presence-controller.mjs";
import { createRuntimeStreamController, } from "./live-adapter-runtime-stream-controller.mjs";
import { createPeerPresenceReducer, PEER_PRESENCE_TIMING, } from "./live-adapter-peer-presence-reducer.mjs";
import { createFabricPrefetchController } from "./live-adapter-fabric-prefetch-controller.mjs";
import { createClientSceneLifecycleController } from "./live-adapter-client-scene-controller.mjs";
import { createPortalTraversalHandoffController } from "./live-adapter-portal-traversal-controller.mjs";
import { automaticReciprocalPortal } from "./airport-lobby-transition.mjs";
import { createAirportWalkableSurfaceContract, integrateAirportVerticalMotion, resolveAirportGroundSurface, } from "./airport-walkable-surface.mjs";
export { portalEntryFromWowNode, portalEntryFromWowPortal, } from "./live-adapter-world-projection.mjs";
import { buildAndSignManifest as umBuildAndSignManifest, verifyManifestSignatureDetailed as umVerifyManifestSignatureDetailed, } from "./manifest/um-manifest-emitter.mjs";
import { makeAvatarDefinition as umMakeAvatarDefinition, makeLoadingPointer as umMakeLoadingPointer } from "./manifest/interfaces.mjs";
import { RP1_FAIL_CLOSED, RP1_FAIL_CLOSED_MODES, demoModeToRp1Options, traversalRequestForDemoMode, gateChildScopeTraversal, } from "./rp1-fail-closed.mjs";
import { buildRp1Section } from "./manifest/rp1-model.mjs";
import { buildTierDemoSurface, DEFAULT_MAX_SUPPORTED_TRUST_TIER } from "./manifest/trust-tier.mjs";
import { issueVerifierChallenge as featureIssueVerifierChallenge, evaluateWo134 as featureEvaluateWo134, } from "./manifest/holder-binding.mjs";
import { demoSealedFacetSurface as featureDemoSealedFacetSurface } from "./manifest/jwe-sealed-facets.mjs";
import { emitAgentDelegationPointer, buildDelegationDemoSurface } from "./manifest/delegation-registry.mjs";
import { generateKeyPair as featureGenerateKeyPair } from "./signing/ed25519.mjs";
import { attachSignatureProfileA as featureAttachSignatureProfileA } from "./signing/um-signature-profile-a.mjs";
import { createReceipt as featureCreateReceipt, mergeFragment as featureMergeFragment, finalizeReceipt as featureFinalizeReceipt, receiptPanelRecord as featureReceiptPanelRecord, } from "./manifest/receipt-hub.mjs";
import { buildEntityPersonhoodDemoSurface } from "./manifest/entity-personhood.mjs";
import { makeDemoStatusAuthority as featureMakeDemoStatusAuthority, buildStatusRefDemoSurface as featureBuildStatusRefDemoSurface, } from "./manifest/statusref-resolution.mjs";
import { demoLockedFacetScenario } from "./manifest/liveness-assurance.mjs";
import { buildProofShapesDemoSurface } from "./manifest/zkp-ceremony.mjs";
import { conductBilateralExchange, verifyReceiptChain as featureVerifyReceiptChain, correlateReceiptPair, buildSealedDepartureManifest, bilateralPanelRecord, } from "./manifest/bilateral-chain.mjs";
import { createReceiptChain as featureCreateEventChain, appendChainEvent as featureAppendChainEvent, sealReceiptChain as featureSealEventChain, } from "./manifest/receipt-hub.mjs";
import { derivePublicKeyRaw as featureDerivePublicKeyRaw } from "./signing/ed25519.mjs";
import { publicKeyToDidKey as featurePublicKeyToDidKey } from "./signing/did.mjs";
import { verifyManifestProfileA as featureVerifyManifestProfileA } from "./signing/um-signature-profile-a.mjs";
import { verifyManifestProfileA as umIdentityVerifyManifest } from "./signing/um-signature-profile-a.mjs";
import { buildPrivateDataPanel } from "./manifest/private-data.mjs";
import { runFormatIndependenceScenario, buildFormatIndependencePanel, feature_CBOR_LD_PREVIEW, } from "./manifest/cbor-ld.mjs";
import { runFactoryFloorSomDemo, somGatingPanelRecord, feature_SOM_CONFORMANCE } from "./manifest/som-branch-auth.mjs";
const BASE_A = withBase("/api/a");
const BASE_B = withBase("/api/b");
const BASE_LOBBY = withBase("/api/lobby");
const BASE_AIRPORT = withBase("/api/airport");
const HOSTED_ATTACH_POINT_EVENT = "hostedattachpoint";
const ENDPOINTS = Object.freeze({
    a: {
        endpoint_key: "a",
        proxy_base: BASE_A,
        backend_base_url: "http://127.0.0.1:18151",
        location_id: "location-a",
        world_id: "demo-room-a",
        session_id: "local-session-a",
        portal_id: "location-a-portal",
    },
    b: {
        endpoint_key: "b",
        proxy_base: BASE_B,
        backend_base_url: "http://127.0.0.1:18152",
        location_id: "location-b",
        world_id: "demo-room-b",
        session_id: "local-session-b",
        portal_id: "location-b-portal",
    },
    lobby: {
        endpoint_key: "lobby",
        proxy_base: BASE_LOBBY,
        backend_base_url: "http://127.0.0.1:18153",
        location_id: "location-lobby",
        world_id: "demo-lobby",
        session_id: "local-session-lobby",
        portal_id: "lobby-portal-a",
    },
    airport: {
        endpoint_key: "airport",
        proxy_base: BASE_AIRPORT,
        backend_base_url: "http://127.0.0.1:18154",
        location_id: "location-airport",
        world_id: "world-airport-terminal",
        session_id: "local-session-airport",
        portal_id: "airport-portal-lobby",
    },
});
const WORLD_LIMIT = 5.4;
const MOVE_SPEED_MPS = 2.35;
const RUN_MOVE_SPEED_MPS = 2.8;
const RUN_MAX_CYCLE_SPEED = 1.6257644280216694;
const RUN_MIN_CYCLE_DISTANCE_M = 0.5;
const JUMP_SPEED_MPS = 4.25;
const GRAVITY_MPS2 = 10.5;
const SPEC_IDENTITY = Object.freeze({
    spec_file: "OpenSpatialWorld API.yaml",
    openapi: "3.0.4",
    shape_validation: "shape-validated 22/22",
    standards_conformance: false,
    identity_line: "OpenSpatialWorld API.yaml · openapi 3.0.4 · shape-validated 22/22 · standards_conformance:false",
});
function endpointKeyForRole(role, active) {
    const requested = String(active || "").toLowerCase();
    if (requested === "target" || requested === "b")
        return "b";
    if (requested === "source" || requested === "a")
        return "a";
    if (requested === "lobby")
        return "lobby";
    if (requested === "airport")
        return "airport";
    if (role === "player" && !requested)
        return "lobby";
    return role === "target" ? "b" : "a";
}
function oppositeEndpointKey(endpointKey) {
    if (endpointKey === "lobby")
        return null;
    if (endpointKey === "airport")
        return "lobby";
    return endpointKey === "a" ? "b" : "a";
}
function endpointKeyForLocation(locationId) {
    const wanted = String(locationId || "");
    if (!wanted)
        return null;
    for (const key of Object.keys(ENDPOINTS)) {
        if (ENDPOINTS[key].location_id === wanted)
            return key;
    }
    return null;
}
function endpointDebug(endpoint, world) {
    return {
        endpoint_key: endpoint.endpoint_key,
        proxy_base: endpoint.proxy_base,
        backend_base_url: endpoint.backend_base_url,
        location_id: world && world.location_id ? world.location_id : endpoint.location_id,
        world_id: world && world.world_id ? world.world_id : endpoint.world_id,
        session_id: world && world.session_id ? world.session_id : endpoint.session_id,
    };
}
function strictProofBoundary(flags) {
    return {
        application_level_handoff: flags && flags.application_level_handoff === true,
        native_teleportxr_teleport: false,
        first_party_teleportxr_browser_rendering: false,
        standards_conformance: false,
        um_conformance: { ...UM_CONFORMANCE },
        iwps_conformance: { ...IWPS_CONFORMANCE },
        web_of_worlds_conformance: false,
        spatial_fabric_conformance: false,
    };
}
function makePlayerContextMarker() {
    const href = typeof window !== "undefined" && window.location ? window.location.href : "";
    let navigationType = "unknown";
    let navigationEntryCount = 0;
    try {
        const entries = typeof performance !== "undefined" && performance.getEntriesByType
            ? performance.getEntriesByType("navigation")
            : [];
        navigationType = entries && entries[0] && entries[0].type ? entries[0].type : "unknown";
        navigationEntryCount = entries ? entries.length : 0;
    }
    catch (e) {
        navigationType = "unknown";
    }
    return {
        marker_id: `player-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        marker_kind: "world_navigator_session_marker",
        context_id: `omb-ctx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
        created_at: new Date().toISOString(),
        boot_href: href,
        current_href: href,
        navigation_type_at_boot: navigationType,
        navigation_entry_count_at_boot: navigationEntryCount,
        same_marker_after_crossing: null,
        crossing_comparison: null,
        single_context: true,
        fabrics_loaded: [],
        fabrics_loaded_count: 0,
        root_fabric_url: null,
        child_fabric_url: null,
        upgraded_at: null,
    };
}
const FABRIC_PORTAL_ATTACHMENT_SUBTYPE = 255;
function fabricChildNodes(manifest) {
    const root = manifest && manifest.data;
    return root && Array.isArray(root.Children) ? root.Children : [];
}
function fabricNodeId(node) {
    return node && node.Head && node.Head.Self ? String(node.Head.Self) : null;
}
function fabricNodePosition(node) {
    const t = node && node.Transform;
    return clonePosition(t && t.Position, [0, 0, 0]);
}
function findFabricPortalAttachmentNode(manifest) {
    return (fabricChildNodes(manifest).find((node) => node && node.Type && Number(node.Type.bSubtype) === FABRIC_PORTAL_ATTACHMENT_SUBTYPE) || null);
}
function findFabricPortalAttachmentNodes(manifest) {
    return fabricChildNodes(manifest).filter((node) => node && node.Type && Number(node.Type.bSubtype) === FABRIC_PORTAL_ATTACHMENT_SUBTYPE);
}
function findFabricActionTriggerNode(manifest) {
    return (fabricChildNodes(manifest).find((node) => node &&
        node.Resource &&
        typeof node.Resource.sReference === "string" &&
        node.Resource.sReference.startsWith("action:")) || null);
}
function findFabricSpawnNode(manifest) {
    const nodes = fabricChildNodes(manifest);
    return (nodes.find((node) => node && node.Name === "Avatar Spawn") ||
        nodes.find((node) => node && node.Transform && !node.Type && !(node.Resource && node.Resource.sReference)) ||
        null);
}
function resolveFabricReference(ref) {
    return resolveFabricReferenceForBase(BASE_PATH, ref);
}
function authoredWowGraphEndpoint(wowWorld, base) {
    const endpoint = wowWorld?.webofworlds_extension?.authored_graph?.endpoint;
    if (typeof endpoint !== "string" || !endpoint)
        return null;
    if (/^https?:\/\//i.test(endpoint))
        return endpoint;
    return `${String(base || "").replace(/\/$/, "")}/${endpoint.replace(/^\//, "")}`;
}
const WOW_SERVICE_TYPE = "web-of-worlds";
const WOW_SERVICE_MAP = Object.freeze({
    wow: { key: "world", param: null },
    "wow-user": { key: "user", param: "{userId}" },
    "wow-portal": { key: "portal", param: "{portalId}" },
    "wow-view": { key: "view", param: "{viewId}" },
});
function resolveWowEndpoints(rootManifest, base) {
    const services = Array.isArray(rootManifest && rootManifest.services)
        ? rootManifest.services
        : [];
    const fallback = Object.freeze({
        world: { path: `${base}/wow/world`, id: null },
        user: { path: `${base}/wow/user/1`, id: 1 },
        portal: { path: `${base}/wow/portal/1`, id: 1 },
        view: { path: `${base}/wow/view/1`, id: 1 },
    });
    const resolved = {};
    const provenance = {};
    for (const svc of services) {
        if (!svc || typeof svc.endpoint !== "string")
            continue;
        if (svc.type && String(svc.type) !== WOW_SERVICE_TYPE)
            continue;
        const mapping = WOW_SERVICE_MAP[String(svc.name)];
        if (!mapping)
            continue;
        let endpoint = svc.endpoint;
        let id = null;
        if (mapping.param) {
            id = svc.default_id != null ? svc.default_id : 1;
            endpoint = endpoint.replace(mapping.param, String(id));
        }
        const path = endpoint.startsWith("/") ? `${base}${endpoint}` : `${base}/${endpoint}`;
        resolved[mapping.key] = { path, id };
        provenance[mapping.key] = {
            source: "services[]",
            service_name: svc.name,
            template: svc.endpoint,
            default_id: svc.default_id != null ? svc.default_id : null,
            resolved_id: id,
            resolved_path: displayPath(path),
        };
    }
    const out = {};
    for (const key of ["world", "user", "portal", "view"]) {
        if (resolved[key]) {
            out[key] = resolved[key];
        }
        else {
            out[key] = { ...fallback[key] };
            provenance[key] = {
                source: "fallback_constant",
                service_name: null,
                template: null,
                default_id: null,
                resolved_id: fallback[key].id,
                resolved_path: displayPath(fallback[key].path),
            };
        }
    }
    return {
        base,
        endpoints: out,
        provenance,
        services_present: services.length > 0,
        resolved_from_services: Object.values(provenance).some((p) => p.source === "services[]"),
        resolution_rule: "fabric services[] endpoint templates resolved against the manifest base; " +
            "{userId}/{portalId}/{viewId} filled from default_id (WoW integer spec routes)",
    };
}
function yawFromQuaternionY(q) {
    if (!Array.isArray(q) || q.length < 4)
        return 0;
    const y = Number(q[1]) || 0;
    const w = Number(q[3]) || 0;
    return roundNumber(2 * Math.atan2(y, w), 6);
}
function fabricSummary(url, manifest) {
    const nodes = fabricChildNodes(manifest);
    const trust = manifest && manifest.trust ? manifest.trust : {};
    const camera = manifest && manifest.primary && manifest.primary.camera ? manifest.primary.camera : null;
    return {
        url: url || null,
        container: manifest && manifest.container ? manifest.container : null,
        format: trust.format || "plain-json",
        signed: trust.signed === true,
        trust_note: trust.note || "unsigned local demonstration fabric (claim boundary)",
        node_count: nodes.length,
        node_names: nodes.map((node) => node && node.Name).filter(Boolean),
        services: Array.isArray(manifest && manifest.services)
            ? manifest.services.map((svc) => ({ name: svc.name, type: svc.type, endpoint: svc.endpoint }))
            : [],
        primary_camera: camera
            ? {
                position: roundVec3(camera.position, 4),
                rotation: Array.isArray(camera.rotation) ? camera.rotation.slice(0, 4) : [0, 0, 0, 1],
                yaw_radians: yawFromQuaternionY(camera.rotation),
            }
            : null,
        background: manifest && manifest.primary ? manifest.primary.background || null : null,
        status: "loaded",
        loaded_at: new Date().toISOString(),
    };
}
function distance2d(a, b) {
    const dx = (a[0] || 0) - (b[0] || 0);
    const dz = (a[2] || 0) - (b[2] || 0);
    return Math.hypot(dx, dz);
}
function previewFreshnessMs(capturedAt) {
    if (!capturedAt)
        return null;
    const t = Date.parse(capturedAt);
    return Number.isFinite(t) ? Math.max(0, Date.now() - t) : null;
}
export function snapshotRenderFacingAvatar(avatar) {
    if (!avatar || typeof avatar !== "object")
        return avatar;
    const stableReferenceFields = new Set([
        "identity",
        "identity_handle",
        "model",
        "model_handle",
        "rig",
        "rig_handle",
        "resource",
        "resource_handle",
        "controller",
        "controller_handle",
        "renderer",
        "renderer_handle",
        "scene",
        "scene_handle",
        "equipment_owner",
        "equipment_owner_handle",
    ]);
    const copies = new WeakMap();
    const copyMutableValue = (value, field = null) => {
        if (!value || typeof value !== "object" || stableReferenceFields.has(field))
            return value;
        if (copies.has(value))
            return copies.get(value);
        if (Array.isArray(value)) {
            const copy = [];
            copies.set(value, copy);
            for (const item of value)
                copy.push(copyMutableValue(item));
            return copy;
        }
        const prototype = Object.getPrototypeOf(value);
        if (prototype !== Object.prototype && prototype !== null)
            return value;
        const copy = {};
        copies.set(value, copy);
        for (const [key, item] of Object.entries(value)) {
            copy[key] = copyMutableValue(item, key);
        }
        return copy;
    };
    return copyMutableValue(avatar);
}
function transformSnapshot(avatar) {
    const rotationY = Number(avatar && avatar.rotation_y) || 0;
    return {
        position: clonePosition(avatar && avatar.position, [0, 0, 0]),
        rotation_y: rotationY,
        orientation: yawQuaternion(rotationY),
        scale: cloneScale(avatar && avatar.scale),
    };
}
function directionFromInput(forward, strafe) {
    if (forward > 0 && strafe === 0)
        return "away_from_camera";
    if (forward < 0 && strafe === 0)
        return "toward_camera";
    if (forward === 0 && strafe > 0)
        return "right";
    if (forward === 0 && strafe < 0)
        return "left";
    if (forward || strafe)
        return "diagonal";
    return "none";
}
function facingSemanticsFromDelta(dx, dz) {
    if (Math.abs(dx) < 1e-4 && Math.abs(dz) < 1e-4)
        return "still";
    if (dz > 1e-4)
        return "front_faces_camera";
    if (dz < -1e-4)
        return "back_faces_camera";
    return dx > 0 ? "front_faces_avatar_right" : "front_faces_avatar_left";
}
async function verifyUmIdentity(wowUser) {
    const oum = wowUser && wowUser.open_user_manifest;
    const label = wowUser && wowUser.open_user_manifest_label ? wowUser.open_user_manifest_label : null;
    if (!oum || typeof oum !== "object") {
        return {
            present: false,
            verified: false,
            reason: "no-open-user-manifest",
            name: null,
            status_label: "unsigned / unverified (no UM identity on /wow/user)",
            server_label: label,
        };
    }
    const base = {
        present: true,
        name: typeof oum.name === "string" ? oum.name : null,
        age: typeof oum.age === "number" ? oum.age : null,
        avatarAssetURI: typeof oum.avatarAssetURI === "string" ? oum.avatarAssetURI : null,
        key_ref: oum.signature && oum.signature.keyRef ? oum.signature.keyRef : null,
        algorithm: oum.signature && oum.signature.algorithm ? oum.signature.algorithm : null,
        canonicalization: oum.signature && oum.signature.canonicalization ? oum.signature.canonicalization : null,
        server_label: label,
    };
    if (!oum.signature || !oum.signature.value) {
        return {
            ...base,
            verified: false,
            reason: "unsigned",
            status_label: "unsigned / unverified",
        };
    }
    try {
        const detail = await umIdentityVerifyManifest(oum);
        return {
            ...base,
            verified: detail.ok === true,
            reason: detail.reason,
            checks: detail.checks,
            status_label: detail.ok
                ? "verified UM identity (Ed25519 / JCS-RFC8785 / did:key) — real signature; standards_conformance:false (non-canonical additive)"
                : `UNVERIFIED — signature present but verification failed (${detail.reason})`,
        };
    }
    catch (e) {
        return {
            ...base,
            verified: false,
            reason: `verify-threw:${(e && e.message) || "error"}`,
            status_label: "unverified (verifier error) — degraded honestly",
        };
    }
}
function featureCrossingStateFromPacket(packet, world) {
    const ctx = (packet && packet.avatar_context) || {};
    const continuityId = (world && world.avatar && world.avatar.continuity_id) ||
        (packet && packet.source && packet.source.continuity_id) ||
        "avatar-local-001";
    const handoffId = (packet && packet.handoff_id) || null;
    const sourceLocationId = (packet && packet.source && packet.source.location_id) ||
        (ctx.source_location_id) ||
        (world && world.location_id) ||
        null;
    const targetLocationId = (packet && packet.target && packet.target.location_id) || ctx.target_location_id || null;
    const equippedItems = Array.isArray(ctx.equippedItems) ? ctx.equippedItems : [];
    const state = {
        continuityId,
        handoffId,
        sourceLocationId,
        targetLocationId,
        avatar: umMakeAvatarDefinition({
            avatarId: (world && world.avatar && world.avatar.avatar_id) || continuityId || "avatar",
            variant: ctx.avatar_variant || DEFAULT_AVATAR_VARIANT,
            displayName: (world && world.avatar && world.avatar.display_name) || null,
            equipmentProfile: ctx.equipment_profile || null,
            equippedItems,
            poseRef: "avatar_context.geopose_shaped_pose",
        }),
    };
    const destUrl = (packet && packet.target && (packet.target.base_url || packet.target.destination_url)) || null;
    if (destUrl) {
        state.loading = umMakeLoadingPointer({
            target: destUrl,
            pointerId: `loading-${handoffId || continuityId || "crossing"}`,
            label: "destination loading target",
        });
    }
    return state;
}
async function featureSignManifestOntoPacket(packet, world, transport) {
    if (!packet || typeof packet !== "object")
        return null;
    try {
        const state = featureCrossingStateFromPacket(packet, world);
        const { manifest, signed, didKey } = await umBuildAndSignManifest(state, { bindDidSubject: true });
        if (!signed || !manifest || !manifest.signature || !manifest.signature.value) {
            return { signed: false, error: "emitter did not return a signed manifest" };
        }
        packet.avatar_context = packet.avatar_context || {};
        packet.avatar_context.um_manifest_v04 = manifest;
        try {
            packet.avatar_context.um_trust_tier_v04 = buildTierDemoSurface({
                localRequiredTrustTier: manifest.requiredTrustTier ?? 0,
                remoteRequiredTrustTier: 0,
                maxSupportedTrustTier: DEFAULT_MAX_SUPPORTED_TRUST_TIER,
            });
        }
        catch (tierErr) {
            packet.avatar_context.um_trust_tier_v04 = { error: (tierErr && tierErr.message) || "tier-surface-threw" };
        }
        try {
            const featureChallenge = featureIssueVerifierChallenge({
                audience: `did:web:${(packet.target && packet.target.location_id) || "destination"}`,
            });
            const featureEval = await featureEvaluateWo134(manifest, {
                now: new Date().toISOString(),
                maxSupportedTrustTier: DEFAULT_MAX_SUPPORTED_TRUST_TIER,
            });
            packet.avatar_context.um_holder_binding_v04 = {
                challenge_issued: featureChallenge.verifierChallenge,
                challenge_audience: featureChallenge.verifierAudience,
                offline_evaluation: {
                    outcome: featureEval.receipt.outcome,
                    signature_check: featureEval.receipt.signatureCheck,
                    freshness_check: featureEval.receipt.freshnessCheck,
                    key_ref_resolution: featureEval.receipt.keyRefResolution,
                    presentation_proof_status: featureEval.receipt.presentationProofStatus || "not-challenged-offline",
                    holder_binding_status: featureEval.receipt.holderBindingStatus || "absent",
                },
                um_conformance_claimed: false,
                note: "runtime holder-binding/presentation-validation evaluator surface (offline posture; interactive did-auth attach + replay-reject proven in runtime-verify.mjs). NOT full evaluator conformance.",
            };
        }
        catch (hbErr) {
            packet.avatar_context.um_holder_binding_v04 = { error: (hbErr && hbErr.message) || "holder-binding-surface-threw" };
        }
        try {
            packet.avatar_context.um_sealed_facets_v04 = await featureDemoSealedFacetSurface();
        }
        catch (sealErr) {
            packet.avatar_context.um_sealed_facets_v04 = { error: (sealErr && sealErr.message) || "sealed-facet-surface-threw" };
        }
        try {
            const featureSubject = manifest.subject || didKey || "did:web:demo.local:user:runtime";
            const featureNowIso = new Date().toISOString();
            const featureDelegation = emitAgentDelegationPointer({
                delegatedBy: featureSubject,
                delegateId: "did:key:z6MkWorldNavigatorAiAgent",
                delegateType: "ai-agent",
                scope: ["spatial.session", "social.messaging", "identity.attestation"],
                delegatedAt: featureNowIso,
                expiresAt: "2030-06-01T00:00:00.000Z",
            });
            const featureKeys = await featureGenerateKeyPair();
            const featureDemoManifest = await featureAttachSignatureProfileA({
                "@context": "https://universalmanifest.net/ns/v0.4",
                "@id": "urn:uuid:runtime-demo-delegation",
                "@type": "um:Manifest",
                manifestVersion: "0.4",
                subject: featureSubject,
                issuedAt: featureNowIso,
                expiresAt: "2030-06-01T00:00:00.000Z",
                pointers: [featureDelegation],
            }, featureKeys.seed);
            packet.avatar_context.um_agent_delegation_v04 = await buildDelegationDemoSurface({
                manifest: featureDemoManifest,
                now: featureNowIso,
                ai_agentLabel: "ai_agent",
            });
        }
        catch (delErr) {
            packet.avatar_context.um_agent_delegation_v04 = { error: (delErr && delErr.message) || "agent-delegation-surface-threw" };
        }
        try {
            const featureEval = await featureEvaluateWo134(manifest, {
                now: new Date().toISOString(),
                maxSupportedTrustTier: DEFAULT_MAX_SUPPORTED_TRUST_TIER,
            });
            const featureReceipt = featureCreateReceipt({ manifestId: manifest["@id"] || undefined });
            featureMergeFragment(featureReceipt, featureEval.receipt);
            featureFinalizeReceipt(featureReceipt, { now: new Date().toISOString() });
            const featurePanel = featureReceiptPanelRecord(featureReceipt, { label: "portal crossing" });
            packet.avatar_context.um_receipt_v04 = {
                receipt: featureReceipt,
                panel: featurePanel,
                um_conformance_claimed: false,
                note: "canonical um:Receipt composed from the runtime crossing evaluation via the runtime hub (createReceipt/mergeFragment/finalizeReceipt). NOT a full evaluator-conformance claim; full matrix is runtime.",
            };
            transport.emitSyntheticApiRequest({
                method: "RECEIPT",
                url: featureReceipt.manifestId,
                path: featureReceipt.manifestId,
                status: featureReceipt.outcome === "rejected" ? 403 : 200,
                ok: featureReceipt.outcome !== "rejected",
                ms: 0,
                schema: `um:Receipt · ${featureReceipt.outcome}`,
                ...featurePanel,
            });
        }
        catch (rcptErr) {
            packet.avatar_context.um_receipt_v04 = { error: (rcptErr && rcptErr.message) || "receipt-surface-threw" };
        }
        try {
            packet.avatar_context.um_entity_personhood_v04 = await buildEntityPersonhoodDemoSurface({
                maxSupportedTrustTier: DEFAULT_MAX_SUPPORTED_TRUST_TIER,
            });
        }
        catch (entErr) {
            packet.avatar_context.um_entity_personhood_v04 = { error: (entErr && entErr.message) || "entity-personhood-surface-threw" };
        }
        try {
            const featureAuthority = featureMakeDemoStatusAuthority();
            const featureManifestId = manifest["@id"] || "urn:uuid:runtime-demo-crossing";
            featureAuthority.register(featureManifestId, { status: "active" });
            packet.avatar_context.um_statusref_v04 = featureBuildStatusRefDemoSurface({
                manifestId: featureManifestId,
                statusRef: featureAuthority.statusRefFor(featureManifestId),
                authority: featureAuthority,
                policy: "active-required",
            });
        }
        catch (srErr) {
            packet.avatar_context.um_statusref_v04 = { error: (srErr && srErr.message) || "statusref-surface-threw" };
        }
        try {
            const featureDemo = await demoLockedFacetScenario({ demoUnlock: false });
            packet.avatar_context.um_liveness_assurance_v04 = featureDemo;
            transport.emitSyntheticApiRequest({
                method: "RECEIPT",
                url: featureDemo.lockedReceipt.manifestId,
                path: featureDemo.lockedReceipt.manifestId,
                status: featureDemo.lockedReceipt.outcome === "rejected" ? 403 : 200,
                ok: featureDemo.lockedReceipt.outcome !== "rejected",
                ms: 0,
                schema: `um:Receipt · ${featureDemo.lockedReceipt.outcome} · liveness/assurance floor (PREVIEW)`,
                ...featureDemo.lockedPanelRow,
            });
        }
        catch (livErr) {
            packet.avatar_context.um_liveness_assurance_v04 = { error: (livErr && livErr.message) || "liveness-assurance-surface-threw" };
        }
        try {
            packet.avatar_context.um_higher_tier_proofs_v04 = buildProofShapesDemoSurface({
                maxSupportedTrustTier: DEFAULT_MAX_SUPPORTED_TRUST_TIER,
            });
        }
        catch (zkpErr) {
            packet.avatar_context.um_higher_tier_proofs_v04 = { error: (zkpErr && zkpErr.message) || "higher-tier-validation-surface-threw" };
        }
        try {
            const featureNow = new Date().toISOString();
            const featureMakeParty = async (tier) => {
                const kp = await featureGenerateKeyPair();
                const partyDid = featurePublicKeyToDidKey(await featureDerivePublicKeyRaw(kp.privateKey));
                const partyManifest = await featureAttachSignatureProfileA({
                    "@context": "https://universalmanifest.net/ns/v0.4",
                    "@id": `urn:uuid:${globalThis.crypto.randomUUID()}`,
                    "@type": "um:Manifest",
                    manifestVersion: "0.4",
                    subject: partyDid,
                    issuedAt: featureNow,
                    expiresAt: new Date(Date.parse(featureNow) + 3600_000).toISOString(),
                    ...(tier !== undefined ? { requiredTrustTier: tier } : {}),
                }, kp.privateKey);
                return { did: partyDid, manifest: partyManifest, privateKeyInput: kp.privateKey };
            };
            const featureEvaluator = (declaredEffectiveTier) => async (counterpartyManifest, { now }) => {
                const r = featureCreateReceipt({ manifestId: counterpartyManifest["@id"] });
                const sig = await featureVerifyManifestProfileA(counterpartyManifest);
                r.signatureCheck = sig.ok
                    ? "valid"
                    : sig.reason === "unsupported-profile"
                        ? "unsupported-profile"
                        : sig.reason === "missing-signature"
                            ? "missing"
                            : "invalid";
                const nowMs = Date.parse(now);
                r.freshnessCheck =
                    Date.parse(counterpartyManifest.issuedAt) > nowMs
                        ? "stale"
                        : Date.parse(counterpartyManifest.expiresAt) < nowMs
                            ? "expired"
                            : "fresh";
                if (Number.isInteger(declaredEffectiveTier))
                    featureMergeFragment(r, { effectiveTrustTier: declaredEffectiveTier });
                return featureFinalizeReceipt(r, { rejected: !sig.ok || r.freshnessCheck !== "fresh", now });
            };
            const featureVisitor = await featureMakeParty(undefined);
            const featureWorld = await featureMakeParty(1);
            const featureCrossing = await conductBilateralExchange({
                initiator: { ...featureVisitor, evaluateCounterparty: featureEvaluator(1) },
                responder: { ...featureWorld, evaluateCounterparty: featureEvaluator(1) },
                now: featureNow,
                ttlSeconds: 3600,
            });
            const featureEventChain = featureCreateEventChain({ subject: featureVisitor.did });
            featureAppendChainEvent(featureEventChain, { eventClass: "session-admitted", subject: featureVisitor.did, reason: "bilateral-authorisation-completed" });
            featureAppendChainEvent(featureEventChain, { eventClass: "cross-fabric-portal-cleared", subject: featureVisitor.did, reason: "portal-crossing-cleared" });
            featureAppendChainEvent(featureEventChain, { eventClass: "departure", subject: featureVisitor.did, reason: "session-completed" });
            featureSealEventChain(featureEventChain, { at: featureNow });
            const featureDeparture = await buildSealedDepartureManifest({
                eventChain: featureEventChain,
                hashChain: featureCrossing.chain,
                subject: featureVisitor.did,
                issuedAt: featureNow,
                privateKeyInput: featureVisitor.privateKeyInput,
            });
            const featureSealedEntity = featureDeparture.facets[0].entity;
            const featureChainReport = await featureVerifyReceiptChain(featureCrossing.chain, {
                expectChainId: featureCrossing.session.sessionId,
                expectHead: { headSeq: featureSealedEntity.seq, headHash: featureSealedEntity.prevHash },
            });
            const featurePair = correlateReceiptPair([featureCrossing.receipts.byInitiator, featureCrossing.receipts.byResponder], featureCrossing.exchangeId);
            const featurePanel = bilateralPanelRecord(featureCrossing.session, {
                floor: featureCrossing.floor,
                admission: featureCrossing.admission,
                chainReport: featureChainReport,
            });
            packet.avatar_context.um_bilateral_session_v04 = {
                panel: featurePanel,
                admitted: featureCrossing.admitted,
                exchangeId: featureCrossing.exchangeId,
                chain_verified: featureChainReport.valid,
                head_anchor: "SIGNED departure-facet seal (expectHead) — V1 tail-truncation protection live",
                correlated_pair_found: featurePair.ok && featurePair.found === 2,
                departure_manifest_id: featureDeparture["@id"] || null,
                um_conformance_claimed: false,
                note: "runtime bilateral crossing: paired receipts + Profile-A-signed hash chain (chainId = sessionId), head pinned to the SIGNED departure-facet seal. EXT-OPT O3/O4 PREVIEW; Base §4 fields not preview. Authoritative gate runtime-verify.mjs.",
            };
            transport.emitSyntheticApiRequest({
                method: "BILATERAL",
                url: featureCrossing.session.sessionId,
                path: featureCrossing.exchangeId,
                status: featureCrossing.admitted ? 200 : 403,
                ok: featureCrossing.admitted,
                ms: 0,
                schema: `um:BilateralSession · ${featureCrossing.session.state} · chain ${featureChainReport.valid ? "verified" : "BROKEN"}`,
                ...featurePanel,
            });
        }
        catch (bilErr) {
            packet.avatar_context.um_bilateral_session_v04 = { error: (bilErr && bilErr.message) || "bilateral-session-surface-threw" };
        }
        try {
            const featurePanel = buildPrivateDataPanel();
            packet.avatar_context.um_private_data_v04 = featurePanel;
            for (const row of featurePanel.rows) {
                transport.emitSyntheticApiRequest({
                    method: "PRIVATE-DATA",
                    url: row.facet || row.facetKeyRef || featurePanel.label,
                    path: row.kind,
                    status: row.decision === "reject" ? 403 : 200,
                    ok: row.decision !== "reject",
                    ms: 0,
                    schema: `um:PrivateData · ${row.code || row.kind} (PREVIEW)`,
                });
            }
        }
        catch (pdErr) {
            packet.avatar_context.um_private_data_v04 = { error: (pdErr && pdErr.message) || "private-data-surface-threw" };
        }
        try {
            const featureNow = new Date().toISOString();
            const featureKeys = await featureGenerateKeyPair();
            const featureUnsigned = {
                "@context": "https://universalmanifest.net/ns/v0.4",
                "@id": `urn:uuid:${globalThis.crypto.randomUUID()}`,
                "@type": "um:Manifest",
                manifestVersion: "0.4",
                subject: manifest.subject || didKey || "did:web:demo.local:user:runtime",
                issuedAt: featureNow,
                expiresAt: new Date(Date.parse(featureNow) + 3600_000).toISOString(),
            };
            const featureScenario = await runFormatIndependenceScenario({
                name: "portal-crossing (format independence)",
                unsignedManifest: featureUnsigned,
                evaluationContext: { now: featureNow, intendedScope: ["read"] },
                privateKeyInput: featureKeys.privateKey,
            });
            packet.avatar_context.um_format_independence_v04 = buildFormatIndependencePanel(featureScenario);
        }
        catch (fmtErr) {
            packet.avatar_context.um_format_independence_v04 = { error: (fmtErr && fmtErr.message) || "format-independence-surface-threw" };
        }
        try {
            const featureKeys = await featureGenerateKeyPair();
            const featureDemo = await runFactoryFloorSomDemo({ privateKeyInput: featureKeys.privateKey, now: new Date().toISOString() });
            const featurePanel = somGatingPanelRecord(featureDemo.session, { chainReport: featureDemo.sealed && featureDemo.sealed.chainReport });
            packet.avatar_context.um_rp1_som_gating_v04 = {
                panel: featurePanel,
                bucket: feature_SOM_CONFORMANCE.bucket,
                cross_branch_write_blocked: featureDemo?.writes?.crossBranchBlocked?.allowed === false,
                hazard_reroute_delivered: featureDemo?.messages?.hazardReroute?.delivered === true,
                ad_push_refused: featureDemo?.messages?.adPushRefused?.allowed === false,
                chain_verified: !!(featureDemo.sealed && featureDemo.sealed.chainReport && featureDemo.sealed.chainReport.valid),
                um_conformance_claimed: false,
                claim_label: feature_SOM_CONFORMANCE.claim_label,
            };
            transport.emitSyntheticApiRequest({
                method: "RP1-SOM",
                url: (featureDemo.session && featureDemo.session.hashChain && featureDemo.session.hashChain.chainId) || "R6+R7",
                path: "R6+R7",
                status: featureDemo?.writes?.crossBranchBlocked?.allowed === false && featureDemo?.messages?.hazardReroute?.delivered === true ? 200 : 500,
                ok: !!(featureDemo.sealed && featureDemo.sealed.chainReport && featureDemo.sealed.chainReport.valid) &&
                    featureDemo?.writes?.crossBranchBlocked?.allowed === false &&
                    featureDemo?.messages?.adPushRefused?.allowed === false,
                ms: 0,
                schema: `rp1:SOMBranchAuthorization+rp1:InterServiceAuthorization · ${feature_SOM_CONFORMANCE.bucket}`,
                ...featurePanel,
            });
        }
        catch (somErr) {
            packet.avatar_context.um_rp1_som_gating_v04 = { error: (somErr && somErr.message) || "rp1-som-gating-surface-threw" };
        }
        return {
            signed: true,
            standard: "Universal Manifest v0.4",
            signature_profile: "A (Ed25519 + JCS-RFC8785)",
            did_subject: didKey || manifest.subject || null,
            key_ref: manifest.signature.keyRef || null,
            manifest_id: manifest["@id"] || null,
            um_conformance_claimed: false,
            note: "signed on exit; verified on arrival. Schema-valid v0.4 + Signature Profile A; NOT evaluator-conformant.",
        };
    }
    catch (e) {
        return { signed: false, error: (e && e.message) || "sign-on-exit threw" };
    }
}
async function featureVerifyManifestFromPacket(packet) {
    const manifest = packet && packet.avatar_context && packet.avatar_context.um_manifest_v04
        ? packet.avatar_context.um_manifest_v04
        : null;
    if (!manifest) {
        return { present: false, verified: null, reason: "no-signed-manifest-in-packet" };
    }
    try {
        const report = await umVerifyManifestSignatureDetailed(manifest);
        return {
            present: true,
            verified: report.ok === true,
            reason: report.reason,
            checks: report.checks || {},
            did_subject: manifest.subject || null,
            key_ref: manifest.signature && manifest.signature.keyRef ? manifest.signature.keyRef : null,
            manifest_id: manifest["@id"] || null,
            handoff_id: (packet && packet.handoff_id) || null,
            standard: "Universal Manifest v0.4 · Signature Profile A",
            um_conformance_claimed: false,
            verified_at: new Date().toISOString(),
        };
    }
    catch (e) {
        return { present: true, verified: false, reason: `verify-threw:${(e && e.message) || "error"}` };
    }
}
export class LiveAdapter extends EventTarget {
    constructor(role, opts = {}) {
        super();
        if (role !== "source" && role !== "target" && role !== "player") {
            throw new Error(`invalid role: ${role} (expected 'source'|'target'|'player')`);
        }
        this._transport = opts.transport || DEFAULT_LIVE_ADAPTER_TRANSPORT;
        this._portalAtomicityOracle = ["microtask", "task", "raf", "all"].includes(opts.portalAtomicityOracle)
            ? opts.portalAtomicityOracle
            : null;
        this.role = role;
        this.clientMode = role === "player" ? "player" : "observer";
        this._noDefaultEquipment = !!opts.noDefaultEquipment;
        this.wowIntent = opts.wowIntent || null;
        this._wowRegistersPresence = this.wowIntent ? this.wowIntent.registersPresence !== false : true;
        this.wowFollowTarget = this.wowIntent ? (this.wowIntent.followTarget || null) : null;
        this.activeEndpointKey = endpointKeyForRole(role, opts.active);
        this.previewEndpointKey = role === "player" ? oppositeEndpointKey(this.activeEndpointKey) : null;
        this.endpoint = ENDPOINTS[this.activeEndpointKey];
        this.previewEndpoint = this.previewEndpointKey ? ENDPOINTS[this.previewEndpointKey] : null;
        this.base = this.endpoint.proxy_base;
        this.baseA = BASE_A;
        this.baseB = BASE_B;
        this.fabricUrl = opts.fabricUrl || null;
        this.rootIsMsf = false;
        this._msfRead = null;
        this._msfChildRead = null;
        this._msfChildModuleRun = null;
        if (this.fabricUrl) {
            this.rootFabricSource = this.fabricUrl;
            this.rootIsMsf = /\.msf(\?|#|$)/i.test(this.fabricUrl);
            const pageHref = typeof location !== "undefined" ? location.href : "http://127.0.0.1/";
            try {
                this.base = new URL("./", new URL(this.fabricUrl, pageHref)).href.replace(/\/$/, "");
            }
            catch (e) {
                this.base = String(this.fabricUrl).replace(/[^/]*$/, "").replace(/\/$/, "");
            }
        }
        this.wowRef = opts.wowRef || null;
        this._wowResolved = null;
        this._wowSceneSource = null;
        this._movementBounds = null;
        this._wowLocalWalk = false;
        this._airportWalkableSurface = null;
        this._runCalibration = null;
        this.mode = "live";
        this.world = null;
        this._startsEmbodied = role === "source" || role === "player";
        this.state = {
            phase: this._startsEmbodied ? HANDOFF_PHASES.IDLE : HANDOFF_PHASES.WAITING,
            handoff_id: null,
            arrival_count: 0,
            avatar: null,
            equipment_status: null,
            preview: null,
            portal_previews: null,
            _provenance: PROVENANCE.LIVE,
            controls: {
                enabled: this._startsEmbodied,
                moving: false,
                movement_mode: "idle",
                run_mode: false,
                speed_mps: 0,
                grounded: true,
                jump_height_m: 0,
                portal_distance_m: null,
                portal_center: null,
                portal_radius_m: null,
                portal_frame: null,
                portal_target_frame: null,
                portal_frame_id: null,
                portal_frame_position: null,
                portal_frame_forward: null,
                portal_frame_up: null,
                portal_frame_right: null,
                portal_frame_width_m: null,
                portal_frame_height_m: null,
                portal_trigger_depth_m: null,
                portal_linked_target_portal_id: null,
                portal_local_coordinates: null,
                portal_signed_plane_distance_m: null,
                portal_plane_distance_abs_m: null,
                portal_inside_oval_aperture: false,
                inside_oval_aperture: false,
                inside_trigger_volume: false,
                portal_crossing_direction: "unknown",
                portal_last_crossing_direction: null,
                portal_entry_crossing_direction: null,
                portal_traversal_mode: null,
                portal_allowed_entry_side: null,
                portal_blocked_entry_side: null,
                portal_current_entry_side: null,
                portal_entry_side_allowed: true,
                portal_traversal_rejected_count: 0,
                portal_last_traversal_rejection: null,
                portal_frame_mapping: null,
                mapped_exit_transform: null,
                mapped_exit_yaw: null,
                portal_target_location_id: null,
                portal_target_world_id: null,
                portal_trigger_rearmed: this._startsEmbodied,
                portal_rearm_required: false,
                portal_exited_since_arrival: this._startsEmbodied,
                portal_handoff_source_ready: false,
                portal_handoff_target_ready: false,
                portal_handshake_ready: false,
                return_handshake_ready: false,
                portal_ready_blocker: "init",
                inside_portal_trigger: false,
                auto_handoff_ready: false,
                movement_direction: "none",
                last_planar_delta: [0, 0, 0],
                facing_semantics: "still",
                portal_transition_phase: "none",
                portal_transition_elapsed_s: 0,
                portal_transition_phase_history: [],
            },
            last_handoff_direction: null,
            last_handoff_payload: null,
            last_pose_payload: null,
            player_handoff_profile: null,
        };
        this._boundaryOk = false;
        this._boundaryProblems = [];
        this._portalId = this.endpoint.portal_id;
        this._jumpVelocity = 0;
        this._serverSyncMs = 0;
        this._nonPortalHandoffInFlight = false;
        this._clientId = `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        this._playerContextMarker = role === "player" || this.rootIsMsf ? makePlayerContextMarker() : null;
        this._markerAtLoad = this._playerContextMarker
            ? Object.freeze({
                marker_id: this._playerContextMarker.marker_id,
                context_id: this._playerContextMarker.context_id,
                created_at: this._playerContextMarker.created_at,
                boot_href: this._playerContextMarker.boot_href,
                navigation_entry_count_at_boot: this._playerContextMarker.navigation_entry_count_at_boot,
            })
            : null;
        this._bootEndpointKey = this.activeEndpointKey;
        this._navigator = null;
        this._childFabricManifest = null;
        this._rootFabricManifest = null;
        this._navigatorPromotions = [];
        this._lastCameraTransform = null;
        this._visualTransitionSnapshot = null;
        this._wowEndpoints = null;
        this._wowEndpointResolution = null;
        this._viewMatch = null;
        this._rootFabricManifestUrl = null;
        this._rp1FailClosed = { demo_mode: "off", last_receipt: null, allow_count: 0, deny_count: 0 };
        this._fabricPrefetchController = createFabricPrefetchController({
            getJson: (url) => this._transport.getJson(url),
            nowMs: () => Date.now(),
            nowIso: () => new Date().toISOString(),
            setIntervalFn: (fn, ms) => setInterval(fn, ms),
            clearIntervalFn: (id) => clearInterval(id),
            setTimeoutFn: (fn, ms) => setTimeout(fn, ms),
            resolveProxyBase: (address) => this._fabricProxyBaseForAddress(address),
            portalKey: fabricPortalKey,
            normalizeTraversal: normalizePortalTraversal,
            portalEntrySideAllowed,
            adoptDestinationPortalPose: (machine, portalPose) => this._adoptDestinationPortalPoseForMachine(machine, portalPose),
            onTargetSetChanged: () => {
                if (this._runtimeStreams)
                    this._syncPresenceEventStreams();
            },
            emitState: () => this._emit(),
            log: (message) => this._log(message),
            readCacheCapFixture: () => {
                if (typeof window === "undefined" || !window.location || !window.location.search)
                    return null;
                return new URLSearchParams(window.location.search).get("fabric_cache_cap_bytes");
            },
            getActiveBase: () => this.base,
            getAvatarPose: () => (this.state ? this.state.avatar : null),
        });
        const fabricCompatibilityViews = {
            _fabricPrefetchMachines: "machines",
            _fabricPrefetchScheduler: "scheduler",
            _fabricCompletion: "completion",
            _lastPromotedFabricPrefetch: "lastPromoted",
            _lobbyDestinationOccupancy: "lobbyOccupancy",
            _fabricPresenceTimer: "presenceTimer",
            _lobbyDestinationOccupancyTimer: "lobbyOccupancyTimer",
            _fabricCacheCap: "cacheCap",
            _fabricCacheStats: "cacheStats",
        };
        for (const [property, stateKey] of Object.entries(fabricCompatibilityViews)) {
            Object.defineProperty(this, property, {
                configurable: true,
                enumerable: false,
                get: () => this._fabricPrefetchController.compatibilityState()[stateKey],
            });
        }
        for (const property of [
            "FABRIC_PREFETCH_PRESENCE_REFRESH_MS",
            "FABRIC_PREFETCH_MAX_ATTEMPTS",
            "FABRIC_PREFETCH_RETRY_BACKOFF_MS",
            "FABRIC_PREFETCH_MAX_ACTIVE_LOADS",
            "FABRIC_PREFETCH_PREEMPT_MARGIN_M",
            "LOBBY_DESTINATION_OCCUPANCY_REFRESH_MS",
            "FABRIC_PREFETCH_CHUNKED_ENABLED",
            "FABRIC_PREFETCH_CHUNK_MAX_ENTITIES",
            "FABRIC_PREFETCH_CHUNK_MAX_BYTES",
            "FABRIC_PREFETCH_CHUNK_YIELD_MS",
            "FABRIC_PREFETCH_CACHE_MAX_BYTES",
            "FABRIC_COMPLETION_PACING_MS",
            "FABRIC_COMPLETION_CHUNK_MAX_ENTITIES",
            "FABRIC_COMPLETION_MAX_CHUNKS",
        ]) {
            Object.defineProperty(this, property, {
                configurable: true,
                enumerable: false,
                get: () => this._fabricPrefetchController[property],
                set: (value) => { this._fabricPrefetchController[property] = value; },
            });
        }
        this._presenceController = createPresenceController({
            transport: this._transport,
            clientMode: this.clientMode,
            playerId: this._clientId,
            clientId: this._clientId,
            supported: this._wowRegistersPresence,
            getBase: () => this.base,
            getLocationId: () => (this.world ? this.world.location_id : null),
            getAvatar: () => this.state.avatar || (this.world && this.world.avatar),
            getHandoffInFlight: () => this._nonPortalHandoffInFlight ||
                !!(this._portalTraversalController && this._portalTraversalController.inFlight()),
            onForcePose: (input) => this._maybeBroadcastPlayerPose(input),
            onCloseEventStreams: () => this._closePresenceEventStreams(),
            onLog: (message) => this._log(message),
        });
        this._peers = createPeerPresenceReducer({
            clientMode: this.clientMode,
            clientId: this._clientId,
            controlledIdentity: () => this._presenceController.controlledIdentity(),
            getContext: () => ({
                world: this.world,
                avatar: this.state.avatar,
                controls: this.state.controls,
                phase: this.state.phase,
                wowLocalWalk: this._wowLocalWalk,
            }),
            defaultAvatarVariant: DEFAULT_AVATAR_VARIANT,
            onEmit: (input) => this._emit(input),
            onArrival: (packet) => this.applyArrival(packet),
            onDepartureMirror: (packet) => this._applyDepartureMirror(packet),
            onArrivalMirror: (packet) => this._applyArrivalMirror(packet),
            onResolveEquipment: (items) => resolveEquipmentItems(items),
            onEquipmentStatus: (status) => { this.state.equipment_status = status; },
            onExternalPresenceDeparture: (input) => this._applyPresenceDepartureProjections(input),
        });
        this._runtimeStreams = createRuntimeStreamController({
            getActiveEndpointKey: () => this.activeEndpointKey,
            getDesiredEventEndpointKeys: () => this._presenceEventEndpointKeys(),
            isEndpointKey: (endpointKey) => !!ENDPOINTS[endpointKey],
            onRuntimeState: (message) => {
                const debug = message && message.state && message.state.debug;
                this._log(`runtime-state tick rev=${debug && debug.state_revision} input=${debug && debug.last_input_source}`);
            },
            onPresenceDeparture: (endpointKey, message) => this._applyPresenceDeparture(endpointKey, message),
            onPresenceDepartureApplied: (record) => this._emitPresenceDeparture(record),
            onLog: (message) => this._log(message),
            fallbackPollMs: () => this.FABRIC_PREFETCH_PRESENCE_REFRESH_MS,
            fallbackPeerStaleMs: PEER_PRESENCE_TIMING.stale_ms,
            fallbackServerTtlMs: PRESENCE_TIMING.requested_ttl_ms,
        });
        const readTraversalHostSnapshot = () => ({
            role: this.role,
            clientMode: this.clientMode,
            startsEmbodied: this._startsEmbodied,
            clientId: this._clientId,
            activeEndpointKey: this.activeEndpointKey,
            endpoint: this.endpoint,
            resolveEndpoint: (endpointKey) => ENDPOINTS[endpointKey],
            base: this.base,
            world: this.world,
            phase: this.state.phase,
            handoffId: this.state.handoff_id,
            arrivalCount: this.state.arrival_count,
            avatar: this.state.avatar,
            controls: this.state.controls,
            portalId: this._portalId,
            lastCameraTransform: this._lastCameraTransform,
            playerContextMarker: this._playerContextMarkerDebug(),
        });
        const applyTraversalPatch = (patch) => {
            const has = (name) => Object.prototype.hasOwnProperty.call(patch, name);
            if (has("phase"))
                this.state.phase = patch.phase;
            if (has("handoffId"))
                this.state.handoff_id = patch.handoffId;
            if (has("arrivalCount"))
                this.state.arrival_count = patch.arrivalCount;
            if (has("controls"))
                Object.assign(this.state.controls, patch.controls || {});
            if (has("avatar")) {
                if (patch.avatarMode === "merge" && this.state.avatar && patch.avatar) {
                    Object.assign(this.state.avatar, patch.avatar);
                }
                else {
                    this.state.avatar = patch.avatar;
                }
            }
            if (has("equipmentStatus"))
                this.state.equipment_status = patch.equipmentStatus;
            if (has("lastHandoffDirection"))
                this.state.last_handoff_direction = patch.lastHandoffDirection;
            if (has("lastHandoffPayload"))
                this.state.last_handoff_payload = patch.lastHandoffPayload;
            if (has("lastPosePayload"))
                this.state.last_pose_payload = patch.lastPosePayload;
            if (has("playerHandoffProfile"))
                this.state.player_handoff_profile = patch.playerHandoffProfile;
        };
        this._portalTraversalController = createPortalTraversalHandoffController({
            handoffPhases: HANDOFF_PHASES,
            provenance: PROVENANCE,
            transport: {
                getJson: (url) => this._transport.getJson(url),
                postJson: (url, body) => this._transport.postJson(url, body),
            },
            nowMs: () => Date.now(),
            nowIso: () => new Date().toISOString(),
            readHostSnapshot: readTraversalHostSnapshot,
            applyTraversalPatch,
            resolveEndpointForLocation: endpointKeyForLocation,
            oppositeEndpointKey,
            endpointDebug,
            promoteActiveEndpoint: async (targetKey, packet) => {
                const promotion = await this._promoteActiveEndpoint(targetKey, packet);
                return { promotion, destinationSceneSource: this._lastCrossingSceneSource || null };
            },
            deriveFabricExitPose: (frameMapping) => this._fabricDerivedExitPose(frameMapping),
            recordMarkerComparison: () => this._recordMarkerCrossingComparison(),
            previewDebug: () => this._previewDebug(),
            navigatorDebug: () => this._navigatorDebug(),
            broadcastPlayerPose: (input) => this.broadcastPlayerPose(input),
            emitState: () => this._emit(),
            dispatchCrossing: (detail) => this.dispatchEvent(new CustomEvent("crossing", { detail })),
            visualTransition: {
                begin: (input) => this.beginVisualTransition(input),
                commit: () => this.commitVisualTransition(),
                abort: (input) => this.abortVisualTransition(input),
            },
            portalAtomicityOracle: this._portalAtomicityOracle,
            log: (message) => this._log(message),
            presence: {
                controlledIdentity: () => ({
                    ...this.controlledIdentity(),
                    player_id: this.controlledIdentity().player_id,
                }),
                snapshot: () => this.presenceSnapshot(),
                departPresence: (input) => this.departPresence(input),
                registerPresence: (input) => this.registerPresence(input),
            },
            peers: {
                broadcast: (message) => this._broadcast(message),
                clearLivePlayerPose: () => this._peers.clearLivePlayerPose(),
            },
            prefetch: {
                proofBlock: (commitIso, portalKey) => this._fabricPrefetchProofBlock(commitIso, portalKey),
            },
            policy: {
                evaluateRp1Gate: () => this._rp1GateCheck(),
            },
            crypto: {
                signManifest: (packet) => featureSignManifestOntoPacket(packet, this.world, this._transport),
                verifyManifest: (packet) => featureVerifyManifestFromPacket(packet),
            },
            assets: {
                defaultEquippedItems,
                resolveEquipmentItems,
                defaultAvatarVariant: DEFAULT_AVATAR_VARIANT,
            },
            validation: {
                transformSnapshot,
            },
            motionPreference: opts.motionPreference,
            movement: {
                speedMps: MOVE_SPEED_MPS,
                facingSemanticsFromDelta,
            },
        });
        const resolveClientGraph = async (target) => {
            const previousRef = this.wowRef;
            const previousResolved = this._wowResolved;
            this.wowRef = target.graph_endpoint;
            try {
                return await this.initWow();
            }
            finally {
                this.wowRef = previousRef;
                this._wowResolved = previousResolved;
            }
        };
        const readClientSceneHostState = () => ({
            clientMode: this.clientMode,
            activeEndpointKey: this.activeEndpointKey,
            previewEndpointKey: this.previewEndpointKey,
            endpoint: this.endpoint,
            previewEndpoint: this.previewEndpoint,
            base: this.base,
            portalId: this._portalId,
            world: this.world,
            controls: this.state.controls,
            preview: this.state.preview,
            portalPreviews: this.state.portal_previews,
            phase: this.state.phase,
            arrivalCount: this.state.arrival_count,
            movementBounds: this._movementBounds,
            wowLocalWalk: this._wowLocalWalk,
            wowResolved: this._wowResolved,
            wowSceneSource: this._wowSceneSource,
            boundaryOk: this._boundaryOk,
            boundaryProblems: this._boundaryProblems,
            avatar: this.state.avatar,
            equipmentStatus: this.state.equipment_status,
        });
        const installClientSceneState = ({ origin, target, contract, resolved, bounds, spawn, avatar }) => {
            this._airportWalkableSurface = createAirportWalkableSurfaceContract(resolved.graph);
            if (!this._airportWalkableSurface.ok) {
                throw new Error(`airport walkable-surface contract invalid: ${this._airportWalkableSurface.reason}`);
            }
            const entryGround = this._resolveAvatarGround(spawn[0], spawn[2]);
            if (!entryGround.ok)
                throw new Error(`airport entry ground resolution failed: ${entryGround.reason}`);
            spawn[1] = entryGround.surface_y_m;
            const sourcePortal = (origin.world?.portals || []).find((portal) => fabricPortalKey(portal) === target.portal_id) || origin.world?.portal || null;
            const reciprocalResult = automaticReciprocalPortal({
                sourcePortal,
                destinationSpatialId: contract.spatial_id,
                originWorld: origin.world,
                destinationPortals: resolved.graph?.portals,
            });
            const reciprocalPortal = reciprocalResult.portal || null;
            this._wowResolved = resolved;
            this._wowSceneSource = {
                ok: true,
                via: "client_scene_load",
                msf_dependency: false,
                resolved_from: target.graph_endpoint,
                graph_url: resolved.graph_url,
                spatialID: resolved.spatialID,
                node_count: resolved.node_count,
                resolved_at: new Date().toISOString(),
            };
            this.world = {
                _provenance: PROVENANCE.LIVE,
                role_binding: this.role,
                location_id: contract.spatial_id,
                world_id: contract.spatial_id,
                session_id: origin.world ? origin.world.session_id : null,
                title: resolved.graph.title || "Denver Skyport",
                claim_boundary: {
                    application_level_handoff: false,
                    native_teleportxr_teleport: false,
                    first_party_teleportxr_browser_rendering: false,
                    standards_conformance: false,
                },
                portal: reciprocalPortal,
                portals: reciprocalPortal ? [reciprocalPortal] : [],
                avatar: {
                    _provenance: PROVENANCE.LIVE,
                    avatar_id: avatar.avatar_id,
                    continuity_id: avatar.continuity_id,
                    display_name: avatar.display_name,
                    spawn_position: spawn.slice(),
                    rotation_y: contract.entry_spawn.rotation_y,
                },
                arrival: { kind: "client_scene_load", position: spawn.slice() },
                initial_arrival_count: 0,
            };
            this._boundaryOk = true;
            this._boundaryProblems = [];
            this._wowLocalWalk = true;
            this._movementBounds =
                bounds && Number.isFinite(Number(bounds.minX)) && Number.isFinite(Number(bounds.maxX))
                    ? {
                        minX: Number(bounds.minX),
                        maxX: Number(bounds.maxX),
                        minZ: Number(bounds.minZ),
                        maxZ: Number(bounds.maxZ),
                    }
                    : null;
            avatar.position = spawn;
            avatar.rotation_y = contract.entry_spawn.rotation_y;
            this.state.phase = HANDOFF_PHASES.IDLE;
            this.state.arrival_count = 0;
            this.state.preview = reciprocalPortal ? {
                state: "active",
                source_type: "automatic_reciprocal_origin_snapshot_labeled",
                readonly: true,
                location_id: origin.world.location_id,
                world_id: origin.world.world_id,
                target_portal_id: target.portal_id,
                linked_source_portal_id: reciprocalPortal.string_portal_id,
                captured_at: new Date().toISOString(),
                fallback_reason: null,
                projection_frame_source: "automatic_reciprocal_inverse_frames",
                source_camera_relative_to_portal: {},
                target_preview_camera_transform: {},
                preview_projection_transform: {},
            } : null;
            this.state.portal_previews = null;
            this.state.controls = {
                ...origin.controls,
                enabled: true,
                moving: false,
                movement_mode: "idle",
                run_mode: false,
                speed_mps: 0,
                grounded: true,
                jump_height_m: 0,
                movement_direction: "none",
                last_planar_delta: [0, 0, 0],
                portal_focus_portal_id: null,
                portal_count: 0,
                portals: [],
                ground_query_ok: true,
                ground_query_reason: null,
                ground_surface_id: entryGround.surface_id,
                ground_y_m: entryGround.surface_y_m,
                logical_ground_y_m: entryGround.surface_y_m,
                rendered_surface_y_m: entryGround.surface_y_m,
                ground_query_xz_m: [entryGround.query_x_m, entryGround.query_z_m],
                ground_resolver_source: entryGround.resolver_source,
            };
            avatar.locomotion = this.state.controls;
            this._jumpVelocity = 0;
            this._portalTraversalController.reset({ reason: "client_scene_load", startsEmbodied: false });
            return {
                activeEndpointKey: this.activeEndpointKey,
                endpoint: this.endpoint,
                world: this.world,
                reciprocal: reciprocalResult,
            };
        };
        const restoreLobbyState = ({ origin, avatar, equippedItems, arrival }) => {
            this._airportWalkableSurface = null;
            this.activeEndpointKey = origin.activeEndpointKey;
            this.previewEndpointKey = origin.previewEndpointKey;
            this.endpoint = origin.endpoint;
            this.previewEndpoint = origin.previewEndpoint;
            this.base = origin.base;
            this._portalId = origin.portalId;
            this.world = origin.world;
            this._movementBounds = origin.movementBounds;
            this._wowLocalWalk = origin.wowLocalWalk;
            this._wowResolved = origin.wowResolved;
            this._wowSceneSource = origin.wowSceneSource;
            this._boundaryOk = origin.boundaryOk;
            this._boundaryProblems = origin.boundaryProblems;
            this.state.controls = JSON.parse(JSON.stringify(origin.controls || {}));
            this.state.phase = HANDOFF_PHASES.IDLE;
            this.state.arrival_count = origin.arrivalCount;
            this.state.preview = origin.preview;
            this.state.portal_previews = origin.portalPreviews;
            this.state.avatar = avatar;
            if (avatar) {
                const spawn = arrival && Array.isArray(arrival.position)
                    ? arrival.position.slice()
                    : this.world && this.world.avatar && Array.isArray(this.world.avatar.spawn_position)
                        ? this.world.avatar.spawn_position.slice()
                        : [0, 0, 0];
                avatar.position = spawn;
                avatar.rotation_y = arrival && Number.isFinite(Number(arrival.rotation_y))
                    ? Number(arrival.rotation_y)
                    : this.world && this.world.avatar ? this.world.avatar.rotation_y : 0;
                avatar.equippedItems = equippedItems;
                avatar.locomotion = this.state.controls;
            }
            this._jumpVelocity = 0;
            this._portalTraversalController.reset({ reason: "client_scene_return", startsEmbodied: true });
            return {
                activeEndpointKey: this.activeEndpointKey,
                endpoint: this.endpoint,
                world: this.world,
            };
        };
        this._clientSceneController = createClientSceneLifecycleController({
            nowIso: () => new Date().toISOString(),
            resolveClientGraph,
            readHostState: readClientSceneHostState,
            installClientSceneState,
            restoreLobbyState,
            endpointDebug,
            defaultEquippedItems,
            presence: {
                departPresence: (input) => this.departPresence(input),
                stopHeartbeat: () => this.stopPresenceHeartbeat(),
                clearRegistration: () => this.clearPresenceRegistration(),
                registerPresence: (input) => {
                    const registration = this.registerPresence(input);
                    if (input && input.spawnReason === "return_from_client_scene_load") {
                        void registration.catch((error) => this._log(`return presence registration continued after visual commit and failed: ${error.message}`));
                        return undefined;
                    }
                    return registration;
                },
            },
            runtimeStreams: {
                closeRuntimeStream: () => this.closeRuntimeStream(),
                connectRuntimeStream: (endpointKey) => this.connectRuntimeStream(endpointKey),
            },
            peers: {
                snapshot: () => this.peerPresenceSnapshot(),
                clear: () => this.clearPeerPresence(),
                restore: (snapshot) => this.restorePeerPresence(snapshot),
                broadcastPlayerPose: (input) => this.broadcastPlayerPose(input),
            },
            prefetch: {
                reset: (input) => this._fabricPrefetchController.reset(input),
            },
            updatePortalStatus: () => this._updatePortalStatus(),
            emitState: () => this._emit(),
            dispatchCrossing: (detail) => {
                this.commitVisualTransition();
                this.dispatchEvent(new CustomEvent("crossing", { detail }));
            },
        });
    }
    async init() {
        const ep = await this._resolveWowEndpoints();
        const wowWorld = await this._transport.getJson(ep.world.path);
        const wowPortals = await this._fetchWowPortals(ep, wowWorld);
        const wowPortal = wowPortals[0] || null;
        let wowUser = null;
        try {
            wowUser = await this._transport.getJson(ep.user.path);
        }
        catch (e) {
        }
        this._adoptPortalFrameId(wowPortal);
        this.world = worldFromLive(this.role, wowWorld, wowPortals, wowUser);
        this._umIdentity = await verifyUmIdentity(wowUser);
        if (this.world && this.world.avatar)
            this.world.avatar.identity = this._umIdentity;
        const check = validateProofBoundary(this.world.claim_boundary);
        this._boundaryOk = check.ok;
        this._boundaryProblems = check.problems;
        if (this._startsEmbodied)
            this._spawnEmbodiedAvatarState();
        if (this.role === "player")
            await this._initPlayerPreview();
        if (this.role === "player")
            await this._initWorldNavigator();
        if (this.role === "player") {
            const authoredEndpoint = authoredWowGraphEndpoint(wowWorld, this.base);
            await this._resolveWowSceneGraph({
                base: this.base,
                spatialId: wowWorldSpatialId(wowWorld),
                graphEndpoint: authoredEndpoint,
                resolvedFrom: authoredEndpoint
                    ? "active backend /wow/world advertised authored /wow/graph (initial load)"
                    : "active world /wow/world spatialID (initial load)",
            });
            this._adoptLiveAirportScenePhysics(this._wowResolved);
        }
        this.state.arrival_count = this.world.initial_arrival_count ?? 0;
        this._updatePortalStatus();
        if (this.clientMode === "player" && this.state.avatar) {
            await this._registerPresence("spawn");
        }
        this._connectRuntimeStream();
        this._syncPresenceEventStreams();
        this._emit();
        if (this.clientMode === "player")
            this._maybeBroadcastPlayerPose({ force: true });
        return this;
    }
    _adoptLiveAirportScenePhysics(resolved) {
        const isAirport = this.world?.location_id === "location-airport" &&
            resolved?.spatialID === "world-airport-terminal" &&
            resolved?.graph;
        if (!isAirport) {
            this._airportWalkableSurface = null;
            this._movementBounds = null;
            return null;
        }
        const contract = createAirportWalkableSurfaceContract(resolved.graph);
        if (!contract.ok) {
            throw new Error(`live airport walkable-surface contract invalid: ${contract.reason}`);
        }
        const walkable = contract.surfaces.filter((surface) => surface.classification === "walkable");
        this._airportWalkableSurface = contract;
        this._movementBounds = walkable.reduce((bounds, surface) => {
            const halfX = surface.size_m[0] / 2;
            const halfZ = surface.size_m[2] / 2;
            bounds.minX = Math.min(bounds.minX, surface.center_m[0] - halfX);
            bounds.maxX = Math.max(bounds.maxX, surface.center_m[0] + halfX);
            bounds.minZ = Math.min(bounds.minZ, surface.center_m[2] - halfZ);
            bounds.maxZ = Math.max(bounds.maxZ, surface.center_m[2] + halfZ);
            return bounds;
        }, { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });
        if (this.state.phase === HANDOFF_PHASES.IDLE && this.state.avatar) {
            const position = clonePosition(this.state.avatar.position, [0, 0, -3]);
            const ground = this._resolveAvatarGround(position[0], position[2]);
            if (!ground.ok)
                throw new Error(`live airport spawn grounding failed: ${ground.reason}`);
            position[1] = ground.surface_y_m;
            this.state.avatar.position = position;
            this.world.avatar.spawn_position = position.slice();
            this._publishGroundSurface(ground);
        }
        return contract;
    }
    _resolveAvatarGround(x, z) {
        if (!this._airportWalkableSurface) {
            return {
                ok: true,
                reason: null,
                query_x_m: Number(x),
                query_z_m: Number(z),
                surface_id: "legacy-world-ground-plane",
                surface_y_m: 0,
                classification: "walkable",
                resolver_source: "legacy_world_ground_plane",
            };
        }
        return resolveAirportGroundSurface(this._airportWalkableSurface, x, z);
    }
    _publishGroundSurface(query) {
        if (!this.state?.controls || !query)
            return;
        this.state.controls.ground_query_ok = query.ok === true;
        this.state.controls.ground_query_reason = query.reason || null;
        this.state.controls.ground_surface_id = query.surface_id || null;
        this.state.controls.ground_y_m = Number.isFinite(query.surface_y_m) ? query.surface_y_m : null;
        this.state.controls.logical_ground_y_m = Number.isFinite(query.surface_y_m) ? query.surface_y_m : null;
        this.state.controls.rendered_surface_y_m = Number.isFinite(query.surface_y_m) ? query.surface_y_m : null;
        this.state.controls.ground_query_xz_m = [query.query_x_m, query.query_z_m];
        this.state.controls.ground_resolver_source = query.resolver_source || null;
    }
    applyRestoredPose(pose) {
        if (this.role !== "player" || !this._startsEmbodied)
            return false;
        if (!pose || !Array.isArray(pose.position))
            return false;
        if (this.state.phase !== HANDOFF_PHASES.IDLE)
            return false;
        const px = Number(pose.position[0]);
        const pz = Number(pose.position[2]);
        if (!Number.isFinite(px) || !Number.isFinite(pz))
            return false;
        const ground = this._resolveAvatarGround(px, pz);
        if (!ground.ok)
            return false;
        const py = this._airportWalkableSurface
            ? ground.surface_y_m
            : Number.isFinite(Number(pose.position[1])) ? Number(pose.position[1]) : ground.surface_y_m;
        const restored = [px, py, pz];
        const yaw = Number.isFinite(Number(pose.rotation_y))
            ? Number(pose.rotation_y)
            : this.world && this.world.avatar
                ? this.world.avatar.rotation_y
                : 0;
        if (this.world && this.world.avatar) {
            this.world.avatar.spawn_position = restored.slice();
            this.world.avatar.rotation_y = yaw;
        }
        if (this.state.avatar) {
            this.state.avatar.position = restored.slice();
            this.state.avatar.rotation_y = yaw;
        }
        this._jumpVelocity = 0;
        if (this._airportWalkableSurface) {
            this._publishGroundSurface(ground);
            this.state.controls.grounded = true;
            this.state.controls.jump_height_m = 0;
            if (this.state.avatar)
                this.state.avatar.locomotion = { ...this.state.controls };
        }
        if (this._navigator) {
            this._navigator.restored_pose = {
                source: "manual_reload_session_restore",
                active_endpoint_key: this.activeEndpointKey,
                position: roundVec3(restored, 4),
                rotation_y: roundNumber(yaw, 6),
            };
        }
        this._updatePortalStatus();
        this._emit();
        if (this.clientMode === "player")
            this._maybeBroadcastPlayerPose({ force: true });
        return true;
    }
    _spawnEmbodiedAvatarState() {
        this.state.avatar = {
            avatar_id: this.world.avatar.avatar_id,
            continuity_id: this.world.avatar.continuity_id,
            display_name: this.world.avatar.display_name,
            position: this.world.avatar.spawn_position.slice(),
            rotation_y: this.world.avatar.rotation_y,
            locomotion: this.state.controls,
            equippedItems: this._noDefaultEquipment ? [] : defaultEquippedItems(),
            avatar_variant: DEFAULT_AVATAR_VARIANT,
            preferred_height_m: null,
            _provenance: PROVENANCE.LIVE,
        };
        this.state.equipment_status = {
            validation: validateEquippedItems(this.state.avatar.equippedItems),
            items: this.state.avatar.equippedItems.map((item) => ({
                itemId: item.itemId,
                mode: item.mode,
                attachmentPoint: item.attachmentPoint,
                assetUri: item.assetUri,
                fetch_ok: null,
                visible_fallback: false,
                message: "source item path prepared; fetch checked on destination",
            })),
        };
        return this.state.avatar;
    }
    spawnWowLocalAvatar(opts = {}) {
        const spawn = Array.isArray(opts.spawn) ? opts.spawn : [0, 0, 0, 0];
        const spawnPos = [Number(spawn[0]) || 0, Number(spawn[1]) || 0, Number(spawn[2]) || 0];
        const spawnYaw = Number.isFinite(Number(spawn[3])) ? Number(spawn[3]) : 0;
        const resolved = this._wowResolved || {};
        const spatialID = opts.spatialID || resolved.spatialID || "wow-world";
        this._airportWalkableSurface = spatialID === "world-airport-terminal"
            ? createAirportWalkableSurfaceContract(resolved.graph)
            : null;
        if (this._airportWalkableSurface && !this._airportWalkableSurface.ok) {
            throw new Error(`airport walkable-surface contract invalid: ${this._airportWalkableSurface.reason}`);
        }
        const spawnGround = this._resolveAvatarGround(spawnPos[0], spawnPos[2]);
        if (!spawnGround.ok)
            throw new Error(`avatar spawn has no classified walkable surface: ${spawnGround.reason}`);
        if (this._airportWalkableSurface)
            spawnPos[1] = spawnGround.surface_y_m;
        this.world = {
            _provenance: PROVENANCE.LIVE,
            role_binding: this.role,
            location_id: spatialID,
            world_id: spatialID,
            session_id: null,
            title: opts.title || "WoW world",
            claim_boundary: resolved.proof_boundary || {
                application_level_handoff: true,
                native_teleportxr_teleport: false,
                first_party_teleportxr_browser_rendering: false,
                standards_conformance: false,
            },
            portal: null,
            portals: [],
            avatar: {
                _provenance: PROVENANCE.LIVE,
                avatar_id: "avatar-local-001",
                continuity_id: "avatar-local-001",
                display_name: "poc-user",
                spawn_position: spawnPos.slice(),
                rotation_y: spawnYaw,
            },
            arrival: null,
            initial_arrival_count: 0,
        };
        this._boundaryOk = true;
        this._boundaryProblems = [];
        this._wowLocalWalk = true;
        const b = opts.bounds;
        this._movementBounds =
            b && Number.isFinite(Number(b.minX)) && Number.isFinite(Number(b.maxX))
                ? {
                    minX: Number(b.minX),
                    maxX: Number(b.maxX),
                    minZ: Number(b.minZ),
                    maxZ: Number(b.maxZ),
                }
                : null;
        this.state.phase = HANDOFF_PHASES.IDLE;
        this._spawnEmbodiedAvatarState();
        this._publishGroundSurface(spawnGround);
        if (this._airportWalkableSurface) {
            this.state.controls.grounded = true;
            this.state.controls.jump_height_m = 0;
            this.state.avatar.locomotion = { ...this.state.controls };
        }
        this.state.arrival_count = 0;
        this._updatePortalStatus();
        this._emit();
        return this.state.avatar;
    }
    async resolveClientSceneLoad(target) {
        return this._clientSceneController.resolve(target);
    }
    async resolvePortalDestinationContent(portalEntry) {
        const endpointKey = endpointKeyForLocation(portalEntry?.target_location_id);
        const endpoint = endpointKey ? ENDPOINTS[endpointKey] : null;
        if (!endpoint)
            throw new Error("portal destination endpoint is unavailable");
        const wowWorld = await this._transport.getJson(`${endpoint.proxy_base}/wow/world`);
        const authored = wowWorld?.webofworlds_extension?.authored_graph;
        if (authored?.endpoint) {
            const endpointPath = String(authored.endpoint);
            if (!endpointPath.startsWith("/")) {
                throw new Error("portal destination authored graph endpoint must be root-relative");
            }
            const graphUrl = `${endpoint.proxy_base}${endpointPath}`;
            const graph = await this._transport.getJson(graphUrl);
            return {
                kind: "authored_wow_graph",
                location_id: endpoint.location_id,
                world_id: endpoint.world_id,
                graph,
                graph_url: graphUrl,
                base_url: endpoint.proxy_base,
                revision: `${graph?.spatialID || endpoint.world_id}:${Object.keys(graph?.nodes || {}).length}`,
            };
        }
        const hostedPoint = await this.demoReadAttachPoint(endpointKey);
        return {
            kind: "legacy_world",
            location_id: endpoint.location_id,
            world_id: endpoint.world_id,
            revision: `${endpoint.location_id}:${wowWorld?.content?.version ?? "live"}:` +
                `hosted-${hostedPoint?.version ?? "unknown"}`,
            world: {
                location_id: endpoint.location_id,
                world_id: endpoint.world_id,
                title: wowWorld?.location?.title || wowWorld?.content?.label || endpoint.location_id,
                color: endpoint.location_id === "location-lobby" ? "#42d68a" : "#3aa0ff",
            },
            hosted_point: hostedPoint,
            subscribeHostedPoint: (listener) => {
                if (typeof listener !== "function")
                    return () => { };
                const handler = (event) => {
                    if (event?.detail?.endpoint_key !== endpointKey)
                        return;
                    listener(event.detail.attach_point);
                };
                this.addEventListener(HOSTED_ATTACH_POINT_EVENT, handler);
                return () => this.removeEventListener(HOSTED_ATTACH_POINT_EVENT, handler);
            },
        };
    }
    async enterClientSceneLoad({ target, contract, resolved, bounds } = {}) {
        return this._clientSceneController.enter({ target, contract, resolved, bounds });
    }
    async returnFromClientSceneLoad(options) {
        if (!options)
            return this._clientSceneController.returnToLobby();
        return this._clientSceneController.returnToLobby(options);
    }
    async _initPlayerPreview() {
        const portals = this.world && Array.isArray(this.world.portals) ? this.world.portals : [];
        if (portals.length > 1) {
            this.state.portal_previews = {};
            for (const portal of portals) {
                const key = fabricPortalKey(portal);
                const epKey = endpointKeyForLocation(portal.target_location_id);
                const endpoint = epKey ? ENDPOINTS[epKey] : null;
                if (!key || !endpoint)
                    continue;
                this.state.portal_previews[key] = await this._buildEndpointPreview(endpoint, {
                    applyReadOnlyDebug: portal === portals[0],
                });
            }
            const primaryKey = fabricPortalKey(portals[0]);
            this.state.preview =
                (primaryKey && this.state.portal_previews[primaryKey]) || null;
            return;
        }
        this.state.portal_previews = null;
        if (!this.previewEndpoint)
            return;
        this.state.preview = await this._buildEndpointPreview(this.previewEndpoint, {
            applyReadOnlyDebug: true,
        });
    }
    async _buildEndpointPreview(endpoint, opts = {}) {
        const preview = {
            state: "fallback",
            source_type: "target_static_placeholder_labeled",
            preview_source_type: "target_static_placeholder_labeled",
            readonly: true,
            preview_readonly: true,
            endpoint_key: endpoint.endpoint_key,
            proxy_base: endpoint.proxy_base,
            backend_base_url: endpoint.backend_base_url,
            location_id: endpoint.location_id,
            preview_target_location_id: endpoint.location_id,
            world_id: endpoint.world_id,
            preview_target_world_id: endpoint.world_id,
            session_id: endpoint.session_id,
            target_portal_id: endpoint.portal_id,
            preview_target_portal_id: endpoint.portal_id,
            linked_source_portal_id: this.endpoint.portal_id,
            freshness_ms: 0,
            preview_freshness_ms: 0,
            captured_at: null,
            fallback_reason: "live target render texture is not implemented in this local fallback verifier; showing a labeled target placeholder from read-only target metadata",
            preview_fallback_reason: "live target render texture is not implemented in this local fallback verifier; showing a labeled target placeholder from read-only target metadata",
            projection_frame_source: "source_portal_frame+target_portal_frame",
            target_arrival_count_before_preview: null,
            target_arrival_count_current: null,
            target_state_revision_before_preview: null,
            target_state_revision_current: null,
            target_handoff_context_before_preview: false,
            target_handoff_context_current: false,
            target_debug_last_input_source: null,
            target_avatar_presence_created: false,
            target_mutation_count_during_preview: 0,
            source_camera_relative_to_portal: {},
            target_preview_camera_transform: {},
            preview_projection_transform: {},
        };
        try {
            const targetFabric = await this._transport.getJson(`${endpoint.proxy_base}/fabric.json`).catch(() => null);
            const targetEp = resolveWowEndpoints(targetFabric, endpoint.proxy_base).endpoints;
            const [wowWorld, wowPortal, debugState] = await Promise.all([
                this._transport.getJson(targetEp.world.path),
                this._transport.getJson(targetEp.portal.path),
                this._transport.getJson(`${endpoint.proxy_base}/debug/state`),
            ]);
            const arrivalCount = Number(debugState && debugState.session && debugState.session.arrival_count) || 0;
            preview.location_id = wowWorld && wowWorld.location && wowWorld.location.id
                ? wowWorld.location.id
                : endpoint.location_id;
            preview.world_id = wowWorld && wowWorld.id ? wowWorld.id : endpoint.world_id;
            preview.session_id = wowWorld && wowWorld.session && wowWorld.session.id
                ? wowWorld.session.id
                : endpoint.session_id;
            const portalExt = wowPortal && wowPortal.webofworlds_extension ? wowPortal.webofworlds_extension : null;
            preview.target_portal_id = portalExt && typeof portalExt.portal_id === "string"
                ? portalExt.portal_id
                : endpoint.portal_id;
            preview.preview_target_location_id = preview.location_id;
            preview.preview_target_world_id = preview.world_id;
            preview.preview_target_portal_id = preview.target_portal_id;
            preview.captured_at = new Date().toISOString();
            preview.freshness_ms = 0;
            preview.preview_freshness_ms = 0;
            if (opts.applyReadOnlyDebug) {
                this.state.preview = preview;
                this._applyPreviewReadOnlyDebug(debugState, { initialize: true });
            }
            return preview;
        }
        catch (err) {
            preview.state = "error";
            preview.source_type = "none";
            preview.preview_source_type = "none";
            preview.fallback_reason = `target preview metadata unavailable: ${err.message}`;
            preview.preview_fallback_reason = preview.fallback_reason;
            return preview;
        }
    }
    async _ensureRootFabricMsf() {
        if (this._msfRead && this._msfReadUrl === this.fabricUrl)
            return this._msfRead;
        const allowStructured = typeof location !== "undefined" && !!location.search &&
            new URLSearchParams(location.search).get("verify") === "structured";
        const msf = await readMsf(this.fabricUrl, { allowStructured });
        this._msfRead = msf;
        this._msfReadUrl = this.fabricUrl;
        if (msf.manifest) {
            this._rootFabricManifest = msf.manifest;
            this._rootFabricManifestUrl = this.fabricUrl;
        }
        return msf;
    }
    async initMsf() {
        if (!this.fabricUrl)
            throw new Error("initMsf requires a fabricUrl (?fabric=)");
        const msf = await this._ensureRootFabricMsf();
        const scene = msf.scene || {};
        const portal = scene.portals && scene.portals.length ? scene.portals[0] : null;
        const verified = msf.result === "VERIFIED";
        const navigator = {
            subsystem: "world_navigator",
            profile: "omb.world-navigator.msf-read.v0.1",
            claim: "local web validation; reads a real OMB fabric file (their .msf); signature " +
                "VERIFIED against a SHIPPED test anchor (NOT OS-trust/public-PKI); root fabric WASM not run",
            context_id: this._playerContextMarker ? this._playerContextMarker.context_id : null,
            context_marker_id: this._playerContextMarker ? this._playerContextMarker.marker_id : null,
            single_context: true,
            status: verified ? "root_fabric_verified" : `root_fabric_${String(msf.result).toLowerCase()}`,
            active_fabric_role: "root",
            root_fabric: {
                url: this.fabricUrl,
                container: msf.manifest ? msf.manifest.container || null : null,
                status: verified ? "verified" : String(msf.result).toLowerCase(),
                fabric_role: "root",
                format: msf.format || "compact-jws-msf",
                signed: true,
                jws: msf.jws || null,
                node_count: scene.node_count || 0,
                type_histogram: scene.type_histogram || {},
            },
            portal_attachment: portal
                ? {
                    name: portal.name || null,
                    bSubtype: FABRIC_PORTAL_ATTACHMENT_SUBTYPE,
                    sReference: portal.sReference || null,
                    resolved_url: null,
                    note: "portal attachment present; explicit M4 follow verifies and executes the child before rendering",
                }
                : null,
            child_fabric: null,
            child_render: { active: false, reason: "child_not_followed" },
            portal_count: scene.portal_count || 0,
            fabrics_loaded: msf.manifest && msf.manifest.container ? [msf.manifest.container] : [],
            fabrics_loaded_count: msf.manifest && msf.manifest.container ? 1 : 0,
            transition_count: 0,
            transition_history: [],
            wasm_run: false,
            wasm_status: msf.wasm_status,
            modules_hash_ok: msf.modules_hash_ok,
            modules: msf.modules || [],
            scene: {
                node_count: scene.node_count || 0,
                type_histogram: scene.type_histogram || {},
                portal_count: scene.portal_count || 0,
            },
            label: msf.label || null,
        };
        this._navigator = navigator;
        this._msfNavigator = navigator;
        if (this._playerContextMarker) {
            this._playerContextMarker.fabrics_loaded = navigator.fabrics_loaded.slice();
            this._playerContextMarker.fabrics_loaded_count = navigator.fabrics_loaded_count;
            this._playerContextMarker.root_fabric_url = this.fabricUrl;
            this._playerContextMarker.child_fabric_url = null;
            this._playerContextMarker.upgraded_at = new Date().toISOString();
        }
        this._log(`msf-read: ${this.fabricUrl} -> ${msf.result}` +
            (msf.jws && msf.jws.anchor ? ` (anchor="${msf.jws.anchor}")` : "") +
            ` nodes=${scene.node_count || 0} portals=${scene.portal_count || 0} wasm_run=false`);
        return msf;
    }
    async followMsfChild(renderChild) {
        const navigator = this._msfNavigator || this._navigator;
        const root = await this._ensureRootFabricMsf();
        const rootContainer = root.manifest ? root.manifest.container || this.fabricUrl : this.fabricUrl;
        let childUrl = null;
        let runtimeFailure = {
            state: "unavailable",
            kind: "child_runtime_unavailable",
            source_state: "child_follow_started",
            recoverable: true,
            parent_retained: true,
            detail: "child follow did not complete",
        };
        try {
            if (!navigator || root.result !== "VERIFIED" || !root.manifest) {
                const trustRefusal = !!(root && root.jws && root.result !== "VERIFIED");
                runtimeFailure = {
                    ...runtimeFailure,
                    state: trustRefusal ? "refused" : "unavailable",
                    kind: trustRefusal ? "root_trust_refused" : "root_unavailable",
                    source_state: `root_fabric_${String(root && root.result ? root.result : "unavailable").toLowerCase()}`,
                    recoverable: !trustRefusal,
                };
                throw new Error("M4 child follow requires a VERIFIED root fabric");
            }
            if (typeof renderChild !== "function") {
                runtimeFailure = {
                    ...runtimeFailure,
                    state: "refused",
                    kind: "child_render_policy_refused",
                    source_state: "render_callback_missing",
                    recoverable: false,
                };
                throw new Error("M4 child follow requires a render callback");
            }
            const reference = navigator.portal_attachment && navigator.portal_attachment.sReference;
            if (!reference) {
                runtimeFailure = {
                    ...runtimeFailure,
                    state: "refused",
                    kind: "child_reference_refused",
                    source_state: "child_reference_missing",
                    recoverable: false,
                };
                throw new Error("verified root fabric has no child portal reference");
            }
            const pageHref = typeof window !== "undefined" && window.location
                ? window.location.href
                : "http://127.0.0.1/";
            const parentUrl = new URL(this.fabricUrl, pageHref);
            childUrl = new URL(reference, parentUrl).href;
            if (!/^https?:$/i.test(new URL(childUrl).protocol)) {
                runtimeFailure = {
                    ...runtimeFailure,
                    state: "refused",
                    kind: "child_reference_refused",
                    source_state: "child_protocol_unsupported",
                    recoverable: false,
                };
                throw new Error(`unsupported child fabric URL protocol: ${new URL(childUrl).protocol}`);
            }
            navigator.portal_attachment.resolved_url = childUrl;
            navigator.status = "child_verifying";
            navigator.active_fabric_role = "root";
            navigator.child_fabric = { url: childUrl, status: "verifying", fabric_role: "child" };
            navigator.child_render = { active: false, reason: "verification_in_progress" };
            const child = await readMsf(childUrl);
            if (child.result !== "VERIFIED" || !child.manifest || child.modules_hash_ok !== true) {
                if (child.result !== "VERIFIED" || !child.manifest) {
                    const trustRefusal = !!child.jws;
                    runtimeFailure = {
                        ...runtimeFailure,
                        state: trustRefusal ? "refused" : "unavailable",
                        kind: trustRefusal ? "child_trust_refused" : "child_unavailable",
                        source_state: trustRefusal ? `child_${String(child.result).toLowerCase()}` : "child_unreadable",
                        recoverable: !trustRefusal,
                    };
                }
                else {
                    const modulePolicyRefusal = child.modules_hash_ok === false || !Array.isArray(child.modules) || child.modules.length === 0;
                    runtimeFailure = {
                        ...runtimeFailure,
                        state: modulePolicyRefusal ? "refused" : "unavailable",
                        kind: modulePolicyRefusal ? "child_module_policy_refused" : "child_module_unavailable",
                        source_state: child.modules_hash_ok === false ? "module_hash_mismatch" : "module_unavailable",
                        recoverable: !modulePolicyRefusal,
                    };
                }
                throw new Error(`child fabric refused: result=${child.result} modules_hash_ok=${String(child.modules_hash_ok)}` +
                    `${child.error ? ` error=${child.error}` : ""}`);
            }
            const moduleRun = await runFabricMap(child.manifest, childUrl);
            if (moduleRun.ran !== true || moduleRun.hash_ok !== true || moduleRun.refused === true) {
                const modulePolicyRefusal = moduleRun.refused === true || moduleRun.hash_ok === false || moduleRun.declared_hash == null;
                runtimeFailure = {
                    ...runtimeFailure,
                    state: modulePolicyRefusal ? "refused" : "unavailable",
                    kind: modulePolicyRefusal ? "child_module_policy_refused" : "child_module_unavailable",
                    source_state: moduleRun.hash_ok === false ? "module_hash_mismatch" : "module_execution_unavailable",
                    recoverable: !modulePolicyRefusal,
                };
                throw new Error(`child module refused: ${moduleRun.error || "verified/hash-gated execution did not complete"}`);
            }
            this._msfChildRead = child;
            this._msfChildModuleRun = moduleRun;
            navigator.child_fabric = {
                url: childUrl,
                container: child.manifest.container || null,
                status: "verified_executed_awaiting_render",
                fabric_role: "child",
                resolved_from: `root portal ${navigator.portal_attachment.name || "unnamed"} sReference`,
                jws: child.jws || null,
                modules_hash_ok: child.modules_hash_ok,
                modules: child.modules || [],
                module_run: moduleRun,
                scene: child.scene || null,
                verified_at: new Date().toISOString(),
            };
            navigator.status = "child_verified_executed_awaiting_render";
            navigator.child_render = { active: false, reason: "awaiting_verified_child_render" };
            const readNavigationProof = () => {
                const marker = this._playerContextMarker;
                const atLoad = this._markerAtLoad;
                let navigationEntryCount = 0;
                try {
                    const entries = typeof performance !== "undefined" && performance.getEntriesByType
                        ? performance.getEntriesByType("navigation")
                        : [];
                    navigationEntryCount = entries ? entries.length : 0;
                }
                catch (_) {
                    navigationEntryCount = atLoad ? atLoad.navigation_entry_count_at_boot : 0;
                }
                const currentHref = typeof window !== "undefined" && window.location ? window.location.href : "";
                const sameMarker = !!(marker && atLoad && marker.marker_id === atLoad.marker_id && marker.context_id === atLoad.context_id);
                const sameNavigationEntryCount = !!(atLoad && navigationEntryCount === atLoad.navigation_entry_count_at_boot);
                const sameHref = !!(atLoad && currentHref === atLoad.boot_href);
                const noReload = sameMarker && sameNavigationEntryCount && sameHref;
                return { noReload, sameMarker, sameNavigationEntryCount, sameHref, navigationEntryCount, currentHref };
            };
            const beforeRender = readNavigationProof();
            if (!beforeRender.noReload) {
                runtimeFailure = {
                    ...runtimeFailure,
                    state: "refused",
                    kind: "navigator_context_refused",
                    source_state: "context_changed_before_render",
                    recoverable: false,
                };
                throw new Error("navigator context changed before child render");
            }
            runtimeFailure = {
                ...runtimeFailure,
                state: "unavailable",
                kind: "child_render_unavailable",
                source_state: "child_render_failed",
                recoverable: true,
            };
            const renderResult = await renderChild({
                child,
                manifest: child.manifest,
                module_run: moduleRun,
                url: childUrl,
                parent: root,
            });
            if (!renderResult || renderResult.rendered !== true || !(Number(renderResult.rendered_nodes) > 0)) {
                throw new Error("verified child render did not produce a confirmed non-empty scene");
            }
            const afterRender = readNavigationProof();
            if (!afterRender.noReload) {
                runtimeFailure = {
                    ...runtimeFailure,
                    state: "refused",
                    kind: "navigator_context_refused",
                    source_state: "context_changed_during_render",
                    recoverable: false,
                };
                throw new Error("navigator context changed during child render");
            }
            const completedAt = new Date().toISOString();
            const transition = {
                status: "completed",
                from: "root",
                to: "child",
                child_url: childUrl,
                verified_before_execution: true,
                module_hash_verified_before_execution: true,
                module_executed_before_render: true,
                rendered_nodes: Number(renderResult.rendered_nodes),
                renderer_kind: renderResult.renderer_kind || null,
                no_page_reload: afterRender.noReload,
                same_context_marker: afterRender.sameMarker,
                navigation_entry_count: afterRender.navigationEntryCount,
                completed_at: completedAt,
            };
            navigator.child_fabric.status = "active";
            navigator.child_fabric.activated_at = completedAt;
            navigator.child_render = { ...renderResult, active: true, updated_at: completedAt };
            navigator.active_fabric_role = "child";
            navigator.status = "child_active_one_context";
            navigator.fabrics_loaded = [rootContainer, child.manifest.container || childUrl];
            navigator.fabrics_loaded_count = 2;
            navigator.transition_count = Number(navigator.transition_count || 0) + 1;
            navigator.transition_history = [...(navigator.transition_history || []), transition];
            navigator.last_transition = transition;
            if (this._playerContextMarker) {
                this._playerContextMarker.current_href = afterRender.currentHref;
                this._playerContextMarker.same_marker_after_crossing = afterRender.sameMarker;
                this._playerContextMarker.crossing_comparison = { ...transition };
                this._playerContextMarker.fabrics_loaded = navigator.fabrics_loaded.slice();
                this._playerContextMarker.fabrics_loaded_count = 2;
                this._playerContextMarker.root_fabric_url = this.fabricUrl;
                this._playerContextMarker.child_fabric_url = childUrl;
                this._playerContextMarker.upgraded_at = completedAt;
            }
            this._log(`msf M4: verified child active in one context root=${rootContainer || "?"} ` +
                `child=${child.manifest.container || childUrl} rendered_nodes=${transition.rendered_nodes}`);
            return transition;
        }
        catch (cause) {
            const error = cause instanceof Error ? cause : new Error(String(cause));
            const failedAt = new Date().toISOString();
            const parentRetained = root.result === "VERIFIED" && !!root.manifest;
            runtimeFailure = {
                ...runtimeFailure,
                parent_retained: parentRetained,
                detail: error.message,
                failed_at: failedAt,
            };
            error.runtime_failure = { ...runtimeFailure };
            if (navigator) {
                const previousChild = navigator.child_fabric || {};
                navigator.status = "child_failed_parent_retained";
                navigator.active_fabric_role = "root";
                navigator.fabrics_loaded = rootContainer ? [rootContainer] : [];
                navigator.fabrics_loaded_count = navigator.fabrics_loaded.length;
                navigator.child_fabric = {
                    ...previousChild,
                    url: childUrl || previousChild.url || null,
                    status: previousChild.status === "verified_executed_awaiting_render"
                        ? "verified_executed_not_rendered"
                        : runtimeFailure.state,
                    fabric_role: "child",
                    error: error.message,
                    failure: { ...runtimeFailure },
                };
                navigator.child_render = {
                    active: false,
                    parent_retained: parentRetained,
                    reason: error.message,
                    failure: { ...runtimeFailure },
                    updated_at: failedAt,
                };
                navigator.last_transition = {
                    status: "failed",
                    from: "root",
                    to: "child",
                    child_url: childUrl,
                    parent_retained: parentRetained,
                    error: error.message,
                    failure: { ...runtimeFailure },
                    failed_at: failedAt,
                };
            }
            if (this._playerContextMarker) {
                this._playerContextMarker.fabrics_loaded = rootContainer ? [rootContainer] : [];
                this._playerContextMarker.fabrics_loaded_count = this._playerContextMarker.fabrics_loaded.length;
                this._playerContextMarker.child_fabric_url = null;
                this._playerContextMarker.upgraded_at = failedAt;
            }
            this._log(`msf M4: child follow failed; verified parent retained (${error.message})`);
            throw error;
        }
    }
    async initWow() {
        if (!this.wowRef)
            throw new Error("initWow requires a wowRef (?wow=<url|id>)");
        const looksLikeDoc = /[/.]/.test(this.wowRef) || /^https?:/i.test(this.wowRef);
        const graphUrl = looksLikeDoc
            ? this.wowRef
            : `${this.base}/wow/spatial/${encodeURIComponent(this.wowRef)}`;
        this._log(`wow: opening world "${this.wowRef}" -> graph ${graphUrl}`);
        const doc = await this._transport.getJson(graphUrl);
        let graph, source, canonicalWalk = null;
        if (doc && doc.nodes && (Array.isArray(doc.nodes) || typeof doc.nodes === "object")) {
            const hasExplicitRoot = doc.root != null || doc.rootId != null;
            graph = {
                spatialID: doc.spatialID || doc.spatial_id || this.wowRef,
                root: doc.root != null ? doc.root : doc.rootId != null ? doc.rootId : null,
                nodes: doc.nodes,
                title: doc.title || null,
                world: doc.world || null,
            };
            source = hasExplicitRoot ? "bundled-world-graph" : "bundled-world-graph";
        }
        else if (doc && doc.id !== undefined) {
            const walked = await this._walkCanonicalGraph(graphUrl, doc);
            graph = { spatialID: this.wowRef, root: Number(doc.id), nodes: walked.nodes };
            source = "canonical-walk";
            canonicalWalk = walked.stats;
        }
        else {
            throw new Error(`wow graph at ${graphUrl} is neither a dev-bundle {root,nodes} nor a canonical root Node {id,children}`);
        }
        const nodeCount = graph.nodes && !Array.isArray(graph.nodes)
            ? Object.keys(graph.nodes).length
            : (graph.nodes || []).length;
        const resolved = {
            graph,
            source,
            spatialID: graph.spatialID,
            node_count: nodeCount,
            graph_url: graphUrl,
            base_url: (doc && doc.base_url) || null,
            canonical_walk: canonicalWalk,
            world: null,
            proof_boundary: null,
        };
        this._wowResolved = resolved;
        this._log(`wow: resolved spatialID=${graph.spatialID} nodes=${nodeCount} source=${source}` +
            (canonicalWalk ? ` (walk: fetched=${canonicalWalk.fetched} failed=${canonicalWalk.failed})` : ""));
        return resolved;
    }
    async _walkCanonicalGraph(graphUrl, rootNode) {
        const CAP = 4096;
        const base = String(graphUrl).replace(/\/$/, "");
        const nodes = {};
        const stats = { fetched: 0, failed: 0, cap_hit: false };
        nodes[Number(rootNode.id)] = rootNode;
        const seen = new Set([Number(rootNode.id)]);
        const queue = (Array.isArray(rootNode.children) ? rootNode.children : []).map(Number);
        while (queue.length) {
            if (Object.keys(nodes).length >= CAP) {
                stats.cap_hit = true;
                break;
            }
            const id = Number(queue.shift());
            if (seen.has(id))
                continue;
            seen.add(id);
            try {
                const n = await this._transport.getJson(`${base}/node/${encodeURIComponent(id)}`);
                if (n && n.id != null) {
                    nodes[Number(n.id)] = n;
                    stats.fetched += 1;
                    for (const c of Array.isArray(n.children) ? n.children : []) {
                        if (!seen.has(Number(c)))
                            queue.push(Number(c));
                    }
                }
                else {
                    stats.failed += 1;
                }
            }
            catch (err) {
                stats.failed += 1;
                this._log(`wow: node ${id} fetch failed (${err.message})`);
            }
        }
        return { nodes, stats };
    }
    async _resolveWowSceneGraph(o = {}) {
        const base = o.base || this.base;
        const spatialId = o.spatialId || null;
        const record = {
            ok: false,
            via: "wow_composition_graph",
            msf_dependency: false,
            resolved_from: o.resolvedFrom || null,
            graph_url: null,
            spatialID: null,
            root_id: null,
            node_count: 0,
            canonical_walk: null,
            node_positions_source: "node.localTransform (graph-sourced)",
            resolved_at: new Date().toISOString(),
            error: null,
        };
        try {
            const url = o.graphEndpoint ||
                (spatialId ? `${base}/wow/spatial/${encodeURIComponent(spatialId)}` : null);
            if (!url)
                throw new Error("no spatialId / graphEndpoint to resolve");
            record.graph_url = url;
            const doc = await this._transport.getJson(url);
            let graph;
            if (doc && doc.nodes && (Array.isArray(doc.nodes) || typeof doc.nodes === "object")) {
                graph = {
                    spatialID: doc.spatialID || doc.spatial_id || spatialId,
                    root: doc.root != null ? doc.root : doc.rootId != null ? doc.rootId : null,
                    nodes: doc.nodes,
                };
            }
            else if (doc && doc.id !== undefined) {
                const walked = await this._walkCanonicalGraph(url, doc);
                graph = { spatialID: spatialId || String(doc.id), root: Number(doc.id), nodes: walked.nodes };
                record.canonical_walk = walked.stats;
            }
            else {
                throw new Error("neither a bundle {root,nodes} nor a canonical root Node {id,children}");
            }
            const nodeCount = graph.nodes && !Array.isArray(graph.nodes)
                ? Object.keys(graph.nodes).length
                : (graph.nodes || []).length;
            const resolved = {
                graph,
                source: "wow_composition_graph",
                spatialID: graph.spatialID,
                node_count: nodeCount,
                graph_url: url,
                base_url: (doc && doc.base_url) || null,
                canonical_walk: record.canonical_walk,
                world: null,
                proof_boundary: null,
            };
            this._wowResolved = resolved;
            record.ok = true;
            record.spatialID = graph.spatialID;
            record.root_id = graph.root;
            record.node_count = nodeCount;
            this._log(`wow-scene-source: ${graph.spatialID} graph-sourced (${nodeCount} nodes) from ${url} — ` +
                `replaces the .msf child-fabric as the scene source; .msf not required`);
        }
        catch (e) {
            record.error = e.message;
            this._log(`wow-scene-source: graph resolve best-effort failed (${e.message}); ` +
                `crossing continues on the /wow projection (no .msf dependency)`);
        }
        this._wowSceneSource = record;
        return record;
    }
    wowResolved() {
        return this._wowResolved;
    }
    wowSceneSource() {
        return this._wowSceneSource;
    }
    msfRead() {
        return this._msfRead;
    }
    async _ensureRootFabric() {
        const rootUrl = `${this.base}/fabric.json`;
        if (this._rootFabricManifest && this._rootFabricManifestUrl === rootUrl) {
            return this._rootFabricManifest;
        }
        try {
            const manifest = await this._transport.getJson(rootUrl);
            this._rootFabricManifest = manifest;
            this._rootFabricManifestUrl = rootUrl;
            return manifest;
        }
        catch (e) {
            return null;
        }
    }
    async _resolveWowEndpoints() {
        const manifest = await this._ensureRootFabric();
        const resolution = resolveWowEndpoints(manifest, this.base);
        this._wowEndpoints = resolution.endpoints;
        this._wowEndpointResolution = resolution;
        this._log(`wow-endpoints: ${resolution.resolved_from_services ? "resolved from fabric services[]" : "using fallback constants"} ` +
            `world=${resolution.provenance.world.resolved_path} user=${resolution.provenance.user.resolved_path} ` +
            `portal=${resolution.provenance.portal.resolved_path} view=${resolution.provenance.view.resolved_path}`);
        return this._wowEndpoints;
    }
    async _fetchWowPortals(ep, wowWorld) {
        const listed = wowWorld &&
            wowWorld.webofworlds_extension &&
            Array.isArray(wowWorld.webofworlds_extension.portals)
            ? wowWorld.webofworlds_extension.portals
            : [];
        if (listed.length <= 1) {
            try {
                const single = await this._transport.getJson(ep.portal.path);
                return single ? [single] : [];
            }
            catch (e) {
                return [];
            }
        }
        const portals = [];
        for (const entry of listed) {
            const wowId = Number(entry && entry.id);
            if (!Number.isFinite(wowId) || wowId < 1)
                continue;
            const path = ep.portal.path.replace(/\/[^/]+$/, `/${wowId}`);
            try {
                const resource = await this._transport.getJson(path);
                if (resource)
                    portals.push(resource);
            }
            catch (e) {
            }
        }
        return portals;
    }
    _adoptPortalFrameId(wowPortal) {
        const ext = wowPortal && wowPortal.webofworlds_extension ? wowPortal.webofworlds_extension : null;
        const frameId = ext && typeof ext.portal_id === "string" ? ext.portal_id : null;
        if (frameId)
            this._portalId = frameId;
    }
    async verifyViewMatchesCamera() {
        const local = this._lastCameraTransform;
        const localPos = local && Array.isArray(local.position) ? local.position : null;
        if (!localPos)
            return null;
        const ep = this._wowEndpoints && this._wowEndpoints.view
            ? this._wowEndpoints.view
            : { path: `${this.base}/wow/view/1`, id: 1 };
        let view;
        try {
            view = await this._transport.getJson(ep.path);
        }
        catch (e) {
            this._viewMatch = { ok: false, reason: `view fetch failed: ${e.message}`, endpoint: this._transport.displayPath(ep.path) };
            return this._viewMatch;
        }
        const cam = view && view.webofworlds_extension && view.webofworlds_extension.local_camera
            ? view.webofworlds_extension.local_camera.position
            : null;
        if (!Array.isArray(cam)) {
            this._viewMatch = { ok: false, reason: "view response has no local_camera.position", endpoint: this._transport.displayPath(ep.path) };
            return this._viewMatch;
        }
        const dx = (Number(cam[0]) || 0) - (Number(localPos[0]) || 0);
        const dy = (Number(cam[1]) || 0) - (Number(localPos[1]) || 0);
        const dz = (Number(cam[2]) || 0) - (Number(localPos[2]) || 0);
        const delta = Math.hypot(dx, dy, dz);
        const matches = delta < 0.05;
        this._viewMatch = {
            ok: matches,
            endpoint: this._transport.displayPath(ep.path),
            view_id: view && view.id != null ? view.id : ep.id,
            delta_m: roundNumber(delta, 4),
            threshold_m: 0.05,
            server_camera_position: roundVec3(cam, 4),
            local_camera_position: roundVec3(localPos, 4),
            pose_note: "server View projects the server-side avatar pose (independent /movement integration); " +
                "matches the client camera at synced poses, expected drift during free local movement",
            summary: matches
                ? `server View matches local camera (Δ${roundNumber(delta, 4)} m < 0.05 m)`
                : `server View Δ${roundNumber(delta, 4)} m vs local camera (server pose independently integrated; agrees at spawn)`,
        };
        return this._viewMatch;
    }
    async _initWorldNavigator() {
        const rootUrl = `${this.base}/fabric.json`;
        const navigator = {
            subsystem: "world_navigator",
            profile: "omb.world-navigator.local-validation.v0.1",
            claim: "local web validation; plain-JSON unsigned fabrics; no standards-conformance claim",
            context_id: this._playerContextMarker ? this._playerContextMarker.context_id : null,
            context_marker_id: this._playerContextMarker ? this._playerContextMarker.marker_id : null,
            single_context: true,
            status: "loading",
            root_fabric: { url: rootUrl, status: "loading" },
            child_fabric: null,
            portal_attachment: null,
            trigger_node: null,
            spawn: { source: "legacy_wow_projection", applied: false },
            fabrics_loaded: [],
            fabrics_loaded_count: 0,
            child_render: { active: false, reason: "renderer_not_attached_yet" },
            promotion_count: this._navigatorPromotions.length,
            last_promotion: this._navigatorPromotions.length
                ? this._navigatorPromotions[this._navigatorPromotions.length - 1]
                : null,
        };
        this._navigator = navigator;
        let rootFabric = null;
        try {
            rootFabric = await this._ensureRootFabric();
            if (!rootFabric)
                throw new Error("root fabric manifest unavailable");
            navigator.root_fabric = { ...fabricSummary(rootUrl, rootFabric), fabric_role: "root" };
        }
        catch (err) {
            this._rootFabricManifest = null;
            this._rootFabricManifestUrl = null;
            navigator.status = "root_fabric_unavailable";
            navigator.root_fabric = {
                url: rootUrl,
                status: "error",
                fabric_role: "root",
                error: `root fabric manifest unavailable: ${err.message}`,
            };
            navigator.child_render = { active: false, reason: "root_fabric_unavailable" };
            this._log(`world-navigator: root fabric unavailable (${err.message}); staying on /wow projection`);
            return;
        }
        const cam = rootFabric.primary && rootFabric.primary.camera;
        if (cam && Array.isArray(cam.position)) {
            const spawn = [Number(cam.position[0]) || 0, 0, Number(cam.position[2]) || 0];
            const manifestYaw = yawFromQuaternionY(cam.rotation);
            const spawnPortalNodes = findFabricPortalAttachmentNodes(rootFabric);
            const portalPos = spawnPortalNodes.length
                ? spawnPortalNodes
                    .map((node) => fabricNodePosition(node))
                    .reduce((acc, p, _i, arr) => [
                    acc[0] + Number(p[0] || 0) / arr.length,
                    acc[1] + Number(p[1] || 0) / arr.length,
                    acc[2] + Number(p[2] || 0) / arr.length,
                ], [0, 0, 0])
                : null;
            const toPortal = portalPos
                ? [Number(portalPos[0]) - spawn[0], 0, Number(portalPos[2]) - spawn[2]]
                : null;
            const facesPortal = !!(toPortal && Math.hypot(toPortal[0], toPortal[2]) > 1e-6);
            const yaw = facesPortal ? roundNumber(yawFromVector(toPortal, manifestYaw), 6) : manifestYaw;
            this.world.avatar.spawn_position = spawn.slice();
            this.world.avatar.rotation_y = yaw;
            if (this.state.avatar && this._startsEmbodied && this.state.phase === HANDOFF_PHASES.IDLE) {
                this.state.avatar.position = spawn.slice();
                this.state.avatar.rotation_y = yaw;
            }
            navigator.spawn = {
                source: "root_fabric_primary_camera",
                applied: true,
                position: roundVec3(spawn, 4),
                rotation_y: yaw,
                rotation_source: facesPortal
                    ? "faced_toward_portal_attachment_node"
                    : "root_fabric_primary_camera_rotation",
                manifest_rotation_y: manifestYaw,
            };
        }
        const portalNode = findFabricPortalAttachmentNode(rootFabric);
        const triggerNode = findFabricActionTriggerNode(rootFabric);
        const spawnNode = findFabricSpawnNode(rootFabric);
        if (triggerNode) {
            navigator.trigger_node = {
                node_id: fabricNodeId(triggerNode),
                name: triggerNode.Name || null,
                action: triggerNode.Resource ? triggerNode.Resource.sReference : null,
                position: roundVec3(fabricNodePosition(triggerNode), 4),
                bound_max: triggerNode.Bound && Array.isArray(triggerNode.Bound.Max)
                    ? triggerNode.Bound.Max.slice(0, 3)
                    : null,
            };
        }
        navigator.root_spawn_node = spawnNode
            ? {
                node_id: fabricNodeId(spawnNode),
                name: spawnNode.Name || null,
                position: roundVec3(fabricNodePosition(spawnNode), 4),
            }
            : null;
        if (!portalNode) {
            navigator.status = "no_portal_attachment_node";
            navigator.child_render = { active: false, reason: "no_portal_attachment_node_in_root_fabric" };
            this._updateMarkerFromNavigator();
            return;
        }
        const sReference = portalNode.Resource ? portalNode.Resource.sReference : null;
        const childUrl = resolveFabricReference(sReference);
        const portalNodePosition = roundVec3(fabricNodePosition(portalNode), 4);
        const wowFrameGround = this.world.portal && this.world.portal.frame
            ? clonePosition(this.world.portal.frame.ground_center, [0, 0, 0])
            : null;
        navigator.portal_attachment = {
            node_id: fabricNodeId(portalNode),
            name: portalNode.Name || null,
            bSubtype: FABRIC_PORTAL_ATTACHMENT_SUBTYPE,
            sReference: sReference || null,
            resolved_url: childUrl,
            transform_position: portalNodePosition,
            matches_wow_portal_frame: wowFrameGround
                ? distance2d(portalNodePosition, wowFrameGround) <= 0.01
                : null,
        };
        if (!childUrl) {
            navigator.status = "portal_node_missing_reference";
            navigator.child_render = { active: false, reason: "portal_node_has_no_fabric_reference" };
            this._updateMarkerFromNavigator();
            return;
        }
        try {
            const childFabric = await this._transport.getJson(childUrl);
            navigator.child_fabric = {
                ...fabricSummary(childUrl, childFabric),
                fabric_role: "child",
                resolved_from: `root portal node ${navigator.portal_attachment.node_id} sReference`,
                attached_at_portal_node: navigator.portal_attachment.node_id,
                attachment_transform_position: portalNodePosition,
                child_portal_node: (() => {
                    const back = findFabricPortalAttachmentNode(childFabric);
                    return back
                        ? {
                            node_id: fabricNodeId(back),
                            name: back.Name || null,
                            position: roundVec3(fabricNodePosition(back), 4),
                            sReference: back.Resource ? back.Resource.sReference : null,
                        }
                        : null;
                })(),
                child_spawn_node: (() => {
                    const sp = findFabricSpawnNode(childFabric);
                    return sp
                        ? {
                            node_id: fabricNodeId(sp),
                            name: sp.Name || null,
                            position: roundVec3(fabricNodePosition(sp), 4),
                        }
                        : null;
                })(),
            };
            this._childFabricManifest = childFabric;
            navigator.status = "both_fabrics_loaded_one_context";
            navigator.child_render = { active: false, reason: "awaiting_renderer_attachment" };
        }
        catch (err) {
            navigator.status = "child_fabric_unavailable";
            navigator.child_fabric = {
                url: childUrl,
                status: "error",
                fabric_role: "child",
                error: `child fabric manifest unavailable: ${err.message}`,
            };
            navigator.child_render = { active: false, reason: "child_fabric_unavailable" };
            if (this.state.preview) {
                this.state.preview.fallback_reason =
                    `child fabric manifest unavailable (${err.message}); showing labeled target placeholder`;
                this.state.preview.preview_fallback_reason = this.state.preview.fallback_reason;
            }
        }
        this._updateMarkerFromNavigator();
        this._log(`world-navigator: ${navigator.status} root=${navigator.root_fabric.container || "?"} child=${navigator.child_fabric && navigator.child_fabric.container ? navigator.child_fabric.container : "none"} context=${navigator.context_id}`);
    }
    _updateMarkerFromNavigator() {
        const navigator = this._navigator;
        const marker = this._playerContextMarker;
        if (!navigator || !marker)
            return;
        const loaded = [];
        if (navigator.root_fabric && navigator.root_fabric.status === "loaded") {
            loaded.push(navigator.root_fabric.container || navigator.root_fabric.url);
        }
        if (navigator.child_fabric && navigator.child_fabric.status === "loaded") {
            loaded.push(navigator.child_fabric.container || navigator.child_fabric.url);
        }
        navigator.fabrics_loaded = loaded;
        navigator.fabrics_loaded_count = loaded.length;
        marker.fabrics_loaded = loaded.slice();
        marker.fabrics_loaded_count = loaded.length;
        marker.root_fabric_url = navigator.root_fabric ? navigator.root_fabric.url : null;
        marker.child_fabric_url = navigator.child_fabric ? navigator.child_fabric.url : null;
        marker.upgraded_at = new Date().toISOString();
    }
    childFabricManifest() {
        return this._childFabricManifest || null;
    }
    setChildFabricRenderState(info) {
        if (!this._navigator)
            return;
        this._navigator.child_render = { ...(info || {}), updated_at: new Date().toISOString() };
        const preview = this.state.preview;
        if (!preview)
            return;
        if (info && info.active === true) {
            preview.state = "child_fabric_attached";
            preview.source_type = "child_fabric_live_render_texture";
            preview.preview_source_type = preview.source_type;
            preview.fallback_reason = null;
            preview.preview_fallback_reason = null;
            preview.child_fabric_url = this._navigator.child_fabric ? this._navigator.child_fabric.url : null;
            preview.child_fabric_container = this._navigator.child_fabric
                ? this._navigator.child_fabric.container
                : null;
            preview.projection_frame_source = info.camera_source || preview.projection_frame_source;
            preview.captured_at = new Date().toISOString();
        }
        else if (info && info.reason && this._navigator.child_fabric && this._navigator.child_fabric.status === "loaded") {
            preview.fallback_reason = `child fabric loaded in-context but not rendered: ${info.reason}`;
            preview.preview_fallback_reason = preview.fallback_reason;
        }
    }
    markChildFabricPreviewFrame() {
        if (!this._navigator || !this._navigator.child_render)
            return;
        const render = this._navigator.child_render;
        render.frame_count = (Number(render.frame_count) || 0) + 1;
        render.last_frame_at = new Date().toISOString();
        if (this.state.preview && this.state.preview.source_type === "child_fabric_live_render_texture") {
            this.state.preview.captured_at = render.last_frame_at;
        }
    }
    _navigatorDebug() {
        if (!this._navigator)
            return null;
        return {
            ...this._navigator,
            root_fabric: this._navigator.root_fabric ? { ...this._navigator.root_fabric } : null,
            child_fabric: this._navigator.child_fabric ? { ...this._navigator.child_fabric } : null,
            portal_attachment: this._navigator.portal_attachment ? { ...this._navigator.portal_attachment } : null,
            child_render: this._navigator.child_render ? { ...this._navigator.child_render } : null,
            fabrics_loaded: (this._navigator.fabrics_loaded || []).slice(),
        };
    }
    _applyPreviewReadOnlyDebug(debugState, opts = {}) {
        const preview = this.state.preview;
        if (!preview || !debugState)
            return;
        const arrivalCount = Number(debugState && debugState.session && debugState.session.arrival_count) || 0;
        const revision = Number(debugState && debugState.debug && debugState.debug.state_revision) || 0;
        const hasHandoffContext = !!(debugState && debugState.avatar && debugState.avatar.handoff_context);
        if (opts.initialize || preview.target_arrival_count_before_preview === null) {
            preview.target_arrival_count_before_preview = arrivalCount;
            preview.target_state_revision_before_preview = revision;
            preview.target_handoff_context_before_preview = hasHandoffContext;
        }
        const beforeArrival = Number(preview.target_arrival_count_before_preview) || 0;
        const beforeRevision = Number(preview.target_state_revision_before_preview) || 0;
        preview.target_arrival_count_current = arrivalCount;
        preview.target_state_revision_current = revision;
        preview.target_handoff_context_current = hasHandoffContext;
        preview.target_debug_last_input_source = debugState && debugState.debug ? debugState.debug.last_input_source || null : null;
        preview.target_avatar_presence_created =
            arrivalCount > beforeArrival ||
                (preview.target_handoff_context_before_preview !== true && hasHandoffContext === true);
        preview.target_mutation_count_during_preview = Math.max(0, revision - beforeRevision);
        preview.readonly = true;
        preview.preview_readonly = true;
    }
    async refreshPreviewReadOnlyState() {
        if (!this.previewEndpoint || !this.state.preview)
            return this._previewDebug();
        try {
            const debugState = await this._transport.getJson(`${this.previewEndpoint.proxy_base}/debug/state`);
            this._applyPreviewReadOnlyDebug(debugState);
            this.state.preview.captured_at = new Date().toISOString();
            this.state.preview.freshness_ms = 0;
            this.state.preview.preview_freshness_ms = 0;
        }
        catch (err) {
            this.state.preview.state = "error";
            this.state.preview.fallback_reason = `target preview readonly refresh failed: ${err.message}`;
            this.state.preview.preview_fallback_reason = this.state.preview.fallback_reason;
        }
        return this._previewDebug();
    }
    updatePreviewProjection(cameraTransform) {
        if (cameraTransform)
            this._lastCameraTransform = cameraTransform;
        if (!this.state.preview || !this.world || !this.world.portal)
            return this._previewDebug();
        const projection = mapCameraBetweenPortalFrames({
            sourceFrame: this.world.portal.frame,
            targetFrame: this.world.portal.target_frame,
            cameraTransform,
        });
        this.state.preview.source_camera_relative_to_portal = projection.source_camera_relative_to_portal;
        this.state.preview.target_preview_camera_transform = projection.target_preview_camera_transform;
        this.state.preview.preview_projection_transform = projection.preview_projection_transform;
        this.state.preview.projection_frame_source = "source_portal_frame+target_portal_frame";
        return this._previewDebug();
    }
    setAvatarVariant(variantKey) {
        if (this.clientMode !== "player")
            return { ok: false, error: "player-only control" };
        if (!this.state.avatar)
            return { ok: false, error: "no embodied avatar (crossing in flight?)" };
        if (!AVATAR_VARIANTS[variantKey]) {
            return {
                ok: false,
                error: `unknown avatar variant '${variantKey}' (have: ${Object.keys(AVATAR_VARIANTS).join(", ")})`,
            };
        }
        this.state.avatar.avatar_variant = variantKey;
        this._log(`avatar switch requested -> '${variantKey}' (${AVATAR_VARIANTS[variantKey].label})`);
        this._maybeBroadcastPlayerPose({ force: true });
        this._emit();
        return { ok: true, variant: variantKey, label: AVATAR_VARIANTS[variantKey].label };
    }
    setPreferredHeight(heightM) {
        if (this.clientMode !== "player")
            return { ok: false, error: "player-only control" };
        if (!this.state.avatar)
            return { ok: false, error: "no embodied avatar (crossing in flight?)" };
        if (heightM === null || heightM === undefined || heightM === "") {
            this.state.avatar.preferred_height_m = null;
            this._log("preferred avatar height cleared (falling back to the variant's authored scale)");
        }
        else {
            const h = Number(heightM);
            if (!Number.isFinite(h) || h < 0.6 || h > 2.6) {
                return { ok: false, error: `preferred height must be a number in 0.6-2.6 m (got '${heightM}')` };
            }
            this.state.avatar.preferred_height_m = h;
            this._log(`preferred avatar height set -> ${h} m (applied to whichever rig is worn)`);
        }
        this._maybeBroadcastPlayerPose({ force: true });
        this._emit();
        return { ok: true, preferred_height_m: this.state.avatar.preferred_height_m };
    }
    toggleAvatarVariant() {
        const current = (this.state.avatar && this.state.avatar.avatar_variant) || DEFAULT_AVATAR_VARIANT;
        return this.setAvatarVariant(current === "upgraded" ? "dwarf" : "upgraded");
    }
    async equipCatalogItem(itemId) {
        if (this.clientMode !== "player")
            return { ok: false, error: "player-only control" };
        if (!this.state.avatar)
            return { ok: false, error: "no embodied avatar (crossing in flight?)" };
        const catalog = equipmentCatalog();
        const current = Array.isArray(this.state.avatar.equippedItems)
            ? this.state.avatar.equippedItems
            : [];
        const item = itemId
            ? catalog.find((entry) => entry.itemId === itemId)
            : catalog.find((entry) => !current.some((worn) => worn.itemId === entry.itemId));
        if (!item) {
            return {
                ok: false,
                error: itemId
                    ? `unknown catalog item '${itemId}' (have: ${catalog.map((entry) => entry.itemId).join(", ")})`
                    : "all catalog items already equipped",
            };
        }
        if (current.some((worn) => worn.itemId === item.itemId)) {
            return { ok: false, error: `'${item.itemId}' is already equipped` };
        }
        const next = current.concat([item]);
        const validation = validateEquippedItems(next);
        if (!validation.ok) {
            return { ok: false, error: `equip rejected by schema: ${validation.errors.join("; ")}` };
        }
        this.state.avatar.equippedItems = next;
        this.state.equipment_status = await resolveEquipmentItems(next);
        this._log(`equipped '${item.itemId}' (${item.mode} @ ${item.attachmentPoint}) at runtime`);
        this._maybeBroadcastPlayerPose({ force: true });
        this._emit();
        return {
            ok: true,
            itemId: item.itemId,
            mode: item.mode,
            attachmentPoint: item.attachmentPoint,
            equipped_count: next.length,
        };
    }
    equippableCatalog() {
        const current = this.state.avatar && Array.isArray(this.state.avatar.equippedItems)
            ? this.state.avatar.equippedItems.map((item) => item.itemId)
            : [];
        return equipmentCatalog().map((item) => ({
            itemId: item.itemId,
            mode: item.mode,
            attachmentPoint: item.attachmentPoint,
            label: item.label,
            equipped: current.includes(item.itemId),
        }));
    }
    claimBoundary() {
        return this.world ? this.world.claim_boundary : null;
    }
    boundaryStatus() {
        return { ok: this._boundaryOk, problems: this._boundaryProblems };
    }
    demoProxyBase(endpointKey) {
        const endpoint = ENDPOINTS[endpointKey];
        return endpoint ? endpoint.proxy_base : this.base;
    }
    async demoReadAttachPoint(endpointKey) {
        const res = await this._transport.rawFetch(`${this.demoProxyBase(endpointKey)}/demo/um/attach-point`, {
            headers: { Accept: "application/json" },
        });
        if (!res.ok)
            throw new Error(`GET /demo/um/attach-point (${endpointKey}) -> ${res.status}`);
        const attachPoint = await res.json();
        this.dispatchEvent(new CustomEvent(HOSTED_ATTACH_POINT_EVENT, {
            detail: { endpoint_key: endpointKey, attach_point: attachPoint },
        }));
        return attachPoint;
    }
    async demoReadPortalView(endpointKey, resolution) {
        const res = await this._transport.rawFetch(`${this.demoProxyBase(endpointKey)}/demo/portal-view?resolution=${encodeURIComponent(String(resolution || "snapshot3d"))}`, { headers: { Accept: "application/json" } });
        if (!res.ok)
            throw new Error(`GET /demo/portal-view (${endpointKey}) -> ${res.status}`);
        return res.json();
    }
    async demoMoveSceneObject(endpointKey, objectId, position) {
        const res = await this._transport.rawFetch(`${this.demoProxyBase(endpointKey)}/demo/scene-objects/move`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({ object_id: objectId, position }),
        });
        if (!res.ok)
            throw new Error(`POST /demo/scene-objects/move (${endpointKey}) -> ${res.status}`);
        return res.json();
    }
    async demoMovePortal(endpointKey, position) {
        const res = await this._transport.rawFetch(`${this.demoProxyBase(endpointKey)}/demo/portal/move`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({ position }),
        });
        if (!res.ok)
            throw new Error(`POST /demo/portal/move (${endpointKey}) -> ${res.status}`);
        return res.json();
    }
    async demoReadRepublishRate(endpointKey) {
        const res = await this._transport.rawFetch(`${this.demoProxyBase(endpointKey)}/demo/republish-rate`, {
            headers: { Accept: "application/json" },
        });
        if (!res.ok)
            throw new Error(`GET /demo/republish-rate (${endpointKey}) -> ${res.status}`);
        return res.json();
    }
    async demoSetRepublishRate(endpointKey, republishRateMs) {
        const res = await this._transport.rawFetch(`${this.demoProxyBase(endpointKey)}/demo/republish-rate`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({ republish_rate_ms: republishRateMs }),
        });
        if (!res.ok)
            throw new Error(`POST /demo/republish-rate (${endpointKey}) -> ${res.status}`);
        return res.json();
    }
    applyHostedPortalPose(triggerPosition) {
        const portal = this.world && this.world.portal;
        if (!portal || !Array.isArray(triggerPosition))
            return { changed: false, frame: portal ? portal.frame : null };
        const current = clonePosition(portal.trigger && portal.trigger.position, [2.8, 0, -2.8]);
        const next = clonePosition(triggerPosition, current);
        next[1] = 0;
        if (Math.abs(next[0] - current[0]) < 1e-4 && Math.abs(next[2] - current[2]) < 1e-4) {
            return { changed: false, frame: portal.frame };
        }
        const radius = Number(portal.trigger && portal.trigger.radius_m) || 1.25;
        portal.trigger = { position: next, radius_m: radius };
        const rebuilt = portalFrameForLocation({
            portalId: portal.portal_id,
            locationId: this.world.location_id,
            triggerPosition: next,
            triggerRadius: radius,
            targetLocationId: portal.target_location_id,
        });
        portal.frame = {
            ...rebuilt,
            target_world_id: portal.target_world_id || null,
            target_base_url: portal.target_base_url || null,
        };
        this._updatePortalStatus();
        this._emit();
        return { changed: true, frame: portal.frame };
    }
    applyHostedTargetPortalPose(triggerPosition) {
        const portal = this.world && this.world.portal;
        if (!portal || !portal.target_frame || !Array.isArray(triggerPosition)) {
            return { changed: false, frame: portal ? portal.target_frame : null };
        }
        const current = clonePosition(portal.target_frame.ground_center, [2.8, 0, -2.8]);
        const next = clonePosition(triggerPosition, current);
        next[1] = 0;
        if (Math.abs(next[0] - current[0]) < 1e-4 && Math.abs(next[2] - current[2]) < 1e-4) {
            return { changed: false, frame: portal.target_frame };
        }
        const rebuilt = portalFrameForLocation({
            portalId: portal.target_frame.portal_id,
            locationId: portal.target_location_id,
            triggerPosition: next,
            triggerRadius: Number(portal.trigger && portal.trigger.radius_m) || 1.25,
            targetLocationId: this.world.location_id,
        });
        portal.target_frame = {
            ...rebuilt,
            target_world_id: null,
            target_base_url: null,
            linked_target_portal_id: portal.frame ? portal.frame.portal_id : rebuilt.linked_target_portal_id,
            pose_source: "hosted_point_reload",
        };
        this._updatePortalStatus();
        return { changed: true, frame: portal.target_frame };
    }
    _adoptDestinationPortalPoseForMachine(machine, portalPose) {
        if (!machine ||
            !machine.portal_key ||
            !portalPose ||
            !Array.isArray(portalPose.trigger_position) ||
            !this.world) {
            return { changed: false, frame: null };
        }
        const entries = Array.isArray(this.world.portals) && this.world.portals.length
            ? this.world.portals
            : this.world.portal
                ? [this.world.portal]
                : [];
        const entry = entries.find((p) => fabricPortalKey(p) === machine.portal_key) || null;
        if (!entry || !entry.target_frame)
            return { changed: false, frame: null };
        const next = clonePosition(portalPose.trigger_position, null);
        if (!next)
            return { changed: false, frame: entry.target_frame };
        next[1] = 0;
        const tf = entry.target_frame;
        const current = clonePosition(tf.ground_center, Array.isArray(tf.position) ? [tf.position[0], 0, tf.position[2]] : [0, 0, 0]);
        const alreadyAdopted = tf.pose_source === "destination_region_portal_pose";
        if (alreadyAdopted &&
            Math.abs(next[0] - current[0]) < 1e-4 &&
            Math.abs(next[2] - current[2]) < 1e-4) {
            return { changed: false, frame: tf };
        }
        const rebuilt = portalFrameForLocation({
            portalId: tf.portal_id,
            locationId: entry.target_location_id,
            triggerPosition: next,
            triggerRadius: Number(portalPose.trigger_radius_m) ||
                Number(entry.trigger && entry.trigger.radius_m) ||
                1.25,
            targetLocationId: this.world.location_id,
        });
        entry.target_frame = {
            ...rebuilt,
            target_world_id: null,
            target_base_url: null,
            linked_target_portal_id: entry.frame ? entry.frame.portal_id : rebuilt.linked_target_portal_id,
            pose_source: "destination_region_portal_pose",
            pose_adopted_at: new Date().toISOString(),
        };
        const moved = Math.hypot(next[0] - current[0], next[2] - current[2]);
        this._log(`fabric region: destination portal pose adopted for ${machine.portal_key} -> ` +
            `[${next[0]}, 0, ${next[2]}]${moved > 1e-4 ? ` (placeholder was ${moved.toFixed(2)} m off)` : " (placeholder already matched)"}`);
        this._updatePortalStatus();
        return { changed: true, frame: entry.target_frame };
    }
    activatePortal() {
        if (!this._portalTraversalController.activate())
            return;
        this._updatePortalStatus();
        this._emit();
    }
    runCalibrationSnapshot() {
        const sourceSpeed = RUN_MOVE_SPEED_MPS;
        const calibration = this._runCalibration;
        return {
            run_cycle_speed: calibration ? calibration.run_cycle_speed : null,
            run_cycle_distance: calibration ? calibration.run_cycle_distance : null,
            run_cadence_steps_per_min: calibration ? calibration.run_cycle_speed * 120 : null,
            effective_run_translation_speed_mps: calibration
                ? calibration.run_cycle_speed * calibration.run_cycle_distance
                : sourceSpeed,
            source_translation_speed_mps: sourceSpeed,
            calibrated: calibration !== null,
            persistence: "session-local-memory-only",
        };
    }
    setRunCalibration(input) {
        const runCycleSpeed = Number(input && input.run_cycle_speed);
        const runCycleDistance = Number(input && input.run_cycle_distance);
        if (!Number.isFinite(runCycleSpeed) || runCycleSpeed <= 0) {
            throw new RangeError("run_cycle_speed must be a positive finite cycles/s value");
        }
        if (runCycleSpeed > RUN_MAX_CYCLE_SPEED + 1e-12) {
            throw new RangeError("run_cycle_speed exceeds the measured 195.092 steps/min hard envelope");
        }
        if (!Number.isFinite(runCycleDistance) || runCycleDistance < RUN_MIN_CYCLE_DISTANCE_M) {
            throw new RangeError("run_cycle_distance must be a finite, non-near-zero metres/cycle value");
        }
        this._runCalibration = Object.freeze({
            run_cycle_speed: runCycleSpeed,
            run_cycle_distance: runCycleDistance,
        });
        const snapshot = this.runCalibrationSnapshot();
        this.state.controls.run_cycle_speed = runCycleSpeed;
        this.state.controls.run_cycle_distance = runCycleDistance;
        this.state.controls.run_cadence_steps_per_min = runCycleSpeed * 120;
        this.state.controls.run_translation_speed_mps = snapshot.effective_run_translation_speed_mps;
        if (this.state.avatar) {
            const locomotion = {
                ...this.state.controls,
                ...(this.state.avatar.locomotion || {}),
                run_cycle_speed: runCycleSpeed,
                run_cycle_distance: runCycleDistance,
                run_cadence_steps_per_min: runCycleSpeed * 120,
                run_translation_speed_mps: snapshot.effective_run_translation_speed_mps,
            };
            if (locomotion.moving === true && locomotion.run_mode === true) {
                locomotion.speed_mps = snapshot.effective_run_translation_speed_mps;
                this.state.controls.speed_mps = snapshot.effective_run_translation_speed_mps;
            }
            this.state.avatar.locomotion = locomotion;
        }
        this._emit();
        return snapshot;
    }
    stepAvatar(input, deltaSeconds) {
        if (!this.state.avatar)
            return this.state.controls;
        const dt = clamp(Number(deltaSeconds) || 0, 0, 0.05);
        if (dt <= 0)
            return this.state.controls;
        if (this._portalTraversalController.inTransition()) {
            this._stepPortalTransition(dt);
            return this.state.controls;
        }
        if (this.state.phase !== HANDOFF_PHASES.IDLE &&
            this.state.phase !== HANDOFF_PHASES.ARRIVED &&
            this.state.phase !== HANDOFF_PHASES.PORTAL_ACTIVE) {
            return this.state.controls;
        }
        const controls = input || {};
        const forward = (controls.forward ? 1 : 0) - (controls.back ? 1 : 0);
        const strafe = (controls.right ? 1 : 0) - (controls.left ? 1 : 0);
        const hasPlanarInput = forward !== 0 || strafe !== 0;
        const runMode = hasPlanarInput && controls.run === true;
        const runCalibration = this.runCalibrationSnapshot();
        const effectiveSpeedMps = hasPlanarInput
            ? runMode
                ? runCalibration.effective_run_translation_speed_mps
                : MOVE_SPEED_MPS
            : 0;
        const wasMoving = this.state.controls.moving === true;
        const avatar = this.state.avatar;
        const p = clonePosition(avatar.position, [0, 0, 0]);
        const previousPosition = p.slice();
        const currentGround = this._resolveAvatarGround(previousPosition[0], previousPosition[2]);
        if (!currentGround.ok) {
            this._publishGroundSurface(currentGround);
            return this.state.controls;
        }
        let verticalChanged = false;
        let groundQueryBlocked = false;
        let rejectedGroundQuery = null;
        const basisYaw = Number.isFinite(Number(controls.camera_yaw))
            ? Number(controls.camera_yaw)
            : Math.PI;
        let dx = 0;
        let dz = 0;
        if (hasPlanarInput) {
            const len = Math.hypot(forward, strafe) || 1;
            const f = forward / len;
            const s = strafe / len;
            const sinB = Math.sin(basisYaw);
            const cosB = Math.cos(basisYaw);
            dx = (f * sinB - s * cosB) * effectiveSpeedMps * dt;
            dz = (f * cosB + s * sinB) * effectiveSpeedMps * dt;
            const mb = this._movementBounds;
            p[0] = clamp(p[0] + dx, mb ? mb.minX : -WORLD_LIMIT, mb ? mb.maxX : WORLD_LIMIT);
            p[2] = clamp(p[2] + dz, mb ? mb.minZ : -WORLD_LIMIT, mb ? mb.maxZ : WORLD_LIMIT);
        }
        let localGround = this._resolveAvatarGround(p[0], p[2]);
        if (!localGround.ok) {
            groundQueryBlocked = true;
            rejectedGroundQuery = localGround;
            p[0] = previousPosition[0];
            p[2] = previousPosition[2];
            dx = 0;
            dz = 0;
            localGround = currentGround;
        }
        if (hasPlanarInput && !groundQueryBlocked)
            avatar.rotation_y = Math.atan2(dx, dz);
        const wasGrounded = this.state.controls.grounded !== false;
        const vertical = integrateAirportVerticalMotion({
            position_y_m: p[1],
            ground_y_m: localGround.surface_y_m,
            velocity_y_mps: this._jumpVelocity,
            grounded: wasGrounded,
            jump_requested: controls.jump === true,
            delta_seconds: dt,
            jump_speed_mps: JUMP_SPEED_MPS,
            gravity_mps2: GRAVITY_MPS2,
        });
        p[1] = vertical.position_y_m;
        this._jumpVelocity = vertical.velocity_y_mps;
        this.state.controls.grounded = vertical.grounded;
        verticalChanged = controls.jump === true || !wasGrounded || !vertical.grounded || Math.abs(p[1] - previousPosition[1]) > 1e-9;
        this._publishGroundSurface(localGround);
        if (groundQueryBlocked) {
            this.state.controls.ground_query_ok = false;
            this.state.controls.ground_query_reason = "outside_classified_walkable_surface_planar_move_rejected";
            this.state.controls.ground_query_rejected_xz_m = [
                Number(rejectedGroundQuery.query_x_m.toFixed(4)),
                Number(rejectedGroundQuery.query_z_m.toFixed(4)),
            ];
        }
        else {
            this.state.controls.ground_query_rejected_xz_m = null;
        }
        if (!hasPlanarInput && !controls.jump && !verticalChanged && this.state.controls.grounded && !wasMoving) {
            return this.state.controls;
        }
        avatar.position = p;
        this.state.controls.enabled = true;
        const planarMoved = hasPlanarInput && !groundQueryBlocked;
        this.state.controls.moving = planarMoved;
        this.state.controls.movement_mode = hasPlanarInput ? (runMode ? "run" : "walk") : "idle";
        if (groundQueryBlocked)
            this.state.controls.movement_mode = "idle";
        this.state.controls.run_mode = runMode;
        if (groundQueryBlocked)
            this.state.controls.run_mode = false;
        this.state.controls.speed_mps = effectiveSpeedMps;
        if (groundQueryBlocked)
            this.state.controls.speed_mps = 0;
        this.state.controls.run_cycle_speed = runCalibration.run_cycle_speed;
        this.state.controls.run_cycle_distance = runCalibration.run_cycle_distance;
        this.state.controls.run_cadence_steps_per_min = runCalibration.run_cadence_steps_per_min;
        this.state.controls.run_translation_speed_mps = runCalibration.effective_run_translation_speed_mps;
        this.state.controls.movement_basis_yaw = Number(basisYaw.toFixed(6));
        this.state.controls.movement_basis_source = Number.isFinite(Number(controls.camera_yaw))
            ? "camera_relative"
            : "world_fixed_legacy";
        this.state.controls.movement_direction = directionFromInput(forward, strafe);
        this.state.controls.last_planar_delta = [Number(dx.toFixed(4)), 0, Number(dz.toFixed(4))];
        this.state.controls.facing_semantics = facingSemanticsFromDelta(dx, dz);
        this.state.controls.jump_height_m = Number(vertical.jump_height_m.toFixed(3));
        avatar.locomotion = { ...this.state.controls };
        this._updatePortalStatus();
        this._serverSyncMs += dt * 1000;
        if (planarMoved && this._serverSyncMs >= 250) {
            this._serverSyncMs = 0;
            if (!this._wowLocalWalk) {
                this._transport.postJson(`${this.base}/movement`, {
                    forward,
                    strafe,
                    turn: 0,
                    source: "browser-real-avatar-controls",
                }).catch(() => { });
            }
        }
        this._maybeBroadcastPlayerPose();
        this._emit();
        return this.state.controls;
    }
    shouldAutoHandoff() {
        return this._portalTraversalController.shouldAutoHandoff();
    }
    markAutoHandoffObserved() {
        this._portalTraversalController.markAutoHandoffObserved();
    }
    broadcastPlayerPose({ force = false } = {}) {
        return this._maybeBroadcastPlayerPose({ force: force === true });
    }
    async triggerHandoff() {
        this._portalTraversalController.triggerHandoff();
    }
    setRp1FailClosedDemoMode(mode) {
        if (!RP1_FAIL_CLOSED_MODES.includes(mode)) {
            return {
                ok: false,
                error: `unknown RP1 fail-closed demo mode ${JSON.stringify(mode)} (valid: ${RP1_FAIL_CLOSED_MODES.join(", ")})`,
                demo_mode: this._rp1FailClosed.demo_mode,
            };
        }
        this._rp1FailClosed.demo_mode = mode;
        this._log(`RP1 fail-closed demo mode -> ${mode}` +
            (mode === "off"
                ? " (happy path: gate allows the local one-context crossing)"
                : " (armed: the next crossing attempt will be DENIED fail-closed with a rejected receipt)"));
        this._emit();
        return { ok: true, demo_mode: mode };
    }
    _rp1GateCheck() {
        const mode = RP1_FAIL_CLOSED_MODES.includes(this._rp1FailClosed.demo_mode)
            ? this._rp1FailClosed.demo_mode
            : "off";
        let receipt;
        try {
            const nav = this._navigatorDebug();
            const section = nav ? buildRp1Section(nav, demoModeToRp1Options(mode) || {}) : null;
            if (!section) {
                receipt =
                    mode === "off"
                        ? {
                            decision: "not-applicable",
                            status: "skipped",
                            action: null,
                            reasons: ["no World Navigator scope resolved (no RP1 parent->child attachment to authorize)"],
                            fail_closed: true,
                            evaluated_at: new Date().toISOString(),
                        }
                        : {
                            decision: "deny",
                            status: "rejected",
                            action: "default-deny",
                            reasons: [`demo mode ${mode} armed but no RP1 scope resolved (unknown condition => default-deny)`],
                            fail_closed: true,
                            evaluated_at: new Date().toISOString(),
                        };
            }
            else {
                const childScopeRef = (nav.child_fabric && nav.child_fabric.url) ||
                    (nav.portal_attachment && nav.portal_attachment.resolved_url) ||
                    null;
                receipt = gateChildScopeTraversal({
                    section,
                    request: traversalRequestForDemoMode(mode, childScopeRef),
                });
            }
        }
        catch (e) {
            receipt = {
                decision: "deny",
                status: "rejected",
                action: "default-deny",
                reasons: [`gate internal error: ${(e && e.message) || "unknown"} (unknown condition => default-deny)`],
                fail_closed: true,
                evaluated_at: new Date().toISOString(),
            };
        }
        receipt.demo_mode = mode;
        this._rp1FailClosed.last_receipt = receipt;
        if (receipt.decision === "deny")
            this._rp1FailClosed.deny_count += 1;
        if (receipt.decision === "allow")
            this._rp1FailClosed.allow_count += 1;
        return receipt;
    }
    _rp1FailClosedDebug() {
        return {
            gate_wired: true,
            demo_mode: this._rp1FailClosed.demo_mode,
            available_modes: RP1_FAIL_CLOSED_MODES.slice(),
            last_receipt: this._rp1FailClosed.last_receipt,
            allow_count: this._rp1FailClosed.allow_count,
            deny_count: this._rp1FailClosed.deny_count,
            descriptor: { ...RP1_FAIL_CLOSED },
            scope_note: "RP1 fail-closed traversal gate: consulted before every portal commit. " +
                "stale attachment => deny-child-scope-traversal; revoked session => no replay/reuse; " +
                "denied spatial.crossWorldLinking => cross-scope link blocked (local-only); repeated " +
                "mounts refused; default-deny on unknown. Scoped flag only — um_conformance unchanged.",
        };
    }
    async _promoteActiveEndpoint(targetKey, packet) {
        const previousRootContainer = this._navigator && this._navigator.root_fabric
            ? this._navigator.root_fabric.container
            : this.world
                ? this.world.location_id
                : null;
        const prefetchAtPromotion = packet && packet.fabric_prefetch_proof
            ? packet.fabric_prefetch_proof
            : this._fabricPrefetchProofBlock(new Date().toISOString());
        const prefetchPromotionInput = this._fabricPrefetchController.capturePromotionInput(prefetchAtPromotion);
        this.activeEndpointKey = targetKey;
        this.previewEndpointKey = oppositeEndpointKey(targetKey);
        this.endpoint = ENDPOINTS[this.activeEndpointKey];
        this.previewEndpoint = this.previewEndpointKey ? ENDPOINTS[this.previewEndpointKey] : null;
        this.base = this.endpoint.proxy_base;
        this._portalId = this.endpoint.portal_id;
        const ep = await this._resolveWowEndpoints();
        const wowWorld = await this._transport.getJson(ep.world.path);
        const wowPortals = await this._fetchWowPortals(ep, wowWorld);
        const wowPortal = wowPortals[0] || null;
        this._adoptPortalFrameId(wowPortal);
        this.world = worldFromLive(this.role, wowWorld, wowPortals, null);
        const authoredEndpoint = authoredWowGraphEndpoint(wowWorld, this.base);
        const promotedSceneSource = await this._resolveWowSceneGraph({
            base: this.base,
            spatialId: wowWorldSpatialId(wowWorld),
            graphEndpoint: authoredEndpoint,
            resolvedFrom: authoredEndpoint
                ? "crossing destination backend-advertised authored /wow/graph (reached via Portal.destination; confirmed vs promoted /wow/world)"
                : "crossing destination /wow/spatial (reached via source portal Portal.destination; confirmed vs promoted /wow/world)",
        });
        this._adoptLiveAirportScenePhysics(this._wowResolved);
        this._lastCrossingSceneSource = promotedSceneSource;
        this.world.color =
            this.activeEndpointKey === "b"
                ? "#ff7a3a"
                : this.activeEndpointKey === "lobby"
                    ? "#42d68a"
                    : "#3aa0ff";
        const check = validateProofBoundary(this.world.claim_boundary);
        this._boundaryOk = check.ok;
        this._boundaryProblems = check.problems;
        await this._initPlayerPreview();
        await this._initWorldNavigator();
        this._closeRuntimeStream();
        this._connectRuntimeStream();
        const record = {
            promoted_root_container: this._navigator && this._navigator.root_fabric
                ? this._navigator.root_fabric.container
                : this.world.location_id,
            demoted_root_container: previousRootContainer,
            handoff_id: packet ? packet.handoff_id || null : null,
            context_id: this._playerContextMarker ? this._playerContextMarker.context_id : null,
            single_context: true,
            mechanism: "child fabric promoted to the root frame of the SAME context; previous root disconnected and re-attached as child at the promoted fabric's portal-back node",
            promoted_at: new Date().toISOString(),
            promoted_with_prefetch: !!(prefetchAtPromotion && prefetchAtPromotion.used),
            fabric_prefetch_at_promotion: prefetchAtPromotion || null,
        };
        this._fabricPrefetchController.recordPromotion(record, prefetchAtPromotion);
        this._resetFabricPrefetch("promoted_to_" + this.world.location_id);
        this._navigatorPromotions.push(record);
        if (this._navigator) {
            this._navigator.promotion_count = this._navigatorPromotions.length;
            this._navigator.last_promotion = record;
        }
        if (this._playerContextMarker) {
            this._playerContextMarker.promotions = this._navigatorPromotions.slice();
        }
        this._startFabricCompletion({
            handoff_id: record.handoff_id,
            promotion_record: record,
            ...prefetchPromotionInput,
        });
        return record;
    }
    _fabricDerivedExitPose(frameMapping) {
        const mapped = frameMapping && frameMapping.mapped_exit_transform ? frameMapping.mapped_exit_transform : null;
        const root = this._rootFabricManifest;
        if (mapped && Array.isArray(mapped.position)) {
            return this._counterpartExitPoseFromFrameMapping(frameMapping, mapped, root);
        }
        const portalBack = root ? findFabricPortalAttachmentNode(root) : null;
        const cam = root && root.primary && root.primary.camera && Array.isArray(root.primary.camera.position)
            ? root.primary.camera.position
            : null;
        if (!portalBack || !cam) {
            const fallbackPosition = mapped
                ? clonePosition(mapped.position, this.world ? this.world.arrival.position : [0, 0, 3.6])
                : this.world
                    ? this.world.arrival.position.slice()
                    : [0, 0, 3.6];
            const fallbackGround = this._resolveAvatarGround(fallbackPosition[0], fallbackPosition[2]);
            if (!fallbackGround.ok) {
                throw new Error(`portal exit has no classified destination ground: ${fallbackGround.reason}`);
            }
            fallbackPosition[1] = fallbackGround.surface_y_m;
            return {
                source: "portal_frame_mapping_fallback",
                position: fallbackPosition,
                rotation_y: mapped
                    ? Number(mapped.rotation_y) || 0
                    : this.world
                        ? Number(this.world.arrival.rotation_y) || 0
                        : 0,
                matches_frame_mapping: null,
            };
        }
        const anchor = fabricNodePosition(portalBack);
        const dir = normalizeVec3([Number(cam[0]) - anchor[0], 0, Number(cam[2]) - anchor[2]], [0, 0, 1]);
        const right = [dir[2], 0, -dir[0]];
        const exitOffset = frameMapping && Number.isFinite(Number(frameMapping.exit_offset_m))
            ? clamp(Number(frameMapping.exit_offset_m), PORTAL_EXIT_OFFSET_MIN_M, PORTAL_EXIT_OFFSET_MAX_M)
            : PORTAL_EXIT_OFFSET_MIN_M;
        const lateral = frameMapping && Number.isFinite(Number(frameMapping.mapped_lateral_offset_m))
            ? Number(frameMapping.mapped_lateral_offset_m)
            : frameMapping && Number.isFinite(Number(frameMapping.lateral_offset_m))
                ? -Number(frameMapping.lateral_offset_m)
                : 0;
        const position = addScaled3(addScaled3([anchor[0], 0, anchor[2]], dir, exitOffset), right, lateral);
        const ground = this._resolveAvatarGround(position[0], position[2]);
        if (!ground.ok) {
            throw new Error(`portal exit has no classified destination ground: ${ground.reason}`);
        }
        position[1] = ground.surface_y_m;
        const rounded = roundVec3(position, 4);
        const rotation = mapped && Number.isFinite(Number(mapped.rotation_y))
            ? Number(mapped.rotation_y)
            : yawFromVector(dir, 0);
        return {
            source: "promoted_fabric_portal_back_node+primary_camera",
            portal_back_node: { node_id: fabricNodeId(portalBack), position: roundVec3(anchor, 4) },
            primary_camera_position: roundVec3(cam, 4),
            into_world_direction: roundVec3(dir, 6),
            exit_offset_m: roundNumber(exitOffset, 3),
            lateral_offset_m: roundNumber(lateral, 3),
            position: rounded,
            rotation_y: roundNumber(rotation, 6),
            yaw_from_fabric_direction: roundNumber(yawFromVector(dir, 0), 6),
            frame_mapped_exit: mapped
                ? {
                    position: roundVec3(mapped.position, 4),
                    rotation_y: roundNumber(Number(mapped.rotation_y) || 0, 6),
                }
                : null,
            matches_frame_mapping: mapped
                ? Math.abs(rounded[0] - Number(mapped.position[0] || 0)) <= 0.05 &&
                    Math.abs(rounded[2] - Number(mapped.position[2] || 0)) <= 0.05
                : null,
        };
    }
    _counterpartExitPoseFromFrameMapping(frameMapping, mapped, root) {
        const targetFrame = frameMapping && frameMapping.target_portal_frame ? frameMapping.target_portal_frame : null;
        const counterpartGround = targetFrame && Array.isArray(targetFrame.ground_center)
            ? [Number(targetFrame.ground_center[0]) || 0, 0, Number(targetFrame.ground_center[2]) || 0]
            : targetFrame && Array.isArray(targetFrame.position)
                ? [Number(targetFrame.position[0]) || 0, 0, Number(targetFrame.position[2]) || 0]
                : null;
        const exitPosition = clonePosition(mapped.position, this.world ? this.world.arrival.position : [0, 0, 3.6]);
        const ground = this._resolveAvatarGround(exitPosition[0], exitPosition[2]);
        if (!ground.ok) {
            throw new Error(`portal exit has no classified destination ground: ${ground.reason}`);
        }
        exitPosition[1] = ground.surface_y_m;
        const rounded = roundVec3(exitPosition, 4);
        const portalNodes = root ? findFabricPortalAttachmentNodes(root) : [];
        let hostingNode = null;
        if (counterpartGround) {
            for (const node of portalNodes) {
                const p = fabricNodePosition(node);
                const d = Math.hypot(p[0] - counterpartGround[0], p[2] - counterpartGround[2]);
                if (!hostingNode || d < hostingNode.distance_to_counterpart_m) {
                    hostingNode = {
                        node_id: fabricNodeId(node),
                        position: roundVec3(p, 4),
                        distance_to_counterpart_m: d,
                    };
                }
            }
        }
        const exitOffset = frameMapping && Number.isFinite(Number(frameMapping.exit_offset_m))
            ? Number(frameMapping.exit_offset_m)
            : null;
        const lateral = frameMapping && Number.isFinite(Number(frameMapping.mapped_lateral_offset_m))
            ? Number(frameMapping.mapped_lateral_offset_m)
            : frameMapping && Number.isFinite(Number(frameMapping.lateral_offset_m))
                ? -Number(frameMapping.lateral_offset_m)
                : null;
        return {
            source: "traversed_edge_counterpart_frame_mapping",
            target_frame_portal_id: targetFrame ? targetFrame.portal_id || null : null,
            target_frame_location_id: targetFrame ? targetFrame.location_id || null : null,
            target_frame_ground_center: counterpartGround ? roundVec3(counterpartGround, 4) : null,
            hosting_fabric_node: hostingNode
                ? {
                    node_id: hostingNode.node_id,
                    position: hostingNode.position,
                    distance_to_counterpart_m: roundNumber(hostingNode.distance_to_counterpart_m, 4),
                }
                : null,
            fabric_portal_node_count: portalNodes.length,
            exit_offset_m: exitOffset === null ? null : roundNumber(exitOffset, 3),
            landing_policy: frameMapping && frameMapping.landing_policy
                ? { ...frameMapping.landing_policy }
                : null,
            lateral_offset_m: lateral === null ? null : roundNumber(lateral, 3),
            position: rounded,
            rotation_y: roundNumber(Number(mapped.rotation_y) || 0, 6),
            frame_mapped_exit: {
                position: roundVec3(mapped.position, 4),
                rotation_y: roundNumber(Number(mapped.rotation_y) || 0, 6),
            },
            matches_frame_mapping: true,
        };
    }
    _recordMarkerCrossingComparison() {
        const marker = this._playerContextMarker;
        const atLoad = this._markerAtLoad;
        if (!marker || !atLoad)
            return null;
        let navEntryCount = 0;
        let navType = "unknown";
        try {
            const entries = typeof performance !== "undefined" && performance.getEntriesByType
                ? performance.getEntriesByType("navigation")
                : [];
            navEntryCount = entries ? entries.length : 0;
            navType = entries && entries[0] && entries[0].type ? entries[0].type : "unknown";
        }
        catch (e) {
        }
        const currentHref = typeof window !== "undefined" && window.location ? window.location.href : marker.current_href;
        const identityEqual = marker.marker_id === atLoad.marker_id &&
            marker.context_id === atLoad.context_id &&
            marker.created_at === atLoad.created_at;
        const noNewNavigation = navEntryCount === atLoad.navigation_entry_count_at_boot && currentHref === atLoad.boot_href;
        marker.same_marker_after_crossing = identityEqual && noNewNavigation;
        marker.crossing_comparison = {
            checked_at: new Date().toISOString(),
            method: "in-memory snapshot captured at load compared against a read after the crossing; a reload would recreate the marker and null this comparison",
            marker_id_at_load: atLoad.marker_id,
            marker_id_after_crossing: marker.marker_id,
            context_id_at_load: atLoad.context_id,
            context_id_after_crossing: marker.context_id,
            created_at_at_load: atLoad.created_at,
            created_at_after_crossing: marker.created_at,
            marker_identity_equal: identityEqual,
            navigation_entry_count_at_boot: atLoad.navigation_entry_count_at_boot,
            navigation_entry_count_after_crossing: navEntryCount,
            navigation_type_after_crossing: navType,
            href_at_boot: atLoad.boot_href,
            href_after_crossing: currentHref,
            no_new_navigation: noNewNavigation,
            same_js_context: identityEqual && noNewNavigation,
        };
        return { ...marker.crossing_comparison };
    }
    _crossingDebug() {
        return this._portalTraversalController.crossingDebug();
    }
    _applyDepartureMirror(packet) {
        return this._portalTraversalController.applyDepartureMirror(packet);
    }
    async _applyArrivalMirror(packet) {
        return this._portalTraversalController.applyArrivalMirror(packet);
    }
    async applyArrival(packet) {
        return this._portalTraversalController.applyLegacyArrival(packet);
    }
    async reset() {
        let pendingRecompose = null;
        if (this.clientMode === "player") {
            try {
                await this._transport.postJson(`${this.baseA}/reset`, {});
            }
            catch (e) {
            }
            try {
                await this._transport.postJson(`${this.baseB}/reset`, {});
            }
            catch (e) {
            }
            try {
                await this._transport.postJson(`${BASE_LOBBY}/reset`, {});
            }
            catch (e) {
            }
            const demoted = this.activeEndpointKey !== this._bootEndpointKey;
            this.activeEndpointKey = this._bootEndpointKey;
            this.previewEndpointKey = oppositeEndpointKey(this.activeEndpointKey);
            this.endpoint = ENDPOINTS[this.activeEndpointKey];
            this.previewEndpoint = this.previewEndpointKey ? ENDPOINTS[this.previewEndpointKey] : null;
            this.base = this.endpoint.proxy_base;
            this._portalId = this.endpoint.portal_id;
            try {
                const ep = await this._resolveWowEndpoints();
                const wowWorld = await this._transport.getJson(ep.world.path);
                const wowPortals = await this._fetchWowPortals(ep, wowWorld);
                this._adoptPortalFrameId(wowPortals[0] || null);
                this.world = worldFromLive(this.role, wowWorld, wowPortals, null);
                this._airportWalkableSurface = null;
                this._movementBounds = null;
                this.world.color =
                    this.activeEndpointKey === "b"
                        ? "#ff7a3a"
                        : this.activeEndpointKey === "lobby"
                            ? "#42d68a"
                            : "#3aa0ff";
                const check = validateProofBoundary(this.world.claim_boundary);
                this._boundaryOk = check.ok;
                this._boundaryProblems = check.problems;
            }
            catch (e) {
                this._log(`reset: world refetch failed (${e.message}); keeping previous world`);
            }
            await this._initPlayerPreview();
            await this._initWorldNavigator();
            this.state.arrival_count = this.world.initial_arrival_count ?? 0;
            if (this._playerContextMarker) {
                this._playerContextMarker.same_marker_after_crossing = null;
                this._playerContextMarker.crossing_comparison = null;
            }
            this.state.player_handoff_profile = null;
            if (demoted) {
                this._closeRuntimeStream();
                this._connectRuntimeStream();
                pendingRecompose = {
                    kind: "reset_demotion",
                    to: endpointDebug(this.endpoint, this.world),
                };
            }
        }
        else {
            try {
                await this._transport.postJson(`${this.base}/reset`, {});
            }
            catch (e) {
            }
        }
        if (this._startsEmbodied) {
            this.state.phase = HANDOFF_PHASES.IDLE;
            this.state.handoff_id = null;
            this.state.last_handoff_direction = null;
            this.state.last_handoff_payload = null;
            this.state.last_pose_payload = null;
            this.state.avatar = {
                avatar_id: this.world.avatar.avatar_id,
                continuity_id: this.world.avatar.continuity_id,
                display_name: this.world.avatar.display_name,
                position: this.world.avatar.spawn_position.slice(),
                rotation_y: this.world.avatar.rotation_y,
                locomotion: this.state.controls,
                equippedItems: this._noDefaultEquipment ? [] : defaultEquippedItems(),
                avatar_variant: DEFAULT_AVATAR_VARIANT,
                preferred_height_m: null,
                _provenance: PROVENANCE.LIVE,
            };
            this.state.equipment_status = {
                validation: validateEquippedItems(this.state.avatar.equippedItems),
                items: this.state.avatar.equippedItems.map((item) => ({
                    itemId: item.itemId,
                    mode: item.mode,
                    attachmentPoint: item.attachmentPoint,
                    assetUri: item.assetUri,
                    fetch_ok: null,
                    visible_fallback: false,
                    message: "source item path prepared; fetch checked on destination",
                })),
            };
        }
        else {
            this.state.phase = HANDOFF_PHASES.WAITING;
            this.state.handoff_id = null;
            this.state.last_handoff_direction = null;
            this.state.last_handoff_payload = null;
            this.state.last_pose_payload = null;
            this.state.avatar = null;
            this.state.equipment_status = null;
            this.state.arrival_count = 0;
        }
        this._jumpVelocity = 0;
        this._nonPortalHandoffInFlight = false;
        this.state.controls = {
            enabled: this._startsEmbodied,
            moving: false,
            movement_mode: "idle",
            run_mode: false,
            speed_mps: 0,
            grounded: true,
            jump_height_m: 0,
            portal_distance_m: null,
            portal_center: null,
            portal_radius_m: null,
            portal_frame: null,
            portal_target_frame: null,
            portal_frame_id: null,
            portal_frame_position: null,
            portal_frame_forward: null,
            portal_frame_up: null,
            portal_frame_right: null,
            portal_frame_width_m: null,
            portal_frame_height_m: null,
            portal_trigger_depth_m: null,
            portal_linked_target_portal_id: null,
            portal_local_coordinates: null,
            portal_signed_plane_distance_m: null,
            portal_plane_distance_abs_m: null,
            portal_inside_oval_aperture: false,
            inside_oval_aperture: false,
            inside_trigger_volume: false,
            portal_crossing_direction: "unknown",
            portal_last_crossing_direction: null,
            portal_entry_crossing_direction: null,
            portal_traversal_mode: null,
            portal_allowed_entry_side: null,
            portal_blocked_entry_side: null,
            portal_current_entry_side: null,
            portal_entry_side_allowed: true,
            portal_traversal_rejected_count: 0,
            portal_last_traversal_rejection: null,
            portal_frame_mapping: null,
            mapped_exit_transform: null,
            mapped_exit_yaw: null,
            portal_target_location_id: null,
            portal_target_world_id: null,
            portal_trigger_rearmed: this._startsEmbodied,
            portal_rearm_required: false,
            portal_exited_since_arrival: this._startsEmbodied,
            portal_handoff_source_ready: false,
            portal_handoff_target_ready: false,
            portal_handshake_ready: false,
            return_handshake_ready: false,
            portal_ready_blocker: "reset",
            inside_portal_trigger: false,
            auto_handoff_ready: false,
            movement_direction: "none",
            last_planar_delta: [0, 0, 0],
            facing_semantics: "still",
            portal_transition_phase: "none",
            portal_transition_elapsed_s: 0,
            portal_transition_phase_history: [],
        };
        this._portalTraversalController.reset({ reason: "reset", startsEmbodied: this._startsEmbodied });
        if (this.state.avatar)
            this.state.avatar.locomotion = { ...this.state.controls };
        this._updatePortalStatus();
        this._peers.resetBroadcastState();
        this._broadcast({ type: "reset", role: this.role, at: Date.now() });
        if (this.clientMode === "player")
            this._maybeBroadcastPlayerPose({ force: true });
        this._emit();
        if (pendingRecompose) {
            this.dispatchEvent(new CustomEvent("crossing", { detail: pendingRecompose }));
        }
    }
    async returnToLobby() {
        if (this.clientMode !== "player")
            return { ok: false, reason: "not_player" };
        if (this._clientSceneController.active())
            return this.returnFromClientSceneLoad();
        if (this.activeEndpointKey === "lobby") {
            return { ok: true, already_in_lobby: true, location_id: this.world ? this.world.location_id : null };
        }
        if (!ENDPOINTS.lobby)
            return { ok: false, reason: "missing_lobby_endpoint" };
        const fromBase = this.base;
        const from = endpointDebug(this.endpoint, this.world);
        const previousAvatar = this.state.avatar ? JSON.parse(JSON.stringify(this.state.avatar)) : null;
        const handoffId = `return-to-lobby-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
        this._nonPortalHandoffInFlight = true;
        this._fabricPrefetchController.cancelCompletion("return_to_lobby");
        try {
            await this._departPresence(fromBase, "return_to_lobby");
            this.activeEndpointKey = "lobby";
            this.previewEndpointKey = null;
            this.endpoint = ENDPOINTS.lobby;
            this.previewEndpoint = null;
            this.base = this.endpoint.proxy_base;
            this._portalId = this.endpoint.portal_id;
            const ep = await this._resolveWowEndpoints();
            const wowWorld = await this._transport.getJson(ep.world.path);
            const wowPortals = await this._fetchWowPortals(ep, wowWorld);
            this._adoptPortalFrameId(wowPortals[0] || null);
            this.world = worldFromLive(this.role, wowWorld, wowPortals, null);
            this._airportWalkableSurface = null;
            this._movementBounds = null;
            this.world.color = "#42d68a";
            const check = validateProofBoundary(this.world.claim_boundary);
            this._boundaryOk = check.ok;
            this._boundaryProblems = check.problems;
            this.state.phase = HANDOFF_PHASES.IDLE;
            this.state.handoff_id = null;
            this.state.arrival_count = this.world.initial_arrival_count ?? 0;
            this.state.preview = null;
            this.state.portal_previews = null;
            this.state.last_handoff_direction = "return_to_lobby";
            this.state.last_handoff_payload = null;
            this.state.last_pose_payload = null;
            this.state.player_handoff_profile = null;
            this.state.controls.enabled = true;
            this.state.controls.moving = false;
            this.state.controls.movement_mode = "idle";
            this.state.controls.run_mode = false;
            this.state.controls.speed_mps = 0;
            this.state.controls.grounded = true;
            this.state.controls.jump_height_m = 0;
            this.state.controls.movement_direction = "none";
            this.state.controls.last_planar_delta = [0, 0, 0];
            this.state.controls.facing_semantics = "still";
            this.state.controls.portal_transition_phase = "none";
            this.state.controls.portal_transition_elapsed_s = 0;
            this.state.controls.portal_transition_phase_history = [];
            this.state.controls.portal_trigger_rearmed = true;
            this.state.controls.portal_rearm_required = false;
            this.state.controls.portal_exited_since_arrival = true;
            this.state.controls.portal_ready_blocker = "return_to_lobby";
            this.state.controls.auto_handoff_ready = false;
            this.state.controls.inside_portal_trigger = false;
            const carriedItems = previousAvatar && Array.isArray(previousAvatar.equippedItems)
                ? previousAvatar.equippedItems
                : defaultEquippedItems();
            this.state.avatar = {
                avatar_id: previousAvatar ? previousAvatar.avatar_id : this.world.avatar.avatar_id,
                continuity_id: previousAvatar && previousAvatar.continuity_id
                    ? previousAvatar.continuity_id
                    : this.world.avatar.continuity_id,
                display_name: previousAvatar && previousAvatar.display_name
                    ? previousAvatar.display_name
                    : this.world.avatar.display_name,
                position: this.world.avatar.spawn_position.slice(),
                rotation_y: this.world.avatar.rotation_y,
                locomotion: this.state.controls,
                equippedItems: carriedItems,
                avatar_variant: previousAvatar && previousAvatar.avatar_variant
                    ? previousAvatar.avatar_variant
                    : DEFAULT_AVATAR_VARIANT,
                _provenance: PROVENANCE.LIVE,
            };
            this.state.equipment_status = {
                validation: validateEquippedItems(carriedItems),
                items: carriedItems.map((item) => ({
                    itemId: item.itemId,
                    mode: item.mode,
                    attachmentPoint: item.attachmentPoint,
                    assetUri: item.assetUri,
                    fetch_ok: null,
                    visible_fallback: false,
                    message: "carried through return-to-lobby navigation",
                })),
            };
            await this._initPlayerPreview();
            await this._initWorldNavigator();
            this._jumpVelocity = 0;
            this._nonPortalHandoffInFlight = false;
            this._portalTraversalController.reset({ reason: "return_to_lobby", startsEmbodied: true });
            this._resetFabricPrefetch("return_to_lobby");
            this._closeRuntimeStream();
            this._connectRuntimeStream();
            await this._registerPresence("return_to_lobby");
            this._maybeBroadcastPlayerPose({ force: true });
            this._emit();
            const detail = {
                kind: "return_to_lobby",
                handoff_id: handoffId,
                from,
                to: endpointDebug(this.endpoint, this.world),
                same_context: true,
                no_page_reload: true,
            };
            this.dispatchEvent(new CustomEvent("crossing", { detail }));
            return { ok: true, ...detail };
        }
        catch (err) {
            this._nonPortalHandoffInFlight = false;
            this._log(`return-to-lobby failed: ${err.message}`);
            this._emit();
            return { ok: false, reason: err.message };
        }
    }
    _activeDebug() {
        return endpointDebug(this.endpoint, this.world);
    }
    _previewDebug() {
        if (this.state.preview) {
            const freshness = previewFreshnessMs(this.state.preview.captured_at);
            return {
                ...this.state.preview,
                freshness_ms: freshness,
                preview_freshness_ms: freshness,
                preview_source_type: this.state.preview.source_type,
                preview_readonly: this.state.preview.readonly === true,
                preview_target_location_id: this.state.preview.location_id,
                preview_target_world_id: this.state.preview.world_id,
                preview_target_portal_id: this.state.preview.target_portal_id,
                preview_fallback_reason: this.state.preview.fallback_reason,
            };
        }
        if (!this.previewEndpoint) {
            return {
                state: "none",
                source_type: "none",
                preview_source_type: "none",
                readonly: true,
                preview_readonly: true,
                endpoint_key: null,
                proxy_base: null,
                backend_base_url: null,
                location_id: null,
                preview_target_location_id: null,
                world_id: null,
                preview_target_world_id: null,
                target_portal_id: null,
                preview_target_portal_id: null,
                linked_source_portal_id: null,
                freshness_ms: null,
                preview_freshness_ms: null,
                captured_at: null,
                fallback_reason: null,
                preview_fallback_reason: null,
                projection_frame_source: null,
                target_arrival_count_before_preview: null,
                target_arrival_count_current: null,
                target_state_revision_before_preview: null,
                target_state_revision_current: null,
                target_handoff_context_before_preview: false,
                target_handoff_context_current: false,
                target_debug_last_input_source: null,
                target_avatar_presence_created: false,
                target_mutation_count_during_preview: 0,
                source_camera_relative_to_portal: {},
                target_preview_camera_transform: {},
                preview_projection_transform: {},
            };
        }
        return {
            state: "inactive",
            source_type: "none",
            preview_source_type: "none",
            readonly: true,
            preview_readonly: true,
            endpoint_key: this.previewEndpoint.endpoint_key,
            proxy_base: this.previewEndpoint.proxy_base,
            backend_base_url: this.previewEndpoint.backend_base_url,
            location_id: this.previewEndpoint.location_id,
            preview_target_location_id: this.previewEndpoint.location_id,
            world_id: this.previewEndpoint.world_id,
            preview_target_world_id: this.previewEndpoint.world_id,
            target_portal_id: this.previewEndpoint.portal_id,
            preview_target_portal_id: this.previewEndpoint.portal_id,
            linked_source_portal_id: this.endpoint.portal_id,
            freshness_ms: null,
            preview_freshness_ms: null,
            captured_at: null,
            fallback_reason: null,
            preview_fallback_reason: null,
            projection_frame_source: "source_portal_frame+target_portal_frame",
            target_arrival_count_before_preview: null,
            target_arrival_count_current: null,
            target_state_revision_before_preview: null,
            target_state_revision_current: null,
            target_handoff_context_before_preview: false,
            target_handoff_context_current: false,
            target_debug_last_input_source: null,
            target_avatar_presence_created: false,
            target_mutation_count_during_preview: 0,
            source_camera_relative_to_portal: {},
            target_preview_camera_transform: {},
            preview_projection_transform: {},
        };
    }
    _playerContextMarkerDebug() {
        if (!this._playerContextMarker)
            return null;
        const currentHref = typeof window !== "undefined" && window.location
            ? window.location.href
            : this._playerContextMarker.current_href;
        this._playerContextMarker.current_href = currentHref;
        return { ...this._playerContextMarker };
    }
    beginVisualTransition(metadata = {}) {
        if (this._visualTransitionSnapshot) {
            throw new Error("a visual transition is already staged");
        }
        const sourceDebug = this.debugState();
        const state = {
            ...this.state,
            avatar: snapshotRenderFacingAvatar(this.state.avatar),
            controls: { ...(this.state.controls || {}) },
            preview: this.state.preview,
            portal_previews: this.state.portal_previews,
            equipment_status: this.state.equipment_status,
        };
        this._visualTransitionSnapshot = {
            metadata: { ...metadata },
            staged_at: new Date().toISOString(),
            state,
            liveAvatar: this.state.avatar,
            liveControls: this.state.controls,
            world: this.world,
            base: this.base,
            activeEndpointKey: this.activeEndpointKey,
            previewEndpointKey: this.previewEndpointKey,
            endpoint: this.endpoint,
            previewEndpoint: this.previewEndpoint,
            portalId: this._portalId,
            activeDebug: this._activeDebug(),
            previewDebug: this._previewDebug(),
            sourceDebug,
            infrastructure: {
                wowEndpoints: this._wowEndpoints,
                wowEndpointResolution: this._wowEndpointResolution,
                wowSceneSource: this._wowSceneSource,
                lastCrossingSceneSource: this._lastCrossingSceneSource,
                boundaryOk: this._boundaryOk,
                boundaryProblems: this._boundaryProblems,
                navigator: this._navigator,
                childFabricManifest: this._childFabricManifest,
                rootFabricManifest: this._rootFabricManifest,
            },
        };
        return this.visualRuntimeSnapshot();
    }
    visualRuntimeSnapshot() {
        const staged = this._visualTransitionSnapshot;
        if (!staged) {
            return {
                staged: false,
                metadata: null,
                state: this.state,
                world: this.world,
                base: this.base,
                activeEndpointKey: this.activeEndpointKey,
                previewEndpointKey: this.previewEndpointKey,
            };
        }
        return {
            staged: true,
            metadata: { ...staged.metadata },
            state: staged.state,
            world: staged.world,
            base: staged.base,
            activeEndpointKey: staged.activeEndpointKey,
            previewEndpointKey: staged.previewEndpointKey,
        };
    }
    visualDebugState() {
        const raw = this.debugState();
        const staged = this._visualTransitionSnapshot;
        if (!staged)
            return raw;
        return {
            ...staged.sourceDebug,
            active: staged.activeDebug,
            preview: staged.previewDebug,
            portal_previews: staged.state.portal_previews || null,
            location_id: staged.world.location_id,
            world_id: staged.world.world_id,
            session_id: staged.world.session_id,
            phase: staged.state.phase,
            handoff_id: staged.state.handoff_id,
            session: { arrival_count: staged.state.arrival_count },
            avatar: staged.state.avatar,
            controls: staged.state.controls,
            equipment_status: staged.state.equipment_status,
            claim_boundary: staged.world.claim_boundary,
            visual_transition: {
                staged: true,
                metadata: { ...staged.metadata },
                staged_at: staged.staged_at,
            },
        };
    }
    commitVisualTransition({ emit = false } = {}) {
        if (!this._visualTransitionSnapshot)
            return false;
        this._visualTransitionSnapshot = null;
        if (emit)
            this._emit();
        return true;
    }
    abortVisualTransition({ restore = false } = {}) {
        const staged = this._visualTransitionSnapshot;
        if (!staged)
            return false;
        if (restore) {
            this.activeEndpointKey = staged.activeEndpointKey;
            this.previewEndpointKey = staged.previewEndpointKey;
            this.endpoint = staged.endpoint;
            this.previewEndpoint = staged.previewEndpoint;
            this.base = staged.base;
            this._portalId = staged.portalId;
            this.world = staged.world;
            let restoredAvatar = staged.state.avatar;
            if (staged.liveAvatar && staged.state.avatar) {
                restoredAvatar = staged.liveAvatar;
                for (const key of Object.keys(restoredAvatar))
                    delete restoredAvatar[key];
                Object.assign(restoredAvatar, snapshotRenderFacingAvatar(staged.state.avatar));
            }
            let restoredControls = { ...(staged.state.controls || {}) };
            if (staged.liveControls) {
                restoredControls = staged.liveControls;
                for (const key of Object.keys(restoredControls))
                    delete restoredControls[key];
                Object.assign(restoredControls, staged.state.controls || {});
            }
            for (const key of Object.keys(this.state))
                delete this.state[key];
            Object.assign(this.state, staged.state, {
                avatar: restoredAvatar,
                controls: restoredControls,
            });
            const infrastructure = staged.infrastructure;
            this._wowEndpoints = infrastructure.wowEndpoints;
            this._wowEndpointResolution = infrastructure.wowEndpointResolution;
            this._wowSceneSource = infrastructure.wowSceneSource;
            this._lastCrossingSceneSource = infrastructure.lastCrossingSceneSource;
            this._boundaryOk = infrastructure.boundaryOk;
            this._boundaryProblems = infrastructure.boundaryProblems;
            this._navigator = infrastructure.navigator;
            this._childFabricManifest = infrastructure.childFabricManifest;
            this._rootFabricManifest = infrastructure.rootFabricManifest;
        }
        this._visualTransitionSnapshot = null;
        return true;
    }
    debugState() {
        const proofBoundary = strictProofBoundary(this.world && this.world.claim_boundary);
        const traversalDebug = this._portalTraversalController.debug();
        return {
            role: this.role,
            mode: this.mode,
            client_mode: this.clientMode,
            provenance: PROVENANCE.LIVE,
            active: this._activeDebug(),
            preview: this._previewDebug(),
            portal_previews: this.state.portal_previews || null,
            controlled_identity: this.controlledIdentity(),
            player_context_marker: this._playerContextMarkerDebug(),
            navigator: this._navigatorDebug(),
            crossing: traversalDebug.crossing,
            client_scene_load: this._clientSceneController.debug(),
            wow_scene_source: this._wowSceneSource || null,
            um_signing: {
                signed_on_exit: traversalDebug.um_signing.signed_on_exit,
                verified_on_arrival: traversalDebug.um_signing.verified_on_arrival,
                scope_note: "v0.4 UM manifest signed on exit (Signature Profile A: Ed25519 + JCS-RFC8785 + did:key subject binding) " +
                    "and verified on arrival (runtime verifier). Schema-valid v0.4 + real signature; NOT evaluator conformance. " +
                    "um_conformance unchanged.",
            },
            um_identity: this._umIdentity
                ? {
                    ...this._umIdentity,
                    scope_note: "UM IDENTITY spine (Ed25519 + JCS-RFC8785 + did:key) over the OpenUserManifest content " +
                        "{name,age,avatarAssetURI}, fronted via /wow/user as a labeled non-canonical additive field. " +
                        "REAL signature, byte-exact verify; NOT standards conformance (standards_conformance stays false). " +
                        "Separate from um_signing (crossing) and the deferred .msf RS256/x5c engine spine.",
                }
                : null,
            rp1_fail_closed: this._rp1FailClosedDebug(),
            fabric_prefetch: this._fabricPrefetchDebug(),
            presence_registration: this._presenceDebug(),
            presence_push: this._presencePushDebug(),
            wow_endpoints: this._wowEndpointResolution
                ? {
                    resolved_from_services: this._wowEndpointResolution.resolved_from_services,
                    base: this._wowEndpointResolution.base,
                    provenance: this._wowEndpointResolution.provenance,
                    resolution_rule: this._wowEndpointResolution.resolution_rule,
                }
                : null,
            view_match: this._viewMatch || null,
            player_handoff_profile: traversalDebug.player_handoff_profile || null,
            location_id: this.world.location_id,
            world_id: this.world.world_id,
            session_id: this.world.session_id,
            phase: this.state.phase,
            handoff_id: this.state.handoff_id,
            session: { arrival_count: this.state.arrival_count },
            avatar: this.state.avatar,
            controls: this.state.controls,
            portal_transition: traversalDebug.portal_transition,
            visibility: this._visibilityDebug(),
            live_player_pose: this._peers.livePoseDebug(),
            peer_players: this._peerPlayersDebug(),
            co_present_peer_count: this._coPresentPeerCount(),
            player_pose_broadcast: this._playerPoseBroadcastDebug(),
            last_handoff_direction: this.state.last_handoff_direction,
            last_handoff_payload: this.state.last_handoff_payload,
            last_pose_payload: this.state.last_pose_payload,
            geopose_shaped_pose: this.state.avatar
                ? geoPoseShapedFromTransform(transformSnapshot(this.state.avatar))
                : (this.state.last_handoff_payload &&
                    this.state.last_handoff_payload.avatar_context &&
                    this.state.last_handoff_payload.avatar_context.geopose_shaped_pose) ||
                    null,
            equipment_status: this.state.equipment_status,
            claim_boundary: this.world.claim_boundary,
            proof_boundary: proofBoundary,
            proof_boundary_check: this.boundaryStatus(),
        };
    }
    apiPanelInfo() {
        const active = this.endpoint;
        const targetKey = oppositeEndpointKey(this.activeEndpointKey) ||
            endpointKeyForLocation(this.world && this.world.portal ? this.world.portal.target_location_id : null) ||
            "a";
        const target = ENDPOINTS[targetKey];
        const root = this._rootFabricManifest;
        const services = Array.isArray(root && root.services) ? root.services : [];
        return {
            spec_identity: { ...SPEC_IDENTITY },
            wow_contract_validation: this._transport.wowContractValidationSnapshot(),
            active: {
                endpoint_key: active.endpoint_key,
                proxy_base: active.proxy_base,
                location_id: this.world ? this.world.location_id : active.location_id,
                portal_id: active.portal_id,
            },
            target: {
                endpoint_key: target.endpoint_key,
                proxy_base: target.proxy_base,
                location_id: target.location_id,
                portal_id: target.portal_id,
            },
            services: services.map((svc) => ({
                name: svc.name,
                type: svc.type,
                endpoint: svc.endpoint,
                default_id: svc.default_id ?? null,
            })),
            services_line: services.length
                ? "fabric services[] → " + services.map((svc) => svc.endpoint).join(", ")
                : "fabric services[] → (root fabric not loaded)",
            resolved_endpoints: this._wowEndpointResolution
                ? {
                    resolved_from_services: this._wowEndpointResolution.resolved_from_services,
                    resolution_rule: this._wowEndpointResolution.resolution_rule,
                    world: this._wowEndpointResolution.provenance.world.resolved_path,
                    user: this._wowEndpointResolution.provenance.user.resolved_path,
                    portal: this._wowEndpointResolution.provenance.portal.resolved_path,
                    view: this._wowEndpointResolution.provenance.view.resolved_path,
                    provenance: this._wowEndpointResolution.provenance,
                    line: this._wowEndpointResolution.resolved_from_services
                        ? "resolved from services[] → " +
                            ["world", "user", "portal", "view"]
                                .map((k) => this._wowEndpointResolution.provenance[k].resolved_path)
                                .join(", ")
                        : "using fallback constants (manifest advertised no WoW services[])",
                }
                : null,
            view_match: this._viewMatch || null,
        };
    }
    async apiFetchEndpoint(kind, id) {
        const base = this.base;
        let url;
        let schema;
        switch (String(kind)) {
            case "world":
                url = `${base}/wow/world`;
                schema = "World";
                break;
            case "user":
                url = `${base}/wow/user/${encodeURIComponent(id != null && id !== "" ? id : 1)}`;
                schema = "User";
                break;
            case "view":
                url = `${base}/wow/view/${encodeURIComponent(id != null && id !== "" ? id : 1)}`;
                schema = "View";
                break;
            case "portal":
                url = `${base}/wow/portal/${encodeURIComponent(id != null && id !== "" ? id : this._portalId)}`;
                schema = "Portal";
                break;
            case "fabric":
                url = `${base}/fabric.json`;
                schema = "fabric manifest";
                break;
            default:
                return { ok: false, status: 0, url: null, schema: "unknown", json: { error: `unknown endpoint kind: ${kind}` } };
        }
        try {
            const json = await this._transport.getJson(url);
            return { ok: true, status: 200, url: this._transport.displayPath(url), schema, json };
        }
        catch (err) {
            let status = 0;
            let json = { error: err.message };
            try {
                const res = await this._transport.rawFetch(url, { headers: { Accept: "application/json" } });
                status = res.status;
                json = await res.json().catch(() => ({ error: `${res.status}` }));
            }
            catch (e2) {
                json = { error: e2.message };
            }
            return { ok: false, status, url: this._transport.displayPath(url), schema, json };
        }
    }
    async presenterExitIntent() {
        const url = `${this.base}/portal/exit-intent`;
        const packet = await this._transport.postJson(url, { portal_id: this._portalId });
        return { ok: true, status: 201, url: this._transport.displayPath(url), endpoint_key: this.activeEndpointKey, packet };
    }
    async presenterDeliverArrival(packet, opts = {}) {
        const pkt = packet && typeof packet === "object" ? packet : {};
        const target = pkt.target || {};
        const realTargetKey = endpointKeyForLocation(target.location_id) ||
            oppositeEndpointKey(this.activeEndpointKey) ||
            endpointKeyForLocation(this.world && this.world.portal ? this.world.portal.target_location_id : null) ||
            "a";
        const wrongKey = oppositeEndpointKey(realTargetKey) || this.activeEndpointKey;
        const deliverKey = opts.toWrongNode ? wrongKey : realTargetKey;
        const deliverBase = ENDPOINTS[deliverKey].proxy_base;
        let before = null;
        try {
            const dbg = await this._transport.getJson(`${deliverBase}/debug/state`);
            before = dbg && dbg.session ? dbg.session.arrival_count : null;
        }
        catch (e) { }
        const url = `${deliverBase}/portal/arrival`;
        try {
            const res = await this._transport.postJson(url, pkt);
            let after = null;
            try {
                const dbg = await this._transport.getJson(`${deliverBase}/debug/state`);
                after = dbg && dbg.session ? dbg.session.arrival_count : null;
            }
            catch (e) { }
            return {
                ok: true, status: 201, url: this._transport.displayPath(url), delivered_to_endpoint: deliverKey,
                wrong_node: !!opts.toWrongNode, arrival_count_before: before, arrival_count_after: after,
                arrival_count_delta: (before != null && after != null) ? after - before : null,
                response: res,
            };
        }
        catch (err) {
            return {
                ok: false, status: err.body ? 400 : 0, url: this._transport.displayPath(url), delivered_to_endpoint: deliverKey,
                wrong_node: !!opts.toWrongNode, arrival_count_before: before, arrival_count_after: before,
                arrival_count_delta: 0, response: err.body || { error: err.message },
            };
        }
    }
    _emit(opts = {}) {
        const detail = this.visualDebugState();
        this.dispatchEvent(new CustomEvent("state", { detail }));
        if (opts.broadcastVisibility !== false)
            this._broadcastVisibility();
    }
    _log(msg) {
        console.log(`[live-adapter:${this.role}] ${msg}`);
    }
    _beginPortalTransition(source, portalArg) {
        return this._portalTraversalController.beginTransition({ source, portal: portalArg });
    }
    _stepPortalTransition(dt) {
        const result = this._portalTraversalController.stepTransition({ deltaSeconds: dt });
        if (!result.moved)
            return this.state.controls;
        this._updatePortalStatus({ skipTransitionStart: true });
        this._maybeBroadcastPlayerPose();
        this._emit();
        return this.state.controls;
    }
    _updatePortalStatus(opts = {}) {
        const result = this._portalTraversalController.updatePortalStatus(opts);
        if (result && result.transitionRequest) {
            const ev = result.transitionRequest;
            this._beginPortalTransition("plane_crossing", ev.portal);
            return;
        }
        const avatar = result && result.avatar;
        const evaluations = result && result.evaluations ? result.evaluations : [];
        if (this.clientMode === "player" && avatar) {
            try {
                this._updateFabricPrefetch(avatar, evaluations);
            }
            catch (e) {
            }
        }
        return result;
    }
    _fabricProxyBaseForAddress(address) {
        if (address) {
            for (const key of Object.keys(ENDPOINTS)) {
                if (address.location_id && ENDPOINTS[key].location_id === address.location_id) {
                    return ENDPOINTS[key].proxy_base;
                }
            }
            for (const key of Object.keys(ENDPOINTS)) {
                if (address.authority && ENDPOINTS[key].backend_base_url === address.authority) {
                    return ENDPOINTS[key].proxy_base;
                }
            }
        }
        return this.previewEndpoint ? this.previewEndpoint.proxy_base : null;
    }
    _resetFabricPrefetch(reason) {
        return this._fabricPrefetchController.reset({
            reason,
            world: this.world,
            clientMode: this.clientMode,
        });
    }
    _fabricPrefetchFocusMachine() {
        const machines = this._fabricPrefetchMachines || {};
        const focusKey = this.state && this.state.controls ? this.state.controls.portal_focus_portal_id : null;
        if (focusKey && machines[focusKey])
            return machines[focusKey];
        const keys = Object.keys(machines);
        return keys.length ? machines[keys[0]] : null;
    }
    _updateFabricPrefetch(avatar, evaluations) {
        return this._fabricPrefetchController.update({
            avatar,
            evaluations,
            focusPortalId: this.state && this.state.controls ? this.state.controls.portal_focus_portal_id : null,
            world: this.world,
            clientMode: this.clientMode,
        });
    }
    _refreshFabricPresence(machine) {
        return this._fabricPrefetchController.refreshPresence(machine);
    }
    notifyFabricChunkRendered(portalKey, chunksRendered) {
        return this._fabricPrefetchController.notifyChunkRendered(portalKey, chunksRendered);
    }
    _fabricPrefetchDebug() {
        return this._fabricPrefetchController.debug({
            focusPortalId: this.state && this.state.controls ? this.state.controls.portal_focus_portal_id : null,
        });
    }
    _fabricPrefetchProofBlock(commitIso, portalKey) {
        return this._fabricPrefetchController.proofBlock(commitIso, portalKey);
    }
    _startFabricCompletion(context) {
        return this._fabricPrefetchController.startCompletion(context);
    }
    _fabricCompletionDebug() {
        return this._fabricPrefetchController.completionDebug();
    }
    async applyWowIntent(next) {
        if (!next)
            return null;
        const wasRegistering = this._wowRegistersPresence;
        this.wowIntent = next;
        this._wowRegistersPresence = next.registersPresence !== false;
        this.wowFollowTarget = next.followTarget || null;
        if (this.clientMode !== "player")
            return null;
        if (wasRegistering === this._wowRegistersPresence) {
            return { intent: next.intent, registersPresence: this._wowRegistersPresence, changed: false };
        }
        if (this._wowRegistersPresence) {
            this._presenceController.setSupported(true);
            await this._registerPresence("wow_intent_" + next.intent);
        }
        else {
            await this._departPresence(this.base, "wow_intent_preview");
            this._stopPresenceHeartbeat();
            this._presenceController.setSupported(false);
            this._presenceController.clearRegistration();
        }
        this._presenceController.recordEvent("wow_intent", {
            intent: next.intent,
            aspect_id: next.aspectId || null,
            registers_presence: this._wowRegistersPresence,
        });
        return { intent: next.intent, registersPresence: this._wowRegistersPresence, changed: true };
    }
    async leaveSession(reason = "leave_session") {
        if (this.clientMode !== "player")
            return null;
        this._stopPresenceHeartbeat();
        await this._departPresence(this.base, reason, { beacon: true });
        this._presenceController.clearRegistration();
        this._closeRuntimeStream();
        this._closePresenceEventStreams();
        this._presenceController.recordEvent("leave_session", { reason });
        return { ok: true, reason };
    }
    async resumeSession(reason = "resume_session") {
        if (this.clientMode !== "player")
            return null;
        const output = await this._registerPresence(reason);
        this._startPresenceHeartbeat();
        this._connectRuntimeStream();
        this._syncPresenceEventStreams();
        this._emit();
        this._maybeBroadcastPlayerPose({ force: true });
        return { ok: true, reason, registered: !!output };
    }
    controlledIdentity() {
        return this._presenceController.controlledIdentity();
    }
    departPresence(input = {}) {
        return this._presenceController.departPresence(input);
    }
    stopPresenceHeartbeat() {
        return this._presenceController.stopHeartbeat();
    }
    registerPresence(input = {}) {
        return this._presenceController.registerPresence(input);
    }
    presenceSnapshot() {
        return this._presenceController.snapshot();
    }
    clearPresenceRegistration() {
        return this._presenceController.clearRegistration();
    }
    closeRuntimeStream() {
        return this._runtimeStreams.closeRuntimeStream();
    }
    connectRuntimeStream(endpointKey) {
        return this._runtimeStreams.connectRuntimeStream(endpointKey);
    }
    syncPresenceEventStreams(endpointKeys) {
        return this._runtimeStreams.syncEventStreams(endpointKeys);
    }
    peerPresenceSnapshot() {
        return this._peers.snapshot();
    }
    clearPeerPresence() {
        return this._peers.clear();
    }
    restorePeerPresence(snapshot) {
        return this._peers.restore(snapshot);
    }
    async _registerPresence(reason) {
        return this._presenceController.registerPresence({ spawnReason: reason });
    }
    async _departPresence(base, reason, opts = {}) {
        return this._presenceController.departPresence({ base, reason, beacon: opts.beacon === true });
    }
    _startPresenceHeartbeat() {
        return this._presenceController.startHeartbeat();
    }
    _stopPresenceHeartbeat() {
        return this._presenceController.stopHeartbeat();
    }
    async _heartbeatPresence() {
        return this._presenceController.heartbeat();
    }
    _installPresencePageHide() {
        return this._presenceController.installPagehide();
    }
    _presenceDebug() {
        return this._presenceController.debug();
    }
    _presenceEventEndpointKeys() {
        if (this._clientSceneController.active() || this._wowLocalWalk)
            return [];
        const keys = new Set();
        if (ENDPOINTS[this.activeEndpointKey])
            keys.add(this.activeEndpointKey);
        if (ENDPOINTS[this.previewEndpointKey])
            keys.add(this.previewEndpointKey);
        const portals = this.world && Array.isArray(this.world.portals) && this.world.portals.length
            ? this.world.portals
            : this.world && this.world.portal
                ? [this.world.portal]
                : [];
        for (const portal of portals) {
            const key = endpointKeyForLocation(portal && portal.target_location_id);
            if (key)
                keys.add(key);
        }
        for (const target of this._fabricPrefetchController.destinationTargets()) {
            const key = endpointKeyForLocation(target && target.target_location_id);
            if (key)
                keys.add(key);
        }
        return Array.from(keys).sort();
    }
    _closePresenceEventStream(endpointKey) {
        return this._runtimeStreams.closeEventStream(endpointKey);
    }
    _closePresenceEventStreams() {
        return this._runtimeStreams.closeEventStreams();
    }
    _syncPresenceEventStreams() {
        return this._runtimeStreams.syncEventStreams();
    }
    _openPresenceEventStream(endpointKey) {
        return this._runtimeStreams.openEventStream(endpointKey);
    }
    _applyPresenceDeparture(endpointKey, message) {
        const playerId = (message && message.user && message.user.player_id) ||
            (message && message.player_id) ||
            null;
        const receivedAtMs = Date.now();
        const targetLocationId = ENDPOINTS[endpointKey] ? ENDPOINTS[endpointKey].location_id : null;
        const record = {
            type: "user_left",
            endpoint_key: endpointKey,
            target_location_id: targetLocationId,
            player_id: playerId,
            server_event_at: message && message.at ? message.at : null,
            received_at: new Date(receivedAtMs).toISOString(),
            received_at_ms: receivedAtMs,
            peer_pose_removed: 0,
            prefetch_presence_removed: 0,
            prefetch_snapshot_removed: 0,
            lobby_occupancy_removed: 0,
            affected_portal_keys: [],
            presence_refresh_count_before: {},
            presence_refresh_count_after: {},
            next_poll_due_at_ms: null,
            stale_prune_due_at_ms: null,
            ttl_fallback_due_at_ms: receivedAtMs + PRESENCE_TIMING.requested_ttl_ms,
            invalid_payload: !playerId,
        };
        if (playerId) {
            Object.assign(record, this._peers.removeDepartedPlayer({
                playerId,
                locationId: targetLocationId,
                endpointKey,
                message,
                receivedAtMs,
            }));
        }
        record.cache_invalidated_at_ms = Date.now();
        record.removed_total =
            record.peer_pose_removed +
                record.prefetch_presence_removed +
                record.prefetch_snapshot_removed +
                record.lobby_occupancy_removed;
        record.event_to_cache_ms = record.cache_invalidated_at_ms - receivedAtMs;
        return record;
    }
    _emitPresenceDeparture(record) {
        if (!record)
            return false;
        record.emit_started_at_ms = Date.now();
        this._emit({ broadcastVisibility: false });
        record.emit_completed_at_ms = Date.now();
        record.event_to_render_emit_ms = record.emit_completed_at_ms - record.received_at_ms;
        return record.removed_total > 0;
    }
    _applyPresenceDepartureProjections(input) {
        return this._fabricPrefetchController.removePresencePlayer(input);
    }
    _presencePushDebug() {
        return this._runtimeStreams.debug();
    }
    _connectRuntimeStream() {
        return this._runtimeStreams.connectRuntimeStream();
    }
    _closeRuntimeStream() {
        return this._runtimeStreams.closeRuntimeStream();
    }
    _localVisibleAvatarCount() {
        const avatar = this.state.avatar;
        if (!avatar)
            return 0;
        return avatar.transition_visual && avatar.transition_visual.visible === false ? 0 : 1;
    }
    _visibilityDebug() {
        return this._peers.visibilityDebug();
    }
    _broadcastVisibility() {
        return this._peers.broadcastVisibility();
    }
    _playerPoseBroadcastDebug() {
        return this._peers.playerPoseDebug();
    }
    _maybeBroadcastPlayerPose(opts = {}) {
        return this._peers.broadcastPlayerPose(opts);
    }
    _applyPlayerPoseMirror(msg) {
        return this._peers.applyPlayerPoseMirror(msg);
    }
    _recordPeerPlayerPose(msg) {
        return this._peers.recordPeerPlayerPose(msg);
    }
    _peerPlayersDebug() {
        return this._peers.peerPlayersDebug();
    }
    _coPresentPeerCount() {
        return this._peers.coPresentPeerCount();
    }
    _channel() {
        return this._peers.channel();
    }
    _broadcast(msg) {
        return this._peers.broadcast(msg);
    }
    listenForCrossWindow() {
        this._peers.listenForCrossWindow();
        return this;
    }
}
