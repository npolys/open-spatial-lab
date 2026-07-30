import { SpatialPortalPreviewManager } from "./portal-spatial-preview.mjs?v=meeting-critical-destination";
import { disposeHostedSceneObjectMeshes, syncHostedSceneObjectMeshes, } from "./portal-render-controller.mjs";
import { ThreeRenderAdapter } from "./vendor/scene-core/render-adapter/three-render-adapter.mjs";
export function createSceneRuntimeController({ THREE, SceneClass, PortalPreviewManagerClass = SpatialPortalPreviewManager, AvatarLayerClass = null, buildWowScene, mountAirportTerminalContent, mountWowSceneAssets, mountCanonicalWorldContent, loadGltf, cloneScene, airportSceneContract, isPlayer, role, stageMode, sharedAvatarCompositing, motionPreference = null, getMount, documentTarget, windowTarget, locationHref, requestFrame, cancelFrame, getRuntime, getAvatarLayers, syncPeerAvatars, sceneRoleForDebug, alignPortalVisual, portalKey, setupNavigatorRender, onSceneChanged, onPortalAlignment, seedOrbitCamera, applyPlayerCamera, logLine, showToast, vec3Label, }) {
    let currentScene = null;
    let previewManager = null;
    let clientSceneLoadInFlight = false;
    let clientSceneLoadSurface = null;
    let activeClientSceneGraph = null;
    let liveAuthoredSceneSurface = null;
    let disposed = false;
    let lastViewport = null;
    let viewportApplyCount = 0;
    let sceneIdentity = 0;
    let detachedLegacyResizeOwners = 0;
    const destinationAssetCache = new Map();
    // Shared, reused across every construction-only call site in this file (buildWowScene,
    // mountCanonicalWorldContent) — this file isn't otherwise ported off THREE yet, so this is
    // the same "throwaway adapter used only for its stateless construction methods" pattern
    // used everywhere in this codebase, just shared once instead of re-instantiated per call.
    const engineAdapter = new ThreeRenderAdapter(THREE);
    const runtime = () => (typeof getRuntime === "function" ? getRuntime() : null);
    const mount = () => (typeof getMount === "function" ? getMount() : null);
    const avatarLayers = () => {
        const layers = typeof getAvatarLayers === "function" ? getAvatarLayers() : null;
        return {
            local: layers && layers.local ? layers.local : null,
            peers: layers && layers.peers ? Array.from(layers.peers) : [],
        };
    };
    function publishScene(next) {
        currentScene = next || null;
        if (currentScene)
            sceneIdentity += 1;
        if (typeof onSceneChanged === "function")
            onSceneChanged(currentScene);
    }
    function detachLegacyResizeOwner(sceneInstance) {
        const impl = sceneInstance && sceneInstance._impl;
        if (!impl || !impl._onResize || impl.__oslViewportResizeDetached)
            return false;
        windowTarget.removeEventListener("resize", impl._onResize);
        impl.__oslViewportResizeDetached = true;
        detachedLegacyResizeOwners += 1;
        return true;
    }
    function resize(viewport = lastViewport) {
        const explicitViewport = arguments.length > 0;
        const host = mount();
        const width = Math.max(1, Math.round(Number(viewport && viewport.width) || (host && host.clientWidth) || 1));
        const height = Math.max(1, Math.round(Number(viewport && viewport.height) || (host && host.clientHeight) || 1));
        const pixelRatio = Math.max(1, Math.min(2, Number(viewport && viewport.pixelRatio) || Number(windowTarget.devicePixelRatio) || 1));
        lastViewport = { width, height, pixelRatio };
        const impl = currentScene && currentScene._impl;
        if (!impl)
            return viewportDebug();
        const directWebGlResize = impl.renderer &&
            typeof impl.renderer.setPixelRatio === "function" &&
            typeof impl.renderer.setSize === "function" &&
            impl.camera &&
            typeof impl.camera.updateProjectionMatrix === "function";
        if (directWebGlResize) {
            const renderer = impl.renderer;
            renderer.setPixelRatio(pixelRatio);
            renderer.setSize(width, height, false);
            if (renderer.domElement) {
                renderer.domElement.style.width = "100%";
                renderer.domElement.style.height = "100%";
            }
            impl.camera.aspect = width / height;
            impl.camera.updateProjectionMatrix();
            if (impl.composer && typeof impl.composer.setSize === "function")
                impl.composer.setSize(width, height);
        }
        else if (impl.renderer && impl.camera && typeof currentScene.resize === "function") {
            currentScene.resize();
        }
        else if (impl.canvas) {
            impl.canvas.width = Math.round(width * pixelRatio);
            impl.canvas.height = Math.round(height * pixelRatio);
            impl.canvas.style.width = "100%";
            impl.canvas.style.height = "100%";
            impl._dpr = pixelRatio;
            impl._w = width;
            impl._h = height;
        }
        viewportApplyCount += 1;
        if (explicitViewport && previewManager)
            previewManager.renderActive();
        return viewportDebug();
    }
    function viewportDebug() {
        const impl = currentScene && currentScene._impl;
        const renderer = impl && impl.renderer;
        const canvas = renderer && renderer.domElement ? renderer.domElement : impl && impl.canvas;
        const camera = impl && impl.camera;
        const canvasBounds = canvas && typeof canvas.getBoundingClientRect === "function"
            ? canvas.getBoundingClientRect()
            : null;
        return {
            ...(lastViewport || {}),
            scene_identity: currentScene ? `scene-${sceneIdentity}` : null,
            renderer_identity: renderer ? `scene-${sceneIdentity}-renderer` : null,
            canvas_identity: canvas ? `scene-${sceneIdentity}-canvas` : null,
            animation_loop_owner_count: currentScene ? 1 : 0,
            viewport_apply_count: viewportApplyCount,
            detached_legacy_resize_owners: detachedLegacyResizeOwners,
            canvas_css_width: canvasBounds ? canvasBounds.width : null,
            canvas_css_height: canvasBounds ? canvasBounds.height : null,
            drawing_buffer_width: canvas ? canvas.width : null,
            drawing_buffer_height: canvas ? canvas.height : null,
            camera_aspect: camera ? camera.aspect : null,
            projection_matrix: camera && camera.projectionMatrix && camera.projectionMatrix.elements
                ? Array.from(camera.projectionMatrix.elements, (value) => Number(value.toFixed(8)))
                : null,
        };
    }
    function disposeScene(sceneToDispose, warning) {
        if (!sceneToDispose || typeof sceneToDispose.dispose !== "function")
            return;
        try {
            sceneToDispose.dispose();
        }
        catch (error) {
            console.warn(warning, error);
        }
    }
    function disposeCurrent(warning = "scene dispose failed") {
        const previous = currentScene;
        publishScene(null);
        disposeScene(previous, warning);
    }
    function sceneHost() {
        if (!sharedAvatarCompositing || !currentScene || currentScene.rendererKind !== "webgl")
            return null;
        const impl = currentScene._impl;
        if (!impl || !impl.scene || !impl.camera || !impl.renderer)
            return null;
        return { scene: impl.scene, camera: impl.camera, renderer: impl.renderer };
    }
    function rehostAvatarLayers({ avatar = undefined } = {}) {
        const host = sceneHost();
        const layers = avatarLayers();
        if (layers.local && typeof layers.local.setHost === "function")
            layers.local.setHost(host);
        if (layers.local && avatar !== undefined && typeof layers.local.setAvatar === "function") {
            layers.local.setAvatar(avatar);
        }
        for (const layer of layers.peers) {
            if (layer && typeof layer.setHost === "function")
                layer.setHost(host);
        }
        return host;
    }
    function ensurePreviewManager() {
        if (!isPlayer || previewManager)
            return previewManager;
        previewManager = new PortalPreviewManagerClass({
            AvatarLayerClass,
            getMount: mount,
            motionPreference,
            resolveDestinationContent: (entry) => {
                const capabilities = runtime();
                if (!capabilities || typeof capabilities.resolvePortalDestinationContent !== "function") {
                    throw new Error("canonical portal destination resolver is unavailable");
                }
                return capabilities.resolvePortalDestinationContent(entry);
            },
            composeDestinationContent: (content, context) => {
                if (content?.kind === "legacy_world") {
                    const scene = new THREE.Scene();
                    scene.background = engineAdapter.createColor(0x0b1020);
                    const inventory = mountCanonicalWorldContent(engineAdapter, scene, content.world);
                    const hostedMeshes = new Map();
                    const presentation = {
                        ...inventory,
                        hosted_objects: {
                            attach_point_id: null,
                            version: null,
                            refresh_owner: "PortalRenderController existing bounded client pull",
                            refresh_cadence_ms: 100,
                            streaming: false,
                            objects: [],
                        },
                    };
                    const composition = {
                        scene,
                        source: inventory.source,
                        revision: content.revision,
                        semantic_inventory: inventory.semantic_inventory,
                        inventory_revision: 0,
                        presentation,
                        update: null,
                        dispose: null,
                    };
                    const applyHostedPoint = (attachPoint) => {
                        if (!attachPoint || attachPoint.version === presentation.hosted_objects.version)
                            return;
                        const synced = syncHostedSceneObjectMeshes({
                            THREE,
                            meshes: hostedMeshes,
                            parent: scene,
                            objects: attachPoint.value?.objects || [],
                            version: attachPoint.version,
                        });
                        if (synced.structure_changed)
                            composition.inventory_revision += 1;
                        composition.revision =
                            `${content.location_id}:${content.world_id}:hosted-${attachPoint.version ?? "unknown"}`;
                        composition.semantic_inventory = [
                            ...inventory.semantic_inventory,
                            ...synced.object_ids.map((id) => `demo-scene-object-${id}`),
                        ];
                        presentation.hosted_objects = {
                            attach_point_id: attachPoint.attach_point_id || null,
                            version: attachPoint.version ?? null,
                            refresh_owner: "PortalRenderController existing bounded client pull",
                            refresh_cadence_ms: 100,
                            streaming: false,
                            objects: Array.from(hostedMeshes.values(), (mesh) => ({
                                ...mesh.userData.hostedSceneObject,
                                scene_name: mesh.name,
                                position: [mesh.position.x, mesh.position.y, mesh.position.z],
                                instance_count: 1,
                            })),
                        };
                    };
                    applyHostedPoint(content.hosted_point);
                    const unsubscribe = typeof content.subscribeHostedPoint === "function"
                        ? content.subscribeHostedPoint(applyHostedPoint)
                        : null;
                    composition.dispose = () => {
                        try {
                            unsubscribe?.();
                        }
                        catch { }
                        disposeHostedSceneObjectMeshes(hostedMeshes);
                    };
                    return composition;
                }
                if (content?.kind !== "authored_wow_graph" || !content.graph) {
                    throw new Error("portal destination has no canonical scene authority");
                }
                const width = Math.max(1, Number(context?.width) || 1);
                const height = Math.max(1, Number(context?.height) || 1);
                const built = buildWowScene(content.graph, () => new ThreeRenderAdapter(THREE), {
                    width,
                    height,
                    source: "portal_canonical_authored_wow_graph",
                });
                const airportTerminal = mountAirportTerminalContent(content.graph, built, THREE, { document: documentTarget, motionPreference, hudOverlay: false });
                hideStageDebugVisuals(built.scene, true);
                const assetState = {
                    status: built.asset_nodes?.length ? "pending" : "settled",
                    requested: built.asset_nodes?.length || 0,
                    loaded: 0,
                    failed: 0,
                };
                let disposed = false;
                if (built.asset_nodes?.length) {
                    void mountWowSceneAssets(built.asset_nodes, () => new ThreeRenderAdapter(THREE), {
                        loadGltf,
                        cloneScene,
                        cache: destinationAssetCache,
                        shouldMount: () => !disposed,
                        baseUrl: content.base_url || content.graph_url || locationHref,
                        onAsset: (item, model, assetRecord) => {
                            void built.airport_entity_runtime?.attachAsset(item, model, assetRecord);
                        },
                    }).then((summary) => Object.assign(assetState, summary, { status: "settled" }))
                        .catch((error) => Object.assign(assetState, {
                        status: "error",
                        error: error?.message || String(error),
                    }));
                }
                return {
                    scene: built.scene,
                    source: "shared_buildWowScene+mountAirportTerminalContent",
                    revision: content.revision,
                    semantic_inventory: Array.from(built.scene.children || [], (node) => node.name || node.type),
                    presentation: {
                        graph_spatial_id: content.graph.spatialID || content.world_id,
                        airport_terminal: airportTerminal,
                        render_summary: built.render_summary,
                        assets: assetState,
                    },
                    update: (seconds, camera) => built.airport_entity_runtime?.update(seconds, camera),
                    dispose: () => {
                        disposed = true;
                        built.airport_hud_overlay?.dispose();
                        built.airport_entity_runtime?.dispose();
                    },
                };
            },
            controlledPlayerId: () => {
                const capabilities = runtime();
                return capabilities && typeof capabilities.controlledPlayerId === "function"
                    ? capabilities.controlledPlayerId()
                    : null;
            },
        });
        return previewManager;
    }
    function bindPreviewToCurrent(validPortalKeys = null) {
        const manager = ensurePreviewManager();
        if (!manager)
            return;
        const impl = currentScene && currentScene._impl;
        if (impl &&
            currentScene.rendererKind === "webgl" &&
            impl.renderer &&
            impl.camera &&
            impl.scene) {
            manager.bindScene(impl.renderer, impl.camera, impl.scene);
        }
        else {
            manager.bindScene(null, null, null);
        }
        if (validPortalKeys)
            manager.pruneToPortalKeys(validPortalKeys);
    }
    function hideStageDebugVisuals(root, force = false) {
        if ((!stageMode && !force) || !root || typeof root.traverse !== "function")
            return 0;
        let hidden = 0;
        root.traverse((node) => {
            const name = String((node && node.name) || "");
            const debugVisual = node.type === "GridHelper" ||
                name.startsWith("wow-group-gizmo:") ||
                name === "fabric-root-portal-trigger-node" ||
                name.startsWith("fabric-prefetch-zone-ring") ||
                name === "demo-portal-drag-handle" ||
                name === "portal-frame-right-axis";
            if (debugVisual && node.visible !== false) {
                node.visible = false;
                hidden += 1;
            }
        });
        documentTarget.body.setAttribute("data-stage-debug-visuals-hidden", String(hidden));
        return hidden;
    }
    function activeAuthoredAirport(world) {
        const capabilities = runtime();
        const resolved = capabilities && typeof capabilities.wowResolved === "function"
            ? capabilities.wowResolved()
            : null;
        if (world?.location_id !== "location-airport" ||
            resolved?.spatialID !== "world-airport-terminal" ||
            !resolved.graph)
            return null;
        return resolved;
    }
    function clearLiveAuthoredPublication() {
        liveAuthoredSceneSurface = null;
        documentTarget.body.removeAttribute("data-airport-backend-scene");
        documentTarget.body.removeAttribute("data-airport-terminal-ready");
        documentTarget.body.removeAttribute("data-wow-asset-nodes");
        documentTarget.body.removeAttribute("data-wow-assets-loaded");
        documentTarget.body.removeAttribute("data-wow-assets-failed");
        delete windowTarget.__airportBackendScene;
    }
    function mountLiveAuthoredAirport({ world, resolved, phase, reason }) {
        const host = mount();
        const width = (host && host.clientWidth) || 1100;
        const height = (host && host.clientHeight) || 660;
        const built = buildWowScene(resolved.graph, () => new ThreeRenderAdapter(THREE), {
            width,
            height,
            source: "live_backend_authored_wow_graph",
        });
        const airportTerminal = mountAirportTerminalContent(resolved.graph, built, THREE, { document: documentTarget, motionPreference });
        if (!airportTerminal?.walkable_surface?.entry_ground?.ok) {
            throw new Error("live airport authored graph has no rendered entry ground");
        }
        hideStageDebugVisuals(built.scene);
        const renderState = { frames: 0, error: null, renderer_kind: null, width, height };
        let alignment = null;
        const next = mountAlternateRenderer({
            built,
            renderState,
            width,
            height,
            world,
            beforeFirstRender: (sceneInstance) => {
                const capabilities = runtime();
                rehostAvatarLayers({ avatar: capabilities ? capabilities.avatar() : null });
                if (capabilities && typeof syncPeerAvatars === "function") {
                    syncPeerAvatars(capabilities.debugState());
                }
                alignment = typeof alignPortalVisual === "function"
                    ? alignPortalVisual(sceneInstance, world)
                    : null;
                if (typeof onPortalAlignment === "function")
                    onPortalAlignment(alignment);
                const entries = Array.isArray(world.portals) ? world.portals : [];
                bindPreviewToCurrent(entries.map((entry) => portalKey(entry)));
                if (typeof applyPlayerCamera === "function")
                    applyPlayerCamera();
            },
        });
        next.setPhase(phase);
        const assetNodes = built.asset_nodes || [];
        const assetState = {
            status: assetNodes.length ? "pending" : "settled",
            requested: assetNodes.length,
            loaded: 0,
            failed: 0,
        };
        let transferReadyPromise = null;
        if (assetNodes.length) {
            void mountWowSceneAssets(assetNodes, () => new ThreeRenderAdapter(THREE), {
                loadGltf,
                cloneScene,
                cache: destinationAssetCache,
                shouldMount: () => currentScene === next,
                beforeMount: () => {
                    if (!transferReadyPromise) {
                        transferReadyPromise = new Promise((resolve) => {
                            const waitForTransfer = () => {
                                const capabilities = runtime();
                                const handoffInFlight = capabilities?.isHandoffInFlight?.() === true;
                                if (currentScene !== next || !handoffInFlight) {
                                    resolve();
                                    return;
                                }
                                requestFrame(waitForTransfer);
                            };
                            waitForTransfer();
                        });
                    }
                    return transferReadyPromise.then(() => new Promise((resolve) => requestFrame(() => resolve())));
                },
                baseUrl: resolved.graph_url || resolved.base_url || locationHref,
                onAsset: (item, model, assetRecord) => {
                    void built.airport_entity_runtime?.attachAsset(item, model, assetRecord);
                },
            }).then((summary) => {
                Object.assign(assetState, summary, { status: "settled" });
                documentTarget.body.setAttribute("data-wow-assets-loaded", String(summary.loaded));
                documentTarget.body.setAttribute("data-wow-assets-failed", String(summary.failed));
            }).catch((error) => {
                Object.assign(assetState, {
                    status: "error",
                    error: (error && error.message) || String(error),
                });
                logLine(`live airport asset ingest failed: ${assetState.error}`);
            });
        }
        liveAuthoredSceneSurface = {
            source: "live_backend_authored_wow_graph",
            location_id: world.location_id,
            world_id: world.world_id,
            graph_url: resolved.graph_url,
            spatial_id: resolved.spatialID,
            node_count: resolved.node_count,
            renderer_kind: renderState.renderer_kind,
            one_selected_renderer: true,
            airport_terminal: airportTerminal,
            assets: assetState,
            reason: reason || "live_mount",
        };
        documentTarget.body.removeAttribute("data-client-scene-load");
        documentTarget.body.setAttribute("data-airport-backend-scene", "1");
        documentTarget.body.setAttribute("data-airport-terminal-ready", "1");
        documentTarget.body.setAttribute("data-wow-asset-nodes", String(assetNodes.length));
        documentTarget.body.setAttribute("data-wow-assets-loaded", "0");
        documentTarget.body.setAttribute("data-wow-assets-failed", "0");
        windowTarget.__airportBackendScene = liveAuthoredSceneSurface;
        const title = documentTarget.getElementById("loc-title");
        const meta = documentTarget.getElementById("loc-meta");
        const backend = documentTarget.getElementById("live-backend");
        if (title)
            title.textContent = world.title;
        if (meta)
            meta.textContent = `${world.location_id} · ${world.world_id} · ${world.session_id}`;
        if (backend) {
            backend.textContent = `${runtime()?.base || ""} · authored /wow/graph`;
            backend.style.color = "var(--ok)";
        }
        logLine(`live airport authored scene mounted (${reason || "live_mount"}): ` +
            `${airportTerminal.storefront_count} storefronts, ${airportTerminal.npc_count} travelers, ` +
            `one selected renderer`);
        return next;
    }
    function mountLive({ world, sceneRole, phase, reason = "live_mount" }) {
        if (disposed)
            throw new Error("scene runtime disposed");
        const authoredAirport = activeAuthoredAirport(world);
        if (authoredAirport) {
            clearClientScenePublication();
            return mountLiveAuthoredAirport({
                world,
                resolved: authoredAirport,
                phase,
                reason,
            });
        }
        clearLiveAuthoredPublication();
        disposeCurrent("scene dispose during live mount failed");
        const next = new SceneClass(mount(), sceneRole, world);
        next.setAvatar(null);
        next.setPhase(phase);
        publishScene(next);
        detachLegacyResizeOwner(next);
        if (lastViewport)
            resize();
        const alignment = typeof alignPortalVisual === "function" ? alignPortalVisual(next, world) : null;
        if (typeof onPortalAlignment === "function")
            onPortalAlignment(alignment);
        bindPreviewToCurrent();
        return next;
    }
    function clearClientScenePublication() {
        clientSceneLoadSurface = null;
        activeClientSceneGraph = null;
        documentTarget.body.removeAttribute("data-client-scene-load");
        documentTarget.body.removeAttribute("data-airport-terminal-ready");
        documentTarget.body.removeAttribute("data-wow-asset-nodes");
        documentTarget.body.removeAttribute("data-wow-assets-loaded");
        documentTarget.body.removeAttribute("data-wow-assets-failed");
        delete windowTarget.__airportLobbySceneLoad;
        if (windowTarget.__assembly)
            windowTarget.__assembly.clientSceneLoad = () => null;
    }
    function recomposeLive(reason) {
        const capabilities = runtime();
        if (!isPlayer || !capabilities || !capabilities.world)
            return null;
        const world = capabilities.world;
        if (clientSceneLoadSurface && activeClientSceneGraph && world.location_id === clientSceneLoadSurface.target.spatial_id) {
            const host = mount();
            const width = (host && host.clientWidth) || 1100;
            const height = (host && host.clientHeight) || 660;
            const built = buildWowScene(activeClientSceneGraph.graph, () => new ThreeRenderAdapter(THREE), {
                width,
                height,
                source: activeClientSceneGraph.source,
            });
            const airportTerminal = mountAirportTerminalContent(activeClientSceneGraph.graph, built, THREE, { document: documentTarget, motionPreference });
            if (!airportTerminal)
                throw new Error("airport scene recomposition lost terminal content");
            hideStageDebugVisuals(built.scene);
            const renderState = { frames: 0, error: null, renderer_kind: null, width, height };
            const next = mountAlternateRenderer({ built, renderState, width, height });
            rehostAvatarLayers({ avatar: capabilities.avatar() });
            if (typeof syncPeerAvatars === "function")
                syncPeerAvatars(capabilities.debugState());
            const entries = Array.isArray(world.portals) ? world.portals : [];
            const alignment = typeof alignPortalVisual === "function"
                ? alignPortalVisual(next, world)
                : null;
            if (typeof onPortalAlignment === "function")
                onPortalAlignment(alignment);
            bindPreviewToCurrent(entries.map((entry) => portalKey(entry)));
            clientSceneLoadSurface.airport_terminal = airportTerminal;
            clientSceneLoadSurface.recomposition = {
                reason: reason || "client_scene_recomposition",
                scene_identity: sceneIdentity,
                ground_contract_source: airportTerminal.walkable_surface.source,
            };
            const assetNodes = built.asset_nodes || [];
            if (assetNodes.length) {
                void mountWowSceneAssets(assetNodes, () => new ThreeRenderAdapter(THREE), {
                    loadGltf,
                    cloneScene,
                    cache: destinationAssetCache,
                    baseUrl: activeClientSceneGraph.base_url || activeClientSceneGraph.graph_url || locationHref,
                    onAsset: (item, model, assetRecord) => {
                        void built.airport_entity_runtime?.attachAsset(item, model, assetRecord);
                    },
                }).catch((error) => logLine(`airport recomposition asset ingest failed: ${(error && error.message) || String(error)}`));
            }
            if (typeof applyPlayerCamera === "function")
                applyPlayerCamera();
            logLine(`airport scene recomposed (${reason || "client_scene_recomposition"}); grounding contract rebound from local world data`);
            return next;
        }
        const next = mountLive({
            world,
            sceneRole: sceneRoleForDebug(capabilities.debugState()),
            phase: capabilities.phase(),
            reason: reason || "crossing",
        });
        rehostAvatarLayers({ avatar: capabilities.avatar() });
        if (typeof applyPlayerCamera === "function")
            applyPlayerCamera();
        if (typeof setupNavigatorRender === "function")
            setupNavigatorRender();
        const implementation = next && next._impl;
        if (implementation?.renderer?.render && implementation.scene && implementation.camera) {
            implementation.renderer.render(implementation.scene, implementation.camera);
        }
        const title = documentTarget.getElementById("loc-title");
        const meta = documentTarget.getElementById("loc-meta");
        const backend = documentTarget.getElementById("live-backend");
        if (title)
            title.textContent = world.title;
        if (meta)
            meta.textContent = `${world.location_id} · ${world.world_id} · ${world.session_id}`;
        if (backend) {
            backend.textContent = capabilities.base;
            backend.style.color = "var(--ok)";
        }
        if (reason === "return_to_lobby" || reason === "client_scene_load_failed")
            clearClientScenePublication();
        const entries = Array.isArray(world.portals) && world.portals.length
            ? world.portals
            : world.portal
                ? [world.portal]
                : [];
        if (previewManager)
            previewManager.pruneToPortalKeys(entries.map((entry) => portalKey(entry)));
        logLine(`world-navigator: active scene recomposed → ${world.location_id} (${reason || "crossing"}); ` +
            "same context, no page reload");
        return next;
    }
    function renderChildFabricPreviewPass(preview) {
        if (!isPlayer || !currentScene)
            return;
        const capabilities = runtime();
        const impl = currentScene._impl;
        const pass = impl && impl.childFabricRender;
        if (!pass || !pass.active || !impl.renderer || !impl.scene)
            return;
        const primaryKey = capabilities?.world?.portal ? portalKey(capabilities.world.portal) : null;
        if (primaryKey && previewManager?.surfaceActive?.(primaryKey))
            return;
        const rel = preview && preview.source_camera_relative_to_portal
            ? preview.source_camera_relative_to_portal.local_position
            : null;
        const lx = rel && Number.isFinite(Number(rel.x)) ? Number(rel.x) : 0;
        const ly = rel && Number.isFinite(Number(rel.y)) ? Number(rel.y) : 0;
        const lateral = Math.max(-0.5, Math.min(0.5, -lx * 0.25));
        const vertical = Math.max(-0.25, Math.min(0.25, ly * 0.12));
        const anchor = pass.anchor;
        pass.camera.position.set(anchor.portal[0] - anchor.dir[0] * 0.55 + anchor.right[0] * lateral, 1.6 + vertical, anchor.portal[2] - anchor.dir[2] * 0.55 + anchor.right[2] * lateral);
        pass.camera.lookAt(anchor.spawn[0], 1.15, anchor.spawn[2]);
        const renderer = impl.renderer;
        const previousTarget = renderer.getRenderTarget();
        if (!pass._prevClearColor)
            pass._prevClearColor = new THREE.Color();
        renderer.getClearColor(pass._prevClearColor);
        const previousAlpha = renderer.getClearAlpha();
        renderer.setRenderTarget(pass.renderTarget);
        renderer.setClearColor(pass.clearColor, 1);
        renderer.clear();
        renderer.render(impl.scene, pass.camera);
        renderer.setRenderTarget(previousTarget);
        renderer.setClearColor(pass._prevClearColor, previousAlpha);
        if (capabilities && typeof capabilities.markChildFabricPreviewFrame === "function") {
            capabilities.markChildFabricPreviewFrame();
        }
    }
    function mountAlternateRenderer({ built, renderState, width, height, world = null, beforeFirstRender = null }) {
        if (disposed)
            throw new Error("scene runtime disposed");
        if (!built || !built.scene || !built.camera)
            throw new Error("alternate renderer requires a built scene");
        disposeCurrent("scene dispose during alternate mount failed");
        const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: false });
        renderer.setPixelRatio(1);
        renderer.setSize(width, height, false);
        const host = mount();
        if (host) {
            host.appendChild(renderer.domElement);
        }
        renderState.renderer_kind = "three-webgl";
        let frame = 0;
        let stopped = false;
        let previousFrameTime = null;
        const renderOnce = () => {
            if (stopped)
                return;
            try {
                renderer.render(built.scene, built.camera);
                renderState.frames += 1;
            }
            catch (error) {
                renderState.error = (error && error.message) || String(error);
            }
        };
        const loop = (timestamp) => {
            const seconds = previousFrameTime == null ? 0 : (Number(timestamp) - previousFrameTime) / 1000;
            previousFrameTime = Number(timestamp);
            built.airport_entity_runtime?.update(seconds, built.camera);
            renderOnce();
            if (!stopped)
                frame = requestFrame(loop);
        };
        const next = {
            _impl: { scene: built.scene, camera: built.camera, renderer },
            world,
            rendererKind: "webgl",
            setPhase() { },
            setAvatar() { },
            resize() { },
            dispose() {
                if (stopped)
                    return;
                stopped = true;
                if (frame)
                    cancelFrame(frame);
                frame = 0;
                try {
                    built.airport_hud_overlay?.dispose();
                }
                catch { }
                try {
                    built.airport_entity_runtime?.dispose();
                }
                catch { }
                try {
                    renderer.dispose();
                }
                catch { }
                if (renderer.domElement && renderer.domElement.parentNode) {
                    renderer.domElement.parentNode.removeChild(renderer.domElement);
                }
            },
        };
        publishScene(next);
        resize();
        bindPreviewToCurrent();
        if (typeof beforeFirstRender === "function")
            beforeFirstRender(next);
        built.airport_entity_runtime?.update(0, built.camera);
        renderOnce();
        frame = requestFrame(loop);
        return next;
    }
    function probeVisiblePixels() {
        const renderer = currentScene && currentScene._impl ? currentScene._impl.renderer : null;
        if (!renderer)
            return { ok: false, reason: "no_renderer", non_black: 0 };
        const canvas = renderer.domElement;
        const width = canvas.width;
        const height = canvas.height;
        try {
            const sampleCanvas = documentTarget.createElement("canvas");
            sampleCanvas.width = width;
            sampleCanvas.height = height;
            const context = sampleCanvas.getContext("2d");
            context.drawImage(canvas, 0, 0);
            const data = context.getImageData(0, 0, width, height).data;
            let sampled = 0;
            let nonBlack = 0;
            let maxLum = 0;
            for (let index = 0; index + 2 < data.length; index += 4 * 53) {
                sampled += 1;
                const lum = data[index] + data[index + 1] + data[index + 2];
                if (lum > 24)
                    nonBlack += 1;
                if (lum > maxLum)
                    maxLum = lum;
            }
            return {
                ok: nonBlack > 0,
                width,
                height,
                sampled,
                non_black: nonBlack,
                fraction: Number((nonBlack / Math.max(1, sampled)).toFixed(4)),
                max_lum: maxLum,
            };
        }
        catch (error) {
            return { ok: false, reason: (error && error.message) || String(error), non_black: 0 };
        }
    }
    async function mountClientSceneLoad(target) {
        const capabilities = runtime();
        if (!capabilities || !isPlayer)
            throw new Error("client scene load requires the player runtime");
        if (clientSceneLoadInFlight)
            throw new Error("client scene load already in flight");
        clientSceneLoadInFlight = true;
        let replacementScene = null;
        try {
            if (target && target.transition === "client_scene_return") {
                if (typeof capabilities.beginVisualTransition === "function") {
                    capabilities.beginVisualTransition({
                        kind: "client_scene_return",
                        source_location_id: capabilities.world?.location_id || null,
                        target_location_id: target.spatial_id || "location-lobby",
                    });
                }
                const returned = await capabilities.returnFromClientSceneLoad({
                    reciprocalPortalId: target.portal_id,
                });
                if (!returned || !returned.ok) {
                    if (typeof capabilities.abortVisualTransition === "function") {
                        capabilities.abortVisualTransition({ restore: false });
                    }
                    throw new Error(returned && returned.reason ? returned.reason : "runtime rejected reciprocal scene return");
                }
                return returned;
            }
            const resolved = await capabilities.resolveClientSceneLoad(target);
            const contract = airportSceneContract(resolved.graph, target);
            if (!contract)
                throw new Error("airport graph failed its scene-load contract");
            const host = mount();
            const width = (host && host.clientWidth) || 1100;
            const height = (host && host.clientHeight) || 660;
            const built = buildWowScene(resolved.graph, () => new ThreeRenderAdapter(THREE), { width, height, source: resolved.source });
            const airportTerminal = mountAirportTerminalContent(resolved.graph, built, THREE, { document: documentTarget, motionPreference });
            if (!airportTerminal)
                throw new Error("airport graph did not mount airport-terminal content");
            const groundContract = airportTerminal.walkable_surface;
            if (!groundContract?.entry_ground?.ok)
                throw new Error("airport entry spawn has no rendered walkable surface");
            contract.entry_spawn.position[1] = groundContract.entry_ground.surface_y_m;
            hideStageDebugVisuals(built.scene);
            const walkable = built.render_summary && built.render_summary.walkable_extent
                ? built.render_summary.walkable_extent
                : null;
            const surfaceBounds = groundContract.surfaces.reduce((bounds, surface) => {
                const halfX = surface.size_m[0] / 2;
                const halfZ = surface.size_m[2] / 2;
                bounds.minX = Math.min(bounds.minX, surface.center_m[0] - halfX);
                bounds.maxX = Math.max(bounds.maxX, surface.center_m[0] + halfX);
                bounds.minZ = Math.min(bounds.minZ, surface.center_m[2] - halfZ);
                bounds.maxZ = Math.max(bounds.maxZ, surface.center_m[2] + halfZ);
                return bounds;
            }, { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });
            const bounds = Number.isFinite(surfaceBounds.minX) ? surfaceBounds : null;
            const renderState = { frames: 0, error: null, renderer_kind: null, width, height };
            if (typeof capabilities.beginVisualTransition === "function") {
                capabilities.beginVisualTransition({
                    kind: "client_scene_load",
                    source_location_id: capabilities.world?.location_id || null,
                    target_location_id: contract.spatial_id,
                });
            }
            const entered = await capabilities.enterClientSceneLoad({ target, contract, resolved, bounds });
            if (!entered || !entered.ok) {
                throw new Error(entered && entered.reason ? entered.reason : "runtime rejected client scene load");
            }
            if (typeof seedOrbitCamera === "function") {
                seedOrbitCamera({ azimuth: Math.PI, avatarPosition: contract.entry_spawn.position });
            }
            if (typeof capabilities.commitVisualTransition === "function") {
                capabilities.commitVisualTransition({ emit: true });
            }
            const destinationCapabilities = runtime() || capabilities;
            const reciprocalEntries = Array.isArray(destinationCapabilities.world?.portals)
                ? destinationCapabilities.world.portals
                : [];
            let alignment = null;
            replacementScene = mountAlternateRenderer({
                built,
                renderState,
                width,
                height,
                beforeFirstRender: (next) => {
                    rehostAvatarLayers({ avatar: destinationCapabilities.avatar() });
                    if (typeof syncPeerAvatars === "function") {
                        syncPeerAvatars(destinationCapabilities.debugState());
                    }
                    alignment = typeof alignPortalVisual === "function"
                        ? alignPortalVisual(next, destinationCapabilities.world)
                        : null;
                    if (typeof onPortalAlignment === "function")
                        onPortalAlignment(alignment);
                    bindPreviewToCurrent(reciprocalEntries.map((entry) => portalKey(entry)));
                    if (typeof applyPlayerCamera === "function")
                        applyPlayerCamera();
                },
            });
            const title = resolved.graph.title || "Denver Skyport";
            const titleElement = documentTarget.getElementById("loc-title");
            const metaElement = documentTarget.getElementById("loc-meta");
            const backendElement = documentTarget.getElementById("live-backend");
            if (titleElement)
                titleElement.textContent = title;
            if (metaElement)
                metaElement.textContent = `${contract.spatial_id} · client scene load · same player session`;
            if (backendElement) {
                backendElement.textContent = `${target.graph_endpoint} (local-data-backed scene; no backend handoff)`;
                backendElement.style.color = "var(--muted, #9aa)";
            }
            documentTarget.body.setAttribute("data-client-scene-load", "airport");
            documentTarget.body.setAttribute("data-airport-terminal-ready", "1");
            documentTarget.body.setAttribute("data-wow-asset-nodes", String((built.asset_nodes || []).length));
            documentTarget.body.setAttribute("data-wow-assets-loaded", "0");
            documentTarget.body.setAttribute("data-wow-assets-failed", "0");
            const assetNodes = built.asset_nodes || [];
            const assetState = {
                status: assetNodes.length ? "pending" : "settled",
                requested: assetNodes.length,
                loaded: 0,
                failed: 0,
            };
            if (assetNodes.length) {
                const assetBaseUrl = resolved.base_url || resolved.graph_url || locationHref;
                void mountWowSceneAssets(assetNodes, () => new ThreeRenderAdapter(THREE), {
                    loadGltf,
                    cloneScene,
                    cache: destinationAssetCache,
                    baseUrl: assetBaseUrl,
                    onAsset: (item, model, assetRecord) => {
                        void built.airport_entity_runtime?.attachAsset(item, model, assetRecord);
                        logLine(`airport asset ${item.status}: ${item.label}` +
                            `${item.from_cache ? " (cache)" : ""}${item.error ? " — " + item.error : ""}`);
                    },
                }).then((summary) => {
                    Object.assign(assetState, summary, { status: "settled" });
                    documentTarget.body.setAttribute("data-wow-assets-loaded", String(summary.loaded));
                    documentTarget.body.setAttribute("data-wow-assets-failed", String(summary.failed));
                    logLine(`airport assets settled: loaded=${summary.loaded} failed=${summary.failed}`);
                }).catch((error) => {
                    Object.assign(assetState, { status: "error", error: (error && error.message) || String(error) });
                    logLine(`airport asset ingest failed: ${assetState.error}`);
                });
            }
            clientSceneLoadSurface = {
                target,
                contract,
                graph: {
                    spatialID: resolved.spatialID,
                    graph_url: resolved.graph_url,
                    node_count: resolved.node_count,
                },
                airport_terminal: airportTerminal,
                walkable_extent: walkable,
                assets: assetState,
                entered,
            };
            activeClientSceneGraph = {
                graph: resolved.graph,
                source: resolved.source,
                base_url: resolved.base_url,
                graph_url: resolved.graph_url,
            };
            if (windowTarget.__assembly) {
                windowTarget.__assembly.clientSceneLoad = () => ({
                    ...clientSceneLoadSurface,
                    adapter: capabilities.debugState().client_scene_load,
                });
            }
            windowTarget.__airportLobbySceneLoad = clientSceneLoadSurface;
            logLine(`airport scene ready: ${airportTerminal.storefront_count} storefronts, ` +
                `${airportTerminal.npc_count} travelers, ${airportTerminal.gate.gate}; ` +
                `spawn=${vec3Label(contract.entry_spawn.position)}`);
            showToast("Denver Skyport", "Airport terminal loaded in the same player session.", "arrived");
            return clientSceneLoadSurface;
        }
        catch (error) {
            if (replacementScene && currentScene === replacementScene)
                disposeCurrent("airport scene dispose after failure failed");
            else
                disposeScene(replacementScene, "airport scene dispose after failure failed");
            const debug = typeof capabilities.rawDebugState === "function"
                ? capabilities.rawDebugState()
                : capabilities.debugState();
            if (debug && debug.client_scene_load && debug.client_scene_load.active) {
                await capabilities.returnFromClientSceneLoad();
            }
            else if (capabilities.world) {
                recomposeLive("client_scene_load_failed");
            }
            if (typeof capabilities.abortVisualTransition === "function") {
                capabilities.abortVisualTransition({ restore: false });
            }
            throw error;
        }
        finally {
            clientSceneLoadInFlight = false;
        }
    }
    function cameraSpaceOfPoint(point) {
        const impl = currentScene && currentScene._impl;
        if (!impl || !impl.camera || !Array.isArray(point) || point.length < 3)
            return null;
        impl.camera.updateMatrixWorld(true);
        const inverse = new THREE.Matrix4().copy(impl.camera.matrixWorld).invert();
        const value = new THREE.Vector3(Number(point[0]) || 0, Number(point[1]) || 0, Number(point[2]) || 0).applyMatrix4(inverse);
        return [Number(value.x.toFixed(4)), Number(value.y.toFixed(4)), Number(value.z.toFixed(4))];
    }
    function dispose() {
        if (disposed)
            return;
        disposed = true;
        if (previewManager)
            previewManager.dispose();
        previewManager = null;
        disposeCurrent("scene runtime dispose failed");
        clearClientScenePublication();
        clearLiveAuthoredPublication();
    }
    return Object.freeze({
        scene: () => currentScene,
        rendererKind: () => currentScene ? currentScene.rendererKind : null,
        avatarHost: sceneHost,
        rehostAvatarLayers,
        hideStageDebugVisuals,
        mountLive,
        recomposeLive,
        mountAlternateRenderer,
        mountClientSceneLoad,
        renderChildFabricPreview: renderChildFabricPreviewPass,
        refreshNavigator: () => {
            if (typeof setupNavigatorRender === "function")
                setupNavigatorRender();
        },
        renderPortalPreviews: () => { if (previewManager)
            previewManager.renderActive(); },
        syncPortalPeers: (peers) => {
            if (previewManager && typeof previewManager.setPeerPlayers === "function") {
                previewManager.setPeerPlayers(peers);
            }
        },
        portalSurface: (key, machine, entry) => previewManager
            ? previewManager.surfaceForPortal(key, machine, entry)
            : null,
        portalMachineRenderable: (machine) => PortalPreviewManagerClass.machineRenderable(machine),
        prunePortalKeys: (keys) => { if (previewManager)
            previewManager.pruneToPortalKeys(keys); },
        engagePortalTakeover: (key) => { if (previewManager)
            previewManager.engageTakeover(key); },
        disengagePortalTakeover: () => { if (previewManager)
            previewManager.disengageTakeover(); },
        portalTakeoverEngaged: () => !!(previewManager && previewManager.takeover.engaged),
        portalDebug: () => previewManager ? previewManager.debug() : null,
        destinationAssetCache: () => destinationAssetCache,
        samplePortalApertureTexels: (key, points) => previewManager
            ? previewManager.sampleApertureTexels(key, points)
            : null,
        probeVisiblePixels,
        cameraSpaceOfPoint,
        clientSceneLoad: () => clientSceneLoadSurface,
        liveAuthoredScene: () => liveAuthoredSceneSurface,
        clientSceneLoadInFlight: () => clientSceneLoadInFlight,
        resize,
        viewportDebug,
        debug: () => ({
            selected_runtime: currentScene ? currentScene.rendererKind : null,
            client_scene_load_in_flight: clientSceneLoadInFlight,
            client_scene_load_active: !!clientSceneLoadSurface,
            live_authored_scene_active: !!liveAuthoredSceneSurface,
            portal_preview_bound: !!previewManager,
            disposed,
        }),
        dispose,
    });
}
