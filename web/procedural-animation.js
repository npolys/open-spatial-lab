import * as THREE from "./vendor/scene-core/vendor/three/three.module.js";
function clipFor(vrm, name, duration, amplitude, speed = 1) {
    const times = [0, duration * 0.25, duration * 0.5, duration * 0.75, duration];
    const tracks = [];
    const definitions = [
        ["leftUpperLeg", 1], ["rightUpperLeg", -1],
        ["leftLowerLeg", -0.55], ["rightLowerLeg", 0.55],
        ["leftUpperArm", -0.8], ["rightUpperArm", 0.8],
        ["spine", 0.12],
    ];
    for (const [boneName, direction] of definitions) {
        const bone = vrm.humanoid?.getNormalizedBoneNode(boneName);
        if (!bone)
            continue;
        const values = [];
        for (let index = 0; index < times.length; index += 1) {
            const phase = Math.sin((index / (times.length - 1)) * Math.PI * 2 * speed);
            const delta = new THREE.Quaternion().setFromEuler(new THREE.Euler(amplitude * direction * phase, 0, 0));
            const pose = bone.quaternion.clone().multiply(delta);
            values.push(pose.x, pose.y, pose.z, pose.w);
        }
        tracks.push(new THREE.QuaternionKeyframeTrack(`${bone.name}.quaternion`, times, values));
    }
    return new THREE.AnimationClip(name, duration, tracks);
}
export async function createRetargetedLocomotionClips(vrm) {
    return {
        idle: clipFor(vrm, "idle", 2.4, 0.025),
        walk: clipFor(vrm, "walk", 1.05, 0.42),
        run: clipFor(vrm, "run", 0.68, 0.7),
        jump: clipFor(vrm, "jump", 0.7, 0.5, 0.5),
    };
}
