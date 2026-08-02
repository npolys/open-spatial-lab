import { HumanoidProvider } from "./humanoid-provider.mjs";

// Scoped deliverable — see humanoid-provider.mjs. Name says "gltf" deliberately: this targets
// glTF/VRM avatars directly via X3DOMRenderAdapter's Inline-slot-pool mechanism (real, verified —
// see x3dom-spikes/spike-x3dom-inline-pool.html), per explicit direction to build against that
// now rather than block on an H-Anim conversion pipeline. A future HAnimHumanoidProvider targeting
// ISO/IEC 19774-1:2019 is expected to sit alongside this one, not replace it outright.
export class X3domGltfHumanoidProvider extends HumanoidProvider {
    constructor(x3domRenderAdapter) {
        super();
        if (!x3domRenderAdapter)
            throw new Error("X3domGltfHumanoidProvider requires an X3DOMRenderAdapter instance");
        this._adapter = x3domRenderAdapter;
    }
    get kind() { return "x3dom-gltf"; }
    spawnAvatar({ url, position }) {
        const { node, ready } = this._adapter.createInlineAsset(url);
        if (position)
            this._adapter.setPosition(node, position[0], position[1], position[2]);
        return { handle: node, ready: ready.then(() => node) };
    }
    setPosition(handle, x, y, z) { this._adapter.setPosition(handle, x, y, z); }
    setVisible(handle, visible) { this._adapter.setVisible(handle, visible); }
    dispose(handle) { this._adapter.disposeNode(handle); }
    attachItem(avatarHandle, { url, localTransform } = {}) {
        const { node, ready } = this._adapter.createInlineAsset(url);
        if (localTransform)
            this._adapter.setLocalMatrix(node, localTransform);
        this._adapter.add(avatarHandle, node);
        return { itemHandle: node, ready: ready.then(() => node) };
    }
    detachItem(itemHandle) { this._adapter.disposeNode(itemHandle); }
}
