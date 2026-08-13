import { X3DOMRenderAdapter } from "./vendor/scene-core/render-adapter/x3dom-render-adapter.mjs";
import { X3domGltfHumanoidProvider } from "./x3dom-gltf-humanoid-provider.mjs";
import { createX3domMovementCameraController } from "./x3dom-movement-camera-controller.mjs";
import { createX3domPortalTraversalGlue } from "./x3dom-portal-traversal-glue.mjs";
import { createX3domEquipmentGlue } from "./x3dom-equipment-glue.mjs";
import { createX3domHudGlue } from "./x3dom-hud-glue.mjs";
import { createX3domPeerAvatarsGlue } from "./x3dom-peer-avatars-glue.mjs";
import { ORBIT_CAMERA_DEFAULTS } from "./orbit-camera-controller.mjs";
import { LiveAdapter } from "./live-adapter.js";

// Phase 7 (original boot-path scaffold) + Phases 1-4 + 3.5a/3.5b of the X3DOM parity plan — a
// genuinely new, additive boot path, NOT a refactor of the normal three.js path (app.js/scene.js/
// movement-camera-controller.mjs are untouched). Renders the environment via
// x3dom-portal-traversal-glue.mjs (which itself calls mountCanonicalWorldContent — the same
// function the normal boot path calls, just handed an X3DOMRenderAdapter instead of a
// ThreeRenderAdapter) plus a real, backend-synced avatar via HumanoidProvider, named-anchor
// equipment (x3dom-equipment-glue.mjs), HUD chrome (x3dom-hud-glue.mjs), peer/multiplayer avatars
// (x3dom-peer-avatars-glue.mjs), and a movement/camera controller
// (x3dom-movement-camera-controller.mjs) covering first-person, jump, camera-wall occlusion,
// third-person orbit, and real portal traversal — all driven against the SAME LiveAdapter session
// client the three.js path uses (LiveAdapter has zero THREE dependency — confirmed by reading its
// source — so reusing it here is a straight import, not a port). Still deliberately excluded (see
// the parity plan's later phases): the full inspector panel (see x3dom-hud-glue.mjs for why).
const AVATAR_URL = "/assets/avatars/glb/rpm_female_character.glb";
const CONTROL_KEY_MAP = Object.freeze({ KeyW: "forward", KeyS: "back", KeyA: "left", KeyD: "right", Space: "jump" });
const RUN_KEY_CODES = new Set(["ShiftLeft", "ShiftRight"]);

function bannerEl() {
    const el = document.createElement("div");
    el.id = "x3dom-live-mode-banner";
    el.style.cssText = "position:absolute; top:12px; left:50%; transform:translateX(-50%); " +
        "z-index:5; background:rgba(11,16,32,0.85); color:#d9e6ff; font:13px ui-monospace,Menlo,monospace; " +
        "padding:8px 14px; border-radius:6px; pointer-events:none; text-align:center; max-width:90%;";
    el.textContent = "X3DOM preview — environment, avatar, camera (1st/3rd person, C to toggle), " +
        "movement, jump, portal traversal, equipment (buttons, top right), toast/HUD chrome, and " +
        "peer avatars (same-browser tabs only) are real; the full inspector panel is not available in this mode.";
    return el;
}

