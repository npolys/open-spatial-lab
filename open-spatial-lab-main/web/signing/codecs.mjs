const B58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const B58_LOOKUP = (() => {
    const m = new Map();
    for (let i = 0; i < B58_ALPHABET.length; i++)
        m.set(B58_ALPHABET[i], i);
    return m;
})();
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { fatal: true });
export function utf8Encode(str) {
    return textEncoder.encode(str);
}
export function utf8Decode(bytes) {
    return textDecoder.decode(bytes);
}
export function bytesToHex(bytes) {
    let out = "";
    for (const b of bytes)
        out += b.toString(16).padStart(2, "0");
    return out;
}
export function hexToBytes(hex) {
    const clean = String(hex).replace(/\s+/g, "").toLowerCase();
    if (clean.length % 2 !== 0 || /[^0-9a-f]/.test(clean)) {
        throw new Error(`Invalid hex string: ${String(hex).slice(0, 32)}...`);
    }
    const out = new Uint8Array(clean.length / 2);
    for (let i = 0; i < out.length; i++) {
        out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    }
    return out;
}
function bytesToBinaryString(bytes) {
    let s = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
        s += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return s;
}
function binaryStringToBytes(str) {
    const out = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++)
        out[i] = str.charCodeAt(i) & 0xff;
    return out;
}
export function bytesToBase64(bytes) {
    return btoa(bytesToBinaryString(bytes));
}
export function base64ToBytes(b64) {
    return binaryStringToBytes(atob(String(b64)));
}
export function bytesToBase64Url(bytes) {
    return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
export function base64UrlToBytes(b64u) {
    let s = String(b64u).replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4 !== 0)
        s += "=";
    return binaryStringToBytes(atob(s));
}
export function base58btcEncode(bytes) {
    let zeros = 0;
    while (zeros < bytes.length && bytes[zeros] === 0)
        zeros++;
    const digits = [];
    for (const byte of bytes) {
        let carry = byte;
        for (let i = 0; i < digits.length; i++) {
            carry += digits[i] * 256;
            digits[i] = carry % 58;
            carry = Math.floor(carry / 58);
        }
        while (carry > 0) {
            digits.push(carry % 58);
            carry = Math.floor(carry / 58);
        }
    }
    let out = "1".repeat(zeros);
    for (let i = digits.length - 1; i >= 0; i--)
        out += B58_ALPHABET[digits[i]];
    return out;
}
export function base58btcDecode(str) {
    const s = String(str);
    let zeros = 0;
    while (zeros < s.length && s[zeros] === "1")
        zeros++;
    const bytes = [];
    for (const ch of s) {
        const val = B58_LOOKUP.get(ch);
        if (val === undefined)
            throw new Error(`Invalid base58btc character: ${JSON.stringify(ch)}`);
        let carry = val;
        for (let i = 0; i < bytes.length; i++) {
            carry += bytes[i] * 58;
            bytes[i] = carry & 0xff;
            carry >>= 8;
        }
        while (carry > 0) {
            bytes.push(carry & 0xff);
            carry >>= 8;
        }
    }
    const out = new Uint8Array(zeros + bytes.length);
    for (let i = 0; i < bytes.length; i++)
        out[zeros + i] = bytes[bytes.length - 1 - i];
    return out;
}
export function bytesEqual(a, b) {
    if (a.length !== b.length)
        return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++)
        diff |= a[i] ^ b[i];
    return diff === 0;
}
