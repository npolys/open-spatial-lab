import { jcsCanonicalizeToBytes } from "../signing/jcs-rfc8785.mjs";
import { generateKeyPair, signBytes, verifyBytes, derivePublicKeyRaw } from "../signing/ed25519.mjs";
import { bytesToBase64Url } from "../signing/codecs.mjs";
import { publicKeyToDidKey, resolveKeyRefOffline } from "../signing/did.mjs";
import { attachSignatureProfileA, verifyManifestProfileA } from "../signing/um-signature-profile-a.mjs";
import { evaluateTrustTiers, BINDING_VERIFIED, BINDING_FAILED, BINDING_ABSENT, } from "./trust-tier.mjs";
import { verifyHolderBindingForClaim, makeReciprocalControlBinding, checkClaimProofSizeLimits, VP_EMBEDDED_LIMIT_BYTES, } from "./holder-binding.mjs";
import { buildSealedCrossingFacets, evaluateSealedFacets, p6ReceiptRows } from "./jwe-sealed-facets.mjs";
export const ENTITY_TYPES = Object.freeze(["human", "ai_agent", "npc"]);
export const CLAIM_TYPE_ENTITY = "identity.entityType";
export const CLAIM_TYPE_PERSONHOOD = "identity.personhood";
export const CLAIM_TYPE_AGE_OVER = "identity.ageOver";
export const feature_CLAIM_TYPES = Object.freeze([CLAIM_TYPE_ENTITY, CLAIM_TYPE_PERSONHOOD, CLAIM_TYPE_AGE_OVER]);
export const STATUS_VERIFIED = "verified";
export const STATUS_FAILED = "failed";
export const STATUS_STALE = "stale";
export const STATUS_ENTITY_INCONSISTENT = "entity-type-inconsistent";
export const STATUS_UNIMPLEMENTED_PROFILE = "unimplemented-profile";
export const WARN_ENTITY_UNVERIFIED = "um:reason:entity:attestation-unverified";
export const WARN_ENTITY_CONFLICT = "um:reason:entity:conflicting-attestations";
export const WARN_PERSONHOOD_INCONSISTENT = "um:reason:personhood:entity-type-inconsistent";
export const WARN_PERSONHOOD_STALE = "um:reason:personhood:stale";
export const WARN_PERSONHOOD_UNNAMESPACED = "um:reason:personhood:namespace-missing";
export const WARN_ZK_UNIMPLEMENTED = "um:reason:validation:zk-profile-unimplemented";
export const WARN_AGE_DISCLOSURE = "um:reason:age:birthdate-disclosure";
export const AGE_PROOF_MECHANISM = "signed-vc";
export const AGE_PROOF_LABEL = "signed-VC age validation (issuer-asserted threshold claim, verified boolean)";
export const FORWARD_ZK_BOUNDARY = "NOT a holder-generated ZK predicate — holder-side predicate synthesis is FORWARD " +
    "(spec/v0.4/README.md 'Explicitly deferred (FORWARD)'): an issuer-signed boolean is " +
    "not equivalent to a holder-generated validation. No live ZK age validation is claimed.";
export const FORWARD_PERSONHOOD_BOUNDARY = "provider attestation at Tier 1 with namespace separation and freshness — " +
    "one-person-one-account UNIQUENESS (nullifier-style per-context) is a FORWARD future " +
    "profile (spec/v0.4/README.md) and is NOT claimed here.";