async function main() {
    const params = new URLSearchParams(location.search);
    const role = params.get("role") === "target" ? "target"
        : params.get("role") === "source" ? "source"
            : "player";
    const active = params.get("active") || "a";

    // Mirrors app.js's identical role-badge wiring (ROLE_DISPLAY_LABEL + appEl.className) — the
    // three.js path sets these at boot, but this boot path never did, so every X3DOM session
    // showed index.html's static placeholder ("SERVER A" / blue "source" styling) regardless of
    // the real role. Restated locally rather than imported, matching this file's/its glue modules'
    // existing convention for small shared constants (see x3dom-portal-traversal-glue.mjs's
    // PORTAL_PREVIEW_PLACEHOLDER_COLOR/MIN_PROJECTED_PORTAL_AREA_DEVICE_PX).
    const ROLE_DISPLAY_LABEL = { source: "SERVER A", target: "SERVER B", player: "PLAYER" };
    const appEl = document.getElementById("app");
    if (appEl)
        appEl.className = `role-${role} rail-collapsed`;
    const roleChipEl = document.getElementById("role-chip");
    if (roleChipEl)
        roleChipEl.textContent = ROLE_DISPLAY_LABEL[role] || role.toUpperCase();

    const host = document.getElementById("scene-mount");
    const x3dEl = document.getElementById("x3dom-host");
    if (!host || !x3dEl) {
        console.error("[x3dom-live-mode] missing #x3dom-host — was ?renderer=x3dom set before index.html parsed the mount point?");
        return;
    }
    host.appendChild(bannerEl());

    const adapter = new X3DOMRenderAdapter(window.x3dom);
    adapter.attach(x3dEl);
    await adapter.ready();

    const liveAdapter = new LiveAdapter(role, { active });
    try {
        await liveAdapter.init();
    }
    catch (err) {
        const banner = document.getElementById("x3dom-live-mode-banner");
        if (banner)
            banner.textContent = "X3DOM preview — could not connect to the backend session: " + ((err && err.message) || String(err));
        console.error("[x3dom-live-mode] LiveAdapter.init() failed", err);
        return;
    }

    const provider = new X3domGltfHumanoidProvider(adapter);
    const startPosition = Array.isArray(liveAdapter.state.avatar?.position) ? liveAdapter.state.avatar.position : [0, 0, 0];
    const { handle: avatarHandle, ready: avatarReady } = provider.spawnAvatar({ url: AVATAR_URL, position: startPosition });
    let avatarPlaced = false;

    const camera = createX3domMovementCameraController({
        adapter,
        camera: adapter.camera,
        dragEl: x3dEl,
        sceneMount: host,
        onModeChange: (mode) => {
            if (avatarPlaced)
                provider.setVisible(avatarHandle, mode !== "first_person");
        },
    });
    camera.seed({ azimuth: 0, polar: ORBIT_CAMERA_DEFAULTS.polar_rad, distance: ORBIT_CAMERA_DEFAULTS.distance_m, focusPosition: startPosition });

    const portalGlue = createX3domPortalTraversalGlue({
        adapter,
        liveAdapter,
        camera,
        x3dom: window.x3dom,
        log: (line) => console.log(line),
    });
    portalGlue.mountWorldContent();

    // Anchors are built synchronously inside spawnAvatar() (a fixed offset on the always-present
    // Inline wrapper transform), but equipDefaults() still waits for avatarReady before starting
    // — not because it needs the avatar's content loaded, but to avoid overlapping this Inline
    // URL-swap with the avatar's own in-flight one (see the comment in x3dom-equipment-glue.mjs).
    const equipmentGlue = createX3domEquipmentGlue({
        provider,
        getAvatarHandle: () => avatarHandle,
        avatarReady,
        sceneMount: host,
        log: (line) => console.log(line),
    });
    equipmentGlue.equipDefaults();

    const hudGlue = createX3domHudGlue({ adapter, cameraEl: adapter.camera });
    liveAdapter.addEventListener("crossing", (event) => {
        const detail = event.detail || {};
        if (detail.kind === "reset_demotion")
            return;
        hudGlue.showToast("PORTAL CROSSED", `now in ${liveAdapter.world ? liveAdapter.world.location_id : "?"}`, "toast-arrived");
    });

    // Broadcasting OUR OWN pose needs no extra wiring — LiveAdapter.stepAvatar() already calls
    // this internally on every step, same as the three.js path. Receiving peers' broadcasts does
    // need this explicit call (confirmed by how app.js boots — adapter.listenForCrossWindow()).
    liveAdapter.listenForCrossWindow();
    const peerAvatarsGlue = createX3domPeerAvatarsGlue({
        adapter,
        liveAdapter,
        avatarUrl: AVATAR_URL,
        log: (line) => console.log(line),
    });

    const controlState = { forward: false, back: false, left: false, right: false, jump: false };
    const runKeys = new Set();
    window.addEventListener("keydown", (event) => {
        if (RUN_KEY_CODES.has(event.code)) {
            runKeys.add(event.code);
            return;
        }
        const control = CONTROL_KEY_MAP[event.code];
        if (control) {
            controlState[control] = true;
            event.preventDefault();
        }
    });
    window.addEventListener("keyup", (event) => {
        if (RUN_KEY_CODES.has(event.code)) {
            runKeys.delete(event.code);
            return;
        }
        const control = CONTROL_KEY_MAP[event.code];
        if (control)
            controlState[control] = false;
    });

    let lastFrameAt = performance.now();
    adapter.onEnterFrame(() => {
        const now = performance.now();
        const deltaSeconds = Math.min(0.05, Math.max(0, (now - lastFrameAt) / 1000));
        lastFrameAt = now;
        const input = { ...controlState, run: runKeys.size > 0, camera_yaw: camera.movementBasisYaw() };
        liveAdapter.stepAvatar(input, deltaSeconds);
        const position = liveAdapter.state.avatar?.position;
        if (Array.isArray(position)) {
            if (avatarPlaced) {
                provider.setPosition(avatarHandle, position[0], position[1], position[2]);
                // stepAvatar() already computes a backend-authoritative heading from movement
                // direction (LiveAdapter.state.avatar.rotation_y) — the same field
                // avatar-equipment-layer.js applies to avatarRig.rotation.y on the three.js path.
                // Never wired up here: the avatar model stayed facing its spawn orientation
                // regardless of WASD direction until this line existed.
                provider.setRotation(avatarHandle, Number(liveAdapter.state.avatar?.rotation_y) || 0);
            }
            camera.step(deltaSeconds, position);
        }
        // Portal crossing math (mapCameraAcrossCrossing) needs the camera's own last-known world
        // transform, the same way the three.js path's movementCameraController.persistSession/
        // sessionCameraSnapshot feeds LiveAdapter.updatePreviewProjection() every frame.
        portalGlue.reportCameraTransform();
        portalGlue.tick();
        peerAvatarsGlue.sync();
    });
    avatarReady.then(() => {
        avatarPlaced = true;
        // Reconcile visibility in case the camera mode was toggled before the avatar finished
        // loading (onModeChange's own call above no-ops while avatarPlaced is still false).
        provider.setVisible(avatarHandle, camera.mode() !== "first_person");
    }).catch((err) => console.error("[x3dom-live-mode] avatar load failed", err));

    window.addEventListener("pagehide", () => {
        try {
            liveAdapter.stopPresenceHeartbeat?.();
            liveAdapter.departPresence?.({ beacon: true, reason: "pagehide" });
            liveAdapter._closeRuntimeStream?.();
        }
        catch { /* best-effort teardown */ }
    });

    window.__x3domLiveMode = {
        adapter, liveAdapter, provider, avatarHandle, camera, portalGlue, equipmentGlue, hudGlue, peerAvatarsGlue,
        // Real-world glTF loads take well over a second under headless/software rendering — tests
        // should await this rather than guess a fixed timeout before exercising avatar movement.
        avatarReady,
        avatarPlaced: () => avatarPlaced,
    };
}

main().catch((err) => console.error("[x3dom-live-mode] fatal error", err));
