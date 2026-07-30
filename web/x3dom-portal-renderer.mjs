import { PortalRenderer } from "./portal-renderer.mjs";
import { X3DOMRenderAdapter } from "./vendor/scene-core/render-adapter/x3dom-render-adapter.mjs";

const DEFAULT_CAPTURE_INTERVAL_MS = 100; // ~10fps — Phase 0's spikes measured getScreenshot() at
// 69-103fps achievable in isolation but found severe contention once a second live WebGL context
// is polled concurrently with the main scene; throttling capture keeps portal previews well under
// that budget instead of polling every frame.

// X3DOM has no render-to-texture primitive, so the capture mechanism is necessarily different
// from ThreePortalRenderer: a second, hidden <x3d> host renders the destination content for real,
// and runtime.getScreenshot() (a synchronous data: URI capture) is polled on a timer and pushed
// into an X3D ImageTexture via X3DOMRenderAdapter.createCanvasTexture()/updateCanvasTexture().
export class X3DOMPortalRenderer extends PortalRenderer {
    constructor(x3dom, options = {}) {
        super();
        if (!x3dom) {
            throw new Error("X3DOMPortalRenderer requires a loaded x3dom module (window.x3dom)");
        }
        this._x3dom = x3dom;
        this._captureIntervalMs = options.captureIntervalMs ?? DEFAULT_CAPTURE_INTERVAL_MS;
    }
    get kind() { return "x3dom"; }
    createDestinationAdapter({ width = 256, height = 256 } = {}) {
        // A hidden-but-live host: X3DOM only attaches a runtime to elements that are really in the
        // document (the same "must be real DOM" constraint documented for Inline nodes elsewhere
        // in this codebase applies to the whole <x3d> element too) — position:fixed off-screen
        // keeps it out of the visible layout without detaching it.
        const host = document.createElement("div");
        host.style.cssText = `position:fixed; left:-99999px; top:0; width:${width}px; height:${height}px; pointer-events:none;`;
        document.body.appendChild(host);
        const adapter = new X3DOMRenderAdapter(this._x3dom);
        adapter.mount(host, { width, height });
        // X3DOM's own <x3d>-element discovery only runs once (at document load); an <x3d> element
        // created and attached afterward — exactly this adapter's case, since it always mounts
        // well after the main adapter's ready() has already resolved — is otherwise never picked
        // up and never gets a runtime. reload() is X3DOM's documented hook for exactly this.
        this._x3dom.reload();
        adapter.__portalHostEl = host;
        adapter.__portalCanvas = document.createElement("canvas");
        adapter.__portalCanvas.width = width;
        adapter.__portalCanvas.height = height;
        adapter.__portalCtx = adapter.__portalCanvas.getContext("2d");
        adapter.__portalImg = new Image();
        adapter.__portalLastCaptureAtMs = -Infinity;
        adapter.__portalTexture = null;
        return adapter;
    }
    async capture(destinationAdapter, camera, width, height, mainAdapter) {
        if (!mainAdapter || mainAdapter.kind !== "x3dom") {
            throw new Error("X3DOMPortalRenderer.capture: requires the main X3DOMRenderAdapter (to build the texture handle)");
        }
        await destinationAdapter.ready();
        const now = performance.now();
        if (destinationAdapter.__portalTexture && now - destinationAdapter.__portalLastCaptureAtMs < this._captureIntervalMs) {
            return { texture: destinationAdapter.__portalTexture, width, height };
        }
        destinationAdapter.__portalLastCaptureAtMs = now;
        const dataUri = destinationAdapter.runtime.getScreenshot();
        await new Promise((resolve, reject) => {
            destinationAdapter.__portalImg.onload = () => resolve();
            destinationAdapter.__portalImg.onerror = () => reject(new Error("X3DOMPortalRenderer.capture: screenshot decode failed"));
            destinationAdapter.__portalImg.src = dataUri;
        });
        const ctx = destinationAdapter.__portalCtx;
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(destinationAdapter.__portalImg, 0, 0, width, height);
        if (!destinationAdapter.__portalTexture) {
            destinationAdapter.__portalTexture = mainAdapter.createCanvasTexture(destinationAdapter.__portalCanvas);
        } else {
            mainAdapter.updateCanvasTexture(destinationAdapter.__portalTexture);
        }
        return { texture: destinationAdapter.__portalTexture, width, height };
    }
    dispose(destinationAdapter) {
        if (!destinationAdapter) return;
        destinationAdapter.dispose();
        if (destinationAdapter.__portalHostEl && destinationAdapter.__portalHostEl.parentNode) {
            destinationAdapter.__portalHostEl.parentNode.removeChild(destinationAdapter.__portalHostEl);
        }
    }
}
