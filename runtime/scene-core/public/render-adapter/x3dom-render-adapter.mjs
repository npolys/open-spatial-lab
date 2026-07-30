import { RenderAdapter } from "./render-adapter.mjs";
import { decomposeTRS, transformPoint } from "./spatial-math.mjs";

// X3DOM's SFMatrix4f (as returned by an internal node's getCurrentTransform()) exposes named
// _rc (row r, column c) fields, row-major, translation in column 3 of each row — mathematically
// the same matrix as spatial-math.mjs's column-major flat-array convention, just addressed
// differently. This re-indexes into that flat layout (elements[12..14] = translation), same as
// three.js's Matrix4.elements.
function x3domMatrixToFlatColumnMajor(m) {
    return [
        m._00, m._10, m._20, m._30,
        m._01, m._11, m._21, m._31,
        m._02, m._12, m._22, m._32,
        m._03, m._13, m._23, m._33,
    ];
}

// X3D nodes ARE DOM elements — this adapter builds/mutates a real DOM subtree rather than
// wrapping a JS scene-graph library. Every "node" handle it returns is a DOM element (a
// <transform> for anything positionable, matching three.js Object3D-with-transform semantics).
// A `.userData = {}` property is set on every created node to match THREE.Object3D's built-in
// bucket, so not-yet-migrated call sites that still poke `node.userData.foo = x` directly keep
// working regardless of which adapter actually built the node.

function clamp01(n) { return Math.max(0, Math.min(1, n)); }

function parseColor(value) {
    if (value && typeof value === "object" && "r" in value && "g" in value && "b" in value)
        return { r: value.r, g: value.g, b: value.b };
    if (typeof value === "number") {
        return { r: ((value >> 16) & 255) / 255, g: ((value >> 8) & 255) / 255, b: (value & 255) / 255 };
    }
    if (typeof value === "string" && value.startsWith("#")) {
        let hex = value.slice(1);
        if (hex.length === 3)
            hex = hex.split("").map((c) => c + c).join("");
        const n = parseInt(hex, 16);
        return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
    }
    throw new Error(`X3DOMRenderAdapter: unsupported color value ${JSON.stringify(value)} (hex number or "#rrggbb"/"#rgb" string only)`);
}

function colorToFieldString(c) {
    return `${c.r.toFixed(4)} ${c.g.toFixed(4)} ${c.b.toFixed(4)}`;
}

function quaternionToAxisAngle(q) {
    const [x, y, z, w] = q;
    const clampedW = Math.max(-1, Math.min(1, w));
    const angle = 2 * Math.acos(clampedW);
    const s = Math.sqrt(1 - clampedW * clampedW);
    if (s < 1e-6)
        return [1, 0, 0, 0];
    return [x / s, y / s, z / s, angle];
}

function directionFromPosition(position) {
    const [x, y, z] = position;
    const len = Math.hypot(x, y, z) || 1;
    return [-x / len, -y / len, -z / len];
}

