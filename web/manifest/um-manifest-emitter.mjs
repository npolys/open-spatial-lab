import { UM_V04_CONTEXT, UM_V04_MANIFEST_VERSION, UM_FACET_TYPE, UM_ENTITY_TYPE, makeAvatarDefinition, validateAvatarDefinition, makeLoadingPointer, validateLoadingPointer, } from "./interfaces.mjs";
import { buildRp1Section } from "./rp1-model.mjs";
import { jcsCanonicalizeToBytes } from "../signing/jcs-rfc8785.mjs";
import { findUnsafeNumber } from "../signing/ijson.mjs";
import { generateKeyPair, signBytes, verifyBytes, derivePublicKeyRaw, rawPublicKeyToSpki, bytesToBase64, bytesToBase64Url, } from "../signing/ed25519.mjs";
import { publicKeyToDidKey } from "../signing/did.mjs";
import { verifyManifestProfileA } from "../signing/um-signature-profile-a.mjs";
export const UM_MANIFEST_EMITTER_VERSION = "runtime-v1";
const SIGNING_INPUT_ALWAYS_EXCLUDED = ["signature"];
const SIGNING_INPUT_V04_EXCLUDED = ["presentationProof", "postQuantumSignature"];
export const UM_MANIFEST_EMISSION = Object.freeze({
    standard: "Universal Manifest v0.4 (Base / Tier-0)",
    context: UM_V04_CONTEXT,
    manifestVersion: UM_V04_MANIFEST_VERSION,
    schema_valid_v04: true,
    signature_profile: "A (Ed25519 + JCS-RFC8785)",
    signed: true,
    evaluator_conformance: false,
    live_signing_wired: true,
    full_conformance: false,
    scope_boundary: "Universal Manifest v0.4 manifest — SCHEMA-VALID emission (structural, ajv Draft 2020-12) " +
        "signed under Signature Profile A (Ed25519 + JCS-RFC8785, runtime crypto), live-wired into " +
        "the crossing (runtime: sign on exit, verify on arrival, did:key subject binding); NOT " +
        "evaluator conformance (six-stage receipt = runtime). um_conformance stays false " +
        "(signing != conformance).",
});
export function buildManifest(state) {
    const s = state && typeof state === "object" ? state : {};
    const issuedAt = isoOrNow(s.issuedAt);
    const ttl = Number.isFinite(Number(s.ttlSeconds)) ? Number(s.ttlSeconds) : 3600;
    const expiresAt = new Date(Date.parse(issuedAt) + ttl * 1000).toISOString();
    const continuityId = s.continuityId != null ? String(s.continuityId) : null;
    const subject = deriveSubject(s.subject, continuityId);
    const manifestId = s.id != null ? String(s.id) : deriveManifestId(continuityId, s.handoffId);
    const keyRef = s.keyRef != null ? String(s.keyRef) : `${subject}#keys-1`;
    const manifest = {
        "@context": UM_V04_CONTEXT,
        "@id": manifestId,
        "@type": "um:Manifest",
        manifestVersion: UM_V04_MANIFEST_VERSION,
        subject,
        issuedAt,
        expiresAt,
    };
    const facets = [];
    if (s.avatar) {
        const def = looksLikeAvatarDefinition(s.avatar) ? s.avatar : makeAvatarDefinition(s.avatar);
        const check = validateAvatarDefinition(def);
        if (check.valid) {
            facets.push(avatarFacetFromDefinition(def));
        }
    }
    const continuityFacet = continuityFacetFrom(s, continuityId);
    if (continuityFacet)
        facets.push(continuityFacet);
    if (facets.length > 0)
        manifest.facets = facets;
    const pointers = [];
    if (s.loading) {
        const ptr = looksLikeLoadingPointer(s.loading) ? s.loading : makeLoadingPointer(s.loading);
        const check = validateLoadingPointer(ptr);
        if (check.valid) {
            pointers.push(loadingPointerFromInterface(ptr, expiresAt));
        }
    }
    if (Array.isArray(s.loadingPointers)) {
        for (const raw of s.loadingPointers) {
            if (!raw)
                continue;
            const ptr = looksLikeLoadingPointer(raw) ? raw : makeLoadingPointer(raw);
            const check = validateLoadingPointer(ptr);
            if (check.valid) {
                pointers.push(loadingPointerFromInterface(ptr, expiresAt));
            }
        }
    }
    if (pointers.length > 0)
        manifest.pointers = pointers;
    if (s.rp1 && typeof s.rp1 === "object") {
        const rp1Opts = {
            issuedAt,
            ttlSeconds: ttl,
            ...(s.rp1Options && typeof s.rp1Options === "object" ? s.rp1Options : {}),
        };
        const rp1 = buildRp1Section(s.rp1, rp1Opts);
        if (rp1) {
            if (Array.isArray(rp1.facets) && rp1.facets.length > 0) {
                manifest.facets = [...(manifest.facets || []), ...rp1.facets];
            }
            if (Array.isArray(rp1.pointers) && rp1.pointers.length > 0) {
                manifest.pointers = [...(manifest.pointers || []), ...rp1.pointers];
            }
            if (Array.isArray(rp1.consents) && rp1.consents.length > 0) {
                manifest.consents = [...(manifest.consents || []), ...rp1.consents];
            }
        }
    }
    manifest.signature = {
        algorithm: "Ed25519",
        canonicalization: "JCS-RFC8785",
        keyRef,
    };
    return manifest;
}
export async function buildAndSignManifest(state, options = {}) {
    if (options.sign === false) {
        return { manifest: buildManifest(state), signed: false, keyPair: null, signingInputBytes: null, didKey: null };
    }
    const keyPair = options.keyPair || (await generateKeyPair());
    const privateKeyInput = pickPrivateKeyInput(keyPair);
    let didKey = null;
    const buildState = state && typeof state === "object" ? { ...state } : {};
    if (options.bindDidSubject === true) {
        const rawPublicKey = await derivePublicKeyRaw(privateKeyInput);
        didKey = publicKeyToDidKey(rawPublicKey);
        buildState.keyRef = `${didKey}#${didKey.slice("did:key:".length)}`;
        if (buildState.subject == null || String(buildState.subject).length === 0) {
            buildState.subject = didKey;
        }
    }
    const manifest = buildManifest(buildState);
    if (typeof manifest.manifestVersion !== "string") {
        throw new Error("refusing to sign: manifestVersion must be a string (signing-input exclusion gate)");
    }
    const signingInput = stripForSigning(manifest);
    const unsafeNumber = findUnsafeNumber(signingInput);
    if (unsafeNumber) {
        throw new Error(`refusing to sign: number ${unsafeNumber.value} at ${unsafeNumber.path} is outside the ` +
            "I-JSON safe range ±(2^53-1); represent big numbers as strings (RFC 8785 Appendix D)");
    }
    const signingInputBytes = jcsCanonicalizeToBytes(signingInput);
    const sigBytes = await signBytes(signingInputBytes, privateKeyInput);
    const publicKeySpki = await resolvePublicKeySpki(keyPair);
    manifest.signature = {
        algorithm: "Ed25519",
        canonicalization: "JCS-RFC8785",
        keyRef: manifest.signature.keyRef,
        created: manifest.issuedAt,
        publicKeySpkiB64: bytesToBase64(publicKeySpki),
        value: bytesToBase64Url(sigBytes),
    };
    return { manifest, signed: true, keyPair, signingInputBytes, didKey };
}
export async function verifyManifestSignature(manifest) {
    if (!manifest || typeof manifest !== "object" || !manifest.signature)
        return false;
    const sig = manifest.signature;
    if (sig.algorithm !== "Ed25519" || sig.canonicalization !== "JCS-RFC8785")
        return false;
    if (typeof sig.value !== "string" || typeof sig.publicKeySpkiB64 !== "string")
        return false;
    if (Object.prototype.hasOwnProperty.call(manifest, "manifestVersion") &&
        typeof manifest.manifestVersion !== "string") {
        return false;
    }
    if (findUnsafeNumber(stripForSigning(manifest)))
        return false;
    const signingInput = stripForSigning(manifest);
    const signingInputBytes = jcsCanonicalizeToBytes(signingInput);
    try {
        return await verifyBytes(signingInputBytes, sig.value, sig.publicKeySpkiB64);
    }
    catch {
        return false;
    }
}
export async function verifyManifestSignatureDetailed(manifest) {
    if (!manifest || typeof manifest !== "object" || !manifest.signature) {
        return { ok: false, reason: "missing-signature", checks: {} };
    }
    try {
        return await verifyManifestProfileA(manifest);
    }
    catch (e) {
        return { ok: false, reason: `verify-threw:${(e && e.message) || "error"}`, checks: {} };
    }
}
function avatarFacetFromDefinition(def) {
    const facet = {
        "@id": urnFacetId("avatar", def.avatarId),
        "@type": UM_FACET_TYPE,
        name: "avatar",
    };
    const entity = {
        "@id": urnEntityId("avatar", def.avatarId),
        "@type": [UM_ENTITY_TYPE, "um:Avatar"],
        avatarId: def.avatarId,
        variant: def.variant,
    };
    if (def.displayName != null)
        entity.displayName = def.displayName;
    if (def.equipmentProfile != null)
        entity.equipmentProfile = def.equipmentProfile;
    if (Array.isArray(def.equippedItems) && def.equippedItems.length > 0) {
        entity.equippedItems = def.equippedItems;
    }
    if (def.poseRef != null)
        entity.poseRef = def.poseRef;
    facet.entity = entity;
    if (isTier(def.requiredTrustTier))
        facet.requiredTrustTier = def.requiredTrustTier;
    return facet;
}
function continuityFacetFrom(s, continuityId) {
    const hasAny = continuityId != null || s.handoffId != null || s.sourceLocationId != null || s.targetLocationId != null;
    if (!hasAny)
        return null;
    const facet = {
        "@id": urnFacetId("continuity", continuityId || s.handoffId || "crossing"),
        "@type": UM_FACET_TYPE,
        name: "continuity",
        entity: {
            "@id": urnEntityId("continuity", continuityId || s.handoffId || "crossing"),
            "@type": [UM_ENTITY_TYPE, "um:Continuity"],
        },
    };
    const body = facet.entity;
    if (continuityId != null)
        body.continuityId = String(continuityId);
    if (s.handoffId != null)
        body.handoffId = String(s.handoffId);
    if (s.sourceLocationId != null)
        body.sourceLocationId = String(s.sourceLocationId);
    if (s.targetLocationId != null)
        body.targetLocationId = String(s.targetLocationId);
    return facet;
}
function loadingPointerFromInterface(ptr, manifestExpiresAt) {
    const out = { "@type": ptr.pointerType };
    if (ptr.pointerId != null)
        out["@id"] = urnPointerId("loading", ptr.pointerId);
    if (ptr.target != null)
        out.target = ptr.target;
    if (ptr.label != null)
        out.label = ptr.label;
    out.expiresAt = ptr.expiresAt != null ? ptr.expiresAt : manifestExpiresAt;
    return out;
}
function stripForSigning(manifest) {
    const excluded = typeof manifest.manifestVersion === "string" && manifest.manifestVersion === "0.4"
        ? [...SIGNING_INPUT_ALWAYS_EXCLUDED, ...SIGNING_INPUT_V04_EXCLUDED]
        : SIGNING_INPUT_ALWAYS_EXCLUDED;
    const copy = {};
    for (const [k, v] of Object.entries(manifest)) {
        if (excluded.includes(k))
            continue;
        copy[k] = v;
    }
    return copy;
}
function pickPrivateKeyInput(keyPair) {
    if (!keyPair)
        throw new Error("no signing key provided");
    if (keyPair.privateKey)
        return keyPair.privateKey;
    if (keyPair.seed)
        return keyPair.seed;
    return keyPair;
}
async function resolvePublicKeySpki(keyPair) {
    if (keyPair && keyPair.publicKeySpki instanceof Uint8Array)
        return keyPair.publicKeySpki;
    if (keyPair && keyPair.rawPublicKey instanceof Uint8Array) {
        return rawPublicKeyToSpki(keyPair.rawPublicKey);
    }
    const raw = await derivePublicKeyRaw(pickPrivateKeyInput(keyPair));
    return rawPublicKeyToSpki(raw);
}
function deriveSubject(explicit, continuityId) {
    if (explicit != null && String(explicit).length > 0)
        return String(explicit);
    const slug = slugify(continuityId || "anon");
    return `did:web:demo.local:user:${slug}`;
}
function deriveManifestId(continuityId, handoffId) {
    const seed = `${continuityId || ""}:${handoffId || ""}`;
    if (seed === ":")
        return `urn:uuid:${randomUuidV4()}`;
    return `urn:uuid:${uuidV4FromSeed(seed)}`;
}
function urnFacetId(kind, id) {
    return `urn:um:facet:${kind}:${slugify(id)}`;
}
function urnEntityId(kind, id) {
    return `urn:um:entity:${kind}:${slugify(id)}`;
}
function urnPointerId(kind, id) {
    return `urn:um:pointer:${kind}:${slugify(id)}`;
}
function slugify(v) {
    return String(v == null ? "anon" : v)
        .replace(/[^A-Za-z0-9._-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 64) || "anon";
}
function isoOrNow(v) {
    if (typeof v === "string" && Number.isFinite(Date.parse(v)))
        return new Date(Date.parse(v)).toISOString();
    return new Date().toISOString();
}
function isTier(v) {
    return Number.isInteger(v) && v >= 0 && v <= 3;
}
function looksLikeAvatarDefinition(v) {
    return v && typeof v === "object" && "avatarId" in v && "variant" in v;
}
function looksLikeLoadingPointer(v) {
    return v && typeof v === "object" && "pointerType" in v;
}
function randomUuidV4() {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
        return globalThis.crypto.randomUUID();
    }
    const b = new Uint8Array(16);
    if (globalThis.crypto && globalThis.crypto.getRandomValues)
        globalThis.crypto.getRandomValues(b);
    else
        for (let i = 0; i < 16; i++)
            b[i] = Math.floor(Math.random() * 256);
    return uuidFromBytes(b);
}
function uuidV4FromSeed(seed) {
    const bytes = new Uint8Array(16);
    let h = 0x811c9dc5;
    for (let i = 0; i < 16; i++) {
        for (let j = 0; j < seed.length; j++) {
            h ^= seed.charCodeAt(j);
            h = Math.imul(h, 0x01000193) >>> 0;
        }
        h = Math.imul(h ^ (i + 0x9e3779b9), 0x01000193) >>> 0;
        bytes[i] = h & 0xff;
    }
    return uuidFromBytes(bytes);
}
function uuidFromBytes(b) {
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const hex = [];
    for (let i = 0; i < 16; i++)
        hex.push(b[i].toString(16).padStart(2, "0"));
    return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex
        .slice(6, 8)
        .join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
}
