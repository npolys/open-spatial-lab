import { UM_V04_CONTEXT, UM_V04_MANIFEST_VERSION } from "./interfaces.mjs";
import { attachSignatureProfileA } from "../signing/um-signature-profile-a.mjs";
export const RECEIPT_OUTCOMES = Object.freeze([
    "accepted",
    "accepted-with-warnings",
    "accepted-partial",
    "rejected",
]);
export const FACET_STATUS_SET = Object.freeze([
    "processed",
    "opaque",
    "consent-denied",
    "consent-missing",
    "trustTierUnsupported",
    "assuranceInsufficient",
    "not-projected",
    "written",
]);
export const SIGNATURE_CHECKS = Object.freeze([
    "valid",
    "invalid",
    "unsupported-profile",
    "missing",
    "not-evaluated",
]);
export const FRESHNESS_CHECKS = Object.freeze(["fresh", "expired", "stale", "not-evaluated"]);
export const HOLDER_BINDING_STATUSES = Object.freeze(["verified", "failed", "unsupported-mode", "absent"]);
export const PRESENTATION_PROOF_STATUSES = Object.freeze(["verified", "failed", "missing-required", "absent"]);
export const LIVENESS_FRESHNESS_CLASSES = Object.freeze(["live", "recent", "stale", "unknown"]);
export const KEYREF_RESOLUTIONS = Object.freeze(["resolved", "unresolved"]);
export const REVOCATION_STATUSES = Object.freeze(["unchecked", "active", "revoked", "suspended"]);
export const CONSENT_ENTRY_STATUSES = Object.freeze(["granted", "expired", "withdrawn", "scope-mismatch", "condition-violated"]);
export const CLAIM_ENTRY_STATUSES = Object.freeze(["bound", "unverified", "unprocessable", "trustTierUnsupported"]);
export const SIX_STAGES = Object.freeze(["Arrive", "Verify", "Project", "Consent", "Compose", "Receipt"]);
export const RP1_EVENT_TAXONOMY = Object.freeze([
    "session-admitted",
    "session-denied",
    "session-degraded",
    "capability-granted",
    "capability-denied",
    "capability-revoked",
    "package-trusted",
    "package-rejected",
    "policy-override-applied",
    "cross-fabric-portal-cleared",
    "terms-acknowledged",
    "co-presence-entity-type-asserted",
    "avatar-retrieved",
    "avatar-substituted",
    "shader-trusted",
    "shader-rejected",
]);
export const PREVIEW_KEY_LIFECYCLE_EVENTS = Object.freeze(["facet-key-rotated", "facet-key-shredded"]);
export const FIXTURE_LOCAL_EVENT_CLASSES = Object.freeze(["session-unlocked", "departure"]);
export function isCanonicalEventClass(eventClass) {
    return (RP1_EVENT_TAXONOMY.includes(eventClass) ||
        PREVIEW_KEY_LIFECYCLE_EVENTS.includes(eventClass) ||
        FIXTURE_LOCAL_EVENT_CLASSES.includes(eventClass));
}
export const WARNING_CODES = Object.freeze([
    "um:reason:structure:malformed",
    "um:reason:crypto:signature-missing",
    "um:reason:crypto:signature-invalid",
    "um:reason:crypto:unsupported-profile",
    "um:reason:freshness:stale",
    "um:reason:freshness:expired",
    "um:reason:trust:tier-unsupported",
    "um:reason:trust:unbound-claims",
    "um:reason:trust:binding-failed",
    "um:reason:trust:binding-mode-unsupported",
    "um:reason:trust:presentation-validation-failed",
    "um:reason:trust:presentation-validation-missing",
    "um:reason:consent:consent-missing",
    "um:reason:consent:expired",
    "um:reason:consent:withdrawn",
    "um:reason:consent:scope-mismatch",
    "um:reason:consent:condition-violated",
    "um:reason:delegation:expired",
    "um:reason:delegation:empty-scope",
    "um:reason:delegation:unattributed",
    "um:reason:delegation:unregistered-scope",
    "um:reason:delegation:delegator-mismatch",
    "um:reason:crypto:key-rotated",
    "um:reason:crypto:key-shredded",
]);
export const CHAIN_EVENT_REQUIRED_FIELDS = Object.freeze(["seq", "eventClass", "subject", "reason"]);
export const CHAIN_EVENT_OPTIONAL_FIELDS = Object.freeze(["capability", "target", "facetKeyRef", "at"]);
export const CHAIN_FORBIDDEN_PAYLOADS = Object.freeze([
    "raw-um-manifests",
    "raw-embedded-credentials",
    "decrypted-private-facet-contents",
    "key-material",
    "zkp-material",
    "source-adapter-payloads",
]);
function isNonEmptyString(v) {
    return typeof v === "string" && v.length > 0;
}
function isIsoDateTime(v) {
    return isNonEmptyString(v) && Number.isFinite(Date.parse(v));
}
function isTierInt(v) {
    return Number.isInteger(v) && v >= 0 && v <= 3;
}
function randomHex(bytes) {
    const buf = new Uint8Array(bytes);
    globalThis.crypto.getRandomValues(buf);
    let hex = "";
    for (const b of buf)
        hex += b.toString(16).padStart(2, "0");
    return hex;
}
function mintUrnUuid() {
    return `urn:uuid:${globalThis.crypto.randomUUID()}`;
}
export function createReceipt({ manifestId, evaluatorId, exchangeId, receiptId } = {}) {
    const receipt = {
        "@type": "um:Receipt",
        manifestId: isNonEmptyString(manifestId) ? manifestId : "(unknown)",
        outcome: "rejected",
        signatureCheck: "not-evaluated",
        freshnessCheck: "not-evaluated",
        facetStatuses: [],
        warnings: [],
    };
    if (isNonEmptyString(receiptId))
        receipt.receiptId = receiptId;
    if (isNonEmptyString(evaluatorId))
        receipt.evaluatorId = evaluatorId;
    if (isNonEmptyString(exchangeId))
        receipt.exchangeId = exchangeId;
    return receipt;
}
export function validateReceiptShape(receipt) {
    const errors = [];
    const r = receipt;
    if (!r || typeof r !== "object" || Array.isArray(r))
        return { valid: false, errors: ["receipt must be an object"] };
    const t = r["@type"];
    const hasReceiptType = t === "um:Receipt" || (Array.isArray(t) && t.includes("um:Receipt"));
    if (!hasReceiptType)
        errors.push('@type must be or include "um:Receipt" (MUST 2.5)');
    if (!isNonEmptyString(r.manifestId))
        errors.push("manifestId is required (MUST 2.5)");
    if (!RECEIPT_OUTCOMES.includes(r.outcome))
        errors.push(`outcome must be one of ${RECEIPT_OUTCOMES.join("|")} (MUST 2.5)`);
    if (!SIGNATURE_CHECKS.includes(r.signatureCheck))
        errors.push(`signatureCheck must be one of ${SIGNATURE_CHECKS.join("|")}`);
    if (!FRESHNESS_CHECKS.includes(r.freshnessCheck))
        errors.push(`freshnessCheck must be one of ${FRESHNESS_CHECKS.join("|")}`);
    if (!Array.isArray(r.facetStatuses)) {
        errors.push("facetStatuses must be an array (empty when the manifest has zero facets — MUST 2.5)");
    }
    else {
        r.facetStatuses.forEach((f, i) => {
            if (!f || typeof f !== "object")
                return errors.push(`facetStatuses[${i}] must be an object`);
            if (!isNonEmptyString(f.facetId) && !isNonEmptyString(f.name))
                errors.push(`facetStatuses[${i}] needs facetId (or name)`);
            if (!FACET_STATUS_SET.includes(f.status))
                errors.push(`facetStatuses[${i}].status "${f.status}" not in the 8-value set (MUST 2.6)`);
            if (f.assuranceStatus !== undefined) {
                const a = f.assuranceStatus;
                if (!a || typeof a !== "object" || !isNonEmptyString(a.assertedClass) || typeof a.met !== "boolean") {
                    errors.push(`facetStatuses[${i}].assuranceStatus must be { assertedClass: string, met: boolean }`);
                }
            }
        });
    }
    if (r.warnings !== undefined) {
        if (!Array.isArray(r.warnings)) {
            errors.push("warnings must be an array of { code, message } when present");
        }
        else {
            r.warnings.forEach((w, i) => {
                if (!w || typeof w !== "object" || !isNonEmptyString(w.code) || !isNonEmptyString(w.message)) {
                    errors.push(`warnings[${i}] must be { code: string, message: string }`);
                }
            });
        }
    }
    if (r.keyRefResolution !== undefined && !KEYREF_RESOLUTIONS.includes(r.keyRefResolution))
        errors.push(`keyRefResolution "${r.keyRefResolution}" invalid`);
    if (r.revocationStatus !== undefined && !REVOCATION_STATUSES.includes(r.revocationStatus))
        errors.push(`revocationStatus "${r.revocationStatus}" invalid`);
    if (r.holderBindingStatus !== undefined && !HOLDER_BINDING_STATUSES.includes(r.holderBindingStatus))
        errors.push(`holderBindingStatus "${r.holderBindingStatus}" invalid`);
    if (r.presentationProofStatus !== undefined && !PRESENTATION_PROOF_STATUSES.includes(r.presentationProofStatus))
        errors.push(`presentationProofStatus "${r.presentationProofStatus}" invalid`);
    if (r.effectiveTrustTier !== undefined && !isTierInt(r.effectiveTrustTier))
        errors.push("effectiveTrustTier must be an integer 0..3");
    if (r.crossDidBindingStatus !== undefined && !isNonEmptyString(r.crossDidBindingStatus))
        errors.push("crossDidBindingStatus must be a non-empty string");
    if (r.livenessStatus !== undefined) {
        const l = r.livenessStatus;
        if (!l || typeof l !== "object" || !LIVENESS_FRESHNESS_CLASSES.includes(l.freshnessClass)) {
            errors.push(`livenessStatus must be an object with freshnessClass ∈ ${LIVENESS_FRESHNESS_CLASSES.join("|")}`);
        }
    }
    if (r.consentStatuses !== undefined) {
        if (!Array.isArray(r.consentStatuses))
            errors.push("consentStatuses must be an array");
        else
            r.consentStatuses.forEach((c, i) => {
                if (!c || !isNonEmptyString(c.consentRef) || !isNonEmptyString(c.status))
                    errors.push(`consentStatuses[${i}] must carry consentRef + status`);
                else if (!CONSENT_ENTRY_STATUSES.includes(c.status))
                    errors.push(`consentStatuses[${i}].status "${c.status}" invalid`);
            });
    }
    if (r.claimStatuses !== undefined) {
        if (!Array.isArray(r.claimStatuses))
            errors.push("claimStatuses must be an array");
        else
            r.claimStatuses.forEach((c, i) => {
                if (!c || !isNonEmptyString(c.claimRef) || !isNonEmptyString(c.status))
                    errors.push(`claimStatuses[${i}] must carry claimRef + status`);
                if (c && c.tier !== undefined && !isTierInt(c.tier))
                    errors.push(`claimStatuses[${i}].tier must be an integer 0..3`);
            });
    }
    if (r.unprocessedEntries !== undefined) {
        if (!Array.isArray(r.unprocessedEntries))
            errors.push("unprocessedEntries must be an array");
        else
            r.unprocessedEntries.forEach((u, i) => {
                if (!u || !isNonEmptyString(u.kind))
                    errors.push(`unprocessedEntries[${i}] must carry kind (+ type)`);
            });
    }
    if (r.events !== undefined) {
        if (!Array.isArray(r.events))
            errors.push("events must be an array");
        else
            r.events.forEach((e, i) => {
                if (!e || !isNonEmptyString(e.eventType))
                    errors.push(`events[${i}] must carry eventType`);
                if (e && e.at !== undefined && !isIsoDateTime(e.at))
                    errors.push(`events[${i}].at must be ISO 8601`);
            });
    }
    if (r.exchangeId !== undefined && !isNonEmptyString(r.exchangeId))
        errors.push("exchangeId must be a non-empty string");
    if (r.evaluatorId !== undefined && !isNonEmptyString(r.evaluatorId))
        errors.push("evaluatorId must be a non-empty string");
    if (r.seq !== undefined && !(Number.isInteger(r.seq) && r.seq >= 0))
        errors.push("seq must be a non-negative integer (EXT-OPT O4 PREVIEW)");
    if (r.prevHash !== undefined && r.prevHash !== null && !/^sha256:[0-9a-f]{64}$/.test(String(r.prevHash))) {
        errors.push('prevHash must be "sha256:<64 hex>" or null (genesis) — computed ONLY by runtime');
    }
    if (r.processedAt !== undefined && !isIsoDateTime(r.processedAt))
        errors.push("processedAt must be ISO 8601");
    return { valid: errors.length === 0, errors };
}
const FACET_BASELINE = "processed";
const CLAIM_BASELINE = "unverified";
const HB_DOMINANCE = { failed: 3, "unsupported-mode": 2, absent: 1, verified: 0 };
const PP_DOMINANCE = { failed: 3, "missing-required": 2, verified: 1, absent: 0 };
const FACET_STATUS_DOMINANCE = Object.freeze({
    assuranceInsufficient: 5,
    "consent-denied": 4,
    trustTierUnsupported: 4,
    opaque: 3,
    "consent-missing": 3,
    "not-projected": 2,
    written: 1,
    processed: 0,
});
const CLAIM_STATUS_DOMINANCE = Object.freeze({
    trustTierUnsupported: 3,
    unprocessable: 2,
    bound: 1,
    unverified: 0,
});
export function mergeFragment(receipt, fragment) {
    const diag = { rejected: false, conflicts: [], extras: {} };
    if (!fragment || typeof fragment !== "object")
        return diag;
    const f = fragment;
    if (isNonEmptyString(f.engine))
        diag.engine = f.engine;
    const contribution = isNonEmptyString(f.outcome) ? f.outcome : f.verdict;
    if (contribution === "rejected")
        diag.rejected = true;
    for (const key of ["signatureCheck", "freshnessCheck"]) {
        if (!isNonEmptyString(f[key]))
            continue;
        if (receipt[key] === "not-evaluated" || receipt[key] === undefined)
            receipt[key] = f[key];
        else if (receipt[key] !== f[key])
            diag.conflicts.push(`${key}: kept "${receipt[key]}", fragment said "${f[key]}"`);
    }
    if (Array.isArray(f.facetStatuses)) {
        for (const entry of f.facetStatuses) {
            if (!entry || typeof entry !== "object")
                continue;
            const key = entry.facetId ?? entry.name;
            const existing = receipt.facetStatuses.find((x) => (x.facetId ?? x.name) === key);
            if (!existing) {
                receipt.facetStatuses.push({ ...entry });
            }
            else if (existing.status === FACET_BASELINE && entry.status !== FACET_BASELINE) {
                Object.assign(existing, entry);
            }
            else if (entry.status !== existing.status &&
                (FACET_STATUS_DOMINANCE[entry.status] ?? -1) > (FACET_STATUS_DOMINANCE[existing.status] ?? Infinity)) {
                diag.conflicts.push(`facet ${key}: "${existing.status}" superseded by more-severe "${entry.status}"`);
                Object.assign(existing, entry);
            }
            else if (entry.status !== existing.status && entry.status !== FACET_BASELINE) {
                diag.conflicts.push(`facet ${key}: kept "${existing.status}", fragment said "${entry.status}"`);
            }
        }
    }
    if (Array.isArray(f.claimStatuses)) {
        if (receipt.claimStatuses === undefined)
            receipt.claimStatuses = [];
        for (const entry of f.claimStatuses) {
            if (!entry || typeof entry !== "object")
                continue;
            const existing = receipt.claimStatuses.find((x) => x.claimRef === entry.claimRef);
            if (!existing) {
                receipt.claimStatuses.push({ ...entry });
            }
            else if (existing.status === CLAIM_BASELINE && entry.status !== CLAIM_BASELINE) {
                Object.assign(existing, entry);
            }
            else if (entry.status !== existing.status &&
                (CLAIM_STATUS_DOMINANCE[entry.status] ?? -1) > (CLAIM_STATUS_DOMINANCE[existing.status] ?? Infinity)) {
                diag.conflicts.push(`claim ${entry.claimRef}: "${existing.status}" superseded by more-severe "${entry.status}"`);
                Object.assign(existing, entry);
            }
            else if (entry.status !== existing.status && entry.status !== CLAIM_BASELINE) {
                diag.conflicts.push(`claim ${entry.claimRef}: kept "${existing.status}", fragment said "${entry.status}"`);
            }
        }
        if (receipt.claimStatuses.length === 0)
            delete receipt.claimStatuses;
    }
    if (Array.isArray(f.consentStatuses) && f.consentStatuses.length > 0) {
        if (receipt.consentStatuses === undefined)
            receipt.consentStatuses = [];
        for (const entry of f.consentStatuses) {
            if (!entry)
                continue;
            const dup = receipt.consentStatuses.some((x) => x.consentRef === entry.consentRef && x.facetRef === entry.facetRef);
            if (!dup)
                receipt.consentStatuses.push({ ...entry });
        }
    }
    if (Array.isArray(f.unprocessedEntries) && f.unprocessedEntries.length > 0) {
        if (receipt.unprocessedEntries === undefined)
            receipt.unprocessedEntries = [];
        for (const entry of f.unprocessedEntries) {
            if (!entry)
                continue;
            const dup = receipt.unprocessedEntries.some((x) => x.kind === entry.kind && x.type === entry.type && x.ref === entry.ref);
            if (!dup)
                receipt.unprocessedEntries.push({ ...entry });
        }
    }
    if (Array.isArray(f.warnings)) {
        if (!Array.isArray(receipt.warnings))
            receipt.warnings = [];
        for (const w of f.warnings) {
            if (!w || !isNonEmptyString(w.code) || !isNonEmptyString(w.message))
                continue;
            const dup = receipt.warnings.some((x) => x.code === w.code && x.message === w.message);
            if (!dup)
                receipt.warnings.push({ code: w.code, message: w.message });
        }
    }
    if (isNonEmptyString(f.holderBindingStatus)) {
        const cur = receipt.holderBindingStatus;
        if (cur === undefined || (HB_DOMINANCE[f.holderBindingStatus] ?? -1) > (HB_DOMINANCE[cur] ?? -1)) {
            receipt.holderBindingStatus = f.holderBindingStatus;
        }
    }
    if (isNonEmptyString(f.presentationProofStatus)) {
        const cur = receipt.presentationProofStatus;
        if (cur === undefined || (PP_DOMINANCE[f.presentationProofStatus] ?? -1) > (PP_DOMINANCE[cur] ?? -1)) {
            receipt.presentationProofStatus = f.presentationProofStatus;
        }
    }
    if (Number.isInteger(f.effectiveTrustTier)) {
        if (receipt.effectiveTrustTier === 0 || f.effectiveTrustTier === 0)
            receipt.effectiveTrustTier = 0;
        else
            receipt.effectiveTrustTier = Math.max(receipt.effectiveTrustTier ?? 0, f.effectiveTrustTier);
    }
    for (const key of ["keyRefResolution", "revocationStatus", "crossDidBindingStatus", "exchangeId", "evaluatorId"]) {
        if (receipt[key] === undefined && isNonEmptyString(f[key]))
            receipt[key] = f[key];
    }
    if (receipt.livenessStatus === undefined && f.livenessStatus && typeof f.livenessStatus === "object") {
        receipt.livenessStatus = { ...f.livenessStatus };
    }
    if (Array.isArray(f.events) && f.events.length > 0) {
        if (receipt.events === undefined)
            receipt.events = [];
        for (const e of f.events)
            if (e && isNonEmptyString(e.eventType))
                receipt.events.push({ ...e });
    }
    for (const key of ["delegations", "floorViolations", "deferredClaims", "deferredFacetIds", "rejectedBy", "processed", "notProcessed", "manifestTier", "maxSupportedTrustTier"]) {
        if (f[key] !== undefined)
            diag.extras[key] = f[key];
    }
    return diag;
}
export function composeOutcome(receipt) {
    const facets = Array.isArray(receipt.facetStatuses) ? receipt.facetStatuses : [];
    const claims = Array.isArray(receipt.claimStatuses) ? receipt.claimStatuses : [];
    const warnings = Array.isArray(receipt.warnings) ? receipt.warnings : [];
    const hasAssuranceInsufficient = facets.some((x) => x.status === "assuranceInsufficient");
    const hasProcessed = facets.some((x) => x.status === "processed" || x.status === "written");
    const hasFailed = facets.some((x) => x.status === "consent-denied" || x.status === "trustTierUnsupported" || x.status === "assuranceInsufficient");
    const hasSealed = facets.some((x) => x.status === "opaque" || x.status === "consent-missing");
    const hasUnsupportedClaim = claims.some((x) => x.status === "trustTierUnsupported");
    if (hasAssuranceInsufficient && !hasProcessed)
        return "rejected";
    if (hasFailed || hasSealed || hasUnsupportedClaim)
        return "accepted-partial";
    if (warnings.length > 0)
        return "accepted-with-warnings";
    return "accepted";
}
export function finalizeReceipt(receipt, { rejected = false, outcomeOverride, now, omitProcessedAt = false } = {}) {
    receipt.outcome = isNonEmptyString(outcomeOverride)
        ? outcomeOverride
        : rejected
            ? "rejected"
            : composeOutcome(receipt);
    if (!omitProcessedAt)
        receipt.processedAt = isIsoDateTime(now) ? now : new Date().toISOString();
    const shape = validateReceiptShape(receipt);
    if (!shape.valid)
        throw new Error(`finalizeReceipt: canonical shape violated — ${shape.errors.join("; ")}`);
    return receipt;
}
export function assertReceiptAgainstExpectedEntry(receipt, entry) {
    const mismatches = [];
    const r = receipt || {};
    const e = entry || {};
    const want = (field, actual, expected) => {
        if (actual !== expected)
            mismatches.push(`${field}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
    };
    if (e.expectedReceiptOutcome !== undefined)
        want("outcome", r.outcome, e.expectedReceiptOutcome);
    if (e.expectedSignatureCheck !== undefined)
        want("signatureCheck", r.signatureCheck, e.expectedSignatureCheck);
    if (e.expectedFreshnessCheck !== undefined)
        want("freshnessCheck", r.freshnessCheck, e.expectedFreshnessCheck);
    if (e.expectedHolderBindingStatus !== undefined)
        want("holderBindingStatus", r.holderBindingStatus, e.expectedHolderBindingStatus);
    if (e.expectedPresentationProofStatus !== undefined)
        want("presentationProofStatus", r.presentationProofStatus, e.expectedPresentationProofStatus);
    if (e.expectedKeyRefResolution !== undefined)
        want("keyRefResolution", r.keyRefResolution, e.expectedKeyRefResolution);
    if (e.expectedEffectiveTrustTier !== undefined)
        want("effectiveTrustTier", r.effectiveTrustTier, e.expectedEffectiveTrustTier);
    if (e.expectedLivenessFreshnessClass !== undefined) {
        want("livenessStatus.freshnessClass", r.livenessStatus?.freshnessClass, e.expectedLivenessFreshnessClass);
    }
    if (e.expectedFacetStatus !== undefined) {
        const x = e.expectedFacetStatus;
        const hit = (r.facetStatuses || []).find((f) => f.facetId === x.facetId);
        if (!hit)
            mismatches.push(`facetStatuses: no entry for facetId ${x.facetId}`);
        else {
            want(`facetStatuses[${x.facetId}].status`, hit.status, x.status);
            if (x.assuranceStatus !== undefined) {
                want(`facetStatuses[${x.facetId}].assuranceStatus.assertedClass`, hit.assuranceStatus?.assertedClass, x.assuranceStatus.assertedClass);
                want(`facetStatuses[${x.facetId}].assuranceStatus.met`, hit.assuranceStatus?.met, x.assuranceStatus.met);
            }
        }
    }
    if (e.expectedConsentStatus !== undefined) {
        const x = e.expectedConsentStatus;
        const hit = (r.consentStatuses || []).find((c) => c.consentRef === x.consentRef);
        if (!hit)
            mismatches.push(`consentStatuses: no entry for consentRef ${x.consentRef}`);
        else
            want(`consentStatuses[${x.consentRef}].status`, hit.status, x.status);
    }
    if (e.expectedClaimStatus !== undefined) {
        const x = e.expectedClaimStatus;
        const hit = (r.claimStatuses || []).find((c) => c.claimRef === x.claimRef);
        if (!hit)
            mismatches.push(`claimStatuses: no entry for claimRef ${x.claimRef}`);
        else {
            want(`claimStatuses[${x.claimRef}].status`, hit.status, x.status);
            if (x.tier !== undefined)
                want(`claimStatuses[${x.claimRef}].tier`, hit.tier, x.tier);
        }
    }
    if (e.expectedUnprocessedEntry !== undefined) {
        const x = e.expectedUnprocessedEntry;
        const hit = (r.unprocessedEntries || []).some((u) => u.kind === x.kind && u.type === x.type);
        if (!hit)
            mismatches.push(`unprocessedEntries: no {kind:${x.kind}, type:${x.type}} entry`);
    }
    if (Array.isArray(e.expectedWarningsContain)) {
        const codes = new Set((r.warnings || []).map((w) => w.code));
        for (const code of e.expectedWarningsContain) {
            if (!codes.has(code))
                mismatches.push(`warnings: missing required code ${code}`);
        }
    }
    return { ok: mismatches.length === 0, mismatches };
}
export function createReceiptChain({ subject, chainId, flushPolicy = "session-end" } = {}) {
    return {
        chainId: isNonEmptyString(chainId) ? chainId : `urn:um:chain:${randomHex(16)}`,
        ...(isNonEmptyString(subject) ? { subject } : {}),
        flushPolicy,
        createdAt: new Date().toISOString(),
        sealed: false,
        events: [],
    };
}
export function appendChainEvent(chain, fields, { strict = false } = {}) {
    if (!chain || chain.sealed)
        throw new Error("appendChainEvent: chain is sealed (flushPolicy session-end) or missing");
    const f = fields || {};
    if ("seq" in f)
        throw new Error("appendChainEvent: seq is assigned by the chain, never supplied");
    for (const key of Object.keys(f)) {
        if (key === "eventClass" || key === "subject" || key === "reason")
            continue;
        if (!CHAIN_EVENT_OPTIONAL_FIELDS.includes(key)) {
            throw new Error(`appendChainEvent: field "${key}" is outside the minimized-receipt whitelist (forbiddenPayloads: ${CHAIN_FORBIDDEN_PAYLOADS.join(", ")})`);
        }
    }
    if (!isNonEmptyString(f.eventClass) || !isNonEmptyString(f.subject) || !isNonEmptyString(f.reason)) {
        throw new Error(`appendChainEvent: requiredFields ${CHAIN_EVENT_REQUIRED_FIELDS.join("/")} — eventClass, subject and reason must be non-empty strings`);
    }
    if (strict && !isCanonicalEventClass(f.eventClass)) {
        throw new Error(`appendChainEvent: "${f.eventClass}" is not a canonical event class (strict mode)`);
    }
    for (const key of ["capability", "target", "facetKeyRef"]) {
        if (f[key] !== undefined && !isNonEmptyString(f[key]))
            throw new Error(`appendChainEvent: ${key} must be a non-empty string when present`);
    }
    if (f.at !== undefined && !isIsoDateTime(f.at))
        throw new Error("appendChainEvent: at must be ISO 8601 when present");
    const event = {
        seq: chain.events.length + 1,
        eventClass: f.eventClass,
        subject: f.subject,
        ...(f.capability !== undefined ? { capability: f.capability } : {}),
        ...(f.target !== undefined ? { target: f.target } : {}),
        ...(f.facetKeyRef !== undefined ? { facetKeyRef: f.facetKeyRef } : {}),
        reason: f.reason,
        ...(f.at !== undefined ? { at: f.at } : {}),
    };
    chain.events.push(event);
    return event;
}
export function sealReceiptChain(chain, { at } = {}) {
    if (!chain || chain.sealed)
        throw new Error("sealReceiptChain: chain missing or already sealed");
    chain.sealed = true;
    chain.sealedAt = isIsoDateTime(at) ? at : new Date().toISOString();
    return chain;
}
export function chainTraceRows(chain) {
    return (chain?.events || []).map(({ at, ...row }) => ({ ...row }));
}
export function chainToReceiptEvents(chain, { defaultAt } = {}) {
    const fallbackAt = isIsoDateTime(defaultAt) ? defaultAt : chain?.sealedAt || new Date().toISOString();
    return (chain?.events || []).map((e) => ({
        eventType: e.eventClass,
        at: isIsoDateTime(e.at) ? e.at : fallbackAt,
        subjectRef: e.subject,
        ...(e.facetKeyRef !== undefined ? { facetKeyRef: e.facetKeyRef } : {}),
        reason: e.reason,
    }));
}
const FF_USER = "did:peer:2.Ez6LRp1FactoryFloorSafetyPairwiseUserProjection";
const FF_SERVICE = "did:web:factory.example.com:services:floor-safety";
const FF_PACKAGE = "did:web:factory-services.example.com:packages:floor-safety-v2";
const FF_KEYREF_BASE = "urn:um:facet-key:fixture:factory-floor-policy-vector:safety-certification";
export function buildFactoryFloorTraces() {
    const positive = createReceiptChain({ subject: FF_USER });
    appendChainEvent(positive, { eventClass: "session-admitted", subject: FF_USER, reason: "bilateral-authorisation-completed" });
    appendChainEvent(positive, { eventClass: "policy-override-applied", subject: FF_SERVICE, reason: "mandatory-non-dismissable-safety-overlay" });
    appendChainEvent(positive, { eventClass: "capability-granted", subject: FF_USER, capability: "credential.verify", target: "safetyCertification", reason: "safety-certification-validation-required" });
    appendChainEvent(positive, { eventClass: "capability-granted", subject: FF_USER, capability: "som.access", target: "/factory/floor-2/safety-service/**", reason: "equipment-access-granted" });
    appendChainEvent(positive, { eventClass: "terms-acknowledged", subject: FF_USER, reason: "terms-v1-accepted" });
    appendChainEvent(positive, { eventClass: "package-trusted", subject: FF_PACKAGE, reason: "package-status-trusted-and-fresh" });
    appendChainEvent(positive, { eventClass: "shader-trusted", subject: FF_PACKAGE, target: "../../artifacts/highlight.spv.fixture", reason: "spir-v-artifact-hash-matched" });
    appendChainEvent(positive, { eventClass: "capability-granted", subject: FF_SERVICE, capability: "inter-service.message", target: "hazard-reroute", reason: "authorized-inter-service-hazard-reroute-message" });
    appendChainEvent(positive, { eventClass: "policy-override-applied", subject: FF_SERVICE, reason: "non-dismissable-safety-overlay-enforced" });
    appendChainEvent(positive, { eventClass: "departure", subject: FF_USER, reason: "session-completed" });
    sealReceiptChain(positive);
    const denial = createReceiptChain({ subject: FF_SERVICE });
    appendChainEvent(denial, { eventClass: "package-rejected", subject: FF_SERVICE, target: "com.example.factory.social-overlay", reason: "prohibited-social-advertising-overlay-package" });
    appendChainEvent(denial, { eventClass: "capability-denied", subject: FF_SERVICE, capability: "overlay.compose", reason: "overlay-composition-not-permitted-on-safety-floor" });
    appendChainEvent(denial, { eventClass: "capability-denied", subject: FF_SERVICE, capability: "sensor.cameraPassthrough", reason: "camera-passthrough-not-requested-and-denied" });
    appendChainEvent(denial, { eventClass: "capability-denied", subject: FF_SERVICE, capability: "sensor.roomGeometry", reason: "room-geometry-not-requested-and-denied" });
    sealReceiptChain(denial);
    const renewal = createReceiptChain({ subject: FF_USER });
    appendChainEvent(renewal, { eventClass: "session-unlocked", subject: FF_USER, reason: "bounded-private-data-window-opened" });
    appendChainEvent(renewal, { eventClass: "capability-granted", subject: FF_USER, capability: "service.projection.renew", target: "safety-service", reason: "renewed-service-projection" });
    appendChainEvent(renewal, { eventClass: "capability-revoked", subject: FF_PACKAGE, capability: "package.trust", target: "com.example.factory.floor-safety", reason: "package-or-service-handle-revoked" });
    appendChainEvent(renewal, { eventClass: "facet-key-rotated", subject: FF_USER, facetKeyRef: `${FF_KEYREF_BASE}#rot-1`, reason: "scheduled-facet-key-rotation" });
    appendChainEvent(renewal, { eventClass: "facet-key-shredded", subject: FF_USER, facetKeyRef: `${FF_KEYREF_BASE}#rot-0`, reason: "prior-facet-key-shredded" });
    sealReceiptChain(renewal);
    return {
        positive: chainTraceRows(positive),
        denial: chainTraceRows(denial),
        "renewal-revocation-session-unlock": chainTraceRows(renewal),
    };
}
export function mintExchangeId() {
    return `urn:um:exchange:${randomHex(16)}`;
}
export function stampBilateral(receipt, { exchangeId, evaluatorId } = {}) {
    if (!isNonEmptyString(exchangeId) || !isNonEmptyString(evaluatorId)) {
        throw new Error("stampBilateral: exchangeId and evaluatorId are both required (CONFORMANCE Section 4)");
    }
    receipt.exchangeId = exchangeId;
    receipt.evaluatorId = evaluatorId;
    return receipt;
}
export function correlateDualReceipts(receiptA, receiptB, { exchangeId, evaluatorIdA, evaluatorIdB } = {}) {
    const xid = isNonEmptyString(exchangeId) ? exchangeId : mintExchangeId();
    stampBilateral(receiptA, { exchangeId: xid, evaluatorId: evaluatorIdA ?? receiptA.evaluatorId });
    stampBilateral(receiptB, { exchangeId: xid, evaluatorId: evaluatorIdB ?? receiptB.evaluatorId });
    if (receiptA.evaluatorId === receiptB.evaluatorId) {
        throw new Error("correlateDualReceipts: the two receipts must come from DISTINCT evaluators");
    }
    return { exchangeId: xid, receipts: [receiptA, receiptB] };
}
export function reserveChainLinkFields(receipt, { seq, prevHash, chainId } = {}) {
    if (seq !== undefined) {
        if (!(Number.isInteger(seq) && seq >= 0))
            throw new Error("reserveChainLinkFields: seq must be a non-negative integer");
        receipt.seq = seq;
    }
    if (prevHash !== undefined) {
        if (prevHash !== null && !/^sha256:[0-9a-f]{64}$/.test(String(prevHash))) {
            throw new Error('reserveChainLinkFields: prevHash must be "sha256:<64 hex>" or null (genesis)');
        }
        receipt.prevHash = prevHash;
    }
    if (chainId !== undefined) {
        if (!isNonEmptyString(chainId))
            throw new Error("reserveChainLinkFields: chainId must be a non-empty string");
        receipt.chainId = chainId;
    }
    return receipt;
}
export function buildReceiptExpectationsFacet({ id } = {}) {
    return {
        "@id": isNonEmptyString(id) ? id : `urn:um:facet:receipt-expectations:${globalThis.crypto.randomUUID()}`,
        "@type": "um:Facet",
        name: "receiptExpectations",
        entity: {
            "@type": "um:Entity",
            profile: "wow-receipt-expectations-v1",
            expectedReceiptMembers: ["@type", "manifestId", "outcome", "signatureCheck", "freshnessCheck", "facetStatuses"],
            expectedOutcomes: [...RECEIPT_OUTCOMES],
            hashChainRequired: true,
            requiredFields: [...CHAIN_EVENT_REQUIRED_FIELDS],
            forbiddenPayloads: [...CHAIN_FORBIDDEN_PAYLOADS],
            flushPolicy: "session-end",
        },
    };
}
export function buildReceiptChainFacet(chain, { id } = {}) {
    if (!chain || !Array.isArray(chain.events))
        throw new Error("buildReceiptChainFacet: a receipt chain is required");
    return {
        "@id": isNonEmptyString(id) ? id : `urn:um:facet:receipt-chain:${globalThis.crypto.randomUUID()}`,
        "@type": "um:Facet",
        name: "receiptChain",
        entity: {
            "@type": "um:Entity",
            chainId: chain.chainId,
            flushPolicy: chain.flushPolicy,
            sealed: chain.sealed === true,
            ...(chain.sealedAt ? { sealedAt: chain.sealedAt } : {}),
            eventCount: chain.events.length,
            events: chainTraceRows(chain),
            seq: null,
            prevHash: null,
            sealSignature: null,
        },
    };
}
export function buildDepartureManifestDraft(chain, { subject, issuedAt, ttlSeconds = 3600, id } = {}) {
    if (!chain?.sealed)
        throw new Error("buildDepartureManifestDraft: seal the chain first (flushPolicy session-end)");
    if (!isNonEmptyString(subject))
        throw new Error("buildDepartureManifestDraft: subject (the departing entity's DID) is required");
    const issued = isIsoDateTime(issuedAt) ? issuedAt : new Date().toISOString();
    return {
        "@context": UM_V04_CONTEXT,
        "@id": isNonEmptyString(id) ? id : mintUrnUuid(),
        "@type": "um:Manifest",
        manifestVersion: UM_V04_MANIFEST_VERSION,
        subject,
        issuedAt: issued,
        expiresAt: new Date(Date.parse(issued) + ttlSeconds * 1000).toISOString(),
        facets: [buildReceiptChainFacet(chain)],
    };
}
export async function sealDepartureManifest(chain, { subject, issuedAt, ttlSeconds, id, privateKeyInput, keyRef } = {}) {
    const draft = buildDepartureManifestDraft(chain, { subject, issuedAt, ttlSeconds, id });
    return attachSignatureProfileA(draft, privateKeyInput, keyRef ? { keyRef } : {});
}
const OUTCOME_SEVERITY = Object.freeze({ rejected: 3, "accepted-partial": 2, "accepted-with-warnings": 1, accepted: 0 });
export function promoteReceiptToManifest(receipt, { subject, issuedAt, ttlSeconds = 3600, id, outcomeOverride } = {}) {
    if (!isNonEmptyString(subject))
        throw new Error("promoteReceiptToManifest: subject (the EVALUATOR's DID) is required");
    const shape = validateReceiptShape(receipt);
    if (!shape.valid)
        throw new Error(`promoteReceiptToManifest: receipt shape invalid — ${shape.errors.join("; ")}`);
    const derived = composeOutcome(receipt);
    if ((OUTCOME_SEVERITY[receipt.outcome] ?? -1) < OUTCOME_SEVERITY[derived] && outcomeOverride !== receipt.outcome) {
        throw new Error(`promoteReceiptToManifest: stated outcome "${receipt.outcome}" is more accepting than the diagnostics-derived outcome "${derived}" — ` +
            "finalize the receipt (finalizeReceipt) before emit, or attest the divergence with an explicit envelope outcomeOverride");
    }
    const issued = isIsoDateTime(issuedAt) ? issuedAt : new Date().toISOString();
    const { "@type": _t, ...members } = receipt;
    return {
        "@context": UM_V04_CONTEXT,
        "@id": isNonEmptyString(id) ? id : mintUrnUuid(),
        "@type": ["um:Manifest", "um:Receipt"],
        manifestVersion: UM_V04_MANIFEST_VERSION,
        subject,
        issuedAt: issued,
        expiresAt: new Date(Date.parse(issued) + ttlSeconds * 1000).toISOString(),
        ...members,
    };
}
export async function signReceiptManifest(receipt, envelope = {}, privateKeyInput, opts = {}) {
    const manifest = promoteReceiptToManifest(receipt, envelope);
    return attachSignatureProfileA(manifest, privateKeyInput, opts);
}
export function receiptPanelRecord(receipt, { label } = {}) {
    const facets = Array.isArray(receipt.facetStatuses) ? receipt.facetStatuses : [];
    return {
        kind: "um-receipt",
        ...(isNonEmptyString(label) ? { label } : {}),
        manifestId: receipt.manifestId,
        outcome: receipt.outcome,
        signatureCheck: receipt.signatureCheck,
        freshnessCheck: receipt.freshnessCheck,
        ...(receipt.evaluatorId ? { evaluatorId: receipt.evaluatorId } : {}),
        ...(receipt.exchangeId ? { exchangeId: receipt.exchangeId } : {}),
        facetsProcessed: facets.filter((f) => f.status === "processed" || f.status === "written").length,
        facetsWithheld: facets.filter((f) => f.status !== "processed" && f.status !== "written").length,
        warningCount: (receipt.warnings || []).length,
        at: new Date().toISOString(),
    };
}
export const feature_RECEIPT_CONFORMANCE = Object.freeze({
    wo: "runtime",
    scoped_claim: "canonical v0.4 um:Receipt container (MUST 2.5 members + MUST 2.6 8-value facet statuses + " +
        "extended disposition fields + warnings{code,message}) and the single-manifest receipt-event " +
        "chain shape (factory-floor trace oracle mirrored 3/3 paths)",
    preview_features: Object.freeze([
        "receipts-as-a-first-class-manifest-class (@type [um:Manifest,um:Receipt]) — EXT-OPT PREVIEW",
        "receipt hash-chaining seq/prevHash/chainId — surface RESERVED, computed ONLY by runtime",
        "bilateral exchangeId/evaluatorId — Base field surface; full session object is runtime",
        "key-lifecycle events facet-key-rotated/facet-key-shredded — appended by runtime",
    ]),
    not_claimed: Object.freeze([
        "NO um_conformance flag is flipped by this module",
        "the RP1 16-class taxonomy is page/fixture narrative over um:Receipt, not a normative class hierarchy",
        "the factory-floor trace is a fixture oracle, not a live review claim",
        "bilateral-session hash-chaining across two parties is runtime, not this module",
        "the full six-stage matrix run over all 72 fixtures is runtime, not this module",
    ]),
    hash_conventions: Object.freeze({
        chain: "canonicalManifestHash (runtime-projection.mjs): deep-key-sorted JSON over the WHOLE document INCLUDING signature",
        signing_input: "JCS RFC-8785 with {signature, postQuantumSignature, presentationProof} excluded (runtime/119)",
    }),
});
