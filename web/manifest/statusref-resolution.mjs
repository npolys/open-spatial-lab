export const STATUS_REF_STATUSES = Object.freeze(["active", "revoked", "suspended"]);
export const REVOCATION_STATUSES = Object.freeze(["active", "revoked", "suspended", "unchecked"]);
export const STATUSREF_POLICIES = Object.freeze(["active-required", "spec-default"]);
export const REASON_REVOKED = "um:reason:status:revoked";
export const REASON_SUSPENDED = "um:reason:status:suspended";
export const REASON_UNCHECKED = "um:reason:status:unchecked";
export const REASON_ENDPOINT_UNKNOWN_MANIFEST = "um:reason:status:endpoint-unknown-manifest";
export const REASON_ENDPOINT_UNAVAILABLE = "um:reason:status:endpoint-unavailable";
export const REASON_OFFLINE = "um:reason:status:offline";
export const REASON_ENDPOINT_ERROR_PREFIX = "um:reason:status:endpoint-error";
export const REASON_MALFORMED = "um:reason:status:malformed-response";
export const REASON_CURSOR_REGRESSION = "um:reason:status:cursor-regression";
export const REASON_MANIFEST_ID_MISMATCH = "um:reason:status:manifest-id-mismatch";
export const REASON_INSECURE_TRANSPORT = "um:reason:status:insecure-transport";
export const REASON_ACTIVE_REQUIRED_DENIED = "um:reason:status:active-required-denied";
export const DEMO_STATUS_ORIGIN = "https://status.demo.local/manifests/";
const RFC3339_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
function isIsoDateTime(value) {
    return typeof value === "string" && value.length > 0 && RFC3339_DATE_TIME.test(value) && Number.isFinite(Date.parse(value));
}
export function assertStatusRefResponseV04(value) {
    if (!value || typeof value !== "object")
        throw new Error("StatusRef response must be an object");
    const obj = value;
    if (typeof obj.manifestId !== "string" || obj.manifestId.length === 0) {
        throw new Error("StatusRef response missing manifestId");
    }
    if (!STATUS_REF_STATUSES.includes(obj.status)) {
        throw new Error("StatusRef response status must be one of active|revoked|suspended");
    }
    if (!isIsoDateTime(obj.updatedAt)) {
        throw new Error("statusRef.updatedAt must be an ISO date-time");
    }
}
export function validateStatusRefResponse(value) {
    try {
        assertStatusRefResponseV04(value);
        return { valid: true, errors: [] };
    }
    catch (e) {
        return { valid: false, errors: [e.message] };
    }
}
export function buildStatusEndpointResponse({ manifestId, status, updatedAt, reason, cursor, nextCheck } = {}) {
    if (typeof manifestId !== "string" || manifestId.length === 0)
        throw new Error("buildStatusEndpointResponse: manifestId required");
    if (!STATUS_REF_STATUSES.includes(status))
        throw new Error(`buildStatusEndpointResponse: status must be one of ${STATUS_REF_STATUSES.join("|")}`);
    const body = { manifestId, status, updatedAt: updatedAt || new Date().toISOString() };
    if (reason !== undefined)
        body.reason = reason;
    if (cursor !== undefined)
        body.cursor = cursor;
    if (nextCheck !== undefined)
        body.nextCheck = nextCheck;
    assertStatusRefResponseV04(body);
    return body;
}
function cursorRank(cursor) {
    if (typeof cursor !== "string" || cursor.length === 0)
        return null;
    const m = cursor.match(/(\d+)\s*$/);
    return m ? Number(m[1]) : null;
}
export function compareCursor(a, b) {
    const ra = cursorRank(a);
    const rb = cursorRank(b);
    if (ra !== null && rb !== null)
        return ra < rb ? -1 : ra > rb ? 1 : 0;
    const sa = String(a ?? "");
    const sb = String(b ?? "");
    return sa < sb ? -1 : sa > sb ? 1 : 0;
}
export function resolveStatus({ statusRef, manifestId, revocationCursor, lastSeenCursor, transport } = {}) {
    const unchecked = (reason, httpStatus = 0, response = null) => ({ revocationStatus: "unchecked", reason, httpStatus, response });
    if (typeof statusRef !== "string" || !/^https:\/\//i.test(statusRef)) {
        return unchecked(REASON_INSECURE_TRANSPORT, 0, null);
    }
    if (typeof manifestId !== "string" || manifestId.length === 0) {
        return unchecked(REASON_MANIFEST_ID_MISMATCH, 0, null);
    }
    let result;
    try {
        result = transport ? transport(statusRef) : null;
    }
    catch {
        result = null;
    }
    if (!result)
        return unchecked(REASON_ENDPOINT_UNAVAILABLE, 0, null);
    if (result.offline)
        return unchecked(REASON_OFFLINE, 0, null);
    const httpStatus = Number(result.httpStatus) || 0;
    if (httpStatus === 0)
        return unchecked(REASON_ENDPOINT_UNAVAILABLE, 0, null);
    if (httpStatus === 404)
        return unchecked(REASON_ENDPOINT_UNKNOWN_MANIFEST, 404, null);
    if (httpStatus === 503)
        return unchecked(REASON_ENDPOINT_UNAVAILABLE, 503, null);
    if (httpStatus !== 200) {
        return unchecked(`${REASON_ENDPOINT_ERROR_PREFIX}:${httpStatus}`, httpStatus, null);
    }
    const body = result.body;
    const v = validateStatusRefResponse(body);
    if (!v.valid)
        return unchecked(REASON_MALFORMED, httpStatus, body ?? null);
    if (manifestId !== undefined && body.manifestId !== manifestId) {
        return unchecked(REASON_MANIFEST_ID_MISMATCH, httpStatus, body);
    }
    let floor = revocationCursor;
    if (lastSeenCursor !== undefined && (floor === undefined || compareCursor(lastSeenCursor, floor) > 0)) {
        floor = lastSeenCursor;
    }
    if (floor !== undefined) {
        if (typeof body.cursor !== "string" || body.cursor.length === 0 || compareCursor(body.cursor, floor) < 0) {
            return unchecked(REASON_CURSOR_REGRESSION, httpStatus, body);
        }
    }
    return { revocationStatus: body.status, reason: null, httpStatus, response: body };
}
export function applyRevocationPolicy(resolution, { policy = "active-required" } = {}) {
    if (!STATUSREF_POLICIES.includes(policy))
        throw new Error(`applyRevocationPolicy: unknown policy "${policy}"`);
    const { revocationStatus, reason } = resolution;
    const warnings = [];
    const warn = (code, message) => warnings.push({ code, message });
    if (policy === "spec-default") {
        switch (revocationStatus) {
            case "active":
                return { result: "accept", outcome: "accepted", revocationStatus, warnings };
            case "suspended":
                warn(REASON_SUSPENDED, "Verify stage: manifest status is suspended (EXT-OPT §O2.3)");
                return { result: "accept", outcome: "accepted-with-warnings", revocationStatus, warnings };
            case "revoked":
                warn(REASON_REVOKED, "Verify stage: signature is revoked (EXT-OPT §O2.3)");
                return { result: "reject", outcome: "rejected", revocationStatus, warnings };
            case "unchecked":
            default:
                warn(reason || REASON_UNCHECKED, "Verify stage: revocation status unchecked (EXT-OPT §O2.4)");
                return { result: "accept", outcome: "accepted-with-warnings", revocationStatus: "unchecked", warnings };
        }
    }
    if (revocationStatus === "active") {
        return { result: "accept", outcome: "accepted", revocationStatus, warnings };
    }
    if (revocationStatus === "revoked")
        warn(REASON_REVOKED, "Verify stage: signature is revoked — active-required policy DENIES (R9)");
    else if (revocationStatus === "suspended")
        warn(REASON_SUSPENDED, "Verify stage: status suspended — not active ⇒ active-required policy DENIES (R9)");
    else
        warn(reason || REASON_UNCHECKED, "Verify stage: revocation status undeterminable — active-required policy DENIES fail-closed (§5.2 #3, R9)");
    warn(REASON_ACTIVE_REQUIRED_DENIED, "active-required policy: only a confirmed 'active' status may proceed");
    return { result: "reject", outcome: "rejected", revocationStatus, warnings };
}
export function evaluateStatusRef({ statusRef, manifestId, revocationCursor, lastSeenCursor, transport, policy = "active-required" } = {}) {
    const resolution = resolveStatus({ statusRef, manifestId, revocationCursor, lastSeenCursor, transport });
    const disposition = applyRevocationPolicy(resolution, { policy });
    return { ...disposition, reason: resolution.reason, httpStatus: resolution.httpStatus, response: resolution.response };
}
export function makeResolveRevocation({ transport, manifestId, lastSeenCursor } = {}) {
    return function resolveRevocation(statusRef, cursor) {
        const { revocationStatus } = resolveStatus({ statusRef, manifestId, revocationCursor: cursor, lastSeenCursor, transport });
        return revocationStatus;
    };
}
function manifestIdFromRef(ref) {
    if (typeof ref !== "string")
        return null;
    const i = ref.indexOf(DEMO_STATUS_ORIGIN);
    if (i === 0)
        return decodeURIComponent(ref.slice(DEMO_STATUS_ORIGIN.length));
    return ref;
}
export function makeDemoStatusAuthority({ now } = {}) {
    const clock = () => (typeof now === "function" ? now() : now) || new Date().toISOString();
    const records = new Map();
    let offline = false;
    const bump = (rec) => {
        rec.cursor = (rec.cursor ?? 0) + 1;
        rec.updatedAt = clock();
        return rec;
    };
    const api = {
        statusRefFor(manifestId) {
            return `${DEMO_STATUS_ORIGIN}${encodeURIComponent(manifestId)}`;
        },
        register(manifestId, { status = "active", cursor = 1, nextCheck = "PT1H" } = {}) {
            records.set(manifestId, { status, cursor, updatedAt: clock(), nextCheck });
            return api;
        },
        revoke(manifestId, { reason = "holder-initiated revocation (demo)" } = {}) {
            const rec = records.get(manifestId) || { status: "active", cursor: 1 };
            rec.status = "revoked";
            rec.reason = reason;
            records.set(manifestId, bump(rec));
            return api;
        },
        suspend(manifestId, { reason = "temporary suspension (demo)" } = {}) {
            const rec = records.get(manifestId) || { status: "active", cursor: 1 };
            rec.status = "suspended";
            rec.reason = reason;
            records.set(manifestId, bump(rec));
            return api;
        },
        reinstate(manifestId) {
            const rec = records.get(manifestId) || { status: "revoked", cursor: 1 };
            rec.status = "active";
            delete rec.reason;
            records.set(manifestId, bump(rec));
            return api;
        },
        setOffline(v) {
            offline = !!v;
            return api;
        },
        currentCursor(manifestId) {
            const rec = records.get(manifestId);
            return rec ? `v${rec.cursor}` : undefined;
        },
        transport(ref) {
            if (offline)
                return { httpStatus: 0, offline: true };
            const manifestId = manifestIdFromRef(ref);
            const rec = manifestId != null ? records.get(manifestId) : undefined;
            if (!rec)
                return { httpStatus: 404 };
            const body = buildStatusEndpointResponse({
                manifestId,
                status: rec.status,
                updatedAt: rec.updatedAt,
                reason: rec.reason,
                cursor: `v${rec.cursor}`,
                nextCheck: rec.nextCheck,
            });
            return { httpStatus: 200, body };
        },
    };
    return api;
}
export function buildStatusRefDemoSurface({ manifestId, statusRef, revocationCursor, authority, policy = "active-required" } = {}) {
    const resolveNow = () => evaluateStatusRef({ statusRef, manifestId, revocationCursor, transport: authority.transport, policy });
    const baseline = resolveNow();
    authority.revoke(manifestId);
    const afterRevoke = resolveNow();
    const nonResolving = applyRevocationPolicy({ revocationStatus: "unchecked", reason: REASON_UNCHECKED }, { policy: "spec-default" });
    return {
        manifestId,
        statusRef,
        policy,
        baseline: { result: baseline.result, revocationStatus: baseline.revocationStatus, outcome: baseline.outcome },
        afterRevoke: {
            result: afterRevoke.result,
            revocationStatus: afterRevoke.revocationStatus,
            outcome: afterRevoke.outcome,
            warnings: afterRevoke.warnings.map((w) => w.code),
        },
        nonResolving: { result: nonResolving.result, revocationStatus: nonResolving.revocationStatus, outcome: nonResolving.outcome },
    };
}
export const feature_CONFORMANCE = Object.freeze({
    wo: "runtime",
    standard: "Universal Manifest v0.4 EXT-OPT §O2 (statusRef Resolution Schema) + EVAL-18 (§2.18) + RP1 bar R9",
    fixture_owned: false,
    response_schema_conformant: true,
    status_semantics_real: true,
    error_handling_real: true,
    cursor_monotonicity_real: true,
    fail_closed_active_required: true,
    reference_evaluator_interop: true,
    live_external_status_service: false,
    federated_resolvers: false,
    bitstring_status_list: false,
    policy_state_profile_o26: false,
    um_conformance_flag_flipped: false,
    scoped_claim: "runtime implements REAL, deterministic statusRef revocation resolution: a §O2.2-schema-conformant " +
        "status-endpoint response (validator mirrors the reference assertStatusRefResponseV04 and is cross-checked " +
        "against schema.json $defs.statusRefResponse), §O2.3 dispositions (active⇒accept, suspended⇒accepted-with-" +
        "warnings, revoked⇒reject) exercised through the REAL reference evaluator via makeResolveRevocation, §O2.4 " +
        "error handling (unreachable/404/503/offline/malformed ⇒ unchecked + the classified reason), and §5.2/§O2.1 " +
        "cursor-floor monotonicity (regression refused). Under the RP1 R9 active-required policy — the demo default — " +
        "revoked, suspended, unreachable, offline, malformed, cursor-regression, id-mismatch, and non-HTTPS all DENY " +
        "fail-closed. The status authority is a demo-local / mock resolver (labeled, in-memory), NOT a live external " +
        "service. NO expected.json fixture exists (spec-surface acceptance). No conformance flag is flipped.",
});
