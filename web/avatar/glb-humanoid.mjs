import * as THREE from "../vendor/scene-core/vendor/three/three.module.js";
import { VRMHumanoid } from "../vendor-vrm/three-vrm.module.js";
import { MIXAMO_TO_VRM, measureAnatomicalFrame } from "../procedural-animation.js";
const BASE_TO_VRM_BONE = Object.freeze(Object.entries(MIXAMO_TO_VRM).reduce((map, [mixamoName, vrmBone]) => {
    map[mixamoName.replace(/^mixamorig/i, "").toLowerCase()] = vrmBone;
    return map;
}, {}));
const REQUIRED_VRM_BONES = Object.freeze([
    "hips",
    "spine",
    "head",
    "leftUpperArm",
    "leftLowerArm",
    "leftHand",
    "rightUpperArm",
    "rightLowerArm",
    "rightHand",
    "leftUpperLeg",
    "leftLowerLeg",
    "leftFoot",
    "rightUpperLeg",
    "rightLowerLeg",
    "rightFoot",
]);
const ARM_CHAIN = Object.freeze([
    ["leftShoulder", "leftUpperArm", "left"],
    ["leftUpperArm", "leftLowerArm", "left"],
    ["leftLowerArm", "leftHand", "left"],
    ["leftHand", "leftMiddleProximal", "left"],
    ["rightShoulder", "rightUpperArm", "right"],
    ["rightUpperArm", "rightLowerArm", "right"],
    ["rightLowerArm", "rightHand", "right"],
    ["rightHand", "rightMiddleProximal", "right"],
]);
export function normalizeRestPoseToTPose(scene, bones) {
    const frame = measureAnatomicalFrame((name) => (bones[name] ? bones[name].node : null));
    if (!frame) {
        return {
            applied: false,
            reason: "could not measure an anatomical frame (missing hips/head/upper-arm bones)",
            corrections: {},
            residuals: {},
            skipped: [],
            max_correction_deg: 0,
            max_residual_deg: 0,
        };
    }
    scene.updateMatrixWorld(true);
    const corrections = {};
    const residuals = {};
    const skipped = [];
    const boneWorld = new THREE.Vector3();
    const childWorld = new THREE.Vector3();
    const boneQuat = new THREE.Quaternion();
    const parentQuat = new THREE.Quaternion();
    const swing = new THREE.Quaternion();
    for (const [boneName, childName, side] of ARM_CHAIN) {
        const bone = bones[boneName] && bones[boneName].node;
        const child = bones[childName] && bones[childName].node;
        if (!bone || !child) {
            skipped.push(`${boneName} (no ${childName} to measure its direction)`);
            continue;
        }
        bone.getWorldPosition(boneWorld);
        child.getWorldPosition(childWorld);
        const direction = childWorld.clone().sub(boneWorld);
        if (direction.lengthSq() < 1e-10) {
            skipped.push(`${boneName} (zero-length bone)`);
            continue;
        }
        direction.normalize();
        const target = side === "left" ? frame.left : frame.left.clone().negate();
        const offBy = (Math.acos(Math.max(-1, Math.min(1, direction.dot(target)))) * 180) / Math.PI;
        swing.setFromUnitVectors(direction, target);
        bone.getWorldQuaternion(boneQuat);
        if (bone.parent)
            bone.parent.getWorldQuaternion(parentQuat);
        else
            parentQuat.identity();
        bone.quaternion.copy(parentQuat.invert()).multiply(swing).multiply(boneQuat);
        bone.updateMatrixWorld(true);
        corrections[boneName] = Number(offBy.toFixed(2));
        bone.getWorldPosition(boneWorld);
        child.getWorldPosition(childWorld);
        const after = childWorld.clone().sub(boneWorld).normalize();
        residuals[boneName] = Number(((Math.acos(Math.max(-1, Math.min(1, after.dot(target)))) * 180) / Math.PI).toFixed(3));
    }
    return {
        applied: Object.keys(corrections).length > 0,
        corrections,
        residuals,
        skipped,
        max_correction_deg: Object.values(corrections).reduce((m, d) => Math.max(m, d), 0),
        max_residual_deg: Object.values(residuals).reduce((m, d) => Math.max(m, d), 0),
        reason: null,
    };
}
export function normalizeLegBindCoronal(scene, bones) {
    const frame = measureAnatomicalFrame((name) => (bones[name] ? bones[name].node : null));
    if (!frame) {
        return {
            applied: false,
            reason: "could not measure an anatomical frame (missing hips/head/upper-arm bones)",
            corrections: {},
            residuals: {},
            sagittal_before: {},
            sagittal_after: {},
            skipped: [],
            max_correction_deg: 0,
            max_residual_deg: 0,
            max_sagittal_drift_deg: 0,
        };
    }
    scene.updateMatrixWorld(true);
    const clampUnit = (x) => Math.max(-1, Math.min(1, x));
    const toDeg = (r) => (r * 180) / Math.PI;
    const corrections = {};
    const residuals = {};
    const sagittalBefore = {};
    const sagittalAfter = {};
    const skipped = [];
    const hipWorld = new THREE.Vector3();
    const footWorld = new THREE.Vector3();
    const boneQuat = new THREE.Quaternion();
    const parentQuat = new THREE.Quaternion();
    const swing = new THREE.Quaternion();
    for (const side of ["left", "right"]) {
        const upperLegName = `${side}UpperLeg`;
        const footName = `${side}Foot`;
        const upperLeg = bones[upperLegName] && bones[upperLegName].node;
        const foot = bones[footName] && bones[footName].node;
        if (!upperLeg || !foot) {
            skipped.push(`${upperLegName} (no ${footName} to measure the leg line)`);
            continue;
        }
        upperLeg.getWorldPosition(hipWorld);
        foot.getWorldPosition(footWorld);
        const leg = footWorld.clone().sub(hipWorld);
        if (leg.lengthSq() < 1e-10) {
            skipped.push(`${upperLegName} (zero-length leg line)`);
            continue;
        }
        leg.normalize();
        const sagittal = leg.dot(frame.forward);
        sagittalBefore[side] = Number(toDeg(Math.asin(clampUnit(sagittal))).toFixed(3));
        const coronal = leg.clone().addScaledVector(frame.forward, -sagittal);
        if (coronal.lengthSq() < 1e-8) {
            skipped.push(`${upperLegName} (leg lies on the sagittal axis; no coronal DOF)`);
            sagittalAfter[side] = sagittalBefore[side];
            continue;
        }
        coronal.normalize();
        const verticalSign = Math.sign(coronal.dot(frame.up)) || -1;
        const target = frame.up.clone().multiplyScalar(verticalSign);
        corrections[side] = Number(toDeg(Math.acos(clampUnit(coronal.dot(target)))).toFixed(3));
        swing.setFromUnitVectors(coronal, target);
        upperLeg.getWorldQuaternion(boneQuat);
        if (upperLeg.parent)
            upperLeg.parent.getWorldQuaternion(parentQuat);
        else
            parentQuat.identity();
        upperLeg.quaternion.copy(parentQuat.invert()).multiply(swing).multiply(boneQuat);
        upperLeg.updateMatrixWorld(true);
        upperLeg.getWorldPosition(hipWorld);
        foot.getWorldPosition(footWorld);
        const after = footWorld.clone().sub(hipWorld).normalize();
        const sagittalAfterVal = after.dot(frame.forward);
        sagittalAfter[side] = Number(toDeg(Math.asin(clampUnit(sagittalAfterVal))).toFixed(3));
        const afterCoronal = after.clone().addScaledVector(frame.forward, -sagittalAfterVal);
        residuals[side] =
            afterCoronal.lengthSq() < 1e-8
                ? 0
                : Number(toDeg(Math.acos(clampUnit(afterCoronal.normalize().dot(target)))).toFixed(3));
    }
    const sides = Object.keys(corrections);
    return {
        applied: sides.length > 0,
        corrections,
        residuals,
        sagittal_before: sagittalBefore,
        sagittal_after: sagittalAfter,
        skipped,
        max_correction_deg: Object.values(corrections).reduce((m, d) => Math.max(m, d), 0),
        max_residual_deg: Object.values(residuals).reduce((m, d) => Math.max(m, d), 0),
        max_sagittal_drift_deg: sides.reduce((m, s) => Math.max(m, Math.abs(sagittalAfter[s] - sagittalBefore[s])), 0),
        reason: null,
    };
}
export function baseBoneName(name) {
    return String(name || "")
        .replace(/^mixamorig[:_]?/i, "")
        .replace(/_\d+$/, "")
        .toLowerCase();
}
export function buildGlbHumanoid(scene, { normalizeRestPose = true, normalizeLegBind = true } = {}) {
    const mappedBones = {};
    const humanBones = {};
    let skinnedMeshCount = 0;
    scene.updateMatrixWorld(true);
    scene.traverse((node) => {
        if (node.isSkinnedMesh)
            skinnedMeshCount += 1;
        if (!node.isBone)
            return;
        const vrmBone = BASE_TO_VRM_BONE[baseBoneName(node.name)];
        if (!vrmBone || humanBones[vrmBone])
            return;
        humanBones[vrmBone] = { node };
        mappedBones[vrmBone] = node.name;
    });
    const missingRequiredBones = REQUIRED_VRM_BONES.filter((bone) => !humanBones[bone]);
    const mappedBoneCount = Object.keys(humanBones).length;
    if (skinnedMeshCount === 0) {
        return {
            ok: false,
            humanoid: null,
            mappedBoneCount,
            mappedBones,
            missingRequiredBones,
            skinnedMeshCount,
            reason: "GLB has no SkinnedMesh — there is no skeleton to drive",
        };
    }
    if (missingRequiredBones.length) {
        return {
            ok: false,
            humanoid: null,
            mappedBoneCount,
            mappedBones,
            missingRequiredBones,
            skinnedMeshCount,
            reason: `GLB skeleton is missing required humanoid bones: ${missingRequiredBones.join(", ")}`,
        };
    }
    const restPoseNormalization = normalizeRestPose
        ? normalizeRestPoseToTPose(scene, humanBones)
        : { applied: false, corrections: {}, skipped: [], max_correction_deg: 0, reason: "DISABLED (--negative falsification mode)" };
    scene.updateMatrixWorld(true);
    const legBindNormalization = normalizeLegBind
        ? normalizeLegBindCoronal(scene, humanBones)
        : {
            applied: false,
            corrections: {},
            residuals: {},
            sagittal_before: {},
            sagittal_after: {},
            skipped: [],
            max_correction_deg: 0,
            max_residual_deg: 0,
            max_sagittal_drift_deg: 0,
            reason: "DISABLED (runtime isolation/measurement mode)",
        };
    scene.updateMatrixWorld(true);
    const humanoid = new VRMHumanoid(humanBones);
    scene.add(humanoid.normalizedHumanBonesRoot);
    return {
        ok: true,
        humanoid,
        mappedBoneCount,
        mappedBones,
        missingRequiredBones: [],
        skinnedMeshCount,
        restPoseNormalization,
        legBindNormalization,
        reason: null,
    };
}
export function createGlbHumanoidAvatar(scene, options = {}) {
    const report = buildGlbHumanoid(scene, options);
    if (!report.ok)
        return { avatar: null, report };
    const avatar = {
        scene,
        humanoid: report.humanoid,
        meta: { metaVersion: "1", metaSource: "glb-mixamo-humanoid-facade" },
        isGlbHumanoid: true,
        glbHumanoidReport: report,
        update() {
            report.humanoid.update();
        },
    };
    return { avatar, report };
}
export { BASE_TO_VRM_BONE, REQUIRED_VRM_BONES };
