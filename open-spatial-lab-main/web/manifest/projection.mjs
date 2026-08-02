import { TRUST_TIER_DEFAULT, BINDING_ABSENT, BINDING_FAILED, effectiveFloor, capTier, defaultHolderBindingStatusOf, } from "./trust-tier.mjs";
export const FACET_STATUSES = Object.freeze([
    "processed",
    "opaque",
    "consent-denied",
    "consent-missing",
    "trustTierUnsupported",
    "assuranceInsufficient",
    "not-projected",
    "written",
]);
export const CLAIM_STATUSES = Object.freeze([
    "unprocessable",
    "unverified",
    "trustTierUnsupported",
]);
export const RECOGNIZED_CLAIM_TYPES = Object.freeze(new Set(["identity.crossDidBinding"]));
export const RECOGNIZED_POINTER_TYPES = Object.freeze(new Set(["um:agentDelegation"]));
export const PROJECT_OUTCOMES = Object.freeze(["accepted", "accepted-partial", "rejected"]);
function isNonEmptyString(v) {
    return typeof v === "string" && v.length > 0;
}
function claimRefOf(claim) {
    const c = claim && typeof claim === "object" ? claim : {};
    return isNonEmptyString(c["@id"]) ? c["@id"] : c["@type"];
}
function typeSet(node) {
    const t = node && node["@type"];
    if (Array.isArray(t))
        return t.filter((x) => typeof x === "string");
    if (typeof t === "string")
        return [t];
    return [];
}
export function canonicalizeManifest(value) {
    if (value === null)
        return "null";
    const t = typeof value;
    if (t === "string" || t === "number" || t === "boolean")
        return JSON.stringify(value);
    if (Array.isArray(value))
        return `[${value.map((item) => canonicalizeManifest(item)).join(",")}]`;
    if (t !== "object")
        return JSON.stringify(value);
    const keys = Object.keys(value)
        .filter((key) => value[key] !== undefined)
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalizeManifest(value[key])}`).join(",")}}`;
}
function subtle() {
    const s = globalThis.crypto?.subtle;
    if (!s)
        throw new Error("WebCrypto (crypto.subtle) unavailable — need Node >= 18 or a modern browser");
    return s;
}
async function sha256Hex(str) {
    const bytes = new TextEncoder().encode(str);
    const digest = new Uint8Array(await subtle().digest("SHA-256", bytes));
    let hex = "";
    for (const b of digest)
        hex += b.toString(16).padStart(2, "0");
    return hex;
}
export async function canonicalManifestHash(manifest) {
    return `sha256:${await sha256Hex(canonicalizeManifest(manifest))}`;
}
function facetEntity(manifest, name) {
    const match = (manifest?.facets || []).find((f) => f?.name === name);
    return match && typeof match.entity === "object" ? match.entity : undefined;
}
function consentByName(manifest, name) {
    return (manifest?.consents || []).find((c) => c?.name === name);
}
export async function deriveBindingChain({ requirementManifest, contentTrustManifest }) {
    const serviceRequirements = facetEntity(requirementManifest, "serviceRequirements");
    if (!serviceRequirements)
        throw new Error("deriveBindingChain: requirement manifest has no serviceRequirements facet");
    return {
        sessionNonce: serviceRequirements.challengeNonce,
        requirementManifestHash: await canonicalManifestHash(requirementManifest),
        contentTrustManifestHash: await canonicalManifestHash(contentTrustManifest),
    };
}
export async function verifyServiceEncounterBinding({ requirementManifest, contentTrustManifest, projectionManifest }) {
    const checks = [];
    const add = (id, ok, detail) => checks.push({ id, ok: !!ok, detail: detail || "" });
    const serviceRequirements = facetEntity(requirementManifest, "serviceRequirements");
    const publishedTerms = facetEntity(requirementManifest, "publishedTerms");
    const contentTrust = facetEntity(contentTrustManifest, "contentTrust");
    const serviceAuth = facetEntity(projectionManifest, "serviceAuth");
    const termsAcceptance = facetEntity(projectionManifest, "termsAcceptance");
    const handTracking = consentByName(projectionManifest, "sensor.handTracking");
    const eyeTracking = consentByName(projectionManifest, "sensor.eyeTracking");
    if (!serviceRequirements || !serviceAuth) {
        add("facets-present", false, "requirement.serviceRequirements or projection.serviceAuth missing");
        return { ok: false, checks };
    }
    const [reqHash, ctHash] = await Promise.all([
        canonicalManifestHash(requirementManifest),
        canonicalManifestHash(contentTrustManifest),
    ]);
    add("issuedForService", serviceAuth.issuedForService === requirementManifest.subject, `${serviceAuth.issuedForService} == ${requirementManifest.subject}`);
    add("serviceEndpoint", serviceAuth.serviceEndpoint === serviceRequirements.rmapEndpoint, `${serviceAuth.serviceEndpoint} == ${serviceRequirements.rmapEndpoint}`);
    add("sessionNonce", serviceAuth.sessionNonce === serviceRequirements.challengeNonce, `${serviceAuth.sessionNonce} == ${serviceRequirements.challengeNonce}`);
    add("requirementManifestHash", serviceAuth.requirementManifestHash === reqHash, `${serviceAuth.requirementManifestHash} == ${reqHash}`);
    add("contentTrustManifestHash", serviceAuth.contentTrustManifestHash === ctHash, `${serviceAuth.contentTrustManifestHash} == ${ctHash}`);
    if (publishedTerms && termsAcceptance) {
        add("termsDocumentHash", termsAcceptance.termsDocumentHash === publishedTerms.termsDocumentHash);
        add("termsVersion", termsAcceptance.termsVersion === publishedTerms.termsVersion);
    }
    add("handTracking-allowed", handTracking?.value === "allowed");
    add("handTracking-audience", handTracking?.audience?.match === requirementManifest.subject);
    add("eyeTracking-denied", eyeTracking?.value === "denied", "non-requested eye tracking stays denied in the projection");
    const requiredPackage = serviceRequirements.requiredPackages?.[0];
    if (requiredPackage && contentTrust) {
        add("package-id", requiredPackage.packageId === contentTrust.packageId);
        add("package-version", requiredPackage.packageVersion === contentTrust.packageVersion);
    }
    const ok = checks.every((c) => c.ok);
    return { ok, checks };
}
export function facetEntitlement(facet, receiver, manifest) {
    const r = receiver || {};
    const disclosure = facet && typeof facet.disclosure === "object" ? facet.disclosure : null;
    if (disclosure) {
        if (disclosure.public === true)
            return { entitled: true, basis: "disclosure.public" };
        if (isNonEmptyString(r.audience) && Array.isArray(disclosure.audiences) && disclosure.audiences.includes(r.audience)) {
            return { entitled: true, basis: "disclosure.audiences" };
        }
        if (isNonEmptyString(r.role) && Array.isArray(disclosure.roles) && disclosure.roles.includes(r.role)) {
            return { entitled: true, basis: "disclosure.roles" };
        }
    }
    const facetId = facet && facet["@id"];
    if (isNonEmptyString(facetId) && isNonEmptyString(r.audience)) {
        const granting = (manifest?.consents || []).some((c) => c?.facetRef === facetId && c?.value === "allowed" && c?.audience?.match === r.audience);
        if (granting)
            return { entitled: true, basis: "consent.audience.match" };
    }
    return { entitled: false, basis: disclosure ? "no-matching-rule" : "no-disclosure-policy" };
}
export function projectForReceiver(sourceManifest, receiver, options = {}) {
    const src = sourceManifest || {};
    const rcv = receiver || {};
    const requests = new Set(Array.isArray(rcv.requests) ? rcv.requests : []);
    const facets = Array.isArray(src.facets) ? src.facets : [];
    const projectedFacets = [];
    const projectedFacetIds = new Set();
    const projectedNames = [];
    const withheld = [];
    for (const facet of facets) {
        const { entitled, basis } = facetEntitlement(facet, rcv, src);
        if (entitled) {
            projectedFacets.push(facet);
            if (isNonEmptyString(facet["@id"]))
                projectedFacetIds.add(facet["@id"]);
            if (isNonEmptyString(facet.name))
                projectedNames.push(facet.name);
        }
        else if (isNonEmptyString(facet.name) && requests.has(facet.name)) {
            withheld.push({
                ...(isNonEmptyString(facet["@id"]) ? { facetId: facet["@id"] } : {}),
                name: facet.name,
                status: "not-projected",
                basis,
                reason: "withheld from this receiver — not projected (not diagnostics of absence; Base §3.3.1)",
            });
        }
    }
    const sourceNames = new Set(facets.map((f) => f?.name).filter(isNonEmptyString));
    for (const requested of requests) {
        if (!sourceNames.has(requested) && !withheld.some((w) => w.name === requested)) {
            withheld.push({
                name: requested,
                status: "not-projected",
                basis: "not-in-source",
                reason: "not projected (not diagnostics of absence; Base §3.3.1)",
            });
        }
    }
    const consents = (Array.isArray(src.consents) ? src.consents : []).filter((c) => {
        if (!projectedFacetIds.has(c?.facetRef))
            return false;
        if (isNonEmptyString(rcv.audience) && c?.audience?.match !== undefined) {
            return c.audience.match === rcv.audience;
        }
        return true;
    });
    const includeClaims = options.includeClaims !== false;
    const includePointers = options.includePointers !== false;
    const projectedClaims = includeClaims
        ? (Array.isArray(src.claims) ? src.claims : []).filter((c) => c && typeof c.disclosure === "object" ? facetEntitlement(c, rcv, src).entitled : true)
        : [];
    const projectedPointers = includePointers
        ? (Array.isArray(src.pointers) ? src.pointers : []).filter((p) => p && typeof p.disclosure === "object" ? facetEntitlement(p, rcv, src).entitled : true)
        : [];
    const projectedManifest = {};
    for (const [k, v] of Object.entries(src)) {
        if (k === "facets" || k === "consents" || k === "claims" || k === "pointers" || k === "signature")
            continue;
        projectedManifest[k] = v;
    }
    projectedManifest.facets = projectedFacets.map((f) => {
        if (f && typeof f === "object" && "disclosure" in f) {
            const { disclosure: _omit, ...rest } = f;
            return rest;
        }
        return f;
    });
    if (consents.length > 0)
        projectedManifest.consents = consents;
    if (projectedClaims.length > 0)
        projectedManifest.claims = projectedClaims;
    if (projectedPointers.length > 0)
        projectedManifest.pointers = projectedPointers;
    return {
        projectedManifest,
        disclosure: {
            receiver: { audience: rcv.audience, role: rcv.role },
            projectedFacets: projectedNames,
            withheldFacets: withheld,
            projectedFacetCount: projectedFacets.length,
            withheldFacetCount: withheld.length,
            resigningRequired: true,
        },
    };
}
export function recordClaimStatus(claim, ctx = {}) {
    const manifestTier = ctx.manifestTier ?? TRUST_TIER_DEFAULT;
    const maxSupportedTrustTier = ctx.maxSupportedTrustTier ?? TRUST_TIER_DEFAULT;
    const holderBindingStatusOf = typeof ctx.holderBindingStatusOf === "function" ? ctx.holderBindingStatusOf : defaultHolderBindingStatusOf;
    const claimRef = claimRefOf(claim);
    const itemTier = effectiveFloor(manifestTier, claim?.requiredTrustTier);
    const bindingStatus = holderBindingStatusOf(claim);
    const cap = capTier({ requiredTier: itemTier, maxSupportedTrustTier, bindingStatus });
    if (cap.path === "unsupported") {
        return {
            entry: {
                claimRef,
                status: "trustTierUnsupported",
                tier: cap.tier,
                reason: `claim requiredTrustTier ${itemTier} exceeds evaluator capability ${maxSupportedTrustTier} (Section 6.4.5)`,
            },
        };
    }
    if (cap.path === "capped") {
        return {
            entry: {
                claimRef,
                status: "trustTierUnsupported",
                tier: 0,
                reason: "claim relied upon at Tier 1+ carries no holderBinding — capped at Tier 0 (EXT-T1 Section T1.1)",
            },
            holderBindingStatus: cap.holderBindingStatus ?? BINDING_ABSENT,
            effectiveTrustTier: 0,
        };
    }
    const types = typeSet(claim);
    const recognized = types.some((t) => RECOGNIZED_CLAIM_TYPES.has(t));
    if (!recognized) {
        return {
            entry: {
                claimRef,
                status: "unprocessable",
                tier: 0,
                reason: "unrecognized claim @type — present but unverifiable above Tier 0 (Section 1.4.3)",
            },
        };
    }
    return {
        entry: {
            claimRef,
            status: "unverified",
            tier: 0,
            reason: "claim-validation verification chain not executed by this evaluator (EXT-T1 Section T1.5.1)",
        },
    };
}
export function projectStageReceipt(manifest, context = {}) {
    const m = manifest || {};
    const manifestTier = m.requiredTrustTier ?? TRUST_TIER_DEFAULT;
    const maxSupportedTrustTier = context.maxSupportedTrustTier ?? TRUST_TIER_DEFAULT;
    const claimCtx = {
        manifestTier,
        maxSupportedTrustTier,
        holderBindingStatusOf: context.holderBindingStatusOf,
    };
    const claimStatuses = [];
    let holderBindingStatus;
    let effectiveTrustTier;
    if (Array.isArray(m.claims)) {
        for (const claim of m.claims) {
            const rec = recordClaimStatus(claim, claimCtx);
            claimStatuses.push(rec.entry);
            if (rec.holderBindingStatus !== undefined)
                holderBindingStatus = rec.holderBindingStatus;
            if (rec.effectiveTrustTier !== undefined)
                effectiveTrustTier = rec.effectiveTrustTier;
        }
    }
    const unprocessedEntries = [];
    if (Array.isArray(m.pointers)) {
        for (const pointer of m.pointers) {
            const types = typeSet(pointer);
            if (types.some((t) => RECOGNIZED_POINTER_TYPES.has(t)))
                continue;
            const type = types[0] ?? (typeof pointer?.["@type"] === "string" ? pointer["@type"] : undefined);
            unprocessedEntries.push({
                kind: "pointer",
                type,
                ...(isNonEmptyString(pointer?.target) ? { ref: pointer.target } : {}),
            });
        }
    }
    const facetStatuses = [];
    for (const facet of Array.isArray(m.facets) ? m.facets : []) {
        facetStatuses.push({
            facetId: facet?.["@id"],
            ...(isNonEmptyString(facet?.name) ? { name: facet.name } : {}),
            status: "processed",
        });
    }
    for (const np of Array.isArray(context.notProjected) ? context.notProjected : []) {
        facetStatuses.push({
            ...(np.facetId !== undefined ? { facetId: np.facetId } : {}),
            ...(isNonEmptyString(np.name) ? { name: np.name } : {}),
            status: "not-projected",
            ...(np.reason ? { reason: np.reason } : {}),
        });
    }
    const hasFailed = facetStatuses.some((f) => f.status === "consent-denied" || f.status === "trustTierUnsupported" || f.status === "assuranceInsufficient");
    const hasAssuranceInsufficient = facetStatuses.some((f) => f.status === "assuranceInsufficient");
    const hasProcessed = facetStatuses.some((f) => f.status === "processed" || f.status === "written");
    const hasSealed = facetStatuses.some((f) => f.status === "opaque" || f.status === "consent-missing");
    const hasUnsupportedClaim = claimStatuses.some((c) => c.status === "trustTierUnsupported");
    let outcome = "accepted";
    if (hasAssuranceInsufficient && !hasProcessed)
        outcome = "rejected";
    else if (hasFailed)
        outcome = "accepted-partial";
    else if (hasSealed)
        outcome = "accepted-partial";
    else if (hasUnsupportedClaim)
        outcome = "accepted-partial";
    return {
        verdict: outcome,
        outcome,
        facetStatuses,
        ...(claimStatuses.length > 0 ? { claimStatuses } : {}),
        ...(unprocessedEntries.length > 0 ? { unprocessedEntries } : {}),
        ...(holderBindingStatus !== undefined ? { holderBindingStatus } : {}),
        ...(effectiveTrustTier !== undefined ? { effectiveTrustTier } : {}),
        ...(context.omitProcessedAt ? {} : { processedAt: new Date().toISOString() }),
    };
}
export const feature_FIXTURE_FILENAMES = Object.freeze([
    "valid/claim-unrecognized-type.jsonld",
    "valid/pointer-unrecognized-type.jsonld",
]);
export async function featureFixtureHandler(fixtureJson, expectedEntry = {}) {
    const ctx = { ...(expectedEntry.evaluationContext || {}) };
    const fragment = projectStageReceipt(fixtureJson, ctx);
    const result = fragment.outcome === "rejected" ? "reject" : "accept";
    return {
        result,
        reason: `project-stage outcome ${fragment.outcome}`,
        receipt: fragment,
    };
}
export function registerWo123(registry) {
    if (!registry || typeof registry.register !== "function") {
        throw new Error("registerWo123: registry with a register(filename, handler) function required");
    }
    for (const filename of feature_FIXTURE_FILENAMES) {
        registry.register(filename, featureFixtureHandler);
    }
    return feature_FIXTURE_FILENAMES.length;
}
export function buildThreeViewDemo() {
    const subject = "did:peer:2.Ez6LDemoUniversalManifestSubject";
    const serviceDid = "did:web:warehouse.example.com:services:inventory";
    const auditRole = "compliance-auditor";
    const source = {
        "@context": "https://universalmanifest.net/ns/v0.4",
        "@id": "urn:uuid:0c123000-0000-4000-8000-000000000123",
        "@type": "um:Manifest",
        manifestVersion: "0.4",
        subject,
        issuedAt: "2026-06-01T00:00:00.000Z",
        expiresAt: "2030-06-01T00:00:00.000Z",
        facets: [
            {
                "@id": "urn:um:facet:demo:persona",
                "@type": ["um:Facet", "rp1:Persona"],
                name: "persona",
                entity: { displayName: "Kai_Nomad", entityType: "human", contentRating: "G" },
                disclosure: { public: true },
            },
            {
                "@id": "urn:um:facet:demo:serviceAuth",
                "@type": ["um:Facet", "rp1:ServiceAuth"],
                name: "serviceAuth",
                entity: { issuedForService: serviceDid, scope: ["som.read:/factory/floor-2/**"] },
                disclosure: { audiences: [serviceDid] },
            },
            {
                "@id": "urn:um:facet:demo:location",
                "@type": ["um:Facet", "rp1:Location"],
                name: "location",
                entity: { zone: "/factory/floor-2", precision: "zone" },
                disclosure: { audiences: [serviceDid], roles: [auditRole] },
            },
            {
                "@id": "urn:um:facet:demo:govId",
                "@type": ["um:Facet", "rp1:GovernmentId"],
                name: "govId",
                entity: { docType: "passport", country: "NZ" },
                disclosure: { roles: [auditRole] },
            },
        ],
    };
    const allNames = ["persona", "serviceAuth", "location", "govId"];
    const service = projectForReceiver(source, { audience: serviceDid, role: "service", requests: allNames });
    const peer = projectForReceiver(source, { audience: "did:peer:2.Ez6LCopresentBystander", role: "peer", requests: allNames });
    const auditor = projectForReceiver(source, { audience: "did:web:warehouse.example.com:review", role: auditRole, requests: allNames });
    return { source, views: { service, peer, auditor } };
}
export const feature_PROJECTION = Object.freeze({
    wo: "runtime",
    standard: "Universal Manifest v0.4 Base — Stage-3 Project / bounded selective minimum disclosure " +
        "(CONFORMANCE §1/§2 items 1&6; Base §3.1 stage 3, §3.3.1 status set incl. not-projected; " +
        "Sections 1.4.3 claims / 1.4.5 pointers; RP1 service-encounter binding chain)",
    fixtures_owned: 2,
    page_bars: Object.freeze(["portaling P7", "portaling P13", "RP1 R3"]),
    implements: Object.freeze([
        "receiver-role projection: per-receiver projected manifest, entitled facets only",
        "fail-closed withholding (unclear entitlement => withhold) + non-leaking not-projected records",
        "data-driven entitlement: facet `disclosure` policy + consent audience.match (rules travel as data, P13)",
        "unrecognized claim @type => `unprocessable` in claimStatuses (Section 1.4.3)",
        "unrecognized pointer @type => receipt `unprocessedEntries`, not acted on (Section 1.4.5)",
        "requirement→projection binding chain (sessionNonce + requirement/contentTrust manifest hashes)",
        "one-envelope-three-views demo surface (RP1 R3 / P7 / P13)",
    ]),
    does_not_implement: Object.freeze([
        "signature/freshness verification (runtime/119) — this stage assumes Verify already ran; sets no signatureCheck",
        "consent VALUE evaluation on projected facets — a projected facet defaults to `processed`",
        "encrypted-facet sealing/opaque, assurance floors",
        "the composed six-stage um:Receipt (runtime/144) — this returns a Project-stage FRAGMENT",
        "trust-tier MATH is REUSED from runtime (not re-derived): effectiveFloor/capTier/defaultHolderBindingStatusOf",
    ]),
    fail_closed: true,
    not_projected_is_not_evidence_of_absence: true,
    binding_chain_hash_covers_signature: true,
    um_conformance_claimed: false,
    scope_boundary: "Stage-3 Project logic only — receiver-role projection + unrecognized-entry recording + the " +
        "requirement→projection binding chain, returned as a receipt FRAGMENT for the composing v0.4 " +
        "evaluator (runtime/144). Flips no um_conformance flag. Honesty ceiling: a projection never " +
        "leaks a facet the receiver is not entitled to; when the binding is unclear, it withholds.",
});
