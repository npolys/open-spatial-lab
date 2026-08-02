// Deliberately NOT part of render-adapter/ — same reasoning as humanoid-provider.mjs: portal
// preview capture is a distinct concern from environment scene construction, decoupled so it can
// evolve independently. See the README's Render-engine adapter section.
//
// Scoped deliverable: the core capture-and-display loop for a portal aperture — render a
// destination scene off-screen and get back a texture-like handle the SAME engine's
// createMaterial({ map }) accepts. Deliberately excludes everything SpatialPortalPreviewManager
// (web/portal-spatial-preview.mjs) also does: avatar culling, radial clip planes, shared-edge
// identity validation, and destination-ring dressing all stay three.js-only for now — those are
// composition/game-logic concerns layered on top of capture, not part of the capture loop itself.
export class PortalRenderer {
    constructor() {
        if (new.target === PortalRenderer) {
            throw new Error("PortalRenderer is an interface; instantiate a concrete renderer (e.g. ThreePortalRenderer)");
        }
    }
    /** Engine identifier, e.g. "three" or "x3dom". */
    get kind() { throw new Error("not implemented"); }
    /**
     * Creates a fresh, unmounted RenderAdapter-compatible instance for destination-scene content.
     * Its `.sceneRoot` is safe to build into immediately with the normal RenderAdapter methods
     * (buildWowScene, mountCanonicalWorldContent, ...) and its `createPerspectiveCamera()` /
     * `setCameraPose()` position a destination camera — none of this needs a live render surface.
     */
    createDestinationAdapter(options = {}) { throw new Error("not implemented"); }
    /**
     * Renders the destination adapter's current scene state from `camera` at `width` x `height`
     * and returns a Promise<{ texture, width, height }>. `texture` is an opaque handle — pass it
     * straight into `mainAdapter.createMaterial({ type: "standard", map: texture })`. Safe to
     * call repeatedly (e.g. once per frame or on a timer); each engine throttles/reuses
     * internally as appropriate to its capture mechanism.
     */
    capture(destinationAdapter, camera, width, height, mainAdapter) { throw new Error("not implemented"); }
    /** Releases the destination adapter and any capture-side resources (render targets, hidden DOM hosts, textures). */
    dispose(destinationAdapter) { throw new Error("not implemented"); }
}
