import { verifyManifestProfileA } from "../signing/um-signature-profile-a.mjs";
import { matchConsentForFacet, evaluateConsentEntry, CONSENT_STATUS_GRANTED, } from "./consent-gating.mjs";
import { validateSealedFacetsStructural, checkIsolationShape, } from "./jwe-sealed-facets.mjs";
import { createReceipt, finalizeReceipt, validateReceiptShape, createReceiptChain, appendChainEvent, sealReceiptChain, chainTraceRows, buildFactoryFloorTraces, CHAIN_FORBIDDEN_PAYLOADS, PREVIEW_KEY_LIFECYCLE_EVENTS, } from "./receipt-hub.mjs";
export const feature_PRIVATE_DATA_CONFORMANCE = Object.freeze({
    wo: "runtime",
    title: "v0.4 private-data family (write auth, unlock windows, key lifecycle, sensitivity-ordering guard)",
    tier: "2",
    grade: "Grade-1 PREVIEW (structural members on the wire; enforcement semantics revisable)",
    targets: Object.freeze(["Evaluator (Base + private-data PREVIEW)", "Holder"]),
    mustRefs: Object.freeze(["CONFORMANCE §2.19 (evaluator)", "CONFORMANCE §3.14 (holder)", "CONFORMANCE §9 (PREVIEW grades)"]),
    specRefs: Object.freeze(["Base §2.3.5", "Base §3.1.4", "Base §7.2", "EXT-OPT O3.2/O3.3", "EXT-OPT O4.5"]),
    features: Object.freeze({
        isolation: "Q1 — REAL kid/iv structural scan (necessary, not sufficient — Base §2.3.5 residual gap); mechanics from runtime.",
        derivedWriteMonotonicity: "Q3 — REAL join/monotonicity; ordering is DEC-03 profile-supplied (NEVER manifest-sourced); fail-closed on undefined join.",
        writeAuthorization: "Q5 — REAL scope/lifecycle match on the runtime consent API; enforcement 'conformance-deferred' per the fixture reason. Produces PREVIEW facet status 'written'.",
        keyLifecycle: "Q6 — REAL facetKeyRef-only + reason-code + no-key-material review; §9: events are assertions, NOT erasure validation.",
        unlockWindow: "Q7 — REAL bounded-set confinement, anti-replay binding, expiry re-seal; never lowers per-facet floors or isolation.",
    }),
    dec03: "UM-v04-DEC-03 (ratified 2026-07-03): sensitivity ordering is profile-supplied. A conforming evaluator MUST NOT source ordering from the manifest under evaluation. The manifest-carried facetSensitivityOrdering member is transitional (comes off the wire pre-schema-lock); this module accepts the fixture but NEVER emits or consumes that member.",
    failsClosed: true,
    flagFlipped: false,
});
function isNonEmptyString(v) {
    return typeof v === "string" && v.length > 0;
}
function isIsoDateTime(v) {
    return isNonEmptyString(v) && Number.isFinite(Date.parse(v));
}
const V04_CONTEXT = "https://universalmanifest.net/ns/v0.4";
function envelopeErrorsV04(manifest) {
    const errors = [];
    if (!manifest || typeof manifest !== "object" || Array.isArray(manifest))
        return ["manifest must be an object"];
    const ctx = manifest["@context"];
    const hasV04 = ctx === V04_CONTEXT || (Array.isArray(ctx) && ctx.includes(V04_CONTEXT));
    if (!hasV04)
        errors.push("@context must include " + V04_CONTEXT);
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
        errors.push("issuedAt must be ISO 8601");
    if (!isIsoDateTime(manifest.expiresAt))
        errors.push("expiresAt must be ISO 8601");
    return errors;
}
function accept(code, reason, detail) {
    return { decision: "accept", code, reason, ...(detail ? { detail } : {}) };
}
function reject(code, reason, detail) {
    return { decision: "reject", code, reason, ...(detail ? { detail } : {}) };
}
export function checkFacetIsolation(value, context = {}) {
    if (envelopeErrorsV04(value).length > 0) {
        return reject("Q1_STRUCTURAL", "structural validation failed: bad v0.4 envelope");
    }
    const { encryptedFacets, errors } = validateSealedFacetsStructural(value);
    if (errors.length > 0) {
        return reject("Q1_STRUCTURAL", `structural validation failed: ${errors.join("; ")}`);
    }
    const claim = context.isolationClaim;
    if (!claim || !Array.isArray(claim.isolatedFacetIds) || claim.isolatedFacetIds.length === 0) {
        return accept("Q1_NO_CLAIM", "no isolation claim present; isolation invariant does not apply");
    }
    const claimedIds = new Set(claim.isolatedFacetIds);
    const inSet = encryptedFacets.filter((f) => claimedIds.has(f.facetId));
    const encryptedIds = new Set(encryptedFacets.map((f) => f.facetId));
    for (const id of claimedIds) {
        if (!encryptedIds.has(id)) {
            return reject("Q1_CLAIMED_FACET_NOT_ENCRYPTED", `facet ${id} is in the isolated set but is not a jwe-inline-v1 encrypted facet`, { facetId: id });
        }
    }
    const kidOwner = new Map();
    for (const f of inSet) {
        for (const r of f.entity.recipients || []) {
            const kid = r?.header?.kid;
            if (!isNonEmptyString(kid))
                continue;
            const prior = kidOwner.get(kid);
            if (prior !== undefined && prior !== f.facetId) {
                return reject("Q1_SHARED_KID", "facets in an isolated set MUST NOT share a decryption-authorizing kid", { kid, facets: [prior, f.facetId] });
            }
            kidOwner.set(kid, f.facetId);
        }
    }
    const ivOwner = new Map();
    for (const f of inSet) {
        const iv = f.entity.iv;
        if (!isNonEmptyString(iv))
            continue;
        const prior = ivOwner.get(iv);
        if (prior !== undefined && prior !== f.facetId) {
            return reject("Q1_SHARED_IV", "facets in an isolated set MUST NOT reuse an iv", { iv, facets: [prior, f.facetId] });
        }
        ivOwner.set(iv, f.facetId);
    }
    return accept("Q1_ISOLATED", "isolated set has distinct kid and iv per facet", { facetCount: inSet.length });
}
export const PINNED_SENSITIVITY_PROFILES = Object.freeze({
    "um:profile:deployment:personal-data-vault": Object.freeze({
        labels: ["public", "internal", "sensitive", "restricted"],
        order: [["public", "internal"], ["internal", "sensitive"], ["sensitive", "restricted"]],
    }),
    "um:profile:deployment:health-finance-incomparable": Object.freeze({
        labels: ["internal", "medical", "financial"],
        order: [["internal", "medical"], ["internal", "financial"]],
    }),
});
export function resolvePinnedOrdering(pinnedProfileId) {
    const o = PINNED_SENSITIVITY_PROFILES[pinnedProfileId];
    return o ? { labels: [...o.labels], order: o.order.map((p) => [...p]) } : null;
}
function buildLeq(ordering) {
    const labels = ordering.labels;
    const idx = new Map(labels.map((l, i) => [l, i]));
    const n = labels.length;
    const reach = Array.from({ length: n }, () => new Array(n).fill(false));
    for (let i = 0; i < n; i += 1)
        reach[i][i] = true;
    for (const [lo, hi] of ordering.order) {
        const i = idx.get(lo);
        const j = idx.get(hi);
        if (i === undefined || j === undefined)
            continue;
        reach[i][j] = true;
    }
    for (let k = 0; k < n; k += 1)
        for (let i = 0; i < n; i += 1) {
            if (!reach[i][k])
                continue;
            for (let j = 0; j < n; j += 1)
                if (reach[k][j])
                    reach[i][j] = true;
        }
    return (a, b) => {
        const i = idx.get(a);
        const j = idx.get(b);
        if (i === undefined || j === undefined)
            return false;
        return reach[i][j];
    };
}
function joinOf(labels, ordering, leq) {
    if (labels.length === 0)
        return undefined;
    const upper = ordering.labels.filter((cand) => labels.every((s) => leq(s, cand)));
    if (upper.length === 0)
        return undefined;
    const least = upper.filter((u) => upper.every((v) => leq(u, v)));
    return least.length === 1 ? least[0] : undefined;
}
export function checkDerivedWriteMonotonicity(value, context = {}) {
    if (envelopeErrorsV04(value).length > 0) {
        return reject("Q3_STRUCTURAL", "structural validation failed: bad v0.4 envelope");
    }
    const dw = context.derivedWrite || {};
    const sourceLabels = Array.isArray(dw.sourceLabels) ? dw.sourceLabels : [];
    const targetLabel = dw.targetLabel;
    const ordering = resolvePinnedOrdering(context.pinnedProfileId);
    if (!ordering) {
        const crossLabel = sourceLabels.some((l) => l !== targetLabel) || sourceLabels.length === 0;
        if (crossLabel) {
            return reject("Q3_NO_PINNED_PROFILE", "no deployment-pinned sensitivity profile; derived write across labels MUST fail closed (DEC-03)", { pinnedProfileId: context.pinnedProfileId ?? null });
        }
        return accept("Q3_MONOTONIC", "same-label write with no pinned ordering; trivially monotonic");
    }
    const known = new Set(ordering.labels);
    for (const l of [...sourceLabels, targetLabel]) {
        if (!known.has(l)) {
            return reject("Q3_UNKNOWN_LABEL", `label ${l} is not declared in the pinned profile`, { label: l });
        }
    }
    const leq = buildLeq(ordering);
    const join = joinOf(sourceLabels, ordering, leq);
    if (join === undefined) {
        return reject("Q3_UNDEFINED_JOIN", "no join (least upper bound) for the source labels; derived write MUST fail closed", { sourceLabels });
    }
    if (!leq(join, targetLabel)) {
        return reject("Q3_DOWN_LABEL", `derived write down-labels: target ${targetLabel} is below the join ${join}`, { join, targetLabel, sourceLabels });
    }
    return accept("Q3_MONOTONIC", `derived write carries at least the join (${join})`, { join, targetLabel });
}
export function stripSensitivityOrdering(obj) {
    if (!obj || typeof obj !== "object")
        return obj;
    const { facetSensitivityOrdering, ...rest } = obj;
    return rest;
}
export function assertManifestOrderingIgnored(manifest, context) {
    const asIs = checkDerivedWriteMonotonicity(manifest, context);
    const tampered = {
        ...manifest,
        facetSensitivityOrdering: {
            profile: "um:profile:domain:ATTACKER-CONTROLLED",
            labels: ["restricted", "sensitive", "internal", "public"],
            order: [["restricted", "public"]],
        },
    };
    const withTamper = checkDerivedWriteMonotonicity(tampered, context);
    return {
        ignored: asIs.decision === withTamper.decision && asIs.code === withTamper.code,
        asIs,
        withTamper,
    };
}
export function checkWriteAuthorization(value, context = {}) {
    if (envelopeErrorsV04(value).length > 0) {
        return reject("Q5_STRUCTURAL", "structural validation failed: bad v0.4 envelope");
    }
    const manifest = value;
    const write = context.write || {};
    const { targetFacetId, writeScope, purpose } = write;
    const now = isIsoDateTime(context.now) ? context.now : new Date().toISOString();
    const consents = Array.isArray(manifest.consents) ? manifest.consents : [];
    const governing = consents.filter((c) => c && c.facetRef === targetFacetId);
    if (governing.length === 0) {
        return reject("Q5_CONSENT_MISSING", `no governing write-consent for target facet ${targetFacetId}; write MUST fail closed (consent-missing)`, { targetFacetId });
    }
    let lastDenial = "consent-denied";
    for (const c of governing) {
        const evalResult = evaluateConsentEntry(c, { now, intendedScope: [writeScope] });
        if (evalResult.status !== CONSENT_STATUS_GRANTED) {
            lastDenial = `consent-denied: ${evalResult.status} (${evalResult.reason})`;
            continue;
        }
        if (purpose !== undefined && c.purpose !== purpose) {
            lastDenial = "consent-denied: purpose mismatch";
            continue;
        }
        return accept("Q5_WRITTEN", `write authorized by consent ${c["@id"]}`, {
            targetFacetId,
            consentRef: c["@id"],
            receiptStatus: "written",
        });
    }
    return reject("Q5_CONSENT_DENIED", lastDenial, { targetFacetId, writeScope });
}
export function evaluateWriteAuthorizationReceipt(manifest, writes = [], context = {}) {
    const receipt = createReceipt({ manifestId: manifest?.["@id"] });
    const performed = [];
    const denied = [];
    for (const w of writes) {
        const d = checkWriteAuthorization(manifest, { write: w, now: context.now });
        if (d.decision === "accept") {
            receipt.facetStatuses.push({ facetId: w.targetFacetId, status: "written", consentRef: d.detail.consentRef });
            performed.push(w.targetFacetId);
        }
        else {
            const status = d.code === "Q5_CONSENT_MISSING" ? "consent-missing" : "consent-denied";
            receipt.facetStatuses.push({ facetId: w.targetFacetId, status, reason: d.reason });
            receipt.warnings.push({ code: `um:reason:consent:${status}`, message: d.reason });
            denied.push(w.targetFacetId);
        }
    }
    finalizeReceipt(receipt, { now: context.now, omitProcessedAt: true });
    return { receipt, performed, denied };
}
export function checkUnlockWindow(value, context = {}) {
    if (envelopeErrorsV04(value).length > 0) {
        return reject("Q7_STRUCTURAL", "structural validation failed: bad v0.4 envelope");
    }
    const manifest = value;
    const consents = Array.isArray(manifest.consents) ? manifest.consents : [];
    const consent = consents.find((c) => c && c["@id"] === context.consentId);
    if (!consent) {
        return reject("Q7_CONSENT_NOT_FOUND", `unlock-window consent ${context.consentId} not found`, { consentId: context.consentId });
    }
    const scope = Array.isArray(consent.scope) ? consent.scope : [];
    if (!scope.includes("unlock.window")) {
        return reject("Q7_NOT_UNLOCK_WINDOW", `consent ${context.consentId} does not carry the unlock.window scope`);
    }
    if (consent.participants !== undefined || consent.exchangeId !== undefined) {
        return reject("Q7_IS_BILATERAL_SESSION", "an unlock window MUST NOT be a um:BilateralSession (no participants, no exchangeId)");
    }
    const enumerated = consent.unlockWindowFacets;
    if (!Array.isArray(enumerated) || enumerated.length === 0) {
        return reject("Q7_UNBOUNDED_SET", "an unlock window MUST explicitly enumerate a bounded, non-empty facet set (unlockWindowFacets)");
    }
    if (!enumerated.every((f) => isNonEmptyString(f))) {
        return reject("Q7_BAD_FACET_REF", "unlockWindowFacets entries must be non-empty facet @id strings");
    }
    const enumeratedSet = new Set(enumerated);
    if (!isNonEmptyString(context.presentationNonce)) {
        return reject("Q7_NO_ANTIREPLAY_BINDING", "an unlock window MUST bind to a fresh presentationProof / nonce; static bytes cannot re-open a window");
    }
    const nowMs = isIsoDateTime(context.now) ? Date.parse(context.now) : Date.now();
    if (isIsoDateTime(consent.withdrawnAt) && Date.parse(consent.withdrawnAt) <= nowMs) {
        return reject("Q7_WINDOW_WITHDRAWN", "unlock-window consent has been withdrawn");
    }
    if (isIsoDateTime(consent.expiresAt) && Date.parse(consent.expiresAt) < nowMs) {
        return reject("Q7_WINDOW_EXPIRED", "unlock window has expired; re-attestation required (window re-sealed)");
    }
    for (const reqId of context.requestedFacetIds ?? []) {
        if (!enumeratedSet.has(reqId)) {
            return reject("Q7_FACET_OUTSIDE_SET", `requested facet ${reqId} is outside the unlock window's enumerated set`, { facetId: reqId, enumerated: [...enumeratedSet] });
        }
    }
    return accept("Q7_WINDOW_OK", `unlock window opens a bounded enumerated set of ${enumeratedSet.size} facets`, { enumeratedCount: enumeratedSet.size });
}
export function openUnlockWindow(manifest, chain, context = {}) {
    const decision = checkUnlockWindow(manifest, context);
    if (decision.decision !== "accept") {
        return { session: null, event: null, decision };
    }
    const consents = Array.isArray(manifest.consents) ? manifest.consents : [];
    const consent = consents.find((c) => c["@id"] === context.consentId);
    const subject = isNonEmptyString(manifest.subject) ? manifest.subject : "(unknown-subject)";
    const event = appendChainEvent(chain, {
        eventClass: "session-unlocked",
        subject,
        reason: "bounded-private-data-window-opened",
    });
    const session = {
        consentId: context.consentId,
        subject,
        facetSet: [...(consent.unlockWindowFacets || [])],
        opensAt: isIsoDateTime(context.now) ? context.now : new Date().toISOString(),
        expiresAt: consent.expiresAt,
        open: true,
        presentationNonce: context.presentationNonce,
    };
    return { session, event, decision };
}
export function refreshUnlockWindow(session, now) {
    if (!session || !session.open)
        return session;
    const nowMs = isIsoDateTime(now) ? Date.parse(now) : Date.now();
    if (isIsoDateTime(session.expiresAt) && Date.parse(session.expiresAt) < nowMs) {
        session.open = false;
        session.resealed = true;
        session.resealedAt = new Date(nowMs).toISOString();
    }
    return session;
}
export const RECOGNIZED_KEY_LIFECYCLE_EVENTS = Object.freeze(["facet-key-rotated", "facet-key-shredded"]);
export const RECOGNIZED_KEY_LIFECYCLE_REASONS = Object.freeze(["um:reason:crypto:key-rotated", "um:reason:crypto:key-shredded"]);
const MAX_EVENTS = 1000;
function looksLikeKeyMaterial(s) {
    if (typeof s !== "string")
        return false;
    if (s.includes("-----BEGIN"))
        return true;
    const t = s.trim();
    if (t.startsWith("{") && /"(kty|crv|[dxy]|k)"\s*:/.test(t))
        return true;
    return false;
}
export function checkKeyLifecycleAudit(value, context = {}) {
    const requireReason = context.requireReasonCode ?? true;
    if (envelopeErrorsV04(value).length > 0) {
        return reject("Q6_STRUCTURAL", "structural validation failed: bad v0.4 envelope");
    }
    const events = value.events;
    if (events === undefined)
        return accept("Q6_NO_EVENTS", "no embedded events; nothing to review");
    if (!Array.isArray(events))
        return reject("Q6_EVENTS_NOT_ARRAY", "receipt events must be an array");
    if (events.length > MAX_EVENTS) {
        return reject("Q6_EVENTS_OVERFLOW", `receipt events exceed §6.3 resource limit of ${MAX_EVENTS}`, { count: events.length });
    }
    let keyLifecycleCount = 0;
    for (const ev of events) {
        if (!ev || typeof ev !== "object")
            return reject("Q6_EVENT_NOT_OBJECT", "event entries must be objects");
        const type = ev.eventType;
        if (!isNonEmptyString(type) || !RECOGNIZED_KEY_LIFECYCLE_EVENTS.includes(type))
            continue;
        keyLifecycleCount += 1;
        if (!isNonEmptyString(ev.facetKeyRef)) {
            return reject("Q6_MISSING_FACETKEYREF", `${type} event requires a non-empty facetKeyRef`, { eventType: type });
        }
        if (looksLikeKeyMaterial(ev.facetKeyRef)) {
            return reject("Q6_FACETKEYREF_IS_KEY_MATERIAL", `${type} event facetKeyRef must be an identifier, not key material`, { eventType: type });
        }
        if (requireReason && !RECOGNIZED_KEY_LIFECYCLE_REASONS.includes(ev.reason)) {
            return reject("Q6_BAD_REASON", `${type} event requires a recognized um:reason:crypto:* reason code`, { eventType: type, reason: ev.reason });
        }
    }
    return accept("Q6_AUDIT_OK", `key-lifecycle review events well-formed (${keyLifecycleCount} key-lifecycle events)`, { keyLifecycleCount });
}
export function emitKeyLifecycleEvents(chain, { subject, rotatedKeyRef, shreddedKeyRef, rotateReason, shredReason } = {}) {
    if (!isNonEmptyString(subject))
        throw new Error("emitKeyLifecycleEvents: subject required");
    if (looksLikeKeyMaterial(rotatedKeyRef) || looksLikeKeyMaterial(shreddedKeyRef)) {
        throw new Error("emitKeyLifecycleEvents: facetKeyRef must be an identifier, never key material (fail closed)");
    }
    const rotated = appendChainEvent(chain, {
        eventClass: "facet-key-rotated",
        subject,
        facetKeyRef: rotatedKeyRef,
        reason: isNonEmptyString(rotateReason) ? rotateReason : "scheduled-facet-key-rotation",
    });
    const shredded = appendChainEvent(chain, {
        eventClass: "facet-key-shredded",
        subject,
        facetKeyRef: shreddedKeyRef,
        reason: isNonEmptyString(shredReason) ? shredReason : "prior-facet-key-shredded",
    });
    return { rotated, shredded };
}
export function buildKeyLifecycleReceiptEvents({ rotatedKeyRef, shreddedKeyRef, rotatedAt, shreddedAt } = {}) {
    return [
        { eventType: "facet-key-rotated", at: rotatedAt || "2026-06-01T00:00:00.000Z", facetKeyRef: rotatedKeyRef, reason: "um:reason:crypto:key-rotated" },
        { eventType: "facet-key-shredded", at: shreddedAt || "2026-06-01T00:01:00.000Z", facetKeyRef: shreddedKeyRef, reason: "um:reason:crypto:key-shredded" },
    ];
}
export function buildRenewalPathTrace() {
    const traces = buildFactoryFloorTraces();
    const rows = traces["renewal-revocation-session-unlock"];
    const keyLifecycleRows = rows.filter((r) => PREVIEW_KEY_LIFECYCLE_EVENTS.includes(r.eventClass));
    const seqMonotonic = rows.every((r, i) => r.seq === i + 1);
    const facetKeyRefOnly = keyLifecycleRows.every((r) => isNonEmptyString(r.facetKeyRef) && !looksLikeKeyMaterial(r.facetKeyRef));
    const noForbidden = rows.every((r) => !Object.keys(r).some((k) => CHAIN_FORBIDDEN_PAYLOADS.includes(k)));
    const hasRotateThenShred = keyLifecycleRows.length === 2 &&
        keyLifecycleRows[0].eventClass === "facet-key-rotated" &&
        keyLifecycleRows[1].eventClass === "facet-key-shredded";
    return {
        rows,
        keyLifecycleRows,
        checks: { seqMonotonic, facetKeyRefOnly, noForbidden, hasRotateThenShred },
    };
}
export async function structuralVerdictWo140(manifest) {
    const reasons = [];
    reasons.push(...envelopeErrorsV04(manifest));
    const t = manifest && manifest["@type"];
    const looksIsolated = Array.isArray(manifest?.facets) && manifest.facets.some((f) => f && f.encryptionProfile === "jwe-inline-v1");
    if (reasons.length === 0 && looksIsolated) {
        const sealed = validateSealedFacetsStructural(manifest);
        reasons.push(...sealed.errors);
    }
    let sig = null;
    if (reasons.length === 0) {
        sig = await verifyManifestProfileA(manifest);
        if (!sig.ok)
            reasons.push(`signature verification failed: ${sig.reason}`);
    }
    return {
        result: reasons.length === 0 ? "accept" : "reject",
        reasons,
        receiptType: Array.isArray(t) && t.includes("um:Receipt") ? "um:Receipt" : "um:Manifest",
        signature: sig ? sig.reason : "not-evaluated",
    };
}
export const feature_FIXTURE_FILENAMES = Object.freeze([
    "valid/manifest-with-isolated-facets.jsonld",
    "valid/profile-facet-sensitivity-ordering.jsonld",
    "valid/consent-with-write-scope.jsonld",
    "valid/receipt-facet-key-shredded.jsonld",
    "valid/consent-unlock-window.jsonld",
]);
export async function featureFixtureHandler(fixtureJson) {
    const verdict = await structuralVerdictWo140(fixtureJson);
    const out = { result: verdict.result, reasons: verdict.reasons };
    if (verdict.receiptType === "um:Receipt" && Array.isArray(fixtureJson.events)) {
        out.behavioral = checkKeyLifecycleAudit(fixtureJson, {});
    }
    return out;
}
const DEMO_FACET_GOV_ID = "urn:um:facet:government-id-v04";
const DEMO_FACET_MEMORY = "urn:um:facet:agent-memory-v04";
export function buildPrivateDataPanel({ now = "2026-06-01T00:02:00.000Z" } = {}) {
    const demoManifest = {
        "@context": V04_CONTEXT,
        "@id": "urn:uuid:demo-private-data-panel",
        "@type": "um:Manifest",
        manifestVersion: "0.4",
        subject: "did:example:alice-v04",
        issuedAt: "2026-06-01T00:00:00.000Z",
        expiresAt: "2030-06-01T00:00:00.000Z",
        facets: [
            { "@id": DEMO_FACET_MEMORY, "@type": "um:Facet", name: "agentMemory" },
            { "@id": DEMO_FACET_GOV_ID, "@type": "um:Facet", name: "governmentId" },
        ],
        consents: [
            { "@id": "urn:um:consent:mem-write", "@type": "um:Consent", facetRef: DEMO_FACET_MEMORY, scope: ["read", "write.update"], purpose: "Persist assistant-derived memory for the holder", grantedAt: "2026-06-01T00:00:00.000Z", expiresAt: "2030-06-01T00:00:00.000Z" },
            { "@id": "urn:um:consent:govid-unlock", "@type": "um:Consent", facetRef: DEMO_FACET_GOV_ID, scope: ["read", "unlock.window"], purpose: "Open an enumerated facet set for an authenticated session", grantedAt: "2026-06-01T00:00:00.000Z", expiresAt: "2026-06-01T00:05:00.000Z", unlockWindowFacets: [DEMO_FACET_GOV_ID] },
        ],
    };
    const deniedWrite = checkWriteAuthorization(demoManifest, {
        write: { targetFacetId: DEMO_FACET_GOV_ID, writeScope: "write.update", purpose: "tamper" },
        now,
    });
    const grantedWrite = checkWriteAuthorization(demoManifest, {
        write: { targetFacetId: DEMO_FACET_MEMORY, writeScope: "write.update", purpose: "Persist assistant-derived memory for the holder" },
        now,
    });
    const chain = createReceiptChain({ subject: demoManifest.subject });
    const opened = openUnlockWindow(demoManifest, chain, {
        consentId: "urn:um:consent:govid-unlock",
        presentationNonce: "nonce-demo-fresh-01",
        requestedFacetIds: [DEMO_FACET_GOV_ID],
        now,
    });
    const expiredCheck = checkUnlockWindow(demoManifest, {
        consentId: "urn:um:consent:govid-unlock",
        presentationNonce: "nonce-demo-fresh-02",
        now: "2026-06-01T00:06:00.000Z",
    });
    const keyEvents = emitKeyLifecycleEvents(chain, {
        subject: demoManifest.subject,
        rotatedKeyRef: "urn:um:facet-key:demo:government-id#rot-1",
        shreddedKeyRef: "urn:um:facet-key:demo:government-id#rot-0",
    });
    sealReceiptChain(chain);
    return {
        label: "private data",
        rows: [
            { kind: "write-denied", facet: DEMO_FACET_GOV_ID, decision: deniedWrite.decision, code: deniedWrite.code, note: deniedWrite.reason },
            { kind: "write-granted", facet: DEMO_FACET_MEMORY, decision: grantedWrite.decision, code: grantedWrite.code, status: "written (PREVIEW)" },
            { kind: "unlock-open", facet: DEMO_FACET_GOV_ID, decision: opened.decision.decision, code: opened.decision.code, window: opened.session ? `${opened.session.opensAt} → ${opened.session.expiresAt}` : null },
            { kind: "unlock-expired", facet: DEMO_FACET_GOV_ID, decision: expiredCheck.decision, code: expiredCheck.code, note: "window re-sealed after expiry" },
            { kind: "key-rotated", facetKeyRef: keyEvents.rotated.facetKeyRef, seq: keyEvents.rotated.seq },
            { kind: "key-shredded", facetKeyRef: keyEvents.shredded.facetKeyRef, seq: keyEvents.shredded.seq },
        ],
        chainRows: chainTraceRows(chain),
        preview: "All rows are Grade-1 PREVIEW; write/unlock enforcement is real & fail-closed, key-lifecycle events are assertions (not erasure validation).",
    };
}
export function registerWo140(registry) {
    if (!registry || typeof registry.register !== "function")
        return;
    for (const filename of feature_FIXTURE_FILENAMES) {
        registry.register(filename, (fixtureJson) => featureFixtureHandler(fixtureJson));
    }
}
