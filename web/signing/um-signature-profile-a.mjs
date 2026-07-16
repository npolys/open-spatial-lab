import { jcsCanonicalize, jcsCanonicalizeToBytes } from "./jcs-rfc8785.mjs";
import { derivePublicKeyRaw, importPrivateKey, publicKeyInputToRaw, rawPublicKeyToSpki, signBytes, spkiToRawPublicKey, verifyBytes, } from "./ed25519.mjs";
import { base64ToBytes, bytesEqual, bytesToBase64, bytesToBase64Url } from "./codecs.mjs";
import { checkKeyRefConsistency, publicKeyToDidKey, resolveKeyRefOffline } from "./did.mjs";
import { findUnsafeNumber } from "./ijson.mjs";
export const PROFILE_A = Object.freeze({
    algorithm: "Ed25519",
    canonicalization: "JCS-RFC8785",
});
export const SIGNING_CONFORMANCE = Object.freeze({
    standard: "Universal Manifest Signature Profile A (spec/v0.2/SIGNATURE-PROFILE.md; unchanged through v0.4)",
    jcs_rfc8785_reference_vectors_byte_exact: true,
    ed25519_rfc8032_vectors_byte_exact: true,
    profile_a_signature_shape: true,
    keyref_embedded_key_consistency_check: true,
    did_key_offline_derivation: true,
    did_web_live_resolution: false,
    did_pkh_nonsolana_key_derivation: false,
    signed_live_manifest: false,
    scoped_claim: "Proven signing LIBRARY: byte-exact RFC 8785 JCS + RFC 8032 Ed25519 + Profile A shape " +
        "against test vectors and the UM reference verifier; NOT yet a signed live manifest.",
});
function signingExclusions(manifest, opts) {
    return (opts.exclude ??
        (typeof manifest.manifestVersion === "string" && manifest.manifestVersion === "0.4"
            ? ["presentationProof", "postQuantumSignature"]
            : []));
}
function buildUnsignedSigningObject(manifest, opts) {
    if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
        throw new Error("Signing input requires a JSON object manifest");
    }
    const unsigned = { ...manifest };
    delete unsigned.signature;
    for (const k of signingExclusions(manifest, opts))
        delete unsigned[k];
    if (opts.strictNumbers) {
        const unsafe = findUnsafeNumber(unsigned);
        if (unsafe) {
            throw new TypeError(`I-JSON: number ${unsafe.value} at ${unsafe.path} is outside the safe range ±(2^53-1); ` +
                "represent big numbers as strings (RFC 8785 Appendix D)");
        }
    }
    return unsigned;
}
export function computeSigningInput(manifest, opts = {}) {
    return jcsCanonicalizeToBytes(buildUnsignedSigningObject(manifest, opts));
}
export function computeSigningInputString(manifest, opts = {}) {
    return jcsCanonicalize(buildUnsignedSigningObject(manifest, opts));
}
export async function sign(obj, privateKeyInput, opts = {}) {
    const privateKey = await importPrivateKey(privateKeyInput);
    const rawPublicKey = await derivePublicKeyRaw(privateKey);
    const spki = rawPublicKeyToSpki(rawPublicKey);
    const didKey = publicKeyToDidKey(rawPublicKey);
    const keyRef = opts.keyRef ?? `${didKey}#${didKey.slice("did:key:".length)}`;
    const created = opts.created === null ? undefined : opts.created ?? new Date().toISOString();
    const embed = opts.embedPublicKey !== false;
    const payload = computeSigningInput(obj, opts);
    const sigBytes = await signBytes(payload, privateKey);
    const protectedBlock = {
        algorithm: PROFILE_A.algorithm,
        canonicalization: PROFILE_A.canonicalization,
        keyRef,
        ...(created !== undefined ? { created } : {}),
        ...(embed ? { publicKeySpkiB64: bytesToBase64(spki) } : {}),
    };
    return { signature: bytesToBase64Url(sigBytes), protected: protectedBlock };
}
export async function attachSignatureProfileA(manifest, privateKeyInput, opts = {}) {
    const { signature, protected: prot } = await sign(manifest, privateKeyInput, opts);
    return { ...manifest, signature: { ...prot, value: signature } };
}
export async function verify(obj, signature, didOrKey, opts = {}) {
    const report = await verifyDetailed(obj, signature, didOrKey, opts);
    return report.ok;
}
export async function verifyManifestProfileA(manifest, opts = {}) {
    if (!manifest || typeof manifest !== "object" || !manifest.signature || typeof manifest.signature !== "object") {
        return { ok: false, reason: "missing-signature", checks: {} };
    }
    return verifyDetailed(manifest, manifest.signature, opts.didOrKey, opts);
}
async function verifyDetailed(obj, signature, didOrKey, opts = {}) {
    const checks = {
        profilePair: false,
        signingInputRecomputed: false,
        keySource: "none",
        keyRefResolution: "unresolved",
        keyRefConsistency: "not-applicable",
        ed25519Verified: false,
    };
    let sigValue;
    let sigObject = null;
    if (typeof signature === "string") {
        sigValue = signature;
    }
    else if (signature && typeof signature === "object") {
        sigObject = signature;
        if (sigObject.algorithm !== PROFILE_A.algorithm || sigObject.canonicalization !== PROFILE_A.canonicalization) {
            return { ok: false, reason: "unsupported-profile", checks };
        }
        if (typeof sigObject.value !== "string" || sigObject.value.length === 0) {
            return { ok: false, reason: "missing-signature-value", checks };
        }
        sigValue = sigObject.value;
    }
    else {
        return { ok: false, reason: "missing-signature", checks };
    }
    checks.profilePair = true;
    if (obj &&
        typeof obj === "object" &&
        Object.prototype.hasOwnProperty.call(obj, "manifestVersion") &&
        typeof obj.manifestVersion !== "string") {
        return { ok: false, reason: "invalid-manifest-version-type", checks };
    }
    let publicKeyInput = null;
    const embedded = sigObject && typeof sigObject.publicKeySpkiB64 === "string" ? sigObject.publicKeySpkiB64 : null;
    const keyRef = sigObject && typeof sigObject.keyRef === "string" ? sigObject.keyRef : null;
    if (didOrKey !== undefined && didOrKey !== null) {
        if (typeof didOrKey === "string" && didOrKey.startsWith("did:")) {
            const resolved = await resolveKeyRefOffline(didOrKey, opts);
            if (resolved.resolution !== "resolved") {
                return { ok: false, reason: `did-not-offline-resolvable:${resolved.method}`, checks };
            }
            checks.keyRefResolution = "resolved";
            publicKeyInput = resolved.rawPublicKey;
            checks.keySource = "caller-did";
        }
        else {
            publicKeyInput = didOrKey;
            checks.keySource = "caller-key";
        }
        if (embedded) {
            const embeddedRaw = spkiToRawPublicKey(base64ToBytes(embedded));
            let callerRaw;
            try {
                callerRaw = publicKeyInputToRaw(publicKeyInput);
            }
            catch {
                callerRaw = null;
            }
            if (callerRaw && !bytesEqual(callerRaw, embeddedRaw)) {
                checks.keyRefConsistency = "mismatch";
                return { ok: false, reason: "caller-key-embedded-key-mismatch", checks };
            }
        }
    }
    else if (embedded) {
        publicKeyInput = base64ToBytes(embedded);
        checks.keySource = "embedded-spki";
        if (keyRef) {
            const consistency = await checkKeyRefConsistency(keyRef, publicKeyInput, opts);
            checks.keyRefResolution = consistency.keyRefResolution;
            checks.keyRefConsistency = consistency.keyRefResolution === "resolved" ? (consistency.consistent ? "consistent" : "mismatch") : "unresolved-embedded-key-stands";
            if (!consistency.consistent) {
                return { ok: false, reason: "keyref-embedded-key-mismatch", checks };
            }
        }
    }
    else if (keyRef) {
        const resolved = await resolveKeyRefOffline(keyRef, opts);
        checks.keyRefResolution = resolved.resolution;
        if (resolved.resolution !== "resolved") {
            return { ok: false, reason: "keyref-unresolvable-and-no-embedded-key", checks };
        }
        publicKeyInput = resolved.rawPublicKey;
        checks.keySource = "keyref-derived";
    }
    else {
        return { ok: false, reason: "no-key-material", checks };
    }
    let payload;
    try {
        payload = computeSigningInput(obj, { ...opts, strictNumbers: opts.strictNumbers !== false });
    }
    catch (e) {
        return { ok: false, reason: `invalid-signing-input:${(e && e.message) || "error"}`, checks };
    }
    checks.signingInputRecomputed = true;
    let ok = false;
    try {
        ok = await verifyBytes(payload, sigValue, publicKeyInput);
    }
    catch {
        ok = false;
    }
    checks.ed25519Verified = ok;
    return { ok, reason: ok ? "verified" : "signature-verification-failed", checks };
}
