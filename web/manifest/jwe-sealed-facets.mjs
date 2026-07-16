import { verifyManifestProfileA } from "../signing/um-signature-profile-a.mjs";
import { base64UrlToBytes, bytesToBase64Url, utf8Decode, utf8Encode } from "../signing/codecs.mjs";
export const JWE_ENCRYPTION_PROFILE = "jwe-inline-v1";
export const JWE_BASELINE_ALG = "ECDH-ES+A256KW";
export const JWE_BASELINE_ENC = "A256GCM";
export const JWE_REQUIRED_MEMBERS = Object.freeze(["protected", "recipients", "iv", "ciphertext", "tag"]);
export const JWE_BASELINE_PROTECTED_B64U = "eyJhbGciOiJFQ0RILUVTK0EyNTZLVyIsImVuYyI6IkEyNTZHQ00ifQ";
export const feature_CONFORMANCE = Object.freeze({
    wo: "runtime",
    standard: "Universal Manifest v0.4 Base §2.3 (JWE inline encrypted facets) + §2.4 (algorithm constraints) + §3.1.4 (sealed entry)",
    fixtures_owned: 4,
    baseline_algorithm_pair: `${JWE_BASELINE_ALG} / ${JWE_BASELINE_ENC}`,
    jwe_emit_real: true,
    jwe_decrypt_real: true,
    sealed_entry_evaluation_real: true,
    malformed_jwe_fail_closed: true,
    decrypt_failure_fail_closed: true,
    unsupported_alg_pair_sealed: true,
    q1_isolation_structural_only: true,
    key_management_demo_local: true,
    consent_engine: false,
    private_data_family: false,
    full_six_stage_evaluator: false,
    um_conformance_flag_flipped: false,
    scoped_claim: "runtime implements REAL JWE emit/decrypt for encrypted facets (ECDH-ES+A256KW / A256GCM, the Base " +
        "§2.4.1 baseline pair; RFC 7516 General JSON Serialization; AAD = protected header), the REAL " +
        "sealed-entry evaluation contract (no key ⇒ 'opaque' + accepted-partial, never rejected solely for " +
        "undecryptability), and fail-closed structural rejection of malformed JWEs. The Q1 isolation check is " +
        "Grade-1 structural — it tests JSON-Schema shape (distinct kid, distinct iv), not the cryptographic " +
        "isolation property. Demo-local static recipient keys; no KMS claims. This is the encrypted-facet " +
        "slice, not the full six-stage evaluator.",
});
function isNonEmptyString(v) {
    return typeof v === "string" && v.length > 0;
}
function isIsoDateTime(v) {
    return typeof v === "string" && Number.isFinite(Date.parse(v));
}
function subtle() {
    const s = globalThis.crypto?.subtle;
    if (!s)
        throw new Error("WebCrypto (crypto.subtle) unavailable — need Node >= 18.4 or a modern browser");
    return s;
}
function randomBytes(n) {
    const out = new Uint8Array(n);
    globalThis.crypto.getRandomValues(out);
    return out;
}
function concatBytes(parts) {
    const total = parts.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(total);
    let o = 0;
    for (const p of parts) {
        out.set(p, o);
        o += p.length;
    }
    return out;
}
function uint32be(n) {
    return Uint8Array.from([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]);
}
export function validateJweEntityShape(entity) {
    const errors = [];
    if (!entity || typeof entity !== "object" || Array.isArray(entity)) {
        return { valid: false, errors: ["entity must be a JWE General JSON Serialization object (Base 2.3.2)"] };
    }
    const missing = JWE_REQUIRED_MEMBERS.filter((m) => entity[m] === undefined);
    if (missing.length > 0) {
        errors.push(`JWE missing required member(s): ${missing.join(", ")} (all five required — Base 2.3.2 / CONFORMANCE 6.6)`);
    }
    for (const m of ["protected", "iv", "ciphertext", "tag"]) {
        if (entity[m] !== undefined && !isNonEmptyString(entity[m])) {
            errors.push(`JWE member "${m}" must be a non-empty string`);
        }
    }
    if (entity.recipients !== undefined) {
        if (!Array.isArray(entity.recipients)) {
            errors.push('JWE member "recipients" must be an array');
        }
        else {
            if (entity.recipients.length < 1) {
                errors.push('JWE member "recipients" must contain at least one recipient entry ' +
                    "(demo defense-in-depth: stricter than schema $defs.jweEntity, which sets no minItems — " +
                    "a sealed entry with zero recipients is unreadable/suspect)");
            }
            entity.recipients.forEach((r, i) => {
                if (!r || typeof r !== "object" || Array.isArray(r)) {
                    errors.push(`recipients[${i}] must be an object`);
                    return;
                }
                if (!r.header || typeof r.header !== "object" || Array.isArray(r.header)) {
                    errors.push(`recipients[${i}].header is required (schema $defs.jweEntity)`);
                }
                else if (!isNonEmptyString(r.header.kid)) {
                    errors.push(`recipients[${i}].header.kid is required and must be a non-empty string`);
                }
                if (r.encrypted_key !== undefined && typeof r.encrypted_key !== "string") {
                    errors.push(`recipients[${i}].encrypted_key must be a string when present`);
                }
            });
        }
    }
    for (const opt of ["previousKid", "rotationReason", "revokedRecipientKid", "revocationAction"]) {
        if (entity[opt] !== undefined && typeof entity[opt] !== "string") {
            errors.push(`JWE optional member "${opt}" must be a string when present`);
        }
    }
    return { valid: errors.length === 0, errors };
}
export function validateSealedFacetsStructural(manifest) {
    const errors = [];
    const encryptedFacets = [];
    const facets = manifest && Array.isArray(manifest.facets) ? manifest.facets : [];
    facets.forEach((facet, index) => {
        if (!facet || typeof facet !== "object")
            return;
        if (facet.encryptionProfile === undefined)
            return;
        const label = isNonEmptyString(facet["@id"]) ? facet["@id"] : `facets[${index}]`;
        if (facet.encryptionProfile !== JWE_ENCRYPTION_PROFILE) {
            errors.push(`${label}: encryptionProfile must be the const "${JWE_ENCRYPTION_PROFILE}" (schema $defs.facet)`);
            return;
        }
        if (facet.entity === undefined) {
            errors.push(`${label}: entity is REQUIRED when encryptionProfile is "${JWE_ENCRYPTION_PROFILE}" (schema $defs.facet conditional)`);
            return;
        }
        const shape = validateJweEntityShape(facet.entity);
        if (!shape.valid) {
            errors.push(...shape.errors.map((e) => `${label}: ${e}`));
            return;
        }
        encryptedFacets.push({ index, facetId: facet["@id"], entity: facet.entity });
    });
    return { valid: errors.length === 0, errors, encryptedFacets };
}
export function checkIsolationShape(manifest, declaredSetIds = null) {
    const errors = [];
    const { encryptedFacets, errors: shapeErrors } = validateSealedFacetsStructural(manifest);
    if (shapeErrors.length > 0) {
        errors.push(...shapeErrors);
    }
    const inSet = declaredSetIds
        ? encryptedFacets.filter((f) => declaredSetIds.includes(f.facetId))
        : encryptedFacets;
    const kidOwner = new Map();
    const ivOwner = new Map();
    for (const f of inSet) {
        for (const r of f.entity.recipients) {
            const kid = r?.header?.kid;
            if (!isNonEmptyString(kid))
                continue;
            const owner = kidOwner.get(kid);
            if (owner !== undefined && owner !== f.facetId) {
                errors.push(`isolation violation: recipients[].header.kid "${kid}" is shared by facets ${owner} and ${f.facetId} (Base 2.3.5: no shared recipient key entry)`);
            }
            else {
                kidOwner.set(kid, f.facetId);
            }
        }
        const iv = f.entity.iv;
        if (isNonEmptyString(iv)) {
            const owner = ivOwner.get(iv);
            if (owner !== undefined && owner !== f.facetId) {
                errors.push(`isolation violation: iv "${iv}" is reused by facets ${owner} and ${f.facetId} (Base 2.3.5: IV reuse under a shared CEK is catastrophic for A256GCM)`);
            }
            else {
                ivOwner.set(iv, f.facetId);
            }
        }
    }
    return {
        valid: errors.length === 0,
        errors,
        setSize: inSet.length,
        grade: "structural-shape-only",
        note: "Q1 tests JSON-Schema shape, not the cryptographic isolation property (distinct kid/iv are necessary, not sufficient — Base 2.3.5 residual gap)",
    };
}
export function decodeProtectedHeader(protectedB64u) {
    try {
        const obj = JSON.parse(utf8Decode(base64UrlToBytes(protectedB64u)));
        return obj && typeof obj === "object" && !Array.isArray(obj) ? obj : null;
    }
    catch {
        return null;
    }
}
async function concatKdfSha256(z, algorithmId, keyDataLenBits) {
    const algBytes = utf8Encode(algorithmId);
    const otherInfo = concatBytes([
        uint32be(algBytes.length),
        algBytes,
        uint32be(0),
        uint32be(0),
        uint32be(keyDataLenBits),
    ]);
    const input = concatBytes([uint32be(1), z, otherInfo]);
    const digest = new Uint8Array(await subtle().digest("SHA-256", input));
    return digest.slice(0, keyDataLenBits / 8);
}
function publicEcJwk(jwk) {
    return { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y };
}
export async function generateRecipientKeyPair(kid) {
    if (!isNonEmptyString(kid))
        throw new Error("generateRecipientKeyPair: non-empty kid required");
    const pair = await subtle().generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
    const publicJwk = publicEcJwk(await subtle().exportKey("jwk", pair.publicKey));
    return { kid, publicJwk, privateKey: pair.privateKey, publicKey: pair.publicKey };
}
async function importEcPublicJwk(jwk) {
    return subtle().importKey("jwk", publicEcJwk(jwk), { name: "ECDH", namedCurve: "P-256" }, false, []);
}
async function ecdhZ(privateKey, publicKey) {
    return new Uint8Array(await subtle().deriveBits({ name: "ECDH", public: publicKey }, privateKey, 256));
}
async function importKek(kekBytes, usages) {
    return subtle().importKey("raw", kekBytes, "AES-KW", false, usages);
}
export async function encryptJweForRecipients(entityPayload, recipients) {
    if (!Array.isArray(recipients) || recipients.length === 0) {
        throw new Error("encryptJweForRecipients: at least one recipient { kid, publicJwk } required");
    }
    const protectedB64u = JWE_BASELINE_PROTECTED_B64U;
    const aad = utf8Encode(protectedB64u);
    const iv = randomBytes(12);
    const cek = await subtle().generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
    const plaintext = utf8Encode(JSON.stringify(entityPayload));
    const sealed = new Uint8Array(await subtle().encrypt({ name: "AES-GCM", iv, additionalData: aad, tagLength: 128 }, cek, plaintext));
    const ciphertext = sealed.slice(0, sealed.length - 16);
    const tag = sealed.slice(sealed.length - 16);
    const recipientEntries = [];
    for (const r of recipients) {
        if (!isNonEmptyString(r?.kid))
            throw new Error("encryptJweForRecipients: every recipient needs a kid");
        const staticPublic = r.publicKey || (await importEcPublicJwk(r.publicJwk));
        const ephemeral = await subtle().generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
        const z = await ecdhZ(ephemeral.privateKey, staticPublic);
        const kekBytes = await concatKdfSha256(z, JWE_BASELINE_ALG, 256);
        const kek = await importKek(kekBytes, ["wrapKey"]);
        const wrapped = new Uint8Array(await subtle().wrapKey("raw", cek, kek, "AES-KW"));
        const epk = publicEcJwk(await subtle().exportKey("jwk", ephemeral.publicKey));
        recipientEntries.push({
            header: { kid: r.kid, epk },
            encrypted_key: bytesToBase64Url(wrapped),
        });
    }
    return {
        protected: protectedB64u,
        recipients: recipientEntries,
        iv: bytesToBase64Url(iv),
        ciphertext: bytesToBase64Url(ciphertext),
        tag: bytesToBase64Url(tag),
    };
}
export async function decryptJweWithKey(jweEntity, { kid, privateKey }) {
    const shape = validateJweEntityShape(jweEntity);
    if (!shape.valid)
        throw new Error(`decrypt refused — malformed JWE: ${shape.errors[0]}`);
    const header = decodeProtectedHeader(jweEntity.protected);
    if (!header)
        throw new Error("decrypt refused — protected header is not base64url JSON");
    if (header.alg !== JWE_BASELINE_ALG || header.enc !== JWE_BASELINE_ENC) {
        throw new Error(`decrypt refused — algorithm pair ${header.alg}/${header.enc} is not the supported baseline ${JWE_BASELINE_ALG}/${JWE_BASELINE_ENC} (Base 2.4.2: treat as sealed entry)`);
    }
    const recipient = jweEntity.recipients.find((r) => r?.header?.kid === kid);
    if (!recipient)
        throw new Error(`decrypt refused — no recipient entry for kid "${kid}"`);
    if (!recipient.header.epk)
        throw new Error("decrypt refused — recipient header carries no epk (ephemeral public key)");
    if (!isNonEmptyString(recipient.encrypted_key)) {
        throw new Error("decrypt refused — recipient entry carries no encrypted_key");
    }
    const epk = await importEcPublicJwk(recipient.header.epk);
    const z = await ecdhZ(privateKey, epk);
    const kekBytes = await concatKdfSha256(z, JWE_BASELINE_ALG, 256);
    const kek = await importKek(kekBytes, ["unwrapKey"]);
    const cek = await subtle().unwrapKey("raw", base64UrlToBytes(recipient.encrypted_key), kek, "AES-KW", { name: "AES-GCM" }, false, ["decrypt"]);
    const aad = utf8Encode(jweEntity.protected);
    const sealed = concatBytes([base64UrlToBytes(jweEntity.ciphertext), base64UrlToBytes(jweEntity.tag)]);
    const plaintext = new Uint8Array(await subtle().decrypt({ name: "AES-GCM", iv: base64UrlToBytes(jweEntity.iv), additionalData: aad, tagLength: 128 }, cek, sealed));
    return JSON.parse(utf8Decode(plaintext));
}
export async function makeSealedFacet({ facetId, name, entityPayload, recipients }) {
    if (!isNonEmptyString(facetId))
        throw new Error("makeSealedFacet: facetId required");
    const entity = await encryptJweForRecipients(entityPayload, recipients);
    return {
        "@id": facetId,
        "@type": "um:Facet",
        ...(isNonEmptyString(name) ? { name } : {}),
        encryptionProfile: JWE_ENCRYPTION_PROFILE,
        entity,
    };
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
    if (isIsoDateTime(manifest.issuedAt) &&
        isIsoDateTime(manifest.expiresAt) &&
        Date.parse(manifest.issuedAt) > Date.parse(manifest.expiresAt)) {
        errors.push("issuedAt must be <= expiresAt");
    }
    return errors;
}
export async function evaluateSealedFacets(manifest, keyring = []) {
    const facetStatuses = [];
    const decrypted = new Map();
    let sealedCount = 0;
    const facets = Array.isArray(manifest?.facets) ? manifest.facets : [];
    for (const facet of facets) {
        if (!facet || typeof facet !== "object" || facet.encryptionProfile !== JWE_ENCRYPTION_PROFILE)
            continue;
        const facetId = isNonEmptyString(facet["@id"]) ? facet["@id"] : "(missing @id)";
        const base = { facetId, ...(isNonEmptyString(facet.name) ? { name: facet.name } : {}) };
        const header = decodeProtectedHeader(facet.entity?.protected);
        const baselinePair = header && header.alg === JWE_BASELINE_ALG && header.enc === JWE_BASELINE_ENC;
        if (!baselinePair) {
            sealedCount += 1;
            facetStatuses.push({
                ...base,
                status: "opaque",
                reason: header
                    ? `unsupported algorithm pair ${header.alg}/${header.enc} — sealed entry (Base 2.4.2)`
                    : "unreadable protected header — sealed entry (present, not read)",
            });
            continue;
        }
        const kids = (facet.entity.recipients || []).map((r) => r?.header?.kid).filter(isNonEmptyString);
        const key = keyring.find((k) => kids.includes(k.kid));
        if (!key) {
            sealedCount += 1;
            facetStatuses.push({ ...base, status: "opaque", reason: "no decryption key" });
            continue;
        }
        try {
            const payload = await decryptJweWithKey(facet.entity, key);
            decrypted.set(facetId, payload);
            facetStatuses.push({ ...base, status: "processed" });
        }
        catch (e) {
            sealedCount += 1;
            facetStatuses.push({
                ...base,
                status: "opaque",
                reason: `decryption failed — fail closed (present, not read): ${e.message}`,
            });
        }
    }
    return { facetStatuses, decrypted, sealedCount };
}
export async function structuralVerdictWo132(manifest, opts = {}) {
    const reasons = [];
    reasons.push(...envelopeErrors(manifest));
    const sealed = validateSealedFacetsStructural(manifest);
    reasons.push(...sealed.errors);
    let isolation = null;
    if (sealed.valid && sealed.encryptedFacets.length >= 2) {
        isolation = checkIsolationShape(manifest, opts.declaredSetIds ?? null);
        reasons.push(...isolation.errors);
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
        checks: {
            encryptedFacets: sealed.encryptedFacets.length,
            isolation: isolation ? { valid: isolation.valid, grade: isolation.grade } : "n/a (fewer than 2 encrypted facets)",
            signature: sigReport ? sigReport.reason : "not-evaluated",
        },
    };
}
export async function evaluateWo132(manifest, context = {}) {
    const nowMs = isIsoDateTime(context.now) ? Date.parse(context.now) : Date.now();
    const manifestId = manifest && typeof manifest === "object" && isNonEmptyString(manifest["@id"]) ? manifest["@id"] : "(unknown)";
    const warnings = [];
    const receipt = {
        "@type": "um:Receipt",
        manifestId,
        outcome: "rejected",
        signatureCheck: "not-evaluated",
        freshnessCheck: "not-evaluated",
        revocationStatus: "unchecked",
        facetStatuses: [],
        warnings,
    };
    if (!context.omitProcessedAt)
        receipt.processedAt = new Date(nowMs).toISOString();
    const finish = (outcome) => {
        receipt.outcome = outcome;
        return { result: outcome === "rejected" ? "reject" : "accept", receipt, decrypted: receipt._decrypted || new Map() };
    };
    const envErrors = envelopeErrors(manifest);
    const sealedShape = envErrors.length === 0 ? validateSealedFacetsStructural(manifest) : { errors: [] };
    if (envErrors.length > 0 || sealedShape.errors.length > 0) {
        warnings.push({
            code: "um:reason:structure:malformed",
            message: `Arrive stage: ${[...envErrors, ...sealedShape.errors].join("; ")}`,
        });
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
        warnings.push({
            code: sigReport.reason === "unsupported-profile"
                ? "um:reason:crypto:unsupported-profile"
                : "um:reason:crypto:signature-invalid",
            message: `Verify stage: ${sigReport.reason}`,
        });
        return finish("rejected");
    }
    receipt.signatureCheck = "valid";
    const SKEW_MS = 60_000;
    if (Date.parse(manifest.issuedAt) - nowMs > SKEW_MS) {
        receipt.freshnessCheck = "stale";
        warnings.push({ code: "um:reason:freshness:stale", message: "Verify stage: issuedAt more than 60s in the future" });
        return finish("rejected");
    }
    if (nowMs > Date.parse(manifest.expiresAt)) {
        receipt.freshnessCheck = "expired";
        warnings.push({ code: "um:reason:freshness:expired", message: "Verify stage: manifest expired" });
        return finish("rejected");
    }
    receipt.freshnessCheck = "fresh";
    const evalOut = await evaluateSealedFacets(manifest, context.decryptionKeys || []);
    receipt.facetStatuses = evalOut.facetStatuses;
    Object.defineProperty(receipt, "_decrypted", { value: evalOut.decrypted, enumerable: false });
    const hasSealed = evalOut.sealedCount > 0;
    if (hasSealed)
        return finish("accepted-partial");
    if (warnings.length > 0)
        return finish("accepted-with-warnings");
    return finish("accepted");
}
export const P6_GOVERNMENT_ID_FACET = Object.freeze({
    facetId: "urn:um:facet:government-id",
    name: "governmentId",
    label: "government ID",
    kid: "did:web:demo.local:civic-registry#key-agree-gov-id-1",
});
export const P6_BIRTH_DATE_FACET = Object.freeze({
    facetId: "urn:um:facet:full-birth-date",
    name: "fullBirthDate",
    label: "full birth date",
    kid: "did:web:demo.local:records-office#key-agree-birth-1",
});
export async function buildSealedCrossingFacets(opts = {}) {
    const govRecipient = await generateRecipientKeyPair(P6_GOVERNMENT_ID_FACET.kid);
    const birthRecipient = await generateRecipientKeyPair(P6_BIRTH_DATE_FACET.kid);
    const govFacet = await makeSealedFacet({
        facetId: P6_GOVERNMENT_ID_FACET.facetId,
        name: P6_GOVERNMENT_ID_FACET.name,
        entityPayload: {
            "@type": "um:Entity",
            documentType: "government-id",
            idNumber: opts.idNumber || "DEMO-ID-4711-0042",
            issuingAuthority: "Demo Civic Registry (fictional)",
            note: "fictional demo payload — no real PII",
        },
        recipients: [govRecipient],
    });
    const birthFacet = await makeSealedFacet({
        facetId: P6_BIRTH_DATE_FACET.facetId,
        name: P6_BIRTH_DATE_FACET.name,
        entityPayload: {
            "@type": "um:Entity",
            documentType: "birth-record",
            fullBirthDate: opts.fullBirthDate || "1990-04-12",
            note: "fictional demo payload — no real PII",
        },
        recipients: [birthRecipient],
    });
    return {
        facets: [govFacet, birthFacet],
        holderKeys: [
            { kid: govRecipient.kid, privateKey: govRecipient.privateKey },
            { kid: birthRecipient.kid, privateKey: birthRecipient.privateKey },
        ],
        isolationNote: "distinct recipients[].header.kid + distinct iv per facet (Q1 shape — structural; " +
            "the demo's recipient keys are independently generated P-256 pairs, but the manifest " +
            "bytes attest only the shape, not the key-custody property)",
    };
}
export function p6ReceiptRows(facetStatuses) {
    const labelFor = (fs) => {
        if (fs.facetId === P6_GOVERNMENT_ID_FACET.facetId)
            return P6_GOVERNMENT_ID_FACET.label;
        if (fs.facetId === P6_BIRTH_DATE_FACET.facetId)
            return P6_BIRTH_DATE_FACET.label;
        return fs.name || fs.facetId;
    };
    return (facetStatuses || [])
        .filter((fs) => fs.status === "opaque" || fs.status === "processed")
        .map((fs) => ({
        row: `facet / ${labelFor(fs)}`,
        entry: fs.status === "opaque" ? "sealed entry" : "decrypted (holder key)",
        status: fs.status,
        display: `facet / ${labelFor(fs)} → ${fs.status === "opaque" ? "sealed entry / opaque" : "decrypted / processed"}`,
    }));
}
export async function demoSealedFacetSurface() {
    const { facets, holderKeys, isolationNote } = await buildSealedCrossingFacets();
    const manifestish = { facets };
    const noKeys = await evaluateSealedFacets(manifestish, []);
    const rows = p6ReceiptRows(noKeys.facetStatuses);
    const withKeys = await evaluateSealedFacets(manifestish, holderKeys);
    const roundTrip = withKeys.facetStatuses.every((fs) => fs.status === "processed");
    return {
        standard: "Universal Manifest v0.4 Base 2.3 (JWE inline) / 3.1.4 (sealed entry)",
        algorithm_pair: `${JWE_BASELINE_ALG} / ${JWE_BASELINE_ENC} (Base 2.4.1 baseline)`,
        facets,
        receipt_rows: rows,
        sealed_entry_outcome: "accepted-partial",
        holder_round_trip_ok: roundTrip,
        isolation: { grade: "structural-shape-only", note: isolationNote },
        um_conformance_claimed: false,
        note: "runtime sealed-facet surface: REAL JWE crypto (emit + holder decrypt), sealed-entry evaluation " +
            "(opaque, accepted-partial). Q1 isolation is Grade-1 structural. NOT full evaluator conformance.",
    };
}
export const feature_FIXTURE_FILENAMES = Object.freeze([
    "valid/manifest-with-encrypted-facet.jsonld",
    "valid/manifest-with-isolated-facets.jsonld",
    "valid/encrypted-facet-sealed-entry.jsonld",
    "invalid/encrypted-facet-malformed-jwe.jsonld",
]);
export async function featureFixtureHandler(fixtureJson, expectedEntry = {}) {
    if (expectedEntry.validationMode === "evaluation") {
        const { result, receipt } = await evaluateWo132(fixtureJson, expectedEntry.evaluationContext || {});
        return {
            result,
            reason: receipt.warnings?.[0]?.message || receipt.outcome,
            receipt,
        };
    }
    const verdict = await structuralVerdictWo132(fixtureJson);
    return { result: verdict.result, reason: verdict.reasons.join("; ") || "structural contract satisfied" };
}
export function registerWo132(registry) {
    if (!registry || typeof registry.register !== "function") {
        throw new Error("registerWo132: registry with a register(filename, handler) function required");
    }
    for (const filename of feature_FIXTURE_FILENAMES) {
        registry.register(filename, featureFixtureHandler);
    }
    return feature_FIXTURE_FILENAMES.length;
}
