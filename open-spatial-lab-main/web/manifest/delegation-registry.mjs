import { verifyManifestProfileA } from "../signing/um-signature-profile-a.mjs";
export const AGENT_DELEGATION_TYPE = "um:agentDelegation";
export const DELEGATE_TYPES = Object.freeze(["ai-agent", "bot", "proxy", "human-delegate"]);
export const O7_CORE_SCOPES = Object.freeze({
    "spatial.session": "participate in spatial computing sessions on behalf of the subject",
    "spatial.navigation": "navigate spatial environments",
    "social.messaging": "send and receive messages",
    "social.presence": "represent the subject's presence status",
    "commerce.transaction": "initiate transactions, within any profile-declared spending limits",
    "identity.attestation": "present the subject's identity claims to verifiers (NOT authority to create or modify claims)",
});
export const WARN_DELEGATION_EXPIRED = "um:reason:delegation:expired";
export const WARN_DELEGATION_EMPTY_SCOPE = "um:reason:delegation:empty-scope";
export const WARN_DELEGATION_UNATTRIBUTED = "um:reason:delegation:unattributed";
export const WARN_DELEGATION_UNREGISTERED_SCOPE = "um:reason:delegation:unregistered-scope";
export const WARN_DELEGATION_DELEGATOR_MISMATCH = "um:reason:delegation:delegator-mismatch";
export const feature_CONFORMANCE = Object.freeze({
    wo: "runtime",
    standard: "Universal Manifest v0.4 Base §6.5/§6.5.1 (agent delegation) + EXT-OPT §O7 (scope registry)",
    fixtures_owned: 4,
    delegator_binding_real: true,
    expiry_enforcement_real: true,
    o7_registry_lookup_real: true,
    fail_closed_defaults_real: true,
    structural_shape_validation_real: true,
    liveness_endpoint_semantics: false,
    full_six_stage_evaluator: false,
    um_conformance_flag_flipped: false,
    scoped_claim: "runtime implements REAL, deterministic agent-delegation evaluation: delegator binding " +
        "(delegatedBy === subject or reject), expiry at the pinned clock, O7 registered-scope lookup " +
        "with fail-closed defaults (empty/unregistered scope grants NO capability; missing delegateId " +
        "is unattributed), and structural shape validation mirroring schema.json. An unregistered or " +
        "ambiguous delegated scope DENIES by default. livenessEndpoint is carry-only (no liveness " +
        "semantics claimed — runtime). No conformance flag is flipped.",
});
function isNonEmptyString(v) {
    return typeof v === "string" && v.length > 0;
}
function isIsoDateTime(v) {
    return typeof v === "string" && !Number.isNaN(Date.parse(v));
}
export function isRegisteredScope(scope) {
    return typeof scope === "string" && Object.prototype.hasOwnProperty.call(O7_CORE_SCOPES, scope);
}
export function lookupScope(scope) {
    return isRegisteredScope(scope) ? O7_CORE_SCOPES[scope] : null;
}
export function partitionScopes(scopes) {
    const registered = [];
    const unregistered = [];
    const seen = new Set();
    for (const s of Array.isArray(scopes) ? scopes : []) {
        const key = String(s);
        if (seen.has(key))
            continue;
        seen.add(key);
        if (isRegisteredScope(s))
            registered.push(s);
        else
            unregistered.push(s);
    }
    return { registered, unregistered };
}
export function getAgentDelegationPointers(manifest) {
    const pointers = manifest && Array.isArray(manifest.pointers) ? manifest.pointers : [];
    return pointers.filter((p) => p && typeof p === "object" && p["@type"] === AGENT_DELEGATION_TYPE);
}
export function validateAgentDelegationShape(pointer) {
    const errors = [];
    if (!pointer || typeof pointer !== "object" || Array.isArray(pointer)) {
        return { valid: false, errors: ["agentDelegation pointer must be an object"] };
    }
    if (pointer["@type"] !== AGENT_DELEGATION_TYPE) {
        errors.push(`@type must be "${AGENT_DELEGATION_TYPE}"`);
    }
    if (!DELEGATE_TYPES.includes(pointer.delegateType)) {
        errors.push(`delegateType must be one of ${DELEGATE_TYPES.join("|")}`);
    }
    if (!isNonEmptyString(pointer.delegatedBy))
        errors.push("delegatedBy is required (non-empty string)");
    if (!isIsoDateTime(pointer.delegatedAt))
        errors.push("delegatedAt must be an ISO 8601 date-time");
    if (!isIsoDateTime(pointer.expiresAt))
        errors.push("expiresAt must be an ISO 8601 date-time");
    if (pointer.delegateId !== undefined && typeof pointer.delegateId !== "string") {
        errors.push("delegateId must be a string when present");
    }
    if (pointer.scope !== undefined && (!Array.isArray(pointer.scope) || pointer.scope.some((s) => typeof s !== "string"))) {
        errors.push("scope must be an array of strings when present");
    }
    if (pointer.livenessEndpoint !== undefined && !isNonEmptyString(pointer.livenessEndpoint)) {
        errors.push("livenessEndpoint must be a URI string when present");
    }
    return { valid: errors.length === 0, errors };
}
export function evaluateDelegation(pointer, { subject, nowMs } = {}) {
    const warnings = [];
    const shape = validateAgentDelegationShape(pointer);
    if (!shape.valid) {
        return {
            reject: true,
            rejectReason: `agentDelegation shape invalid: ${shape.errors.join("; ")}`,
            warnings,
            delegation: { status: "rejected", shapeErrors: shape.errors },
        };
    }
    const requested = Array.isArray(pointer.scope) ? pointer.scope : [];
    const { registered, unregistered } = partitionScopes(requested);
    const attributed = isNonEmptyString(pointer.delegateId);
    const delegation = {
        delegateType: pointer.delegateType,
        delegateId: attributed ? pointer.delegateId : null,
        delegatedBy: pointer.delegatedBy,
        delegatorMatchesSubject: pointer.delegatedBy === subject,
        delegatedAt: pointer.delegatedAt,
        expiresAt: pointer.expiresAt,
        expired: false,
        attributed,
        requestedScopes: requested.slice(),
        registeredScopes: registered.slice(),
        unregisteredScopes: unregistered.slice(),
        effectiveScopes: registered.slice(),
        status: "accepted",
    };
    if (pointer.delegatedBy !== subject) {
        warnings.push({
            code: WARN_DELEGATION_DELEGATOR_MISMATCH,
            message: `Verify stage: delegatedBy "${pointer.delegatedBy}" does not match manifest subject "${subject}" (Base §6.5.1)`,
        });
        delegation.status = "rejected";
        return {
            reject: true,
            rejectReason: `delegatedBy "${pointer.delegatedBy}" does not match manifest subject "${subject}"`,
            warnings,
            delegation,
        };
    }
    if (Number.isFinite(nowMs) && nowMs > Date.parse(pointer.expiresAt)) {
        delegation.expired = true;
        delegation.effectiveScopes = [];
        delegation.status = "rejected";
        warnings.push({
            code: WARN_DELEGATION_EXPIRED,
            message: `Verify stage: delegation expired (expiresAt ${pointer.expiresAt} is before evaluation clock)`,
        });
        return {
            reject: true,
            rejectReason: `delegation expired at ${pointer.expiresAt}`,
            warnings,
            delegation,
        };
    }
    if (unregistered.length > 0) {
        warnings.push({
            code: WARN_DELEGATION_UNREGISTERED_SCOPE,
            message: `Compose stage: ${unregistered.length} unregistered scope(s) restricted out (O7): ${unregistered.join(", ")}`,
        });
    }
    if (delegation.effectiveScopes.length === 0) {
        warnings.push({
            code: WARN_DELEGATION_EMPTY_SCOPE,
            message: "Compose stage: empty effective scope — delegation grants no capabilities (fail-closed default, Base §6.5.1)",
        });
    }
    if (!attributed) {
        warnings.push({
            code: WARN_DELEGATION_UNATTRIBUTED,
            message: "Compose stage: no delegateId — delegation is attributed to no agent (fail-closed default, Base §6.5.1)",
        });
    }
    delegation.status = warnings.length > 0 ? "accepted-with-warnings" : "accepted";
    return { reject: false, rejectReason: null, warnings, delegation };
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
    const hasType = t === "um:Manifest" || (Array.isArray(t) && t.includes("um:Manifest"));
    if (!hasType)
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
export async function structuralVerdictWo139(manifest) {
    const reasons = [];
    reasons.push(...envelopeErrors(manifest));
    if (reasons.length === 0) {
        const subject = manifest.subject;
        for (const pointer of getAgentDelegationPointers(manifest)) {
            const shape = validateAgentDelegationShape(pointer);
            if (!shape.valid) {
                reasons.push(...shape.errors);
                continue;
            }
            if (pointer.delegatedBy !== manifest.subject) {
                reasons.push(`agentDelegation.delegatedBy "${pointer.delegatedBy}" does not match manifest subject "${subject}" (Base §6.5.1)`);
            }
        }
    }
    let sigReport = null;
    if (reasons.length === 0) {
        sigReport = await verifyManifestProfileA(manifest);
        if (!sigReport.ok)
            reasons.push(`signature verification failed: ${sigReport.reason}`);
    }
    return {
        result: reasons.length === 0 ? "accept" : "reject",
        reasons,
        checks: { signature: sigReport ? sigReport.reason : "not-evaluated" },
    };
}
export async function evaluateWo139(manifest, context = {}) {
    const nowMs = isIsoDateTime(context.now) ? Date.parse(context.now) : Date.now();
    const manifestId = manifest && typeof manifest === "object" && isNonEmptyString(manifest["@id"]) ? manifest["@id"] : "(unknown)";
    const warnings = [];
    const delegations = [];
    const receipt = {
        "@type": "um:Receipt",
        manifestId,
        outcome: "rejected",
        signatureCheck: "not-evaluated",
        delegations,
        warnings,
    };
    const finish = (outcome) => {
        receipt.outcome = outcome;
        return { result: outcome === "rejected" ? "reject" : "accept", receipt };
    };
    const envErrors = envelopeErrors(manifest);
    if (envErrors.length > 0) {
        warnings.push({ code: "um:reason:structure:malformed", message: `Verify stage: ${envErrors.join("; ")}` });
        return finish("rejected");
    }
    const pointers = getAgentDelegationPointers(manifest);
    for (const pointer of pointers) {
        const shape = validateAgentDelegationShape(pointer);
        if (!shape.valid) {
            warnings.push({ code: "um:reason:structure:malformed", message: `Verify stage: ${shape.errors.join("; ")}` });
            return finish("rejected");
        }
    }
    const sig = manifest.signature;
    if (!sig || typeof sig !== "object") {
        receipt.signatureCheck = "missing";
        warnings.push({ code: "um:reason:crypto:signature-missing", message: "Verify stage: missing signature" });
        return finish("rejected");
    }
    const sigReport = await verifyManifestProfileA(manifest);
    if (!sigReport.ok) {
        receipt.signatureCheck = sigReport.reason === "unsupported-profile" ? "unsupported-profile" : "invalid";
        warnings.push({
            code: sigReport.reason === "unsupported-profile" ? "um:reason:crypto:unsupported-profile" : "um:reason:crypto:signature-invalid",
            message: `Verify stage: ${sigReport.reason}`,
        });
        return finish("rejected");
    }
    receipt.signatureCheck = "valid";
    let anyReject = false;
    for (const pointer of pointers) {
        const out = evaluateDelegation(pointer, { subject: manifest.subject, nowMs });
        delegations.push(out.delegation);
        warnings.push(...out.warnings);
        if (out.reject)
            anyReject = true;
    }
    if (anyReject)
        return finish("rejected");
    if (warnings.length > 0)
        return finish("accepted-with-warnings");
    return finish("accepted");
}
export function emitAgentDelegationPointer({ delegatedBy, delegateId, delegateType = "ai-agent", scope = [], delegatedAt, expiresAt, livenessEndpoint, } = {}) {
    if (!isNonEmptyString(delegatedBy))
        throw new Error("emitAgentDelegationPointer: delegatedBy (manifest subject) is required");
    if (!DELEGATE_TYPES.includes(delegateType))
        throw new Error(`emitAgentDelegationPointer: delegateType must be one of ${DELEGATE_TYPES.join("|")}`);
    const bad = (Array.isArray(scope) ? scope : []).filter((s) => !isRegisteredScope(s));
    if (bad.length > 0)
        throw new Error(`emitAgentDelegationPointer: unregistered O7 scope(s): ${bad.join(", ")}`);
    const now = isIsoDateTime(delegatedAt) ? delegatedAt : new Date().toISOString();
    const pointer = {
        "@type": AGENT_DELEGATION_TYPE,
        delegateType,
        delegatedBy,
        delegatedAt: now,
        expiresAt: isIsoDateTime(expiresAt) ? expiresAt : new Date(Date.parse(now) + 3600_000).toISOString(),
        scope: (Array.isArray(scope) ? scope : []).slice(),
    };
    if (isNonEmptyString(delegateId))
        pointer.delegateId = delegateId;
    if (isNonEmptyString(livenessEndpoint))
        pointer.livenessEndpoint = livenessEndpoint;
    return pointer;
}
export async function buildDelegationDemoSurface({ manifest, now, ai_agentLabel = "ai_agent" } = {}) {
    const nowIso = isIsoDateTime(now) ? now : new Date().toISOString();
    const live = await evaluateWo139(manifest, { now: nowIso });
    const pointers = getAgentDelegationPointers(manifest);
    const latestExpiry = pointers.reduce((m, p) => Math.max(m, Date.parse(p.expiresAt) || 0), 0);
    const afterExpiry = new Date(latestExpiry + 1000).toISOString();
    const expired = await evaluateWo139(manifest, { now: afterExpiry });
    return {
        label: ai_agentLabel,
        live: {
            outcome: live.receipt.outcome,
            delegations: live.receipt.delegations,
            warnings: live.receipt.warnings,
            evaluatedAt: nowIso,
        },
        expired: {
            outcome: expired.receipt.outcome,
            delegations: expired.receipt.delegations,
            warnings: expired.receipt.warnings,
            evaluatedAt: afterExpiry,
        },
    };
}
export const feature_FIXTURE_FILENAMES = Object.freeze([
    "valid/manifest-with-agent-delegation-scopes.jsonld",
    "valid/agent-delegation-fail-closed-defaults.jsonld",
    "invalid/agent-delegation-delegatedby-mismatch.jsonld",
    "invalid/agent-delegation-expired.jsonld",
]);
export async function featureFixtureHandler(fixtureJson, expectedEntry = {}) {
    if (expectedEntry.validationMode === "evaluation") {
        const { result, receipt } = await evaluateWo139(fixtureJson, expectedEntry.evaluationContext || {});
        return {
            result,
            reason: receipt.warnings?.[0]?.message || receipt.outcome,
            receipt,
        };
    }
    const verdict = await structuralVerdictWo139(fixtureJson);
    return { result: verdict.result, reason: verdict.reasons.join("; ") || "structural contract satisfied" };
}
export function registerWo139(registry) {
    if (!registry || typeof registry.register !== "function") {
        throw new Error("registerWo139: registry with a register(filename, handler) function required");
    }
    for (const filename of feature_FIXTURE_FILENAMES) {
        registry.register(filename, featureFixtureHandler);
    }
    return feature_FIXTURE_FILENAMES.length;
}
