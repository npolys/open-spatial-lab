import { mountCanonicalWorldContent } from "./vendor/scene-core/canonical-world-content.js";
import { X3DOMPortalRenderer } from "./x3dom-portal-renderer.mjs";
import { buildWowScene } from "./wow-scene.mjs";
import { syncHostedSceneObjectMeshesX3dom, disposeHostedSceneObjectMeshesX3dom } from "./x3dom-portal-hosted-objects.mjs";
import { glueCameraThroughFrames, normalizeVec3, subtract3, addScaled3, dot3 } from "./live-adapter-portal-geometry.mjs";
import { portalAwarenessVolume } from "./portal-spatial-preview.mjs";
import { mountAirportTerminalContentX3dom } from "./x3dom-airport-terminal-scene.mjs";

// Phase 2 of the X3DOM render-parity plan — portal traversal.
//
// The backend-facing half of portal traversal (crossing detection, exit-intent/arrival POSTs,
// presence handoff, switching which world-server endpoint is active) needs NO new code here: it
// already runs unconditionally inside LiveAdapter itself (`createPortalTraversalHandoffController`,
// constructed in live-adapter.js's own constructor with every dependency it needs supplied
// internally) for both render paths, since x3dom-live-mode.mjs already drives the same
// `liveAdapter.stepAvatar()` every frame that the three.js path does. What was actually missing
// for X3DOM was purely the RENDERING reaction: nothing built a visible portal, and nothing
// listened for the "crossing" event LiveAdapter dispatches to rebuild the scene / remap the
// camera the way app.js's sceneRuntimeController + movementCameraController do for three.js. This
// module is that reaction, kept deliberately smaller than the three.js path's
// scene-runtime-controller.mjs + portal-spatial-preview.mjs: it rebuilds the (procedural,
// canonical) world content for whichever world is now active and gives the portal a real,
// findable position.
//
// Phase 6 added a live preview through the aperture, via the existing, previously-unwired
// X3DOMPortalRenderer (X3DOM has no render-target/clipping-plane API like the three.js path's
// second WebGLRenderTarget, so this uses its screenshot-polling approach instead — a second,
// hidden <x3d> host renders a destination scene and its runtime.getScreenshot() output is pushed
// into an ImageTexture on the aperture's material, throttled to ~10fps). Phase 6 shipped that
// preview showing a fixed-color procedural placeholder room, matching SpatialPortalPreviewManager's
// own DEFAULT behavior at the time (neither render path fetched real destination content yet).
//
// This was later upgraded to REAL destination content, mirroring what scene-runtime-controller.mjs
// (`ensurePreviewManager`) actually wires for the three.js path in production — NOT a call-site
// reuse of that wiring (confirmed by direct inspection: syncHostedSceneObjectMeshes hardcodes
// ThreeRenderAdapter and reaches past it for raw material/geometry/visibility APIs X3DOM's plain-
// DOM mesh handles don't have; mountAirportTerminalContent is 100% raw THREE with no adapter
// indirection at all) — an X3DOM-native parallel path instead, reusing what's genuinely
// engine-agnostic (`liveAdapter.resolvePortalDestinationContent()`, `buildWowScene`) and rebuilding
// what isn't (`syncHostedSceneObjectMeshesX3dom` in x3dom-portal-hosted-objects.mjs). Two real,
// documented gaps versus three.js remain: (1) the airport-bound portal (reachable via
// location-lobby's third portal) shows the authored graph's real topology but not
// mountAirportTerminalContent's storefront/gate set-dressing, and not real glTF assets
// (mountWowSceneAssets) — a deliberate scope cut, not silent debt; (2) no proximity/projected-area
// eligibility gating yet — the preview captures continuously whenever a portal exists in the
// active world, not just when a player is close enough to see it (three.js's own gating function,
// projectedPortalApertureDevicePixels, is raw THREE.Vector3/camera-matrix math, not reusable here —
// tracked as a follow-on using X3DOMRenderAdapter.worldToScreen() instead).
//
// resolvePortalDestinationContent()'s `subscribeHostedPoint` is NOT a real push: the
// `hostedattachpoint` event it listens for only fires when something actually CALLS
// liveAdapter.demoReadAttachPoint(endpointKey) again (confirmed: that method dispatches the event
// itself, unconditionally, every time it's invoked). Three.js gets "live" hosted-object updates for
// free because portal-render-controller.mjs already runs its own poll loop for an unrelated debug
// panel. Nothing in the X3DOM path polls that endpoint, so this glue owns a small interval timer of
// its own (HOSTED_POINT_POLL_MS below) rather than assuming passive delivery.
//
// Portal apertures are rendered as a double-sided PLANE, not a thin box as originally built in
// this phase: a live capture-and-compare test (walking a real avatar up to a real portal,
// screenshotting it, then cloning the exact same live <imagetexture> node onto a fresh plane at
// the same position for a side-by-side) showed the box rendering fully opaque black — the
// texture never visibly applies to a Box's default UV mapping in this X3DOM build, regardless of
// material/lighting adjustments — while the identical texture renders correctly on a plane. Box
// was originally chosen specifically to dodge a single-sided-visibility limitation (a plane
// approached from its back would be invisible, since the adapter didn't wire a material's
// double-sided intent through to the plane geometry's own `solid` field) — but Phase 6 of this
// same plan already closed that gap (`side: "double"` now sets `solid="false"` on plane geometry
// via _wrapShape(), see x3dom-render-adapter.mjs), so requesting it here gets correct two-sided
// visibility AND working texture rendering, with no adapter changes needed.
const PORTAL_APERTURE_MATERIAL = Object.freeze({ type: "standard", color: 0x8fd4ff, opacity: 0.55, transparent: true, side: "double" });
const PORTAL_PREVIEW_SIZE_PX = 160;
// Matches SpatialPortalPreviewManager's own default resolveDestinationContent fallback
// (portal-spatial-preview.mjs) — used only when resolvePortalDestinationContent() itself fails
// (destination endpoint unreachable) or hasn't resolved yet, not as the everyday case anymore.
const PORTAL_PREVIEW_PLACEHOLDER_COLOR = "#3aa0ff";
// Three.js gets hosted-object "liveness" for free from portal-render-controller.mjs's own,
// unrelated 100ms poll loop. This is a background preview, not the primary view, so a slower
// interval is a deliberate choice, not a corner cut — see the header comment.
const HOSTED_POINT_POLL_MS = 750;
// Matches three.js's own HOSTED_POINT_RELOAD_MS (portal-render-controller.mjs) — this poll is for
// the player's real, primary/active world, not a background preview, so it gets the same tighter
// interval that module already uses. No PNG-encoding cost to throttle against here (unlike the
// portal-preview capture path — see x3dom-portal-renderer.mjs's DEFAULT_CAPTURE_INTERVAL_MS
// history), just a cheap JSON read plus box/sphere position-and-color sync.
const ACTIVE_HOSTED_POINT_POLL_MS = 100;
// Matches three.js's own MIN_PROJECTED_PORTAL_AREA_DEVICE_PX (portal-spatial-preview.mjs, not
// exported — restated here) — an intentionally low bar ("on screen at all, however small") rather
// than a real proximity gate; the real proximity requirement lives in a separate prefetch/warm-up
// subsystem this glue doesn't need to duplicate (the destination content is already resolved by
// the time a portal exists in the active world at all).
const MIN_PROJECTED_PORTAL_AREA_DEVICE_PX = 16;
// Matches three.js's own RADIAL_CLIP_PLANE_COUNT (portal-spatial-preview.mjs, not exported —
// restated here, same convention as the constants above).
const RADIAL_CLIP_PLANE_COUNT = 20;

