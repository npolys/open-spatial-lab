import { verifyManifestProfileA } from "../signing/um-signature-profile-a.mjs";
export const CONSENT_REQUIRED_FIELDS = Object.freeze([
    "@id",
    "@type",
    "facetRef",
    "scope",
    "purpose",
    "grantedAt",
    "expiresAt",
]);
export const FACET_CONSENT_STATUSES = Object.freeze(["processed", "consent-missing", "consent-denied"]);
export const CONSENT_DENIAL_STATUSES = Object.freeze([
    "expired",
    "withdrawn",
    "scope-mismatch",
    "condition-violated",
]);
export const CONSENT_STATUS_GRANTED = "granted";
export const CONSENT_STATUSES = Object.freeze([CONSENT_STATUS_GRANTED, ...CONSENT_DENIAL_STATUSES]);
export const RECOGNIZED_ENFORCEABLE_CONDITIONS = Object.freeze([]);
export const CONSENT_RECEIPT_OUTCOMES = Object.freeze(["accepted", "accepted-partial", "rejected"]);
export const feature_CONSENT_CONFORMANCE = Object.freeze({
    wo: "runtime",
    standard: "Universal Manifest v0.4 Base — Stage-4 Consent (spec §1.4.4 / §3.1.4; CONFORMANCE evaluator MUST #6/#8)",
    fixtures_owned: 6,
    facet_ref_matching_real: true,
    four_value_denial_vocab_real: true,
    expired_withdrawn_treated_as_absent: true,
    unknown_condition_fails_closed: true,
    literal_scope_check_real: true,
    consent_missing_facet_ref_reject_real: true,
    deny_holds_regardless_of_service_request: true,
    crossing_sensor_gating_demo: true,
    full_six_stage_evaluator: false,
    write_consent_unlock_window: false,
    signature_ttl_verification: false,
    um_conformance_flag_flipped: false,
    scoped_claim: "runtime implements REAL v0.4 Stage-4 consent gating: facetRef→facet matching, the 4-value " +
        "fail-closed denial vocabulary (expired/withdrawn/scope-mismatch/condition-violated), " +
        "expired+withdrawn-as-absent, unknown-condition-fails-closed, literal intendedScope⊆scope, and " +
        "the consent-missing-facet-ref schema reject — the six fixtures it owns, matched under each " +
        "entry's PINNED evaluationContext. The crossing sensor gates (P8/R8) are a page-visible " +
        "DEMONSTRATION of fail-closed monotonicity (no expected.json fixtures). Signature/TTL is REUSED " +
        "from runtime/119 (not re-implemented). This is the Stage-4 slice, not the full evaluator.",
});
function isNonEmptyString(v) {
    return typeof v === "string" && v.length > 0;
}
function isIsoDateTime(v) {
    return typeof v === "string" && Number.isFinite(Date.parse(v));
}
function isStringArray(v) {
    return Array.isArray(v) && v.every((x) => typeof x === "string");
}
function isNonEmptyStringArray(v) {
    return isStringArray(v) && v.length > 0;
}
function hasConsentType(t) {
    return t === "um:Consent" || (Array.isArray(t) && t.includes("um:Consent"));
}
function envelopeErrors(manifest) {
    const errors = [];
    if (!manifest || typeof manifest !== "object" || Array.isArray(manifest))
        return ["manifest must be an object"];
    const ctx = manifest["@context"];
    const hasV04 = ctx === "https://universalmanifest.net/ns/v0.4" ||
        (Array.isArray(ctx) && ctx.includes("https://universalmanifest.net/ns/v0.4"));
    if (!hasV04)
        errors.push("@context must include https://universalmanifest.net/ns/v0.4 (Section 1.2.1)");
    if (!isNonEmptyString(manifest["@id"]))
        errors.push("Missing @id");
    const t = manifest["@type"];
    if (!(t === "um:Manifest" || (Array.isArray(t) && t.includes("um:Manifest"))))
        errors.push("Missing um:Manifest in @type");
    if (manifest.manifestVersion !== "0.4")
        errors.push("manifestVersion must be 0.4");
    if (!isNonEmptyString(manifest.subject))
        errors.push("Missing subject");
    if (!isIsoDateTime(manifest.issuedAt))
        errors.push("issuedAt must be an ISO 8601 date-time");
    if (!isIsoDateTime(manifest.expiresAt))
        errors.push("expiresAt must be an ISO 8601 date-time");
    return errors;
}
export function consentEntryShapeErrors(consent, index = 0) {
    const at = `consents[${index}]`;
    if (!consent || typeof consent !== "object" || Array.isArray(consent))
        return [`${at}: must be an object`];
    const errors = [];
    if (!isNonEmptyString(consent["@id"]))
        errors.push(`${at}: missing required @id`);
    if (!hasConsentType(consent["@type"]))
        errors.push(`${at}: @type must include um:Consent`);
    if (!isNonEmptyString(consent.facetRef))
        errors.push(`${at}: missing required facetRef (Section 1.4.4)`);
    if (!isNonEmptyStringArray(consent.scope))
        errors.push(`${at}: scope must be a non-empty string array`);
    if (!isNonEmptyString(consent.purpose))
        errors.push(`${at}: missing required purpose`);
    if (!isIsoDateTime(consent.grantedAt))
        errors.push(`${at}: grantedAt must be an ISO 8601 date-time`);
    if (!isIsoDateTime(consent.expiresAt))
        errors.push(`${at}: expiresAt must be an ISO 8601 date-time`);
    if (consent.withdrawnAt !== undefined && !isIsoDateTime(consent.withdrawnAt)) {
        errors.push(`${at}: withdrawnAt, when present, must be an ISO 8601 date-time`);
    }
    if (consent.conditions !== undefined && !isStringArray(consent.conditions)) {
        errors.push(`${at}: conditions, when present, must be a string array`);
    }
    return errors;
}
export function validateConsentStructural(manifest) {
    const errors = [];
    const consents = Array.isArray(manifest?.consents) ? manifest.consents : [];
    consents.forEach((c, i) => errors.push(...consentEntryShapeErrors(c, i)));
    return { valid: errors.length === 0, errors };
}
export async function structuralVerdictConsent(manifest) {
    const reasons = [];
    reasons.push(...envelopeErrors(manifest));
    reasons.push(...validateConsentStructural(manifest).errors);
    let sigReason = "not-evaluated";
    if (reasons.length === 0) {
        const sigReport = await verifyManifestProfileA(manifest);
        sigReason = sigReport.reason;
        if (!sigReport.ok)
            reasons.push(`signature verification failed: ${sigReport.reason}`);
    }
    return {
        result: reasons.length === 0 ? "accept" : "reject",
        reasons,
        checks: { signature: sigReason },
    };
}
export function matchConsentForFacet(facetId, consents) {
    const list = Array.isArray(consents) ? consents : [];
    for (let i = 0; i < list.length; i += 1) {
        const c = list[i];
        if (c && typeof c === "object" && c.facetRef === facetId)
            return { consent: c, index: i };
    }
    return { consent: null, index: -1 };
}
export function evaluateConsentEntry(consent, context = {}) {
    const consentRef = consent && isNonEmptyString(consent["@id"]) ? consent["@id"] : "(unknown-consent)";
    const facetRef = consent && isNonEmptyString(consent.facetRef) ? consent.facetRef : null;
    const nowMs = isIsoDateTime(context.now) ? Date.parse(context.now) : Date.now();
    const deny = (status, reason) => ({ consentRef, facetRef, status, reason, granted: false });
    if (isIsoDateTime(consent.withdrawnAt) && Date.parse(consent.withdrawnAt) <= nowMs) {
        return deny("withdrawn", `consent withdrawn at ${consent.withdrawnAt} (treated as absent; spec §1.4.4)`);
    }
    const grantedMs = Date.parse(consent.grantedAt);
    const expiresMs = Date.parse(consent.expiresAt);
    if (!Number.isFinite(expiresMs) || nowMs >= expiresMs) {
        return deny("expired", `consent expired at ${consent.expiresAt} (treated as absent; spec §1.4.4)`);
    }
    if (Number.isFinite(grantedMs) && nowMs < grantedMs) {
        return deny("expired", `consent not yet valid (grantedAt ${consent.grantedAt} is in the future; treated as absent)`);
    }
    const conditions = Array.isArray(consent.conditions) ? consent.conditions : [];
    if (conditions.length > 0) {
        const satisfied = new Set(Array.isArray(context.satisfiedConditions) ? context.satisfiedConditions : []);
        const recognized = new Set(RECOGNIZED_ENFORCEABLE_CONDITIONS);
        const unmet = conditions.filter((cond) => !(recognized.has(cond) && satisfied.has(cond)));
        if (unmet.length > 0) {
            return deny("condition-violated", `consent carries condition(s) the evaluator cannot recognize or enforce: ${unmet.join(", ")} (fail closed)`);
        }
    }
    const scope = Array.isArray(consent.scope) ? consent.scope : [];
    if (isNonEmptyStringArray(context.intendedScope)) {
        const missing = context.intendedScope.filter((op) => !scope.includes(op));
        if (missing.length > 0) {
            return deny("scope-mismatch", `intended operation(s) [${missing.join(", ")}] not literally present in consent.scope [${scope.join(", ")}]`);
        }
    }
    return { consentRef, facetRef, status: CONSENT_STATUS_GRANTED, reason: "consent valid for the requested context", granted: true };
}
export function evaluateConsentStage(manifest, context = {}) {
    const facets = Array.isArray(manifest?.facets) ? manifest.facets : [];
    const consents = Array.isArray(manifest?.consents) ? manifest.consents : [];
    const facetStatuses = [];
    const consentStatuses = [];
    const processed = [];
    const notProcessed = [];
    for (const facet of facets) {
        const facetId = facet && isNonEmptyString(facet["@id"]) ? facet["@id"] : "(unknown-facet)";
        const { consent } = matchConsentForFacet(facetId, consents);
        if (!consent) {
            facetStatuses.push({ facetId, status: "consent-missing" });
            notProcessed.push(facetId);
            continue;
        }
        const evalResult = evaluateConsentEntry(consent, context);
        consentStatuses.push({
            consentRef: evalResult.consentRef,
            facetRef: evalResult.facetRef,
            status: evalResult.status,
            reason: evalResult.reason,
        });
        if (evalResult.granted) {
            facetStatuses.push({ facetId, status: "processed", consentRef: evalResult.consentRef });
            processed.push(facetId);
        }
        else {
            facetStatuses.push({ facetId, status: "consent-denied", consentRef: evalResult.consentRef });
            notProcessed.push(facetId);
        }
    }
    return { facetStatuses, consentStatuses, processed, notProcessed };
}
export async function evaluateConsentGating(manifest, context = {}) {
    const nowMs = isIsoDateTime(context.now) ? Date.parse(context.now) : Date.now();
    const manifestId = manifest && typeof manifest === "object" && isNonEmptyString(manifest["@id"]) ? manifest["@id"] : "(unknown)";
    const warnings = [];
    const receipt = {
        "@type": "um:Receipt",
        manifestId,
        outcome: "rejected",
        signatureCheck: "not-evaluated",
        freshnessCheck: "not-evaluated",
        facetStatuses: [],
        consentStatuses: [],
        warnings,
    };
    const finish = (outcome) => {
        receipt.outcome = outcome;
        return { result: outcome === "rejected" ? "reject" : "accept", receipt };
    };
    const structural = [...envelopeErrors(manifest), ...validateConsentStructural(manifest).errors];
    if (structural.length > 0) {
        warnings.push({ code: "um:reason:structure:malformed", message: `Verify stage: ${structural.join("; ")}` });
        return finish("rejected");
    }
    const sig = manifest.signature;
    if (!sig || typeof sig !== "object") {
        warnings.push({ code: "um:reason:crypto:signature-missing", message: "Verify stage: missing signature" });
        return finish("rejected");
    }
    const sigReport = await verifyManifestProfileA(manifest);
    if (!sigReport.ok) {
        receipt.signatureCheck = sigReport.reason === "unsupported-profile" ? "unsupported-profile" : "invalid";
        warnings.push({ code: "um:reason:crypto:signature-invalid", message: `Verify stage: ${sigReport.reason}` });
        return finish("rejected");
    }
    receipt.signatureCheck = "valid";
    const SKEW_MS = 60_000;
    const issuedMs = Date.parse(manifest.issuedAt);
    const expiresMs = Date.parse(manifest.expiresAt);
    if (Number.isFinite(issuedMs) && issuedMs - nowMs > SKEW_MS) {
        receipt.freshnessCheck = "stale";
        warnings.push({ code: "um:reason:freshness:stale", message: "Verify stage: issuedAt more than 60s in the future" });
        return finish("rejected");
    }
    if (Number.isFinite(expiresMs) && nowMs > expiresMs) {
        receipt.freshnessCheck = "expired";
        warnings.push({ code: "um:reason:freshness:expired", message: "Verify stage: manifest expired" });
        return finish("rejected");
    }
    receipt.freshnessCheck = "fresh";
    const stage = evaluateConsentStage(manifest, context);
    receipt.facetStatuses = stage.facetStatuses;
    receipt.consentStatuses = stage.consentStatuses;
    for (const cs of stage.consentStatuses) {
        if (cs.status !== CONSENT_STATUS_GRANTED) {
            warnings.push({ code: `um:reason:consent:${cs.status}`, message: `Consent stage: ${cs.consentRef} ⇒ ${cs.status} (${cs.reason})` });
        }
    }
    for (const fs of stage.facetStatuses) {
        if (fs.status === "consent-missing") {
            warnings.push({ code: "um:reason:consent:consent-missing", message: `Consent stage: facet ${fs.facetId} has no governing consent ⇒ consent-missing, not processed` });
        }
    }
    if (stage.notProcessed.length > 0)
        return finish("accepted-partial");
    return finish("accepted");
}
export const SENSOR_DISPOSITIONS = Object.freeze(["denied", "occluder-only", "post-server-mix", "granted"]);
const DISPOSITION_RANK = Object.freeze({ denied: 0, "occluder-only": 1, "post-server-mix": 1, granted: 2 });
function dispositionRank(d) {
    return Object.prototype.hasOwnProperty.call(DISPOSITION_RANK, d) ? DISPOSITION_RANK[d] : 0;
}
export const CROSSING_SENSOR_GATES = Object.freeze({
    "eye-tracking": Object.freeze({
        disposition: "denied",
        rationale: "biometric-grade gaze data; no consent facet grants it — denied at the boundary",
    }),
    "hand-tracking": Object.freeze({
        disposition: "granted",
        rationale: "interaction-necessary; consented for the crossing",
    }),
    "room-geometry": Object.freeze({
        disposition: "occluder-only",
        rationale: "shared only as occlusion geometry; raw mesh/layout never exposed",
    }),
    microphone: Object.freeze({
        disposition: "post-server-mix",
        rationale: "only the server-mixed audio stream is exposed; raw mic never leaves the client",
    }),
});
export function gateSensorRequest(sensor, { requestedDisposition = null, enterpriseReinforced = false } = {}) {
    const gate = Object.prototype.hasOwnProperty.call(CROSSING_SENSOR_GATES, sensor) ? CROSSING_SENSOR_GATES[sensor] : null;
    if (!gate) {
        return {
            sensor,
            base: null,
            requested: requestedDisposition,
            enterpriseReinforced,
            effective: "denied",
            held: true,
            reason: `unknown sensor '${sensor}' ⇒ default-deny (fail closed)`,
        };
    }
    const base = gate.disposition;
    let effective = base;
    let reason = `base disposition '${base}' (${gate.rationale})`;
    if (requestedDisposition != null) {
        if (dispositionRank(requestedDisposition) < dispositionRank(effective)) {
            effective = requestedDisposition;
            reason = `service voluntarily restricted to '${effective}' (more restrictive than base '${base}')`;
        }
        else if (requestedDisposition !== effective) {
            reason = `service requested '${requestedDisposition}' — NOT honored; base '${base}' holds (a request can never loosen a gate)`;
        }
    }
    if (enterpriseReinforced && dispositionRank(effective) > dispositionRank(base)) {
        effective = base;
        reason = `enterprise reinforcement clamped back to base '${base}' (denials hold under reinforcement)`;
    }
    return {
        sensor,
        base,
        requested: requestedDisposition,
        enterpriseReinforced,
        effective,
        held: dispositionRank(effective) <= dispositionRank(base),
        reason,
    };
}
export function buildCrossingSensorGateSurface({ enterpriseReinforced = false, serviceRequests = {} } = {}) {
    const gates = Object.keys(CROSSING_SENSOR_GATES).map((sensor) => gateSensorRequest(sensor, {
        requestedDisposition: Object.prototype.hasOwnProperty.call(serviceRequests, sensor) ? serviceRequests[sensor] : null,
        enterpriseReinforced,
    }));
    return {
        enterpriseReinforced,
        gates,
        allDenialsHeld: gates.every((g) => g.held),
    };
}
export const feature_FIXTURE_FILENAMES = Object.freeze([
    "valid/facet-without-consent.jsonld",
    "valid/consent-expired.jsonld",
    "valid/consent-withdrawn.jsonld",
    "valid/consent-scope-mismatch-read.jsonld",
    "valid/consent-unknown-condition.jsonld",
    "invalid/consent-missing-facet-ref.jsonld",
]);
export async function featureFixtureHandler(fixtureJson, expectedEntry = {}) {
    if (expectedEntry.validationMode === "evaluation") {
        const { result, receipt } = await evaluateConsentGating(fixtureJson, expectedEntry.evaluationContext || {});
        return { result, reason: receipt.warnings?.[0]?.message || receipt.outcome, receipt };
    }
    const verdict = await structuralVerdictConsent(fixtureJson);
    return { result: verdict.result, reason: verdict.reasons.join("; ") || "structural contract satisfied" };
}
export function registerWo122(registry) {
    if (!registry || typeof registry.register !== "function") {
        throw new Error("registerWo122: registry with a register(filename, handler) function required");
    }
    for (const filename of feature_FIXTURE_FILENAMES) {
        registry.register(filename, featureFixtureHandler);
    }
    return feature_FIXTURE_FILENAMES.length;
}
