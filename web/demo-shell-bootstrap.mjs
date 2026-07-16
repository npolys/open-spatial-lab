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
function hideLauncher() {
    if (teardownLauncher)
        teardownLauncher();
    teardownLauncher = null;
    mount.hidden = true;
    app.hidden = false;
    viewsButton?.setAttribute("aria-expanded", "false");
}
function showLauncher({ dismissible = appStarted } = {}) {
    if (teardownLauncher)
        teardownLauncher();
    mount.hidden = false;
    app.hidden = true;
    viewsButton?.setAttribute("aria-expanded", "true");
    teardownLauncher = mountDemoLauncher(mount, {
        airportAvailable: true,
        onDismiss: dismissible ? hideLauncher : undefined,
        launchPortalC: () => location.assign("./index.html?role=player&mission=denver-skyport"),
    });
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
