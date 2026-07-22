'use strict';
const VALID_BASE_PATH = /^(\/[A-Za-z0-9][A-Za-z0-9._~-]*)+$/;
export function normalizeBasePath(raw) {
    const s = String(raw == null ? "" : raw).trim();
    if (s === "" || s === "/")
        return "";
    const stripped = s.replace(/\/+$/, "");
    if (!VALID_BASE_PATH.test(stripped))
        return "";
    return stripped;
}
export function applyBase(base, p) {
    const prefix = normalizeBasePath(base);
    const value = String(p == null ? "" : p);
    if (!prefix)
        return value;
    if (!value.startsWith("/"))
        return value;
    if (value === prefix || value.startsWith(prefix + "/"))
        return value;
    return prefix + value;
}
function readInjectedBase() {
    const g = typeof globalThis !== "undefined" ? globalThis : {};
    return typeof g.__OSL_BASE_PATH__ === "string" ? g.__OSL_BASE_PATH__ : "";
}
export const BASE_PATH = normalizeBasePath(readInjectedBase());
export function withBase(p) {
    return applyBase(BASE_PATH, p);
}
export function apiBase(endpointKey) {
    return withBase("/api/" + endpointKey);
}
export default { BASE_PATH, withBase, apiBase, applyBase, normalizeBasePath };