function portalFrameMatrix(frame) {
    const right = Array.isArray(frame.right) ? frame.right : [1, 0, 0];
    const up = Array.isArray(frame.up) ? frame.up : [0, 1, 0];
    const forward = Array.isArray(frame.forward) ? frame.forward : [0, 0, 1];
    const position = Array.isArray(frame.position) ? frame.position : [0, 0, 0];
    // Column-major, matching spatial-math.mjs's convention (and three.js's Matrix4.elements):
    // columns 0-2 are the local X/Y/Z basis vectors, column 3 is translation.
    return [
        right[0], right[1], right[2], 0,
        up[0], up[1], up[2], 0,
        forward[0], forward[1], forward[2], 0,
        position[0], position[1], position[2], 1,
    ];
}

// User-confirmed live (2026-08-13), correcting this file's earlier wrong assumption: for a torus
// to be parallel to a wall, it needs to be a ring in the local X-Y plane with its hole looking down
// local Z — the SAME local-Z-face-normal convention portalFrameMatrix already uses for the aperture
// plane (see that function's own column order: right, up, forward → X, Y, Z), not a different
// hole-along-Y convention. So this is just portalFrameMatrix with right/up pre-scaled to the
// frame's width/height (mirroring three.js's `ring.scale.set(width/2, height/2, 1)` on a unit
// torus) — no separate axis remapping needed, and no manual rotation-attribute override either
// (an earlier version of this function swapped forward into the Y column and patched the result
// with a hardcoded `rotation` override, which only happened to look approximately right from one
// specific camera angle — wrong, per live testing across multiple portals).
function portalRingMatrix(frame, widthM, heightM) {
    const right = Array.isArray(frame.right) ? frame.right : [1, 0, 0];
    const up = Array.isArray(frame.up) ? frame.up : [0, 1, 0];
    const forward = Array.isArray(frame.forward) ? frame.forward : [0, 0, 1];
    const position = Array.isArray(frame.position) ? frame.position : [0, 0, 0];
    const hw = widthM / 2;
    const hh = heightM / 2;
    return [
        right[0] * hw, right[1] * hw, right[2] * hw, 0,
        up[0] * hh, up[1] * hh, up[2] * hh, 0,
        forward[0], forward[1], forward[2], 0,
        position[0], position[1], position[2], 1,
    ];
}

