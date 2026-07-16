export const TRUST_TIER_MIN = 0;
export const TRUST_TIER_MAX = 3;
export const TRUST_TIER_DEFAULT = 0;
export const DEFAULT_MAX_SUPPORTED_TRUST_TIER = 1;
export const WARN_TIER_UNSUPPORTED = "um:reason:trust:tier-unsupported";
export const WARN_STRUCTURE_MALFORMED = "um:reason:structure:malformed";
export const BINDING_VERIFIED = "verified";
export const BINDING_FAILED = "failed";
export const BINDING_ABSENT = "absent";
export const BINDING_PRESENT_UNVERIFIED = "present-unverified";
export function isTrustTier(v) {
    return Number.isInteger(v) && v >= TRUST_TIER_MIN && v <= TRUST_TIER_MAX;
}
function tierOrDefault(v) {
    return isTrustTier(v) ? v : TRUST_TIER_DEFAULT;
}
export function effectiveFloor(manifestTier, itemTier) {
    return Math.max(tierOrDefault(manifestTier), tierOrDefault(itemTier));
}
export function checkFloors(manifest) {
    const m = manifest && typeof manifest === "object" ? manifest : {};
    const manifestTier = tierOrDefault(m.requiredTrustTier);
    const violations = [];
    const claims = Array.isArray(m.claims) ? m.claims : [];
    for (let i = 0; i < claims.length; i++) {
        const c = claims[i] && typeof claims[i] === "object" ? claims[i] : {};
        const declared = c.requiredTrustTier;
        if (isTrustTier(declared) && declared < manifestTier) {
            violations.push({
                kind: "claim",
                index: i,
                ref: refOf(c),
                declaredTier: declared,
                manifestTier,
                reason: "claim.requiredTrustTier cannot be lower than manifest.requiredTrustTier (Section 6.4.5)",
            });
        }
    }
    const facets = Array.isArray(m.facets) ? m.facets : [];
    for (let i = 0; i < facets.length; i++) {
        const f = facets[i] && typeof facets[i] === "object" ? facets[i] : {};
        const declared = f.requiredTrustTier;
        if (isTrustTier(declared) && declared < manifestTier) {
            violations.push({
                kind: "facet",
                index: i,
                ref: refOf(f),
                declaredTier: declared,
                manifestTier,
                reason: "facet.requiredTrustTier cannot be lower than manifest.requiredTrustTier (Section 6.4.5)",
            });
        }
    }
    return { ok: violations.length === 0, manifestTier, violations };
}
export function capTier({ requiredTier, maxSupportedTrustTier, bindingStatus }) {
    const required = tierOrDefault(requiredTier);
    const max = tierOrDefault(maxSupportedTrustTier);
    if (required > max) {
        return { path: "unsupported", tier: max };
    }
    if (required >= 1 && (bindingStatus === BINDING_ABSENT || bindingStatus === BINDING_FAILED)) {
        return { path: "capped", tier: 0, holderBindingStatus: bindingStatus };
    }
    return { path: "within", tier: required };
}
export function defaultHolderBindingStatusOf(claim) {
    const c = claim && typeof claim === "object" ? claim : {};
    const present = c.holderBinding !== undefined || c.bindingProof !== undefined || c.ceremonyProof !== undefined;
    return present ? BINDING_PRESENT_UNVERIFIED : BINDING_ABSENT;
}
export function evaluateTrustTiers(manifest, context = {}) {
    const m = manifest && typeof manifest === "object" ? manifest : {};
    const max = tierOrDefault(context.maxSupportedTrustTier);
    const bindingStatusOf = typeof context.holderBindingStatusOf === "function"
        ? context.holderBindingStatusOf
        : defaultHolderBindingStatusOf;
    const fragment = {
        engine: "runtime-trust-tier",
        verdict: "accepted",
        rejectedBy: null,
        manifestTier: tierOrDefault(m.requiredTrustTier),
        maxSupportedTrustTier: max,
        floorViolations: [],
        claimStatuses: [],
        facetStatuses: [],
        warnings: [],
        deferredClaims: [],
        deferredFacetIds: [],
    };
    const floors = checkFloors(m);
    if (!floors.ok) {
        fragment.verdict = "rejected";
        fragment.rejectedBy = "floor-violation";
        fragment.floorViolations = floors.violations;
        fragment.warnings.push({
            code: WARN_STRUCTURE_MALFORMED,
            message: `Verify stage: ${floors.violations[0].reason}`,
        });
        return fragment;
    }
    const manifestTier = floors.manifestTier;
    const facets = Array.isArray(m.facets) ? m.facets : [];
    if (manifestTier > max) {
        fragment.verdict = "rejected";
        fragment.rejectedBy = "manifest-tier-unsupported";
        fragment.facetStatuses = facets.map((f) => ({
            facetId: refOf(f),
            ...(typeof f?.name === "string" ? { name: f.name } : {}),
            status: "trustTierUnsupported",
            reason: `manifest requiredTrustTier ${manifestTier} exceeds evaluator capability ${max}`,
        }));
        fragment.warnings.push({
            code: WARN_TIER_UNSUPPORTED,
            message: `Compose stage: manifest-level requiredTrustTier ${manifestTier} exceeds evaluator capability ${max}`,
        });
        return fragment;
    }
    const claims = Array.isArray(m.claims) ? m.claims : [];
    let capBindingStatus;
    const verifiedContributions = [];
    for (const claim of claims) {
        const c = claim && typeof claim === "object" ? claim : {};
        const claimRef = refOf(c);
        const claimTier = effectiveFloor(manifestTier, c.requiredTrustTier);
        let rawBindingStatus;
        try {
            rawBindingStatus = bindingStatusOf(c, m);
        }
        catch (_providerFault) {
            rawBindingStatus = BINDING_ABSENT;
        }
        const bindingStatus = normalizeBindingStatus(rawBindingStatus);
        const decision = capTier({
            requiredTier: claimTier,
            maxSupportedTrustTier: max,
            bindingStatus,
        });
        if (decision.path === "unsupported") {
            fragment.claimStatuses.push({
                claimRef,
                status: "trustTierUnsupported",
                tier: decision.tier,
                reason: `claim requiredTrustTier ${claimTier} exceeds evaluator capability ${max} (Section 6.4.5)`,
            });
            continue;
        }
        if (decision.path === "capped") {
            fragment.claimStatuses.push({
                claimRef,
                status: "trustTierUnsupported",
                tier: 0,
                reason: bindingStatus === BINDING_FAILED
                    ? "claim relied upon at Tier 1+ has a FAILED holder binding — capped at Tier 0 (EXT-T1 Section T1.1)"
                    : "claim relied upon at Tier 1+ carries no holderBinding — capped at Tier 0 (EXT-T1 Section T1.1)",
            });
            capBindingStatus = moreSevereBindingStatus(capBindingStatus, decision.holderBindingStatus);
            continue;
        }
        if (bindingStatusOf === defaultHolderBindingStatusOf &&
            bindingStatus === BINDING_PRESENT_UNVERIFIED &&
            claimTier >= 1 &&
            hasOnlyEmptyBindingMaterial(c)) {
            fragment.claimStatuses.push({
                claimRef,
                status: "trustTierUnsupported",
                tier: 0,
                holderBindingStatus: BINDING_PRESENT_UNVERIFIED,
                reason: "claim relied upon at Tier 1+ carries EMPTY holder-binding material — present but " +
                    "UNVERIFIED; recorded at Tier 0 pending holder-binding verification, NOT relied upon (EXT-T1 Section T1.1)",
            });
            continue;
        }
        if (bindingStatus === BINDING_VERIFIED) {
            verifiedContributions.push(Math.min(claimTier, max));
        }
        fragment.deferredClaims.push({ claimRef, tier: claimTier, bindingStatus });
    }
    for (const facet of facets) {
        const f = facet && typeof facet === "object" ? facet : {};
        const facetTier = effectiveFloor(manifestTier, f.requiredTrustTier);
        if (facetTier > max) {
            fragment.facetStatuses.push({
                facetId: refOf(f),
                ...(typeof f.name === "string" ? { name: f.name } : {}),
                status: "trustTierUnsupported",
                reason: `facet requiredTrustTier ${facetTier} exceeds evaluator capability ${max}`,
            });
        }
        else {
            fragment.deferredFacetIds.push(refOf(f));
        }
    }
    if (capBindingStatus !== undefined) {
        fragment.holderBindingStatus = capBindingStatus;
        fragment.effectiveTrustTier =
            verifiedContributions.length > 0 ? Math.max(0, ...verifiedContributions) : 0;
    }
    else if (verifiedContributions.length > 0) {
        fragment.effectiveTrustTier = Math.max(...verifiedContributions);
    }
    const hasUnsupported = fragment.claimStatuses.some((s) => s.status === "trustTierUnsupported") ||
        fragment.facetStatuses.some((s) => s.status === "trustTierUnsupported");
    fragment.verdict = hasUnsupported ? "accepted-partial" : "accepted";
    return fragment;
}
function normalizeBindingStatus(v) {
    return v === BINDING_VERIFIED ||
        v === BINDING_PRESENT_UNVERIFIED ||
        v === BINDING_FAILED ||
        v === BINDING_ABSENT
        ? v
        : BINDING_ABSENT;
}
const BINDING_STATUS_SEVERITY = Object.freeze({
    [BINDING_FAILED]: 4,
    "unsupported-mode": 3,
    [BINDING_ABSENT]: 2,
    [BINDING_PRESENT_UNVERIFIED]: 1,
    [BINDING_VERIFIED]: 0,
});
function moreSevereBindingStatus(current, next) {
    if (next === undefined)
        return current;
    if (current === undefined)
        return next;
    const rc = BINDING_STATUS_SEVERITY[current] ?? -1;
    const rn = BINDING_STATUS_SEVERITY[next] ?? -1;
    return rn > rc ? next : current;
}
function refOf(obj) {
    const o = obj && typeof obj === "object" ? obj : {};
    if (typeof o["@id"] === "string" && o["@id"].length > 0)
        return o["@id"];
    return typeof o["@type"] === "string" ? o["@type"] : "";
}
function hasOnlyEmptyBindingMaterial(claim) {
    const c = claim && typeof claim === "object" ? claim : {};
    const members = [c.holderBinding, c.bindingProof, c.ceremonyProof];
    let sawPresent = false;
    for (const member of members) {
        if (member === undefined)
            continue;
        sawPresent = true;
        if (member !== null && typeof member === "object" && Object.keys(member).length > 0) {
            return false;
        }
    }
    return sawPresent;
}
export function negotiateBilateralFloor(tierA, tierB) {
    return Math.max(tierOrDefault(tierA), tierOrDefault(tierB));
}
export function buildTierDemoSurface(options = {}) {
    const localTier = tierOrDefault(options.localRequiredTrustTier);
    const remoteTier = tierOrDefault(options.remoteRequiredTrustTier);
    const max = isTrustTier(options.maxSupportedTrustTier)
        ? options.maxSupportedTrustTier
        : DEFAULT_MAX_SUPPORTED_TRUST_TIER;
    const negotiatedFloor = negotiateBilateralFloor(localTier, remoteTier);
    const tier2SampleClaim = {
        "@id": "urn:um:claim:demo-tier2-sample",
        "@type": "identity.crossDidBinding",
        issuer: "did:web:demo.local:attester",
        boundDids: ["did:web:demo.local:user:alice", "did:pkh:eip155:1:0xdemo"],
        requiredTrustTier: 2,
        bindingProof: {
            type: "ZkLinkedSecretProof",
            cryptosuite: "bbs-2023",
            proofPurpose: "authentication",
            proofValue: "uDEMO-STRUCTURAL-ONLY",
            publicInputs: { commitmentA: "zDemoA", commitmentB: "zDemoB" },
        },
    };
    const sampleFragment = evaluateTrustTiers({ requiredTrustTier: 0, claims: [tier2SampleClaim] }, { maxSupportedTrustTier: max });
    return {
        negotiated_floor: negotiatedFloor,
        negotiated_floor_explain: `interaction tier floor = max(local ${localTier}, remote ${remoteTier}) = ${negotiatedFloor} ` +
            "(Base §6.4.6 — a NEGOTIATED floor, distinct from the effectiveTrustTier each party records)",
        parties: { local_required_trust_tier: localTier, remote_required_trust_tier: remoteTier },
        evaluator_max_supported_trust_tier: max,
        tier2_sample: {
            claim: tier2SampleClaim,
            claim_status: sampleFragment.claimStatuses[0] || null,
            verdict_contribution: sampleFragment.verdict,
            explain: `deliberately Tier-2-required claim on a Tier-${max} evaluator → recorded ` +
                `"trustTierUnsupported" at the capability boundary (tier ${Math.min(2, max)}), ` +
                "NEVER downgraded to a lower tier (Base §6.4.5; CONFORMANCE §2.15)",
        },
        honesty: "Tier floors, capability checks, Tier-0 capping and the negotiated bilateral floor are " +
            "REAL and fail closed. Tier-2 ZKP / Tier-3 ceremony VERIFICATION is NOT " +
            "implemented (runtime structural PREVIEW); holder-binding verification is runtime. " +
            "No um_conformance claim is made by this panel.",
    };
}
export const TRUST_TIER_ENGINE = Object.freeze({
    wo: "runtime",
    standard: "Universal Manifest v0.4 (Base §6.4.2/§6.4.5; EXT-T1 §T1.0/T1.1; CONFORMANCE §2.9/§2.12/§2.15/§6.1/§6.3)",
    implements: Object.freeze([
        "raise-only floor validation (claim/facet floor below manifest floor => reject; evaluator-only)",
        "capability check with NO-DOWNGRADE invariant (required tier > maxSupportedTrustTier => trustTierUnsupported at the capability boundary)",
        "manifest-level unsupported tier => rejected (+ per-facet trustTierUnsupported records)",
        "Tier-0 capping (Tier-1+ reliance without verified holder binding => tier 0, holderBindingStatus absent|failed, effectiveTrustTier 0)",
        "effectiveTrustTier receipt field (consumed by runtime)",
        "bilateral negotiated floor = max(requiredTrustTier_A, requiredTrustTier_B) (runtime seam)",
    ]),
    does_not_implement: Object.freeze([
        "holder-binding cryptographic verification (runtime — injectable holderBindingStatusOf seam; default provider is presence-based and NEVER reports verified)",
        "Tier-2 ZKP / Tier-3 ceremony verification profiles (runtime — Grade-1 structural PREVIEW; unsupported tiers fail closed here)",
        "signature/freshness verification (runtime/119), consent, projection, composed six-stage receipt (runtime/144)",
    ]),
    fail_closed: true,
    default_max_supported_trust_tier: DEFAULT_MAX_SUPPORTED_TRUST_TIER,
    um_conformance_claimed: false,
    scope_boundary: "Trust-tier ENFORCEMENT logic only — a receipt FRAGMENT provider for the composing v0.4 " +
        "evaluator. Flips no um_conformance flag; tier honesty for the demo's entity-type/age " +
        "attestations rides on this engine.",
});
