# Open Spatial Lab

Open Spatial Lab is a local Web of Worlds and spatial-computing demo. From the player lobby and launcher, an avatar can move among three authored Three.js destinations—Location A, Location B, and Denver Skyport—while preserving supported identity, equipment, pose, and portal state.

## Included

- Player lobby and mission launcher
- Three authored Three.js destinations: Location A, Location B, and Denver Skyport
- Denver Skyport access through the lobby's Portal C path
- Local world servers and a one-command launcher
- Selectable avatars and equipment
- Included models, textures, procedural animation, and runtime assets
- Portal navigation and player-state continuity
- Automated integrity and browser verification commands

## Requirements

The tested setup is macOS 13 or newer with:

- Git; the public workflow has been verified with Git 2.33.0
- Node.js 22.x
- npm 10.x
- Bash, `curl`, and `lsof`
- A current Google Chrome, Chromium, Brave, or Microsoft Edge browser

Check the required command-line tools before cloning:

```bash
git --version
node --version
npm --version
command -v curl
command -v lsof
```

If Node.js 22.x and npm 10.x are not installed, select the 22.x release from the [official Node.js download page](https://nodejs.org/en/download).

## Repository layout

- `src/` — local frontend server and topology orchestration
- `runtime/` — local world-server and scene runtime, including `runtime/scene-core/public/render-adapter/` (see [Render-engine adapter](#render-engine-adapter-three-js--x3dom-in-progress) below)
- `web/` — browser demo, authored worlds, and included runtime assets
  - `web/x3dom-spikes/` — throwaway verification pages for the in-progress X3DOM port; not part of the shipped demo
- `wow-spec/` — Web of Worlds schema and validation code
- `tools/` — launcher helpers and public verification scripts (`verify-release.mjs`, `verify-demo.mjs`, `verify-render-adapters.mjs`, `verify-wowapi-smoke.mjs` — see [Verification](#verification))
  - `tools/x3dom-spikes/` — Puppeteer runners for the pages in `web/x3dom-spikes/`
- `licenses/` — third-party asset and library license texts

## Quick start

Use the following commands as the required first-run path; there is no separate build or preflight step.

```bash
git clone https://github.com/grigb/open-spatial-lab.git
cd open-spatial-lab
npm ci
npm start
```

No build step or configuration file is required. Startup completes with a receipt similar to:

```text
Open Spatial Lab is ready.
Launcher:            http://127.0.0.1:8143/
Lobby player:        http://127.0.0.1:8143/index.html?role=player&intro=bypass
Location A observer: http://127.0.0.1:8143/index.html?role=source&intro=bypass
Location B observer: http://127.0.0.1:8143/index.html?role=target&intro=bypass
```

Open the launcher URL in a supported browser.

## Five-minute demo

1. On the launcher, choose **Enter as Player** to enter the lobby. Select **Start exploring** if the orientation card appears.
2. Move with `W`, `A`, `S`, and `D`. Hold `Shift` to run, press `Space` to jump, drag to look around, scroll to zoom, and press `C` to switch camera view.
3. Choose **Switch avatar**, select an included avatar, one worn item, and one held item, then choose **Apply**. Continue moving to see the selection remain with the player.
4. Walk through a lit portal; crossing is automatic. Visit Location A and Location B and compare their scenes and local models.
5. Return to the lobby and walk through Portal C to enter Denver Skyport. Use its return portal to continue the journey.
6. Open **Views** to return to the launcher. Open the Location A and Location B observer views to show the two local world servers.

## Controls

- Walk: `W`, `A`, `S`, `D`
- Run: hold `Shift` while moving
- Jump: `Space`
- Look/orbit: drag the primary mouse button or use a one-finger drag
- Zoom: mouse wheel or trackpad scroll
- Camera: `C` or the camera button
- Portal: walk through a lit portal; no extra command is needed
- Launcher: arrow keys to move, `Home`/`End` for first/last, `Enter` or `Space` to open, and mouse selection
- Avatar selector: **Switch avatar**, choose an avatar plus one worn and one held item, then **Apply**; `Escape` or **Cancel** discards pending changes

## Verification

Four independent commands cover different layers of the system. All are run from the repository root, all are self-contained (each starts and stops its own local topology as needed), and none require a build step.

| Command | What it checks | Needs a browser? | Typical run time |
| --- | --- | --- | --- |
| `npm run verify` | Full public release check (below) | Yes | ~1–2 min |
| `npm run render-adapter-check` | In-progress X3DOM render-engine-adapter work (below) | Yes | ~1–2 min |
| `npm run wowapi-smoke-check` | WoWAPI HTTP surface conformance (below) | No | a few seconds |
| Individual spike pages (below) | One piece of the adapter work at a time | Yes | seconds each |

### `npm run verify` — full public release check

```bash
npm run verify
```

This is `npm run release-check` (verifies the packaged file tree against `RELEASE-MANIFEST.json`, scans for forbidden paths/secrets, checks the browser/module import closure resolves) followed by `npm run demo-check` (starts the local topology, drives the launcher and both world scenes in a real headless browser — lobby → avatar selection → Portal C → Denver Skyport → back → Location A ↔ Location B portal crossings — and checks included assets), each runnable on its own too. A successful run ends with `PASS: Open Spatial Lab verification complete`. Run `npm start` afterward to resume the demo.

If `RELEASE-MANIFEST.json` drifts out of sync with the actual file tree (a real file-count/hash mismatch, not a false positive — it happens whenever files are added, removed, or edited without regenerating it), run:

```bash
npm run generate-release-manifest
```

`tools/generate-release-manifest.mjs` recomputes every file's size/hash, keeps existing entries' `classification`/`license` metadata as-is, and classifies genuinely new files by matching this manifest's own established conventions (see the script's header comment for the exact rules) rather than guessing — it will refuse to classify a new file it doesn't have a rule for, on purpose, rather than silently mis-tagging it. It also deliberately excludes `.claude/` (local tooling/session config) and `NNotes.txt` (the repo owner's own working notes) from the release tree, same as `.git`/`node_modules`/`.runtime` — `tools/verify-release.mjs`'s own file walk excludes the same paths, so the two stay in agreement. `demo-check` never reads the manifest, so it's unaffected either way.

`release-check`'s import-closure scanner also treats any `vendor/` directory (e.g. `runtime/scene-core/public/vendor/three/`, `.../vendor/x3dom/`) the same way it already treats `node_modules/`: a vendored bundle is confirmed *reachable* from a real reference, but not deep-scanned for its own internal `require()`/`import()`-shaped text — large, non-ES-module third-party bundles can contain benign feature-detection code (X3DOM's vendored build has a `try`/`catch`-wrapped `require("vertx")` from a bundled promise-scheduling shim, checking for a Vert.x JS runtime — real, and expected to throw everywhere else) that isn't an actual import needing local resolution. Worth knowing if a future vendor library trips the same false positive.

### `npm run render-adapter-check` — render-engine adapter regression suite

```bash
npm run render-adapter-check
```

A separate, smaller regression suite for the in-progress render-engine-adapter work described in [Render-engine adapter](#render-engine-adapter-three-js--x3dom-in-progress) below — `ThreeRenderAdapter`/`X3DOMRenderAdapter`, `HumanoidProvider` (including equipment attachment), `PortalRenderer`, and the live app's `?renderer=x3dom` preview mode. Not part of `npm run verify` since the shipped demo only ever runs `ThreeRenderAdapter` by default. It launches the demo, batch-runs every spike page below that has a real pass/fail verdict (one Puppeteer script per spike, `tools/x3dom-spikes/spike-run-*.mjs`), and reports a summary — the same shape as `npm run verify` but scoped to this in-progress work. It deliberately excludes a handful of diagnostic/negative-result pages and fps-measurement spikes that don't have a pass/fail verdict (see `tools/verify-render-adapters.mjs`'s own comments for the current list and why).

**How the renderer is selected:** it's a `renderer` query-string parameter on the world URL, read once at boot by `web/demo-shell-bootstrap.mjs` — there's no in-app UI toggle. Leaving it off (or any value other than `x3dom`) loads the default, fully-featured three.js renderer (`app.js`). Adding `?renderer=x3dom` loads the separate, deliberately-scoped X3DOM preview path (`x3dom-live-mode.mjs`) instead.

**To try the live X3DOM preview yourself:** `npm start`, then open `http://127.0.0.1:8143/index.html?renderer=x3dom&role=player&active=a&intro=bypass` — WASD to move, drag to look around. Real environment, real backend-connected avatar, real movement; see the "X3DOM preview mode" bullet below for exactly what is and isn't included.

**To explore or debug one piece at a time:** the pages under `web/x3dom-spikes/` are standalone test harnesses (not part of the demo's normal navigation) — open one directly in a browser, e.g. `http://127.0.0.1:8143/x3dom-spikes/spike-x3dom-canonical-scene.html`, after `npm start`. Each has a matching headless runner under `tools/x3dom-spikes/` that drives the same page via `puppeteer-core` and prints a pass/fail result:

```bash
node tools/x3dom-spikes/spike-run-canonical-x3dom.mjs
node tools/x3dom-spikes/spike-run-x3dom-live-mode.mjs   # drives the real ?renderer=x3dom entry point, not a spike page
# etc. — one spike-run-*.mjs per spike-x3dom-*.html page, plus spike-run-asset-negotiation.mjs (pure HTTP, no page)
```

These need a browser findable via `PUPPETEER_EXECUTABLE_PATH`, or one `tools/find-browser.mjs` can locate automatically (same detection every command in this table uses, including Linux/WSL Chrome-for-Testing installs). Some pages (the `spike-x3dom-inline-*` diagnostic set) intentionally demonstrate a *failing* case as evidence of a real X3DOM constraint documented below — not regressions, and excluded from `render-adapter-check`'s pass/fail batch for that reason.

### `npm run wowapi-smoke-check` — WoWAPI conformance smoke tests

```bash
npm run wowapi-smoke-check
```

A fast, pure-HTTP (no browser) smoke-test suite for the WoWAPI surface itself, checked against the actual upstream OpenAPI YAMLs (webofworlds.github.io/WoWAPI/specification/*/API.yaml), not assumed:

- **Service availability** — `/healthz` on every local backend.
- **Auth/authorization**, using real cases from the live scene — 403 (restricted asset, no token), 404 (hidden asset — existence concealed, per the OpenSpatialAsset spec's own contract), 406 (unacceptable negotiated media type). This API has no 401 path — nothing here requires a session just to attempt a request.
- **Contract validation** for world/user/view/portal/spatial resources, reusing the server's own `X-OSL-WoW-Validation` response header (the same mechanism `npm run demo-check` relies on).
- **Both real write operations** the OpenSpatialWorld spec defines: a full CRUD lifecycle (create → read-back → update → delete → verify-gone) against `/wow/spatial/{spatialID}/node/{nodeId}`, and `DELETE /wow/user/{userId}` — deleting this location's own hosted embodied identity correctly 400s (no safe stateless-DELETE interpretation of your own live session), while a real presence-registry user round-trips through register → read → delete → verify-gone → idempotent-second-delete, reusing the exact removal path (`departPresence()`) a self-initiated departure already uses.
- **Error handling** for unknown IDs and unsupported methods, **cross-service checks** (World → Asset, Portal → destination World, User Manifest → World), **data consistency** (a portal's declared destination matches what that destination reports about itself), and a pure-HTTP **golden path** (load manifest → enumerate portals → open world graph → resolve and fetch a referenced asset).

`OpenUserManifest` and `OpenSpatialAsset` are read-only by spec (GET/HEAD only) — this repo matches that, so search/discovery is the only genuinely not-applicable section (no such endpoints exist anywhere in the three specs). Kept separate from `npm run verify` for the same reason as `render-adapter-check`: different concern, no browser needed, runs in seconds. See `tools/verify-wowapi-smoke.mjs`'s own header comment for the full breakdown of what maps cleanly to this repo's real endpoints and what doesn't.

## Stop and clean up

```bash
npm stop
```

The command stops the frontend and every local world server, removes runtime PID files, and releases ports `8143` and `18151`–`18154`.

For a clean restart, including after a partial startup, run:

```bash
npm stop
npm start
```

## Troubleshooting

- **Unsupported Node or npm:** confirm `node --version` is 22.x and `npm --version` is 10.x.
- **Install fails:** confirm network access, remove `node_modules`, and run `npm ci` again.
- **A port is occupied:** run `npm stop`. If the message identifies an unrelated process, stop that application or choose another machine.
- **A page looks stale:** perform a hard refresh in the browser.
- **A service is not ready:** run `npm stop`, then `npm start` and use the newly printed URLs. The supported topology has exactly five listeners: frontend `8143` and world servers `18151`–`18154`.
- **Browser verification cannot find Chrome:** set `PUPPETEER_EXECUTABLE_PATH` to a compatible browser executable and rerun `npm run verify`.
- **`npm run release-check` reports a file-count or hash mismatch:** `RELEASE-MANIFEST.json` is out of sync with the actual file tree — run `npm run generate-release-manifest`, review the added/changed/removed list it prints, then rerun `npm run release-check`.

## Render-engine adapter (three.js + X3DOM, in progress)

Scene-construction code (`web/wow-scene.mjs`, `runtime/scene-core/public/canonical-world-content.js`, `web/scene-runtime-controller.mjs`, and the construction-shaped parts of `web/portal-render-controller.mjs`/`web/app.js`) no longer imports three.js directly. It goes through an engine-agnostic `RenderAdapter` interface (`runtime/scene-core/public/render-adapter/render-adapter.mjs`), with `ThreeRenderAdapter` as the concrete implementation the shipped demo actually uses by default. This is groundwork for an optional [X3DOM](https://www.x3dom.org/) render engine — `X3DOMRenderAdapter` exists and is verified for the pieces built so far, and there is now a real, user-facing (if deliberately scoped) way to select it: `?renderer=x3dom`. See "X3DOM preview mode" below for exactly what that does and doesn't include; the default (no query param) experience is unaffected — verified by running the full `npm run demo-check` suite unchanged after every change described here.

**Minimal usage example** — the same construction call sequence against both engines. `mount()` is always synchronous on both adapters (scene-graph construction can start immediately after); `ready()` is a separate `Promise` you only need to await for operations that require a *live* engine runtime (picking, screenshots, camera/backend queries) — X3DOM's runtime attaches asynchronously after `mount()`, three.js's doesn't, so `ready()` resolves immediately there but is still safe (and correct) to await unconditionally in shared code:

```js
import { ThreeRenderAdapter } from "/vendor/scene-core/render-adapter/three-render-adapter.mjs";
import * as THREE from "/vendor/scene-core/vendor/three/three.module.js";

const adapter = new ThreeRenderAdapter(THREE);
adapter.mount(document.getElementById("mount"), {
  camera: { fov: 50, near: 0.1, far: 100 },
});

const box = adapter.createMesh(
  adapter.createGeometry({ type: "box", width: 1, height: 1, depth: 1 }),
  adapter.createMaterial({ type: "standard", color: 0xff3333 }),
);
adapter.setPosition(box, 0, 0.5, 0);
adapter.add(adapter.sceneRoot, box);

await adapter.ready(); // resolves immediately for three.js
```

```js
import { X3DOMRenderAdapter } from "/vendor/scene-core/render-adapter/x3dom-render-adapter.mjs";
// window.x3dom must already be loaded via a <script src=".../x3dom-full.js"> tag — X3DOM has no ES module build.

const adapter = new X3DOMRenderAdapter(window.x3dom);
adapter.mount(document.getElementById("mount"), {
  camera: { fov: 50, near: 0.1, far: 100 },
});

const box = adapter.createMesh(
  adapter.createGeometry({ type: "box", width: 1, height: 1, depth: 1 }),
  adapter.createMaterial({ type: "standard", color: 0xff3333 }),
);
adapter.setPosition(box, 0, 0.5, 0);
adapter.add(adapter.sceneRoot, box); // construction works immediately — no need to wait for ready() here

await adapter.ready(); // now needed: waits for the X3DOM runtime to attach to the mounted <x3d> element
console.log(adapter.runtime.backendName());
```

Both blocks above call the exact same six `RenderAdapter` methods in the exact same order — that parity is what the `web/x3dom-spikes/*.html` harnesses (below) check against a live headless browser, not just read from source. The one asymmetry worth calling out: loading external content (glTF avatars/assets via `createInlineAsset()`) is **not** symmetric — see the Inline-pool constraint below, which only applies to `X3DOMRenderAdapter`.

**What's verified so far**, each checked against a live X3D scene in headless Chrome (see below for how to reproduce). These split into two groups that are easy to conflate, so they're kept explicit:

*Verified, AND genuinely reachable from the live app's real code paths* (the live app calls these functions today, on `ThreeRenderAdapter` — swapping the adapter these receive is the actual remaining work, not building new functionality):
- Scene construction: groups, primitive geometry, materials, lights, and the WoW composition-graph builder (`buildWowScene`), including exact world-position math through composed transforms. Called live by `runtime/scene-core/public/canonical-world-content.js`'s consumer (`runtime/scene-core/public/scene.js`'s `WebGLScene._buildRoom()`) for the normal boot path, and by `web/scene-runtime-controller.mjs` (`mountLiveAuthoredAirport`, `recomposeLive`, portal-preview composition) and `web/app.js`'s `mainWowRead()` for WoW-graph boot paths.
- Loading external glTF assets referenced by a WoW composition graph (`mountWowSceneAssets`), including correct failure handling (a bad URL keeps a labeled, recolored placeholder rather than failing silently), and world-space bounding-box/distance measurement (`visible_bounds_world`/`bounds_center_distance_m`) — `X3DOMRenderAdapter.measureWorldBounds()`/`getWorldPosition()` compose `runtime.getBBox()` (which, confirmed empirically, returns a node's bounds already transformed by its own transform but expressed in its *parent's* local frame, not full world space) with the parent's own accumulated world matrix (`_x3domNode.getCurrentTransform()`) to get true world-space bounds; verified against a real loaded glTF's known authored position. Same live call sites as above.

*Genuinely live now, but only ever fed a three.js adapter today* — a middle category between the two above: the real, live-app component has been refactored to call the adapter method instead of raw THREE calls, and is now internally engine-agnostic, but its one call site still only ever constructs a `ThreeRenderAdapter`, so nothing X3DOM-shaped actually reaches it yet:
- World-to-screen projection and camera distance for the airport terminal's DOM-overlay HUD (`web/hud/airport-hud-overlay.mjs`) — refactored off raw `THREE.Vector3.project()`/`camera.position.distanceTo()` onto `adapter.worldToScreen()`/`cameraDistanceTo()`, verified against the full live-app regression suite (`npm run demo-check`, which already drives the lobby → Portal C → airport-terminal path this HUD renders in). Its one call site, `web/airport-terminal-scene.mjs`, constructs a throwaway `ThreeRenderAdapter` (that file is otherwise entirely THREE-only — box/sign meshes built with raw THREE — so this is a step toward reachability, not full reachability). Needed a small, non-interface `ThreeRenderAdapter.attach(containerEl)` addition alongside this: `worldToScreen()` reads size from an adapter's tracked mount element, which a throwaway (never-`mount()`ed) instance doesn't have — `attach()` binds one without creating a second renderer, the three.js-side analog of why `X3DOMRenderAdapter.attach()` exists.

Third-person orbit camera math (`web/orbit-camera-controller.mjs`'s `stepOrbitCamera`/`seedOrbitCamera`/`computeOrbitCameraPose` — the pure, engine-agnostic functions, not the adapter-bound `createOrbitCameraController` wrapper) is now genuinely called by the live app's real third-person camera in `web/movement-camera-controller.mjs`, verified against the full live-app regression suite (`npm run demo-check`, including portal crossings, which exercise `seedOrbitCamera`'s camera-remap path — the crossing-remap math itself, `crossingYawDeltaRad`/`mapCameraAcrossCrossing` in `web/live-adapter-portal-geometry.mjs`, had no three.js dependency to begin with and needed no porting). This needed care, not a drop-in swap: `movement-camera-controller.mjs`'s `orbitCamera` state keeps its `focus` field as a mutable `THREE.Vector3` (occlusion, session-persistence, and first-person code elsewhere in the same file all read it that way), while the pure module's state uses a plain `[x,y,z]` array — the three delegating call sites convert at that boundary rather than changing `orbitCamera`'s shape file-wide. `movement-camera-controller.mjs` remains otherwise entirely three.js — first-person head attachment, the two occlusion raycasters, and applying the computed pose via `camera.position.set()`/`camera.lookAt()` are all still raw THREE, and the file constructs no render adapter at all — so, like the HUD case above, this is real progress toward reachability, not reachability itself. Portal-crossing remap in *first-person* mode specifically remains three.js-only, tied to first-person head-attachment (see below).

*Verified in isolation only — no live-app code path uses these today*, which matters because it means "verified" here means "this piece works correctly on its own," not "this piece is one flag-flip away from running in the live app":
- `X3DOMRenderAdapter.pickViewCenter()` — picks whatever's at the exact center of the current camera view and returns its distance, for camera-wall/portal-aperture-style occlusion checks. Built on `runtime.shootRay(x, y)`, a real, synchronous Runtime method found in the vendored source (not in X3DOM's own documented API — the documented picking system is DOM-event-driven with no arbitrary-point query) and verified against known geometry: detects a wall, correctly stops detecting it once hidden via X3D's `render="false"` (X3DOM's own render-inclusion toggle — confirmed empirically, not three.js's `.visible`), reveals what's behind it, and re-detects it on restore. Deliberately narrower than a generic raycast: X3DOM has no way to test an arbitrary 3D segment, only "what's at this canvas pixel right now" — which is sufficient for movement-camera-controller.mjs's actual use case (both occlusion checks always test the camera's own current view center in third-person mode) but would be wrong to use for anything else. Not wired into `movement-camera-controller.mjs`'s actual occlusion functions yet — that file has no render-adapter concept at all today, and camera-wall/portal-aperture occlusion's *implementation* (not just its final decision) is inherently engine-specific (THREE.Raycaster vs. this), so wiring it in is gated on Phase 7-style live-app integration, not just picking an adapter.
- Avatar loading: `HumanoidProvider` (`web/humanoid-provider.mjs`) plus `ThreeVrmHumanoidProvider` and `X3domGltfHumanoidProvider` — spawning a real, multi-mesh avatar glTF (not a placeholder) and disposing it cleanly, on both engines. The live app's actual avatar system, `AvatarEquipmentLayer` (`web/avatar-equipment-layer.js`), does not use `HumanoidProvider` — it's a fully separate, self-contained three.js pipeline (own renderer, own GLTFLoader/VRM loading, equipment attachment, procedural locomotion retargeting) that `HumanoidProvider`'s spawn/position/dispose surface doesn't replicate.
- `HumanoidProvider.attachItem()`/`detachItem()` — root-level equipment attachment (load an item asset, apply a local transform, parent it onto the avatar), verified to actually track the avatar's movement afterward (proving real scene-graph reparenting via `RenderAdapter.add()`/`setLocalMatrix()`, not just a spawn-time coincidence), with clean pool-slot release on both engines. Investigated what full `AvatarEquipmentLayer` parity would take first (see `web/avatar-equipment-layer.js`, 1709 lines): equipment attachment mechanically *is* just scene-graph reparenting, so it generalizes cleanly — but real locomotion/run-foot-IK parity would mean building actual X3D H-Anim bone animation, which the whole `HumanoidProvider`/`RenderAdapter` split was deliberately designed to leave for later (see the H-Anim note below), so it's out of scope here. This covers the load+parent+position mechanics only, deliberately root-level (no bone targeting) — not equipment-layer feature parity, and not wired into `AvatarEquipmentLayer` itself (which, like the pieces above, isn't reachable from the live app). `attachItem()` takes an opaque `url` and hands it straight to `createInlineAsset()`, so it's format-agnostic already — X3D's `<Inline>` loads glTF and native X3D identically by URL, no glTF-specific assumption anywhere in this path. What it does *not* do is decide which format to ask for: `web/assets/equip-catalog.json`'s `assetUri` fields are hardcoded single-format `.glb` paths today, not resolved through `/wow/asset/<id>`'s real content negotiation (see the content-negotiation gap below) — so there's no live equipment reference that would ever actually resolve to an X3D asset yet. Per the WoW spec, equipment is meant to be asset-resolved (glTF or X3D) rather than hardcoded to one format; wiring that resolution up is the same deferred work as the content-negotiation gap below, just for equipment specifically, not a new gap.
- Portal-preview capture-and-display loop: `PortalRenderer` (`web/portal-renderer.mjs`) plus `ThreePortalRenderer` (render-to-target, reusing the main adapter's single `WebGLRenderer`) and `X3DOMPortalRenderer` (`getScreenshot()`-polling into an X3D `ImageTexture`, throttled to ~10fps) — rendering a live destination scene off-screen and displaying it on an aperture mesh in the main scene, on both engines. `web/portal-spatial-preview.mjs`'s `SpatialPortalPreviewManager`, the live app's actual portal-preview system, does not use `PortalRenderer`.

**A real X3DOM constraint that shapes several of the pieces above — worth understanding before touching this code:** X3DOM's `<Inline>` node (how it imports glTF/X3D content) only reliably completes its *first* load when declared in the page's static HTML markup — a node built via `document.createElement()` at runtime, in any ordering, never loads (confirmed empirically across ~10 variations, two X3DOM versions, and it matches the fact that no official X3DOM example ever shows Inline created dynamically). A node that *has* completed one real load, though, can have its `url` attribute swapped freely and reliably reloads with new content. `runtime/scene-core/public/render-adapter/x3dom-inline-pool.js` works around this: a fixed pool of 32 `<Inline>` slots, declared via `document.write()` (so they're part of the same parse-time markup stream X3DOM needs) and pre-seeded with a placeholder glTF so each one gets its required first load. `X3DOMRenderAdapter.createInlineAsset()` claims a free slot and swaps its `url` to the real target instead of creating a node from scratch; `disposeNode()` resets it to the placeholder and returns it to the pool. Fixed at 32 for now — WoWAPI-side content packing is expected to keep concurrent demand well under that, so a host-capability-scaled pool wasn't needed. One more X3DOM quirk found along the way: the `<Inline>` element needs a `nameSpaceName` attribute to load reliably at all — every test that had one succeeded, every one that omitted it failed, independent of every other variable.

**A second, related X3DOM constraint (found building `X3DOMPortalRenderer`):** X3DOM's discovery of `<x3d>` elements themselves also effectively only runs once, near document load — a *second* `<x3d>` element created and attached well after the page has settled (e.g. `X3DOMPortalRenderer`'s hidden off-screen destination host, mounted long after the main adapter's `ready()` has already resolved) never gets a `runtime` attached and its `X3DOMRenderAdapter.ready()` call times out. Unlike the Inline-node constraint, X3DOM ships a documented fix for exactly this: `x3dom.reload()`, called once right after the second `<x3d>` element is attached — `X3DOMPortalRenderer.createDestinationAdapter()` does this. Worth remembering if any future code mounts more than one `X3DOMRenderAdapter` on the same page.

**A third X3DOM constraint (found building `pickViewCenter()`):** X3DOM's *documented* picking system (`pickMode`, the picking tutorials at doc.x3dom.org) is entirely DOM-event-driven — `onclick`/`onmouseover` handlers receiving `event.hitPnt` — with no way to just ask "what's at this point" synchronously. The Runtime API doc page documents `getViewingRay(x, y)` (returns a ray, not a hit) but nothing that resolves a hit directly. `runtime.shootRay(x, y)` does exactly that — it's real, public (`x3dom.Runtime.prototype.shootRay`), and synchronous, but doesn't appear on the documented Runtime API page at all; found by reading the vendored source (X3DOM's own internal walk-navigation collision system uses it, at the screen-center pixel, for exactly the same reason `pickViewCenter()` does) and confirmed empirically against known geometry before relying on it.

**X3DOM preview mode — a real, working, but deliberately scoped renderer selector**, reachable at `?renderer=x3dom` on any world URL (e.g. `http://127.0.0.1:8143/index.html?renderer=x3dom&role=player&active=a&intro=bypass`):
- The `<x3d>` host and Inline slot pool are injected via `document.write()` from a classic `<script>` inside `#scene-mount` in `index.html`'s own static markup — the only point synchronous enough to satisfy the Inline-pool constraint above, since `web/demo-shell-bootstrap.mjs` (a module script) runs too late for `document.write()` to still work. Absent the query param, this is a complete no-op — nothing extra is parsed, fetched, or loaded, and the default path is unaffected (verified: the full `npm run demo-check` suite passes unchanged).
- `demo-shell-bootstrap.mjs` reads the same query param and imports a new, self-contained module, `web/x3dom-live-mode.mjs`, *instead of* `app.js` — a parallel boot path, not a refactor of the three.js one. `app.js`, `runtime/scene-core/public/scene.js`, `scene-runtime-controller.mjs`, `movement-camera-controller.mjs`, and `avatar-equipment-layer.js` are all completely untouched by this mode.
- What's real here, not just present: `mountCanonicalWorldContent` renders the actual environment via `X3DOMRenderAdapter`; a real `LiveAdapter` (the same 4830-line backend session client the three.js path uses — confirmed zero three.js dependency by reading its source, so it's reused as-is here, not ported) connects to the real backend, registers presence, and fetches the real WoW graph; a real avatar loads via `X3domGltfHumanoidProvider`; WASD input calls the real `LiveAdapter.stepAvatar()` (the same method the three.js path calls) every frame, and the resulting position drives both the avatar (`HumanoidProvider.setPosition`) and a third-person orbit camera (`orbit-camera-controller.mjs`, plus basic mouse-drag look control). Verified end-to-end: `tools/x3dom-spikes/spike-run-x3dom-live-mode.mjs` confirms a real backend connection, WASD actually moving the avatar (a real X3D DOM `translation` attribute change, not just internal state), and the camera following — not just that the pieces are present.
- What's excluded, on purpose, matching the "not yet ported" bullets below: equipment, portal traversal/crossing, first-person mode, the two occlusion systems, and the HUD. None of `AvatarEquipmentLayer`'s or `movement-camera-controller.mjs`'s richer behavior is reachable from this mode — a banner in the UI says so.
- One known visual imperfection, not chased down: the loaded avatar renders with an extra, unexplained shape around the torso in X3DOM that three.js doesn't show — most likely an X3DOM glTF-skinned-mesh import limitation, not a bug in this session's code (X3DOM's glTF importer has known gaps around skinning); the avatar is still clearly recognizable and correctly positioned/scaled, and movement/camera-following are unaffected.

**Explicitly not yet ported** — these remain three.js-only, tracked as follow-up work, not silently dropped:
- First-person camera (including first-person-mode portal-crossing correction) and the *implementation* of the two raycasting-based occlusion systems (camera-wall, portal-aperture) in `web/movement-camera-controller.mjs` — `X3DOMRenderAdapter.pickViewCenter()` (above) provides the underlying capability, verified in isolation, but isn't wired into these functions yet.
- Everything in `web/portal-spatial-preview.mjs`'s `SpatialPortalPreviewManager` beyond the capture-and-display loop covered above: avatar culling inside the portal aperture, the radial clip-plane geometry, shared-edge identity validation, and destination-ring dressing all stay three.js-only — `PortalRenderer` is deliberately scoped to "render a destination scene to a texture and show it," not a port of that whole class.
- Full avatar feature parity — locomotion, run/jump animation, bone-specific equipment attachment, and the run-foot IK solver (`web/avatar-equipment-layer.js`'s complete feature set) stay three.js-only; the `HumanoidProvider` work above covers spawning/positioning/disposing a real avatar model plus root-level equipment attachment on both engines, not the rest of that behavior. Real locomotion parity would mean building actual X3D H-Anim bone animation — out of scope for the same reason H-Anim was deferred everywhere else in this section.
- A renderer selector that reaches the *existing* live-app code paths (`app.js`'s `main()`/`mountLive()`/`mainWowRead()`, `scene.js`'s `WebGLScene`) rather than a parallel one. `?renderer=x3dom` (above) solves the practical goal — a real, working, backend-connected X3DOM preview — via a self-contained alternate boot path instead, specifically to avoid the risk of threading an engine choice through those three independent, already-complex THREE-specific call sites (each would need its own conditional branch, and `scene.js` in particular imports its own bundled three.js copy independently of everything else). Revisiting this only makes sense once enough of the pieces below (equipment, movement, portal preview) are real enough that the existing code paths would gain something from it that the parallel mode can't already show.
- A client consumer of the WoW asset endpoint's content negotiation. `runtime/world-server/src/wow-media-types.js`'s `negotiate()` (real Accept-header, RFC-7231-style negotiation, not a stub) and `/wow/asset/<id>` already serve `model/x3d+xml` as a peer format alongside `model/gltf+json`/`model/obj`/`model/stl`/`model/vnd.usda` for hosted primitives — verified directly with `node tools/x3dom-spikes/spike-run-asset-negotiation.mjs` (a plain HTTP check, no browser: confirms `Accept: model/x3d+xml` returns real, well-formed X3D XML, `Accept: model/gltf+json` returns real glTF JSON, an unacceptable type gets a 406, and the existing 403/404 authorization arms are undisturbed). But **nothing in the client calls this endpoint at all**, on either engine — `mountWowSceneAssets` only ever fetches literal external glTF URLs (single fixed representation, nothing to negotiate), and hosted primitives (`syncHostedSceneObjectMeshes`) are built directly from JSON shape descriptors, never fetched as glTF/X3D bytes. Routing either of those through the negotiated endpoint with an engine-appropriate `Accept` header would be new client plumbing, not a header added to an existing call — deliberately not built yet.

`X3DOMRenderAdapter` now has an `attach(x3dEl, options)` method alongside `mount()` — it binds to an `<x3d>` element that's already part of the page's *static* markup (required for the Inline pool above to work) instead of creating a fresh one, reusing an already-authored `<scene>`/`<viewpoint>` if present. All test harnesses that used to poke `adapter._x3dEl`/`_sceneEl`/`_dispatchEnterFrame` directly (a stopgap noted in earlier versions of this section) now use `attach()` instead — see `web/x3dom-spikes/spike-x3dom-attach.html` for the isolated verification (proves `ready()` resolves without needing `x3dom.reload()`, unlike the second-`<x3d>`-element case above, since a statically-declared element is already part of X3DOM's normal one-time discovery).

Avatars are deliberately kept decoupled from `RenderAdapter` (their own `HumanoidProvider` interface, not routed through the environment renderer) so a future implementation can target [H-Anim](https://www.web3d.org/documents/specifications/19774-1/V2.0/index.html) independently — `X3domGltfHumanoidProvider` above is a direct glTF-loading implementation, not an H-Anim one, and both are expected to coexist.

**To run or explore any of this**, including trying the live X3DOM preview yourself and running individual spike pages, see "`npm run render-adapter-check` — render-engine adapter regression suite" in the [Verification](#verification) section above.

## Planned improvements

These are future enhancements, not additional setup steps for the current demo, and no delivery dates are promised.

- Smoother continuous portal transitions and automatic two-way return paths
- Deeper Denver Skyport continuity and multi-world presence
- Clearer navigation, a more focused home launcher, and a spatial avatar carousel
- User, avatar, and storefront identity profiles with previews and proximity exchange
- Richer airport experiences, including interactive storefronts, a Gate A12 journey, and moving travelers
- Airport localization, spatial-content discovery, and augmented-reality overlays
- Broader multi-machine, real-device, unhappy-path, and sample-world coverage
- Completing the X3DOM render-engine option and wiring it into the live app with a user-facing renderer selector (see [Render-engine adapter](#render-engine-adapter-three-js--x3dom-in-progress))

## License and security

Source code is licensed under Apache-2.0. Bundled media has its own terms; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and `LICENSE`. See [SECURITY.md](SECURITY.md) for responsible vulnerability reporting.
