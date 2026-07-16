import { createReceipt, mergeFragment, finalizeReceipt, receiptPanelRecord, LIVENESS_FRESHNESS_CLASSES, } from "./receipt-hub.mjs";
import { verifyManifestProfileA, attachSignatureProfileA } from "../signing/um-signature-profile-a.mjs";
import { generateKeyPair, signBytes, verifyBytes } from "../signing/ed25519.mjs";
import { utf8Encode, bytesToBase64Url } from "../signing/codecs.mjs";
export { LIVENESS_FRESHNESS_CLASSES };
export const REQUIRED_LIVENESS_FRESHNESS = Object.freeze(["live", "recent", "stale"]);
export const LIVENESS_FRESHNESS_RANK = Object.freeze({ live: 3, recent: 2, stale: 1, unknown: 0 });
export const ASSURANCE_CLASSES = Object.freeze(["software", "hardware-uv", "hardware-bound"]);
export const ASSURANCE_CLASS_RANK = Object.freeze({ software: 0, "hardware-uv": 1, "hardware-bound": 2 });
export const LIVE_WINDOW_MS = 60_000;
export const RECENT_WINDOW_MS = 4 * 3600_000;
export const DEMO_LIVENESS_PROOF_TYPE = "demo-ed25519";
export const DEMO_ATTESTER_LABEL = "demo attester — proves attestation handling, not human presence";
export const feature_CONFORMANCE = Object.freeze({
    wo: "runtime",
    standard: "Universal Manifest v0.4 EXT-T1 T1.3 (liveness attestation) + T1.3.1/T1.3.3 per-facet floors (PREVIEW)",
    fixtures_owned: 12,
    freshness_classification_real: true,
    stale_replay_fail_closed_real: true,
    structural_shape_validation_real: true,
    demo_attester_crypto_real: true,
    liveness_floor_enforcement: "PREVIEW",
    assurance_floor_enforcement: "PREVIEW",
    webauthn_uv_proof_validation: false,
    hardware_provenance_verification: false,
    biometric_or_human_presence_claimed: false,
    fail_closed_unenforced_baseline: true,
    full_six_stage_evaluator: false,
    um_conformance_flag_flipped: false,
    scoped_claim: "runtime implements REAL liveness freshness classification (reference-parity, fail-closed on " +
        "expired/unparseable validity), REAL structural validation for livenessAttestation/" +
        "requiredLiveness/requiredAssuranceClass, and PREVIEW fail-closed enforcement of both per-facet " +
        "floors: unmet/unknown floors withhold the facet (assuranceInsufficient) and are never downgraded. " +
        "The only cryptographically validated attestation is the LABELED demo attester (Ed25519 over " +
        "subject||attestedAt); webauthn-uv and every other proofType never satisfy a floor here. No " +
        "biometric capture and no human presence is claimed or implied.",
});
function isNonEmptyString(v) {
    return typeof v === "string" && v.length > 0;
}
function isIsoDateTime(v) {
    return typeof v === "string" && Number.isFinite(Date.parse(v));
}
function isPlainObject(v) {
    return v !== null && typeof v === "object" && !Array.isArray(v);
}
export function isAssuranceClass(v) {
    return ASSURANCE_CLASSES.includes(v);
}
export function validateLivenessAttestationShape(att) {
    const errors = [];
    if (!isPlainObject(att))
        return { valid: false, errors: ["livenessAttestation must be an object"] };
    if (!isNonEmptyString(att.proofType))
        errors.push("livenessAttestation.proofType is required");
    if (!isIsoDateTime(att.attestedAt))
        errors.push("livenessAttestation.attestedAt must be an ISO 8601 date-time");
    if (att.validUntil === undefined)
        errors.push("livenessAttestation.validUntil is required");
    else if (!isIsoDateTime(att.validUntil))
        errors.push("livenessAttestation.validUntil must be an ISO 8601 date-time");
    if (!isNonEmptyString(att.proofValue))
        errors.push("livenessAttestation.proofValue is required");
    if (att.method !== undefined && typeof att.method !== "string")
        errors.push("livenessAttestation.method must be a string");
    if (att.userVerified !== undefined && typeof att.userVerified !== "boolean") {
        errors.push("livenessAttestation.userVerified must be a boolean");
    }
    if (att.attester !== undefined && typeof att.attester !== "string")
        errors.push("livenessAttestation.attester must be a string");
    return { valid: errors.length === 0, errors };
}
export function validateRequiredLivenessShape(rl) {
    if (!isPlainObject(rl))
        return { valid: false, errors: ["requiredLiveness must be an object"] };
    const errors = [];
    if (!REQUIRED_LIVENESS_FRESHNESS.includes(rl.minFreshness)) {
        errors.push("requiredLiveness.minFreshness must be one of live|recent|stale");
    }
    if (rl.userVerified !== undefined && typeof rl.userVerified !== "boolean") {
        errors.push("requiredLiveness.userVerified must be a boolean");
    }
    for (const key of Object.keys(rl)) {
        if (key !== "minFreshness" && key !== "userVerified") {
            errors.push(`requiredLiveness is a closed compound (additionalProperties: false) — unexpected member "${key}"`);
        }
    }
    return { valid: errors.length === 0, errors };
}
export function validateRequiredAssuranceClassShape(v) {
    if (!isAssuranceClass(v)) {
        return { valid: false, errors: ["requiredAssuranceClass must be one of software|hardware-uv|hardware-bound"] };
    }
    return { valid: true, errors: [] };
}
export function validateWo135Structural(manifest) {
    const errors = [];
    if (!isPlainObject(manifest))
        return { valid: false, errors: ["manifest must be an object"] };
    if (manifest.livenessAttestation !== undefined) {
        errors.push(...validateLivenessAttestationShape(manifest.livenessAttestation).errors);
    }
    const facets = Array.isArray(manifest.facets) ? manifest.facets : [];
    facets.forEach((facet, i) => {
        if (!isPlainObject(facet))
            return;
        const at = isNonEmptyString(facet["@id"]) ? facet["@id"] : `facets[${i}]`;
        if (facet.requiredLiveness !== undefined) {
            errors.push(...validateRequiredLivenessShape(facet.requiredLiveness).errors.map((e) => `${at}: ${e}`));
        }
        if (facet.requiredAssuranceClass !== undefined) {
            errors.push(...validateRequiredAssuranceClassShape(facet.requiredAssuranceClass).errors.map((e) => `${at}: ${e}`));
        }
    });
    return { valid: errors.length === 0, errors };
}
function envelopeErrors(manifest) {
    const errors = [];
    if (!isPlainObject(manifest))
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
    if (isIsoDateTime(manifest.issuedAt) && isIsoDateTime(manifest.expiresAt) && Date.parse(manifest.issuedAt) > Date.parse(manifest.expiresAt)) {
        errors.push("issuedAt must be <= expiresAt");
    }
    return errors;
}
export async function structuralVerdictWo135(manifest) {
    const reasons = [];
    reasons.push(...envelopeErrors(manifest));
    if (reasons.length === 0)
        reasons.push(...validateWo135Structural(manifest).errors);
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
export function classifyLivenessFreshness(attestation, now = new Date()) {
    if (!isPlainObject(attestation))
        return "unknown";
    if (typeof attestation.attestedAt !== "string")
        return "unknown";
    const attestedMs = Date.parse(attestation.attestedAt);
    if (!Number.isFinite(attestedMs))
        return "unknown";
    const nowMs = now instanceof Date ? now.getTime() : typeof now === "number" ? now : Date.parse(now);
    if (!Number.isFinite(nowMs))
        return "unknown";
    if (attestation.validUntil !== undefined) {
        const validUntilMs = Date.parse(attestation.validUntil);
        if (!Number.isFinite(validUntilMs) || nowMs > validUntilMs)
            return "unknown";
    }
    const age = nowMs - attestedMs;
    if (age <= LIVE_WINDOW_MS)
        return "live";
    if (age <= RECENT_WINDOW_MS)
        return "recent";
    return "stale";
}
export function livenessStatusEcho(manifest, now) {
    const att = isPlainObject(manifest) ? manifest.livenessAttestation : undefined;
    if (att === undefined)
        return undefined;
    const echo = { freshnessClass: classifyLivenessFreshness(att, now) };
    if (isPlainObject(att)) {
        if (att.method !== undefined)
            echo.method = att.method;
        if (att.userVerified !== undefined)
            echo.userVerified = att.userVerified;
    }
    return echo;
}
export async function issueDemoLivenessAttestation({ subject, attestedAt, validUntil, userVerified, attesterPrivateKey, attester, } = {}) {
    if (!isNonEmptyString(subject))
        throw new Error("issueDemoLivenessAttestation: subject required");
    if (!isIsoDateTime(attestedAt))
        throw new Error("issueDemoLivenessAttestation: attestedAt must be ISO 8601");
    if (!isIsoDateTime(validUntil))
        throw new Error("issueDemoLivenessAttestation: validUntil must be ISO 8601");
    const proofValue = bytesToBase64Url(await signBytes(utf8Encode(subject + attestedAt), attesterPrivateKey));
    const attestation = {
        proofType: DEMO_LIVENESS_PROOF_TYPE,
        attestedAt,
        validUntil,
        proofValue,
        method: "demo-attester",
        demoLabel: DEMO_ATTESTER_LABEL,
    };
    if (typeof userVerified === "boolean")
        attestation.userVerified = userVerified;
    if (isNonEmptyString(attester))
        attestation.attester = attester;
    return attestation;
}
export async function verifyDemoLivenessAttestation(subject, attestation, attesterPublicKey) {
    try {
        if (!isPlainObject(attestation) || attestation.proofType !== DEMO_LIVENESS_PROOF_TYPE)
            return false;
        if (!isNonEmptyString(subject) || !isNonEmptyString(attestation.attestedAt))
            return false;
        if (!isNonEmptyString(attestation.proofValue))
            return false;
        return await verifyBytes(utf8Encode(subject + attestation.attestedAt), attestation.proofValue, attesterPublicKey);
    }
    catch {
        return false;
    }
}
export async function attestationValidatedForFloors(manifest, context = {}) {
    const att = isPlainObject(manifest) ? manifest.livenessAttestation : undefined;
    if (att === undefined)
        return { validated: false, how: "no livenessAttestation present" };
    const shape = validateLivenessAttestationShape(att);
    if (!shape.valid)
        return { validated: false, how: `shape invalid: ${shape.errors[0]}` };
    if (att.proofType === DEMO_LIVENESS_PROOF_TYPE) {
        if (context.demoAttesterPublicKey === undefined) {
            return { validated: false, how: "demo-ed25519 attestation but no demoAttesterPublicKey in context (fail closed)" };
        }
        const ok = await verifyDemoLivenessAttestation(manifest.subject, att, context.demoAttesterPublicKey);
        return ok
            ? { validated: true, how: `REAL Ed25519 verify over UTF-8(subject||attestedAt) — ${DEMO_ATTESTER_LABEL}` }
            : { validated: false, how: "demo-ed25519 proofValue FAILED Ed25519 verification (fail closed)" };
    }
    return {
        validated: false,
        how: `proofType "${att.proofType}" mechanics not implemented by this module — never satisfies a floor (fail closed, T1.3.1)`,
    };
}
export function livenessFloorMet(requiredLiveness, { floorClass = "unknown", attestationUserVerified } = {}) {
    const shape = validateRequiredLivenessShape(requiredLiveness);
    if (!shape.valid)
        return { met: false, reason: `floor shape invalid (fail closed): ${shape.errors[0]}` };
    const have = LIVENESS_FRESHNESS_RANK[floorClass] ?? 0;
    const need = LIVENESS_FRESHNESS_RANK[requiredLiveness.minFreshness];
    if (have < need) {
        return {
            met: false,
            reason: `freshness "${floorClass}" is below the requiredLiveness floor "${requiredLiveness.minFreshness}" (order live > recent > stale > unknown)`,
        };
    }
    if (requiredLiveness.userVerified === true && attestationUserVerified !== true) {
        return {
            met: false,
            reason: "floor requires userVerified: true but the attestation's userVerified is not true (absent ≡ false, fail closed)",
        };
    }
    return { met: true, reason: `validated attestation satisfies minFreshness "${requiredLiveness.minFreshness}"${requiredLiveness.userVerified === true ? " + userVerified" : ""}` };
}
export function assuranceFloorMet(requiredAssuranceClass, presentedAssuranceClass) {
    const requiredClass = isAssuranceClass(requiredAssuranceClass) ? requiredAssuranceClass : "software";
    const assertedClass = isAssuranceClass(presentedAssuranceClass) ? presentedAssuranceClass : "software";
    const met = ASSURANCE_CLASS_RANK[assertedClass] >= ASSURANCE_CLASS_RANK[requiredClass];
    return {
        met,
        assertedClass,
        requiredClass,
        reason: met
            ? `presented assurance ${assertedClass} meets requiredAssuranceClass ${requiredClass}`
            : `presented assurance ${assertedClass} is below requiredAssuranceClass ${requiredClass}`,
    };
}
function consentGatePasses(manifest, facet, nowMs, context) {
    const consents = Array.isArray(manifest.consents) ? manifest.consents : [];
    const matching = consents.filter((c) => isPlainObject(c) && c.facetRef === facet["@id"]);
    if (matching.length === 0)
        return false;
    for (const consent of matching) {
        if (consent.withdrawnAt)
            return false;
        if (!isIsoDateTime(consent.expiresAt) || Date.parse(consent.expiresAt) < nowMs)
            return false;
        if (isIsoDateTime(consent.grantedAt) && Date.parse(consent.grantedAt) > nowMs)
            return false;
        if (Array.isArray(consent.conditions) && consent.conditions.length > 0)
            return false;
        if (Array.isArray(context.intendedScope) && context.intendedScope.length > 0) {
            const scope = Array.isArray(consent.scope) ? consent.scope : [];
            if (!context.intendedScope.every((op) => scope.includes(op)))
                return false;
        }
        if (isNonEmptyString(context.intendedPurpose) && consent.purpose !== context.intendedPurpose)
            return false;
    }
    return true;
}
export async function evaluateFacetFloors(manifest, context = {}) {
    const nowMs = isIsoDateTime(context.now) ? Date.parse(context.now) : Date.now();
    const enforce = context.enforceFloors !== false;
    const presented = isAssuranceClass(context.presentedAssuranceClass) ? context.presentedAssuranceClass : "software";
    const echo = livenessStatusEcho(manifest, nowMs);
    const validation = await attestationValidatedForFloors(manifest, context);
    const floorClass = validation.validated ? echo?.freshnessClass ?? "unknown" : "unknown";
    const attesterUv = isPlainObject(manifest?.livenessAttestation) ? manifest.livenessAttestation.userVerified : undefined;
    const fragment = { engine: "runtime-liveness-assurance", facetStatuses: [], warnings: [] };
    if (echo !== undefined)
        fragment.livenessStatus = echo;
    const floorChecks = [];
    const passThroughFacetIds = [];
    const deferred = [];
    const floorViolations = [];
    const facets = Array.isArray(manifest?.facets) ? manifest.facets : [];
    const decryptable = new Set(context.decryptableFacetIds ?? []);
    for (const facet of facets) {
        if (!isPlainObject(facet))
            continue;
        const hasLivenessFloor = facet.requiredLiveness !== undefined;
        const hasAssuranceFloor = facet.requiredAssuranceClass !== undefined;
        if (!hasLivenessFloor && !hasAssuranceFloor)
            continue;
        const facetId = facet["@id"];
        if (facet.encryptionProfile === "jwe-inline-v1" && !decryptable.has(facetId)) {
            deferred.push({ facetId, gate: "sealed-entry (runtime records opaque)" });
            continue;
        }
        if (!consentGatePasses(manifest, facet, nowMs, context)) {
            deferred.push({ facetId, gate: "consent (runtime records consent-missing/denied)" });
            continue;
        }
        const assurance = hasAssuranceFloor
            ? assuranceFloorMet(facet.requiredAssuranceClass, presented)
            : { met: true, assertedClass: presented, requiredClass: "software", reason: "no assurance floor (defaults to software — never raises the bar)" };
        const liveness = hasLivenessFloor
            ? livenessFloorMet(facet.requiredLiveness, { floorClass, attestationUserVerified: attesterUv })
            : { met: true, reason: "no liveness floor" };
        const check = {
            facetId,
            name: facet.name,
            requiredAssuranceClass: hasAssuranceFloor ? facet.requiredAssuranceClass : undefined,
            requiredLiveness: hasLivenessFloor ? facet.requiredLiveness : undefined,
            presentedAssuranceClass: presented,
            floorFreshnessClass: floorClass,
            attestationValidated: validation.validated,
            attestationValidationHow: validation.how,
            assuranceFloorMet: assurance.met,
            livenessFloorMet: liveness.met,
            enforced: enforce,
            preview: "EXT-T1 T1.3.1/T1.3.3 PREVIEW",
        };
        floorChecks.push(check);
        if (!enforce) {
            const entry = {
                facetId,
                ...(isNonEmptyString(facet.name) ? { name: facet.name } : {}),
                status: "assuranceInsufficient",
                reason: "floor enforcement not active — floor-bearing facet withheld, never processed (fail-closed baseline, CONFORMANCE §2.13/§2.14)",
            };
            if (hasAssuranceFloor)
                entry.assuranceStatus = { assertedClass: presented, met: false };
            fragment.facetStatuses.push(entry);
            floorViolations.push({ facetId, floor: "unenforced-baseline", reason: entry.reason });
            continue;
        }
        if (!assurance.met) {
            fragment.facetStatuses.push({
                facetId,
                ...(isNonEmptyString(facet.name) ? { name: facet.name } : {}),
                status: "assuranceInsufficient",
                reason: `${assurance.reason} — facet withheld, never downgraded (EXT-T1 T1.3.3 PREVIEW)`,
                assuranceStatus: { assertedClass: assurance.assertedClass, met: false },
            });
            floorViolations.push({ facetId, floor: "requiredAssuranceClass", reason: assurance.reason });
            continue;
        }
        if (!liveness.met) {
            fragment.facetStatuses.push({
                facetId,
                ...(isNonEmptyString(facet.name) ? { name: facet.name } : {}),
                status: "assuranceInsufficient",
                reason: `requiredLiveness floor unmet: ${liveness.reason} — facet withheld (EXT-T1 T1.3.1 PREVIEW, fail closed)`,
            });
            floorViolations.push({ facetId, floor: "requiredLiveness", reason: liveness.reason });
            continue;
        }
        passThroughFacetIds.push(facetId);
    }
    if (floorViolations.length > 0)
        fragment.floorViolations = floorViolations;
    return { fragment, floorChecks, passThroughFacetIds, deferred };
}
export async function buildWo135Fragment(manifest, context = {}) {
    return (await evaluateFacetFloors(manifest, context)).fragment;
}
export async function evaluateWo135(manifest, context = {}) {
    const nowMs = isIsoDateTime(context.now) ? Date.parse(context.now) : Date.now();
    const manifestId = isPlainObject(manifest) && isNonEmptyString(manifest["@id"]) ? manifest["@id"] : "(unknown)";
    const receipt = createReceipt({ manifestId, evaluatorId: context.evaluatorId });
    let hardReject = false;
    const envErrors = envelopeErrors(manifest);
    const shapeErrors = envErrors.length === 0 ? validateWo135Structural(manifest).errors : [];
    if (envErrors.length > 0 || shapeErrors.length > 0) {
        mergeFragment(receipt, {
            engine: "runtime-liveness-assurance",
            outcome: "rejected",
            warnings: [{ code: "um:reason:structure:malformed", message: `Verify stage: ${[...envErrors, ...shapeErrors].join("; ")}` }],
        });
        hardReject = true;
    }
    if (!hardReject) {
        const sigReport = await verifyManifestProfileA(manifest);
        if (!sigReport.ok) {
            const unsupported = sigReport.reason === "unsupported-profile";
            mergeFragment(receipt, {
                engine: "runtime-liveness-assurance",
                outcome: "rejected",
                signatureCheck: unsupported ? "unsupported-profile" : sigReport.reason === "missing-signature" ? "missing" : "invalid",
                warnings: [
                    {
                        code: unsupported ? "um:reason:crypto:unsupported-profile" : "um:reason:crypto:signature-invalid",
                        message: `Verify stage: ${sigReport.reason}`,
                    },
                ],
            });
            hardReject = true;
        }
        else {
            mergeFragment(receipt, { engine: "runtime-liveness-assurance", signatureCheck: "valid" });
        }
    }
    if (!hardReject) {
        const SKEW_MS = 60_000;
        if (Date.parse(manifest.issuedAt) - nowMs > SKEW_MS) {
            mergeFragment(receipt, {
                engine: "runtime-liveness-assurance",
                outcome: "rejected",
                freshnessCheck: "stale",
                warnings: [{ code: "um:reason:freshness:stale", message: "Verify stage: issuedAt more than 60s in the future" }],
            });
            hardReject = true;
        }
        else if (nowMs > Date.parse(manifest.expiresAt)) {
            mergeFragment(receipt, {
                engine: "runtime-liveness-assurance",
                outcome: "rejected",
                freshnessCheck: "expired",
                warnings: [{ code: "um:reason:freshness:expired", message: "Verify stage: manifest expired" }],
            });
            hardReject = true;
        }
        else {
            mergeFragment(receipt, { engine: "runtime-liveness-assurance", freshnessCheck: "fresh" });
        }
    }
    let floors = { fragment: { engine: "runtime-liveness-assurance" }, floorChecks: [], passThroughFacetIds: [], deferred: [] };
    if (!hardReject) {
        floors = await evaluateFacetFloors(manifest, { ...context, now: new Date(nowMs).toISOString() });
        mergeFragment(receipt, floors.fragment);
        for (const facetId of floors.passThroughFacetIds) {
            const facet = (manifest.facets || []).find((f) => isPlainObject(f) && f["@id"] === facetId);
            mergeFragment(receipt, {
                engine: "runtime-liveness-assurance",
                facetStatuses: [{ facetId, ...(facet && isNonEmptyString(facet.name) ? { name: facet.name } : {}), status: "processed" }],
            });
        }
    }
    const finalized = finalizeReceipt(receipt, {
        rejected: hardReject,
        now: isIsoDateTime(context.now) ? context.now : undefined,
        omitProcessedAt: context.omitProcessedAt === true,
    });
    return {
        result: finalized.outcome === "rejected" ? "reject" : "accept",
        receipt: finalized,
        floorChecks: floors.floorChecks,
        deferred: floors.deferred,
    };
}
export const feature_DEMO_SCENARIO_LABEL = "fixture-derived: valid/manifest-locked-facet-below-floor.jsonld (locked-tier portable-unlock profile) — conformance-surface demo, NOT a page scene (runtime scenario)";
export async function demoLockedFacetScenario({ demoUnlock = false, now } = {}) {
    const subjectKeys = await generateKeyPair();
    const attesterKeys = await generateKeyPair();
    const nowIso = isIsoDateTime(now) ? now : new Date().toISOString();
    const nowMs = Date.parse(nowIso);
    const subject = "did:web:demo.local:user:runtime";
    const facetId = "urn:um:facet:runtime-locked-demo";
    const attestation = await issueDemoLivenessAttestation({
        subject,
        attestedAt: new Date(nowMs - 5_000).toISOString(),
        validUntil: new Date(nowMs + 3600_000).toISOString(),
        userVerified: true,
        attesterPrivateKey: attesterKeys.privateKey,
        attester: "did:web:demo.local:attester:runtime",
    });
    const draft = {
        "@context": "https://universalmanifest.net/ns/v0.4",
        "@id": `urn:uuid:${globalThis.crypto.randomUUID()}`,
        "@type": "um:Manifest",
        manifestVersion: "0.4",
        subject,
        issuedAt: nowIso,
        expiresAt: new Date(nowMs + 3600_000).toISOString(),
        livenessAttestation: attestation,
        facets: [
            {
                "@id": facetId,
                "@type": "um:Facet",
                name: "lockedDemoFacet",
                requiredLiveness: { minFreshness: "live", userVerified: true },
                requiredAssuranceClass: "hardware-bound",
            },
        ],
        consents: [
            {
                "@id": "urn:um:consent:runtime-unlock-window",
                "@type": "um:Consent",
                facetRef: facetId,
                scope: ["read", "unlock.window"],
                purpose: "runtime locked-facet conformance-surface demo (fixture-derived)",
                grantedAt: nowIso,
                expiresAt: new Date(nowMs + 300_000).toISOString(),
                unlockWindowFacets: [facetId],
            },
        ],
    };
    const manifest = await attachSignatureProfileA(draft, subjectKeys.seed);
    const locked = await evaluateWo135(manifest, {
        now: nowIso,
        presentedAssuranceClass: "software",
        demoAttesterPublicKey: attesterKeys.rawPublicKey,
        evaluatorId: "did:web:demo.local:world:runtime-demo",
    });
    const out = {
        label: feature_DEMO_SCENARIO_LABEL,
        manifest,
        lockedReceipt: locked.receipt,
        lockedPanelRow: receiptPanelRecord(locked.receipt, { label: "locked facet — below floor (withheld)" }),
        floorChecksLocked: locked.floorChecks,
        honesty: `manifest signature + demo attestation are REAL Ed25519; ${DEMO_ATTESTER_LABEL}; ` +
            'the presented assurance class is a SIMULATED unlock toggle (no hardware provenance verified — T1.3.2 not implemented); ' +
            "floors are EXT-T1 T1.3.1/T1.3.3 PREVIEW and fail closed",
    };
    if (demoUnlock) {
        const unlocked = await evaluateWo135(manifest, {
            now: nowIso,
            presentedAssuranceClass: "hardware-bound",
            demoAttesterPublicKey: attesterKeys.rawPublicKey,
            evaluatorId: "did:web:demo.local:world:runtime-demo",
        });
        out.unlockedReceipt = unlocked.receipt;
        out.unlockedPanelRow = receiptPanelRecord(unlocked.receipt, { label: "locked facet — demo unlock (simulated class toggle)" });
        out.floorChecksUnlocked = unlocked.floorChecks;
    }
    return out;
}
export const feature_FIXTURE_FILENAMES = Object.freeze([
    "valid/manifest-with-liveness-attestation.jsonld",
    "valid/liveness-attestation-past-valid-until.jsonld",
    "invalid/liveness-missing-valid-until.jsonld",
    "valid/facet-required-liveness.jsonld",
    "invalid/required-liveness-bad-minfreshness.jsonld",
    "invalid/required-liveness-not-object.jsonld",
    "valid/facet-required-assurance-class.jsonld",
    "valid/facet-assurance-hardware-uv.jsonld",
    "valid/facet-assurance-software.jsonld",
    "valid/manifest-locked-facet-below-floor.jsonld",
    "invalid/facet-assurance-class-bad-enum-shape.jsonld",
    "invalid/facet-assurance-class-not-string-shape.jsonld",
]);
export async function featureFixtureHandler(fixtureJson, expectedEntry = {}) {
    if (expectedEntry.validationMode === "evaluation") {
        const { result, receipt } = await evaluateWo135(fixtureJson, expectedEntry.evaluationContext || {});
        return { result, reason: receipt.warnings?.[0]?.message || receipt.outcome, receipt };
    }
    const verdict = await structuralVerdictWo135(fixtureJson);
    return { result: verdict.result, reason: verdict.reasons.join("; ") || "structural contract satisfied" };
}
export function registerWo135(registry) {
    if (!registry || typeof registry.register !== "function") {
        throw new Error("registerWo135: registry with a register(filename, handler) function required");
    }
    for (const filename of feature_FIXTURE_FILENAMES) {
        registry.register(filename, featureFixtureHandler);
    }
    return feature_FIXTURE_FILENAMES.length;
}
