import { PortalRenderer } from "./portal-renderer.mjs";
import { ThreeRenderAdapter } from "./vendor/scene-core/render-adapter/three-render-adapter.mjs";

// Reuses the MAIN adapter's single WebGLRenderer/context via render-to-target — same approach
// SpatialPortalPreviewManager already uses (renderer.setRenderTarget + renderer.render), and the
// reason the three.js side never runs into the multi-WebGL-context contention documented in the
// Phase 0 spikes (spike-a.html / spike-b.html): there is only ever one live context.
export class ThreePortalRenderer extends PortalRenderer {
    constructor(mainAdapter) {
        super();
        if (!mainAdapter || mainAdapter.kind !== "three") {
            throw new Error("ThreePortalRenderer requires a ThreeRenderAdapter as the main adapter");
        }
        this._mainAdapter = mainAdapter;
        this._THREE = mainAdapter.raw;
    }
    get kind() { return "three"; }
    createDestinationAdapter() {
        // Constructing (not mounting) a ThreeRenderAdapter gives a usable `.sceneRoot` (its THREE.Scene
        // is created in the constructor) without spinning up a second WebGLRenderer/canvas.
        return new ThreeRenderAdapter(this._THREE);
    }
    async capture(destinationAdapter, camera, width, height) {
        const THREE = this._THREE;
        const renderer = this._mainAdapter.renderer;
        if (!renderer) {
            throw new Error("ThreePortalRenderer.capture: main adapter has no renderer yet (call mount() first)");
        }
        let rt = destinationAdapter.__portalRenderTarget;
        if (!rt || rt.width !== width || rt.height !== height) {
            if (rt) rt.dispose();
            rt = new THREE.WebGLRenderTarget(width, height, {
                minFilter: THREE.LinearFilter,
                magFilter: THREE.LinearFilter,
            });
            if ("SRGBColorSpace" in THREE) rt.texture.colorSpace = THREE.SRGBColorSpace;
            destinationAdapter.__portalRenderTarget = rt;
        }
        const previousTarget = renderer.getRenderTarget();
        renderer.setRenderTarget(rt);
        renderer.render(destinationAdapter.sceneRoot, camera);
        renderer.setRenderTarget(previousTarget);
        return { texture: rt.texture, width, height };
    }
    dispose(destinationAdapter) {
        if (destinationAdapter && destinationAdapter.__portalRenderTarget) {
            destinationAdapter.__portalRenderTarget.dispose();
            destinationAdapter.__portalRenderTarget = null;
        }
    }
}
