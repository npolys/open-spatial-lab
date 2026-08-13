import { mountDemoLauncher, parseIntroPreference } from "./demo-launcher.mjs";
const mount = document.getElementById("demo-launcher-mount");
const app = document.getElementById("app");
const viewsButton = document.getElementById("btn-views-home");

// Phase 5 of the X3DOM parity plan — renderer-selection persistence. This is the FIRST
// localStorage usage anywhere in web/ (confirmed by grep before writing this — not a
// copy-pasted existing pattern). An explicit ?renderer= query param always wins over the stored
// preference (even ?renderer=three, to let a link force three.js despite a stored x3dom
// preference) — index.html's own inline classic <script> (the one that document.write()s the
// <x3d> host) duplicates this exact precedence independently, since a classic script can't
// import this module; keep the two in sync by hand if this logic ever changes.
const OSL_RENDERER_PREFERENCE_KEY = "osl-renderer-preference-v1";
function currentRendererPreference() {
    const explicit = new URLSearchParams(location.search).get("renderer");
    if (explicit)
        return explicit === "x3dom" ? "x3dom" : "three";
    try {
        return localStorage.getItem(OSL_RENDERER_PREFERENCE_KEY) === "x3dom" ? "x3dom" : "three";
    }
    catch {
        return "three";
    }
}
function wireRendererPreferenceToggle() {
    const button = document.getElementById("btn-renderer-preference");
    if (!button)
        return;
    const render = () => {
        const current = currentRendererPreference();
        button.textContent = current === "x3dom" ? "Renderer: X3DOM (preview)" : "Renderer: three.js";
        button.setAttribute("aria-pressed", current === "x3dom" ? "true" : "false");
    };
    button.addEventListener("click", () => {
        // Cannot be a live in-page toggle: the <x3d> host + Inline pool only exist in the DOM if
        // ?renderer=x3dom was already present before index.html's inline script ran during the
        // initial parse (see that script's own comment) — switching renderers always needs a
        // real navigation, never just an in-page state change.
        const next = currentRendererPreference() === "x3dom" ? "three" : "x3dom";
        try {
            localStorage.setItem(OSL_RENDERER_PREFERENCE_KEY, next);
        }
        catch { /* best-effort — an explicit query param on this same reload still works */ }
        const url = new URL(location.href);
        url.searchParams.set("renderer", next);
        location.assign(url.toString());
    });
    render();
}
wireRendererPreferenceToggle();
const introPreference = parseIntroPreference(location.href);
const url = new URL(location.href);
const nonIntroParams = [...url.searchParams.keys()].filter((key) => key !== "intro");
const isBareEntry = nonIntroParams.length === 0 && !url.hash;
let teardownLauncher = null;
let appStarted = false;
function hideLauncher({ restoreFocus = false } = {}) {
    if (teardownLauncher)
        teardownLauncher();
    teardownLauncher = null;
    mount.scrollTop = 0;
    mount.hidden = true;
    app.hidden = false;
    viewsButton?.setAttribute("aria-expanded", "false");
    void window.__assembly?.adapter?.resumeSession?.("resume_from_home");
    if (restoreFocus)
        viewsButton?.focus();
}
function showLauncher({ dismissible = appStarted } = {}) {
    if (teardownLauncher)
        teardownLauncher();
    if (appStarted) {
        window.dispatchEvent(new Event("blur"));
        void window.__assembly?.adapter?.leaveSession?.("home_button");
    }
    mount.hidden = false;
    app.hidden = true;
    viewsButton?.setAttribute("aria-expanded", "true");
    teardownLauncher = mountDemoLauncher(mount, {
        airportAvailable: true,
        onDismiss: dismissible ? () => hideLauncher({ restoreFocus: true }) : undefined,
        launchPortalC: () => location.assign("./index.html?role=player&mission=denver-skyport"),
    });
    mount.scrollTop = 0;
    const launcher = mount.querySelector(".demo-launcher");
    if (launcher) {
        launcher.tabIndex = -1;
        launcher.focus({ preventScroll: true });
    }
}
async function startApp() {
    if (appStarted)
        return;
    appStarted = true;
    hideLauncher();
    // X3DOM preview mode — a genuinely separate, additive boot path (web/x3dom-live-mode.mjs),
    // not a branch inside app.js. See the README's Render-engine adapter section for scope.
    // The <x3d> host it attaches to is only present in the DOM at all when the same explicit
    // query param (or a stored preference — see currentRendererPreference() above) was already
    // true during index.html's initial parse (see the classic <script> inside #scene-mount) —
    // this check just decides which module to load, it doesn't create anything.
    if (currentRendererPreference() === "x3dom") {
        await import("./x3dom-live-mode.mjs?v=1");
        return;
    }
    await import("./app.js?v=1");
}
viewsButton?.setAttribute("aria-expanded", "false");
viewsButton?.addEventListener("click", () => showLauncher({ dismissible: true }));
if (introPreference === "force" || (introPreference !== "bypass" && isBareEntry)) {
    showLauncher({ dismissible: false });
}
else {
    await startApp();
}
