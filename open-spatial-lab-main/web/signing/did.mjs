import { base58btcDecode, base58btcEncode, base64UrlToBytes, bytesEqual, } from "./codecs.mjs";
import { publicKeyInputToRaw, rawPublicKeyToSpki, spkiToRawPublicKey } from "./ed25519.mjs";
export const MULTICODEC_ED25519_PUB = Uint8Array.from([0xed, 0x01]);
export class KeyNotDerivableError extends Error {
    constructor(message) {
        super(message);
        this.name = "KeyNotDerivableError";
    }
}
export function publicKeyToDidKey(publicKeyInput) {
    const raw = publicKeyInputToRaw(publicKeyInput);
    const prefixed = new Uint8Array(2 + raw.length);
    prefixed.set(MULTICODEC_ED25519_PUB, 0);
    prefixed.set(raw, 2);
    return `did:key:z${base58btcEncode(prefixed)}`;
}
export function resolveDidKey(didUrl) {
    const { did, fragment } = splitDidUrl(didUrl);
    const m = /^did:key:(z[1-9A-HJ-NP-Za-km-z]+)$/.exec(did);
    if (!m)
        throw new Error(`Not a did:key: ${String(didUrl).slice(0, 64)}`);
    const multibase = m[1];
    const decoded = base58btcDecode(multibase.slice(1));
    if (decoded.length !== 34 || decoded[0] !== 0xed || decoded[1] !== 0x01) {
        throw new Error("did:key does not encode an Ed25519 public key (expected multicodec 0xed01 + 32 bytes)");
    }
    if (fragment && fragment !== multibase) {
        throw new Error(`did:key fragment ${fragment} does not match key id ${multibase}`);
    }
    const rawPublicKey = decoded.slice(2);
    return {
        did,
        rawPublicKey,
        publicKeySpki: rawPublicKeyToSpki(rawPublicKey),
        verificationMethodId: `${did}#${multibase}`,
    };
}
export function parseDidPkh(didUrl) {
    const { did, fragment } = splitDidUrl(didUrl);
    const m = /^did:pkh:([-a-z0-9]{3,8}):([-_a-zA-Z0-9]{1,32}):([.%a-zA-Z0-9]{1,128})$/.exec(did);
    if (!m)
        throw new Error(`Not a CAIP-10 did:pkh: ${String(didUrl).slice(0, 96)}`);
    return { did, namespace: m[1], chainRef: m[2], address: m[3], fragment };
}
export function resolveDidPkh(didUrl) {
    const parsed = parseDidPkh(didUrl);
    if (parsed.namespace !== "solana") {
        throw new KeyNotDerivableError(`did:pkh namespace "${parsed.namespace}" does not encode an Ed25519 public key in the address; ` +
            "only did:pkh:solana addresses are key-derivable offline");
    }
    const rawPublicKey = base58btcDecode(parsed.address);
    if (rawPublicKey.length !== 32) {
        throw new Error(`did:pkh:solana address must decode to 32 bytes (got ${rawPublicKey.length})`);
    }
    return {
        did: parsed.did,
        rawPublicKey,
        publicKeySpki: rawPublicKeyToSpki(rawPublicKey),
        verificationMethodId: `${parsed.did}#blockchainAccountId`,
    };
}
export function publicKeyToDidPkhSolana(publicKeyInput, chainRef) {
    if (typeof chainRef !== "string" || chainRef.length === 0) {
        throw new Error("publicKeyToDidPkhSolana requires an explicit CAIP-2 chain reference (e.g. the base58 genesis-hash prefix)");
    }
    const raw = publicKeyInputToRaw(publicKeyInput);
    return `did:pkh:solana:${chainRef}:${base58btcEncode(raw)}`;
}
export function didWebToUrl(didUrl) {
    const { did } = splitDidUrl(didUrl);
    if (!did.startsWith("did:web:"))
        throw new Error(`Not a did:web: ${String(didUrl).slice(0, 96)}`);
    const parts = did.slice("did:web:".length).split(":").map((p) => decodeURIComponent(p));
    const host = parts.shift();
    if (!host)
        throw new Error("did:web missing host");
    if (parts.length === 0)
        return `https://${host}/.well-known/did.json`;
    if (parts.some((p) => p.length === 0))
        throw new Error("did:web has an empty path segment");
    return `https://${host}/${parts.join("/")}/did.json`;
}
export async function resolveDidWeb(didUrl, { documentLoader } = {}) {
    if (typeof documentLoader !== "function") {
        throw new Error("did:web resolution requires an injected documentLoader (live DID dereferencing is out of scope; " +
            "verify against the embedded publicKeySpkiB64 instead, recording keyRefResolution:'unresolved')");
    }
    const { did, fragment } = splitDidUrl(didUrl);
    const url = didWebToUrl(did);
    const doc = await documentLoader(url);
    if (!doc || typeof doc !== "object")
        throw new Error(`documentLoader returned no DID document for ${url}`);
    if (typeof doc.id === "string" && doc.id !== did) {
        throw new Error(`DID document id ${doc.id} does not match requested ${did}`);
    }
    const vm = pickVerificationMethod(doc, did, fragment);
    const rawPublicKey = extractEd25519PublicKey(vm);
    return {
        did,
        rawPublicKey,
        publicKeySpki: rawPublicKeyToSpki(rawPublicKey),
        verificationMethodId: typeof vm.id === "string" ? vm.id : `${did}#unnamed`,
        document: doc,
    };
}
function pickVerificationMethod(doc, did, fragment) {
    const methods = Array.isArray(doc.verificationMethod) ? doc.verificationMethod : [];
    if (methods.length === 0)
        throw new Error("DID document has no verificationMethod entries");
    if (fragment) {
        const wanted = `${did}#${fragment}`;
        const hit = methods.find((m) => m && (m.id === wanted || m.id === `#${fragment}`));
        if (!hit)
            throw new Error(`DID document has no verification method ${wanted}`);
        return hit;
    }
    const ed = methods.find((m) => canExtractEd25519(m));
    if (!ed)
        throw new Error("DID document has no Ed25519-capable verification method");
    return ed;
}
function canExtractEd25519(vm) {
    try {
        extractEd25519PublicKey(vm);
        return true;
    }
    catch {
        return false;
    }
}
export function extractEd25519PublicKey(vm) {
    if (!vm || typeof vm !== "object")
        throw new Error("No verification method");
    if (typeof vm.publicKeyMultibase === "string") {
        if (!vm.publicKeyMultibase.startsWith("z")) {
            throw new Error("publicKeyMultibase must be base58btc ('z' multibase prefix)");
        }
        const decoded = base58btcDecode(vm.publicKeyMultibase.slice(1));
        if (decoded.length === 34 && decoded[0] === 0xed && decoded[1] === 0x01)
            return decoded.slice(2);
        if (decoded.length === 32)
            return decoded;
        throw new Error("publicKeyMultibase does not encode an Ed25519 public key");
    }
    if (vm.publicKeyJwk && typeof vm.publicKeyJwk === "object") {
        const jwk = vm.publicKeyJwk;
        if (jwk.kty !== "OKP" || jwk.crv !== "Ed25519" || typeof jwk.x !== "string") {
            throw new Error("publicKeyJwk is not an OKP/Ed25519 key");
        }
        const raw = base64UrlToBytes(jwk.x);
        if (raw.length !== 32)
            throw new Error("publicKeyJwk.x must decode to 32 bytes");
        return raw;
    }
    if (typeof vm.publicKeyBase58 === "string") {
        const raw = base58btcDecode(vm.publicKeyBase58);
        if (raw.length !== 32)
            throw new Error("publicKeyBase58 must decode to 32 bytes");
        return raw;
    }
    throw new Error("Verification method carries no supported Ed25519 key encoding");
}
export async function resolveKeyRefOffline(keyRef, { documentLoader } = {}) {
    if (typeof keyRef !== "string" || keyRef.length === 0) {
        return { resolution: "unresolved", method: "none" };
    }
    if (keyRef.startsWith("did:key:")) {
        const r = resolveDidKey(keyRef);
        return { resolution: "resolved", method: "did:key", rawPublicKey: r.rawPublicKey, publicKeySpki: r.publicKeySpki };
    }
    if (keyRef.startsWith("did:pkh:")) {
        try {
            const r = resolveDidPkh(keyRef);
            return { resolution: "resolved", method: "did:pkh:solana", rawPublicKey: r.rawPublicKey, publicKeySpki: r.publicKeySpki };
        }
        catch (e) {
            if (e instanceof KeyNotDerivableError)
                return { resolution: "unresolved", method: "did:pkh" };
            throw e;
        }
    }
    if (keyRef.startsWith("did:web:") && typeof documentLoader === "function") {
        const r = await resolveDidWeb(keyRef, { documentLoader });
        return { resolution: "resolved", method: "did:web", rawPublicKey: r.rawPublicKey, publicKeySpki: r.publicKeySpki };
    }
    return { resolution: "unresolved", method: keyRef.startsWith("did:") ? keyRef.slice(0, keyRef.indexOf(":", 4) === -1 ? undefined : keyRef.indexOf(":", 4)) : "uri" };
}
export async function checkKeyRefConsistency(keyRef, embeddedSpkiOrRaw, opts = {}) {
    const resolved = await resolveKeyRefOffline(keyRef, opts);
    if (resolved.resolution !== "resolved") {
        return { consistent: true, keyRefResolution: "unresolved", method: resolved.method };
    }
    const embeddedRaw = embeddedSpkiOrRaw instanceof Uint8Array && embeddedSpkiOrRaw.length === 44
        ? spkiToRawPublicKey(embeddedSpkiOrRaw)
        : publicKeyInputToRaw(embeddedSpkiOrRaw);
    return {
        consistent: bytesEqual(resolved.rawPublicKey, embeddedRaw),
        keyRefResolution: "resolved",
        method: resolved.method,
    };
}
export function splitDidUrl(didUrl) {
    const s = String(didUrl);
    const hash = s.indexOf("#");
    if (hash === -1)
        return { did: s, fragment: undefined };
    return { did: s.slice(0, hash), fragment: s.slice(hash + 1) };
}
