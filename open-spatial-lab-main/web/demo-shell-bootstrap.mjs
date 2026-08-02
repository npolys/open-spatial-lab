import { mountDemoLauncher, parseIntroPreference } from "./demo-launcher.mjs";
const mount = document.getElementById("demo-launcher-mount");
const app = document.getElementById("app");
const viewsButton = document.getElementById("btn-views-home");
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
    // The <x3d> host it attaches to is only present in the DOM at all when this same query param
    // was already true during index.html's initial parse (see the classic <script> inside
    // #scene-mount) — this check just decides which module to load, it doesn't create anything.
    if (new URLSearchParams(location.search).get("renderer") === "x3dom") {
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
