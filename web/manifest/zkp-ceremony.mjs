import { evaluateTrustTiers, effectiveFloor, defaultHolderBindingStatusOf, DEFAULT_MAX_SUPPORTED_TRUST_TIER, BINDING_VERIFIED, BINDING_FAILED, BINDING_ABSENT, BINDING_PRESENT_UNVERIFIED, } from "./trust-tier.mjs";
import { verifyManifestProfileA } from "../signing/um-signature-profile-a.mjs";
export const BINDING_PROOF_TYPES = Object.freeze(["ZkLinkedSecretProof", "ZkHdDerivationProof"]);
export const CEREMONY_PROOF_TYPE = "ThresholdAttestationProof";
export const CEREMONY_PROTOCOL_CANDIDATES = Object.freeze(["frost-ed25519", "threshold-bbs"]);
export const ATTESTER_ROLES = Object.freeze(["subject", "witness", "custodian", "auditor"]);
export const CROSS_DID_BINDING_STATUSES = Object.freeze([
    BINDING_VERIFIED,
    BINDING_FAILED,
    BINDING_PRESENT_UNVERIFIED,
    BINDING_ABSENT,
]);
const CDB_DOMINANCE = { [BINDING_FAILED]: 3, [BINDING_PRESENT_UNVERIFIED]: 2, [BINDING_VERIFIED]: 1, [BINDING_ABSENT]: 0 };
export const WARN_STRUCTURE_MALFORMED = "um:reason:structure:malformed";
export const WARN_BINDING_FAILED = "um:reason:trust:binding-failed";
export const feature_PREVIEW_LABEL = "structural shape validation per EXT-T2/EXT-T3 (PREVIEW); no zero-knowledge verification performed or claimed";
export const feature_PROTOCOL_TRANSITIONAL_NOTE = "transitional: ceremonyProof predates the `protocol` member, which is REQUIRED only at wire freeze " +
    "(EXT-T3 §T3.1); without it the aggregateProof is evaluable only with out-of-band protocol knowledge " +
    "and is otherwise recorded trustTierUnsupported (EXT-T3 §T3.4 step 3)";
