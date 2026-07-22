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