const ZK_MECHANISM_RE = /^zk[-_]/i;
export const feature_CONFORMANCE = Object.freeze({
    wo: "runtime",
    standard: "Universal Manifest v0.4 — P4 entity-type attestation + P5 personhood/age validation " +
        "(Base claims §6.4.3; EXT-T1 tier/binding via runtime/134; README FORWARD boundaries)",
    page_bars_owned: Object.freeze(["P4", "P5"]),
    external_fixtures_owned: 0,
    entity_type_issuer_vc_verification_real: true,
    personhood_attestation_verification_real: true,
    entity_type_consistency_gate_real: true,
    tier0_cap_via_wo133_real: true,
    tier1_via_wo134_binding_real: true,
    vp_size_limit_real: true,
    age_proof_is_zk: false,
    zk_personhood_verification: false,
    personhood_uniqueness_claimed: false,
    um_conformance_flag_flipped: false,
    scoped_claim: "runtime implements REAL issuer-signed-VC verification (Ed25519/JCS, offline did:key) for " +
        "entity-type, personhood, and ageOver claims; tier honesty rides on runtime (unbound ⇒ visible " +
        "Tier-0 cap) and runtime (verified reciprocal-control binding ⇒ Tier 1). The age validation is an " +
        "issuer-asserted threshold claim labeled 'signed-VC age validation' — the holder-generated-ZK " +
        "boundary is FORWARD and any zk-* mechanism fails closed, never verified. Personhood " +
        "uniqueness is not claimed. No um_conformance flag is flipped.",
});
function isNonEmptyString(v) {
    return typeof v === "string" && v.length > 0;
}
function isIsoDateTime(v) {
    return typeof v === "string" && Number.isFinite(Date.parse(v));
}
function refOf(obj) {
    const o = obj && typeof obj === "object" ? obj : {};
    if (isNonEmptyString(o["@id"]))
        return o["@id"];
    return typeof o["@type"] === "string" ? o["@type"] : "";
}
function claimAssertsZkMechanism(claim) {
    const c = claim && typeof claim === "object" ? claim : {};
    if (typeof c.proofMechanism === "string" && ZK_MECHANISM_RE.test(c.proofMechanism))
        return true;
    const cp = c.claimProof;
    if (cp && typeof cp === "object" && !Array.isArray(cp)) {
        if (typeof cp.proofType === "string" && ZK_MECHANISM_RE.test(cp.proofType))
            return true;
        if (typeof cp.type === "string" && ZK_MECHANISM_RE.test(cp.type))
            return true;
        const p = cp.validation;
        if (p && typeof p === "object" && typeof p.proofType === "string" && ZK_MECHANISM_RE.test(p.proofType))
            return true;
    }
    return false;
}
const BIRTH_MATERIAL_RE = /birth|dateofbirth|\bdob\b/i;
function credentialSubjectDisclosesBirthMaterial(credentialSubject) {
    if (!credentialSubject || typeof credentialSubject !== "object")
        return false;
    return Object.keys(credentialSubject).some((k) => BIRTH_MATERIAL_RE.test(k));
}
export async function issueVcJcsEd25519(opts = {}) {
    const { credentialType, credentialSubject, issuerPrivateKey } = opts;
    if (!isNonEmptyString(credentialType))
        throw new Error("issueVcJcsEd25519: credentialType required");
    if (!credentialSubject || typeof credentialSubject !== "object") {
        throw new Error("issueVcJcsEd25519: credentialSubject object required");
    }
    if (!issuerPrivateKey)
        throw new Error("issueVcJcsEd25519: issuerPrivateKey required");
    const issuerDid = isNonEmptyString(opts.issuerDid)
        ? opts.issuerDid
        : publicKeyToDidKey(await derivePublicKeyRaw(issuerPrivateKey));
    const credential = {
        type: "VerifiableCredential",
        credentialType,
        issuer: issuerDid,
        issuanceDate: isIsoDateTime(opts.issuanceDate) ? opts.issuanceDate : new Date().toISOString(),
        ...(isIsoDateTime(opts.expirationDate) ? { expirationDate: opts.expirationDate } : {}),
        credentialSubject: { ...credentialSubject },
    };
    const bytes = jcsCanonicalizeToBytes(credential);
    const sig = await signBytes(bytes, issuerPrivateKey);
    return {
        ...credential,
        validation: {
            proofType: "vc-jcs-ed25519",
            proofPurpose: "assertionMethod",
            verificationMethod: issuerDid,
            proofValue: bytesToBase64Url(sig),
        },
    };
}
export async function verifyVcJcsEd25519(vc, opts = {}) {
    try {
        if (!vc || typeof vc !== "object" || Array.isArray(vc))
            return { verified: false, reason: "VC must be an object", issuer: null };
        if (vc.type !== "VerifiableCredential")
            return { verified: false, reason: "VC.type must be VerifiableCredential", issuer: null };
        if (!isNonEmptyString(vc.credentialType))
            return { verified: false, reason: "VC.credentialType missing", issuer: null };
        if (!isNonEmptyString(vc.issuer))
            return { verified: false, reason: "VC.issuer missing", issuer: null };
        if (!vc.credentialSubject || typeof vc.credentialSubject !== "object") {
            return { verified: false, reason: "VC.credentialSubject missing", issuer: vc.issuer };
        }
        const validation = vc.validation;
        if (!validation || typeof validation !== "object" || !isNonEmptyString(validation.proofValue)) {
            return { verified: false, reason: "VC.validation.proofValue missing", issuer: vc.issuer };
        }
        if (ZK_MECHANISM_RE.test(String(validation.proofType || ""))) {
            return { verified: false, reason: "zk-* proofType cannot verify through the signed-VC path (fail closed)", issuer: vc.issuer };
        }
        if (validation.verificationMethod !== vc.issuer) {
            return { verified: false, reason: "validation.verificationMethod does not match VC.issuer", issuer: vc.issuer };
        }
        if (isNonEmptyString(opts.expectedIssuer) && vc.issuer !== opts.expectedIssuer) {
            return { verified: false, reason: `VC.issuer ${vc.issuer} is not the expected issuer ${opts.expectedIssuer}`, issuer: vc.issuer };
        }
        const resolved = await resolveKeyRefOffline(vc.issuer);
        if (resolved.resolution !== "resolved") {
            return { verified: false, reason: `issuer key not offline-resolvable (${vc.issuer}) — fail closed`, issuer: vc.issuer };
        }
        const { validation: _omit, ...unsigned } = vc;
        const ok = await verifyBytes(jcsCanonicalizeToBytes(unsigned), validation.proofValue, resolved.rawPublicKey);
        if (!ok)
            return { verified: false, reason: "Ed25519 signature over JCS(VC − validation) does not verify", issuer: vc.issuer };
        if (isIsoDateTime(vc.expirationDate)) {
            const nowMs = isIsoDateTime(opts.now) ? Date.parse(opts.now) : Date.now();
            if (nowMs > Date.parse(vc.expirationDate)) {
                return { verified: false, reason: `VC expired at ${vc.expirationDate} (freshness fail-closed)`, issuer: vc.issuer };
            }
        }
        return { verified: true, reason: "issuer-signed VC verifies end-to-end (Ed25519 over JCS bytes, offline did:key issuer)", issuer: vc.issuer };
    }
    catch (e) {
        return { verified: false, reason: `VC verification error (fail closed): ${e.message}`, issuer: vc?.issuer ?? null };
    }
}
export async function buildEntityTypeClaim(opts = {}) {
    const { entityType, subject, issuerPrivateKey } = opts;
    if (!ENTITY_TYPES.includes(entityType)) {
        throw new Error(`buildEntityTypeClaim: entityType must be one of ${ENTITY_TYPES.join("|")}`);
    }
    if (!isNonEmptyString(subject))
        throw new Error("buildEntityTypeClaim: subject required");
    const vc = await issueVcJcsEd25519({
        credentialType: CLAIM_TYPE_ENTITY,
        credentialSubject: { id: subject, entityType },
        issuerPrivateKey,
        issuerDid: opts.issuerDid,
    });
    return {
        "@id": `urn:um:claim:entity-type:${entityType}:${subject}`,
        "@type": CLAIM_TYPE_ENTITY,
        issuer: vc.issuer,
        ...(isNonEmptyString(opts.issuerName) ? { issuerName: opts.issuerName } : {}),
        subject,
        entityType,
        requiredTrustTier: Number.isInteger(opts.requiredTrustTier) ? opts.requiredTrustTier : 1,
        claimProof: vc,
        ...(opts.holderBinding ? { holderBinding: opts.holderBinding } : {}),
    };
}
export async function buildPersonhoodClaim(opts = {}) {
    const { subject, namespace, issuerPrivateKey } = opts;
    if (!isNonEmptyString(subject))
        throw new Error("buildPersonhoodClaim: subject required");
    if (!isNonEmptyString(namespace)) {
        throw new Error("buildPersonhoodClaim: namespace required (README: namespace separation is part of the Tier-1 posture)");
    }
    const validUntil = isIsoDateTime(opts.validUntil) ? opts.validUntil : new Date(Date.now() + 3600_000).toISOString();
    const vc = await issueVcJcsEd25519({
        credentialType: CLAIM_TYPE_PERSONHOOD,
        credentialSubject: { id: subject, personhood: true, namespace },
        issuerPrivateKey,
        issuerDid: opts.issuerDid,
        expirationDate: validUntil,
    });
    return {
        "@id": `urn:um:claim:personhood:${subject}`,
        "@type": CLAIM_TYPE_PERSONHOOD,
        issuer: vc.issuer,
        subject,
        namespace,
        proofMechanism: "issuer-signed-vc",
        uniqueness: "not-claimed",
        requiredTrustTier: Number.isInteger(opts.requiredTrustTier) ? opts.requiredTrustTier : 1,
        claimProof: vc,
        ...(opts.holderBinding ? { holderBinding: opts.holderBinding } : {}),
    };
}
export async function buildAgeOverClaim(opts = {}) {
    const { subject, issuerPrivateKey } = opts;
    if (!isNonEmptyString(subject))
        throw new Error("buildAgeOverClaim: subject required");
    const threshold = Number.isInteger(opts.threshold) ? opts.threshold : 18;
    if (threshold <= 0 || threshold > 150)
        throw new Error("buildAgeOverClaim: implausible threshold");
    const credentialSubject = { id: subject, ageOver: threshold, satisfied: true };
    if (credentialSubjectDisclosesBirthMaterial(credentialSubject)) {
        throw new Error("buildAgeOverClaim: birth material must never enter the age-validation credential");
    }
    const vc = await issueVcJcsEd25519({
        credentialType: CLAIM_TYPE_AGE_OVER,
        credentialSubject,
        issuerPrivateKey,
        issuerDid: opts.issuerDid,
    });
    return {
        "@id": `urn:um:claim:age-over-${threshold}:${subject}`,
        "@type": CLAIM_TYPE_AGE_OVER,
        issuer: vc.issuer,
        subject,
        ageOver: threshold,
        proofMechanism: AGE_PROOF_MECHANISM,
        mechanismLabel: AGE_PROOF_LABEL,
        forwardBoundary: FORWARD_ZK_BOUNDARY,
        requiredTrustTier: Number.isInteger(opts.requiredTrustTier) ? opts.requiredTrustTier : 1,
        claimProof: vc,
        ...(opts.holderBinding ? { holderBinding: opts.holderBinding } : {}),
    };
}
export async function computeBindingStatuses(manifest) {
    const map = new Map();
    const claims = Array.isArray(manifest?.claims) ? manifest.claims : [];
    for (const claim of claims) {
        if (!claim || typeof claim !== "object")
            continue;
        const r = await verifyHolderBindingForClaim(manifest, claim);
        let status;
        if (r.status === "verified")
            status = BINDING_VERIFIED;
        else if (r.status === "absent")
            status = BINDING_ABSENT;
        else
            status = BINDING_FAILED;
        map.set(refOf(claim), status);
    }
    return map;
}
export async function evaluateEntityPersonhood(manifest, context = {}) {
    const nowIso = isIsoDateTime(context.now) ? context.now : new Date().toISOString();
    const maxTier = Number.isInteger(context.maxSupportedTrustTier) ? context.maxSupportedTrustTier : 1;
    const fragment = {
        engine: "runtime-entity-personhood",
        manifestId: refOf(manifest),
        outcome: "rejected",
        signatureCheck: "not-evaluated",
        entityType: null,
        entityTypeStatus: "absent",
        claimStatuses: [],
        personhood: null,
        ageProof: null,
        warnings: [],
        honesty: {
            age_proof: `${AGE_PROOF_LABEL} — ${FORWARD_ZK_BOUNDARY}`,
            personhood: FORWARD_PERSONHOOD_BOUNDARY,
        },
    };
    const sigReport = await verifyManifestProfileA(manifest);
    if (!sigReport.ok) {
        fragment.signatureCheck = "invalid";
        fragment.warnings.push({
            code: "um:reason:crypto:signature-invalid",
            message: `Verify stage: manifest signature failed (${sigReport.reason}) — no claim on this manifest is trusted`,
        });
        return fragment;
    }
    fragment.signatureCheck = "valid";
    const sizes = checkClaimProofSizeLimits(manifest);
    if (!sizes.valid) {
        fragment.warnings.push(...sizes.errors.map((e) => ({ code: "um:reason:limits:claim-validation-oversize", message: e })));
        return fragment;
    }
    const bindingMap = await computeBindingStatuses(manifest);
    const tierFragment = evaluateTrustTiers(manifest, {
        maxSupportedTrustTier: maxTier,
        holderBindingStatusOf: (claim) => bindingMap.get(refOf(claim)) ?? BINDING_ABSENT,
    });
    fragment.claimStatuses.push(...tierFragment.claimStatuses);
    fragment.warnings.push(...tierFragment.warnings);
    if (tierFragment.holderBindingStatus !== undefined)
        fragment.holderBindingStatus = tierFragment.holderBindingStatus;
    if (tierFragment.effectiveTrustTier !== undefined)
        fragment.effectiveTrustTier = tierFragment.effectiveTrustTier;
    if (tierFragment.verdict === "rejected") {
        fragment.outcome = "rejected";
        return fragment;
    }
    const cappedRefs = new Set(tierFragment.claimStatuses.map((s) => s.claimRef));
    const deferred = new Map(tierFragment.deferredClaims.map((d) => [d.claimRef, d]));
    const claims = Array.isArray(manifest?.claims) ? manifest.claims : [];
    const byType = (t) => claims.filter((c) => c && typeof c === "object" && c["@type"] === t);
    const entityClaims = byType(CLAIM_TYPE_ENTITY);
    const verifiedEntityTypes = [];
    for (const claim of entityClaims) {
        const claimRef = refOf(claim);
        if (cappedRefs.has(claimRef)) {
            fragment.entityTypeStatus = "capped-tier-0";
            continue;
        }
        const d = deferred.get(claimRef);
        if (!d)
            continue;
        const verdict = await verifyEntityTypeClaim(claim, { now: nowIso });
        if (verdict.verified) {
            verifiedEntityTypes.push(claim.entityType);
            fragment.claimStatuses.push({
                claimRef,
                status: STATUS_VERIFIED,
                tier: d.bindingStatus === BINDING_VERIFIED ? d.tier : 0,
                reason: verdict.reason,
            });
        }
        else {
            fragment.claimStatuses.push({ claimRef, status: STATUS_FAILED, tier: 0, reason: verdict.reason });
            fragment.warnings.push({ code: WARN_ENTITY_UNVERIFIED, message: `claim ${claimRef}: ${verdict.reason}` });
        }
    }
    const distinctVerified = [...new Set(verifiedEntityTypes)];
    if (distinctVerified.length === 1) {
        fragment.entityType = distinctVerified[0];
        fragment.entityTypeStatus = "verified";
    }
    else if (distinctVerified.length > 1) {
        fragment.entityType = null;
        fragment.entityTypeStatus = "conflict";
        fragment.warnings.push({
            code: WARN_ENTITY_CONFLICT,
            message: `conflicting verified entity types (${distinctVerified.join(", ")}) — trusting neither (fail closed)`,
        });
    }
    else if (entityClaims.length > 0 && fragment.entityTypeStatus !== "capped-tier-0") {
        fragment.entityTypeStatus = "failed";
    }
    for (const claim of byType(CLAIM_TYPE_PERSONHOOD)) {
        const claimRef = refOf(claim);
        if (cappedRefs.has(claimRef)) {
            fragment.personhood = {
                status: "capped-tier-0",
                reason: "personhood attestation is UNBOUND/unverifiable at Tier 1 — capped at Tier 0, not relied upon (CONFORMANCE §2.9)",
                boundary: FORWARD_PERSONHOOD_BOUNDARY,
            };
            continue;
        }
        if (!deferred.has(claimRef))
            continue;
        fragment.personhood = await verifyPersonhoodClaim(claim, {
            now: nowIso,
            verifiedEntityType: fragment.entityTypeStatus === "verified" ? fragment.entityType : null,
            entityTypeStatus: fragment.entityTypeStatus,
        });
        if (fragment.personhood.status !== STATUS_VERIFIED) {
            const code = fragment.personhood.status === STATUS_ENTITY_INCONSISTENT
                ? WARN_PERSONHOOD_INCONSISTENT
                : fragment.personhood.status === STATUS_STALE
                    ? WARN_PERSONHOOD_STALE
                    : fragment.personhood.status === STATUS_UNIMPLEMENTED_PROFILE
                        ? WARN_ZK_UNIMPLEMENTED
                        : WARN_ENTITY_UNVERIFIED;
            fragment.warnings.push({ code, message: `claim ${claimRef}: ${fragment.personhood.reason}` });
        }
        fragment.claimStatuses.push({
            claimRef,
            status: fragment.personhood.status,
            tier: fragment.personhood.status === STATUS_VERIFIED ? (deferred.get(claimRef)?.tier ?? 0) : 0,
            reason: fragment.personhood.reason,
        });
    }
    for (const claim of byType(CLAIM_TYPE_AGE_OVER)) {
        const claimRef = refOf(claim);
        if (cappedRefs.has(claimRef)) {
            fragment.ageProof = {
                status: "capped-tier-0",
                mechanism: AGE_PROOF_MECHANISM,
                label: AGE_PROOF_LABEL,
                boundary: FORWARD_ZK_BOUNDARY,
                reason: "age-validation claim is UNBOUND at Tier 1 — capped at Tier 0, not relied upon",
            };
            continue;
        }
        if (!deferred.has(claimRef))
            continue;
        fragment.ageProof = await verifyAgeOverClaim(claim, { now: nowIso });
        if (fragment.ageProof.status !== STATUS_VERIFIED) {
            const code = fragment.ageProof.status === STATUS_UNIMPLEMENTED_PROFILE ? WARN_ZK_UNIMPLEMENTED : WARN_AGE_DISCLOSURE;
            fragment.warnings.push({ code, message: `claim ${claimRef}: ${fragment.ageProof.reason}` });
        }
        fragment.claimStatuses.push({
            claimRef,
            status: fragment.ageProof.status,
            tier: fragment.ageProof.status === STATUS_VERIFIED ? (deferred.get(claimRef)?.tier ?? 0) : 0,
            reason: fragment.ageProof.reason,
        });
    }
    const anyNegative = fragment.claimStatuses.some((s) => s.status !== STATUS_VERIFIED && s.status !== "bound");
    fragment.outcome = anyNegative ? "accepted-partial" : "accepted";
    return fragment;
}
export async function verifyEntityTypeClaim(claim, opts = {}) {
    if (claimAssertsZkMechanism(claim)) {
        return {
            verified: false,
            reason: "zk-* validation mechanism on an entity-type claim — no ZK verifier implemented, failed closed (never reported verified)",
        };
    }
    if (!ENTITY_TYPES.includes(claim?.entityType)) {
        return { verified: false, reason: `entityType must be one of ${ENTITY_TYPES.join("|")}` };
    }
    const vc = claim.claimProof;
    if (!vc || typeof vc !== "object")
        return { verified: false, reason: "entity-type claim carries no embedded VC claimProof" };
    const r = await verifyVcJcsEd25519(vc, { expectedIssuer: claim.issuer, now: opts.now });
    if (!r.verified)
        return { verified: false, reason: r.reason };
    if (vc.credentialType !== CLAIM_TYPE_ENTITY) {
        return { verified: false, reason: `VC.credentialType ${vc.credentialType} is not ${CLAIM_TYPE_ENTITY}` };
    }
    if (vc.credentialSubject.entityType !== claim.entityType) {
        return {
            verified: false,
            reason: `claim body asserts "${claim.entityType}" but the SIGNED credential attests "${vc.credentialSubject.entityType}" — mismatch, fail closed`,
        };
    }
    if (isNonEmptyString(claim.subject) && vc.credentialSubject.id !== claim.subject) {
        return { verified: false, reason: "VC.credentialSubject.id does not match the claim subject" };
    }
    return { verified: true, reason: `entity type "${claim.entityType}" — issuer-signed VC verified end-to-end (${r.issuer})` };
}
export async function verifyPersonhoodClaim(claim, opts = {}) {
    const base = { namespace: claim?.namespace ?? null, boundary: FORWARD_PERSONHOOD_BOUNDARY };
    if (claimAssertsZkMechanism(claim)) {
        return {
            ...base,
            status: STATUS_UNIMPLEMENTED_PROFILE,
            reason: "zk personhood validation (nullifier-style uniqueness) is a FUTURE registered profile (README FORWARD) — " +
                "no ZK verifier implemented, FAILED CLOSED, never reported verified",
        };
    }
    const vc = claim?.claimProof;
    if (!vc || typeof vc !== "object") {
        return { ...base, status: STATUS_FAILED, reason: "personhood claim carries no embedded VC claimProof" };
    }
    const r = await verifyVcJcsEd25519(vc, { expectedIssuer: claim.issuer, now: opts.now });
    if (!r.verified) {
        const stale = /expired/.test(r.reason);
        return { ...base, status: stale ? STATUS_STALE : STATUS_FAILED, reason: r.reason };
    }
    if (vc.credentialType !== CLAIM_TYPE_PERSONHOOD || vc.credentialSubject.personhood !== true) {
        return { ...base, status: STATUS_FAILED, reason: "VC does not attest personhood" };
    }
    if (!isNonEmptyString(claim.namespace) || vc.credentialSubject.namespace !== claim.namespace) {
        return {
            ...base,
            status: STATUS_FAILED,
            reason: "namespace separation missing or inconsistent (README Tier-1 posture requires per-context namespacing)",
        };
    }
    if (!isIsoDateTime(vc.expirationDate)) {
        return { ...base, status: STATUS_STALE, reason: "personhood attestation carries no freshness bound (expirationDate) — fail closed" };
    }
    if (opts.verifiedEntityType !== "human") {
        const seen = opts.verifiedEntityType ??
            (opts.entityTypeStatus === "capped-tier-0" ? "capped-at-Tier-0 (unbound)" : "none verified");
        return {
            ...base,
            status: STATUS_ENTITY_INCONSISTENT,
            reason: `personhood attestation requires a VERIFIED entity type of "human" — this manifest's entity type is ` +
                `${JSON.stringify(seen)}: an ai_agent/npc (or an unverified entity) CANNOT claim human personhood (fail closed)`,
        };
    }
    return {
        ...base,
        status: STATUS_VERIFIED,
        reason: `provider personhood attestation verified (issuer ${r.issuer}, namespace ${claim.namespace}, fresh until ${vc.expirationDate}) — uniqueness NOT claimed (FORWARD)`,
    };
}
export async function verifyAgeOverClaim(claim, opts = {}) {
    const base = { mechanism: AGE_PROOF_MECHANISM, label: AGE_PROOF_LABEL, boundary: FORWARD_ZK_BOUNDARY };
    if (claimAssertsZkMechanism(claim)) {
        return {
            ...base,
            status: STATUS_UNIMPLEMENTED_PROFILE,
            reason: "claim asserts a zk age validation — holder-generated ZK range validation are FORWARD (README) and no ZK verifier " +
                "is implemented: FAILED CLOSED, never reported verified",
        };
    }
    const vc = claim?.claimProof;
    if (!vc || typeof vc !== "object")
        return { ...base, status: STATUS_FAILED, reason: "age claim carries no embedded VC claimProof" };
    const r = await verifyVcJcsEd25519(vc, { expectedIssuer: claim.issuer, now: opts.now });
    if (!r.verified)
        return { ...base, status: STATUS_FAILED, reason: r.reason };
    if (vc.credentialType !== CLAIM_TYPE_AGE_OVER) {
        return { ...base, status: STATUS_FAILED, reason: `VC.credentialType ${vc.credentialType} is not ${CLAIM_TYPE_AGE_OVER}` };
    }
    if (credentialSubjectDisclosesBirthMaterial(vc.credentialSubject)) {
        return {
            ...base,
            status: STATUS_FAILED,
            reason: "age-validation credential DISCLOSES birth material — violates the P5 non-disclosure requirement " +
                "(the full birth date belongs only in the sealed runtime facet); fail closed",
        };
    }
    if (!Number.isInteger(vc.credentialSubject.ageOver) || vc.credentialSubject.satisfied !== true) {
        return { ...base, status: STATUS_FAILED, reason: "VC does not assert a satisfied ageOver threshold" };
    }
    if (claim.ageOver !== vc.credentialSubject.ageOver) {
        return { ...base, status: STATUS_FAILED, reason: "claim threshold does not match the SIGNED credential threshold" };
    }
    return {
        ...base,
        status: STATUS_VERIFIED,
        threshold: vc.credentialSubject.ageOver,
        reason: `ageOver ${vc.credentialSubject.ageOver} verified against the issuer key (${r.issuer}) with NO birth-date ` +
            `disclosure — ${AGE_PROOF_LABEL}`,
    };
}
export function entityTypeIndicator(fragment) {
    const f = fragment && typeof fragment === "object" ? fragment : {};
    if (f.entityTypeStatus === "verified") {
        const tier = Number.isInteger(f.effectiveTrustTier) ? f.effectiveTrustTier : 0;
        const bound = tier >= 1;
        return {
            entityType: f.entityType,
            verified: true,
            tier,
            capped: !bound,
            badge: `${f.entityType} — verified (issuer-signed VC, Ed25519) — ${bound ? `Tier ${tier} (holder-bound)` : "Tier 0"}`,
            detail: bound
                ? "claim is holder-bound (runtime reciprocal-control verified) and relied on at Tier 1"
                : "issuer VC verified; no Tier-1 reliance",
        };
    }
    if (f.entityTypeStatus === "capped-tier-0") {
        return {
            entityType: null,
            verified: false,
            tier: 0,
            capped: true,
            badge: "entity type: asserted, UNBOUND — capped at Tier 0 (not relied upon)",
            detail: "the claim carries no verified holder binding, so Tier-1 reliance is refused and the assertion is " +
                "NOT trusted (CONFORMANCE §2.9 — no overclaim)",
        };
    }
    if (f.entityTypeStatus === "conflict") {
        return {
            entityType: null,
            verified: false,
            tier: 0,
            capped: true,
            badge: "entity type: CONFLICTING attestations — not trusted (fail closed)",
            detail: "multiple verified entity-type claims disagree; the indicator trusts neither",
        };
    }
    if (f.entityTypeStatus === "failed") {
        return {
            entityType: null,
            verified: false,
            tier: 0,
            capped: true,
            badge: "entity type: attestation FAILED verification — not trusted",
            detail: "the issuer VC did not verify (bad signature, wrong issuer, or claim/VC mismatch)",
        };
    }
    return {
        entityType: null,
        verified: false,
        tier: 0,
        capped: false,
        badge: "entity type: no attestation",
        detail: "manifest carries no identity.entityType claim",
    };
}
const DEMO_ISSUERS = Object.freeze([
    { role: "identity-service", name: "Demo Identity Service (fictional)" },
    { role: "personhood-provider", name: "Demo Personhood Provider (fictional)" },
    { role: "age-attestor", name: "Demo Age Attestation Service (fictional)" },
]);
function demoManifestDraft(subject) {
    const issuedAt = new Date().toISOString();
    return {
        "@context": "https://universalmanifest.net/ns/v0.4",
        "@id": `urn:uuid:${globalThis.crypto.randomUUID()}`,
        "@type": "um:Manifest",
        manifestVersion: "0.4",
        subject,
        issuedAt,
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        requiredTrustTier: 0,
    };
}
export async function buildDemoAvatarManifest(opts = {}) {
    const entityType = opts.entityType;
    const subjectKeys = await generateKeyPair();
    const boundKeys = await generateKeyPair();
    const issuerIdentity = await generateKeyPair();
    const subject = publicKeyToDidKey(subjectKeys.rawPublicKey);
    const draft = demoManifestDraft(subject);
    const mkBinding = async () => {
        if (opts.unbound)
            return undefined;
        const { binding } = await makeReciprocalControlBinding({
            manifestId: draft["@id"],
            subjectPrivateKey: subjectKeys.privateKey,
            boundDidPrivateKey: boundKeys.privateKey,
        });
        return binding;
    };
    const claims = [
        await buildEntityTypeClaim({
            entityType,
            subject,
            issuerPrivateKey: issuerIdentity.privateKey,
            issuerName: DEMO_ISSUERS[0].name,
            holderBinding: await mkBinding(),
            requiredTrustTier: 1,
        }),
    ];
    if (opts.withPersonhood) {
        const issuerPersonhood = await generateKeyPair();
        claims.push(await buildPersonhoodClaim({
            subject,
            namespace: opts.namespace || "did:web:demo.local:world:atrium#personhood",
            issuerPrivateKey: issuerPersonhood.privateKey,
            holderBinding: await mkBinding(),
            requiredTrustTier: 1,
        }));
    }
    if (opts.withAgeProof) {
        const issuerAge = await generateKeyPair();
        claims.push(await buildAgeOverClaim({
            subject,
            threshold: Number.isInteger(opts.ageThreshold) ? opts.ageThreshold : 18,
            issuerPrivateKey: issuerAge.privateKey,
            holderBinding: await mkBinding(),
            requiredTrustTier: 1,
        }));
    }
    const manifest = { ...draft, claims };
    if (Array.isArray(opts.extraFacets) && opts.extraFacets.length > 0)
        manifest.facets = opts.extraFacets;
    const signed = await attachSignatureProfileA(manifest, subjectKeys.seed);
    return { manifest: signed, subject, keys: { subjectKeys, boundKeys } };
}
export async function buildEntityPersonhoodDemoSurface(options = {}) {
    const maxTier = Number.isInteger(options.maxSupportedTrustTier) ? options.maxSupportedTrustTier : 1;
    const now = new Date().toISOString();
    const ctx = { now, maxSupportedTrustTier: maxTier };
    const sealed = await buildSealedCrossingFacets();
    const [human, ai, npc, unbound] = await Promise.all([
        buildDemoAvatarManifest({
            entityType: "human",
            withPersonhood: true,
            withAgeProof: true,
            extraFacets: sealed.facets,
        }),
        buildDemoAvatarManifest({ entityType: "ai_agent" }),
        buildDemoAvatarManifest({ entityType: "npc" }),
        buildDemoAvatarManifest({ entityType: "human", unbound: true }),
    ]);
    const evaluations = await Promise.all([
        evaluateEntityPersonhood(human.manifest, ctx),
        evaluateEntityPersonhood(ai.manifest, ctx),
        evaluateEntityPersonhood(npc.manifest, ctx),
        evaluateEntityPersonhood(unbound.manifest, ctx),
    ]);
    const aiWithPersonhood = await buildDemoAvatarManifest({ entityType: "ai_agent", withPersonhood: true });
    const aiRefused = await evaluateEntityPersonhood(aiWithPersonhood.manifest, ctx);
    const sealedEval = await evaluateSealedFacets(human.manifest, []);
    const names = ["visitor (human)", "assistant (ai_agent)", "greeter (npc)", "unbound visitor (human, NO binding)"];
    return {
        avatars: evaluations.map((fragment, i) => ({
            name: names[i],
            indicator: entityTypeIndicator(fragment),
            outcome: fragment.outcome,
            effectiveTrustTier: fragment.effectiveTrustTier ?? null,
            holderBindingStatus: fragment.holderBindingStatus ?? null,
        })),
        ageProof: evaluations[0].ageProof,
        personhood: evaluations[0].personhood,
        aiPersonhoodRefused: {
            status: aiRefused.personhood?.status ?? null,
            reason: aiRefused.personhood?.reason ?? null,
        },
        sealedRows: p6ReceiptRows(sealedEval.facetStatuses),
        vpSizeNote: `every embedded VC byte-counted under the ${VP_EMBEDDED_LIMIT_BYTES / 1024} KB per-VP limit (runtime G2)`,
        honesty: {
            entity_type: "entity-type attestations are REAL issuer-signed VCs (Ed25519/JCS) verified end-to-end; " +
                "Tier-1 reliance requires the runtime holder binding — the unbound row is capped at Tier 0, no overclaim.",
            age_proof: `${AGE_PROOF_LABEL} — ${FORWARD_ZK_BOUNDARY}`,
            personhood: FORWARD_PERSONHOOD_BOUNDARY,
            zk: "any zk-* validation mechanism FAILS CLOSED (unimplemented-profile) — never reported verified.",
            conformance: "this panel flips no um_conformance flag (runtime owns page bars P4/P5, no external v0.4 fixtures).",
        },
    };
}
