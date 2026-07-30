// Third-person orbit-follow camera: pure state/math (no engine dependency) plus a thin adapter
// binding. Numerically matches movement-camera-controller.mjs's third-person path exactly
// (position = focus + offset, offset = (sin(az)*cosPolar, sin(polar), cos(az)*cosPolar) * distance),
// but never touches THREE.Vector3 — everything here is plain numbers/arrays, so the same
// controller works under ThreeRenderAdapter or X3DOMRenderAdapter via their shared setCameraPose.
//
// Scoped deliverable: third-person orbit only. First-person head-attachment, portal-crossing
// camera remapping, and the two raycasting-based occlusion systems (camera-wall, portal-aperture)
// are NOT covered here — movement-camera-controller.mjs remains the full-featured THREE
// implementation; this is the first piece of an eventual engine-agnostic replacement.
export const ORBIT_CAMERA_DEFAULTS = Object.freeze({
    distance_m: 3.5,
    min_distance_m: 1.6,
    max_distance_m: 8,
    polar_rad: 0.22,
    min_polar_rad: -0.12,
    max_polar_rad: 1.25,
    look_target_height_m: 1.35,
    damping_per_s: 14,
});
export function createOrbitCameraState(defaults = ORBIT_CAMERA_DEFAULTS) {
    return {
        azimuth: 0,
        polar: defaults.polar_rad,
        distance: defaults.distance_m,
        targetAzimuth: 0,
        targetPolar: defaults.polar_rad,
        targetDistance: defaults.distance_m,
        focus: null,
        focusInitialized: false,
    };
}
export function seedOrbitCamera(state, defaults, { azimuth, polar, distance, focusPosition } = {}) {
    if (Number.isFinite(azimuth))
        state.azimuth = state.targetAzimuth = azimuth;
    if (Number.isFinite(polar)) {
        const value = Math.min(defaults.max_polar_rad, Math.max(defaults.min_polar_rad, polar));
        state.polar = state.targetPolar = value;
    }
    if (Number.isFinite(distance)) {
        const value = Math.min(defaults.max_distance_m, Math.max(defaults.min_distance_m, distance));
        state.distance = state.targetDistance = value;
    }
    if (Array.isArray(focusPosition)) {
        state.focus = [
            Number(focusPosition[0]) || 0,
            (Number(focusPosition[1]) || 0) + defaults.look_target_height_m,
            Number(focusPosition[2]) || 0,
        ];
        state.focusInitialized = true;
    }
}
/** Advances azimuth/polar/distance/focus toward their targets by one damped step. */
export function stepOrbitCamera(state, defaults, avatarPosition, deltaSeconds, motionReduced = false) {
    const gain = motionReduced ? 1 : Math.min(1, Math.max(0, deltaSeconds * defaults.damping_per_s));
    state.azimuth += (state.targetAzimuth - state.azimuth) * gain;
    state.polar += (state.targetPolar - state.polar) * gain;
    state.distance += (state.targetDistance - state.distance) * gain;
    if (!Array.isArray(avatarPosition))
        return;
    const x = Number(avatarPosition[0]) || 0;
    const y = (Number(avatarPosition[1]) || 0) + defaults.look_target_height_m;
    const z = Number(avatarPosition[2]) || 0;
    if (!state.focusInitialized) {
        state.focus = [x, y, z];
        state.focusInitialized = true;
    }
    else {
        state.focus[0] += (x - state.focus[0]) * gain;
        state.focus[1] += (y - state.focus[1]) * gain;
        state.focus[2] += (z - state.focus[2]) * gain;
    }
}
/** Returns { position, lookAt, lookYaw } for the current state — does not mutate state. */
export function computeOrbitCameraPose(state) {
    if (!state.focus)
        return null;
    const cosPolar = Math.cos(state.polar);
    const offset = [
        Math.sin(state.azimuth) * cosPolar * state.distance,
        Math.sin(state.polar) * state.distance,
        Math.cos(state.azimuth) * cosPolar * state.distance,
    ];
    const position = [state.focus[0] + offset[0], state.focus[1] + offset[1], state.focus[2] + offset[2]];
    const lookAt = state.focus.slice();
    const lookDirection = [lookAt[0] - position[0], lookAt[1] - position[1], lookAt[2] - position[2]];
    const lookYaw = Math.atan2(lookDirection[0], lookDirection[2]);
    return { position, lookAt, lookYaw };
}
/**
 * Binds the pure state to a render adapter + camera: seed()/step() mutate state and immediately
 * apply the resulting pose via adapter.setCameraPose(). Works under any RenderAdapter
 * implementation — nothing here is engine-specific.
 */
export function createOrbitCameraController({ adapter, camera, defaults = ORBIT_CAMERA_DEFAULTS }) {
    const state = createOrbitCameraState(defaults);
    let lastPose = null;
    function seed(opts) {
        seedOrbitCamera(state, defaults, opts);
        apply();
    }
    function step(deltaSeconds, avatarPosition, motionReduced = false) {
        stepOrbitCamera(state, defaults, avatarPosition, deltaSeconds, motionReduced);
        apply();
    }
    function apply() {
        const pose = computeOrbitCameraPose(state);
        if (!pose)
            return null;
        adapter.setCameraPose(camera, { position: pose.position, lookAt: pose.lookAt });
        lastPose = pose;
        return pose;
    }
    return {
        state,
        seed,
        step,
        apply,
        currentPose: () => lastPose,
    };
}
