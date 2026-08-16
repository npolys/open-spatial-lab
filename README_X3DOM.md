README — X3DOM Render Adapter
================================

Purpose
-------
This document summarizes the render-adapter architecture in this repository and documents the X3DOM-specific render adapter implementation. It explains how the engine-agnostic `RenderAdapter` boundary maps to both the `three.js` adapter and the X3DOM adapter, lists supported features and limitations, and gives integration/testing notes.

This is a structural/API reference. For feature status, history, and the honest performance/limitation writeups (including everything under "Portal-preview architecture" and "what's not included yet"), see the main [README.md](README.md)'s "Render-engine adapter (three.js + X3DOM)" section — that document is the actively maintained source of truth for project status; this one focuses on the API shape and file layout, which changes far less often.

**Architecture Overview**
- **RenderAdapter boundary**: a thin engine-agnostic interface (`runtime/scene-core/public/render-adapter/render-adapter.mjs`), an abstract base class whose methods throw `"not implemented"` — concrete engines override every method they support. It exposes scene lifecycle, camera/viewpoint, picking (`worldToScreen`, engine-specific pick methods), mesh/material/light construction, and transform helpers.
- **Concrete adapters**: `ThreeRenderAdapter` (`three-render-adapter.mjs`) implements the interface with direct `THREE.*` objects. `X3DOMRenderAdapter` (`x3dom-render-adapter.mjs`) implements the same interface using X3DOM DOM nodes and the `x3dom.runtime` API. Node/geometry/material/camera handles returned by either adapter are **opaque** to callers — application code never reaches into them expecting a specific engine's object shape (the interface's own header comment states this explicitly). A `raw` getter exists as a transitional escape hatch to the underlying engine namespace for code not yet fully ported off direct engine access; `X3DOMRenderAdapter.raw` returns `null` — X3DOM has no equivalent escape hatch.
- **Delivery**: there is no vendored/duplicated copy of the adapter files under `web/`. `src/serve.js` serves `runtime/scene-core/public/` live at the `/vendor/scene-core/` URL route, so both `web/` client code and the standalone spike pages under `web/x3dom-spikes/` import the same adapter source directly (e.g. `import { X3DOMRenderAdapter } from "/vendor/scene-core/render-adapter/x3dom-render-adapter.mjs"`).
- **Call sites**: scene construction and mesh-sync go through the adapter rather than importing `THREE`/`x3dom` directly wherever the code has been ported. Key shared (engine-agnostic) call sites: `runtime/scene-core/public/scene.js`, `runtime/scene-core/public/canonical-world-content.js`, `web/wow-scene.mjs`, `web/portal-render-controller.mjs`, `web/scene-runtime-controller.mjs`, `web/app.js`. X3DOM has its own parallel set of call sites (`web/x3dom-live-mode.mjs`, `web/x3dom-portal-traversal-glue.mjs`, `web/x3dom-airport-terminal-scene.mjs`, `web/x3dom-equipment-glue.mjs`, `web/x3dom-hud-glue.mjs`, `web/x3dom-peer-avatars-glue.mjs`, `web/x3dom-movement-camera-controller.mjs`) rather than fully sharing the three.js-path files — the two render paths are structurally parallel, not a single shared code path with an engine switch inside it.

**RenderAdapter — surface API (summary)**

