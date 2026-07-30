import { HANDOFF_PHASES } from "./frontend-contract.js";
import { mountCanonicalWorldContent } from "./canonical-world-content.js";
import { ThreeRenderAdapter } from "./render-adapter/three-render-adapter.mjs";
export class Scene {
    constructor(mount, role, world) {
        this.mount = mount;
        this.role = role;
        this.world = world;
        this.phase = role === "source" ? HANDOFF_PHASES.IDLE : HANDOFF_PHASES.WAITING;
        this.avatar = role === "source"
            ? { position: (world.avatar && world.avatar.spawn_position) || [0, 0, 3.2], rotation_y: 0 }
            : null;
        this._t0 = (typeof performance !== "undefined" ? performance.now() : Date.now());
        this.rendererKind = "none";
        let impl = null;
        try {
            impl = new WebGLScene(mount, role, world);
            this.rendererKind = "webgl";
        }
        catch (err) {
            console.warn(`[scene-runtime] WebGL unavailable, degrading to canvas2d fallback: ${err.message}`);
            impl = new Canvas2DScene(mount, role, world);
            this.rendererKind = "canvas2d";
        }
        this._impl = impl;
        this._impl.setPhase(this.phase);
        this._impl.setAvatar(this.avatar);
    }
    setPhase(phase) { this.phase = phase; this._impl.setPhase(phase); }
    setAvatar(avatar) { this.avatar = avatar; this._impl.setAvatar(avatar); }
    resize() { this._impl.resize && this._impl.resize(); }
    dispose() { this._impl.dispose && this._impl.dispose(); }
}
class WebGLScene {
    constructor(mount, role, world) {
        const THREE = WebGLScene._three;
        if (!THREE)
            throw new Error("three not loaded");
        this.mount = mount;
        this.role = role;
        this.world = world;
        this.THREE = THREE;
        this.adapter = new ThreeRenderAdapter(THREE);
        this.roomColor = this.adapter.createColor(world.color || "#3aa0ff");
        this.adapter.mount(mount, {
            antialias: true, alpha: true, preserveDrawingBuffer: true,
            camera: { fov: 50, near: 0.1, far: 100 },
        });
        // Exposed for external readers that still reach into the raw THREE objects
        // (app.js, portal-render-controller.mjs, scene-runtime-controller.mjs) — these
        // are the same THREE.Scene/PerspectiveCamera/WebGLRenderer instances the adapter
        // owns internally, not copies, so both views stay in sync.
        this.scene = this.adapter.sceneRoot;
        this.camera = this.adapter.camera;
        this.renderer = this.adapter.renderer;
        this.adapter.setCameraPose(this.camera, { position: [0, 6.2, 8.4], lookAt: [0, 0, 0] });
        this._buildRoom();
        this._buildPortal();
        this._buildAvatar();
        this.phase = role === "source" ? HANDOFF_PHASES.IDLE : HANDOFF_PHASES.WAITING;
        this._t0 = performance.now();
        this._unregisterFrame = this.adapter.onEnterFrame(() => this._tick());
        this._onResize = () => this.resize();
        window.addEventListener("resize", this._onResize);
    }
    _buildRoom() {
        this.canonicalContent = mountCanonicalWorldContent(this.adapter, this.scene, this.world);
    }
    _buildPortal() {
        const A = this.adapter;
        const isSource = this.role === "source";
        const pos = isSource ? [2.8, 0, -2.8] : [0, 0, 3.6];
        this.portalGroup = A.createGroup();
        A.setPosition(this.portalGroup, pos[0], 0.02, pos[2]);
        this.portalRingMat = A.createMaterial({
            type: "standard",
            color: isSource ? 0x66e0ff : 0xffc266, emissive: isSource ? 0x1b6f8a : 0x8a5a1b,
            emissiveIntensity: 0.6, roughness: 0.4, metalness: 0.3,
        });
        const ring = A.createMesh(A.createGeometry({ type: "torus", radius: 1.15, tube: 0.12, radialSegments: 16, tubularSegments: 48 }), this.portalRingMat);
        A.setRotationAxis(ring, "x", -Math.PI / 2);
        A.setPosition(ring, 0, 1.15, 0);
        A.add(this.portalGroup, ring);
        this.portalDiscMat = A.createMaterial({ type: "basic", color: isSource ? 0x2bd4ff : 0xffb14d, transparent: true, opacity: 0.18, side: "double" });
        const disc = A.createMesh(A.createGeometry({ type: "circle", radius: 1.05, segments: 40 }), this.portalDiscMat);
        A.setRotationAxis(disc, "x", -Math.PI / 2);
        A.setPosition(disc, 0, 0.03, 0);
        A.add(this.portalGroup, disc);
        A.add(A.sceneRoot, this.portalGroup);
    }
    _buildAvatar() {
        const A = this.adapter;
        this.avatarGroup = A.createGroup();
        this.avatarBodyMat = A.createMaterial({ type: "standard", color: 0xffffff, emissive: 0x222233, roughness: 0.5 });
        const body = A.createMesh(A.createGeometry({ type: "capsule", radius: 0.32, length: 0.7, capSegments: 6, radialSegments: 14 }), this.avatarBodyMat);
        A.setPosition(body, 0, 0.8, 0);
        A.add(this.avatarGroup, body);
        const head = A.createMesh(A.createGeometry({ type: "sphere", radius: 0.26, widthSegments: 20, heightSegments: 20 }), this.avatarBodyMat);
        A.setPosition(head, 0, 1.5, 0);
        A.add(this.avatarGroup, head);
        const nose = A.createMesh(A.createGeometry({ type: "cone", radius: 0.1, height: 0.28, radialSegments: 12 }), A.createMaterial({ type: "standard", color: 0xff4466 }));
        A.setRotationAxis(nose, "x", Math.PI / 2);
        A.setPosition(nose, 0, 1.5, 0.28);
        A.add(this.avatarGroup, nose);
        if (this.role === "source") {
            const sp = (this.world.avatar && this.world.avatar.spawn_position) || [0, 0, 3.2];
            A.setPosition(this.avatarGroup, sp[0], 0, sp[2]);
            A.setVisible(this.avatarGroup, true);
        }
        else {
            A.setVisible(this.avatarGroup, false);
        }
        A.add(A.sceneRoot, this.avatarGroup);
    }
    setAvatar(avatar) {
        const A = this.adapter;
        if (!avatar) {
            A.setVisible(this.avatarGroup, false);
            return;
        }
        A.setVisible(this.avatarGroup, true);
        const p = avatar.position || [0, 0, 0];
        A.setPosition(this.avatarGroup, p[0], 0, p[2]);
        A.setRotationAxis(this.avatarGroup, "y", avatar.rotation_y || 0);
    }
    setPhase(phase) { this.phase = phase; }
    _tick() {
        const A = this.adapter;
        const t = (performance.now() - this._t0) / 1000;
        let base = 0.5;
        if (this.phase === HANDOFF_PHASES.PORTAL_ACTIVE)
            base = 1.4;
        if (this.phase === HANDOFF_PHASES.DEPARTED)
            base = 1.9;
        if (this.phase === HANDOFF_PHASES.WAITING)
            base = 0.45;
        if (this.phase === HANDOFF_PHASES.ARRIVED)
            base = 1.6;
        const pulse = base + Math.sin(t * 3) * 0.25;
        A.setMaterialProperty(this.portalRingMat, "emissiveIntensity", Math.max(0.15, pulse));
        A.setMaterialProperty(this.portalDiscMat, "opacity", 0.14 + Math.max(0, pulse - 0.5) * 0.22);
        A.setRotationAxis(this.portalGroup, "y", t * 0.4);
        if (this.role === "source" && this.phase === HANDOFF_PHASES.DEPARTED) {
            A.setMaterialProperty(this.avatarBodyMat, "transparent", true);
            A.setMaterialProperty(this.avatarBodyMat, "opacity", Math.max(0.05, 0.9 - (t % 1.0)));
            A.setScaleScalar(this.avatarGroup, 0.6 + Math.max(0.05, 1 - ((t * 0.6) % 1.0)) * 0.4);
        }
        else if (this.role === "source") {
            A.setMaterialProperty(this.avatarBodyMat, "opacity", 1);
            A.setScaleScalar(this.avatarGroup, 1);
        }
    }
    resize() {
        this.adapter.resize();
    }
    dispose() {
        if (this._unregisterFrame)
            this._unregisterFrame();
        window.removeEventListener("resize", this._onResize);
        this.adapter.dispose();
    }
}
WebGLScene._three = null;
class Canvas2DScene {
    constructor(mount, role, world) {
        this.mount = mount;
        this.role = role;
        this.world = world;
        this.roomColor = world.color || (role === "source" ? "#3aa0ff" : "#ff7a3a");
        this.canvas = document.createElement("canvas");
        this.canvas.style.width = "100%";
        this.canvas.style.height = "100%";
        this._resizeCanvas();
        mount.appendChild(this.canvas);
        this.ctx = this.canvas.getContext("2d");
        this.phase = role === "source" ? HANDOFF_PHASES.IDLE : HANDOFF_PHASES.WAITING;
        this.avatar = role === "source" ? { position: (world.avatar && world.avatar.spawn_position) || [0, 0, 3.2] } : null;
        this._t0 = performance.now();
        this._loop = this._loop.bind(this);
        this._raf = requestAnimationFrame(this._loop);
        this._onResize = () => { this._resizeCanvas(); };
        window.addEventListener("resize", this._onResize);
    }
    _resizeCanvas() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = this.mount.clientWidth || 640, h = this.mount.clientHeight || 420;
        this.canvas.width = w * dpr;
        this.canvas.height = h * dpr;
        this._dpr = dpr;
        this._w = w;
        this._h = h;
    }
    setPhase(phase) { this.phase = phase; }
    setAvatar(avatar) { this.avatar = avatar; }
    _proj(x, z) {
        const cx = this._w / 2, cy = this._h / 2;
        const scale = Math.min(this._w, this._h) / 13;
        return [cx + x * scale, cy + z * scale];
    }
    _loop() {
        const ctx = this.ctx, t = (performance.now() - this._t0) / 1000;
        ctx.save();
        ctx.scale(this._dpr, this._dpr);
        ctx.clearRect(0, 0, this._w, this._h);
        ctx.fillStyle = this.roomColor + "22";
        ctx.fillRect(0, 0, this._w, this._h);
        ctx.strokeStyle = "rgba(136,170,204,0.28)";
        ctx.lineWidth = 1;
        for (let i = -6; i <= 6; i++) {
            const [ax, ay] = this._proj(i, -6), [bx, by] = this._proj(i, 6);
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(bx, by);
            ctx.stroke();
            const [cx, cy] = this._proj(-6, i), [dx, dy] = this._proj(6, i);
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(dx, dy);
            ctx.stroke();
        }
        const isSource = this.role === "source";
        const [px, pz] = isSource ? [2.8, -2.8] : [0, 3.6];
        const [portX, portY] = this._proj(px, pz);
        let base = 0.4;
        if (this.phase === HANDOFF_PHASES.PORTAL_ACTIVE)
            base = 0.9;
        if (this.phase === HANDOFF_PHASES.DEPARTED)
            base = 1.0;
        if (this.phase === HANDOFF_PHASES.ARRIVED)
            base = 0.95;
        const glow = base + Math.sin(t * 3) * 0.2;
        const rPx = Math.min(this._w, this._h) / 13 * 1.15;
        ctx.beginPath();
        ctx.arc(portX, portY, rPx, 0, Math.PI * 2);
        ctx.strokeStyle = isSource ? `rgba(43,212,255,${Math.min(1, glow)})` : `rgba(255,177,77,${Math.min(1, glow)})`;
        ctx.lineWidth = 6;
        ctx.stroke();
        ctx.fillStyle = isSource ? `rgba(43,212,255,${0.12 + glow * 0.12})` : `rgba(255,177,77,${0.12 + glow * 0.12})`;
        ctx.fill();
        if (this.avatar) {
            const a = this.avatar.position || [0, 0, 0];
            const [axp, ayp] = this._proj(a[0], a[2]);
            let alpha = 1, rad = 12;
            if (this.role === "source" && this.phase === HANDOFF_PHASES.DEPARTED) {
                alpha = Math.max(0.1, 0.9 - (t % 1.0));
                rad = 12 * Math.max(0.4, 1 - ((t * 0.6) % 1.0));
            }
            ctx.globalAlpha = alpha;
            ctx.beginPath();
            ctx.arc(axp, ayp, rad, 0, Math.PI * 2);
            ctx.fillStyle = "#ffffff";
            ctx.fill();
            ctx.strokeStyle = "#ff4466";
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.globalAlpha = 1;
        }
        ctx.fillStyle = "rgba(255,204,85,0.9)";
        ctx.font = "11px ui-monospace, Menlo, monospace";
        ctx.fillText("canvas2d fallback (no GPU) — top-down depiction", 12, this._h - 12);
        ctx.restore();
        this._raf = requestAnimationFrame(this._loop);
    }
    resize() { this._resizeCanvas(); }
    dispose() {
        cancelAnimationFrame(this._raf);
        window.removeEventListener("resize", this._onResize);
        if (this.canvas.parentNode)
            this.canvas.parentNode.removeChild(this.canvas);
    }
}
try {
    const THREE = await import("./vendor/three/three.module.js");
    WebGLScene._three = THREE;
}
catch (e) {
    console.warn("[scene-runtime] three import failed; canvas2d fallback will be used", e && e.message);
}