export class X3DOMRenderAdapter extends RenderAdapter {
    constructor(x3dom) {
        super();
        if (!x3dom)
            throw new Error("X3DOMRenderAdapter requires a loaded x3dom module (window.x3dom)");
        this._x3dom = x3dom;
        this._x3dEl = null;
        this._sceneEl = null;
        this._cameraEl = null;
        this._runtime = null;
        this._frameCallbacks = [];
        this._mountEl = null;
    }
    get kind() { return "x3dom"; }
    get raw() { return null; }
    get sceneRoot() { return this._sceneEl; }
    get runtime() { return this._runtime; }
    /** Non-interface accessor for call sites still mid-migration (direct X3D element access). */
    get camera() { return this._cameraEl; }
    mount(containerEl, options = {}) {
        const width = options.width || containerEl.clientWidth || 640;
        const height = options.height || containerEl.clientHeight || 420;
        const x3dEl = document.createElement("x3d");
        x3dEl.setAttribute("width", `${width}px`);
        x3dEl.setAttribute("height", `${height}px`);
        const sceneEl = document.createElement("scene");
        x3dEl.appendChild(sceneEl);
        containerEl.appendChild(x3dEl);
        this._x3dEl = x3dEl;
        this._sceneEl = sceneEl;
        this._mountEl = containerEl;
        const cameraDesc = options.camera || {};
        this._cameraEl = this.createPerspectiveCamera({
            fov: cameraDesc.fov,
            near: cameraDesc.near,
            far: cameraDesc.far,
        });
        sceneEl.appendChild(this._cameraEl);
        this._dispatchEnterFrame = () => { for (const cb of this._frameCallbacks) cb(); };
    }
    /**
     * Binds this adapter to an <x3d> element that already exists in the page's static markup,
     * instead of creating a fresh one (mount()'s behavior). Required whenever other static
     * content on the page needs to be part of X3DOM's initial parse-time discovery — the Inline
     * slot pool (x3dom-inline-pool.js) is the reason this exists: its slots only load reliably
     * when declared alongside the <x3d> host in that same static markup (see the README's
     * Render-engine adapter section). `x3dEl` must already be attached to the document; nothing
     * is appended/moved. Scene construction may proceed immediately after this returns, same as
     * mount(). Reuses an existing <scene>/<viewpoint> already inside x3dEl if present, so
     * hand-authored static markup isn't clobbered; pass `options.camera: false` to skip creating
     * one at all.
     */
    attach(x3dEl, options = {}) {
        if (!x3dEl || !x3dEl.isConnected) {
            throw new Error("X3DOMRenderAdapter.attach: x3dEl must already be attached to the document");
        }
        this._x3dEl = x3dEl;
        let sceneEl = x3dEl.querySelector(":scope > scene");
        if (!sceneEl) {
            sceneEl = document.createElement("scene");
            x3dEl.appendChild(sceneEl);
        }
        this._sceneEl = sceneEl;
        this._mountEl = x3dEl.parentElement;
        if (options.camera !== false) {
            let cameraEl = sceneEl.querySelector(":scope > viewpoint");
            if (!cameraEl) {
                const cameraDesc = typeof options.camera === "object" && options.camera ? options.camera : {};
                cameraEl = this.createPerspectiveCamera({ fov: cameraDesc.fov, near: cameraDesc.near, far: cameraDesc.far });
                sceneEl.appendChild(cameraEl);
            }
            this._cameraEl = cameraEl;
        }
        this._dispatchEnterFrame = () => { for (const cb of this._frameCallbacks) cb(); };
    }
    // Polls for runtime attachment rather than trusting a single 'load' event or the documented
    // runtime.ready callback — both are one-shot signals that can be missed if they fire before
    // a listener attaches (confirmed empirically: runtime.ready fired before window 'load' in a
    // fast/headless init, so assigning .ready afterward silently missed it). Polling state has
    // no such race.
    ready(timeoutMs = 10000) {
        if (this._runtime)
            return Promise.resolve(this._runtime);
        return new Promise((resolve, reject) => {
            const t0 = performance.now();
            const poll = () => {
                if (this._x3dEl.runtime) {
                    this._runtime = this._x3dEl.runtime;
                    this._runtime.enterFrame = this._dispatchEnterFrame;
                    return resolve(this._runtime);
                }
                if (performance.now() - t0 > timeoutMs)
                    return reject(new Error("X3DOMRenderAdapter: runtime did not attach within " + timeoutMs + "ms"));
                setTimeout(poll, 30);
            };
            poll();
        });
    }
    resize() {
        if (!this._x3dEl || !this._mountEl)
            return;
        const width = this._mountEl.clientWidth || 640;
        const height = this._mountEl.clientHeight || 420;
        this._x3dEl.setAttribute("width", `${width}px`);
        this._x3dEl.setAttribute("height", `${height}px`);
    }
    dispose() {
        this._frameCallbacks = [];
        if (this._runtime)
            this._runtime.enterFrame = null;
        if (this._x3dEl && this._x3dEl.parentNode)
            this._x3dEl.parentNode.removeChild(this._x3dEl);
        this._x3dEl = null;
        this._sceneEl = null;
        this._runtime = null;
    }
    onEnterFrame(callback) {
        this._frameCallbacks.push(callback);
        return () => {
            const index = this._frameCallbacks.indexOf(callback);
            if (index !== -1)
                this._frameCallbacks.splice(index, 1);
        };
    }
    createPerspectiveCamera({ fov, near, far } = {}) {
        const viewpoint = document.createElement("viewpoint");
        // X3D fieldOfView is the vertical FOV in radians; three.js's fov option here is degrees.
        if (fov !== undefined)
            viewpoint.setAttribute("fieldOfView", String((fov * Math.PI) / 180));
        if (near !== undefined)
            viewpoint.setAttribute("zNear", String(near));
        if (far !== undefined)
            viewpoint.setAttribute("zFar", String(far));
        return viewpoint;
    }
    setCameraPose(camera, { position, lookAt }) {
        if (position)
            camera.setAttribute("position", `${position[0]} ${position[1]} ${position[2]}`);
        if (position && lookAt) {
            // X3D Viewpoint has no lookAt(); derive an orientation (axis-angle) that points
            // -Z (the viewpoint's default forward) at the target, matching THREE.Camera.lookAt.
            const dir = [lookAt[0] - position[0], lookAt[1] - position[1], lookAt[2] - position[2]];
            const len = Math.hypot(...dir) || 1;
            const fwd = [dir[0] / len, dir[1] / len, dir[2] / len];
            const defaultFwd = [0, 0, -1];
            const dot = Math.max(-1, Math.min(1, fwd[0] * defaultFwd[0] + fwd[1] * defaultFwd[1] + fwd[2] * defaultFwd[2]));
            const axis = [
                defaultFwd[1] * fwd[2] - defaultFwd[2] * fwd[1],
                defaultFwd[2] * fwd[0] - defaultFwd[0] * fwd[2],
                defaultFwd[0] * fwd[1] - defaultFwd[1] * fwd[0],
            ];
            const axisLen = Math.hypot(...axis);
            const angle = Math.acos(dot);
            if (axisLen < 1e-6) {
                camera.setAttribute("orientation", dot > 0 ? "0 1 0 0" : "0 1 0 3.14159");
            }
            else {
                camera.setAttribute("orientation", `${axis[0] / axisLen} ${axis[1] / axisLen} ${axis[2] / axisLen} ${angle}`);
            }
        }
    }
    // Confirmed empirically (not from docs — calcCanvasPos gave no signal for a point behind the
    // camera, projecting it identically to points on the same ray in front): view-space Z from
    // viewMatrix() is the reliable in-front/behind test (negative = in front, matching a camera
    // looking down -Z), independent of whatever calcCanvasPos itself does for off-screen points.
    worldToScreen(camera, worldPosition) {
        if (!this._runtime)
            return null;
        const [x, y] = this._runtime.calcCanvasPos(worldPosition[0], worldPosition[1], worldPosition[2]);
        const viewSpace = this._runtime.viewMatrix().multMatrixPnt(new this._x3dom.fields.SFVec3f(worldPosition[0], worldPosition[1], worldPosition[2]));
        return { x, y, visible: viewSpace.z < 0 };
    }
    cameraDistanceTo(camera, worldPosition) {
        const [cx, cy, cz] = camera.getAttribute("position").trim().split(/\s+/).map(Number);
        return Math.hypot(worldPosition[0] - cx, worldPosition[1] - cy, worldPosition[2] - cz);
    }
    /**
     * Picks whatever is at the exact center of the current camera view and returns
     * { node, position, normal, distance } (distance from the camera), or null if nothing is
     * hit there. Built on runtime.shootRay(x, y) — a real, synchronous Runtime method (confirmed
     * empirically: not in X3DOM's own documented API list, found in the vendored source, verified
     * against known geometry in spike-x3dom-shootray-probe.html) that picks at canvas-pixel
     * coordinates directly, unlike X3DOM's documented picking system which is DOM-event-driven
     * (onclick/onmouseover with event.hitPnt) and has no arbitrary-3D-segment query.
     *
     * Deliberately narrower than a general "raycast this segment" method: X3DOM has no way to
     * test an arbitrary 3D segment, only "what's at this canvas pixel right now." This is exactly
     * what movement-camera-controller.mjs's camera-wall/portal-aperture occlusion checks need —
     * both always test the camera's own current view center in third-person mode, since
     * setCameraPose()'s lookAt always points the camera exactly at the tested target — but a
     * caller relying on this for anything else would be wrong to assume it tests an arbitrary
     * origin/target pair.
     */
    pickViewCenter() {
        if (!this._runtime || !this._x3dEl)
            return null;
        const width = this._x3dEl.clientWidth || parseInt(this._x3dEl.getAttribute("width"), 10) || 0;
        const height = this._x3dEl.clientHeight || parseInt(this._x3dEl.getAttribute("height"), 10) || 0;
        if (!width || !height)
            return null;
        const hit = this._runtime.shootRay(width / 2, height / 2);
        if (!hit || !hit.pickObject || !hit.pickPosition)
            return null;
        const position = [hit.pickPosition.x, hit.pickPosition.y, hit.pickPosition.z];
        const [cx, cy, cz] = this._cameraEl
            ? this._cameraEl.getAttribute("position").trim().split(/\s+/).map(Number)
            : [0, 0, 0];
        return {
            node: hit.pickObject,
            position,
            normal: hit.pickNormal ? [hit.pickNormal.x, hit.pickNormal.y, hit.pickNormal.z] : null,
            distance: Math.hypot(position[0] - cx, position[1] - cy, position[2] - cz),
        };
    }
    /** World-space translation of `node` itself (not its content bounds) — its own accumulated transform's translation component. */
    getWorldPosition(node) {
        if (!node || !node._x3domNode || typeof node._x3domNode.getCurrentTransform !== "function")
            return null;
        const m = node._x3domNode.getCurrentTransform();
        return [m._03, m._13, m._23];
    }
    // Confirmed empirically (spike-x3dom-bbox-probe.html): runtime.getBBox(node) returns bounds
    // already transformed by node's OWN transform, but expressed in node's PARENT's local frame —
    // not full world space, and not node-local either. Composing that with the parent's own
    // accumulated world matrix (node.parentNode._x3domNode.getCurrentTransform()) gives true
    // world-space bounds. All 8 corners are transformed (not just min/max) so a rotated ancestor
    // still produces a correct axis-aligned world box, matching measureVisibleWorldBounds() in
    // web/wow-scene.mjs (the three.js analog this mirrors).
    measureWorldBounds(node) {
        if (!node || !node._x3domNode || !this._runtime)
            return null;
        const parent = node.parentNode;
        if (!parent)
            return null;
        const local = this._runtime.getBBox(node);
        if (!local)
            return null;
        const parentMatrix = parent._x3domNode && typeof parent._x3domNode.getCurrentTransform === "function"
            ? x3domMatrixToFlatColumnMajor(parent._x3domNode.getCurrentTransform())
            : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
        const lo = [local.min.x, local.min.y, local.min.z];
        const hi = [local.max.x, local.max.y, local.max.z];
        if (!(hi[0] > lo[0] || hi[1] > lo[1] || hi[2] > lo[2]))
            return null;
        const corners = [
            [lo[0], lo[1], lo[2]], [hi[0], lo[1], lo[2]], [hi[0], hi[1], lo[2]], [lo[0], hi[1], lo[2]],
            [lo[0], lo[1], hi[2]], [hi[0], lo[1], hi[2]], [hi[0], hi[1], hi[2]], [lo[0], hi[1], hi[2]],
        ].map((corner) => transformPoint(parentMatrix, corner));
        const min = [Infinity, Infinity, Infinity];
        const max = [-Infinity, -Infinity, -Infinity];
        for (const corner of corners) {
            for (let axis = 0; axis < 3; axis += 1) {
                if (corner[axis] < min[axis])
                    min[axis] = corner[axis];
                if (corner[axis] > max[axis])
                    max[axis] = corner[axis];
            }
        }
        return {
            min,
            max,
            center: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2],
            size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
        };
    }
    createGroup(name) {
        const el = document.createElement("transform");
        el.userData = {};
        if (name)
            el.name = name;
        return el;
    }
    // Confirmed empirically (see x3dom-spikes/ this session, exhausted every ordering of
    // document.createElement()-built Inline nodes): a dynamically-created <Inline> never
    // reliably loads, regardless of insertion order, the `load` field, or re-triggering. Only a
    // node that already completed one real load (from the static parse-time markup — see
    // x3dom-inline-pool.js) can have its `url` swapped and reliably reload with new content. So
    // this claims a slot from that pre-seeded pool rather than creating a node from scratch.
    createInlineAsset(url, options = {}, timeoutMs = 15000) {
        const slot = document.querySelector('inline[data-x3dom-inline-pool-slot="free"]');
        if (!slot)
            throw new Error("X3DOMRenderAdapter.createInlineAsset: Inline slot pool exhausted — all slots are claimed (see x3dom-inline-pool.js)");
        slot.setAttribute("data-x3dom-inline-pool-slot", "claimed");
        const wrapper = slot.parentElement;
        wrapper.userData = wrapper.userData || {};
        wrapper._x3domPoolSlot = slot;
        const namesOf = () => Array.from(slot.children).map((c) => c.getAttribute && c.getAttribute("def")).join(",");
        const t0 = performance.now();
        const pollUntil = (predicate) => new Promise((resolve, reject) => {
            const poll = () => {
                if (predicate())
                    return resolve();
                if (performance.now() - t0 > timeoutMs)
                    return reject(new Error(`X3DOMRenderAdapter.createInlineAsset: "${url}" did not load within ${timeoutMs}ms`));
                setTimeout(poll, 50);
            };
            poll();
        });
        const ready = (async () => {
            // With many pool slots primed concurrently at page-parse time, the specific slot
            // just claimed may not have finished ITS placeholder load yet — swapping url while
            // that first load is still in flight risks racing it. Wait for real content first.
            await pollUntil(() => slot.children.length > 0);
            const namesBefore = namesOf();
            slot.setAttribute("url", url);
            await pollUntil(() => slot.children.length > 0 && namesOf() !== namesBefore);
            return wrapper;
        })();
        return { node: wrapper, ready };
    }
    createColor(value) { return parseColor(value); }
    multiplyColorScalar(color, scalar) {
        return { r: clamp01(color.r * scalar), g: clamp01(color.g * scalar), b: clamp01(color.b * scalar) };
    }
    colorToHexString(color) {
        const to2 = (n) => Math.round(clamp01(n) * 255).toString(16).padStart(2, "0");
        return `${to2(color.r)}${to2(color.g)}${to2(color.b)}`;
    }
    setBackgroundColor(color) {
        let bg = this._sceneEl.querySelector(":scope > background");
        if (!bg) {
            bg = document.createElement("background");
            this._sceneEl.appendChild(bg);
        }
        bg.setAttribute("skyColor", colorToFieldString(color));
    }
    createGeometry(desc) {
        switch (desc.type) {
            case "box": {
                const el = document.createElement("box");
                el.setAttribute("size", `${desc.width ?? 1} ${desc.height ?? 1} ${desc.depth ?? 1}`);
                return el;
            }
            case "plane": {
                const el = document.createElement("plane");
                el.setAttribute("size", `${desc.width ?? 1} ${desc.height ?? 1}`);
                return el;
            }
            case "sphere": {
                const el = document.createElement("sphere");
                el.setAttribute("radius", String(desc.radius ?? 1));
                return el;
            }
            case "cone": {
                const el = document.createElement("cone");
                el.setAttribute("bottomRadius", String(desc.radius ?? 0.5));
                el.setAttribute("height", String(desc.height ?? 1));
                return el;
            }
            case "cylinder": {
                const el = document.createElement("cylinder");
                el.setAttribute("radius", String(desc.radiusTop ?? desc.radiusBottom ?? 1));
                el.setAttribute("height", String(desc.height ?? 1));
                return el;
            }
            case "octahedron": {
                // X3D has no native octahedron primitive — a precise 6-vertex/8-face
                // IndexedFaceSet (three.js OctahedronGeometry(radius, 0), undivided).
                const r = desc.radius ?? 1;
                const points = [`0 ${r} 0`, `0 ${-r} 0`, `${r} 0 0`, `${-r} 0 0`, `0 0 ${r}`, `0 0 ${-r}`];
                const faces = [
                    [0, 2, 4], [0, 4, 3], [0, 3, 5], [0, 5, 2],
                    [1, 4, 2], [1, 3, 4], [1, 5, 3], [1, 2, 5],
                ];
                const coordIndex = faces.flatMap((f) => [...f, -1]);
                const coord = document.createElement("coordinate");
                coord.setAttribute("point", points.join(", "));
                const el = document.createElement("indexedfaceset");
                el.setAttribute("coordIndex", coordIndex.join(" "));
                el.setAttribute("solid", "false");
                el.appendChild(coord);
                return el;
            }
            case "edges": {
                // Only box-sourced edges are supported (the only case this codebase uses) — a
                // literal 12-edge wireframe of the box, not a generic "edges of any geometry"
                // operation like THREE's EdgesGeometry.
                if (!desc.from || desc.from.tagName?.toLowerCase() !== "box")
                    throw new Error('X3DOMRenderAdapter.createGeometry("edges"): only a box `from` source is supported so far');
                const [w, h, d] = desc.from.getAttribute("size").split(/\s+/).map(Number);
                const hw = w / 2, hh = h / 2, hd = d / 2;
                const corners = [
                    [-hw, -hh, -hd], [hw, -hh, -hd], [hw, hh, -hd], [-hw, hh, -hd],
                    [-hw, -hh, hd], [hw, -hh, hd], [hw, hh, hd], [-hw, hh, hd],
                ];
                const edgeIndices = [
                    [0, 1], [1, 2], [2, 3], [3, 0],
                    [4, 5], [5, 6], [6, 7], [7, 4],
                    [0, 4], [1, 5], [2, 6], [3, 7],
                ];
                const coord = document.createElement("coordinate");
                coord.setAttribute("point", corners.map((c) => c.join(" ")).join(", "));
                const el = document.createElement("indexedlineset");
                el.setAttribute("coordIndex", edgeIndices.map((e) => `${e[0]} ${e[1]} -1`).join(" "));
                el.appendChild(coord);
                return el;
            }
            default:
                throw new Error(`X3DOMRenderAdapter.createGeometry: type "${desc.type}" not yet implemented ` +
                    `(supported so far: box, plane, sphere, cone, cylinder, octahedron, edges(box-only) — ` +
                    `others land with the call sites that need them)`);
        }
    }
    createMaterial(desc) {
        if (desc.type !== "standard" && desc.type !== "basic" && desc.type !== "line")
            throw new Error(`X3DOMRenderAdapter.createMaterial: type "${desc.type}" not yet implemented (supported so far: standard, basic, line)`);
        const materialEl = document.createElement("material");
        const color = desc.color !== undefined ? parseColor(desc.color) : { r: 0.8, g: 0.8, b: 0.8 };
        // X3D lines aren't lit — diffuseColor alone wouldn't render visibly, so line materials
        // also drive emissiveColor from the same color (there's no separate "unlit" material
        // type in this X3DOM build to reach for instead).
        const emissive = desc.type === "line" ? color : desc.emissive !== undefined ? parseColor(desc.emissive) : { r: 0, g: 0, b: 0 };
        const base = { color, emissive, emissiveIntensity: desc.emissiveIntensity ?? 1 };
        materialEl.setAttribute("diffuseColor", colorToFieldString(base.color));
        materialEl.setAttribute("emissiveColor", colorToFieldString(this.multiplyColorScalar(base.emissive, base.emissiveIntensity)));
        if (desc.opacity !== undefined || desc.transparent)
            materialEl.setAttribute("transparency", String(1 - (desc.opacity ?? 1)));
        const appearanceEl = document.createElement("appearance");
        appearanceEl.appendChild(materialEl);
        if (desc.map) {
            if (desc.map.kind !== "x3d-canvas-texture")
                throw new Error('X3DOMRenderAdapter.createMaterial: "map" must be a handle from createCanvasTexture()');
            appearanceEl.appendChild(desc.map.el);
        }
        return { kind: "x3d-material", appearanceEl, materialEl, base, mapTexture: desc.map || null };
    }
    _wrapShape(geometry, material) {
        const shape = document.createElement("shape");
        shape.appendChild(material.appearanceEl);
        shape.appendChild(geometry);
        const transform = document.createElement("transform");
        transform.appendChild(shape);
        transform.userData = {};
        transform._x3dShape = shape;
        return transform;
    }
    createMesh(geometry, material) { return this._wrapShape(geometry, material); }
    setGeometry(mesh, geometry) {
        const shape = mesh._x3dShape;
        const old = shape.querySelector(":scope > *:not(appearance)");
        if (old)
            shape.removeChild(old);
        shape.appendChild(geometry);
    }
    // X3D has no separate "line segments" node type distinct from a mesh — an IndexedLineSet
    // geometry inside a Shape renders as lines, same wrapping as createMesh either way.
    createLineSegments(geometry, material) { return this._wrapShape(geometry, material); }
    createLine(geometry, material) { return this._wrapShape(geometry, material); }
    // X3D's ImageTexture.url accepts a data: URI directly, so a live 2D canvas can be wrapped
    // without a dedicated "canvas texture" node type — updateCanvasTexture() re-reads the same
    // canvas on demand (X3DOM has no canvas-backed live-texture primitive to bind to instead).
    createCanvasTexture(canvas) {
        if (!canvas || typeof canvas.toDataURL !== "function")
            throw new Error("X3DOMRenderAdapter.createCanvasTexture: requires a 2D <canvas> element");
        const textureEl = document.createElement("imagetexture");
        textureEl.setAttribute("url", canvas.toDataURL());
        return { kind: "x3d-canvas-texture", el: textureEl, canvas };
    }
    /** Re-reads the handle's source canvas and pushes the new pixels to the live ImageTexture node. */
    updateCanvasTexture(textureHandle) {
        if (!textureHandle || textureHandle.kind !== "x3d-canvas-texture")
            throw new Error("X3DOMRenderAdapter.updateCanvasTexture: requires a handle from createCanvasTexture()");
        textureHandle.el.setAttribute("url", textureHandle.canvas.toDataURL());
    }
    createSprite() { throw new Error("X3DOMRenderAdapter.createSprite: not yet implemented"); }
    createGridHelper({ size, divisions, colorGrid, transparent, opacity }) {
        const half = size / 2;
        const step = size / divisions;
        const points = [];
        const coordIndex = [];
        let idx = 0;
        for (let i = 0; i <= divisions; i += 1) {
            const pos = -half + i * step;
            points.push(`${-half} 0 ${pos}`, `${half} 0 ${pos}`);
            coordIndex.push(idx, idx + 1, -1);
            idx += 2;
            points.push(`${pos} 0 ${-half}`, `${pos} 0 ${half}`);
            coordIndex.push(idx, idx + 1, -1);
            idx += 2;
        }
        const coord = document.createElement("coordinate");
        coord.setAttribute("point", points.join(", "));
        const lineSet = document.createElement("indexedlineset");
        lineSet.setAttribute("coordIndex", coordIndex.join(" "));
        lineSet.appendChild(coord);
        const material = document.createElement("material");
        material.setAttribute("emissiveColor", colorToFieldString(parseColor(colorGrid ?? 0xffffff)));
        material.setAttribute("diffuseColor", "0 0 0");
        if (transparent && opacity !== undefined)
            material.setAttribute("transparency", String(1 - opacity));
        const appearance = document.createElement("appearance");
        appearance.appendChild(material);
        const shape = document.createElement("shape");
        shape.appendChild(appearance);
        shape.appendChild(lineSet);
        const transform = document.createElement("transform");
        transform.appendChild(shape);
        transform.userData = {};
        // colorCenterLine is not distinguished from colorGrid here — a documented simplification
        // for this debug-only helper, not worth a second line-set + material for now.
        return transform;
    }
    createAmbientLight({ color, intensity }) {
        const light = document.createElement("directionallight");
        light.setAttribute("direction", "0 -1 0");
        light.setAttribute("ambientIntensity", String(intensity ?? 1));
        light.setAttribute("intensity", "0");
        light.setAttribute("color", colorToFieldString(parseColor(color ?? 0xffffff)));
        light.userData = {};
        return light;
    }
    createDirectionalLight({ color, intensity, position }) {
        const light = document.createElement("directionallight");
        const dir = position ? directionFromPosition(position) : [0, -1, 0];
        light.setAttribute("direction", dir.join(" "));
        light.setAttribute("intensity", String(intensity ?? 1));
        light.setAttribute("color", colorToFieldString(parseColor(color ?? 0xffffff)));
        light.userData = {};
        return light;
    }
    add(parent, child) { parent.appendChild(child); }
    remove(parent, child) { if (child.parentNode === parent) parent.removeChild(child); }
    setName(node, name) { node.name = name; }
    setPosition(node, x, y, z) { node.setAttribute("translation", `${x} ${y} ${z}`); }
    // Every call site in this codebase sets exactly one axis per node (never composes x+y+z
    // rotations on the same node across multiple calls), so overwriting the whole `rotation`
    // field with a single-axis value matches actual usage exactly. Would need real composition
    // if that assumption ever stops holding.
    setRotationAxis(node, axis, radians) {
        const vec = axis === "x" ? "1 0 0" : axis === "y" ? "0 1 0" : "0 0 1";
        node.setAttribute("rotation", `${vec} ${radians}`);
    }
    setLocalMatrix(node, matrix16) {
        const { translation, quaternion, scale } = decomposeTRS(matrix16);
        const [ax, ay, az, angle] = quaternionToAxisAngle(quaternion);
        node.setAttribute("translation", translation.join(" "));
        node.setAttribute("rotation", `${ax} ${ay} ${az} ${angle}`);
        node.setAttribute("scale", scale.join(" "));
    }
    setScaleScalar(node, scale) { node.setAttribute("scale", `${scale} ${scale} ${scale}`); }
    setVisible(node, visible) { node.setAttribute("render", visible ? "true" : "false"); }
    setUserData(node, key, value) {
        node.userData = node.userData || {};
        node.userData[key] = value;
    }
    setMaterialProperty(material, key, value) {
        if (key === "opacity") {
            material.materialEl.setAttribute("transparency", String(1 - value));
            return;
        }
        if (key === "emissiveIntensity") {
            material.base.emissiveIntensity = value;
            material.materialEl.setAttribute("emissiveColor", colorToFieldString(this.multiplyColorScalar(material.base.emissive, value)));
            return;
        }
        if (key === "transparent")
            return; // X3D has no separate transparent flag — transparency alone governs it.
        throw new Error(`X3DOMRenderAdapter.setMaterialProperty: key "${key}" not yet implemented`);
    }
    recolorSubtreeMaterials(node, hexColor) {
        const colorStr = colorToFieldString(parseColor(hexColor));
        node.querySelectorAll("material").forEach((materialEl) => {
            materialEl.setAttribute("diffuseColor", colorStr);
            materialEl.setAttribute("emissiveColor", colorStr);
        });
    }
    disposeGeometry() { /* DOM removal (disposeNode/remove) is what releases X3D resources — no separate step */ }
    disposeMaterial() { /* same as disposeGeometry */ }
    disposeNode(node) {
        // A pool-backed Inline wrapper is a permanent pool member — release it back to the
        // placeholder/free state rather than removing it from the DOM (removing it would shrink
        // the fixed-size pool for good, since a freshly re-created replacement wouldn't load).
        if (node._x3domPoolSlot) {
            const slot = node._x3domPoolSlot;
            const placeholderUrl = slot.getAttribute("data-x3dom-inline-pool-placeholder-url") || slot.getAttribute("url");
            slot.setAttribute("url", placeholderUrl);
            slot.setAttribute("data-x3dom-inline-pool-slot", "free");
            delete node._x3domPoolSlot;
            return;
        }
        if (node.parentNode)
            node.parentNode.removeChild(node);
    }
}
