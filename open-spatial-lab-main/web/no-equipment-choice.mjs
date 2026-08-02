export const EQUIPMENT_CHOICE_EQUIPPED = "equipped";
export const NO_EQUIPMENT_CHOICE = Object.freeze({
    value: "none",
    label: "None / Remove all equipment",
    ariaLabel: "None — remove all equipped items",
    description: "Show the full avatar with no held or worn equipment.",
});
export function createDefaultEquipmentSelection() {
    return { choice: NO_EQUIPMENT_CHOICE.value, equippedItems: [] };
}
export function applyNoEquipmentChoice(equippedItems) {
    if (!Array.isArray(equippedItems)) {
        throw new TypeError("equippedItems must be an array");
    }
    return [];
}
export function equipmentChoiceForItems(equippedItems) {
    return Array.isArray(equippedItems) && equippedItems.length > 0
        ? EQUIPMENT_CHOICE_EQUIPPED
        : NO_EQUIPMENT_CHOICE.value;
}
export function restoreEquipmentSelection(snapshot) {
    if (!snapshot ||
        snapshot.choice !== EQUIPMENT_CHOICE_EQUIPPED ||
        !Array.isArray(snapshot.equippedItems)) {
        return createDefaultEquipmentSelection();
    }
    return {
        choice: EQUIPMENT_CHOICE_EQUIPPED,
        equippedItems: snapshot.equippedItems.slice(),
    };
}
