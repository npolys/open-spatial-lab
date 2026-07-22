import * as THREE from "./vendor/scene-core/vendor/three/three.module.js";
import { addScaled3, clamp, fabricPortalKey, glueCameraThroughFrames, normalizeVec3, portalEntrySideAllowed, portalLocalCoordinates, properPortalLocalRotation, roundNumber, roundVec3, PORTAL_EXIT_OFFSET_MAX_M, PORTAL_TRIGGER_DEPTH_M, } from "./live-adapter-portal-geometry.mjs";
function destWorldRingColor(locationId) {
    return String(locationId || "") === "location-b" ? 0xffc266 : 0x66e0ff;
}
const PORTAL_FRAME_CENTER_Y = 1.35;
const PEER_POSE_STALE_MS = 4000;
const MIN_PROJECTED_PORTAL_AREA_DEVICE_PX = 16;
const RADIAL_CLIP_PLANE_COUNT = 20;
const PORTAL_AVATAR_FAULTS = new Set([
    "capsule_only",
    "coarse_pose",
    "widen_circle",
    "dual_representation",
]);
function vec3(value, fallback) {
    const src = Array.isArray(value) ? value : fallback || [0, 0, 0];
    return [Number(src[0]) || 0, Number(src[1]) || 0, Number(src[2]) || 0];
}
function finiteVec3(value) {
    return Array.isArray(value) && value.length >= 3 && value.slice(0, 3).every((part) => Number.isFinite(Number(part)));
}
export function portalAwarenessVolume(machine, portalEntry) {
    const targetFrame = portalEntry?.target_frame;
    const circle = machine?.region?.avatars?.circle || machine?.region?.region || null;
    const authoredPortalRadius = portalEntry?.zones?.prefetch?.matching_destination_circle?.radius_m ??
        machine?.zones?.prefetch?.matching_destination_circle?.radius_m ??
        machine?.address?.roi_hint?.radius_m;
    const radius = Number(circle?.portal_preview_radius_m ?? circle?.radius_m ?? authoredPortalRadius);
    if (!targetFrame || !finiteVec3(targetFrame.position) || !finiteVec3(targetFrame.forward)) {
        return { valid: false, reason: "target_frame_unavailable" };
    }
    if (!Number.isFinite(radius) || radius <= 0) {
        return { valid: false, reason: "authored_preview_radius_unavailable" };
    }
    const forward = normalizeVec3(targetFrame.forward, [0, 0, 1]);
    return {
        valid: true,
        center: targetFrame.position.slice(0, 3).map(Number),
        forward,
        radius_m: radius,
        radius_source: circle?.portal_preview_radius_m != null
            ? "region.portal_preview_radius_m"
            : circle?.radius_m != null && machine?.region?.avatars?.circle
                ? "region.avatars.circle.radius_m"
                : circle?.radius_m != null
                    ? "region.region.radius_m"
                    : portalEntry?.zones?.prefetch?.matching_destination_circle?.radius_m != null
                        ? "portal.zones.prefetch.matching_destination_circle.radius_m"
                        : machine?.zones?.prefetch?.matching_destination_circle?.radius_m != null
                            ? "machine.zones.prefetch.matching_destination_circle.radius_m"
                            : "machine.address.roi_hint.radius_m",
        half_space: "target_frame_forward",
        plane_setback_m: 0.1,
    };
}
export function boundsIntersectPortalAwareness(bounds, volume) {
    if (!volume?.valid || !finiteVec3(bounds?.min) || !finiteVec3(bounds?.max)) {
        return { eligible: false, reason: "bounds_or_volume_invalid" };
    }
    const min = bounds.min;
    const max = bounds.max;
    const center = volume.center;
    let distanceSq = 0;
    for (let axis = 0; axis < 3; axis += 1) {
        const nearest = Math.max(Number(min[axis]), Math.min(Number(max[axis]), center[axis]));
        const delta = nearest - center[axis];
        distanceSq += delta * delta;
    }
    if (distanceSq > volume.radius_m * volume.radius_m) {
        return { eligible: false, reason: "outside_awareness_radius", distance_m: Math.sqrt(distanceSq) };
    }
    const forward = volume.forward;
    const support = [
        Number(forward[0] >= 0 ? max[0] : min[0]),
        Number(forward[1] >= 0 ? max[1] : min[1]),
        Number(forward[2] >= 0 ? max[2] : min[2]),
    ];
    const forwardExtent = (support[0] - center[0]) * forward[0] +
        (support[1] - center[1]) * forward[1] +
        (support[2] - center[2]) * forward[2];
    if (forwardExtent < -volume.plane_setback_m) {
        return { eligible: false, reason: "outside_destination_half_space", forward_extent_m: forwardExtent };
    }
    return {
        eligible: true,
        reason: "transformed_bounds_intersect_awareness",
        distance_m: Math.sqrt(distanceSq),
        forward_extent_m: forwardExtent,
    };
}
export function projectedPortalApertureDevicePixels(portalEntry, camera, drawingWidth, drawingHeight) {
    const frame = portalEntry?.frame;
    if (!frame || !camera || !finiteVec3(frame.position))
        return { visible: false, reason: "frame_or_camera_unavailable" };
    const center = vec3(frame.position, [0, PORTAL_FRAME_CENTER_Y, 0]);
    const right = vec3(frame.right, [1, 0, 0]);
    const up = vec3(frame.up, [0, 1, 0]);
    const halfWidth = (Number(frame.width_m) || 1.8) / 2;
    const halfHeight = (Number(frame.height_m) || 2.8) / 2;
    const ndc = [];
    let inFront = false;
    for (const [x, y] of [[-halfWidth, -halfHeight], [halfWidth, -halfHeight], [halfWidth, halfHeight], [-halfWidth, halfHeight]]) {
        const point = new THREE.Vector3(center[0] + right[0] * x + up[0] * y, center[1] + right[1] * x + up[1] * y, center[2] + right[2] * x + up[2] * y);
        const view = point.clone().applyMatrix4(camera.matrixWorldInverse);
        if (view.z < -Math.max(0.001, Number(camera.near) || 0.1))
            inFront = true;
        ndc.push(point.project(camera));
    }
    if (!inFront)
        return { visible: false, reason: "aperture_behind_camera" };
    const minX = Math.max(-1, Math.min(...ndc.map((point) => point.x)));
    const maxX = Math.min(1, Math.max(...ndc.map((point) => point.x)));
    const minY = Math.max(-1, Math.min(...ndc.map((point) => point.y)));
    const maxY = Math.min(1, Math.max(...ndc.map((point) => point.y)));
    if (!(maxX > minX && maxY > minY))
        return { visible: false, reason: "aperture_outside_frustum" };
    const width = Math.max(1, Math.ceil((maxX - minX) * 0.5 * drawingWidth));
    const height = Math.max(1, Math.ceil((maxY - minY) * 0.5 * drawingHeight));
    const x = Math.max(0, Math.floor((minX * 0.5 + 0.5) * drawingWidth));
    const y = Math.max(0, Math.floor((minY * 0.5 + 0.5) * drawingHeight));
    const area = width * height;
    return {
        visible: area >= MIN_PROJECTED_PORTAL_AREA_DEVICE_PX,
        reason: area >= MIN_PROJECTED_PORTAL_AREA_DEVICE_PX ? "projected_aperture_visible" : "projected_area_below_threshold",
        x,
        y,
        width: Math.min(width, drawingWidth - x),
        height: Math.min(height, drawingHeight - y),
        area_device_px: area,
        threshold_device_px: MIN_PROJECTED_PORTAL_AREA_DEVICE_PX,
        drawing_buffer: { width: drawingWidth, height: drawingHeight },
    };
}
export function shouldSuppressDestinationRing(takeover, portalKey) {
    return !!(takeover && takeover.engaged && takeover.portal_key === portalKey);
}
export const PORTAL_EXIT_PARITY_MIN_M = 0.05;
export function expectedPortalEdgeId(sourceLocationId, targetLocationId) {
    if (!sourceLocationId || !targetLocationId)
        return null;
    return "edge--" + [String(sourceLocationId), String(targetLocationId)].sort().join("--");
}
export function portalSharedEdgeIdentity(machine, portalEntry) {
    const portalKey = portalEntry ? fabricPortalKey(portalEntry) : null;
    const source = portalEntry ? portalEntry.source_location_id : null;
    const target = portalEntry ? portalEntry.target_location_id : null;
    if (!portalEntry || !portalKey || !source || !target) {
        return { available: false, reason: "portal_entry_incomplete", portal_key: portalKey };
    }
    const expected = expectedPortalEdgeId(source, target);
    const destinationPortal = machine && machine.region && machine.region.destination_portal
        ? machine.region.destination_portal
        : null;
    const served = destinationPortal && destinationPortal.shared_edge
        ? destinationPortal.shared_edge
        : null;
    const anchorId = machine && machine.address && machine.address.anchor && machine.address.anchor.portal_id != null
        ? String(machine.address.anchor.portal_id)
        : null;
    if (!served) {
        return {
            available: false,
            reason: destinationPortal ? "server_predates_shared_edge" : "region_portal_pending",
            portal_key: portalKey,
            expected_edge_id: expected,
        };
    }
    const counterpartId = served.counterpart && served.counterpart.portal_id != null
        ? String(served.counterpart.portal_id)
        : null;
    const thisSideId = served.this_side && served.this_side.portal_id != null
        ? String(served.this_side.portal_id)
        : null;
    const checks = {
        edge_id_matches: served.edge_id === expected,
        counterpart_points_back: counterpartId === String(portalKey),
        pose_is_this_edge_counterpart: anchorId == null || thisSideId === anchorId,
        endpoint_location_matches: !!served.this_side && String(served.this_side.location_id) === String(target),
    };
    const failures = Object.keys(checks).filter((name) => checks[name] !== true);
    return {
        available: true,
        verified: failures.length === 0,
        portal_key: portalKey,
        edge_id: served.edge_id || null,
        expected_edge_id: expected,
        anchor_portal_id: anchorId,
        counterpart_portal_id: counterpartId,
        this_side_portal_id: thisSideId,
        region_pose_endpoint: served.counterpart && served.counterpart.region_pose_endpoint
            ? served.counterpart.region_pose_endpoint
            : null,
        checks,
        failures,
        identity_rule: served.identity_rule || null,
        validation: { shared_edge_standard_conformance: false, application_level: true },
    };
}
export function computeExitPoseParity({ entrySignedPlaneDistanceM, targetFrame, appliedExitPosition, maxStandoffM, } = {}) {
    const entry = Math.abs(Number(entrySignedPlaneDistanceM));
    if (!Number.isFinite(entry)) {
        return { supported: false, reason: "entry_standoff_unavailable" };
    }
    if (!targetFrame ||
        !Array.isArray(targetFrame.position) ||
        !Array.isArray(targetFrame.forward) ||
        !Array.isArray(appliedExitPosition)) {
        return { supported: false, reason: "target_frame_or_exit_position_unavailable" };
    }
    const local = portalLocalCoordinates(targetFrame, appliedExitPosition);
    const applied = local ? Number(local.signed_plane_distance_m) : NaN;
    if (!Number.isFinite(applied) || applied <= 0) {
        return { supported: false, reason: "applied_exit_not_front_side" };
    }
    const max = Number.isFinite(Number(maxStandoffM)) ? Number(maxStandoffM) : PORTAL_EXIT_OFFSET_MAX_M;
    const parity = clamp(entry, PORTAL_EXIT_PARITY_MIN_M, max);
    const delta = applied - parity;
    if (Math.abs(delta) > 2.5) {
        return {
            supported: false,
            reason: "delta_exceeds_sanity_bound",
            applied_standoff_m: roundNumber(applied, 4),
            parity_standoff_m: roundNumber(parity, 4),
        };
    }
    const forward = normalizeVec3(targetFrame.forward, [0, 0, 1]);
    const adjusted = addScaled3(appliedExitPosition, forward, -delta);
    adjusted[1] = Number(appliedExitPosition[1]) || 0;
    const triggerDepth = Number(targetFrame.trigger_depth_m) || PORTAL_TRIGGER_DEPTH_M;
    return {
        supported: true,
        entry_standoff_m: roundNumber(entry, 4),
        applied_standoff_m: roundNumber(applied, 4),
        parity_standoff_m: roundNumber(parity, 4),
        delta_m: roundNumber(delta, 4),
        adjusted_position: roundVec3(adjusted, 4),
        lateral_offset_m: local ? roundNumber(local.x, 4) : null,
        inside_trigger_volume_after: parity <= triggerDepth,
        min_standoff_m: PORTAL_EXIT_PARITY_MIN_M,
        max_standoff_m: max,
        parity_rule: "exit standoff == entry standoff (clamped to [" +
            PORTAL_EXIT_PARITY_MIN_M +
            ", " +
            max +
            "] m) — runtime P3; supersedes the PORTAL_EXIT_OFFSET_MIN_M 1.05 m floor at the crossing consumer",
        validation: { exit_parity_standard_conformance: false, application_level: true },
    };
}
export const PORTAL_VIEWER_SIDE_TOLERANCE_M = 0.1;
export function portalSideForLocalZ(z, toleranceM = PORTAL_VIEWER_SIDE_TOLERANCE_M) {
    const value = Number(z);
    if (!Number.isFinite(value))
        return null;
    return value < -toleranceM ? "back" : "front";
}
export function portalViewerSide(cameraPosition, portalEntry) {
    const frame = portalEntry ? portalEntry.frame : null;
    if (!frame || !Array.isArray(cameraPosition))
        return null;
    const fp = Array.isArray(frame.position) ? frame.position : [0, PORTAL_FRAME_CENTER_Y, 0];
    const fwd = Array.isArray(frame.forward) ? frame.forward : [0, 0, 1];
    const z = ((Number(cameraPosition[0]) || 0) - (Number(fp[0]) || 0)) * (Number(fwd[0]) || 0) +
        ((Number(cameraPosition[1]) || 0) - (Number(fp[1]) || 0)) * (Number(fwd[1]) || 0) +
        ((Number(cameraPosition[2]) || 0) - (Number(fp[2]) || 0)) * (Number(fwd[2]) || 0);
    return {
        signed_plane_distance_m: roundNumber(z, 4),
        side: portalSideForLocalZ(z),
    };
}
export function portalPerimeterLiveGate(machine) {
    const base = {
        live: false,
        inside: null,
        distance_m: null,
        radius_m: null,
        exit_radius_m: null,
        hysteresis_ratio: null,
        rule: "region/presence subscription stays live only while the prefetch controller's " +
            "zone.inside is true; runtime canonical portal rendering is independent",
        validation: { perimeter_gate_standard_conformance: false, application_level: true },
    };
    if (!machine || !machine.supported) {
        return { ...base, reason: "machine_unsupported" };
    }
    const zone = machine.zone && typeof machine.zone === "object" ? machine.zone : null;
    const prefetch = machine.zones && machine.zones.prefetch ? machine.zones.prefetch : null;
    const radius = prefetch ? Number(prefetch.radius_m) : NaN;
    const ratio = prefetch && Number.isFinite(Number(prefetch.hysteresis_ratio)) && Number(prefetch.hysteresis_ratio) > 0
        ? Number(prefetch.hysteresis_ratio)
        : 1.15;
    if (!zone) {
        return {
            ...base,
            reason: "perimeter_zone_unavailable",
            radius_m: Number.isFinite(radius) ? radius : null,
            exit_radius_m: Number.isFinite(radius) ? roundNumber(radius * ratio, 4) : null,
            hysteresis_ratio: ratio,
        };
    }
    const inside = zone.inside === true;
    return {
        ...base,
        live: inside,
        reason: inside ? "inside_portal_perimeter" : "outside_portal_perimeter",
        inside,
        distance_m: Number.isFinite(Number(zone.distance_m)) ? Number(zone.distance_m) : null,
        radius_m: Number.isFinite(radius) ? radius : null,
        exit_radius_m: Number.isFinite(radius) ? roundNumber(radius * ratio, 4) : null,
        hysteresis_ratio: ratio,
    };
}
export function imageLayerFlipForViewerSide(viewerSide) {
    const side = viewerSide && typeof viewerSide === "object" ? viewerSide.side : viewerSide;
    const back = side === "back";
    return {
        viewer_side: side === "front" || side === "back" ? side : null,
        mirrored: back,
        repeat_x: back ? -1 : 1,
        offset_x: back ? 1 : 0,
        legible_on_viewed_face: true,
        rule: "front viewer -> identity UV (u); back viewer -> horizontal flip (1 - u) " +
            "so the DoubleSide back-face mirror cancels to legible text — runtime P5, " +
            "owner issue #3 (far still-image legible on both sides)",
        validation: { image_legibility_standard_conformance: false, application_level: true },
    };
}
function roundForSignature(n) {
    return Math.round((Number(n) || 0) * 20) / 20;
}
const SRGB_OETF_GLSL = [
    "vec3 osl_linearToSRGB(vec3 c) {",
    "  return mix(",
    "    pow(c, vec3(0.41666)) * 1.055 - vec3(0.055),",
    "    c * 12.92,",
    "    vec3(lessThanEqual(c, vec3(0.0031308)))",
    "  );",
    "}",
].join("\n");
export function makeApertureWindowMaterial(texture) {
    return new THREE.ShaderMaterial({
        uniforms: {
            uMap: { value: texture },
            uViewport: { value: new THREE.Vector4(0, 0, 1, 1) },
        },
        vertexShader: [
            "varying vec4 vClip;",
            "void main() {",
            "  vClip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);",
            "  gl_Position = vClip;",
            "}",
        ].join("\n"),
        fragmentShader: [
            "uniform sampler2D uMap;",
            "uniform vec4 uViewport;",
            "varying vec4 vClip;",
            SRGB_OETF_GLSL,
            "void main() {",
            "  vec2 ndc = vClip.xy / max(vClip.w, 1e-5);",
            "  vec2 fullUv = ndc * 0.5 + 0.5;",
            "  vec2 uv = (fullUv - uViewport.xy) / max(uViewport.zw, vec2(1e-5));",
            "  vec4 texel = texture2D(uMap, uv);",
            "  gl_FragColor = vec4(osl_linearToSRGB(texel.rgb), texel.a);",
            "}",
        ].join("\n"),
        side: THREE.DoubleSide,
        depthWrite: true,
        transparent: false,
        toneMapped: false,
    });
}
export function makeTakeoverMaterial(texture) {
    return new THREE.ShaderMaterial({
        uniforms: { uMap: { value: texture } },
        vertexShader: [
            "varying vec2 vUv;",
            "void main() {",
            "  vUv = uv;",
            "  gl_Position = vec4(position.xy, 0.0, 1.0);",
            "}",
        ].join("\n"),
        fragmentShader: [
            "uniform sampler2D uMap;",
            "varying vec2 vUv;",
            SRGB_OETF_GLSL,
            "void main() {",
            "  vec4 texel = texture2D(uMap, vUv);",
            "  gl_FragColor = vec4(osl_linearToSRGB(texel.rgb), texel.a);",
            "}",
        ].join("\n"),
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
    });
}
function disposeObject(root, { disposeTextures = true } = {}) {
    if (!root || typeof root.traverse !== "function")
        return;
    root.traverse((node) => {
        const sharedAssetInstance = node.userData?.portalSharedAssetInstance === true;
        if (!sharedAssetInstance && node.geometry && typeof node.geometry.dispose === "function")
            node.geometry.dispose();
        const mats = Array.isArray(node.material) ? node.material : node.material ? [node.material] : [];
        for (const m of mats) {
            if (disposeTextures && !sharedAssetInstance) {
                for (const v of Object.values(m)) {
                    if (v && v.isTexture && typeof v.dispose === "function")
                        v.dispose();
                }
            }
            if (typeof m.dispose === "function")
                m.dispose();
        }
    });
}
function applyPreviewClipping(root, clipPlanes) {
    if (!root || !Array.isArray(clipPlanes) || !clipPlanes.length)
        return;
    root.traverse((node) => {
        const mats = Array.isArray(node.material) ? node.material : node.material ? [node.material] : [];
        for (const material of mats)
            material.clippingPlanes = clipPlanes;
    });
}
export class SpatialPortalPreviewManager {
    constructor(opts = {}) {
        this.records = new Map();
        this.renderer = null;
        this.mainCamera = null;
        this.hostScene = null;
        this.controlledPlayerId =
            typeof opts.controlledPlayerId === "function" ? opts.controlledPlayerId : () => null;
        this.AvatarLayerClass = opts.AvatarLayerClass || null;
        this.getMount = typeof opts.getMount === "function" ? opts.getMount : () => null;
        this.motionPreference = opts.motionPreference || null;
        this.nowMs = typeof opts.nowMs === "function" ? opts.nowMs : () => Date.now();
        this.resolveDestinationContent = typeof opts.resolveDestinationContent === "function"
            ? opts.resolveDestinationContent
            : async (entry) => ({
                kind: "legacy_world",
                location_id: entry?.target_location_id || null,
                world_id: entry?.target_world_id || null,
                revision: "test-default",
                world: { location_id: entry?.target_location_id || null, color: "#3aa0ff" },
            });
        this.composeDestinationContent = typeof opts.composeDestinationContent === "function"
            ? opts.composeDestinationContent
            : null;
        this.destinationSources = new Map();
        const queryFault = typeof window !== "undefined"
            ? new URLSearchParams(window.location.search).get("portal_avatar_fault")
            : null;
        this.avatarFault = PORTAL_AVATAR_FAULTS.has(opts.avatarFault)
            ? opts.avatarFault
            : PORTAL_AVATAR_FAULTS.has(queryFault)
                ? queryFault
                : null;
        this.peerPlayers = new Map();
        this.avatarRepresentationCreateCount = 0;
        this.avatarRepresentationDisposeCount = 0;
        this.surfaceGates = new Map();
        this._identityFilterByMachine = new WeakMap();
        this._lastIdentityFilter = null;
        this.takeover = {
            engaged: false,
            portal_key: null,
            engaged_at: null,
            frames_rendered: 0,
            last_engaged: null,
        };
        this._takeoverQuad = null;
        this._tmpVec = new THREE.Vector3();
        this._tmpVec2 = new THREE.Vector2();
        this._tmpBox = new THREE.Box3();
        this._tmpProjection = new THREE.Matrix4();
        this._tmpDirection = new THREE.Vector3();
        this._tmpAvatarBox = new THREE.Box3();
        this._cameraPosition = [0, 0, 0];
        this._cameraForward = [0, 0, -1];
    }
    bindScene(renderer, camera, hostScene) {
        const hostChanged = !!(this.hostScene && hostScene && this.hostScene !== hostScene);
        if (hostChanged) {
            for (const rec of this.records.values()) {
                this._disposeRecord(rec);
            }
            this.records.clear();
            this.destinationSources.clear();
        }
        this.renderer = renderer || null;
        this.mainCamera = camera || null;
        this.hostScene = hostScene || null;
        if (this.renderer)
            this.renderer.localClippingEnabled = true;
        if (this.takeover.engaged) {
            this.takeover.engaged = false;
            this.takeover.portal_key = null;
        }
        this._takeoverQuad = null;
    }
    pruneToPortalKeys(validKeys) {
        const keep = new Set(validKeys || []);
        for (const [key, rec] of this.records) {
            if (keep.has(key))
                continue;
            this._disposeRecord(rec);
            this.records.delete(key);
        }
        for (const key of this.surfaceGates.keys()) {
            if (!keep.has(key))
                this.surfaceGates.delete(key);
        }
    }
    _disposeRecord(rec) {
        if (!rec)
            return;
        this._disposeAvatarRepresentations(rec);
        try {
            rec.composition?.dispose?.();
        }
        catch { }
        if (rec.scene)
            disposeObject(rec.scene);
        if (rec.renderTarget)
            rec.renderTarget.dispose();
        if (rec.apertureMaterial)
            rec.apertureMaterial.dispose();
        if (rec.takeoverMaterial)
            rec.takeoverMaterial.dispose();
    }
    dispose() {
        for (const rec of this.records.values())
            this._disposeRecord(rec);
        this.records.clear();
        this.surfaceGates.clear();
        this.bindScene(null, null, null);
        this.peerPlayers.clear();
        this.destinationSources.clear();
    }
    surfaceActive(portalKey) {
        const rec = this.records.get(portalKey);
        return !!(rec && rec.active);
    }
    setPeerPlayers(peers) {
        const next = new Map();
        for (const peer of Array.isArray(peers) ? peers : []) {
            if (!peer || !peer.player_id || !Array.isArray(peer.position))
                continue;
            const lastSeenMs = Math.max(0, Number(peer.last_seen_ms) || 0);
            if (lastSeenMs > PEER_POSE_STALE_MS)
                continue;
            next.set(peer.player_id, {
                ...peer,
                received_at_ms: this.nowMs() - lastSeenMs,
            });
        }
        this.peerPlayers = next;
        for (const rec of this.records.values()) {
            if (rec.machine && rec.portalEntry) {
                this._reconcileAvatarRepresentations(rec, rec.machine, rec.portalEntry);
            }
        }
    }
    _disposeAvatarRepresentations(rec) {
        if (!rec || !rec.avatarRepresentations)
            return;
        for (const representation of rec.avatarRepresentations.values()) {
            if (representation.layer) {
                try {
                    representation.layer.dispose();
                }
                catch { }
            }
            representation.disposed = true;
            this.avatarRepresentationDisposeCount += 1;
        }
        rec.avatarRepresentations.clear();
        rec.avatarProxies = [];
        rec.avatarCulling = new Map();
    }
    _destinationAvatars(machine) {
        const region = machine && machine.region ? machine.region : null;
        const snapshot = region && region.avatars && Array.isArray(region.avatars.avatars) ? region.avatars.avatars : [];
        const live = machine && machine.presence && machine.presence.occupancy && Array.isArray(machine.presence.occupancy.avatars)
            ? machine.presence.occupancy.avatars
            : null;
        let candidates = snapshot;
        const circle = (region && region.avatars && region.avatars.circle) || (region && region.region) || null;
        const center = circle && Array.isArray(circle.center) && circle.center.length >= 3 &&
            circle.center.slice(0, 3).every((value) => Number.isFinite(Number(value)))
            ? circle.center.slice(0, 3).map(Number)
            : null;
        const baseRadius = circle ? Number(circle.radius_m) : NaN;
        const circleValid = !!center && Number.isFinite(baseRadius) && baseRadius >= 0;
        const radius = circleValid && this.avatarFault === "widen_circle" ? baseRadius + 1 : baseRadius;
        if (live) {
            const snapById = new Map();
            for (const a of snapshot) {
                if (a && a.player_id)
                    snapById.set(a.player_id, a);
            }
            candidates = [];
            for (const entry of live) {
                if (!entry || !Array.isArray(entry.position))
                    continue;
                const pos = entry.position;
                let distance = null;
                let inside = false;
                if (circleValid) {
                    const dx = (Number(pos[0]) || 0) - (Number(center[0]) || 0);
                    const dz = (Number(pos[2]) || 0) - (Number(center[2]) || 0);
                    distance = Math.hypot(dx, dz);
                    inside = distance <= radius;
                }
                const snap = entry.player_id ? snapById.get(entry.player_id) : null;
                candidates.push({
                    ...(snap || {}),
                    player_id: entry.player_id || (snap ? snap.player_id : null),
                    avatar_id: entry.avatar_id ?? (snap ? snap.avatar_id : null),
                    display_name: entry.display_name ?? (snap ? snap.display_name : null),
                    position: pos.slice(0, 3),
                    rotation_y: entry.rotation_y ?? (snap ? snap.rotation_y : 0),
                    distance_from_anchor_m: distance != null ? Number(distance.toFixed(3)) : snap ? snap.distance_from_anchor_m : null,
                    inside_destination_circle: inside,
                    destination_circle_valid: circleValid,
                    destination_circle_center: center ? center.slice() : null,
                    destination_circle_radius_m: circleValid ? radius : null,
                    authoritative_presence_position: pos.slice(0, 3),
                });
            }
        }
        else {
            candidates = snapshot.map((entry) => {
                const pos = entry && Array.isArray(entry.position) ? entry.position : null;
                let distance = null;
                let inside = false;
                if (pos && circleValid) {
                    distance = Math.hypot(Number(pos[0]) - center[0], Number(pos[2]) - center[2]);
                    inside = distance <= radius;
                }
                return {
                    ...entry,
                    distance_from_anchor_m: distance == null
                        ? entry && entry.distance_from_anchor_m != null ? entry.distance_from_anchor_m : null
                        : Number(distance.toFixed(3)),
                    inside_destination_circle: inside,
                    destination_circle_valid: circleValid,
                    destination_circle_center: center ? center.slice() : null,
                    destination_circle_radius_m: circleValid ? radius : null,
                    authoritative_presence_position: pos ? pos.slice(0, 3) : null,
                };
            });
        }
        const controlledPlayerId = String(this.controlledPlayerId() || "");
        const inputPlayerIds = candidates.map((avatar) => avatar && avatar.player_id).filter(Boolean);
        const avatars = controlledPlayerId
            ? candidates.filter((avatar) => !avatar || avatar.player_id !== controlledPlayerId)
            : candidates;
        const identityFilter = {
            controlled_player_id: controlledPlayerId || null,
            input_player_ids: inputPlayerIds,
            suppressed_player_ids: controlledPlayerId
                ? inputPlayerIds.filter((playerId) => playerId === controlledPlayerId)
                : [],
            rendered_player_ids: avatars.map((avatar) => avatar && avatar.player_id).filter(Boolean),
            source: live ? "live_presence" : "snapshot_fallback",
            applied_at: new Date().toISOString(),
        };
        this._lastIdentityFilter = identityFilter;
        if (machine && typeof machine === "object") {
            this._identityFilterByMachine.set(machine, identityFilter);
        }
        return avatars;
    }
    _signature(machine, portalEntry) {
        const tf = portalEntry ? portalEntry.target_frame : null;
        const tfPos = tf && Array.isArray(tf.position) ? tf.position : [0, 0, 0];
        const tfFwd = tf && Array.isArray(tf.forward) ? tf.forward : [0, 0, 1];
        const parts = [
            portalEntry && portalEntry.target_location_id,
            machine && machine.region && machine.region.region ? machine.region.region.radius_m : null,
            `controlled:${String(this.controlledPlayerId() || "")}`,
            `tf:${roundForSignature(tfPos[0])}:${roundForSignature(tfPos[2])}` +
                `:${roundForSignature(tfFwd[0])}:${roundForSignature(tfFwd[2])}` +
                `:${tf && tf.pose_source ? tf.pose_source : "preset"}`,
        ];
        const awareness = portalAwarenessVolume(machine, portalEntry);
        parts.push(awareness.valid
            ? `awareness:${awareness.radius_source}:${roundForSignature(awareness.radius_m)}`
            : `awareness-invalid:${awareness.reason}`);
        return parts.join("|");
    }
    _poseForAvatar(avatar, portalEntry) {
        if (!avatar || !avatar.player_id || this.avatarFault === "coarse_pose")
            return null;
        const pose = this.peerPlayers.get(avatar.player_id);
        if (!pose || pose.location_id !== portalEntry.target_location_id)
            return null;
        if (!Array.isArray(pose.position) || this.nowMs() - pose.received_at_ms > PEER_POSE_STALE_MS)
            return null;
        return pose;
    }
    _fullAvatarSnapshot(avatar, pose) {
        return {
            avatar_id: pose.avatar_id || avatar.avatar_id || null,
            continuity_id: pose.continuity_id || avatar.continuity_id || null,
            display_name: pose.display_name || avatar.display_name || null,
            position: pose.position.slice(0, 3),
            rotation_y: Number(pose.rotation_y) || 0,
            avatar_variant: pose.avatar_variant || avatar.avatar_variant || null,
            equippedItems: Array.isArray(pose.equippedItems) ? pose.equippedItems : [],
            locomotion: pose.locomotion && typeof pose.locomotion === "object" ? { ...pose.locomotion } : {},
            transition_visual: pose.transition_visual && typeof pose.transition_visual === "object"
                ? { ...pose.transition_visual }
                : null,
        };
    }
    _reconcileAvatarRepresentations(rec, machine, portalEntry) {
        if (!rec || !rec.scene)
            return;
        const now = this.nowMs();
        const avatars = this._destinationAvatars(machine);
        rec.identityFilter =
            (machine && this._identityFilterByMachine.get(machine)) || this._lastIdentityFilter;
        const liveIds = new Set();
        const previousPlayerIds = Array.from(rec.avatarRepresentations.keys());
        rec.avatarCulling = rec.avatarCulling || new Map();
        rec.avatarCulling.clear();
        for (const avatar of avatars) {
            const playerId = avatar && avatar.player_id;
            if (!playerId || !Array.isArray(avatar.position))
                continue;
            const presencePosition = avatar.authoritative_presence_position || avatar.position;
            const pose = this._poseForAvatar(avatar, portalEntry);
            const classificationPosition = pose ? pose.position : presencePosition;
            const px = Number(classificationPosition[0]) || 0;
            const py = Number(classificationPosition[1]) || 0;
            const pz = Number(classificationPosition[2]) || 0;
            const bodyBounds = {
                min: [px - 0.45, py, pz - 0.45],
                max: [px + 0.45, py + 2.1, pz + 0.45],
            };
            const volumeHit = boundsIntersectPortalAwareness(bodyBounds, rec.awarenessVolume);
            const desiredFull = volumeHit.eligible && !!pose && !!this.AvatarLayerClass && this.avatarFault !== "capsule_only";
            if (!desiredFull) {
                rec.avatarCulling.set(playerId, {
                    player_id: playerId,
                    eligible: false,
                    reason: !volumeHit.eligible
                        ? volumeHit.reason
                        : !pose
                            ? "fresh_same_destination_pose_unavailable"
                            : !this.AvatarLayerClass
                                ? "full_avatar_layer_unavailable"
                                : "controlled_capsule_fault_arm",
                    bounds: bodyBounds,
                });
                continue;
            }
            liveIds.add(playerId);
            let representation = rec.avatarRepresentations.get(playerId);
            if (!representation) {
                representation = {
                    player_id: playerId,
                    state: "loading_full",
                    proxy: null,
                    layer: null,
                    desired_full: true,
                    latest_avatar: null,
                    last_pose_seq: null,
                    last_avatar_signature: null,
                    body_bounds: bodyBounds,
                    pose_samples: [],
                    created_at_ms: now,
                    disposed: false,
                };
                rec.avatarRepresentations.set(playerId, representation);
                this.avatarRepresentationCreateCount += 1;
            }
            representation.body_bounds = bodyBounds;
            representation.desired_full = desiredFull;
            representation.distance_from_anchor_m = Number(volumeHit.distance_m.toFixed(4));
            representation.circle_valid = avatar.destination_circle_valid === true;
            representation.circle_center = rec.awarenessVolume?.center?.slice() || null;
            representation.circle_radius_m = rec.awarenessVolume?.radius_m ?? null;
            representation.pose_source = "player-pose";
            const fullAvatar = this._fullAvatarSnapshot(avatar, pose);
            representation.latest_avatar = fullAvatar;
            if (!representation.layer) {
                const mount = this.getMount();
                if (!mount) {
                    representation.state = "loading_full";
                    continue;
                }
                representation.state = "loading_full";
                const layer = new this.AvatarLayerClass(mount, "player", { location_id: portalEntry.target_location_id }, {
                    host: { scene: rec.scene, camera: rec.camera, renderer: this.renderer },
                    motionPreference: this.motionPreference,
                });
                representation.layer = layer;
                layer.__portalPreview = true;
                if (layer.avatarRig)
                    layer.avatarRig.userData.portalPreviewAvatar = true;
                layer.avatar = fullAvatar;
                if (layer.avatarRig)
                    layer.avatarRig.visible = false;
                layer.ready.then(() => {
                    if (representation.disposed || rec.avatarRepresentations.get(playerId) !== representation)
                        return;
                    if (representation.latest_avatar)
                        layer.setAvatar(representation.latest_avatar);
                    applyPreviewClipping(layer.avatarRig, rec.clipPlanes);
                    if (layer.avatarRig)
                        layer.avatarRig.visible = false;
                });
            }
            const layer = representation.layer;
            const newPose = representation.last_pose_seq !== pose.seq;
            if (newPose) {
                representation.last_pose_seq = pose.seq;
                representation.last_pose_received_at_ms = pose.received_at_ms;
                representation.pose_samples.push({
                    seq: pose.seq,
                    received_at_ms: pose.received_at_ms,
                    accepted_at_ms: now,
                    position: pose.position.slice(0, 3),
                    aperture_frame_at_ms: null,
                    pose_to_aperture_ms: null,
                });
                if (representation.pose_samples.length > 64)
                    representation.pose_samples.shift();
            }
            if (layer && layer.avatarRig && layer.status && layer.status.renderer !== "failed") {
                const avatarSignature = JSON.stringify([
                    pose.seq,
                    fullAvatar.avatar_variant,
                    fullAvatar.equippedItems,
                    fullAvatar.transition_visual,
                ]);
                if (avatarSignature !== representation.last_avatar_signature) {
                    representation.last_avatar_signature = avatarSignature;
                    layer.setAvatar(fullAvatar);
                }
                const requestedVariant = fullAvatar.avatar_variant;
                const variantReady = !requestedVariant || layer.status.avatar_variant === requestedVariant;
                if (layer.isSettled() && variantReady) {
                    representation.state = "full";
                    layer.avatarRig.visible = true;
                    representation.full_visible_at_ms = representation.full_visible_at_ms || now;
                }
                else {
                    representation.state = "loading_full";
                    layer.avatarRig.visible = false;
                }
            }
            rec.avatarCulling.set(playerId, {
                player_id: playerId,
                eligible: representation.state === "full",
                reason: representation.state === "full" ? "full_avatar_awareness_eligible" : "full_avatar_loading",
                bounds: bodyBounds,
            });
        }
        for (const [playerId, representation] of rec.avatarRepresentations) {
            if (liveIds.has(playerId))
                continue;
            if (representation.layer) {
                try {
                    representation.layer.dispose();
                }
                catch { }
            }
            representation.disposed = true;
            rec.avatarRepresentations.delete(playerId);
            this.avatarRepresentationDisposeCount += 1;
        }
        rec.avatarProxies = [];
        const nextPlayerIds = Array.from(rec.avatarRepresentations.keys());
        rec.lastAvatarReconcile = {
            at: new Date(now).toISOString(),
            at_ms: now,
            previous_player_ids: previousPlayerIds,
            next_player_ids: nextPlayerIds,
            removed_player_ids: previousPlayerIds.filter((playerId) => !nextPlayerIds.includes(playerId)),
            added_player_ids: nextPlayerIds.filter((playerId) => !previousPlayerIds.includes(playerId)),
        };
    }
    _buildPreviewScene(rec, machine, portalEntry) {
        this._disposeAvatarRepresentations(rec);
        try {
            rec.composition?.dispose?.();
        }
        catch { }
        if (rec.scene)
            disposeObject(rec.scene);
        if (!rec.destinationContent || !this.composeDestinationContent) {
            rec.scene = null;
            rec.composition = null;
            rec.contentObjects = [];
            return;
        }
        const composition = this.composeDestinationContent(rec.destinationContent, {
            portal_key: rec.portalKey,
            portal_entry: portalEntry,
            width: rec.renderTarget.width,
            height: rec.renderTarget.height,
        });
        if (!composition?.scene)
            throw new Error("canonical portal composition returned no scene");
        const scene = composition.scene;
        rec.composition = composition;
        if (composition.presentation?.assets?.status === "pending") {
            rec.contentStatus = "loading_assets";
        }
        rec.roomDressing = composition.presentation || null;
        rec.awarenessVolume = portalAwarenessVolume(machine, portalEntry);
        rec.clipPlanes = [];
        if (rec.awarenessVolume.valid) {
            const volume = rec.awarenessVolume;
            const center = new THREE.Vector3(...volume.center);
            const forward = new THREE.Vector3(...volume.forward).normalize();
            rec.clipPlanes.push(new THREE.Plane(forward.clone(), -forward.dot(center) + volume.plane_setback_m));
            for (let index = 0; index < RADIAL_CLIP_PLANE_COUNT; index += 1) {
                const y = 1 - (index / (RADIAL_CLIP_PLANE_COUNT - 1)) * 2;
                const radial = Math.sqrt(Math.max(0, 1 - y * y));
                const theta = index * Math.PI * (3 - Math.sqrt(5));
                const outward = new THREE.Vector3(Math.cos(theta) * radial, y, Math.sin(theta) * radial);
                rec.clipPlanes.push(new THREE.Plane(outward.clone().negate(), outward.dot(center) + volume.radius_m));
            }
        }
        const destPortal = machine.region ? machine.region.destination_portal : null;
        const targetFrame = portalEntry.target_frame || null;
        rec.destRing = null;
        rec.destRingMesh = null;
        if (destPortal && targetFrame && Array.isArray(targetFrame.position)) {
            const ringColor = destWorldRingColor(portalEntry.target_location_id);
            const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.075, 18, 80), new THREE.MeshStandardMaterial({
                color: ringColor,
                emissive: ringColor,
                emissiveIntensity: 0.72,
                roughness: 0.32,
                metalness: 0.24,
            }));
            const tp = targetFrame.position;
            ring.position.set(Number(tp[0]) || 0, Number(tp[1]) || PORTAL_FRAME_CENTER_Y, Number(tp[2]) || 0);
            const fwd = Array.isArray(targetFrame.forward) ? targetFrame.forward : [0, 0, 1];
            ring.rotation.y = Math.atan2(Number(fwd[0]) || 0, Number(fwd[2]) || 0);
            ring.scale.set((Number(targetFrame.width_m) || 1.8) / 2, (Number(targetFrame.height_m) || 2.8) / 2, 1);
            ring.name = "dest-portal-ring";
            scene.add(ring);
            rec.destRingMesh = ring;
            const payloadTrigger = Array.isArray(destPortal.trigger_position)
                ? destPortal.trigger_position
                : null;
            rec.destRing = {
                world_position: [ring.position.x, ring.position.y, ring.position.z],
                yaw: ring.rotation.y,
                color: `#${new THREE.Color(ringColor).getHexString()}`,
                target_frame_pose_source: targetFrame.pose_source || "preset_placeholder",
                payload_trigger_position: payloadTrigger ? payloadTrigger.slice(0, 3) : null,
                target_frame_vs_payload_m: payloadTrigger
                    ? Math.hypot((Number(tp[0]) || 0) - (Number(payloadTrigger[0]) || 0), (Number(tp[2]) || 0) - (Number(payloadTrigger[2]) || 0))
                    : null,
            };
        }
        const tf = portalEntry.target_frame || null;
        if (tf && Array.isArray(tf.forward) && Array.isArray(tf.position)) {
            const n = new THREE.Vector3(tf.forward[0], tf.forward[1], tf.forward[2]).normalize();
            rec.clipBasis = {
                normal: n.clone(),
                plane_offset: n.x * (Number(tf.position[0]) || 0) +
                    n.y * (Number(tf.position[1]) || 0) +
                    n.z * (Number(tf.position[2]) || 0),
            };
            rec.clipPlaneSide = "front";
            rec.clipPlane = rec.clipPlanes[0] || null;
        }
        else {
            rec.clipPlane = null;
            rec.clipBasis = null;
            rec.clipPlaneSide = null;
        }
        rec.scene = scene;
        rec.entityMeshes = [];
        rec.avatarProxies = [];
        rec.avatarRepresentations = rec.avatarRepresentations || new Map();
        this._indexCanonicalContent(rec);
        this._reconcileAvatarRepresentations(rec, machine, portalEntry);
    }
    _indexCanonicalContent(rec) {
        if (!rec?.scene)
            return;
        rec.scene.updateWorldMatrix(true, true);
        const priorBaseVisibility = new Map((rec.contentObjects || []).map((item) => [item.node, item.base_visible]));
        rec.contentObjects = [];
        rec.scene.traverse((node) => {
            if (!node || (!node.isMesh && !node.isLine && !node.isPoints) || node === rec.destRingMesh)
                return;
            for (let parent = node; parent; parent = parent.parent) {
                if (parent.userData?.portalPreviewAvatar)
                    return;
                if (parent === rec.scene)
                    break;
            }
            let sharedAssetInstance = false;
            for (let parent = node; parent; parent = parent.parent) {
                if (String(parent.name || "").startsWith("wow-asset:"))
                    sharedAssetInstance = true;
                if (parent === rec.scene)
                    break;
            }
            node.userData.portalSharedAssetInstance = sharedAssetInstance;
            const sourceMaterials = Array.isArray(node.material) ? node.material : node.material ? [node.material] : [];
            if (sharedAssetInstance && sourceMaterials.length && !node.userData.__portalMaterialsCloned) {
                const cloned = sourceMaterials.map((material) => material.clone());
                node.material = Array.isArray(node.material) ? cloned : cloned[0];
                node.userData.__portalMaterialsCloned = true;
            }
            applyPreviewClipping(node, rec.clipPlanes);
            const box = new THREE.Box3().setFromObject(node);
            if (box.isEmpty())
                return;
            rec.contentObjects.push({
                node,
                bounds: box,
                bounds_array: {
                    min: [box.min.x, box.min.y, box.min.z],
                    max: [box.max.x, box.max.y, box.max.z],
                },
                base_visible: priorBaseVisibility.has(node)
                    ? priorBaseVisibility.get(node)
                    : node.visible !== false,
                dynamic: !!node.isSkinnedMesh || node.userData?.portalDynamicBounds === true,
                id: node.name || node.uuid,
                last_reason: null,
            });
        });
        rec.canonicalInventory = rec.contentObjects.map((item) => item.id);
        rec.assetIndexStatus = rec.composition?.presentation?.assets?.status || null;
        rec.contentInventoryRevision = rec.composition?.inventory_revision ?? null;
    }
    _requestDestinationContent(rec, portalEntry) {
        const destinationKey = [
            portalEntry?.target_location_id || "",
            portalEntry?.target_world_id || "",
        ].join("|");
        if (rec.destinationKey && rec.destinationKey !== destinationKey) {
            this._disposeAvatarRepresentations(rec);
            try {
                rec.composition?.dispose?.();
            }
            catch { }
            if (rec.scene)
                disposeObject(rec.scene);
            rec.scene = null;
            rec.composition = null;
            rec.destinationContent = null;
            rec.signature = null;
        }
        rec.destinationKey = destinationKey;
        let source = this.destinationSources.get(destinationKey);
        if (!source) {
            source = { status: "loading", value: null, error: null };
            this.destinationSources.set(destinationKey, source);
            source.promise = Promise.resolve()
                .then(() => this.resolveDestinationContent(portalEntry))
                .then((value) => {
                if (!value)
                    throw new Error("canonical destination resolver returned no content");
                source.status = "ready";
                source.value = value;
                for (const candidate of this.records.values()) {
                    if (candidate.destinationKey !== destinationKey)
                        continue;
                    candidate.destinationContent = value;
                    candidate.contentStatus = "ready";
                    candidate.contentError = null;
                    candidate.signature = null;
                    try {
                        this._buildPreviewScene(candidate, candidate.machine, candidate.portalEntry);
                        candidate.signature = this._signature(candidate.machine, candidate.portalEntry);
                    }
                    catch (error) {
                        candidate.contentStatus = "error";
                        candidate.contentError = error?.message || String(error);
                    }
                }
                this.renderActive();
                return value;
            })
                .catch((error) => {
                source.status = "error";
                source.error = error?.message || String(error);
                for (const candidate of this.records.values()) {
                    if (candidate.destinationKey !== destinationKey)
                        continue;
                    candidate.contentStatus = "error";
                    candidate.contentError = source.error;
                }
                return null;
            });
        }
        rec.contentStatus = source.status;
        rec.contentError = source.error;
        if (source.status === "ready")
            rec.destinationContent = source.value;
    }
    _ensureRecord(portalKey, machine, portalEntry) {
        let rec = this.records.get(portalKey);
        if (!rec) {
            const renderTarget = new THREE.WebGLRenderTarget(1, 1, {
                minFilter: THREE.LinearFilter,
                magFilter: THREE.LinearFilter,
            });
            if ("SRGBColorSpace" in THREE)
                renderTarget.texture.colorSpace = THREE.SRGBColorSpace;
            rec = {
                portalKey,
                scene: null,
                camera: new THREE.PerspectiveCamera(60, 1, 0.05, 80),
                renderTarget,
                apertureMaterial: makeApertureWindowMaterial(renderTarget.texture),
                takeoverMaterial: null,
                signature: null,
                entityMeshes: [],
                avatarProxies: [],
                avatarRepresentations: new Map(),
                avatarCulling: new Map(),
                active: false,
                cameraMapped: false,
                lastCameraTransform: null,
                framesRendered: 0,
                portalEntry: null,
                roomDressing: null,
                destRing: null,
                destRingMesh: null,
                identityFilter: null,
                lastAvatarReconcile: null,
                sharedEdge: null,
                viewerSide: null,
                clipBasis: null,
                clipPlaneSide: null,
                clipPlanes: [],
                awarenessVolume: null,
                contentObjects: [],
                canonicalInventory: [],
                composition: null,
                destinationContent: null,
                destinationKey: null,
                contentStatus: "loading",
                contentError: null,
                apertureProjection: null,
                frustum: new THREE.Frustum(),
                lastRenderAtMs: null,
            };
            this.records.set(portalKey, rec);
        }
        rec.portalEntry = portalEntry;
        rec.machine = machine;
        rec.sharedEdge = portalSharedEdgeIdentity(machine, portalEntry);
        this._requestDestinationContent(rec, portalEntry);
        const sig = this._signature(machine, portalEntry);
        if (rec.destinationContent && sig !== rec.signature) {
            this._buildPreviewScene(rec, machine, portalEntry);
            rec.signature = sig;
        }
        else if (rec.scene) {
            this._reconcileAvatarRepresentations(rec, machine, portalEntry);
        }
        return rec;
    }
    static machineRenderable(machine) {
        return !machine || machine.supported !== false;
    }
    _cameraFrontLocalZ(portalEntry) {
        if (!this.mainCamera || !portalEntry || !portalEntry.frame)
            return null;
        const frame = portalEntry.frame;
        const fp = Array.isArray(frame.position) ? frame.position : [0, PORTAL_FRAME_CENTER_Y, 0];
        const fwd = Array.isArray(frame.forward) ? frame.forward : [0, 0, 1];
        this.mainCamera.getWorldPosition(this._tmpVec);
        return ((this._tmpVec.x - fp[0]) * fwd[0] +
            (this._tmpVec.y - fp[1]) * fwd[1] +
            (this._tmpVec.z - fp[2]) * fwd[2]);
    }
    _cameraViewerSide(portalEntry) {
        return portalSideForLocalZ(this._cameraFrontLocalZ(portalEntry));
    }
    _cameraOnAllowedSide(portalEntry) {
        const side = this._cameraViewerSide(portalEntry);
        if (side == null)
            return false;
        return portalEntrySideAllowed(portalEntry ? portalEntry.traversal : null, side);
    }
    surfaceForPortal(portalKey, machine, portalEntry) {
        const perimeter = portalPerimeterLiveGate(machine);
        const viewerSide = this._cameraViewerSide(portalEntry);
        const attempt = {
            portal_key: portalKey || null,
            reason: null,
            viewer_side: viewerSide,
            perimeter,
        };
        this.lastSurfaceAttempt = attempt;
        const refuse = (reason) => {
            attempt.reason = reason;
            const rec = this.records.get(portalKey);
            if (rec)
                rec.active = false;
            this._noteSurfaceGate(portalKey, false, attempt);
            return null;
        };
        if (!this.renderer || !this.mainCamera) {
            return refuse("renderer_or_camera_unavailable");
        }
        if (!portalKey || !portalEntry || !portalEntry.frame || !portalEntry.target_frame) {
            return refuse("portal_frames_unavailable");
        }
        if (!SpatialPortalPreviewManager.machineRenderable(machine)) {
            return refuse("destination_machine_explicitly_unsupported");
        }
        if (!this._cameraOnAllowedSide(portalEntry)) {
            return refuse("camera_on_blocked_side");
        }
        const rec = this._ensureRecord(portalKey, machine, portalEntry);
        rec.active = true;
        attempt.reason = rec.awarenessVolume && !rec.awarenessVolume.valid
            ? "canonical_destination_awareness_unavailable"
            : rec.contentStatus === "ready"
                ? "canonical_destination_visible"
                : rec.contentStatus === "error"
                    ? "canonical_destination_unavailable"
                    : "canonical_destination_loading";
        this._noteSurfaceGate(portalKey, true, attempt);
        return {
            material: rec.apertureMaterial,
            record: rec,
            debug: this._recordDebug(rec),
        };
    }
    _noteSurfaceGate(portalKey, live, attempt) {
        if (!portalKey)
            return;
        this.surfaceGates.set(portalKey, {
            portal_key: portalKey,
            live,
            surface: live ? "live_spatial_render" : "image_rungs",
            reason: attempt.reason,
            viewer_side: attempt.viewer_side,
            perimeter: attempt.perimeter,
            at_ms: this.nowMs(),
        });
    }
    _syncClipPlaneForViewerSide(rec, viewerSide) {
        if (!rec)
            return;
        rec.clipPlaneSide = "target_frame_forward";
        rec.sourceViewerSide = viewerSide === "back" ? "back" : "front";
    }
    renderActive() {
        if (!this.renderer || !this.mainCamera)
            return;
        const renderer = this.renderer;
        const drawing = typeof renderer.getDrawingBufferSize === "function"
            ? renderer.getDrawingBufferSize(this._tmpVec2)
            : renderer.getSize(this._tmpVec2);
        const drawingWidth = Math.max(1, Math.round(drawing.x));
        const drawingHeight = Math.max(1, Math.round(drawing.y));
        this.mainCamera.updateMatrixWorld(true);
        this.mainCamera.getWorldPosition(this._tmpVec);
        const camPos = this._cameraPosition;
        camPos[0] = this._tmpVec.x;
        camPos[1] = this._tmpVec.y;
        camPos[2] = this._tmpVec.z;
        const fwd = this._tmpDirection;
        this.mainCamera.getWorldDirection(fwd);
        const camFwdVec = this._cameraForward;
        camFwdVec[0] = fwd.x;
        camFwdVec[1] = fwd.y;
        camFwdVec[2] = fwd.z;
        for (const rec of this.records.values()) {
            if (!rec.active || !rec.portalEntry)
                continue;
            const takeoverActive = this.takeover.engaged && this.takeover.portal_key === rec.portalKey;
            const projected = takeoverActive
                ? {
                    visible: true,
                    reason: "crossing_takeover_full_view",
                    x: 0,
                    y: 0,
                    width: drawingWidth,
                    height: drawingHeight,
                    area_device_px: drawingWidth * drawingHeight,
                    threshold_device_px: MIN_PROJECTED_PORTAL_AREA_DEVICE_PX,
                    drawing_buffer: { width: drawingWidth, height: drawingHeight },
                }
                : projectedPortalApertureDevicePixels(rec.portalEntry, this.mainCamera, drawingWidth, drawingHeight);
            rec.apertureProjection = projected;
            if (!projected.visible) {
                rec.cameraMapped = false;
                rec.renderEligible = false;
                if (!rec.culledTargetCleared) {
                    const previousTarget = renderer.getRenderTarget();
                    renderer.setRenderTarget(rec.renderTarget);
                    renderer.clear();
                    renderer.setRenderTarget(previousTarget);
                    rec.culledTargetCleared = true;
                }
                continue;
            }
            rec.culledTargetCleared = false;
            rec.renderEligible = true;
            const rtW = Math.max(1, projected.width);
            const rtH = Math.max(1, projected.height);
            if (rec.renderTarget.width !== rtW || rec.renderTarget.height !== rtH) {
                rec.renderTarget.setSize(rtW, rtH);
            }
            rec.apertureMaterial.uniforms.uViewport.value.set(projected.x / drawingWidth, projected.y / drawingHeight, rtW / drawingWidth, rtH / drawingHeight);
            if (!rec.scene) {
                const previousTarget = renderer.getRenderTarget();
                renderer.setRenderTarget(rec.renderTarget);
                renderer.clear();
                renderer.setRenderTarget(previousTarget);
                continue;
            }
            if (!rec.awarenessVolume?.valid) {
                const previousTarget = renderer.getRenderTarget();
                renderer.setRenderTarget(rec.renderTarget);
                renderer.clear();
                renderer.setRenderTarget(previousTarget);
                continue;
            }
            const preRenderAssetStatus = rec.composition?.presentation?.assets?.status || null;
            if (preRenderAssetStatus === "pending") {
                const previousTarget = renderer.getRenderTarget();
                renderer.setRenderTarget(rec.renderTarget);
                renderer.clear();
                renderer.setRenderTarget(previousTarget);
                continue;
            }
            if (rec.contentStatus === "loading_assets") {
                rec.contentStatus = preRenderAssetStatus === "error" ? "ready_with_asset_errors" : "ready";
            }
            if (rec.machine)
                this._reconcileAvatarRepresentations(rec, rec.machine, rec.portalEntry);
            const glued = glueCameraThroughFrames(rec.portalEntry.frame, rec.portalEntry.target_frame, camPos, camFwdVec);
            if (!glued) {
                rec.cameraMapped = false;
                continue;
            }
            const viewerSide = portalSideForLocalZ(glued.source_local.z);
            if (viewerSide == null ||
                !portalEntrySideAllowed(rec.portalEntry.traversal || null, viewerSide)) {
                rec.cameraMapped = false;
                continue;
            }
            this._syncClipPlaneForViewerSide(rec, viewerSide);
            rec.viewerSide = viewerSide;
            const t = {
                position: glued.position,
                target: [
                    glued.position[0] + glued.forward[0] * 4,
                    glued.position[1] + glued.forward[1] * 4,
                    glued.position[2] + glued.forward[2] * 4,
                ],
                rotation_y: Math.atan2(glued.forward[0], glued.forward[2]),
            };
            rec.camera.fov = this.mainCamera.fov;
            rec.camera.near = this.mainCamera.near;
            rec.camera.far = Math.max(this.mainCamera.far, 80);
            rec.camera.aspect = drawingWidth / drawingHeight;
            rec.camera.position.set(t.position[0], t.position[1], t.position[2]);
            rec.camera.lookAt(t.target[0], t.target[1], t.target[2]);
            const topOffset = Math.max(0, drawingHeight - projected.y - rtH);
            rec.camera.setViewOffset(drawingWidth, drawingHeight, projected.x, topOffset, rtW, rtH);
            rec.camera.updateProjectionMatrix();
            rec.camera.updateMatrixWorld(true);
            rec.cameraMapped = true;
            rec.lastCameraTransform = {
                position: t.position.slice(),
                target: t.target.slice(),
                rotation_y: t.rotation_y,
                source_local: glued.source_local,
                viewer_side: viewerSide,
            };
            const secondaryRingSuppressed = shouldSuppressDestinationRing(this.takeover, rec.portalKey);
            if (rec.destRingMesh)
                rec.destRingMesh.visible = !secondaryRingSuppressed;
            if (rec.destRing)
                rec.destRing.secondary_ring_suppressed = secondaryRingSuppressed;
            const now = this.nowMs();
            const elapsedSeconds = rec.lastRenderAtMs == null
                ? 0
                : Math.min(0.05, Math.max(0, (now - rec.lastRenderAtMs) / 1000));
            rec.lastRenderAtMs = now;
            rec.composition?.update?.(elapsedSeconds, rec.camera);
            const assetStatus = rec.composition?.presentation?.assets?.status || null;
            const contentInventoryRevision = rec.composition?.inventory_revision ?? null;
            if (assetStatus !== rec.assetIndexStatus ||
                contentInventoryRevision !== rec.contentInventoryRevision)
                this._indexCanonicalContent(rec);
            rec.scene.updateWorldMatrix(true, true);
            rec.frustum.setFromProjectionMatrix(this._tmpProjection.multiplyMatrices(rec.camera.projectionMatrix, rec.camera.matrixWorldInverse));
            let eligibleObjectCount = 0;
            let culledObjectCount = 0;
            for (const item of rec.contentObjects || []) {
                if (item.dynamic) {
                    item.bounds.setFromObject(item.node);
                    item.bounds_array.min[0] = item.bounds.min.x;
                    item.bounds_array.min[1] = item.bounds.min.y;
                    item.bounds_array.min[2] = item.bounds.min.z;
                    item.bounds_array.max[0] = item.bounds.max.x;
                    item.bounds_array.max[1] = item.bounds.max.y;
                    item.bounds_array.max[2] = item.bounds.max.z;
                }
                const bounds = item.bounds_array;
                const awareness = boundsIntersectPortalAwareness(bounds, rec.awarenessVolume);
                const inFrustum = awareness.eligible && rec.frustum.intersectsBox(item.bounds);
                item.node.visible = item.base_visible && awareness.eligible && inFrustum;
                item.last_reason = !item.base_visible
                    ? "canonical_builder_hidden"
                    : !awareness.eligible
                        ? awareness.reason
                        : !inFrustum
                            ? "outside_portal_camera_frustum"
                            : "bounds_intersect_awareness_and_frustum";
                if (item.node.visible)
                    eligibleObjectCount += 1;
                else
                    culledObjectCount += 1;
            }
            rec.objectCulling = rec.objectCulling || {};
            rec.objectCulling.eligible_count = eligibleObjectCount;
            rec.objectCulling.culled_count = culledObjectCount;
            for (const representation of rec.avatarRepresentations.values()) {
                const rig = representation.layer?.avatarRig;
                if (!rig)
                    continue;
                const body = representation.body_bounds;
                const bodyBox = this._tmpAvatarBox;
                bodyBox.min.set(body.min[0], body.min[1], body.min[2]);
                bodyBox.max.set(body.max[0], body.max[1], body.max[2]);
                const inFrustum = rec.frustum.intersectsBox(bodyBox);
                rig.visible = representation.state === "full" && inFrustum;
                const culling = rec.avatarCulling.get(representation.player_id) || {};
                culling.eligible = rig.visible;
                culling.reason = rig.visible
                    ? "full_avatar_bounds_intersect_awareness_and_frustum"
                    : representation.state !== "full"
                        ? "full_avatar_loading"
                        : "outside_portal_camera_frustum";
                culling.frustum_intersects = inFrustum;
                rec.avatarCulling.set(representation.player_id, culling);
            }
            const prevTarget = renderer.getRenderTarget();
            renderer.setRenderTarget(rec.renderTarget);
            renderer.clear();
            renderer.render(rec.scene, rec.camera);
            renderer.setRenderTarget(prevTarget);
            rec.framesRendered += 1;
            const frameAt = this.nowMs();
            for (const representation of rec.avatarRepresentations.values()) {
                for (const sample of representation.pose_samples) {
                    if (sample.aperture_frame_at_ms != null)
                        continue;
                    sample.aperture_frame_at_ms = frameAt;
                    sample.pose_to_aperture_ms = Math.max(0, frameAt - sample.received_at_ms);
                }
            }
            if (this.takeover.engaged && this.takeover.portal_key === rec.portalKey) {
                this.takeover.frames_rendered += 1;
                if (this.takeover.last_engaged) {
                    this.takeover.last_engaged.frames_rendered = this.takeover.frames_rendered;
                    this.takeover.last_engaged.last_camera = rec.lastCameraTransform
                        ? {
                            position: rec.lastCameraTransform.position.slice(),
                            target: rec.lastCameraTransform.target.slice(),
                            rotation_y: rec.lastCameraTransform.rotation_y,
                        }
                        : null;
                }
            }
        }
    }
    engageTakeover(portalKey) {
        const rec = this.records.get(portalKey);
        const attempt = { at: new Date().toISOString(), portal_key: portalKey, reason: null };
        this.takeover.last_attempt = attempt;
        if (!rec || !rec.active || !rec.cameraMapped || !this.hostScene) {
            attempt.reason = !rec
                ? "no_record_for_portal"
                : !rec.active
                    ? "record_inactive"
                    : !rec.cameraMapped
                        ? "camera_not_mapped"
                        : "no_host_scene";
            return false;
        }
        if (this.takeover.engaged && this.takeover.portal_key === portalKey)
            return true;
        this.takeover.engaged = true;
        this.takeover.portal_key = portalKey;
        this.takeover.engaged_at = new Date().toISOString();
        this.takeover.frames_rendered = 0;
        this.takeover.last_engaged = {
            portal_key: portalKey,
            engaged_at: this.takeover.engaged_at,
            frames_rendered: 0,
            last_camera: rec.lastCameraTransform
                ? {
                    position: rec.lastCameraTransform.position.slice(),
                    target: rec.lastCameraTransform.target.slice(),
                    rotation_y: rec.lastCameraTransform.rotation_y,
                }
                : null,
        };
        this.renderActive();
        this.takeover.frames_rendered = 0;
        this.takeover.last_engaged.frames_rendered = 0;
        if (!rec.takeoverMaterial)
            rec.takeoverMaterial = makeTakeoverMaterial(rec.renderTarget.texture);
        if (!this._takeoverQuad) {
            this._takeoverQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), rec.takeoverMaterial);
            this._takeoverQuad.name = "portal-takeover-window";
            this._takeoverQuad.frustumCulled = false;
            this._takeoverQuad.renderOrder = 9999;
            this.hostScene.add(this._takeoverQuad);
        }
        else {
            this._takeoverQuad.material = rec.takeoverMaterial;
        }
        return true;
    }
    disengageTakeover() {
        if (this._takeoverQuad && this._takeoverQuad.parent) {
            this._takeoverQuad.parent.remove(this._takeoverQuad);
        }
        this._takeoverQuad = null;
        this.takeover.engaged = false;
        this.takeover.portal_key = null;
    }
    _recordDebug(rec) {
        return {
            portal_key: rec.portalKey,
            active: rec.active,
            camera_mapped: rec.cameraMapped,
            shared_edge_identity: rec.sharedEdge || null,
            viewer_side: rec.viewerSide || null,
            clip_plane_side: rec.clipPlaneSide || null,
            both_sides_render: "one proper 180deg isometry serves front AND back viewers; the " +
                "awareness half-space remains target-frame-forward for both source viewer sides",
            perimeter_gate: portalPerimeterLiveGate(rec.machine),
            projection: "screen_space_projective_window",
            camera_mapping: "portal-frame 180deg rotation glue (shared with the crossing remap)",
            glue_convention: "proper_rotation_180deg_about_up",
            destination_coordinates: "raw destination world space (no re-basing)",
            canonical_content_status: rec.contentStatus,
            canonical_content_error: rec.contentError,
            canonical_content_source: rec.composition?.source || null,
            canonical_content_revision: rec.composition?.revision || rec.destinationContent?.revision || null,
            canonical_inventory: rec.canonicalInventory || [],
            canonical_object_count: rec.contentObjects?.length || 0,
            entity_mesh_count: rec.contentObjects?.length || 0,
            avatar_proxy_count: 0,
            avatar_full_count: Array.from(rec.avatarRepresentations.values()).filter((entry) => entry.state === "full" && entry.layer && entry.layer.avatarRig && entry.layer.avatarRig.visible).length,
            avatar_representation_count: rec.avatarRepresentations.size,
            avatar_fault: this.avatarFault,
            avatar_representations: Array.from(rec.avatarRepresentations.values()).map((entry) => {
                const rig = entry.layer && entry.layer.avatarRig;
                const latest = entry.pose_samples.length ? entry.pose_samples[entry.pose_samples.length - 1] : null;
                const positionError = rig && latest
                    ? Math.hypot(rig.position.x - latest.position[0], rig.position.y - latest.position[1], rig.position.z - latest.position[2])
                    : null;
                return {
                    player_id: entry.player_id,
                    state: entry.state,
                    proxy_visible: !!(entry.proxy && entry.proxy.visible),
                    full_visible: !!(rig && rig.visible),
                    visible_representation_count: (entry.proxy && entry.proxy.visible ? 1 : 0) + (rig && rig.visible ? 1 : 0),
                    pose_source: entry.pose_source,
                    pose_seq: entry.last_pose_seq,
                    distance_from_anchor_m: entry.distance_from_anchor_m,
                    circle_valid: entry.circle_valid,
                    circle_center: entry.circle_center,
                    circle_radius_m: entry.circle_radius_m,
                    world_position: rig
                        ? [rig.position.x, rig.position.y, rig.position.z]
                        : null,
                    rotation_y: rig ? rig.rotation.y : null,
                    avatar_variant: entry.layer && entry.layer.status ? entry.layer.status.avatar_variant : null,
                    avatar_render_source: entry.layer && entry.layer.status ? entry.layer.status.avatar_render_source : null,
                    transition_visual: entry.latest_avatar && entry.latest_avatar.transition_visual
                        ? { ...entry.latest_avatar.transition_visual }
                        : null,
                    avatar_visual_scale: entry.layer && entry.layer.status ? entry.layer.status.avatar_visual_scale : null,
                    attached_item_count: entry.layer && typeof entry.layer.debugState === "function"
                        ? entry.layer.debugState().attached_item_count
                        : null,
                    animation_state: entry.layer && entry.layer.status ? entry.layer.status.current_animation_state : null,
                    locomotion_movement_mode: entry.layer && entry.layer.status ? entry.layer.status.locomotion_movement_mode : null,
                    grounded: entry.layer && entry.layer.status ? entry.layer.status.avatar_grounded : null,
                    jump_height_m: entry.layer && entry.layer.status ? entry.layer.status.avatar_jump_height_m : null,
                    position_error_m: positionError == null ? null : Number(positionError.toFixed(5)),
                    latest_pose_to_aperture_ms: latest ? latest.pose_to_aperture_ms : null,
                    pose_samples: entry.pose_samples.map((sample) => ({ ...sample })),
                };
            }),
            controlled_identity_filter: rec.identityFilter || null,
            last_avatar_reconcile: rec.lastAvatarReconcile || null,
            awareness_volume: rec.awarenessVolume || null,
            awareness_clip_plane_count: rec.clipPlanes?.length || 0,
            radial_fragment_clip: (rec.clipPlanes?.length || 0) > 1,
            object_culling: {
                ...(rec.objectCulling || { eligible_count: 0, culled_count: 0 }),
                objects: (rec.contentObjects || []).map((item) => ({
                    id: item.id,
                    reason: item.last_reason,
                    bounds: item.bounds_array,
                    dynamic_bounds: item.dynamic,
                    hosted_scene_object: item.node.userData?.hostedSceneObject || null,
                })),
            },
            avatar_culling: Array.from(rec.avatarCulling || new Map(), ([, value]) => value),
            frames_rendered: rec.framesRendered,
            render_target: {
                width: rec.renderTarget.width,
                height: rec.renderTarget.height,
                sizing_rule: "projected aperture device-pixel crop at direct drawing-buffer density",
                fixed_low_resolution: false,
            },
            projected_aperture: rec.apertureProjection || null,
            last_camera: rec.lastCameraTransform,
            room_dressing: rec.roomDressing || null,
            dest_ring: rec.destRing || null,
            ring_alignment: this._ringAlignmentProbe(rec),
            spatial_render_standard_conformance: false,
        };
    }
    _ringAlignmentProbe(rec) {
        if (!rec.cameraMapped || !this.mainCamera || !rec.portalEntry)
            return null;
        const frame = rec.portalEntry.frame;
        const targetFrame = rec.portalEntry.target_frame;
        if (!frame || !targetFrame)
            return null;
        const sp = vec3(frame.position, [0, PORTAL_FRAME_CENTER_Y, 0]);
        const sr = vec3(frame.right, [1, 0, 0]);
        const su = vec3(frame.up, [0, 1, 0]);
        const tp = vec3(targetFrame.position, [0, PORTAL_FRAME_CENTER_Y, 0]);
        const tr = vec3(targetFrame.right, [1, 0, 0]);
        const tu = vec3(targetFrame.up, [0, 1, 0]);
        const halfW = (Number(frame.width_m) || 1.8) / 2;
        const halfH = (Number(frame.height_m) || 2.8) / 2;
        const samples = [
            { label: "center", a: 0, b: 0 },
            { label: "right_rim", a: halfW, b: 0 },
            { label: "left_rim", a: -halfW, b: 0 },
            { label: "top_rim", a: 0, b: halfH },
            { label: "bottom_rim", a: 0, b: -halfH },
        ];
        this.mainCamera.updateMatrixWorld(true);
        rec.camera.updateMatrixWorld(true);
        const points = [];
        let maxDelta = 0;
        for (const s of samples) {
            const srcWorld = new THREE.Vector3(sp[0] + sr[0] * s.a + su[0] * s.b, sp[1] + sr[1] * s.a + su[1] * s.b, sp[2] + sr[2] * s.a + su[2] * s.b);
            const mappedPlane = properPortalLocalRotation({ x: s.a, y: s.b, z: 0 });
            const dstWorld = new THREE.Vector3(tp[0] + tr[0] * mappedPlane.x + tu[0] * mappedPlane.y, tp[1] + tr[1] * mappedPlane.x + tu[1] * mappedPlane.y, tp[2] + tr[2] * mappedPlane.x + tu[2] * mappedPlane.y);
            const srcNdc = srcWorld.clone().project(this.mainCamera);
            const dstNdc = dstWorld.clone().project(rec.camera);
            const viewport = rec.apertureMaterial.uniforms.uViewport.value;
            const dstFullNdc = new THREE.Vector2((viewport.x + (dstNdc.x * 0.5 + 0.5) * viewport.z) * 2 - 1, (viewport.y + (dstNdc.y * 0.5 + 0.5) * viewport.w) * 2 - 1);
            const delta = Math.hypot(srcNdc.x - dstFullNdc.x, srcNdc.y - dstFullNdc.y);
            if (delta > maxDelta)
                maxDelta = delta;
            points.push({
                label: s.label,
                source_ndc: [Number(srcNdc.x.toFixed(5)), Number(srcNdc.y.toFixed(5))],
                dest_ndc: [Number(dstFullNdc.x.toFixed(5)), Number(dstFullNdc.y.toFixed(5))],
                dest_crop_ndc: [Number(dstNdc.x.toFixed(5)), Number(dstNdc.y.toFixed(5))],
                ndc_delta: Number(delta.toFixed(6)),
            });
        }
        return {
            convention: "dest_local_x_negated_180deg_rotation",
            points,
            max_ndc_delta: Number(maxDelta.toFixed(6)),
        };
    }
    sampleApertureTexels(portalKey, worldPoints) {
        const rec = this.records.get(portalKey);
        if (!rec || !rec.active || !rec.cameraMapped || !this.renderer || !rec.scene)
            return null;
        const rt = rec.renderTarget;
        if (!rt || !rt.width || !rt.height)
            return null;
        rec.camera.updateMatrixWorld(true);
        const out = [];
        for (const wp of Array.isArray(worldPoints) ? worldPoints : []) {
            const p = Array.isArray(wp) ? wp : wp && Array.isArray(wp.position) ? wp.position : null;
            if (!p)
                continue;
            const ndc = new THREE.Vector3(Number(p[0]) || 0, Number(p[1]) || 0, Number(p[2]) || 0).project(rec.camera);
            const inView = Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1 && ndc.z > -1 && ndc.z < 1;
            let rgba = null;
            if (inView) {
                const px = Math.min(rt.width - 1, Math.max(0, Math.round((ndc.x * 0.5 + 0.5) * (rt.width - 1))));
                const py = Math.min(rt.height - 1, Math.max(0, Math.round((ndc.y * 0.5 + 0.5) * (rt.height - 1))));
                const buf = new Uint8Array(4);
                try {
                    this.renderer.readRenderTargetPixels(rt, px, py, 1, 1, buf);
                    rgba = [buf[0], buf[1], buf[2], buf[3]];
                }
                catch (e) {
                    rgba = null;
                }
            }
            out.push({
                world_point: [Number(p[0]) || 0, Number(p[1]) || 0, Number(p[2]) || 0],
                label: wp && wp.label ? wp.label : null,
                ndc: [Number(ndc.x.toFixed(4)), Number(ndc.y.toFixed(4))],
                in_view: inView,
                rgba,
            });
        }
        return {
            portal_key: portalKey,
            render_target: { width: rt.width, height: rt.height },
            samples: out,
        };
    }
    debug() {
        const records = {};
        for (const [key, rec] of this.records) {
            const entry = this._recordDebug(rec);
            entry.entities = (rec.contentObjects || []).map((item) => {
                const mesh = item.node;
                const cameraSpace = rec.cameraMapped
                    ? mesh.getWorldPosition(new THREE.Vector3()).applyMatrix4(rec.camera.matrixWorldInverse)
                    : null;
                return {
                    object_id: item.id,
                    world_position: mesh.getWorldPosition(new THREE.Vector3()).toArray(),
                    culling_reason: item.last_reason,
                    dynamic_bounds: item.dynamic,
                    hosted_scene_object: mesh.userData?.hostedSceneObject || null,
                    camera_space: cameraSpace
                        ? [
                            Number(cameraSpace.x.toFixed(4)),
                            Number(cameraSpace.y.toFixed(4)),
                            Number(cameraSpace.z.toFixed(4)),
                        ]
                        : null,
                };
            });
            entry.avatars = Array.from(rec.avatarRepresentations.values()).map((representation) => ({
                player_id: representation.player_id,
                display_name: representation.latest_avatar?.display_name || null,
                representation: representation.state,
                world_position: representation.layer && representation.layer.avatarRig
                    ? [
                        representation.layer.avatarRig.position.x,
                        representation.layer.avatarRig.position.y,
                        representation.layer.avatarRig.position.z,
                    ]
                    : null,
                distance_from_anchor_m: representation.distance_from_anchor_m,
            }));
            records[key] = entry;
        }
        return {
            _claim: "runtime full-fidelity bounded portal windows — shared canonical " +
                "destination composition, transformed-bounds awareness, fragment clipping, " +
                "direct-density targets, strict full-or-absent peers; local validation layer, " +
                "spatial_render_standard_conformance:false",
            avatar_representation_create_count: this.avatarRepresentationCreateCount,
            avatar_representation_dispose_count: this.avatarRepresentationDisposeCount,
            records,
            takeover: {
                engaged: this.takeover.engaged,
                portal_key: this.takeover.portal_key,
                engaged_at: this.takeover.engaged_at,
                frames_rendered: this.takeover.frames_rendered,
                last_engaged: this.takeover.last_engaged,
                last_attempt: this.takeover.last_attempt || null,
            },
            last_surface_attempt: this.lastSurfaceAttempt || null,
            surface_gates: Object.fromEntries(this.surfaceGates),
        };
    }
}
