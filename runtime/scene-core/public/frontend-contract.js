export const FRONTEND_CONTRACT = Object.freeze({
    components: "1-frontend",
    version_id: "runtime",
    claim_ceiling: "UI-level only; cannot assert server truth; Three.js fallback rendering, not first-party TeleportXR render.",
    inputs: Object.freeze([
        "worldView(role: 'source'|'target')",
        "avatarPose",
        "portalState",
        "handoffStatus",
        "resetSignal",
    ]),
    expects_from_backend: Object.freeze([
        "runtimeStateStream (WS /runtime-state)",
        "/wow projections (/wow/world, /wow/portal/{portalId}, /wow/user/{userId})",
    ]),
    expects_from_avatar_lane: Object.freeze([
        "pose",
        "continuityId",
        "handoffIntent",
    ]),
    emits: Object.freeze([
        "operatorControlEvents",
        "resetRequest",
    ]),
});
export const PROOF_BOUNDARY_FLAGS = Object.freeze({
    application_level_handoff: true,
    native_teleportxr_teleport: false,
    first_party_teleportxr_browser_rendering: false,
    standards_conformance: false,
});
export const HANDOFF_PHASES = Object.freeze({
    IDLE: "idle",
    PORTAL_ACTIVE: "portal_active",
    DEPARTED: "departed",
    WAITING: "waiting",
    ARRIVED: "arrived",
});
export const PROVENANCE = Object.freeze({
    SOURCE_PROVEN: "source-proven",
    SIMULATED: "simulated",
    FIXTURE: "fixture",
    REFERENCE: "reference",
    LIVE: "live",
});
export function validateProofBoundary(claimBoundary) {
    const problems = [];
    if (!claimBoundary || typeof claimBoundary !== "object") {
        return { ok: false, problems: ["claim_boundary block missing entirely"] };
    }
    for (const [k, expected] of Object.entries(PROOF_BOUNDARY_FLAGS)) {
        if (!(k in claimBoundary)) {
            problems.push(`missing flag: ${k}`);
        }
        else if (claimBoundary[k] !== expected) {
            problems.push(`flag ${k} is ${claimBoundary[k]}, expected ${expected}`);
        }
    }
    return { ok: problems.length === 0, problems };
}
