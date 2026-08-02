import { createEntityTag } from "./glassline-entity-tag.mjs";
const CSS_HREF = "hud/glassline-hud.css";
const ASSET_BASE = "assets/hud/";
const STOREFRONT_MAP = {
    "Skyline Coffee": "storefront-skyline-coffee",
    "Frontier News & Travel": "storefront-frontier-news",
    "High Plains Duty Free": "storefront-high-plains-duty-free",
    "Mesa Kitchen": "storefront-mesa-kitchen",
};
const TRAVELER_MAP = {
    Joe: "person-joe",
    Rose: "person-rose",
    Helium: "person-helium",
    Nea: "person-nea",
    Jane: "person-jane",
};
const STOREFRONT_TAG_Y = 4.4;
const TRAVELER_TAG_Y = 2.35;
const LOD_NEAR = 2;
const LOD_FAR = 30;
const COMPACT_LOD = 55;
const HIDDEN_LOD_CUTOFF = 20;
// Screen-space equivalent of the old NDC offscreen tolerance (|ndc| up to 1.4, i.e. 40% past
// the [-1,1] edge): at ndc=1.4, pixel = (1.4*0.5+0.5)*dimension = 1.2*dimension, so the
// tolerance band is 20% of the viewport dimension beyond each edge, symmetric on every side.
const OFFSCREEN_MARGIN_FRACTION = 0.2;
function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
}
function compactHalfRect(entity) {
    const n = String(entity.name || "").length;
    return { hw: Math.min(180, 26 + n * 6), hh: 23 };
}
function rectsOverlap(a, b, margin = 3) {
    return (Math.abs(a.cx - b.cx) < a.hw + b.hw + margin &&
        Math.abs(a.cy - b.cy) < a.hh + b.hh + margin);
}
function nodePosition(node) {
    const m = node && Array.isArray(node.localTransform) ? node.localTransform : null;
    return m && m.length === 16
        ? [Number(m[12]) || 0, Number(m[13]) || 0, Number(m[14]) || 0]
        : [0, 0, 0];
}
function ensureStylesheet(doc) {
    if (!doc || !doc.head)
        return;
    if (doc.querySelector('link[data-glassline-hud="1"]'))
        return;
    const link = doc.createElement("link");
    link.rel = "stylesheet";
    link.href = CSS_HREF;
    link.setAttribute("data-glassline-hud", "1");
    doc.head.appendChild(link);
}
function buildEntities(stores, travelers) {
    const out = [];
    for (const node of stores || []) {
        const slug = STOREFRONT_MAP[node && node.label];
        if (!slug)
            continue;
        const [x, , z] = nodePosition(node);
        out.push({
            slug,
            name: node.label,
            accent: "green",
            x,
            y: STOREFRONT_TAG_Y,
            z,
        });
    }
    for (const node of travelers || []) {
        const ext = (node && node.webofworlds_extension) || {};
        const name = ext.actor && ext.actor.display_name;
        const slug = TRAVELER_MAP[name];
        if (!slug)
            continue;
        const [x, , z] = nodePosition(node);
        out.push({
            slug,
            name,
            accent: "cyan",
            x,
            y: TRAVELER_TAG_Y,
            z,
        });
    }
    return out;
}
export function initAirportHudOverlay(options = {}) {
    const { adapter, camera, scene } = options;
    const doc = options.document || (typeof document !== "undefined" ? document : null);
    const raf = typeof requestAnimationFrame !== "undefined" ? requestAnimationFrame : null;
    const caf = typeof cancelAnimationFrame !== "undefined" ? cancelAnimationFrame : null;
    if (!adapter || !camera || !doc || typeof doc.createElement !== "function" || !raf) {
        return null;
    }
    const host = options.host || (typeof doc.getElementById === "function" ? doc.getElementById("scene-mount") : null);
    if (!host)
        return null;
    // ThreeRenderAdapter.worldToScreen() reads its width/height from a bound container (see its
    // attach()) — this adapter instance is never mount()ed (the live scene already owns the real
    // renderer), so it needs an explicit bind. X3DOMRenderAdapter needs no such thing (it reads
    // size off the live runtime directly), so this is deliberately engine-conditional.
    if (adapter.kind === "three" && typeof adapter.attach === "function") {
        adapter.attach(host);
    }
    let manifestCardLayer = null;
    let manifestCardLayerWasVisible = false;
    try {
        if (host.__glasslineHud && typeof host.__glasslineHud.dispose === "function") {
            host.__glasslineHud.dispose();
        }
        manifestCardLayer =
            scene && typeof scene.getObjectByName === "function"
                ? scene.getObjectByName("airport-entity-manifest-cards")
                : null;
        if (manifestCardLayer) {
            manifestCardLayerWasVisible = manifestCardLayer.visible;
            manifestCardLayer.visible = false;
        }
        ensureStylesheet(doc);
        const layer = doc.createElement("div");
        layer.className = "glassline-hud-layer";
        layer.setAttribute("data-glassline-hud-layer", "1");
        host.appendChild(layer);
        const entities = buildEntities(options.stores, options.travelers);
        for (const entity of entities) {
            const wrapper = doc.createElement("div");
            wrapper.className = "glassline-anchor";
            wrapper.setAttribute("data-slug", entity.slug);
            const tag = createEntityTag({
                title: entity.name,
                slotId: `hud-${entity.slug}`,
                src: `${ASSET_BASE}${entity.slug}--profile.jpg`,
                accent: entity.accent,
                lod: COMPACT_LOD,
            });
            wrapper.appendChild(tag.el);
            layer.appendChild(wrapper);
            entity.wrapper = wrapper;
            entity.tag = tag;
        }
        let frameId = 0;
        let stopped = false;
        function frame() {
            if (stopped)
                return;
            try {
                if (!layer.isConnected) {
                    dispose();
                    return;
                }
                const w = layer.clientWidth || host.clientWidth || 1;
                const h = layer.clientHeight || host.clientHeight || 1;
                const marginX = w * OFFSCREEN_MARGIN_FRACTION;
                const marginY = h * OFFSCREEN_MARGIN_FRACTION;
                // three.js's camera.matrixWorldInverse is normally refreshed by the renderer's own
                // render() call each frame, but this HUD frame() can run before that — keep forcing
                // freshness here, same as before this was adapter-routed. No X3D camera element has
                // this method, so the guard is a no-op there (X3DOMRenderAdapter.worldToScreen reads
                // straight off the live runtime instead).
                if (typeof camera.updateMatrixWorld === "function")
                    camera.updateMatrixWorld();
                const visible = [];
                for (const entity of entities) {
                    const worldPosition = [entity.x, entity.y, entity.z];
                    const projected = adapter.worldToScreen(camera, worldPosition);
                    const offscreen = !projected || projected.x < -marginX || projected.x > w + marginX ||
                        projected.y < -marginY || projected.y > h + marginY;
                    if (!projected || !projected.visible || offscreen) {
                        entity.wrapper.style.display = "none";
                        entity.wrapper.style.pointerEvents = "none";
                        entity.wrapper.removeAttribute("data-tier");
                        continue;
                    }
                    entity.sx = projected.x;
                    entity.sy = projected.y;
                    entity.dist = adapter.cameraDistanceTo(camera, worldPosition);
                    entity.baseLod = clamp(100 - ((entity.dist - LOD_NEAR) / (LOD_FAR - LOD_NEAR)) * 100, 0, 100);
                    visible.push(entity);
                }
                visible.sort((a, b) => a.dist - b.dist);
                const placed = [];
                for (const entity of visible) {
                    const compactRect = {
                        cx: entity.sx,
                        cy: entity.sy,
                        ...compactHalfRect(entity),
                    };
                    const hiddenByDistance = entity.baseLod < HIDDEN_LOD_CUTOFF;
                    const hiddenByOverlap = !hiddenByDistance &&
                        placed.some((placedRect) => rectsOverlap(compactRect, placedRect));
                    if (hiddenByDistance || hiddenByOverlap) {
                        entity.finalTier = null;
                        continue;
                    }
                    entity.finalTier = "compact";
                    placed.push(compactRect);
                }
                for (const entity of visible) {
                    if (entity.finalTier !== "compact") {
                        entity.wrapper.style.display = "none";
                        entity.wrapper.style.pointerEvents = "none";
                        entity.wrapper.removeAttribute("data-tier");
                        continue;
                    }
                    entity.wrapper.style.display = "";
                    entity.wrapper.style.pointerEvents = "";
                    entity.wrapper.setAttribute("data-tier", "compact");
                    entity.wrapper.style.transform = `translate(-50%,-50%) translate(${entity.sx}px,${entity.sy}px)`;
                    entity.wrapper.style.zIndex = String(Math.round(30000 - entity.dist * 100));
                    entity.tag.update({ lod: COMPACT_LOD });
                }
            }
            catch (err) {
                if (!frame.__warned) {
                    frame.__warned = true;
                    console.warn("[glassline-hud] frame error (overlay continues):", err);
                }
            }
            frameId = raf(frame);
        }
        function dispose() {
            if (stopped)
                return;
            stopped = true;
            if (frameId && caf)
                caf(frameId);
            frameId = 0;
            if (layer.parentNode)
                layer.parentNode.removeChild(layer);
            if (manifestCardLayer) {
                manifestCardLayer.visible = manifestCardLayerWasVisible;
            }
            if (host.__glasslineHud === handle)
                delete host.__glasslineHud;
            if (typeof window !== "undefined" && window.__glasslineAirportHud === handle) {
                delete window.__glasslineAirportHud;
            }
        }
        const handle = {
            dispose,
            entityCount: entities.length,
            layer,
            manifestCardCount: manifestCardLayer?.children?.length || 0,
            legacyIdentityCardsHidden: Boolean(manifestCardLayer) && manifestCardLayer.visible === false,
        };
        host.__glasslineHud = handle;
        if (typeof window !== "undefined")
            window.__glasslineAirportHud = handle;
        frameId = raf(frame);
        return handle;
    }
    catch (err) {
        if (manifestCardLayer) {
            manifestCardLayer.visible = manifestCardLayerWasVisible;
        }
        console.warn("[glassline-hud] init failed (airport scene unaffected):", err);
        return null;
    }
}
export default { initAirportHudOverlay };
