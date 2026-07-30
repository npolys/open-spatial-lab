export const LEGACY_WORLD_PRESENTATION = Object.freeze({
    authority: "shared_canonical_legacy_world_presentation_v1",
    includeProductGrid: true,
    productGridName: "canonical-world-debug-grid",
});
// Takes an already-constructed adapter (engine-agnostic) rather than building one internally,
// so the same function works under ThreeRenderAdapter or X3DOMRenderAdapter. `scene` is the
// container to mount into — caller-owned, since scene.js/scene-runtime-controller.mjs each
// manage their own scene root (which is usually, but not necessarily, `adapter.sceneRoot`).
export function mountCanonicalWorldContent(A, scene, world) {
    if (!A || !scene)
        throw new Error("canonical world content requires an adapter and a scene");
    const roomColor = A.createColor(world?.color || "#3aa0ff");
    const ambient = A.createAmbientLight({ color: 0xffffff, intensity: 0.75 });
    A.setName(ambient, "canonical-world-ambient");
    A.add(scene, ambient);
    const key = A.createDirectionalLight({ color: 0xffffff, intensity: 0.9, position: [4, 8, 6] });
    A.setName(key, "canonical-world-key");
    A.add(scene, key);
    const floorColor = A.multiplyColorScalar(roomColor, 0.35);
    const floor = A.createMesh(A.createGeometry({ type: "plane", width: 12, height: 12 }), A.createMaterial({
        type: "standard",
        color: floorColor,
        roughness: 0.95,
    }));
    A.setName(floor, "canonical-world-floor");
    A.setRotationAxis(floor, "x", -Math.PI / 2);
    A.add(scene, floor);
    let grid = null;
    if (LEGACY_WORLD_PRESENTATION.includeProductGrid) {
        grid = A.createGridHelper({ size: 12, divisions: 12, colorCenterLine: 0xffffff, colorGrid: 0x88aacc, opacity: 0.28, transparent: true });
        A.setName(grid, LEGACY_WORLD_PRESENTATION.productGridName);
        A.add(scene, grid);
    }
    const wallColor = A.multiplyColorScalar(roomColor, 0.55);
    const wallMaterialDesc = { type: "standard", color: wallColor, roughness: 0.9, side: "double" };
    const backWall = A.createMesh(A.createGeometry({ type: "plane", width: 12, height: 5 }), A.createMaterial(wallMaterialDesc));
    A.setName(backWall, "canonical-world-wall-z");
    A.setPosition(backWall, 0, 2.5, -6);
    A.add(scene, backWall);
    // A fresh material (not a shared/cloned instance) — same params, its own instance, matching
    // the visual result of the original THREE .clone() without depending on a clone() method
    // existing on every engine's material handle.
    const leftWall = A.createMesh(A.createGeometry({ type: "plane", width: 12, height: 5 }), A.createMaterial(wallMaterialDesc));
    A.setName(leftWall, "canonical-world-wall-x");
    A.setRotationAxis(leftWall, "y", Math.PI / 2);
    A.setPosition(leftWall, -6, 2.5, 0);
    A.add(scene, leftWall);
    return {
        source: "shared_canonical_legacy_world_builder",
        world_color: `#${A.colorToHexString(roomColor)}`,
        floor_color: `#${A.colorToHexString(floorColor)}`,
        wall_color: `#${A.colorToHexString(wallColor)}`,
        semantic_inventory: [floor.name, grid ? grid.name : null, backWall.name, leftWall.name],
        presentation_policy: LEGACY_WORLD_PRESENTATION.authority,
        product_grid_name: grid ? grid.name : null,
        debug_grid_included: !!grid,
    };
}
export default { LEGACY_WORLD_PRESENTATION, mountCanonicalWorldContent };
