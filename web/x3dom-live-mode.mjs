import { X3DOMRenderAdapter } from "./vendor/scene-core/render-adapter/x3dom-render-adapter.mjs";
import { mountCanonicalWorldContent } from "./vendor/scene-core/canonical-world-content.js";
import { X3domGltfHumanoidProvider } from "./x3dom-gltf-humanoid-provider.mjs";
import { createOrbitCameraController, ORBIT_CAMERA_DEFAULTS } from "./orbit-camera-controller.mjs";
import { LiveAdapter } from "./live-adapter.js";

// Phase 7, scoped deliverable — a genuinely new, additive boot path, NOT a refactor of the
// normal three.js path (app.js/scene.js/movement-camera-controller.mjs are untouched). Renders
// the environment (mountCanonicalWorldContent — the same function the normal boot path calls,
// just handed an X3DOMRenderAdapter instead of a ThreeRenderAdapter) plus a real, backend-synced
// avatar via HumanoidProvider and a third-person orbit camera driven by real WASD input against
// the SAME LiveAdapter session client the three.js path uses (LiveAdapter has zero THREE
// dependency — confirmed by reading its source — so reusing it here is a straight import, not a
// port). Deliberately excluded: portal traversal, equipment, peer avatars, first-person mode,
// occlusion, and the full HUD — see the README's Render-engine adapter section for what each of
// those would need.
const AVATAR_URL = "/assets/avatars/glb/rpm_female_character.glb";
const CONTROL_KEY_MAP = Object.freeze({ KeyW: "forward", KeyS: "back", KeyA: "left", KeyD: "right" });
const RUN_KEY_CODES = new Set(["ShiftLeft", "ShiftRight"]);
const ORBIT_SPEED_RAD_PER_PX = 0.0052;

function bannerEl() {
    const el = document.createElement("div");
    el.id = "x3dom-live-mode-banner";
    el.style.cssText = "position:absolute; top:12px; left:50%; transform:translateX(-50%); " +
        "z-index:5; background:rgba(11,16,32,0.85); color:#d9e6ff; font:13px ui-monospace,Menlo,monospace; " +
        "padding:8px 14px; border-radius:6px; pointer-events:none; text-align:center; max-width:90%;";
    el.textContent = "X3DOM preview — environment + avatar + camera + movement are real; " +
        "equipment, portal traversal, first-person, and the HUD are not available in this mode.";
    return el;
}

async function main() {
    const params = new URLSearchParams(location.search);
    const role = params.get("role") === "target" ? "target"
        : params.get("role") === "source" ? "source"
            : "player";
    const active = params.get("active") || "a";

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

    mountCanonicalWorldContent(adapter, adapter.sceneRoot, {});

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

    const orbit = createOrbitCameraController({ adapter, camera: adapter.camera });
    orbit.seed({ azimuth: 0, polar: ORBIT_CAMERA_DEFAULTS.polar_rad, distance: ORBIT_CAMERA_DEFAULTS.distance_m, focusPosition: startPosition });

    const controlState = { forward: false, back: false, left: false, right: false };
    const runKeys = new Set();
    function movementBasisYaw() {
        let yaw = orbit.state.azimuth + Math.PI;
        while (yaw > Math.PI)
            yaw -= Math.PI * 2;
        while (yaw < -Math.PI)
            yaw += Math.PI * 2;
        return yaw;
    }
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

    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    x3dEl.addEventListener("mousedown", (event) => { dragging = true; lastX = event.clientX; lastY = event.clientY; });
    window.addEventListener("mouseup", () => { dragging = false; });
    window.addEventListener("mousemove", (event) => {
        if (!dragging)
            return;
        const dx = event.clientX - lastX;
        const dy = event.clientY - lastY;
        lastX = event.clientX;
        lastY = event.clientY;
        orbit.state.targetAzimuth -= dx * ORBIT_SPEED_RAD_PER_PX;
        orbit.state.targetPolar = Math.min(ORBIT_CAMERA_DEFAULTS.max_polar_rad, Math.max(ORBIT_CAMERA_DEFAULTS.min_polar_rad, orbit.state.targetPolar + dy * ORBIT_SPEED_RAD_PER_PX));
    });

    let lastFrameAt = performance.now();
    let avatarPlaced = false;
    adapter.onEnterFrame(() => {
        const now = performance.now();
        const deltaSeconds = Math.min(0.05, Math.max(0, (now - lastFrameAt) / 1000));
        lastFrameAt = now;
        const input = { ...controlState, run: runKeys.size > 0, camera_yaw: movementBasisYaw() };
        liveAdapter.stepAvatar(input, deltaSeconds);
        const position = liveAdapter.state.avatar?.position;
        if (Array.isArray(position)) {
            if (avatarPlaced)
                provider.setPosition(avatarHandle, position[0], position[1], position[2]);
            orbit.step(deltaSeconds, position);
        }
    });
    avatarReady.then(() => { avatarPlaced = true; }).catch((err) => console.error("[x3dom-live-mode] avatar load failed", err));

    window.addEventListener("pagehide", () => {
        try {
            liveAdapter.stopPresenceHeartbeat?.();
            liveAdapter.departPresence?.({ beacon: true, reason: "pagehide" });
            liveAdapter._closeRuntimeStream?.();
        }
        catch { /* best-effort teardown */ }
    });

    window.__x3domLiveMode = { adapter, liveAdapter, provider, avatarHandle, orbit };
}

main().catch((err) => console.error("[x3dom-live-mode] fatal error", err));
