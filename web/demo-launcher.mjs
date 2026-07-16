import { createDemoLauncherCatalog, PRIMARY_MISSION_IDS, validateDemoLauncherCatalog, } from "./demo-launcher-catalog.mjs";
import { createMotionPreference } from "./motion-preference.mjs";
const LAST_MISSION_KEY = "osl-demo-launcher-last-mission-v1";
const PRIMARY_RECON_KEY = "osl-demo-launcher-primary-recon-v1";
export function parseIntroPreference(href) {
    const url = new URL(String(href), "http://osl.invalid/");
    const value = url.searchParams.get("intro");
    if (value === "1")
        return "force";
    if (value === "0")
        return "bypass";
    return "auto";
}
export function withoutIntroPreference(href) {
    const raw = String(href);
    const absolute = /^[a-z][a-z0-9+.-]*:/i.test(raw);
    const url = new URL(raw, "http://osl.invalid/");
    url.searchParams.delete("intro");
    return absolute ? url.href : `${url.pathname}${url.search}${url.hash}`;
}
export function availableMissions(catalog) {
    validateDemoLauncherCatalog(catalog);
    return catalog.filter((mission) => mission.availability === "available");
}
export function chooseSurpriseMission(catalog, random = Math.random) {
    const candidates = availableMissions(catalog);
    if (candidates.length === 0) {
        throw new Error("Surprise Me needs at least one available mission.");
    }
    const value = Number(random());
    if (!Number.isFinite(value) || value < 0 || value >= 1) {
        throw new RangeError("Surprise Me random source must return a value from 0 up to, but not including, 1.");
    }
    return candidates[Math.floor(value * candidates.length)];
}
export function resolveMissionLaunch(catalog, missionId) {
    validateDemoLauncherCatalog(catalog);
    const mission = catalog.find((entry) => entry.id === missionId) || null;
    if (!mission) {
        return { ok: false, mission: null, reason: "Unknown mission." };
    }
    if (mission.availability !== "available") {
        return {
            ok: false,
            mission,
            reason: mission.availabilityReason || "Mission is not available.",
        };
    }
    return { ok: true, mission, target: mission.target };
}
export function moveMissionFocus(currentIndex, delta, itemCount) {
    if (!Number.isInteger(currentIndex) || !Number.isInteger(delta) || !Number.isInteger(itemCount)) {
        throw new TypeError("Mission focus movement requires integer inputs.");
    }
    if (itemCount <= 0)
        return -1;
    return ((currentIndex + delta) % itemCount + itemCount) % itemCount;
}
export function launcherKeyAction(key, currentIndex, itemCount) {
    if (["ArrowRight", "ArrowDown"].includes(key)) {
        return { kind: "focus", index: moveMissionFocus(currentIndex, 1, itemCount) };
    }
    if (["ArrowLeft", "ArrowUp"].includes(key)) {
        return { kind: "focus", index: moveMissionFocus(currentIndex, -1, itemCount) };
    }
    if (key === "Home")
        return { kind: "focus", index: itemCount > 0 ? 0 : -1 };
    if (key === "End")
        return { kind: "focus", index: itemCount > 0 ? itemCount - 1 : -1 };
    if (key === "Enter" || key === " ")
        return { kind: "confirm" };
    if (key === "Escape")
        return { kind: "dismiss" };
    return { kind: "none" };
}
export function mountDemoLauncher(root, options = {}) {
    if (!root || root.nodeType !== 1 || !root.ownerDocument) {
        throw new TypeError("mountDemoLauncher needs a real HTML element.");
    }
    const catalog = options.catalog || createDemoLauncherCatalog({
        airportAvailable: options.airportAvailable === true,
    });
    validateDemoLauncherCatalog(catalog);
    const doc = root.ownerDocument;
    const view = doc.defaultView;
    const storage = options.storage || (view ? view.sessionStorage : null);
    const navigate = typeof options.navigate === "function"
        ? options.navigate
        : (target) => view.location.assign(target);
    root.replaceChildren();
    root.classList.add("demo-launcher-root");
    const shell = doc.createElement("main");
    shell.className = "demo-launcher";
    shell.setAttribute("aria-labelledby", "demo-launcher-title");
    const motionPreference = createMotionPreference({ view, target: shell });
    const orbit = doc.createElement("div");
    orbit.className = "demo-launcher-orbit";
    orbit.setAttribute("aria-hidden", "true");
    shell.append(orbit);
    const header = doc.createElement("header");
    header.className = "demo-launcher-header";
    const eyebrow = doc.createElement("p");
    eyebrow.className = "demo-launcher-eyebrow";
    eyebrow.textContent = options.previewLabel || "LOCAL SPATIAL MISSION CONTROL";
    const title = doc.createElement("h1");
    title.id = "demo-launcher-title";
    title.textContent = "ENTER THE OPEN SPATIAL LAB";
    const intro = doc.createElement("p");
    intro.className = "demo-launcher-intro";
    intro.textContent = "Pick a perspective. The worlds are local, the handoff is application-level, and the curiosity is entirely real.";
    header.append(eyebrow, title, intro);
    if (options.previewMode) {
        const previewNotice = doc.createElement("p");
        previewNotice.className = "demo-launcher-preview-notice";
        previewNotice.textContent = options.simulatedAvailability
            ? "STANDALONE PREVIEW - availability shown here is simulated preview data"
            : "STANDALONE PHASE A PREVIEW - not integrated into the live demo shell";
        header.append(previewNotice);
    }
    const topology = doc.createElement("section");
    topology.className = "demo-launcher-topology";
    topology.setAttribute("aria-label", "How the local worlds connect");
    const topologyRail = doc.createElement("div");
    topologyRail.className = "demo-launcher-topology-rail";
    for (const [label, accent] of [
        ["Player / Lobby", "lobby"],
        ["Server A", "server-a"],
        ["Server B", "server-b"],
    ]) {
        const node = doc.createElement("span");
        node.className = `demo-launcher-topology-node accent-${accent}`;
        node.textContent = label;
        topologyRail.append(node);
    }
    const airportBranch = doc.createElement("p");
    airportBranch.className = "demo-launcher-airport-branch";
    airportBranch.textContent = "Lobby -> Portal C -> Denver Skyport (client scene destination, not a server)";
    const topologyDetails = doc.createElement("details");
    topologyDetails.className = "demo-launcher-topology-details";
    const topologySummary = doc.createElement("summary");
    topologySummary.textContent = "How the worlds connect";
    const topologyCopy = doc.createElement("p");
    topologyCopy.textContent = "The browser uses one visual origin. Server A, Server B, and the lobby are local service nodes behind same-origin routes. Player crossings are application-level handoffs; Denver Skyport is a separate client-side scene-load destination.";
    topologyDetails.append(topologySummary, topologyCopy);
    topology.append(topologyRail, airportBranch, topologyDetails);
    const missionSection = doc.createElement("section");
    missionSection.className = "demo-launcher-missions";
    missionSection.setAttribute("aria-labelledby", "demo-launcher-missions-title");
    const missionHeading = doc.createElement("div");
    missionHeading.className = "demo-launcher-section-heading";
    const missionTitle = doc.createElement("h2");
    missionTitle.id = "demo-launcher-missions-title";
    missionTitle.textContent = "Choose your mission";
    const controlsHint = doc.createElement("p");
    controlsHint.textContent = "Arrow keys / D-pad move - Enter, Space, or gamepad A selects";
    missionHeading.append(missionTitle, controlsHint);
    const cardGrid = doc.createElement("div");
    cardGrid.className = "demo-launcher-card-grid";
    cardGrid.setAttribute("role", "group");
    cardGrid.setAttribute("aria-label", "Available demo views");
    const cardButtons = [];
    for (const mission of catalog) {
        const button = doc.createElement("button");
        button.type = "button";
        button.className = `demo-launcher-card accent-${mission.accent}`;
        button.dataset.missionId = mission.id;
        button.dataset.viewKind = mission.viewKind;
        button.disabled = mission.availability !== "available";
        button.setAttribute("aria-describedby", `mission-description-${mission.id}`);
        const cardTop = doc.createElement("span");
        cardTop.className = "demo-launcher-card-top";
        const emblem = doc.createElement("span");
        emblem.className = "demo-launcher-emblem";
        emblem.setAttribute("aria-hidden", "true");
        emblem.textContent = mission.emblem;
        const badge = doc.createElement("span");
        badge.className = "demo-launcher-badge";
        badge.textContent = mission.capabilityBadge;
        cardTop.append(emblem, badge);
        const label = doc.createElement("span");
        label.className = "demo-launcher-card-label";
        label.textContent = mission.label;
        const description = doc.createElement("span");
        description.className = "demo-launcher-card-description";
        description.id = `mission-description-${mission.id}`;
        description.textContent = mission.description;
        const facts = doc.createElement("span");
        facts.className = "demo-launcher-card-facts";
        for (const [factLabel, factValue] of [
            ["WHO", mission.who],
            ["WHERE", mission.where],
            ["VIEW", mission.reality],
        ]) {
            const fact = doc.createElement("span");
            const strong = doc.createElement("strong");
            strong.textContent = factLabel;
            fact.append(strong, doc.createTextNode(factValue));
            facts.append(fact);
        }
        button.append(cardTop, label, description, facts);
        if (mission.availability !== "available") {
            const reason = doc.createElement("span");
            reason.className = "demo-launcher-unavailable-reason";
            reason.textContent = mission.availabilityReason;
            button.append(reason);
        }
        cardGrid.append(button);
        cardButtons.push(button);
    }
    missionSection.append(missionHeading, cardGrid);
    const utilityBar = doc.createElement("section");
    utilityBar.className = "demo-launcher-utility-bar";
    utilityBar.setAttribute("aria-label", "Launcher shortcuts");
    const continueButton = doc.createElement("button");
    continueButton.type = "button";
    continueButton.className = "demo-launcher-utility-button";
    continueButton.textContent = "Continue Last Mission";
    const surpriseButton = doc.createElement("button");
    surpriseButton.type = "button";
    surpriseButton.className = "demo-launcher-utility-button utility-surprise";
    surpriseButton.textContent = "Surprise Me";
    const resetButton = doc.createElement("button");
    resetButton.type = "button";
    resetButton.className = "demo-launcher-utility-button utility-reset";
    resetButton.textContent = "Reset Session Extras";
    utilityBar.append(continueButton, surpriseButton, resetButton);
    const footer = doc.createElement("footer");
    footer.className = "demo-launcher-footer";
    const truth = doc.createElement("p");
    truth.textContent = "Runs entirely on this computer with a player lobby and connected local destinations";
    const prompt = doc.createElement("p");
    prompt.className = "demo-launcher-prompt";
    prompt.textContent = "Mission prompt: observe both worlds, then enter as the player who connects them.";
    footer.append(truth, prompt);
    const liveRegion = doc.createElement("p");
    liveRegion.className = "demo-launcher-live-region";
    liveRegion.setAttribute("role", "status");
    liveRegion.setAttribute("aria-live", "polite");
    liveRegion.setAttribute("aria-atomic", "true");
    shell.append(header, topology, missionSection, utilityBar, footer, liveRegion);
    root.append(shell);
    const enabledButtons = cardButtons.filter((button) => !button.disabled);
    let gamepadFrame = null;
    let previousGamepadButtons = new Set();
    function setLiveText(message) {
        liveRegion.textContent = "";
        view.setTimeout(() => {
            liveRegion.textContent = message;
        }, 0);
    }
    function getStoredMissionId() {
        try {
            return storage ? storage.getItem(LAST_MISSION_KEY) : null;
        }
        catch {
            return null;
        }
    }
    function setStoredMissionId(missionId) {
        try {
            if (storage)
                storage.setItem(LAST_MISSION_KEY, missionId);
        }
        catch {
            setLiveText("Session storage is unavailable; this mission will not be remembered.");
        }
    }
    function recordPrimaryRecon(missionId) {
        if (!PRIMARY_MISSION_IDS.includes(missionId))
            return;
        try {
            if (!storage)
                return;
            const previous = JSON.parse(storage.getItem(PRIMARY_RECON_KEY) || "[]");
            const opened = new Set(Array.isArray(previous) ? previous : []);
            opened.add(missionId);
            storage.setItem(PRIMARY_RECON_KEY, JSON.stringify([...opened]));
            if (opened.size === PRIMARY_MISSION_IDS.length) {
                setLiveText("Recon challenge complete: all three primary perspectives opened this session.");
            }
        }
        catch {
        }
    }
    function refreshContinueControls() {
        const result = resolveMissionLaunch(catalog, getStoredMissionId() || "");
        continueButton.disabled = !result.ok;
        continueButton.setAttribute("aria-label", result.ok ? `Continue last mission: ${result.mission.label}` : "Continue last mission; none saved");
        resetButton.disabled = !getStoredMissionId();
    }
    function activateMission(missionId) {
        const result = resolveMissionLaunch(catalog, missionId);
        if (!result.ok) {
            setLiveText(result.reason);
            return;
        }
        if (result.mission.launchMode === "portal-c-gated") {
            if (typeof options.launchPortalC !== "function") {
                setLiveText("Denver Skyport needs the Phase B Portal C integration hook before it can launch.");
                return;
            }
            setStoredMissionId(missionId);
            options.launchPortalC(result.mission);
            refreshContinueControls();
            return;
        }
        setStoredMissionId(missionId);
        recordPrimaryRecon(missionId);
        refreshContinueControls();
        navigate(result.target, result.mission);
    }
    for (const button of cardButtons) {
        button.addEventListener("click", () => activateMission(button.dataset.missionId));
    }
    continueButton.addEventListener("click", () => {
        const missionId = getStoredMissionId();
        if (missionId)
            activateMission(missionId);
    });
    surpriseButton.addEventListener("click", () => {
        const mission = chooseSurpriseMission(catalog, options.random || Math.random);
        const button = cardButtons.find((entry) => entry.dataset.missionId === mission.id);
        if (button)
            button.focus();
        setLiveText(`Surprise mission selected: ${mission.label}. Press Enter to launch.`);
    });
    resetButton.addEventListener("click", () => {
        try {
            if (storage) {
                storage.removeItem(LAST_MISSION_KEY);
                storage.removeItem(PRIMARY_RECON_KEY);
            }
        }
        catch {
        }
        refreshContinueControls();
        setLiveText("Session-only mission history and challenge progress reset.");
    });
    function handleLauncherKey(event) {
        const currentIndex = Math.max(0, enabledButtons.indexOf(doc.activeElement));
        const action = launcherKeyAction(event.key, currentIndex, enabledButtons.length);
        if (action.kind === "focus" && action.index >= 0) {
            event.preventDefault();
            enabledButtons[action.index].focus();
        }
        else if (action.kind === "confirm" && enabledButtons.includes(doc.activeElement)) {
            event.preventDefault();
            doc.activeElement.click();
        }
        else if (action.kind === "dismiss") {
            event.preventDefault();
            if (typeof options.onDismiss === "function")
                options.onDismiss();
            else
                setLiveText("Launcher remains open. Choose a mission when ready.");
        }
    }
    root.addEventListener("keydown", handleLauncherKey);
    const gamepadTick = () => {
        const pads = view.navigator.getGamepads ? [...view.navigator.getGamepads()].filter(Boolean) : [];
        const pad = pads[0];
        const pressed = new Set();
        if (pad) {
            for (const index of [0, 12, 13, 14, 15]) {
                if (pad.buttons[index] && pad.buttons[index].pressed)
                    pressed.add(index);
            }
            const currentIndex = Math.max(0, enabledButtons.indexOf(doc.activeElement));
            const newlyPressed = (index) => pressed.has(index) && !previousGamepadButtons.has(index);
            if (newlyPressed(12) || newlyPressed(14)) {
                enabledButtons[moveMissionFocus(currentIndex, -1, enabledButtons.length)]?.focus();
            }
            else if (newlyPressed(13) || newlyPressed(15)) {
                enabledButtons[moveMissionFocus(currentIndex, 1, enabledButtons.length)]?.focus();
            }
            else if (newlyPressed(0) && enabledButtons.includes(doc.activeElement)) {
                doc.activeElement.click();
            }
        }
        previousGamepadButtons = pressed;
        gamepadFrame = view.requestAnimationFrame(gamepadTick);
    };
    refreshContinueControls();
    if (enabledButtons.length > 0 && options.initialFocus !== false) {
        enabledButtons[0].focus({ preventScroll: true });
    }
    if (view && view.navigator && view.requestAnimationFrame) {
        gamepadFrame = view.requestAnimationFrame(gamepadTick);
    }
    return function teardownDemoLauncher() {
        root.removeEventListener("keydown", handleLauncherKey);
        if (gamepadFrame !== null && view)
            view.cancelAnimationFrame(gamepadFrame);
        motionPreference.dispose();
        root.replaceChildren();
        root.classList.remove("demo-launcher-root");
    };
}