// Restated locally rather than imported from portal-spatial-preview.mjs, matching this file's own
// convention for small shared constants (see PORTAL_PREVIEW_PLACEHOLDER_COLOR/
// MIN_PROJECTED_PORTAL_AREA_DEVICE_PX above).
function destWorldRingColor(locationId) {
    return String(locationId || "") === "location-b" ? 0xffc266 : 0x66e0ff;
}

function worldPortals(world) {
    if (!world)
        return [];
    if (Array.isArray(world.portals) && world.portals.length)
        return world.portals;
    return world.portal ? [world.portal] : [];
}

// X3DOM-native gating, not a reuse of three.js's projectedPortalApertureDevicePixels
// (portal-spatial-preview.mjs) — that function uses raw THREE.Vector3/camera.matrixWorldInverse
// math with no X3DOM equivalent. Built instead on X3DOMRenderAdapter.worldToScreen(), which
// already returns canvas-pixel coordinates + an in-front/behind flag for a world point against the
// MAIN camera (not the destination one — this gates visibility from the PLAYER's real viewpoint,
// same as three.js's own gate). Projects the aperture's 4 corners, clips their screen-space
// bounding box against the actual canvas bounds (adapter.canvasSize), and returns the clipped
// area — NOT just the raw projected box: worldToScreen()'s `visible` flag only tests
// in-front-of-camera, not on-screen, so a portal squarely in front of the camera but entirely off
// to the side (well outside [0,width]) would otherwise still count as "eligible" with a large
// nonzero area (confirmed the hard way while building this function's own verification spike —
// see spike-run-x3dom-portal-preview-gating.mjs's header comment). Any corner behind the camera
// counts the whole aperture as not visible (a simplification — three.js's own version is more
// careful about partially-behind apertures, not worth replicating for a background preview).
function projectedApertureAreaPx(adapter, frame) {
    const center = Array.isArray(frame.position) ? frame.position : [0, 1.35, 0];
    const right = Array.isArray(frame.right) ? frame.right : [1, 0, 0];
    const up = Array.isArray(frame.up) ? frame.up : [0, 1, 0];
    const halfWidth = (Number(frame.width_m) || 1.8) / 2;
    const halfHeight = (Number(frame.height_m) || 2.8) / 2;
    const signs = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    const projected = signs.map(([sx, sy]) => {
        const corner = [
            center[0] + right[0] * halfWidth * sx + up[0] * halfHeight * sy,
            center[1] + right[1] * halfWidth * sx + up[1] * halfHeight * sy,
            center[2] + right[2] * halfWidth * sx + up[2] * halfHeight * sy,
        ];
        return adapter.worldToScreen(adapter.camera, corner);
    });
    if (projected.some((p) => !p || !p.visible))
        return 0;
    const { width: canvasWidth, height: canvasHeight } = adapter.canvasSize;
    if (!canvasWidth || !canvasHeight)
        return 0;
    const xs = projected.map((p) => p.x);
    const ys = projected.map((p) => p.y);
    const clippedWidth = Math.max(0, Math.min(Math.max(...xs), canvasWidth) - Math.max(Math.min(...xs), 0));
    const clippedHeight = Math.max(0, Math.min(Math.max(...ys), canvasHeight) - Math.max(Math.min(...ys), 0));
    return clippedWidth * clippedHeight;
}