export const feature_CONFORMANCE = Object.freeze({
    wo: "runtime",
    standard: "Universal Manifest v0.4 Base §6.4.4/§6.4.7/§6.4.8 + EXT-T2 §T2.1 + EXT-T3 §T3.1–T3.4 (both profiles PREVIEW)",
    fixtures_owned: 5,
    binding_proof_shape_validation_real: true,
    ceremony_proof_shape_validation_real: true,
    cross_did_binding_claim_rules_real: true,
    ext_t2_pairwise_cardinality_check_real: true,
    fail_closed_disposition_real: true,
    envelope_signature_check_real: true,
    zk_linked_secret_verification: false,
    zk_hd_derivation_verification: false,
    credential_subject_binding_check: false,
    did_document_key_binding_check: false,
    threshold_ceremony_verification: false,
    attester_trust_list_check: false,
    tier2_or_tier3_ever_reported_verified: false,
    um_conformance_flag_flipped: false,
    preview_label: feature_PREVIEW_LABEL,
    scoped_claim: "runtime implements REAL structural shape validation for bindingProof (ZkLinkedSecretProof / " +
        "ZkHdDerivationProof), ceremonyProof (ThresholdAttestationProof, incl. the evaluator-only " +
        "attesters≥M quorum count), and identity.crossDidBinding claims, plus the REAL fail-closed " +
        "disposition through the runtime tier engine. " +
        feature_PREVIEW_LABEL +
        ". A well-formed validation is at best 'present-unverified' and never elevates trust.",
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
function claimsOf(manifest) {
    return Array.isArray(manifest?.claims) ? manifest.claims.filter((c) => c && typeof c === "object") : [];
}
export function validateBindingProofShape(validation) {
    if (!validation || typeof validation !== "object" || Array.isArray(validation)) {
        return { valid: false, errors: ["bindingProof must be an object"] };
    }
    const errors = [];
    if (validation.type === "ZkLinkedSecretProof") {
        if (!isNonEmptyString(validation.cryptosuite))
            errors.push("ZkLinkedSecretProof: missing cryptosuite");
        if (!isNonEmptyString(validation.proofPurpose))
            errors.push("ZkLinkedSecretProof: missing proofPurpose");
        if (!isNonEmptyString(validation.proofValue))
            errors.push("ZkLinkedSecretProof: missing proofValue");
        if (!validation.publicInputs || typeof validation.publicInputs !== "object" || Array.isArray(validation.publicInputs)) {
            errors.push("ZkLinkedSecretProof: missing publicInputs");
        }
        else if (typeof validation.publicInputs.commitmentA !== "string" ||
            typeof validation.publicInputs.commitmentB !== "string") {
            errors.push("ZkLinkedSecretProof: publicInputs must contain commitmentA and commitmentB");
        }
    }
    else if (validation.type === "ZkHdDerivationProof") {
        if (!isNonEmptyString(validation.proofSystem))
            errors.push("ZkHdDerivationProof: missing proofSystem");
        if (!isNonEmptyString(validation.circuit))
            errors.push("ZkHdDerivationProof: missing circuit");
        if (!isNonEmptyString(validation.proofValue))
            errors.push("ZkHdDerivationProof: missing proofValue");
        if (!validation.publicInputs || typeof validation.publicInputs !== "object" || Array.isArray(validation.publicInputs)) {
            errors.push("ZkHdDerivationProof: missing publicInputs");
        }
        else {
            const pi = validation.publicInputs;
            if (typeof pi.publicKeyA !== "string" || typeof pi.publicKeyB !== "string") {
                errors.push("ZkHdDerivationProof: publicInputs must contain publicKeyA and publicKeyB");
            }
            if (typeof pi.derivationPathA !== "string" || typeof pi.derivationPathB !== "string") {
                errors.push("ZkHdDerivationProof: publicInputs must contain derivationPathA and derivationPathB");
            }
        }
    }
    else {
        errors.push(`bindingProof.type must be ZkLinkedSecretProof or ZkHdDerivationProof, got ${String(validation.type)}`);
    }
    return { valid: errors.length === 0, errors };
}
export function validateCeremonyProofShape(validation) {
    const schemaDetectableErrors = [];
    const evaluatorOnlyErrors = [];
    if (!validation || typeof validation !== "object" || Array.isArray(validation)) {
        return {
            valid: false,
            errors: ["ceremonyProof must be an object"],
            schemaDetectableErrors: ["ceremonyProof must be an object"],
            evaluatorOnlyErrors: [],
            threshold: null,
            protocol: null,
            protocolNote: null,
        };
    }
    if (validation.type !== CEREMONY_PROOF_TYPE) {
        schemaDetectableErrors.push("ceremonyProof.type must be ThresholdAttestationProof");
    }
    let threshold = null;
    if (typeof validation.threshold !== "string" || !/^\d+-of-\d+$/.test(validation.threshold)) {
        schemaDetectableErrors.push("ceremonyProof.threshold must be in M-of-N format");
    }
    else {
        const [m, n] = validation.threshold.split("-of-").map((x) => parseInt(x, 10));
        threshold = { m, n };
    }
    const attestersIsArray = Array.isArray(validation.attesters);
    if (!attestersIsArray || validation.attesters.length === 0) {
        schemaDetectableErrors.push("ceremonyProof.attesters must be a non-empty array");
    }
    else {
        for (const a of validation.attesters) {
            if (!isNonEmptyString(a)) {
                schemaDetectableErrors.push("ceremonyProof.attesters entries must be non-empty strings");
                break;
            }
        }
    }
    if (!isNonEmptyString(validation.ceremonyId))
        schemaDetectableErrors.push("ceremonyProof: missing ceremonyId");
    if (!isNonEmptyString(validation.aggregateProof))
        schemaDetectableErrors.push("ceremonyProof: missing aggregateProof");
    if (threshold && attestersIsArray && validation.attesters.length > 0) {
        const { m, n } = threshold;
        if (validation.attesters.length < m) {
            evaluatorOnlyErrors.push(`ceremonyProof.attesters must have at least ${m} entries (threshold: ${validation.threshold})`);
        }
        if (m < 1 || n < 1 || m > n) {
            evaluatorOnlyErrors.push(`ceremonyProof.threshold "${validation.threshold}" is malformed: M and N must be positive integers with M <= N (EXT-T3 Section T3.1)`);
        }
        if (m <= n && validation.attesters.length > n) {
            evaluatorOnlyErrors.push(`ceremonyProof.attesters must have at most ${n} entries (threshold: ${validation.threshold}, EXT-T3 Section T3.1)`);
        }
        const distinct = new Set(validation.attesters.filter(isNonEmptyString));
        if (distinct.size < validation.attesters.length && distinct.size < m) {
            evaluatorOnlyErrors.push(`ceremonyProof.attesters must contain at least ${m} DISTINCT entries — duplicated DIDs do not count toward the quorum (${distinct.size} distinct of ${validation.attesters.length}; EXT-T3 Section T3.1)`);
        }
    }
    const protocol = isNonEmptyString(validation.protocol) ? validation.protocol : null;
    const protocolNote = protocol === null ? feature_PROTOCOL_TRANSITIONAL_NOTE : null;
    let attesterRolesNote;
    if (validation.attesterRoles !== undefined) {
        const rolesOk = validation.attesterRoles &&
            typeof validation.attesterRoles === "object" &&
            !Array.isArray(validation.attesterRoles) &&
            attestersIsArray &&
            Object.keys(validation.attesterRoles).every((did) => validation.attesters.includes(did));
        attesterRolesNote = rolesOk
            ? "attesterRoles declared (candidate member, EXT-T3 Section T3.2); role constraints are profile-defined and NOT evaluated here"
            : "attesterRoles malformed (key not a member of attesters, or not a map) — treated as ABSENT per EXT-T3 Section T3.2 (roles undeclared)";
    }
    const errors = [...schemaDetectableErrors, ...evaluatorOnlyErrors];
    return {
        valid: errors.length === 0,
        errors,
        schemaDetectableErrors,
        evaluatorOnlyErrors,
        threshold,
        protocol,
        protocolNote,
        ...(attesterRolesNote !== undefined ? { attesterRolesNote } : {}),
    };
}
export function validateCrossDidBindingClaimShape(claim) {
    const schemaDetectableErrors = [];
    const evaluatorOnlyErrors = [];
    const notes = [];
    if (!claim || typeof claim !== "object" || Array.isArray(claim)) {
        return {
            valid: false,
            errors: ["identity.crossDidBinding claim must be an object"],
            schemaDetectableErrors: ["identity.crossDidBinding claim must be an object"],
            evaluatorOnlyErrors: [],
            notes,
        };
    }
    if (!isNonEmptyString(claim.issuer)) {
        schemaDetectableErrors.push("identity.crossDidBinding claim missing issuer");
    }
    if (!Array.isArray(claim.boundDids) || claim.boundDids.length < 2) {
        schemaDetectableErrors.push("identity.crossDidBinding claim must contain at least 2 boundDids");
    }
    else if (!claim.boundDids.every(isNonEmptyString)) {
        schemaDetectableErrors.push("identity.crossDidBinding boundDids entries must be non-empty strings");
    }
    const carriesCryptographicBinding = claim.bindingProof !== undefined || claim.ceremonyProof !== undefined;
    if (!carriesCryptographicBinding) {
        if (!isNonEmptyString(claim.attester)) {
            schemaDetectableErrors.push("identity.crossDidBinding claim missing attester (required for attester-asserted bindings, Section 6.4.4)");
        }
        if (!isNonEmptyString(claim.attestationMethod)) {
            schemaDetectableErrors.push("identity.crossDidBinding claim missing attestationMethod (required for attester-asserted bindings, Section 6.4.4)");
        }
        if (!isIsoDateTime(claim.attestedAt)) {
            schemaDetectableErrors.push("identity.crossDidBinding claim missing attestedAt (required for attester-asserted bindings, Section 6.4.4)");
        }
    }
    else {
        notes.push("cryptographic bindingProof/ceremonyProof carries the binding — the attester triple is OPTIONAL (Section 6.4.4)");
    }
    if (claim.bindingProof !== undefined) {
        schemaDetectableErrors.push(...validateBindingProofShape(claim.bindingProof).errors);
    }
    if (claim.ceremonyProof !== undefined) {
        const c = validateCeremonyProofShape(claim.ceremonyProof);
        schemaDetectableErrors.push(...c.schemaDetectableErrors);
        evaluatorOnlyErrors.push(...c.evaluatorOnlyErrors);
        if (c.protocolNote)
            notes.push(c.protocolNote);
        if (c.attesterRolesNote)
            notes.push(c.attesterRolesNote);
    }
    const errors = [...schemaDetectableErrors, ...evaluatorOnlyErrors];
    return { valid: errors.length === 0, errors, schemaDetectableErrors, evaluatorOnlyErrors, notes };
}
export function validateWo136Structural(manifest) {
    const schemaDetectableErrors = [];
    const evaluatorOnlyErrors = [];
    const notes = [];
    if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
        return {
            valid: false,
            errors: ["manifest must be an object"],
            schemaDetectableErrors: ["manifest must be an object"],
            evaluatorOnlyErrors: [],
            notes,
        };
    }
    for (const claim of claimsOf(manifest)) {
        if (claim["@type"] === "identity.crossDidBinding") {
            const r = validateCrossDidBindingClaimShape(claim);
            schemaDetectableErrors.push(...r.schemaDetectableErrors);
            evaluatorOnlyErrors.push(...r.evaluatorOnlyErrors);
            notes.push(...r.notes);
            continue;
        }
        if (claim.bindingProof !== undefined) {
            schemaDetectableErrors.push(...validateBindingProofShape(claim.bindingProof).errors);
        }
        if (claim.ceremonyProof !== undefined) {
            const c = validateCeremonyProofShape(claim.ceremonyProof);
            schemaDetectableErrors.push(...c.schemaDetectableErrors);
            evaluatorOnlyErrors.push(...c.evaluatorOnlyErrors);
            if (c.protocolNote)
                notes.push(c.protocolNote);
        }
    }
    const errors = [...schemaDetectableErrors, ...evaluatorOnlyErrors];
    return { valid: errors.length === 0, errors, schemaDetectableErrors, evaluatorOnlyErrors, notes };
}
export function featureBindingStatusProvider(claim, manifest) {
    const c = claim && typeof claim === "object" ? claim : {};
    const hasZkOrCeremony = c.bindingProof !== undefined || c.ceremonyProof !== undefined;
    if (!hasZkOrCeremony)
        return defaultHolderBindingStatusOf(c, manifest);
    if (c.bindingProof !== undefined) {
        if (!validateBindingProofShape(c.bindingProof).valid)
            return BINDING_FAILED;
        if (!Array.isArray(c.boundDids) || c.boundDids.length !== 2)
            return BINDING_FAILED;
    }
    if (c.ceremonyProof !== undefined) {
        if (!validateCeremonyProofShape(c.ceremonyProof).valid)
            return BINDING_FAILED;
    }
    return BINDING_PRESENT_UNVERIFIED;
}
export function crossDidBindingStatusOf(manifest) {
    let status = BINDING_ABSENT;
    for (const claim of claimsOf(manifest)) {
        const isCdb = claim["@type"] === "identity.crossDidBinding";
        const hasProof = claim.bindingProof !== undefined || claim.ceremonyProof !== undefined;
        if (!isCdb && !hasProof)
            continue;
        let s;
        if (hasProof) {
            s = featureBindingStatusProvider(claim, manifest);
            if (s === BINDING_PRESENT_UNVERIFIED && isCdb && !validateCrossDidBindingClaimShape(claim).valid) {
                s = BINDING_FAILED;
            }
        }
        else {
            s = validateCrossDidBindingClaimShape(claim).valid ? BINDING_PRESENT_UNVERIFIED : BINDING_FAILED;
        }
        if ((CDB_DOMINANCE[s] ?? 0) > (CDB_DOMINANCE[status] ?? 0))
            status = s;
    }
    return status;
}
export function evaluateProofDispositions(manifest, context = {}) {
    const max = Number.isInteger(context.maxSupportedTrustTier)
        ? context.maxSupportedTrustTier
        : DEFAULT_MAX_SUPPORTED_TRUST_TIER;
    const structural = validateWo136Structural(manifest);
    if (!structural.valid) {
        return {
            engine: "runtime-zkp-ceremony",
            verdict: "rejected",
            rejectedBy: "runtime-structural-malformation",
            claimStatuses: [],
            facetStatuses: [],
            warnings: [{ code: WARN_STRUCTURE_MALFORMED, message: `Verify stage: ${structural.errors[0]}` }],
            crossDidBindingStatus: BINDING_FAILED,
            proofDispositions: [],
            preview: feature_PREVIEW_LABEL,
        };
    }
    const tier = evaluateTrustTiers(manifest, {
        maxSupportedTrustTier: max,
        holderBindingStatusOf: featureBindingStatusProvider,
    });
    const fragment = {
        engine: "runtime-zkp-ceremony",
        verdict: tier.verdict,
        claimStatuses: [...tier.claimStatuses],
        facetStatuses: [...tier.facetStatuses],
        warnings: [...tier.warnings],
        proofDispositions: [],
        preview: feature_PREVIEW_LABEL,
    };
    if (tier.holderBindingStatus !== undefined)
        fragment.holderBindingStatus = tier.holderBindingStatus;
    if (tier.effectiveTrustTier !== undefined)
        fragment.effectiveTrustTier = tier.effectiveTrustTier;
    const recordedRefs = new Set(fragment.claimStatuses.map((s) => s.claimRef));
    for (const claim of claimsOf(manifest)) {
        const hasProof = claim.bindingProof !== undefined || claim.ceremonyProof !== undefined;
        if (!hasProof)
            continue;
        const claimRef = refOf(claim);
        const claimTier = effectiveFloor(manifest?.requiredTrustTier, claim.requiredTrustTier);
        const providerStatus = featureBindingStatusProvider(claim, manifest);
        const shapes = [];
        if (claim.bindingProof !== undefined) {
            shapes.push({
                member: "bindingProof",
                type: String(claim.bindingProof?.type),
                profile: claim.bindingProof?.type === "ZkHdDerivationProof" ? "EXT-T2 Profile 2B" : "EXT-T2 Profile 2A",
            });
        }
        if (claim.ceremonyProof !== undefined) {
            const c = validateCeremonyProofShape(claim.ceremonyProof);
            shapes.push({
                member: "ceremonyProof",
                type: CEREMONY_PROOF_TYPE,
                profile: "EXT-T3",
                threshold: claim.ceremonyProof?.threshold,
                protocol: c.protocol,
                ...(c.protocolNote ? { protocolNote: c.protocolNote } : {}),
            });
        }
        let disposition;
        if (providerStatus === BINDING_FAILED) {
            disposition = "failed";
            fragment.warnings.push({
                code: WARN_BINDING_FAILED,
                message: `claim ${claimRef}: bindingProof on a claim whose boundDids cardinality is not exactly 2 — ` +
                    "the validation is treated as FAILING verification and the claim is capped at Tier 0; a sub-pair is never selected (EXT-T2 Section T2.1)",
            });
        }
        else if (claimTier > max) {
            disposition = "trustTierUnsupported";
        }
        else {
            disposition = "present-unverified";
            if (!recordedRefs.has(claimRef)) {
                fragment.claimStatuses.push({
                    claimRef,
                    status: "unverified",
                    tier: 0,
                    reason: "Tier-2/Tier-3 validation verification profile not implemented — structural shape only, fail closed; " +
                        feature_PREVIEW_LABEL,
                });
                recordedRefs.add(claimRef);
            }
        }
        fragment.proofDispositions.push({
            claimRef,
            claimTier,
            maxSupportedTrustTier: max,
            shapes,
            structuralShape: "valid",
            cryptographicVerification: "not-performed (EXT-T2/EXT-T3 PREVIEW — fail closed)",
            disposition,
            neverVerified: true,
        });
    }
    const cdb = crossDidBindingStatusOf(manifest);
    if (cdb !== BINDING_ABSENT)
        fragment.crossDidBindingStatus = cdb;
    return fragment;
}
export function buildZkLinkedSecretBindingProof({ cryptosuite = "bbs-2023", proofPurpose = "authentication", proofValue, commitmentA, commitmentB, } = {}) {
    const validation = {
        type: "ZkLinkedSecretProof",
        cryptosuite,
        proofPurpose,
        proofValue,
        publicInputs: { commitmentA, commitmentB },
    };
    const r = validateBindingProofShape(validation);
    if (!r.valid)
        throw new Error(`buildZkLinkedSecretBindingProof: ${r.errors.join("; ")}`);
    return validation;
}
export function buildZkHdDerivationBindingProof({ proofSystem = "groth16", circuit, proofValue, publicKeyA, publicKeyB, derivationPathA, derivationPathB, } = {}) {
    const validation = {
        type: "ZkHdDerivationProof",
        proofSystem,
        circuit,
        proofValue,
        publicInputs: { publicKeyA, publicKeyB, derivationPathA, derivationPathB },
    };
    const r = validateBindingProofShape(validation);
    if (!r.valid)
        throw new Error(`buildZkHdDerivationBindingProof: ${r.errors.join("; ")}`);
    return validation;
}
export function buildThresholdCeremonyProof({ threshold, attesters, ceremonyId, aggregateProof, protocol, attesterRoles } = {}) {
    const validation = {
        type: CEREMONY_PROOF_TYPE,
        threshold,
        attesters,
        ceremonyId,
        aggregateProof,
        ...(protocol !== undefined ? { protocol } : {}),
        ...(attesterRoles !== undefined ? { attesterRoles } : {}),
    };
    const r = validateCeremonyProofShape(validation);
    if (!r.valid)
        throw new Error(`buildThresholdCeremonyProof: ${r.errors.join("; ")}`);
    return validation;
}
export function buildCrossDidBindingClaim({ id, issuer, boundDids, requiredTrustTier, bindingProof, ceremonyProof, attester, attestationMethod, attestedAt, } = {}) {
    const claim = {
        ...(isNonEmptyString(id) ? { "@id": id } : {}),
        "@type": "identity.crossDidBinding",
        issuer,
        boundDids,
        ...(Number.isInteger(requiredTrustTier) ? { requiredTrustTier } : {}),
        ...(bindingProof !== undefined ? { bindingProof } : {}),
        ...(ceremonyProof !== undefined ? { ceremonyProof } : {}),
        ...(attester !== undefined ? { attester } : {}),
        ...(attestationMethod !== undefined ? { attestationMethod } : {}),
        ...(attestedAt !== undefined ? { attestedAt } : {}),
    };
    const r = validateCrossDidBindingClaimShape(claim);
    if (!r.valid)
        throw new Error(`buildCrossDidBindingClaim: ${r.errors.join("; ")}`);
    if (bindingProof !== undefined && (!Array.isArray(boundDids) || boundDids.length !== 2)) {
        throw new Error("buildCrossDidBindingClaim: a claim carrying a bindingProof must list EXACTLY 2 boundDids (EXT-T2 Section T2.1 pairwise cardinality)");
    }
    return claim;
}
export function buildWo136SampleClaims({ subjectDid = "did:web:demo.local:user:alice" } = {}) {
    const zkLinkedSecret = buildCrossDidBindingClaim({
        id: "urn:um:claim:runtime-sample-zk-linked-secret",
        issuer: subjectDid,
        boundDids: [subjectDid, "did:pkh:eip155:1:0xdemo"],
        requiredTrustTier: 2,
        bindingProof: buildZkLinkedSecretBindingProof({
            proofValue: "uSTRUCTURAL-ONLY-PLACEHOLDER-NOT-A-ZK-validation",
            commitmentA: "zDemoCommitmentA-structural-only",
            commitmentB: "zDemoCommitmentB-structural-only",
        }),
    });
    const zkHdDerivation = buildCrossDidBindingClaim({
        id: "urn:um:claim:runtime-sample-zk-hd-derivation",
        issuer: subjectDid,
        boundDids: [subjectDid, "did:key:z6MkDemoDerived"],
        requiredTrustTier: 2,
        bindingProof: buildZkHdDerivationBindingProof({
            circuit: "urn:uuid:circuit-hd-derivation-v1",
            proofValue: "uSTRUCTURAL-ONLY-PLACEHOLDER-NOT-A-GROTH16-validation",
            publicKeyA: "zDemoPubKeyA",
            publicKeyB: "zDemoPubKeyB",
            derivationPathA: "m/44'/0'/0'",
            derivationPathB: "m/44'/0'/1'",
        }),
    });
    const ceremony = buildCrossDidBindingClaim({
        id: "urn:um:claim:runtime-sample-ceremony",
        issuer: "did:web:notary-a.demo.local",
        boundDids: [subjectDid, "did:pkh:eip155:1:0xdemo"],
        requiredTrustTier: 3,
        attester: "did:web:notary-a.demo.local",
        attestationMethod: "Multi-party ceremony",
        attestedAt: "2026-07-05T00:00:00.000Z",
        ceremonyProof: buildThresholdCeremonyProof({
            threshold: "2-of-3",
            attesters: ["did:web:notary-a.demo.local", "did:web:notary-b.demo.local"],
            ceremonyId: "urn:um:ceremony:runtime-demo",
            aggregateProof: "zSTRUCTURAL-ONLY-PLACEHOLDER-NOT-AN-AGGREGATE-SIGNATURE",
        }),
    });
    return { zkLinkedSecret, zkHdDerivation, ceremony };
}
export function buildProofShapesDemoSurface(options = {}) {
    const max = Number.isInteger(options.maxSupportedTrustTier)
        ? options.maxSupportedTrustTier
        : DEFAULT_MAX_SUPPORTED_TRUST_TIER;
    const samples = buildWo136SampleClaims(options);
    const rows = [];
    for (const [key, label, profile] of [
        ["zkLinkedSecret", "Tier-2 ZKP binding — BBS+ linked secret", "EXT-T2 §T2.1.1 (Profile 2A) — PREVIEW"],
        ["zkHdDerivation", "Tier-2 ZKP binding — HD derivation", "EXT-T2 §T2.1.2 (Profile 2B) — PREVIEW"],
        ["ceremony", "Tier-3 multi-party ceremony — threshold attestation", "EXT-T3 §T3.1 — PREVIEW"],
    ]) {
        const claim = samples[key];
        const shape = validateCrossDidBindingClaimShape(claim);
        const fragment = evaluateProofDispositions({ requiredTrustTier: 0, claims: [claim] }, { maxSupportedTrustTier: max });
        const row = {
            key,
            label,
            profile,
            claim,
            structural_validity: { valid: shape.valid, errors: shape.errors, notes: shape.notes },
            fail_closed_disposition: {
                claim_status: fragment.claimStatuses[0] || null,
                crossDidBindingStatus: fragment.crossDidBindingStatus || BINDING_ABSENT,
                verdict_contribution: fragment.verdict,
                explain: `required tier ${claim.requiredTrustTier} on a Tier-${max} evaluator ⇒ ` +
                    (claim.requiredTrustTier > max
                        ? `recorded "trustTierUnsupported" at the capability boundary (tier ${max}) — NEVER downgraded, NEVER verified (Base §6.4.5; CONFORMANCE §2.15)`
                        : `recorded "unverified" — the verification profile is PREVIEW and unimplemented; the validation NEVER elevates trust`),
            },
        };
        if (key === "ceremony") {
            row.transitional_protocol_note = feature_PROTOCOL_TRANSITIONAL_NOTE;
        }
        rows.push(row);
    }
    return {
        title: "Higher-tier validation shapes (EXT-T2 / EXT-T3 PREVIEW)",
        evaluator_max_supported_trust_tier: max,
        shapes: rows,
        preview_label: feature_PREVIEW_LABEL,
        honesty: "Shape validation, cardinality/quorum counting and the fail-closed tier dispositions are REAL " +
            "(runtime + runtime). NO zero-knowledge validation, threshold signature, or ceremony transcript is " +
            "generated or verified anywhere in this demo: validation bytes are labeled placeholders, every " +
            "disposition fails closed, and no validation is ever reported verified or Tier-2/Tier-3-met. " +
            "The portaling age validation remains an issuer-asserted signed VC — it is NOT zero-knowledge " +
            "and is not relabeled by this panel. No um_conformance claim is made by this panel.",
    };
}
export const feature_FIXTURE_FILENAMES = Object.freeze([
    "valid/manifest-with-zkp-binding-validation.jsonld",
    "valid/cross-did-binding-validation-only.jsonld",
    "valid/manifest-with-ceremony-validation.jsonld",
    "invalid/binding-validation-invalid-type.jsonld",
    "invalid/ceremony-validation-insufficient-attesters.jsonld",
]);
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
    if (isIsoDateTime(manifest.issuedAt) &&
        isIsoDateTime(manifest.expiresAt) &&
        Date.parse(manifest.issuedAt) > Date.parse(manifest.expiresAt)) {
        errors.push("issuedAt must be <= expiresAt");
    }
    return errors;
}
export async function structuralVerdictWo136(manifest) {
    const reasons = [];
    reasons.push(...envelopeErrors(manifest));
    const runtime = manifest && typeof manifest === "object" ? validateWo136Structural(manifest) : { errors: [], notes: [] };
    reasons.push(...runtime.errors);
    let sigReport = null;
    if (reasons.length === 0) {
        sigReport = await verifyManifestProfileA(manifest);
        if (!sigReport.ok)
            reasons.push(`signature verification failed: ${sigReport.reason}`);
    }
    return {
        result: reasons.length === 0 ? "accept" : "reject",
        reasons,
        notes: runtime.notes || [],
        checks: { signature: sigReport ? sigReport.reason : "not-evaluated" },
    };
}
export function schemaVerdictWo136(manifest) {
    const r = validateWo136Structural(manifest);
    return {
        result: r.schemaDetectableErrors.length === 0 ? "accept" : "reject",
        reasons: r.schemaDetectableErrors,
        evaluatorOnlyReasonsExcluded: r.evaluatorOnlyErrors,
    };
}
export async function featureFixtureHandler(fixtureJson, expectedEntry = {}) {
    if (expectedEntry.validationMode === "evaluation") {
        const fragment = evaluateProofDispositions(fixtureJson, expectedEntry.evaluationContext || {});
        return {
            result: fragment.verdict === "rejected" ? "reject" : "accept",
            reason: fragment.warnings?.[0]?.message || fragment.verdict,
            fragment,
        };
    }
    const verdict = await structuralVerdictWo136(fixtureJson);
    return {
        result: verdict.result,
        reason: verdict.reasons.join("; ") ||
            ["structural contract satisfied", ...verdict.notes].join(" — "),
    };
}
export function registerWo136(registry) {
    if (!registry || typeof registry.register !== "function") {
        throw new Error("registerWo136: registry with a register(filename, handler) function required");
    }
    for (const filename of feature_FIXTURE_FILENAMES) {
        registry.register(filename, featureFixtureHandler);
    }
    return feature_FIXTURE_FILENAMES.length;
}
