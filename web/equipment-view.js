const VRM_ATTACHMENT_POINTS = new Set([
    "hips", "spine", "chest", "upperChest", "neck", "head",
    "leftShoulder", "leftUpperArm", "leftLowerArm", "leftHand",
    "rightShoulder", "rightUpperArm", "rightLowerArm", "rightHand",
    "leftUpperLeg", "leftLowerLeg", "leftFoot",
    "rightUpperLeg", "rightLowerLeg", "rightFoot",
]);
function featureItem(itemId, attachmentPoint, mode, label, position, quaternion) {
    const base = new URL("/assets/", window.location.origin).href.replace(/\/$/, "");
    return {
        itemId,
        assetUri: `${base}/${itemId}.glb`,
        attachmentPoint,
        localTransform: { position, quaternion, scale: [1, 1, 1] },
        mode,
        label,
    };
}
export function inventorySlots() {
    return [
        {
            slot: "head",
            label: "Head",
            options: [
                featureItem("equip-hat", "head", "worn", "Wide-brim explorer hat", [0, 0.1, 0], [0, 0, 0, 1]),
                featureItem("equip-helmet", "head", "worn", "Iron helmet", [0, 0.08, 0], [0, 0, 0, 1]),
                featureItem("equip-crown", "head", "worn", "Gold crown", [0, 0.12, 0], [0, 0, 0, 1]),
            ],
        },
        {
            slot: "leftHand",
            label: "Left hand",
            options: [
                featureItem("equip-torch", "leftHand", "held", "Torch", [0, 0.02, -0.03], [0, 0, 0, 1]),
                featureItem("equip-shield", "leftHand", "held", "Round shield", [0, 0, -0.02], [0, 0.7071068, 0, 0.7071068]),
            ],
        },
        {
            slot: "rightHand",
            label: "Right hand",
            options: [
                featureItem("equip-hammer", "rightHand", "held", "War hammer", [0, 0.02, -0.04], [0.5, 0, 0, 0.8660254]),
                featureItem("equip-mug", "rightHand", "held", "Tankard", [0, 0, -0.03], [0, 0, 0, 1]),
            ],
        },
    ];
}
export function defaultEquippedItems() {
    const slots = inventorySlots();
    const first = (slot) => slots.find((entry) => entry.slot === slot).options[0];
    return [first("rightHand"), first("leftHand"), first("head")];
}
export function equipmentCatalog() {
    return inventorySlots().flatMap((slot) => slot.options.map((item) => ({ ...item })));
}
export function validateEquippedItems(items) {
    const errors = [];
    if (!Array.isArray(items))
        return { ok: false, errors: ["equippedItems must be an array"] };
    if (items.length === 0)
        return { ok: true, errors: [] };
    const modes = new Set();
    for (const [index, item] of items.entries()) {
        const path = `equippedItems[${index}]`;
        if (!item.itemId)
            errors.push(`${path}.itemId missing`);
        if (!item.assetUri)
            errors.push(`${path}.assetUri missing`);
        if (!VRM_ATTACHMENT_POINTS.has(item.attachmentPoint))
            errors.push(`${path}.attachmentPoint invalid`);
        if (item.mode !== "held" && item.mode !== "worn")
            errors.push(`${path}.mode invalid`);
        else
            modes.add(item.mode);
        const t = item.localTransform || {};
        const q = t.quaternion || t.rotation;
        if (!Array.isArray(t.position) || t.position.length !== 3)
            errors.push(`${path}.localTransform.position invalid`);
        if (!Array.isArray(q) || q.length !== 4)
            errors.push(`${path}.localTransform.quaternion invalid`);
        if (!Array.isArray(t.scale) || t.scale.length !== 3)
            errors.push(`${path}.localTransform.scale invalid`);
    }
    if (!modes.has("held"))
        errors.push("missing held item");
    if (!modes.has("worn"))
        errors.push("missing worn item");
    return { ok: errors.length === 0, errors };
}
export async function resolveEquipmentItems(items) {
    const validation = validateEquippedItems(items);
    const results = [];
    for (const item of Array.isArray(items) ? items : []) {
        const status = {
            itemId: item.itemId,
            mode: item.mode,
            attachmentPoint: item.attachmentPoint,
            assetUri: item.assetUri,
            fetch_ok: false,
            visible_fallback: false,
            message: "",
        };
        try {
            const res = await fetch(item.assetUri, { cache: "no-store" });
            status.fetch_ok = res.ok;
            status.message = res.ok ? `asset fetch ${res.status}` : `asset fetch failed ${res.status}`;
            status.visible_fallback = !res.ok;
        }
        catch (err) {
            status.message = `asset fetch error: ${err.message}`;
            status.visible_fallback = true;
        }
        results.push(status);
    }
    return {
        validation,
        items: results,
        reconstructor_step: "Phase 3 replaces this visible DOM scaffold with GLTFLoader + VRM bone attach + localTransform + physics-last ordering.",
    };
}
