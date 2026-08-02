import { applyBase } from "./base-path.mjs";
const LOOPBACK_ORIGIN_TO_ENDPOINT_KEY = Object.freeze([
    [/^https?:\/\/(?:127\.0\.0\.1|localhost):18151/i, "a"],
    [/^https?:\/\/(?:127\.0\.0\.1|localhost):18152/i, "b"],
    [/^https?:\/\/(?:127\.0\.0\.1|localhost):18153/i, "lobby"],
    [/^https?:\/\/(?:127\.0\.0\.1|localhost):18154/i, "airport"],
]);
export function resolveFabricReference(base, ref) {
    if (!ref || typeof ref !== "string")
        return null;
    if (/^https?:\/\//i.test(ref)) {
        for (const [origin, key] of LOOPBACK_ORIGIN_TO_ENDPOINT_KEY) {
            if (origin.test(ref))
                return ref.replace(origin, applyBase(base, "/api/" + key));
        }
        return ref;
    }
    return applyBase(base, ref);
}
export default { resolveFabricReference };
