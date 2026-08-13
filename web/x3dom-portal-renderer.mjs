import { PortalRenderer } from "./portal-renderer.mjs";
import { X3DOMRenderAdapter } from "./vendor/scene-core/render-adapter/x3dom-render-adapter.mjs";

const DEFAULT_CAPTURE_INTERVAL_MS = 1000; // ~1fps, per explicit user direction — Phase 0's
// spikes measured getScreenshot() at 69-103fps achievable in isolation but found severe
// contention once a second live WebGL context is polled concurrently with the main scene;
// throttling capture keeps portal previews well under that budget instead of polling every
// frame. Raised in stages after live-QA reports of the orbit camera feeling "not smooth" AND
// the portal aperture "flashing" (confirmed both real, not test artifacts): direct measurement
// (comparing onEnterFrame timing with capture() active vs. with the synchronous
// getScreenshot()/toDataURL() encode work stubbed out) showed capture cutting the worst-case
// frame gap roughly 4x at 100ms (933ms -> 246ms with 2 portals both eligible/capturing) — real,
// measurable main-thread contention. Separately, pixel-sampling the rendered aperture region
// over time at a 250ms interval found periodic drops to pure-black (0 brightness) correlated
// with each <imagetexture> url swap — consistent with X3DOM briefly rendering blank while
// decoding/uploading the newly-captured frame. 1s update cadence still reads as "live" to a
// player glancing at a portal, while cutting both the flash frequency and the main-thread
// contention further than the earlier 250ms step did. This is the main-thread-blocking half of
// the smoothness cost (PNG-encoding a captured frame), not the whole story: X3DOM's hidden
// destination hosts also keep rendering internally every frame regardless of capture cadence (no
// adapter API to pause a mounted <x3d> host's own render loop — a separate, stated, NOT-fixed-
// here limitation).

// X3DOM has no render-to-texture primitive, so the capture mechanism is necessarily different
// from ThreePortalRenderer: a second, hidden <x3d> host renders the destination content for real,
// and runtime.getScreenshot() (a synchronous data: URI capture) is polled on a timer and pushed
// into an X3D ImageTexture via X3DOMRenderAdapter.createUrlTexture()/updateUrlTexture() — directly
// from the data: URI getScreenshot() already returns, not round-tripped through an intermediate
// canvas (createCanvasTexture()/updateCanvasTexture() would decode it into an Image, redraw it
// onto a scratch canvas, and re-encode it a second time via toDataURL() for no benefit — a real,
// measured cost this used to pay on every single capture, cut out entirely 2026-08-13).
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
        // Disables X3D's automatic per-viewport headlight (on by default, never explicitly
        // disabled anywhere else in this app either — confirmed by grep) for the destination
        // preview specifically, not the main scene. Live-reported as "bleached out with light":
        // the destination camera (glued through the portal frames) frequently ends up close to
        // and near-perpendicular to flat destination-room geometry, where a camera-attached
        // headlight stacked on top of canonical-world-content.js's own ambient(0.75) +
        // directional(0.9) lights is far more visually dominant than the same stack is in the
        // main scene's normal room-scale camera movement.
        const navInfo = document.createElement("navigationinfo");
        navInfo.setAttribute("headlight", "false");
        adapter.sceneRoot.appendChild(navInfo);
        // X3DOM's own <x3d>-element discovery only runs once (at document load); an <x3d> element
        // created and attached afterward — exactly this adapter's case, since it always mounts
        // well after the main adapter's ready() has already resolved — is otherwise never picked
        // up and never gets a runtime. reload() is X3DOM's documented hook for exactly this.
        this._x3dom.reload();
        adapter.__portalHostEl = host;
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
        if (!destinationAdapter.__portalTexture) {
            destinationAdapter.__portalTexture = mainAdapter.createUrlTexture(dataUri);
        } else {
            mainAdapter.updateUrlTexture(destinationAdapter.__portalTexture, dataUri);
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
