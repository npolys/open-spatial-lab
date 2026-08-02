export const I_JSON_MAX_SAFE_NUMBER = Number.MAX_SAFE_INTEGER;
export function isUnsafeSigningNumber(n) {
    return typeof n === "number" && (!Number.isFinite(n) || Math.abs(n) > I_JSON_MAX_SAFE_NUMBER);
}
export function findUnsafeNumber(value, path = "$") {
    if (typeof value === "number") {
        return isUnsafeSigningNumber(value) ? { path, value } : null;
    }
    if (value === null || typeof value !== "object")
        return null;
    if (typeof value.toJSON === "function") {
        return findUnsafeNumber(value.toJSON(), path);
    }
    if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
            const hit = findUnsafeNumber(value[i], `${path}[${i}]`);
            if (hit)
                return hit;
        }
        return null;
    }
    for (const key of Object.keys(value)) {
        const v = value[key];
        if (v === undefined || typeof v === "function" || typeof v === "symbol")
            continue;
        const hit = findUnsafeNumber(v, `${path}.${key}`);
        if (hit)
            return hit;
    }
    return null;
}
const NUMBER_RE = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;
const LONE_SURROGATE_RE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
function isWellFormedString(str) {
    if (typeof str.isWellFormed === "function")
        return str.isWellFormed();
    return !LONE_SURROGATE_RE.test(str);
}
export function parseIJson(text) {
    if (typeof text !== "string") {
        throw new TypeError("I-JSON: input must be a string of JSON text");
    }
    let i = 0;
    const fail = (msg, at = i) => {
        throw new TypeError(`I-JSON: ${msg} at offset ${at}`);
    };
    const skipWs = () => {
        while (i < text.length) {
            const c = text.charCodeAt(i);
            if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d)
                i++;
            else
                break;
        }
    };
    const expectLiteral = (lit, value) => {
        if (!text.startsWith(lit, i))
            fail(`invalid literal (expected ${lit})`);
        i += lit.length;
        return value;
    };
    const parseString = () => {
        const start = i;
        if (text[i] !== '"')
            fail("expected string");
        i++;
        while (i < text.length) {
            const ch = text[i];
            if (ch === "\\") {
                i += 2;
                continue;
            }
            if (ch === '"') {
                i++;
                const token = text.slice(start, i);
                let parsed;
                try {
                    parsed = JSON.parse(token);
                }
                catch {
                    fail("malformed string token", start);
                }
                if (!isWellFormedString(parsed)) {
                    fail("lone surrogate in string (RFC 7493 §2.1 requires Unicode characters)", start);
                }
                return parsed;
            }
            i++;
        }
        return fail("unterminated string", start);
    };
    const parseNumber = () => {
        const start = i;
        NUMBER_RE.lastIndex = i;
        const m = NUMBER_RE.exec(text);
        if (!m || m.index !== i)
            fail("malformed number", start);
        i += m[0].length;
        const value = Number(m[0]);
        if (!Number.isFinite(value)) {
            fail(`number ${m[0]} overflows to a non-finite double`, start);
        }
        if (Math.abs(value) > I_JSON_MAX_SAFE_NUMBER) {
            fail(`number ${m[0]} is outside the I-JSON safe range ±(2^53-1) (RFC 7493 §2.2); ` +
                "represent big numbers as strings (RFC 8785 Appendix D)", start);
        }
        return value;
    };
    const parseObject = () => {
        i++;
        const obj = {};
        const seen = new Set();
        skipWs();
        if (text[i] === "}") {
            i++;
            return obj;
        }
        for (;;) {
            skipWs();
            const keyAt = i;
            if (text[i] !== '"')
                fail("expected object key string");
            const key = parseString();
            if (seen.has(key)) {
                fail(`duplicate object key ${JSON.stringify(key)} (RFC 7493 §2.3 names MUST be unique)`, keyAt);
            }
            seen.add(key);
            skipWs();
            if (text[i] !== ":")
                fail("expected ':' after object key");
            i++;
            const value = parseValue();
            Object.defineProperty(obj, key, { value, writable: true, enumerable: true, configurable: true });
            skipWs();
            if (text[i] === ",") {
                i++;
                continue;
            }
            if (text[i] === "}") {
                i++;
                return obj;
            }
            fail("expected ',' or '}' in object");
        }
    };
    const parseArray = () => {
        i++;
        const arr = [];
        skipWs();
        if (text[i] === "]") {
            i++;
            return arr;
        }
        for (;;) {
            arr.push(parseValue());
            skipWs();
            if (text[i] === ",") {
                i++;
                continue;
            }
            if (text[i] === "]") {
                i++;
                return arr;
            }
            fail("expected ',' or ']' in array");
        }
    };
    const parseValue = () => {
        skipWs();
        if (i >= text.length)
            fail("unexpected end of input");
        const c = text[i];
        if (c === "{")
            return parseObject();
        if (c === "[")
            return parseArray();
        if (c === '"')
            return parseString();
        if (c === "t")
            return expectLiteral("true", true);
        if (c === "f")
            return expectLiteral("false", false);
        if (c === "n")
            return expectLiteral("null", null);
        if (c === "-" || (c >= "0" && c <= "9"))
            return parseNumber();
        return fail(`unexpected character ${JSON.stringify(c)}`);
    };
    const value = parseValue();
    skipWs();
    if (i !== text.length)
        fail("unexpected trailing content");
    return value;
}