export function createX3domPortalTraversalGlue({ adapter, liveAdapter, camera, x3dom, log = () => { } }) {
    let worldContentGroup = null;
    let portalGroup = null;
    // x3dom is optional (every current call site passes it, but this keeps older/lighter-weight
    // callers — e.g. any future test harness that only cares about world/aperture geometry —
    // working without also standing up a live preview).
    const portalRenderer = x3dom ? new X3DOMPortalRenderer(x3dom) : null;
    let previewRecords = [];
    let activeHostedGroup = null;
    let activeHostedMeshes = new Map();
    let activeHostedVersion = null;
    let activeHostedPollHandle = null;

    function clearGroup(group) {
        if (!group)
            return;
        try {
            adapter.disposeNode(group);
        }
        catch (err) {
            log(`[x3dom-portal-glue] failed to clear group: ${err && err.message}`);
        }
    }

    function disposePreviews() {
        for (const record of previewRecords.splice(0)) {
            record.disposed = true;
            try {
                record.disposeContent?.();
            }
            catch (err) {
                log(`[x3dom-portal-glue] failed to dispose portal preview content: ${err && err.message}`);
            }
            try {
                portalRenderer.dispose(record.destAdapter);
            }
            catch (err) {
                log(`[x3dom-portal-glue] failed to dispose portal preview: ${err && err.message}`);
            }
        }
    }

    // Bounds the destination content to a sphere around the portal's own awareness volume, so a
    // player standing far from the source portal doesn't see a small, fixed-size destination room
    // rendered wildly out of its own bounds (the round-4 "portal screenshot still looks wrong" gap
    // documented in the parity plan memory — an explicitly deferred, not-forgotten item). Reuses
    // portalAwarenessVolume() (portal-spatial-preview.mjs) as-is: it's pure data math with no THREE
    // dependency, and every access on its optional `machine` first argument is null-safe, so
    // passing null here falls through cleanly to the portal's own authored radius data — the exact
    // same fallback three.js itself takes whenever its own richer machine-based radius isn't
    // available either, not a degraded path specific to X3DOM.
    //
    // X3D's ClipPlane uses the identical ax+by+cz+d>=0-is-kept convention as THREE.Plane(normal,
    // constant), so this is the same 21-plane construction three.js's own
    // SpatialPortalPreviewManager builds (one forward "setback" plane so the back of the portal
    // isn't visible, plus RADIAL_CLIP_PLANE_COUNT Fibonacci-sphere-distributed radial planes
    // approximating a bounding sphere) — same math, different node type. Mounted once per portal
    // preview setup (boot + each crossing), not per frame — the awareness volume is anchored to the
    // portal's own fixed position, not the live camera.
    //
    // Inserted BEFORE any destination content is mounted (called from setupPortalPreview() ahead of
    // the content-kind branch), since X3D's ClipPlane scoping is traversal-order sensitive — it
    // affects geometry that comes after it among its siblings, not geometry that precedes it.
    function mountAwarenessClipPlanes(record, portal) {
        const volume = portalAwarenessVolume(null, portal);
        if (!volume.valid)
            return;
        const center = volume.center;
        const forward = normalizeVec3(volume.forward, [0, 0, 1]);
        const forwardPlane = record.destAdapter.createClipPlane({
            normal: forward,
            constant: -dot3(forward, center) + volume.plane_setback_m,
        });
        record.destAdapter.add(record.destAdapter.sceneRoot, forwardPlane);
        for (let index = 0; index < RADIAL_CLIP_PLANE_COUNT; index += 1) {
            const y = 1 - (index / (RADIAL_CLIP_PLANE_COUNT - 1)) * 2;
            const radial = Math.sqrt(Math.max(0, 1 - y * y));
            const theta = index * Math.PI * (3 - Math.sqrt(5));
            const outward = [Math.cos(theta) * radial, y, Math.sin(theta) * radial];
            const plane = record.destAdapter.createClipPlane({
                normal: [-outward[0], -outward[1], -outward[2]],
                constant: dot3(outward, center) + volume.radius_m,
            });
            record.destAdapter.add(record.destAdapter.sceneRoot, plane);
        }
    }

    function applyPlaceholderContent(record, portal) {
        const destCamera = record.destAdapter.createPerspectiveCamera({ fov: 55, near: 0.1, far: 30 });
        record.destAdapter.sceneRoot.appendChild(destCamera);
        record.destAdapter.setCameraPose(destCamera, { position: [0, 1.6, 5], lookAt: [0, 1.2, 0] });
        mountCanonicalWorldContent(record.destAdapter, record.destAdapter.sceneRoot, {
            location_id: portal.target_location_id || null,
            color: PORTAL_PREVIEW_PLACEHOLDER_COLOR,
        });
        record.destCamera = destCamera;
        record.contentKind = "placeholder";
    }

    // legacy_world destinations (location-a/location-b/location-lobby today) — the common case.
    // Same visible shape as scene-runtime-controller.mjs's composeDestinationContent's legacy_world
    // branch: the room itself is still a procedural build (mountCanonicalWorldContent), but with
    // the destination's REAL color, plus real hosted scene objects layered on top and kept fresh
    // via this glue's own poll timer (see the header comment on why a poll timer, not a passive
    // subscription).
    function applyLegacyWorldContent(record, content) {
        const destCamera = record.destAdapter.createPerspectiveCamera({ fov: 55, near: 0.1, far: 30 });
        record.destAdapter.sceneRoot.appendChild(destCamera);
        record.destAdapter.setCameraPose(destCamera, { position: [0, 1.6, 5], lookAt: [0, 1.2, 0] });
        record.destCamera = destCamera;

        mountCanonicalWorldContent(record.destAdapter, record.destAdapter.sceneRoot, content.world);
        const hostedMeshes = new Map();
        const hostedGroup = record.destAdapter.createGroup("x3dom-portal-preview-hosted-objects");
        record.destAdapter.add(record.destAdapter.sceneRoot, hostedGroup);
        let hostedPointVersion = null;
        const applyHostedPoint = (attachPoint) => {
            if (!attachPoint || attachPoint.version === hostedPointVersion)
                return;
            hostedPointVersion = attachPoint.version;
            syncHostedSceneObjectMeshesX3dom({
                adapter: record.destAdapter,
                meshes: hostedMeshes,
                parent: hostedGroup,
                objects: attachPoint.value?.objects || [],
                version: attachPoint.version,
            });
        };
        applyHostedPoint(content.hosted_point);
        const unsubscribe = typeof content.subscribeHostedPoint === "function"
            ? content.subscribeHostedPoint(applyHostedPoint)
            : null;
        const endpointKey = content.endpoint_key;
        const pollHandle = endpointKey
            ? setInterval(() => { liveAdapter.demoReadAttachPoint(endpointKey).catch(() => { }); }, HOSTED_POINT_POLL_MS)
            : null;
        record.disposeContent = () => {
            unsubscribe?.();
            if (pollHandle != null)
                clearInterval(pollHandle);
            disposeHostedSceneObjectMeshesX3dom(record.destAdapter, hostedMeshes);
        };
        record.contentKind = "legacy_world";
        record.hostedGroup = hostedGroup;
    }

    // authored_wow_graph destinations — only the airport today (reachable via location-lobby's
    // third portal). buildWowScene is genuinely engine-agnostic (only calls A.createGroup/
    // createMesh/createGeometry/add/etc., all implemented on X3DOMRenderAdapter) and, critically,
    // builds directly onto whatever `A.sceneRoot` the passed createAdapter() factory returns — so
    // the factory here must return the ALREADY-MOUNTED destination adapter, not a fresh instance
    // (X3DOMRenderAdapter.sceneRoot is null until mount()/attach() runs; three.js's own equivalent
    // factory gets away with `() => new ThreeRenderAdapter(THREE)` only because THREE.Scene() works
    // standalone). mountAirportTerminalContentX3dom (x3dom-airport-terminal-scene.mjs) mounts the
    // real terminal geometry on top of buildWowScene's own root, same order three.js's own
    // portal-preview path uses (buildWowScene, then mountAirportTerminalContent on the same
    // `built`) — buildWowScene's generic floor/grid/lights stay as-is underneath, matching what
    // the live three.js path already tolerates (hideStageDebugVisuals only hides GridHelper/gizmo
    // markers, never the generic floor). Stage 1 of X3DOM airport parity — still does NOT call
    // mountWowSceneAssets (real glTF asset loading for NPC/staff avatars) or the entity-runtime
    // manifest cards; those are staged as separate follow-ons, not attempted here.
    function applyAuthoredGraphContent(record, content) {
        const built = buildWowScene(content.graph, () => record.destAdapter, {
            width: PORTAL_PREVIEW_SIZE_PX,
            height: PORTAL_PREVIEW_SIZE_PX,
            source: "portal_preview_x3dom_authored_wow_graph",
        });
        record.destAdapter.add(record.destAdapter.sceneRoot, built.camera);
        record.destCamera = built.camera;
        record.disposeContent = null;
        record.contentKind = "authored_wow_graph";
        mountAirportTerminalContentX3dom(content.graph, record.destAdapter, { parent: record.destAdapter.sceneRoot, document });
    }

    async function setupPortalPreview(portal, material) {
        const destAdapter = portalRenderer.createDestinationAdapter({ width: PORTAL_PREVIEW_SIZE_PX, height: PORTAL_PREVIEW_SIZE_PX });
        const record = { destAdapter, destCamera: null, material, portal, busy: false, disposed: false, disposeContent: null };
        previewRecords.push(record);
        try {
            await destAdapter.ready();
            if (record.disposed)
                return;
            mountAwarenessClipPlanes(record, portal);
            let content = null;
            try {
                content = await liveAdapter.resolvePortalDestinationContent(portal);
            }
            catch (err) {
                log(`[x3dom-portal-glue] resolvePortalDestinationContent failed, falling back to placeholder: ${err && err.message}`);
            }
            if (record.disposed)
                return;
            if (content?.kind === "authored_wow_graph")
                applyAuthoredGraphContent(record, content);
            else if (content?.kind === "legacy_world")
                applyLegacyWorldContent(record, content);
            else
                applyPlaceholderContent(record, portal);
        }
        catch (err) {
            log(`[x3dom-portal-glue] portal preview setup failed: ${err && err.message}`);
        }
    }

    function mountPortalApertures() {
        disposePreviews();
        clearGroup(portalGroup);
        portalGroup = adapter.createGroup("x3dom-portal-apertures");
        adapter.add(adapter.sceneRoot, portalGroup);
        for (const portal of worldPortals(liveAdapter.world)) {
            const frame = portal && portal.frame;
            if (!frame || !Array.isArray(frame.position))
                continue;
            const geometry = adapter.createGeometry({
                type: "plane",
                width: Number(frame.width_m) || 2,
                height: Number(frame.height_m) || 3,
            });
            const material = adapter.createMaterial(PORTAL_APERTURE_MATERIAL);
            const mesh = adapter.createMesh(geometry, material);
            adapter.setLocalMatrix(mesh, portalFrameMatrix(frame));
            adapter.add(portalGroup, mesh);
            if (portalRenderer)
                setupPortalPreview(portal, material);

            // Decorative frame, matching three.js's own dest-portal-ring (portal-spatial-preview.mjs)
            // — a glowing emissive torus around the aperture, colored per destination world.
            const ringColor = destWorldRingColor(portal.target_location_id);
            const ringGeometry = adapter.createGeometry({ type: "torus", innerRadius: 0.075, outerRadius: 1 });
            // side: "double" — user-confirmed live (2026-08-13): without this, only the torus's
            // backfaces were visible (culled the wrong way round under this build's winding/normal
            // conventions for a Torus placed via setLocalMatrix's decomposed rotation). Same fix
            // already applied to the aperture plane for an analogous reason (see this file's header
            // comment) — disabling culling entirely sidesteps the exact mechanism rather than
            // needing to fully re-derive it.
            const ringMaterial = adapter.createMaterial({ type: "standard", color: ringColor, emissive: ringColor, emissiveIntensity: 0.72, side: "double" });
            const ringMesh = adapter.createMesh(ringGeometry, ringMaterial);
            adapter.setLocalMatrix(ringMesh, portalRingMatrix(frame, Number(frame.width_m) || 2, Number(frame.height_m) || 3));
            adapter.add(portalGroup, ringMesh);
        }
    }

    // Glues the destination camera to the main camera's REAL pose every tick, via
    // glueCameraThroughFrames (live-adapter-portal-geometry.mjs — genuinely pure vector math, no
    // engine coupling, the same function the three.js path uses for its own camera gluing). Gives
    // real walk-past parallax through the aperture. Deliberately does NOT attempt three.js's
    // pixel-perfect on-screen crop (THREE.Camera.setViewOffset + a custom crop shader sampling a
    // live render-target texture) — X3DOM exposes no live render-target texture to crop in a
    // shader, only getScreenshot()'s data: URI snapshot, so there's no raw texture to crop against.
    // The aperture shows the destination camera's whole view mapped onto the captured texture,
    // now correctly parallaxing as the player moves, not a pixel-accurate window.
    function updateCameraGlue(record) {
        if (!record.destCamera || !record.portal?.frame || !record.portal?.target_frame)
            return;
        const pose = camera.currentPose();
        if (!pose)
            return;
        const camFwd = normalizeVec3(subtract3(pose.lookAt, pose.position), [0, 0, -1]);
        const glued = glueCameraThroughFrames(record.portal.frame, record.portal.target_frame, pose.position, camFwd);
        if (!glued)
            return;
        const lookAt = addScaled3(glued.position, glued.forward, 2.5);
        record.destAdapter.setCameraPose(record.destCamera, { position: glued.position, lookAt });
    }

    // Proximity/visibility gating: skips both camera-gluing and capture()/getScreenshot() entirely
    // when the portal aperture isn't visible enough to matter (three.js's own gate is purely
    // geometric/on-screen too, not real-world distance — see projectedApertureAreaPx's header
    // comment). Real, meaningful savings: without this, a hidden host keeps polling
    // getScreenshot() at ~10fps regardless of whether the player is even looking anywhere near the
    // portal. NOT full parity with three.js's render-target approach, though: X3DOM has no adapter
    // method to pause a mounted <x3d> host's own underlying render loop, so the hidden scene keeps
    // rendering internally regardless — this only stops the wasteful polling/compositing step on
    // top of that, a real but partial saving, stated plainly rather than implied away.
    function isPreviewEligible(record) {
        if (!record.portal?.frame)
            return true; // no frame to test against — fail open rather than silently going dark
        return projectedApertureAreaPx(adapter, record.portal.frame) >= MIN_PROJECTED_PORTAL_AREA_DEVICE_PX;
    }

    function tick() {
        if (!portalRenderer)
            return;
        for (const record of previewRecords) {
            if (record.disposed || !record.destCamera)
                continue;
            if (!isPreviewEligible(record))
                continue;
            updateCameraGlue(record);
            if (record.busy)
                continue;
            record.busy = true;
            record.captureAttempts = (record.captureAttempts || 0) + 1;
            portalRenderer.capture(record.destAdapter, record.destCamera, PORTAL_PREVIEW_SIZE_PX, PORTAL_PREVIEW_SIZE_PX, adapter)
                .then((result) => {
                if (record.disposed)
                    return;
                if (!record.material.appearanceEl.contains(result.texture.el))
                    record.material.appearanceEl.appendChild(result.texture.el);
            })
                .catch((err) => log(`[x3dom-portal-glue] portal preview capture failed: ${err && err.message}`))
                .finally(() => { record.busy = false; });
        }
    }

    // The ACTIVE world's own hosted scene objects (simple backend-driven box/sphere placeholders —
    // three.js calls the equivalent state.rootMeshes) were never rendered anywhere in the X3DOM
    // path at all: this glue only ever synced hosted objects into PORTAL PREVIEW destinations
    // (applyLegacyWorldContent above). portal-render-controller.mjs's applyHostedPointToView()
    // handles both — its isActiveWorld branch runs the identical sync against `impl.scene`, keyed
    // on `live.activeEndpointKey`, refreshed by that module's own 100ms poll loop. Mirrored here
    // with the X3DOM-native sync function, found missing via a live-QA report ("the animated
    // cubes are not there").
    function applyActiveHostedPoint(attachPoint) {
        if (!attachPoint || attachPoint.version === activeHostedVersion)
            return;
        activeHostedVersion = attachPoint.version;
        syncHostedSceneObjectMeshesX3dom({
            adapter,
            meshes: activeHostedMeshes,
            parent: activeHostedGroup,
            objects: attachPoint.value?.objects || [],
            version: attachPoint.version,
            // Real WoW-negotiated asset representations for the ACTIVE world's own hosted objects
            // only — portal-preview destinations (applyHostedPoint above) stay on synthetic
            // geometry: X3DOM's <Inline> only reliably loads when seeded in the page's original
            // static parse (x3dom-inline-pool.js), and the hidden destination host is created
            // entirely dynamically at runtime, so Inline-based loading isn't safely usable there.
            fetchWowRepresentation: true,
            wowAssetBaseUrl: liveAdapter.endpoint.proxy_base,
        });
    }

    function mountActiveHostedObjects() {
        if (activeHostedPollHandle != null) {
            clearInterval(activeHostedPollHandle);
            activeHostedPollHandle = null;
        }
        activeHostedMeshes = new Map();
        activeHostedVersion = null;
        activeHostedGroup = adapter.createGroup("x3dom-active-hosted-objects");
        adapter.add(worldContentGroup, activeHostedGroup);
        const key = liveAdapter.activeEndpointKey;
        const poll = () => liveAdapter.demoReadAttachPoint(key).then(applyActiveHostedPoint).catch(() => { });
        poll();
        activeHostedPollHandle = setInterval(poll, ACTIVE_HOSTED_POINT_POLL_MS);
    }

    // Mirrors scene-runtime-controller.mjs's own activeAuthoredAirport(world) exactly — same
    // three-part check (location_id, resolved spatialID, graph presence). liveAdapter.wowResolved()
    // is genuinely engine-agnostic (a plain getter on LiveAdapter, populated during the normal
    // boot/crossing sequence regardless of render path) and was already available to X3DOM before
    // today; it was just never read here.
    function activeAuthoredAirport(world) {
        const resolved = typeof liveAdapter.wowResolved === "function" ? liveAdapter.wowResolved() : null;
        if (world?.location_id !== "location-airport" || resolved?.spatialID !== "world-airport-terminal" || !resolved.graph)
            return null;
        return resolved;
    }

    function mountWorldContent() {
        clearGroup(worldContentGroup);
        worldContentGroup = adapter.createGroup("x3dom-world-content");
        adapter.add(adapter.sceneRoot, worldContentGroup);
        const airport = activeAuthoredAirport(liveAdapter.world);
        let airportMounted = false;
        if (airport) {
            // Deliberately NOT buildWowScene here (unlike the portal-preview branch below) — that
            // function unconditionally owns "the whole scene" (background color, its own floor/
            // grid/lights) and is only safe against a dedicated, otherwise-empty destination
            // adapter. The active world shares ONE persistent adapter/scene across every crossing,
            // scoped via worldContentGroup the same way mountCanonicalWorldContent already is —
            // mounting airport content straight into that same group keeps that scoping intact.
            try {
                airportMounted = !!mountAirportTerminalContentX3dom(airport.graph, adapter, { parent: worldContentGroup, document });
            }
            catch (err) {
                log(`[x3dom-portal-glue] airport terminal mount failed, falling back to canonical room: ${err && err.message}`);
            }
        }
        if (!airportMounted) {
            clearGroup(worldContentGroup);
            worldContentGroup = adapter.createGroup("x3dom-world-content");
            adapter.add(adapter.sceneRoot, worldContentGroup);
            mountCanonicalWorldContent(adapter, worldContentGroup, liveAdapter.world || {});
        }
        mountActiveHostedObjects();
        mountPortalApertures();
    }

    function reportCameraTransform() {
        const pose = camera.currentPose();
        if (!pose)
            return;
        liveAdapter.updatePreviewProjection({ position: pose.position, target: pose.lookAt, rotation_y: pose.lookYaw });
    }

    function handleCrossing(event) {
        const detail = (event && event.detail) || {};
        log(`[x3dom-portal-glue] crossing: ${detail.kind || "unknown"} — recomposing world content`);
        mountWorldContent();
        const applied = camera.applyCrossingCameraMapping(detail.camera_mapping);
        log(`[x3dom-portal-glue] crossing: camera ${applied ? "remapped through portal frames" : "kept as-is (no camera mapping in this record)"}`);
    }

    liveAdapter.addEventListener("crossing", handleCrossing);

    // For tests/diagnostics only — avatar/equipment glTF assets embed their own real
    // <imagetexture> elements internally (baseColor/normal/etc. maps), so counting imagetexture
    // elements anywhere in the document isn't a reliable signal of THIS preview mechanism
    // specifically; this reports on the actual preview records instead. Deliberately returns only
    // plain, JSON-serializable fields — a caller that does `page.evaluate(() =>
    // portalGlue.previewDebugState())` and returns the WHOLE result directly (not post-processed
    // in-page first) needs this to survive Puppeteer's CDP round-trip; a raw DOM node in the
    // returned shape breaks that (confirmed the hard way: an earlier draft included
    // `destSceneRoot` here directly and it silently broke an existing spike that returns this
    // array as-is). Use debugDestSceneRoot()/debugHostedGroup() below for DOM access instead,
    // always processed to plain data within the SAME evaluate() call before returning.
    function previewDebugState() {
        return previewRecords.map((record) => ({
            ready: !!record.destCamera,
            capturedUrl: record.material.appearanceEl.querySelector("imagetexture")?.getAttribute("url") || null,
            contentKind: record.contentKind || null,
            destCameraPosition: record.destCamera ? (record.destCamera.getAttribute("position") || "").trim() : null,
            // A monotonically increasing counter of actual capture() calls (not skipped by
            // gating) — a timing-independent signal for tests: unlike capturedUrl, which can stay
            // byte-identical across ticks for legitimately static content (see the header comment
            // on spike-run-x3dom-portal-preview.mjs), this always advances when a capture actually
            // ran, so it can prove gating is/isn't suppressing captures without depending on
            // content happening to change.
            captureAttempts: record.captureAttempts || 0,
            eligible: record.portal?.frame ? isPreviewEligible(record) : null,
        }));
    }

    // For tests/diagnostics only — live DOM references. Must be walked/reduced to plain data
    // within the SAME page.evaluate() call that fetches them; never return them as-is.
    function debugDestSceneRoot(index) { return previewRecords[index]?.destAdapter.sceneRoot || null; }
    function debugHostedGroup(index) { return previewRecords[index]?.hostedGroup || null; }

    return {
        mountWorldContent, reportCameraTransform, tick, handleCrossing, previewDebugState,
        debugDestSceneRoot, debugHostedGroup,
        dispose: () => {
            liveAdapter.removeEventListener("crossing", handleCrossing);
            if (activeHostedPollHandle != null) {
                clearInterval(activeHostedPollHandle);
                activeHostedPollHandle = null;
            }
            disposeHostedSceneObjectMeshesX3dom(adapter, activeHostedMeshes);
            disposePreviews();
        },
    };
}
