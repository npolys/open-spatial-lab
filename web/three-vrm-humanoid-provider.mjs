import { HumanoidProvider } from "./humanoid-provider.mjs";
import { ThreeRenderAdapter } from "./vendor/scene-core/render-adapter/three-render-adapter.mjs";

// Scoped deliverable — see humanoid-provider.mjs. This wraps three.js's glTF loading through
// ThreeRenderAdapter.createInlineAsset (an internal implementation detail; HumanoidProvider stays
// the swappable outward-facing interface). It is NOT a replacement for avatar-equipment-layer.js,
// which keeps the full locomotion/animation/equipment feature set for the live three.js path.
export class ThreeVrmHumanoidProvider extends HumanoidProvider {
    constructor(THREE, { loadGltf, cloneScene, scene } = {}) {
        super();
        if (!THREE)
            throw new Error("ThreeVrmHumanoidProvider requires a loaded three.js module");
        if (typeof loadGltf !== "function")
            throw new Error("ThreeVrmHumanoidProvider requires options.loadGltf (three.js has no built-in glTF import)");
        this._loadGltf = loadGltf;
        this._cloneScene = cloneScene;
        this._scene = scene || null;
        this._adapter = new ThreeRenderAdapter(THREE);
    }
    get kind() { return "three-vrm"; }
    spawnAvatar({ url, position }) {
        const { node, ready } = this._adapter.createInlineAsset(url, {
            loadGltf: this._loadGltf,
            cloneScene: this._cloneScene,
        });
        if (position)
            this._adapter.setPosition(node, position[0], position[1], position[2]);
        if (this._scene)
            this._adapter.add(this._scene, node);
        return { handle: node, ready: ready.then(() => node) };
    }
    setPosition(handle, x, y, z) { this._adapter.setPosition(handle, x, y, z); }
    setVisible(handle, visible) { this._adapter.setVisible(handle, visible); }
    dispose(handle) { this._adapter.disposeNode(handle); }
    attachItem(avatarHandle, { url, localTransform } = {}) {
        const { node, ready } = this._adapter.createInlineAsset(url, {
            loadGltf: this._loadGltf,
            cloneScene: this._cloneScene,
        });
        if (localTransform)
            this._adapter.setLocalMatrix(node, localTransform);
        this._adapter.add(avatarHandle, node);
        return { itemHandle: node, ready: ready.then(() => node) };
    }
    detachItem(itemHandle) { this._adapter.disposeNode(itemHandle); }
}
