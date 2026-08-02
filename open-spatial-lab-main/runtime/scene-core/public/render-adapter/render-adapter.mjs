// Engine-agnostic contract for scene construction + a render loop, so scene-building code
// (scene.js, canonical-world-content.js, wow-scene.mjs, ...) does not import an engine module
// directly. Concrete engines (ThreeRenderAdapter, and later an X3DOMRenderAdapter) implement this.
//
// Node/geometry/material/camera handles returned by this interface are OPAQUE to callers — never
// reach into them expecting a specific engine's object shape. Use `raw` only in code that is
// explicitly transitional (not yet ported off direct engine access); it returns null on adapters
// that don't expose one (e.g. X3DOM has no equivalent escape hatch to a WebGL/THREE namespace).
export class RenderAdapter {
    constructor() {
        if (new.target === RenderAdapter) {
            throw new Error("RenderAdapter is an interface; instantiate a concrete adapter (e.g. ThreeRenderAdapter)");
        }
    }
    /** Engine identifier, e.g. "three" or "x3dom". */
    get kind() { throw new Error("not implemented"); }
    /** Transitional escape hatch to the underlying engine module/namespace, or null if none. */
    get raw() { throw new Error("not implemented"); }
    /** Opaque handle to the root of the scene graph. */
    get sceneRoot() { throw new Error("not implemented"); }
    /** Flat background color (X3D: a single-color Background node's skyColor field). */
    setBackgroundColor(color) { throw new Error("not implemented"); }
    /**
     * Creates the renderer/canvas and appends it into containerEl. Throws if the engine can't
     * run here. Synchronous: only does setup that doesn't require a live runtime — scene
     * construction (createGroup/createMesh/add/...) may proceed immediately after this returns,
     * without awaiting ready(). Some engines (X3DOM) attach their runtime asynchronously; mount()
     * itself never waits for that.
     */
    mount(containerEl, options = {}) { throw new Error("not implemented"); }
    /**
     * Resolves once the engine's runtime can actually render/pick/query (camera pose reads,
     * picking, screenshots, etc.) — NOT a precondition for scene construction. Resolves
     * immediately on engines that are fully synchronous after mount() (e.g. three.js).
     */
    ready() { throw new Error("not implemented"); }
    /** Recomputes renderer size from containerEl's current dimensions. */
    resize() { throw new Error("not implemented"); }
    /** Tears down the renderer/canvas and releases resources. */
    dispose() { throw new Error("not implemented"); }
    /** Registers a callback invoked once per rendered frame, before that frame is drawn. */
    onEnterFrame(callback) { throw new Error("not implemented"); }
    createPerspectiveCamera({ fov, aspect, near, far }) { throw new Error("not implemented"); }
    setCameraPose(camera, { position, lookAt }) { throw new Error("not implemented"); }
    /**
     * Projects a world position to container-relative screen pixels, for DOM-overlay HUD
     * elements that track a 3D position. Requires ready() — unlike construction, this is a
     * live-runtime query. Returns { x, y, visible } (visible = in front of the camera; does NOT
     * check on-screen bounds — compare x/y against the container's width/height for that) or
     * null if it can't be computed yet.
     */
    worldToScreen(camera, worldPosition) { throw new Error("not implemented"); }
    /** Straight-line distance from the camera's current position to a world position. */
    cameraDistanceTo(camera, worldPosition) { throw new Error("not implemented"); }
    createGroup(name) { throw new Error("not implemented"); }
    /**
     * Loads an external asset (glTF today; model/x3d+xml where the WoW asset endpoint offers it —
     * see the README's Render-engine adapter section) and mounts it under a fresh transform node.
     * Returns { node, ready } — node is available immediately (construction stays synchronous,
     * same as everything else in this interface), ready is a Promise resolving once content has
     * actually loaded. options.loadGltf/cloneScene mirror wow-scene.mjs's existing injected-loader
     * pattern and are REQUIRED for ThreeRenderAdapter (it has no built-in glTF import); X3DOMRenderAdapter
     * ignores them — X3D's native <Inline> node imports glTF on its own.
     */
    createInlineAsset(url, options = {}) { throw new Error("not implemented"); }
    /** Parses a color (hex number, "#rrggbb", CSS name, ...) into an opaque color handle. */
    createColor(value) { throw new Error("not implemented"); }
    /** Returns a new color handle scaled by `scalar` (darken/lighten); does not mutate `color`. */
    multiplyColorScalar(color, scalar) { throw new Error("not implemented"); }
    colorToHexString(color) { throw new Error("not implemented"); }
    /**
     * type: "box" | "plane" | "circle" | "torus" | "capsule" | "sphere" | "cone" | "octahedron" | "cylinder"
     *     | "edges" (wraps another geometry handle, given as `from`)
     *     | "points" (polyline through `points`, an array of [x,y,z])
     * Remaining fields are geometry-specific dimensions (see ThreeRenderAdapter for the exact set).
     */
    createGeometry(desc) { throw new Error("not implemented"); }
    /**
     * type: "standard" | "basic" | "line" | "sprite"
     * Fields: color, emissive, emissiveIntensity, roughness, metalness, transparent, opacity,
     * side ("front" | "back" | "double"), map (texture handle), depthWrite.
     */
    createMaterial(desc) { throw new Error("not implemented"); }
    createMesh(geometry, material) { throw new Error("not implemented"); }
    /** Replaces a mesh's geometry in place (e.g. resizing a floor plane). */
    setGeometry(mesh, geometry) { throw new Error("not implemented"); }
    createLineSegments(geometry, material) { throw new Error("not implemented"); }
    /** A continuous polyline (as opposed to createLineSegments' disconnected pairs). */
    createLine(geometry, material) { throw new Error("not implemented"); }
    /** Builds a live texture from a 2D <canvas> element (e.g. drawn text/labels). */
    createCanvasTexture(canvas, options = {}) { throw new Error("not implemented"); }
    createSprite(material) { throw new Error("not implemented"); }
    createGridHelper({ size, divisions, colorCenterLine, colorGrid, transparent, opacity }) { throw new Error("not implemented"); }
    createAmbientLight({ color, intensity }) { throw new Error("not implemented"); }
    createDirectionalLight({ color, intensity, position }) { throw new Error("not implemented"); }
    add(parent, child) { throw new Error("not implemented"); }
    remove(parent, child) { throw new Error("not implemented"); }
    setName(node, name) { throw new Error("not implemented"); }
    setPosition(node, x, y, z) { throw new Error("not implemented"); }
    setRotationAxis(node, axis, radians) { throw new Error("not implemented"); }
    /** Sets a node's local transform from a flat 16-element column-major matrix (spatial-math.mjs layout). */
    setLocalMatrix(node, matrix16) { throw new Error("not implemented"); }
    setScaleScalar(node, scale) { throw new Error("not implemented"); }
    setVisible(node, visible) { throw new Error("not implemented"); }
    setUserData(node, key, value) { throw new Error("not implemented"); }
    setMaterialProperty(material, key, value) { throw new Error("not implemented"); }
    /** Recolors every material found under (and including) node — e.g. marking an asset placeholder unavailable. */
    recolorSubtreeMaterials(node, hexColor) { throw new Error("not implemented"); }
    disposeGeometry(geometry) { throw new Error("not implemented"); }
    disposeMaterial(material) { throw new Error("not implemented"); }
    /** Recursively disposes every geometry/material under (and including) node. */
    disposeNode(node) { throw new Error("not implemented"); }
}
