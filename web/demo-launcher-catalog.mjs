const SERVICE_PORTS = Object.freeze([18151, 18152, 18153]);
export const PRIMARY_MISSION_IDS = Object.freeze([
    "player-lobby",
    "server-a-observer",
    "server-b-observer",
]);
const ALLOWED_VIEW_KINDS = Object.freeze([
    "player",
    "observer",
    "destination",
]);
const ALLOWED_AVAILABILITY = Object.freeze(["available", "unavailable"]);
export function validateDemoLauncherCatalog(catalog) {
    if (!Array.isArray(catalog) || catalog.length === 0) {
        throw new TypeError("Demo launcher catalog must be a non-empty array.");
    }
    const ids = new Set();
    for (const mission of catalog) {
        if (!mission || typeof mission !== "object") {
            throw new TypeError("Every demo launcher entry must be an object.");
        }
        for (const key of [
            "id",
            "label",
            "description",
            "viewKind",
            "target",
            "availability",
            "capabilityBadge",
            "who",
            "where",
            "reality",
        ]) {
            if (typeof mission[key] !== "string" || mission[key].trim() === "") {
                throw new TypeError(`Mission ${mission.id || "<unknown>"} needs a non-empty ${key}.`);
            }
        }
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(mission.id)) {
            throw new Error(`Mission id is not stable-kebab-case: ${mission.id}`);
        }
        if (ids.has(mission.id)) {
            throw new Error(`Duplicate mission id: ${mission.id}`);
        }
        ids.add(mission.id);
        if (!ALLOWED_VIEW_KINDS.includes(mission.viewKind)) {
            throw new Error(`Mission ${mission.id} has unsupported view kind: ${mission.viewKind}`);
        }
        if (!ALLOWED_AVAILABILITY.includes(mission.availability)) {
            throw new Error(`Mission ${mission.id} has unsupported availability: ${mission.availability}`);
        }
        if (/^[a-z][a-z0-9+.-]*:/i.test(mission.target)
            || mission.target.startsWith("//")
            || SERVICE_PORTS.some((port) => mission.target.includes(String(port)))) {
            throw new Error(`Mission ${mission.id} target must be a same-origin browser route, not a service URL.`);
        }
        const resolvedTarget = new URL(mission.target, "http://osl.invalid/");
        if (resolvedTarget.origin !== "http://osl.invalid") {
            throw new Error(`Mission ${mission.id} target escapes the browser origin.`);
        }
        if (mission.availability === "unavailable") {
            if (typeof mission.availabilityReason !== "string" || mission.availabilityReason.trim() === "") {
                throw new Error(`Unavailable mission ${mission.id} needs an availability reason.`);
            }
            if (/\blive\b/i.test(mission.capabilityBadge)) {
                throw new Error(`Unavailable mission ${mission.id} cannot carry a LIVE badge.`);
            }
        }
        if (mission.backingNode !== null) {
            if (!mission.backingNode || typeof mission.backingNode !== "object") {
                throw new TypeError(`Mission ${mission.id} backingNode must be metadata or null.`);
            }
            if (!SERVICE_PORTS.includes(mission.backingNode.port)) {
                throw new Error(`Mission ${mission.id} has an unknown local service port.`);
            }
            if (typeof mission.backingNode.label !== "string"
                || typeof mission.backingNode.serviceRole !== "string") {
                throw new TypeError(`Mission ${mission.id} backing node metadata is incomplete.`);
            }
        }
        if (mission.id === "denver-skyport") {
            const airportClaims = [
                mission.description,
                mission.capabilityBadge,
                mission.who,
                mission.where,
                mission.reality,
            ].join(" ");
            if (mission.viewKind !== "destination" || mission.backingNode !== null) {
                throw new Error("Denver Skyport must remain a client-side destination, not a server view.");
            }
            if (/third server|airport server|server-backed|seamless backend|seamless teleport/i.test(airportClaims)) {
                throw new Error("Denver Skyport copy overclaims its client-side scene-load path.");
            }
        }
    }
    for (const id of PRIMARY_MISSION_IDS) {
        if (!ids.has(id)) {
            throw new Error(`Catalog is missing required primary mission: ${id}`);
        }
    }
    return catalog;
}
export function createDemoLauncherCatalog(options = {}) {
    const airportAvailable = options.airportAvailable === true;
    const catalog = [
        {
            id: "player-lobby",
            label: "Enter as Player",
            description: "Begin embodied in the lobby, then choose which local world to explore.",
            viewKind: "player",
            target: "index.html?role=player",
            backingNode: { label: "Lobby node", serviceRole: "player assignment lobby", port: 18153 },
            availability: "available",
            capabilityBadge: "PLAYER",
            who: "An embodied player",
            where: "The player lobby",
            reality: "Local app view backed by the lobby node",
            emblem: "P",
            accent: "lobby",
            primary: true,
            launchMode: "browser-route",
        },
        {
            id: "server-a-observer",
            label: "Observe Server A",
            description: "Watch Location A as an observer without becoming its player avatar.",
            viewKind: "observer",
            target: "index.html?role=source",
            backingNode: { label: "Location A", serviceRole: "world server", port: 18151 },
            availability: "available",
            capabilityBadge: "OBSERVER",
            who: "A read-only observer",
            where: "Location A",
            reality: "Browser observer view backed by local server A",
            emblem: "A",
            accent: "server-a",
            primary: true,
            launchMode: "browser-route",
        },
        {
            id: "server-b-observer",
            label: "Observe Server B",
            description: "Watch Location B and its amber arrival side as an observer.",
            viewKind: "observer",
            target: "index.html?role=target",
            backingNode: { label: "Location B", serviceRole: "world server", port: 18152 },
            availability: "available",
            capabilityBadge: "OBSERVER",
            who: "A read-only observer",
            where: "Location B",
            reality: "Browser observer view backed by local server B",
            emblem: "B",
            accent: "server-b",
            primary: true,
            launchMode: "browser-route",
        },
        {
            id: "denver-skyport",
            label: "Denver Skyport",
            description: "A client-side airport destination entered through the real lobby and Portal C path.",
            viewKind: "destination",
            target: "index.html?role=player",
            backingNode: null,
            availability: airportAvailable ? "available" : "unavailable",
            availabilityReason: airportAvailable
                ? "Available through the lobby Portal C route."
                : "The airport route is unavailable.",
            capabilityBadge: airportAvailable ? "DESTINATION" : "PORTAL C PENDING",
            who: "An embodied player",
            where: "A client-loaded destination beyond the lobby",
            reality: "Player view entered through the lobby Portal C path",
            emblem: "D",
            accent: "airport",
            primary: true,
            launchMode: "portal-c-gated",
        },
        {
            id: "player-location-a",
            label: "Start in Location A",
            description: "Skip lobby assignment and begin embodied on the source side.",
            viewKind: "player",
            target: "index.html?role=player&active=source",
            backingNode: { label: "Location A", serviceRole: "world server", port: 18151 },
            availability: "available",
            capabilityBadge: "PLAYER",
            who: "An embodied player",
            where: "Location A",
            reality: "Player view in Location A",
            emblem: "1",
            accent: "server-a",
            primary: false,
            launchMode: "browser-route",
        },
        {
            id: "player-location-b",
            label: "Start in Location B",
            description: "Skip lobby assignment and begin embodied on the target side.",
            viewKind: "player",
            target: "index.html?role=player&active=target",
            backingNode: { label: "Location B", serviceRole: "world server", port: 18152 },
            availability: "available",
            capabilityBadge: "PLAYER",
            who: "An embodied player",
            where: "Location B",
            reality: "Player view in Location B",
            emblem: "2",
            accent: "server-b",
            primary: false,
            launchMode: "browser-route",
        },
    ].map((mission) => Object.freeze({
        ...mission,
        backingNode: mission.backingNode ? Object.freeze({ ...mission.backingNode }) : null,
    }));
    validateDemoLauncherCatalog(catalog);
    return Object.freeze(catalog);
}
export const DEMO_LAUNCHER_DEFAULT_CATALOG = createDemoLauncherCatalog();
