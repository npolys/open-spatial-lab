export const UM_V04_CONTEXT = "https://universalmanifest.net/ns/v0.4";
export const UM_V04_MANIFEST_VERSION = "0.4";
export const UM_FACET_TYPE = "um:Facet";
export const UM_ENTITY_TYPE = "um:Entity";
export const LOADING_POINTER_TYPE = "um:loadingPointer";
export const AVATAR_DEFINITION_CONTRACT = Object.freeze({
    interface: "AvatarDefinition",
    version: "runtime-v1",
    targets: "Universal Manifest v0.4 um:Facet (spec/v0.4/schema.json $defs/facet)",
    facet_type: UM_FACET_TYPE,
    required: ["avatarId", "variant"],
    optional: [
        "displayName",
        "equipmentProfile",
        "equippedItems",
        "poseRef",
        "requiredTrustTier",
    ],
    binds: "runtime (parametric avatars, web/avatar/) maps AvatarParams -> AvatarDefinition",
    scope_note: "structural facet contract only; conforming makes the emitted facet v0.4-shaped, " +
        "NOT a UM conformance claim (that is runtime/117b/119; um_conformance stays false).",
});
export function makeAvatarDefinition(fields) {
    const f = fields && typeof fields === "object" ? fields : {};
    const def = {
        avatarId: str(f.avatarId),
        variant: str(f.variant),
        displayName: optStr(f.displayName),
        equipmentProfile: f.equipmentProfile == null ? null : str(f.equipmentProfile),
        equippedItems: Array.isArray(f.equippedItems) ? f.equippedItems.slice() : [],
        poseRef: f.poseRef == null ? null : str(f.poseRef),
        requiredTrustTier: normTier(f.requiredTrustTier),
    };
    return def;
}
export function fromAvatarParams(avatarParams) {
    const p = avatarParams && typeof avatarParams === "object" ? avatarParams : {};
    return makeAvatarDefinition({
        avatarId: p.avatarId ?? p.id ?? p.avatar_id ?? null,
        variant: p.variant ?? p.preset ?? p.rig ?? p.avatar_variant ?? null,
        displayName: p.displayName ?? p.name ?? p.display_name ?? null,
        equipmentProfile: p.equipmentProfile ?? p.equipment_profile ?? null,
        equippedItems: p.equippedItems ?? p.items ?? p.equipped_items ?? [],
        poseRef: p.poseRef ?? p.pose_ref ?? (typeof p.pose === "string" ? p.pose : null),
        requiredTrustTier: p.requiredTrustTier ?? p.required_trust_tier ?? undefined,
    });
}
export function validateAvatarDefinition(def) {
    const errors = [];
    if (!def || typeof def !== "object") {
        return { valid: false, errors: ["AvatarDefinition must be an object"] };
    }
    if (!isNonEmptyString(def.avatarId))
        errors.push("avatarId: required non-empty string");
    if (!isNonEmptyString(def.variant))
        errors.push("variant: required non-empty string");
    if (def.displayName != null && typeof def.displayName !== "string") {
        errors.push("displayName: must be a string when present");
    }
    if (def.equipmentProfile != null && typeof def.equipmentProfile !== "string") {
        errors.push("equipmentProfile: must be a string or null");
    }
    if (def.equippedItems != null && !Array.isArray(def.equippedItems)) {
        errors.push("equippedItems: must be an array when present");
    }
    if (def.poseRef != null && typeof def.poseRef !== "string") {
        errors.push("poseRef: must be a string or null");
    }
    if (def.requiredTrustTier != null && !isTier(def.requiredTrustTier)) {
        errors.push("requiredTrustTier: must be an integer 0..3 when present");
    }
    return { valid: errors.length === 0, errors };
}
export const LOADING_POINTER_CONTRACT = Object.freeze({
    interface: "LoadingPointer",
    version: "runtime-v1",
    targets: "Universal Manifest v0.4 pointer (spec/v0.4/schema.json $defs/pointer)",
    pointer_type: LOADING_POINTER_TYPE,
    required: [],
    optional: ["target", "pointerId", "label", "expiresAt", "pointerType"],
    binds: "runtime (loading-content) supplies the destination loading URL (e.g. IWPS downloadUrl)",
    scope_note: "structural pointer contract only; conforming makes the emitted pointer v0.4-shaped, " +
        "NOT a UM conformance claim (um_conformance stays false).",
});
export function makeLoadingPointer(fields) {
    const f = fields && typeof fields === "object" ? fields : {};
    const pointerType = isNonEmptyString(f.pointerType) ? f.pointerType : LOADING_POINTER_TYPE;
    return {
        pointerType,
        target: f.target == null ? null : str(f.target),
        pointerId: f.pointerId == null ? null : str(f.pointerId),
        label: f.label == null ? null : str(f.label),
        expiresAt: f.expiresAt == null ? null : str(f.expiresAt),
    };
}
export function validateLoadingPointer(ptr) {
    const errors = [];
    if (!ptr || typeof ptr !== "object") {
        return { valid: false, errors: ["LoadingPointer must be an object"] };
    }
    if (!isNonEmptyString(ptr.pointerType)) {
        errors.push("pointerType: required non-empty string (defaults to um:loadingPointer)");
    }
    else if (ptr.pointerType === "um:agentDelegation") {
        errors.push("pointerType MUST NOT be um:agentDelegation for a LoadingPointer (that is a delegation pointer)");
    }
    if (ptr.target != null && typeof ptr.target !== "string")
        errors.push("target: must be a string or null");
    if (ptr.pointerId != null && typeof ptr.pointerId !== "string")
        errors.push("pointerId: must be a string or null");
    if (ptr.label != null && typeof ptr.label !== "string")
        errors.push("label: must be a string or null");
    if (ptr.expiresAt != null && !isIsoDateTime(ptr.expiresAt)) {
        errors.push("expiresAt: must be an ISO 8601 date-time string or null");
    }
    return { valid: errors.length === 0, errors };
}
function str(v) {
    return v == null ? "" : String(v);
}
function optStr(v) {
    return v == null ? null : String(v);
}
function isNonEmptyString(v) {
    return typeof v === "string" && v.length > 0;
}
function isTier(v) {
    return Number.isInteger(v) && v >= 0 && v <= 3;
}
function normTier(v) {
    return isTier(v) ? v : undefined;
}
function isIsoDateTime(v) {
    if (typeof v !== "string" || v.length === 0)
        return false;
    const t = Date.parse(v);
    return Number.isFinite(t);
}
