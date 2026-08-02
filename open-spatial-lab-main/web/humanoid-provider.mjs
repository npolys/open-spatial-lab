// Deliberately NOT part of render-adapter/ — avatars are kept decoupled from the environment
// RenderAdapter so a future implementation can target H-Anim (ISO/IEC 19774-1:2019) independently
// of whichever engine renders the environment. See the README's Render-engine adapter section.
//
// Scoped deliverable (matching orbit-camera-controller.mjs / worldToScreen's scope): spawn a
// glTF-based humanoid at a position and dispose it. Locomotion, running/jump animation, and
// equipment attachment are NOT covered here — web/avatar-equipment-layer.js remains the
// full-featured implementation for the live three.js path; this is the first piece of an
// eventual engine-agnostic replacement, not a rewrite of it.
export class HumanoidProvider {
    constructor() {
        if (new.target === HumanoidProvider) {
            throw new Error("HumanoidProvider is an interface; instantiate a concrete provider (e.g. ThreeVrmHumanoidProvider)");
        }
    }
    /** Engine identifier, e.g. "three-vrm" or "x3dom-gltf". */
    get kind() { throw new Error("not implemented"); }
    /**
     * Loads a glTF/VRM humanoid at a world position. Returns { handle, ready } — handle is
     * available immediately (construction/claiming never blocks), ready resolves once the model
     * has actually loaded.
     */
    spawnAvatar({ url, position }) { throw new Error("not implemented"); }
    setPosition(handle, x, y, z) { throw new Error("not implemented"); }
    setVisible(handle, visible) { throw new Error("not implemented"); }
    /** Releases the avatar and any resources/pool slot it holds. */
    dispose(handle) { throw new Error("not implemented"); }
    /**
     * Attaches a piece of equipment to the avatar's root — the mechanical operation
     * avatar-equipment-layer.js's `target.node.add(object)` + local-transform-apply performs,
     * generalized across engines via RenderAdapter.add()/setLocalMatrix(). Deliberately root-level
     * only: real bone-specific attachment (VRM humanoid bones on three.js) needs H-Anim on the
     * X3DOM side to have an equivalent target, which is out of scope here (see the README's
     * Render-engine adapter section) — this covers the load+parent+position mechanics, not
     * equipment-layer feature parity. Returns { itemHandle, ready } — itemHandle available
     * immediately, ready resolves once the item's own asset has actually loaded.
     */
    attachItem(avatarHandle, { url, localTransform } = {}) { throw new Error("not implemented"); }
    /** Detaches and releases a previously attached item (and any pool slot it holds). */
    detachItem(itemHandle) { throw new Error("not implemented"); }
}
