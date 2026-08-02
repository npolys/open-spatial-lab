import { base64ToBytes, base64UrlToBytes, bytesEqual, bytesToBase64, bytesToBase64Url, bytesToHex, hexToBytes, } from "./codecs.mjs";
export const ED25519_SPKI_PREFIX = Uint8Array.from([
    0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00,
]);
export const ED25519_PKCS8_PREFIX = Uint8Array.from([
    0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70,
    0x04, 0x22, 0x04, 0x20,
]);
function subtle() {
    const s = globalThis.crypto?.subtle;
    if (!s) {
        throw new Error("WebCrypto (crypto.subtle) unavailable — need Node >= 18.4 or a modern browser (secure context)");
    }
    return s;
}
export function rawPublicKeyToSpki(raw) {
    if (!(raw instanceof Uint8Array) || raw.length !== 32) {
        throw new Error("Ed25519 raw public key must be exactly 32 bytes");
    }
    const out = new Uint8Array(44);
    out.set(ED25519_SPKI_PREFIX, 0);
    out.set(raw, 12);
    return out;
}
export function spkiToRawPublicKey(spki) {
    if (!(spki instanceof Uint8Array) || spki.length !== 44 || !bytesEqual(spki.subarray(0, 12), ED25519_SPKI_PREFIX)) {
        throw new Error("Not an Ed25519 SPKI DER public key (expected 44 bytes with RFC 8410 prefix)");
    }
    return spki.slice(12);
}
export function seedToPkcs8(seed) {
    if (!(seed instanceof Uint8Array) || seed.length !== 32) {
        throw new Error("Ed25519 seed must be exactly 32 bytes");
    }
    const out = new Uint8Array(48);
    out.set(ED25519_PKCS8_PREFIX, 0);
    out.set(seed, 16);
    return out;
}
export function pkcs8ToSeed(pkcs8) {
    if (!(pkcs8 instanceof Uint8Array) || pkcs8.length !== 48 || !bytesEqual(pkcs8.subarray(0, 16), ED25519_PKCS8_PREFIX)) {
        throw new Error("Not an Ed25519 PKCS#8 DER private key (expected 48 bytes with RFC 8410 prefix)");
    }
    return pkcs8.slice(16);
}
export async function generateKeyPair() {
    const pair = await subtle().generateKey("Ed25519", true, ["sign", "verify"]);
    const [rawPublicKey, pkcs8] = await Promise.all([
        subtle().exportKey("raw", pair.publicKey).then((b) => new Uint8Array(b)),
        subtle().exportKey("pkcs8", pair.privateKey).then((b) => new Uint8Array(b)),
    ]);
    return {
        privateKey: pair.privateKey,
        publicKey: pair.publicKey,
        rawPublicKey,
        publicKeySpki: rawPublicKeyToSpki(rawPublicKey),
        seed: pkcs8ToSeed(pkcs8),
    };
}
export async function importPrivateKey(input) {
    if (isCryptoKey(input)) {
        if (input.type !== "private")
            throw new Error("Expected a private CryptoKey");
        return input;
    }
    if (input && typeof input === "object" && !(input instanceof Uint8Array)) {
        if (input.kty === "OKP" && input.crv === "Ed25519" && typeof input.d === "string") {
            return importPrivateKey(base64UrlToBytes(input.d));
        }
        throw new Error("Unsupported private key object (expected CryptoKey, Uint8Array, or OKP/Ed25519 JWK with d)");
    }
    let bytes;
    if (input instanceof Uint8Array) {
        bytes = input;
    }
    else if (typeof input === "string") {
        bytes = /^[0-9a-fA-F]{64}$/.test(input) ? hexToBytes(input) : base64FlexibleToBytes(input);
    }
    else {
        throw new Error("Unsupported private key input type");
    }
    const pkcs8 = bytes.length === 32 ? seedToPkcs8(bytes) : bytes.length === 48 ? bytes : null;
    if (!pkcs8) {
        throw new Error(`Unsupported private key byte length ${bytes.length} (expected 32-byte seed or 48-byte PKCS#8)`);
    }
    return subtle().importKey("pkcs8", pkcs8, "Ed25519", true, ["sign"]);
}
export async function importPublicKey(input) {
    if (isCryptoKey(input)) {
        if (input.type !== "public")
            throw new Error("Expected a public CryptoKey");
        return input;
    }
    const raw = publicKeyInputToRaw(input);
    return subtle().importKey("raw", raw, "Ed25519", true, ["verify"]);
}
export function publicKeyInputToRaw(input) {
    if (input instanceof Uint8Array) {
        if (input.length === 32)
            return input;
        if (input.length === 44)
            return spkiToRawPublicKey(input);
        throw new Error(`Unsupported public key byte length ${input.length} (expected 32 raw or 44 SPKI)`);
    }
    if (typeof input === "string") {
        const bytes = /^[0-9a-fA-F]{64}$/.test(input) ? hexToBytes(input) : base64FlexibleToBytes(input);
        return publicKeyInputToRaw(bytes);
    }
    if (input && typeof input === "object" && input.kty === "OKP" && input.crv === "Ed25519" && typeof input.x === "string") {
        return publicKeyInputToRaw(base64UrlToBytes(input.x));
    }
    throw new Error("Unsupported public key input (expected Uint8Array, hex/base64 string, or OKP/Ed25519 JWK)");
}
export async function derivePublicKeyRaw(privateKeyInput) {
    const priv = await importPrivateKey(privateKeyInput);
    const jwk = await subtle().exportKey("jwk", priv);
    if (typeof jwk.x !== "string")
        throw new Error("Private key JWK export missing public component x");
    return base64UrlToBytes(jwk.x);
}
export async function signBytes(payload, privateKeyInput) {
    const priv = await importPrivateKey(privateKeyInput);
    const sig = await subtle().sign("Ed25519", priv, payload);
    return new Uint8Array(sig);
}
export async function verifyBytes(payload, signature, publicKeyInput) {
    const pub = await importPublicKey(publicKeyInput);
    const sigBytes = typeof signature === "string" ? base64UrlToBytes(signature) : signature;
    if (!(sigBytes instanceof Uint8Array) || sigBytes.length !== 64)
        return false;
    return subtle().verify("Ed25519", pub, sigBytes, payload);
}
function isCryptoKey(v) {
    return typeof CryptoKey !== "undefined" && v instanceof CryptoKey;
}
function base64FlexibleToBytes(s) {
    return /[-_]/.test(s) ? base64UrlToBytes(s) : base64ToBytes(s);
}
export { bytesToBase64, bytesToBase64Url, bytesToHex };