Lifecycle: `mount(containerEl, options)`, `ready()` (resolves once the engine's runtime can actually render/pick/query — not a precondition for scene construction, which may proceed synchronously right after `mount()`), `resize()`, `dispose()`, `onEnterFrame(callback)`.

Camera: `createPerspectiveCamera({fov, aspect, near, far})`, `setCameraPose(camera, {position, lookAt})`, `worldToScreen(camera, worldPosition)` (returns `{x, y, visible}` in container-relative pixels, or `null`), `cameraDistanceTo(camera, worldPosition)`.

Scene graph: `createGroup(name)`, `add(parent, child)`, `remove(parent, child)`, `setName`, `setPosition`, `setRotationAxis`, `setLocalMatrix` (flat 16-element column-major matrix), `setScaleScalar`, `setVisible`, `setUserData`.

Geometry/material/mesh: `createGeometry(desc)` (`box`/`plane`/`circle`/`torus`/`capsule`/`sphere`/`cone`/`octahedron`/`cylinder`/`edges`/`points`), `createMaterial(desc)` (`standard`/`basic`/`line`), `createMesh(geometry, material)`, `setGeometry`, `createLineSegments`, `createLine`, `setMaterialProperty`, `recolorSubtreeMaterials`, `disposeGeometry`/`disposeMaterial`/`disposeNode`.

Assets/lights/misc: `createInlineAsset(url, options)` — loads an external asset (glTF today; `model/x3d+xml` where the WoW asset endpoint offers it) and returns `{node, ready}` (`node` available synchronously, `ready` a Promise resolving once content has actually loaded); `createColor`/`multiplyColorScalar`/`colorToHexString`; `createCanvasTexture`; `createSprite`; `createGridHelper`; `createAmbientLight`/`createDirectionalLight`; `setBackgroundColor`.

There is no `init(container, opts)`, `addMesh`/`removeMesh`/`updateTransform`, `setViewpoint`, generic `pick(clientX, clientY)`, or `createRenderTarget` on this interface — see the actual method list above and in the source file for the real, current API surface.

**X3DOMRenderAdapter — Implementation Notes**
- `sceneRoot` maps to the `<x3d><scene>` element's own root group. `<Inline>` elements load remote glTF/WoW-asset content — `createInlineAsset()` claims a slot from a pre-seeded, fixed-size pool (`runtime/scene-core/public/render-adapter/x3dom-inline-pool.js`, 32 slots by default, injected into `web/index.html`'s original static markup — see that file's own comment on why this must be part of the initial parse) rather than creating `<Inline>` elements ad hoc: X3DOM's `<Inline>` node only reliably loads when it's present in the page's original static parse, not when appended to a live document, so dynamically-created content is routed through this pool instead.
- Camera: uses `<Viewpoint>` nodes; `setCameraPose()` sets position/orientation directly (no automatic X3D navigation — that's disabled app-wide and replaced by this project's own movement/orbit controllers, matching the three.js path's own controller).
- Picking: `pickViewCenter()` raycasts from the exact center of the viewport via `x3dom.runtime.shootRay()` — a crosshair-style pick, not an arbitrary-coordinate click pick. There is no generic screen-coordinate pick method on this adapter.
- Render targets: X3DOM's `RenderedTexture` node (Texturing component) is a genuine GPU render-to-texture primitive, confirmed present and wired into the runtime's own per-frame update pass — not a CSS-overlay or `canvas.toDataURL()`/`getScreenshot()` polling fallback. `createRenderedTexture({dimensions, update, fov, near, far})` builds one with a nested `<Viewpoint>` (returned separately so callers can drive its pose every frame); `bindRenderedTextureScene(rt, targetEl)` binds its `scene` field to an isolated subtree via a direct JS node-reference assignment (not DOM `USE`/`DEF`, which was found unreliable for dynamically-created nodes at this app's real scale/concurrency). This is the actual mechanism behind the portal-preview aperture — see README.md's "Portal-preview architecture — RenderedTexture rewrite" section for the full story, including two real bugs found and fixed while building it.
- `createClipPlane({normal, constant, enabled})` wraps X3D's native `ClipPlane` node — used to bound the portal-preview aperture's visible radius, mirroring the three.js path's own spherical clip-plane volume with no math translation (X3D's `plane` field uses the identical `ax+by+cz+d≥0`-is-kept convention as `THREE.Plane`).

**Supported Features**
- Full scene graph construction/update (mesh add/remove/transform), matching the three.js adapter's own surface.
- Camera pose control and `worldToScreen` projection (used for on-screen aperture/HUD gating).
- Center-viewport raycast picking (`pickViewCenter`).
- Real-time render-to-texture via `RenderedTexture`, used for portal-preview apertures with live parallax as the player moves.
- Inline glTF/WoW-asset model loading, including real WoW API (OpenSpatialAsset) content negotiation for hosted scene objects, for both the active world and portal-preview destinations.
- Avatar rendering via `X3domGltfHumanoidProvider` (`web/x3dom-gltf-humanoid-provider.mjs`) — a Mixamo-rigged glTF avatar built the same way the three.js path's `three-vrm-humanoid-provider.mjs` builds its own, but with no skeletal animation playback (see Limitations).

**Limitations & Known Issues**
- No animation-mixer/skeletal playback: X3DOM's glTF importer generates real `TimeSensor`/`Interpolator` nodes for baked animation channels but has no skin/joint vertex-deformation support at all — confirmed a dead end for direct playback, not just unimplemented. Avatars and NPCs render in a static pose.
- Bone-level equipment attachment isn't implemented — equipment uses fixed anchor points, not the three.js path's real bone-tracking attachment.
- The portal preview's on-screen crop isn't pixel-perfect — the whole destination viewpoint's view is mapped onto the aperture, not a viewport-cropped window matching three.js's `Camera.setViewOffset`. Investigated (X3DOM's `Viewpoint.setProjectionMatrix()` is a real escape hatch for an off-axis frustum) but not solved — see README.md for the specific findings.
- The full inspector/debug panel and the airport HUD overlay's real storefront/traveler tag content aren't wired up under X3DOM (the underlying screen-projection mechanism works; only that specific content isn't built).
- The airport terminal's NPC/staff avatars and signed manifest-card billboards aren't built yet — the terminal's own structural geometry (walls, columns, storefronts, gate area, signage) is real and mounted.
- A small number of harmless `GL_INVALID_OPERATION`/benign X3DOM internal null-deref console messages can appear during specific boot/load windows — cosmetic only, documented and filtered in the regression suite (`KNOWN_BENIGN_ERROR_PATTERNS` in the relevant spikes).

**Integration Points & Files**
- Adapter interface (source): `runtime/scene-core/public/render-adapter/render-adapter.mjs`
- Three adapter (source): `runtime/scene-core/public/render-adapter/three-render-adapter.mjs`
- X3DOM adapter (source): `runtime/scene-core/public/render-adapter/x3dom-render-adapter.mjs`
- Served at runtime under `/vendor/scene-core/render-adapter/*` (see `src/serve.js`'s static route table — a live route to the source directory above, not a separate copy)
- X3DOM-specific call sites: `web/x3dom-live-mode.mjs` (entrypoint), `web/x3dom-portal-traversal-glue.mjs`, `web/x3dom-airport-terminal-scene.mjs`, `web/x3dom-equipment-glue.mjs`, `web/x3dom-hud-glue.mjs`, `web/x3dom-peer-avatars-glue.mjs`, `web/x3dom-movement-camera-controller.mjs`, `web/x3dom-gltf-humanoid-provider.mjs`, `web/x3dom-portal-hosted-objects.mjs`
- Inline-load pool: `runtime/scene-core/public/render-adapter/x3dom-inline-pool.js`, injected as a static `<script>` tag by `web/index.html` (must be part of the page's original parse — see that file's comment)

**How to enable / test the X3DOM adapter**
1. Install dependencies: `npm install` at repository root.
2. Start the demo: `npm start` (runs `launchOpenSpatialLab.sh`, which starts the frontend + all backend location servers).
3. Load the demo and either click the renderer-toggle button in the UI, or append `?renderer=x3dom` to the URL directly, or pre-seed `localStorage["osl-renderer-preference-v1"] = "x3dom"` — an explicit `?renderer=` query param always overrides the stored preference (see `web/demo-shell-bootstrap.mjs`).
4. Run the X3DOM-specific regression suite: `npm run render-adapter-check` (`node tools/verify-render-adapters.mjs`) — runs every spike under `tools/x3dom-spikes/` headlessly via Puppeteer and reports a pass/fail summary. `npm run verify` (release-check + demo-check) exercises the default three.js path only.

**Testing & Verification**
- `npm run render-adapter-check` is the authoritative X3DOM regression suite — covers scene construction, camera/movement, portal traversal, equipment anchors, the Inline-load queue, HUD projection, peer avatars, the renderer-selector UI, and the full `RenderedTexture` portal-preview mechanism (feasibility, adapter primitive, zNear/zFar handling, orientation/flip correctness).
- `npm run verify` (`release-check` + `demo-check`) exercises the default (three.js) path and file-manifest integrity; it does not currently include the X3DOM suite.
- Individual spikes can be run directly, e.g. `node tools/x3dom-spikes/spike-run-x3dom-portal-preview.mjs`, against a locally running server (`npm start` first).
