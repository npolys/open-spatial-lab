export function jcsCanonicalize(value) {
    if (value === undefined) {
        throw new TypeError("JCS: top-level value is undefined (not JSON data)");
    }
    let out = "";
    const append = (chunk) => {
        out += chunk;
    };
    serializeValue(value, append);
    return out;
}
export function jcsCanonicalizeToBytes(value) {
    return new TextEncoder().encode(jcsCanonicalize(value));
}
function serializeValue(value, append) {
    if (value === null) {
        append("null");
        return;
    }
    switch (typeof value) {
        case "boolean":
            append(value ? "true" : "false");
            return;
        case "number":
            serializeNumber(value, append);
            return;
        case "string":
            serializeString(value, append);
            return;
        case "bigint":
            throw new TypeError("JCS: BigInt is not part of the JSON data model (RFC 8785 §3.1); represent big numbers as strings (Appendix D)");
        case "undefined":
        case "function":
        case "symbol":
            append("null");
            return;
        case "object":
            break;
        default:
            throw new TypeError(`JCS: unsupported value type ${typeof value}`);
    }
    if (typeof value.toJSON === "function") {
        serializeValue(value.toJSON(), append);
        return;
    }
    if (Array.isArray(value)) {
        append("[");
        for (let i = 0; i < value.length; i++) {
            if (i > 0)
                append(",");
            serializeValue(value[i], append);
        }
        append("]");
        return;
    }
    rejectNonJsonObject(value);
    const keys = Object.keys(value).sort();
    append("{");
    let first = true;
    for (const key of keys) {
        const propValue = value[key];
        if (propValue === undefined ||
            typeof propValue === "function" ||
            typeof propValue === "symbol") {
            continue;
        }
        if (!first)
            append(",");
        first = false;
        serializeString(key, append);
        append(":");
        serializeValue(propValue, append);
    }
    append("}");
}
function rejectNonJsonObject(value) {
    if (value instanceof Map || value instanceof Set) {
        throw new TypeError("JCS: Map/Set are not JSON data; convert to object/array first");
    }
    if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
        throw new TypeError("JCS: binary buffers are not JSON data; encode as base64/base64url string first");
    }
    if (value instanceof Date) {
        throw new TypeError("JCS: Date without toJSON; convert to ISO string first");
    }
}
function serializeNumber(value, append) {
    if (!Number.isFinite(value)) {
        throw new TypeError("JCS: NaN and Infinity are not permitted in JSON (RFC 8785 §3.2.2.3)");
    }
    append(JSON.stringify(value));
}
function serializeString(value, append) {
    if (!isWellFormedString(value)) {
        throw new TypeError("JCS: lone surrogate in string data (RFC 8785 §3.2.2.2 requires an error)");
    }
    append(JSON.stringify(value));
}
const LONE_SURROGATE_RE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
function isWellFormedString(str) {
    if (typeof str.isWellFormed === "function")
        return str.isWellFormed();
    return !LONE_SURROGATE_RE.test(str);
}
