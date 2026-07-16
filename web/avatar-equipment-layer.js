import * as THREE from "./vendor/scene-core/vendor/three/three.module.js";
import { GLTFLoader } from "./vendor-three-examples/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "./vendor-three-examples/utils/SkeletonUtils.js";
import { VRMLoaderPlugin } from "./vendor-vrm/three-vrm.module.js";
import { createRetargetedLocomotionClips } from "./procedural-animation.js";
import { createParametricAvatar, DEFAULT_AVATAR_PARAMS } from "./avatar/parametric-avatar.mjs";
const ATTACHMENT_PRESETS = {
    head: { position: [0, 1.55, 0.12], label: "head" },
    chest: { position: [0, 1.08, 0.16], label: "chest" },
    upperChest: { position: [0, 1.22, 0.18], label: "upperChest" },
    rightHand: { position: [0.42, 0.82, 0.18], label: "rightHand" },
    leftHand: { position: [-0.42, 0.82, 0.18], label: "leftHand" },
    hips: { position: [0, 0.72, 0.08], label: "hips" },
};
const MOCAP_URLS = {};
export const AVATAR_VARIANTS = Object.freeze({
    dwarf: {
        key: "dwarf",
        label: "Dwarf stand-in (short and wide)",
        type: "vrm",
        url: "/assets/avatar-dwarf.vrm",
        scale: 0.95,
        rotation_y: Math.PI,
        load_mode: "vrm-humanoid",
        mocap_retarget: "supported",
        equipment_attachment: "vrm-normalized-bones",
        licence: "CC0-1.0",
        licence_holder: "Self-authored",
        structured_unsupported: [],
    },
    parametric: {
        key: "parametric",
        label: "Parametric H-Anim avatar (generated in browser)",
        type: "parametric",
        url: "parametric://hanim-19774/default",
        parametric: true,
        params: DEFAULT_AVATAR_PARAMS,
        scale: 1,
        rotation_y: 0,
        load_mode: "parametric-generated",
        mocap_retarget: "supported",
        equipment_attachment: "parametric-normalized-bones",
        structured_unsupported: [],
    },
    "cute-moth": {
        key: "cute-moth",
        label: "Cute Moth",
        type: "vrm",
        url: "/assets/avatars/vrm/CuteMoth_VRM.vrm",
        scale: 0.92,
        rotation_y: Math.PI,
        load_mode: "vrm-humanoid",
        mocap_retarget: "supported_if_vrm_humanoid_bones_present",
        equipment_attachment: "vrm-normalized-bones",
        structured_unsupported: [],
    },
    "cool-waffle": {
        key: "cool-waffle",
        label: "Cool Waffle",
        type: "vrm",
        url: "/assets/avatars/vrm/CoolWaffle_VRM.vrm",
        scale: 0.92,
        rotation_y: Math.PI,
        load_mode: "vrm-humanoid",
        mocap_retarget: "supported_if_vrm_humanoid_bones_present",
        equipment_attachment: "vrm-normalized-bones",
        structured_unsupported: [],
    },
    "cool-banana": {
        key: "cool-banana",
        label: "Cool Banana",
        type: "vrm",
        url: "/assets/avatars/vrm/CoolBanana_VRM.vrm",
        scale: 0.92,
        rotation_y: Math.PI,
        load_mode: "vrm-humanoid",
        mocap_retarget: "supported_if_vrm_humanoid_bones_present",
        equipment_attachment: "vrm-normalized-bones",
        structured_unsupported: [],
    },
    "mushy-voxel": {
        key: "mushy-voxel",
        label: "Mushy Voxel",
        type: "vrm",
        url: "/assets/avatars/vrm/Mushy_Voxel_VRM.vrm",
        scale: 0.92,
        rotation_y: Math.PI,
        load_mode: "vrm-humanoid",
        mocap_retarget: "supported_if_vrm_humanoid_bones_present",
        equipment_attachment: "vrm-normalized-bones",
        structured_unsupported: [],
    },
    "cool-banana-voxel": {
        key: "cool-banana-voxel",
        label: "Cool Banana Voxel",
        type: "vrm",
        url: "/assets/avatars/vrm/CoolBanana_Voxel_VRM.vrm",
        scale: 0.92,
        rotation_y: Math.PI,
        load_mode: "vrm-humanoid",
        mocap_retarget: "supported_if_vrm_humanoid_bones_present",
        equipment_attachment: "vrm-normalized-bones",
        structured_unsupported: [],
    },
    froggy: {
        key: "froggy",
        label: "Froggy",
        type: "vrm",
        url: "/assets/avatars/vrm/Froggy_VRM.vrm",
        scale: 0.92,
        rotation_y: Math.PI,
        load_mode: "vrm-humanoid",
        mocap_retarget: "supported_if_vrm_humanoid_bones_present",
        equipment_attachment: "vrm-normalized-bones",
        structured_unsupported: [],
    },
    "abissal-dude": {
        key: "abissal-dude",
        label: "Abissal Dude",
        type: "vrm",
        url: "/assets/avatars/vrm/AbissalDude_VRM.vrm",
        scale: 0.92,
        rotation_y: Math.PI,
        load_mode: "vrm-humanoid",
        mocap_retarget: "supported_if_vrm_humanoid_bones_present",
        equipment_attachment: "vrm-normalized-bones",
        structured_unsupported: [],
    },
    "froggy-voxel": {
        key: "froggy-voxel",
        label: "Froggy Voxel",
        type: "vrm",
        url: "/assets/avatars/vrm/Froggy_Voxel_VRM.vrm",
        scale: 0.92,
        rotation_y: Math.PI,
        load_mode: "vrm-humanoid",
        mocap_retarget: "supported_if_vrm_humanoid_bones_present",
        equipment_attachment: "vrm-normalized-bones",
        structured_unsupported: [],
    },
    mushy: {
        key: "mushy",
        label: "Mushy",
        type: "vrm",
        url: "/assets/avatars/vrm/Mushy_VRM.vrm",
        scale: 0.92,
        rotation_y: Math.PI,
        load_mode: "vrm-humanoid",
        mocap_retarget: "supported_if_vrm_humanoid_bones_present",
        equipment_attachment: "vrm-normalized-bones",
        structured_unsupported: [],
    },
    "mr-bush": {
        key: "mr-bush",
        label: "Mr Bush",
        type: "vrm",
        url: "/assets/avatars/vrm/MrBush_VRM.vrm",
        scale: 0.92,
        rotation_y: Math.PI,
        load_mode: "vrm-humanoid",
        mocap_retarget: "supported_if_vrm_humanoid_bones_present",
        equipment_attachment: "vrm-normalized-bones",
        structured_unsupported: [],
    },
    "bad-bot": {
        key: "bad-bot",
        label: "Bad Bot",
        type: "vrm",
        url: "/assets/avatars/vrm/BadBot_VRM.vrm",
        scale: 0.92,
        rotation_y: Math.PI,
        load_mode: "vrm-humanoid",
        mocap_retarget: "supported_if_vrm_humanoid_bones_present",
        equipment_attachment: "vrm-normalized-bones",
        structured_unsupported: [],
    },
});
export const DEFAULT_AVATAR_VARIANT = "dwarf";
export const PREFERRED_HEIGHT_BOUNDS_M = Object.freeze({ min: 0.6, max: 2.6 });
const HEAD_ITEM_SINK_FRACTION = Object.freeze({
    "equip-crown": 0.34,
    "equip-hat": 0.42,
    "equip-helmet": 0.55,
    _default: 0.35,
});
const WORLD_MOVE_SPEED_MPS = 2.35;
const WALK_NATURAL_SPEED_MPS = 1.55;
const LOCOMOTION_CROSSFADE_S = 0.22;
const JUMP_PLAYBACK_FAULT = "hidden-clock-repeat";
function jumpPlaybackStatus(fault) {
    const mutationActive = fault === JUMP_PLAYBACK_FAULT;
    return {
        policy: mutationActive ? "fault-hidden-clock-repeat" : "takeoff-reset-loop-once",
        mutation_active: mutationActive,
        fault: mutationActive ? fault : null,
        clip_duration_seconds: null,
        action_time_seconds: 0,
        normalized_time: 0,
        effective_weight: 0,
        effective_time_scale: 1,
        loop_mode: mutationActive ? "LoopRepeat" : "LoopOnce",
        repetitions: mutationActive ? "Infinity" : 1,
        clamp_when_finished: !mutationActive,
        paused: !mutationActive,
        running: false,
        finished: false,
        airborne: false,
        phase: "unloaded",
        cycle_count: 0,
        takeoff_reset_count: 0,
        landing_count: 0,
        midair_restart_count: 0,
        takeoff_action_time_seconds: null,
        takeoff_weight: null,
        landing_action_time_seconds: null,
    };
}
function countMeshes(root) {
    let count = 0;
    root.traverse((node) => {
        if (node.isMesh || node.isSkinnedMesh)
            count += 1;
    });
    return count;
}
function countNonIdentityQuaternionSamples(clip) {
    let count = 0;
    for (const track of clip.tracks) {
        if (track.ValueTypeName !== "quaternion")
            continue;
        for (let i = 0; i < track.values.length; i += 4) {
            const x = track.values[i] || 0;
            const y = track.values[i + 1] || 0;
            const z = track.values[i + 2] || 0;
            const w = track.values[i + 3] || 1;
            if (Math.abs(x) + Math.abs(y) + Math.abs(z) > 1e-5 || Math.abs(w - 1) > 1e-5)
                count += 1;
        }
    }
    return count;
}
function applyLocalTransform(object, item) {
    const t = item.localTransform || {};
    const q = t.quaternion || t.rotation || [0, 0, 0, 1];
    const p = t.position || [0, 0, 0];
    const s = t.scale || [1, 1, 1];
    object.position.set(p[0], p[1], p[2]);
    object.quaternion.set(q[0], q[1], q[2], q[3]);
    object.scale.set(s[0], s[1], s[2]);
}
function withRigMetrics(vrm, model) {
    return { vrm, model, metrics: measureRigMetrics(model, vrm) };
}
function avatarBodyBounds(model, detail = null) {
    const box = new THREE.Box3().makeEmpty();
    const isEquipment = (node) => {
        for (let p = node; p && p !== model; p = p.parent) {
            if (p.name && p.name.startsWith("attached-equipment-"))
                return true;
        }
        return false;
    };
    model.updateWorldMatrix(true, true);
    let topMesh = null;
    let topY = -Infinity;
    model.traverse((node) => {
        if (!node.isMesh && !node.isSkinnedMesh)
            return;
        if (!node.geometry || isEquipment(node))
            return;
        if (node.visible === false)
            return;
        if (!node.geometry.boundingBox)
            node.geometry.computeBoundingBox();
        if (!node.geometry.boundingBox)
            return;
        const b = node.geometry.boundingBox.clone().applyMatrix4(node.matrixWorld);
        if (b.max.y > topY) {
            topY = b.max.y;
            topMesh = node.name || "(unnamed)";
        }
        box.union(b);
    });
    if (detail) {
        detail.top_mesh = topMesh;
        detail.top_y = Number.isFinite(topY) ? Number(topY.toFixed(4)) : null;
    }
    return box.isEmpty() ? null : box;
}
const HEAD_SUPPORT_WIDTH_FRACTION = 0.5;
const SKULL_SLAB_M = 0.01;
function measureSkullTopY(model, headBone) {
    if (!headBone)
        return null;
    const headY = headBone.getWorldPosition(new THREE.Vector3()).y;
    const boneIndexBySkeleton = new Map();
    const slabs = new Map();
    const v = new THREE.Vector3();
    let found = 0;
    model.traverse((mesh) => {
        if (!mesh.isSkinnedMesh || mesh.visible === false || !mesh.geometry || !mesh.skeleton)
            return;
        let boneIndex = boneIndexBySkeleton.get(mesh.skeleton);
        if (boneIndex === undefined) {
            boneIndex = mesh.skeleton.bones.indexOf(headBone);
            boneIndexBySkeleton.set(mesh.skeleton, boneIndex);
        }
        if (boneIndex < 0)
            return;
        const position = mesh.geometry.attributes.position;
        const skinIndex = mesh.geometry.attributes.skinIndex;
        const skinWeight = mesh.geometry.attributes.skinWeight;
        if (!position || !skinIndex || !skinWeight)
            return;
        for (let i = 0; i < position.count; i += 1) {
            let weight = 0;
            for (let k = 0; k < 4; k += 1) {
                if (skinIndex.getComponent(i, k) === boneIndex)
                    weight += skinWeight.getComponent(i, k);
            }
            if (weight < 0.5)
                continue;
            v.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
            found += 1;
            const key = Math.floor((v.y - headY) / SKULL_SLAB_M);
            let slab = slabs.get(key);
            if (!slab)
                slabs.set(key, (slab = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity }));
            if (v.x < slab.minX)
                slab.minX = v.x;
            if (v.x > slab.maxX)
                slab.maxX = v.x;
            if (v.z < slab.minZ)
                slab.minZ = v.z;
            if (v.z > slab.maxZ)
                slab.maxZ = v.z;
        }
    });
    if (!found || !slabs.size)
        return null;
    let widest = 0;
    const support = new Map();
    for (const [key, s] of slabs) {
        const width = Math.min(s.maxX - s.minX, s.maxZ - s.minZ);
        support.set(key, width);
        if (width > widest)
            widest = width;
    }
    if (!(widest > 0))
        return null;
    const minSupport = widest * HEAD_SUPPORT_WIDTH_FRACTION;
    let topKey = null;
    for (const [key, width] of support) {
        if (width >= minSupport && (topKey === null || key > topKey))
            topKey = key;
    }
    if (topKey === null)
        return null;
    return {
        skull_top_y: headY + (topKey + 1) * SKULL_SLAB_M,
        head_widest_support_m: Number(widest.toFixed(4)),
        head_vertices: found,
    };
}
export function seatHeadItem(object, item, headTop) {
    if (!Number.isFinite(headTop) || headTop <= 0.001)
        return null;
    const savedY = object.position.y;
    object.position.y = 0;
    object.updateMatrixWorld(true);
    const asset = object.children.find((c) => c.name && c.name.startsWith("asset-"));
    const box = new THREE.Box3().setFromObject(asset || object);
    if (box.isEmpty()) {
        object.position.y = savedY;
        return null;
    }
    const itemHeight = box.max.y - box.min.y;
    const sink = HEAD_ITEM_SINK_FRACTION[item.itemId] !== undefined
        ? HEAD_ITEM_SINK_FRACTION[item.itemId]
        : HEAD_ITEM_SINK_FRACTION._default;
    object.position.y = headTop - box.min.y - itemHeight * sink;
    return {
        head_top_offset_m: Number(headTop.toFixed(4)),
        item_height_m: Number(itemHeight.toFixed(4)),
        item_underside_m: Number(box.min.y.toFixed(4)),
        sink_fraction: sink,
        authored_y_m: savedY,
        seated_y_m: Number(object.position.y.toFixed(4)),
    };
}
export function measureRigMetrics(model, vrm) {
    const metrics = {
        natural_height_m: null,
        head_bone_y_m: null,
        head_top_offset_m: null,
        head_silhouette_offset_m: null,
        head_top_source: null,
        sole_y_m: null,
    };
    try {
        model.updateWorldMatrix(true, true);
        const bounds = avatarBodyBounds(model);
        if (!bounds)
            return metrics;
        const rootY = new THREE.Vector3();
        model.getWorldPosition(rootY);
        metrics.natural_height_m = Number((bounds.max.y - bounds.min.y).toFixed(4));
        metrics.sole_y_m = Number((bounds.min.y - rootY.y).toFixed(4));
        const head = vrm && vrm.humanoid && typeof vrm.humanoid.getRawBoneNode === "function"
            ? vrm.humanoid.getRawBoneNode("head")
            : null;
        if (head) {
            const headWorld = new THREE.Vector3();
            head.getWorldPosition(headWorld);
            metrics.head_bone_y_m = Number((headWorld.y - rootY.y).toFixed(4));
            metrics.head_silhouette_offset_m = Number((bounds.max.y - headWorld.y).toFixed(4));
            const skull = measureSkullTopY(model, head);
            if (skull) {
                metrics.head_top_offset_m = Number((skull.skull_top_y - headWorld.y).toFixed(4));
                metrics.head_top_source = "measured-skull";
                metrics.head_widest_support_m = skull.head_widest_support_m;
                metrics.head_vertices_measured = skull.head_vertices;
            }
            else {
                metrics.head_top_offset_m = metrics.head_silhouette_offset_m;
                metrics.head_top_source = "silhouette-fallback (no head-weighted vertices to measure)";
            }
        }
    }
    catch (err) {
    }
    return metrics;
}
function variantSupportStatus(variant) {
    return {
        avatar_asset_type: variant.type || (variant.parametric ? "parametric" : "vrm"),
        avatar_load_mode: variant.load_mode || (variant.parametric ? "parametric-generated" : "vrm-humanoid"),
        avatar_mocap_retarget: variant.mocap_retarget || "supported",
        avatar_equipment_attachment: variant.equipment_attachment || "vrm-normalized-bones",
        avatar_structured_unsupported: Array.isArray(variant.structured_unsupported) ? variant.structured_unsupported : [],
    };
}
function makeVisualMarker(item) {
    const group = new THREE.Group();
    group.name = `visible-marker-${item.itemId}`;
    const stud = new THREE.Mesh(new THREE.SphereGeometry(0.032, 12, 12), new THREE.MeshStandardMaterial({
        color: item.mode === "held" ? 0xffd166 : 0xe8eefc,
        emissive: item.mode === "held" ? 0xffaa22 : 0x8fa3bf,
        emissiveIntensity: 0.55,
        roughness: 0.35,
    }));
    group.add(stud);
    return group;
}
export async function loadGltfSceneAsset(url) {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(url);
    return (gltf && (gltf.scene || (gltf.scenes && gltf.scenes[0]))) || null;
}
export function cloneGltfSceneAsset(scene) {
    return cloneSkeleton(scene);
}
export class AvatarEquipmentLayer {
    constructor(mount, role, world, options = null) {
        this.mount = mount;
        this.role = role;
        this.world = world;
        this.host = options && options.host && options.host.scene ? options.host : null;
        this.motionPreference = options && options.motionPreference ? options.motionPreference : null;
        this.sharedScene = !!this.host;
        this.avatar = null;
        this.vrm = null;
        this.loadedItemObjects = new Map();
        this.attachedObjects = [];
        this.anchors = {};
        this._equipmentSignature = "";
        this.mixer = null;
        this.actions = null;
        this._animState = "idle";
        const jumpPlaybackFault = typeof window !== "undefined"
            ? new URLSearchParams(window.location.search).get("jump_playback_fault")
            : null;
        this._jumpPlaybackFault = jumpPlaybackFault === JUMP_PLAYBACK_FAULT ? jumpPlaybackFault : null;
        this._lastJumpActionTime = null;
        this._avatarModel = null;
        this._switchInFlight = false;
        this._pendingVariant = null;
        const defaultSupport = variantSupportStatus(AVATAR_VARIANTS[DEFAULT_AVATAR_VARIANT]);
        this.status = {
            renderer: "initializing",
            compositing: this.sharedScene ? "shared-scene-one-depth-buffer" : "own-canvas-overlay",
            real_vrm_attempted: true,
            real_vrm_loaded: false,
            avatar_static_glb_loaded: false,
            avatar_variant: DEFAULT_AVATAR_VARIANT,
            avatar_variant_label: AVATAR_VARIANTS[DEFAULT_AVATAR_VARIANT].label,
            avatar_switch_count: 0,
            avatar_switch_in_flight: false,
            avatar_asset_uri: AVATAR_VARIANTS[DEFAULT_AVATAR_VARIANT].url,
            ...defaultSupport,
            walk_animation_asset_uri: MOCAP_URLS.locomotion,
            run_animation_asset_uri: MOCAP_URLS.locomotion,
            retargeter: "self-authored procedural animation on the normalized humanoid rig",
            retargeted_walk_loaded: false,
            retargeted_run_loaded: false,
            retargeted_track_count: 0,
            retargeted_non_identity_quaternion_samples: 0,
            locomotion_clips: [],
            current_animation_state: "idle",
            walk_playback_rate: Number((WORLD_MOVE_SPEED_MPS / WALK_NATURAL_SPEED_MPS).toFixed(3)),
            locomotion_playback_rate: Number((WORLD_MOVE_SPEED_MPS / WALK_NATURAL_SPEED_MPS).toFixed(3)),
            anim_speed_match: {
                world_move_speed_mps: WORLD_MOVE_SPEED_MPS,
                walk_clip_natural_speed_mps: WALK_NATURAL_SPEED_MPS,
                note: "selected walk/run playback rate = effective world speed / calibrated clip natural speed",
            },
            animation_mixer_active: false,
            animation_time_seconds: 0,
            procedural_pose_active: false,
            fallback_rig_visible: false,
            locomotion_moving: false,
            locomotion_movement_mode: "idle",
            locomotion_run_mode: false,
            locomotion_speed_mps: 0,
            avatar_grounded: true,
            avatar_jump_height_m: 0,
            jump_playback: jumpPlaybackStatus(this._jumpPlaybackFault),
            avatar_visual_scale: 1,
            avatar_model_height_m: null,
            avatar_head_height_m: null,
            avatar_preferred_height_m: null,
            avatar_natural_height_m: null,
            avatar_height_applied: false,
            avatar_height_scale: null,
            rig_metrics: null,
            avatar_visual_visible: false,
            visual_layer_ready: false,
            settled: false,
            attachedItems: [],
            errors: [],
        };
        this.ready = this._init().catch((err) => {
            this.status.renderer = "failed";
            this.status.errors.push(`layer init failed: ${err.message}`);
            this.status.settled = true;
            return this;
        });
    }
    async _init() {
        const w = this.mount.clientWidth || 640;
        const h = this.mount.clientHeight || 420;
        if (this.sharedScene) {
            this.renderer = this.host.renderer || null;
            this.scene = this.host.scene;
            this.camera = this.host.camera || null;
        }
        else {
            this.renderer = new THREE.WebGLRenderer({
                antialias: true,
                alpha: true,
                preserveDrawingBuffer: true,
                failIfMajorPerformanceCaveat: false,
            });
            if (!this.renderer.getContext())
                throw new Error("equipment layer WebGL context unavailable");
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
            this.renderer.setSize(w, h);
            this.renderer.setClearColor(0x000000, 0);
            this.renderer.domElement.className = "avatar-equipment-layer";
            this.renderer.domElement.setAttribute("aria-hidden", "true");
            this.mount.appendChild(this.renderer.domElement);
            this.scene = new THREE.Scene();
            this.camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 100);
            this.camera.position.set(0, 6.2, 8.4);
            this.camera.lookAt(0, 0, 0);
            this.scene.add(new THREE.AmbientLight(0xffffff, 0.7));
            const key = new THREE.DirectionalLight(0xffffff, 0.8);
            key.position.set(3, 6, 4);
            this.scene.add(key);
        }
        this.avatarRig = new THREE.Group();
        this.avatarRig.name = "avatar-equipment-rig";
        this.avatarRig.visible = false;
        this.scene.add(this.avatarRig);
        this.fallbackRig = this._buildFallbackRig();
        this.fallbackRig.visible = false;
        this.avatarRig.add(this.fallbackRig);
        this.clock = new THREE.Clock();
        this.status.renderer = "webgl";
        await this._loadVrm();
        await this._loadLocomotionClips();
        this._syncAvatarTransform();
        this._loop = this._loop.bind(this);
        this._raf = requestAnimationFrame(this._loop);
        if (!this.sharedScene) {
            this._onResize = () => this.resize();
            window.addEventListener("resize", this._onResize);
        }
        this.status.visual_layer_ready = true;
        this.status.settled = true;
        return this;
    }
    _buildFallbackRig() {
        const group = new THREE.Group();
        const bodyMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.16,
            roughness: 0.6,
        });
        const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.75, 6, 14), bodyMat);
        body.name = "fallback-visual-body";
        body.position.y = 0.82;
        group.add(body);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.23, 16, 16), bodyMat);
        head.name = "fallback-visual-head";
        head.position.y = 1.47;
        group.add(head);
        for (const [name, preset] of Object.entries(ATTACHMENT_PRESETS)) {
            const anchor = new THREE.Group();
            anchor.name = `fallback-anchor-${name}`;
            anchor.position.set(preset.position[0], preset.position[1], preset.position[2]);
            group.add(anchor);
            this.anchors[name] = anchor;
        }
        return group;
    }
    _setFallbackRigMeshVisible(visible) {
        if (!this.fallbackRig)
            return;
        this.fallbackRig.traverse((node) => {
            if ((node.isMesh || node.isSkinnedMesh) && node.name && node.name.startsWith("fallback-visual-")) {
                node.visible = visible;
            }
        });
    }
    async _loadVrm(variantKey = this.status.avatar_variant || DEFAULT_AVATAR_VARIANT) {
        const variant = AVATAR_VARIANTS[variantKey] || AVATAR_VARIANTS[DEFAULT_AVATAR_VARIANT];
        try {
            const { vrm, model, metrics } = await this._loadVrmModel(variant);
            this._adoptVrmModel(variant, vrm, model, metrics);
        }
        catch (err) {
            this.status.errors.push(`avatar model load failed; fallback avatar hidden: ${err.message}`);
            this.status.real_vrm_loaded = false;
            this.status.avatar_static_glb_loaded = false;
            this.fallbackRig.visible = false;
            this.status.fallback_rig_visible = false;
        }
    }
    async _loadVrmModel(variant) {
        if (variant.parametric) {
            const parametric = createParametricAvatar(variant.params || DEFAULT_AVATAR_PARAMS);
            return withRigMetrics(parametric, parametric.scene);
        }
        const loader = new GLTFLoader();
        loader.register((parser) => new VRMLoaderPlugin(parser));
        const gltf = await loader.loadAsync(variant.url);
        const vrm = gltf.userData && gltf.userData.vrm ? gltf.userData.vrm : null;
        const model = (vrm && vrm.scene) || gltf.scene;
        return withRigMetrics(vrm, model);
    }
    _adoptVrmModel(variant, vrm, model, metrics = null) {
        const support = variantSupportStatus(variant);
        this._rigMetrics = metrics || measureRigMetrics(model, vrm);
        const isStaticGlb = support.avatar_asset_type === "glb" && !vrm;
        if (this._avatarModel) {
            this.avatarRig.remove(this._avatarModel);
            this._disposeModel(this._avatarModel);
            this._avatarModel = null;
        }
        if (this.mixer) {
            this.mixer.stopAllAction();
            this.mixer = null;
        }
        this.actions = null;
        this.status.animation_mixer_active = false;
        this.vrm = vrm;
        this.status.real_vrm_loaded = !!vrm;
        this.status.avatar_static_glb_loaded = isStaticGlb;
        this.status.avatar_render_source =
            vrm && vrm.isParametric
                ? "parametric-generated-mesh"
                : vrm && vrm.isGlbHumanoid
                    ? "glb-humanoid-rig"
                    : isStaticGlb
                        ? "glb-static-asset"
                        : "vrm-asset";
        this.status.avatar_variant = variant.key;
        this.status.avatar_variant_label = variant.label;
        this.status.avatar_asset_uri = variant.url;
        Object.assign(this.status, support);
        this.status.avatar_scene_mesh_count = countMeshes(model);
        model.name = isStaticGlb ? "static-glb-avatar" : "real-vrm-avatar";
        model.scale.setScalar(this._resolveModelScale(variant));
        model.rotation.y = variant.rotation_y;
        this.avatarRig.add(model);
        this._avatarModel = model;
        this.fallbackRig.visible = isStaticGlb;
        this._setFallbackRigMeshVisible(!isStaticGlb);
        this.status.fallback_rig_visible = isStaticGlb;
        this.status.fallback_anchor_rig_visible = isStaticGlb;
        if (isStaticGlb) {
            this.status.retargeted_walk_loaded = false;
            this.status.retargeted_run_loaded = false;
            this.status.animation_mixer_active = false;
            this.status.current_animation_state = "static-glb";
            this.status.locomotion_clips = [];
        }
        this._measureRenderedHeight(model);
        this.status.rig_metrics = this._rigMetrics;
    }
    _resolveModelScale(variant) {
        const requested = this.status.avatar_preferred_height_m;
        const natural = this._rigMetrics && this._rigMetrics.natural_height_m;
        if (!Number.isFinite(requested) || !Number.isFinite(natural) || natural <= 0.01) {
            this.status.avatar_height_applied = false;
            this.status.avatar_natural_height_m = Number.isFinite(natural) ? natural : null;
            return variant.scale;
        }
        const scale = requested / natural;
        this.status.avatar_height_applied = true;
        this.status.avatar_natural_height_m = natural;
        this.status.avatar_height_scale = Number(scale.toFixed(4));
        return scale;
    }
    async applyPreferredHeightM(heightM) {
        if (heightM === null || heightM === undefined || heightM === "") {
            this.status.avatar_preferred_height_m = null;
        }
        else {
            const h = Number(heightM);
            if (!Number.isFinite(h))
                return { ok: false, error: `preferred height '${heightM}' is not a number` };
            if (h < PREFERRED_HEIGHT_BOUNDS_M.min || h > PREFERRED_HEIGHT_BOUNDS_M.max) {
                return {
                    ok: false,
                    error: `preferred height ${h} m is outside the supported bounds ` +
                        `${PREFERRED_HEIGHT_BOUNDS_M.min}-${PREFERRED_HEIGHT_BOUNDS_M.max} m`,
                };
            }
            this.status.avatar_preferred_height_m = h;
        }
        const model = this._avatarModel;
        const variant = AVATAR_VARIANTS[this.status.avatar_variant] || AVATAR_VARIANTS[DEFAULT_AVATAR_VARIANT];
        if (!model)
            return { ok: true, deferred_until_avatar_loaded: true, preferred_height_m: this.status.avatar_preferred_height_m };
        model.scale.setScalar(this._resolveModelScale(variant));
        this._measureRenderedHeight(model);
        await this._syncEquipment();
        return {
            ok: true,
            preferred_height_m: this.status.avatar_preferred_height_m,
            natural_height_m: this.status.avatar_natural_height_m,
            rendered_height_m: this.status.avatar_model_height_m,
            applied: this.status.avatar_height_applied === true,
        };
    }
    _measureRenderedHeight(model) {
        try {
            const bounds = avatarBodyBounds(model);
            this.status.avatar_model_height_m = bounds ? Number((bounds.max.y - bounds.min.y).toFixed(3)) : null;
        }
        catch (err) {
            this.status.avatar_model_height_m = null;
        }
        try {
            const head = this.vrm && this.vrm.humanoid && typeof this.vrm.humanoid.getRawBoneNode === "function"
                ? this.vrm.humanoid.getRawBoneNode("head")
                : null;
            if (head) {
                model.updateWorldMatrix(true, true);
                const headWorld = new THREE.Vector3();
                head.getWorldPosition(headWorld);
                const rootWorld = new THREE.Vector3();
                model.getWorldPosition(rootWorld);
                this.status.avatar_head_height_m = Number((headWorld.y - rootWorld.y).toFixed(3));
            }
            else {
                this.status.avatar_head_height_m = null;
            }
        }
        catch (err) {
            this.status.avatar_head_height_m = null;
        }
    }
    _seatOnHeadTop(object, item) {
        return seatHeadItem(object, item, this._rigMetrics && this._rigMetrics.head_top_offset_m);
    }
    _disposeModel(root) {
        root.traverse((node) => {
            if (node.geometry && typeof node.geometry.dispose === "function")
                node.geometry.dispose();
            const materials = Array.isArray(node.material) ? node.material : node.material ? [node.material] : [];
            for (const material of materials) {
                for (const value of Object.values(material)) {
                    if (value && value.isTexture && typeof value.dispose === "function")
                        value.dispose();
                }
                if (typeof material.dispose === "function")
                    material.dispose();
            }
        });
    }
    async switchAvatarVariant(variantKey) {
        const variant = AVATAR_VARIANTS[variantKey];
        if (!variant)
            return { ok: false, error: `unknown avatar variant '${variantKey}'` };
        if (variant.key === this.status.avatar_variant &&
            (this.status.real_vrm_loaded || this.status.avatar_static_glb_loaded)) {
            return { ok: true, unchanged: true, variant: variant.key };
        }
        if (this._switchInFlight) {
            this._pendingVariant = variant.key;
            return { ok: true, queued: true, variant: variant.key };
        }
        this._switchInFlight = true;
        this.status.avatar_switch_in_flight = true;
        this.status.settled = false;
        try {
            const { vrm, model, metrics } = await this._loadVrmModel(variant);
            if (!vrm && variant.type !== "glb")
                throw new Error(`${variant.url} is not a VRM`);
            this._adoptVrmModel(variant, vrm, model, metrics);
            await this._loadLocomotionClips();
            await this._syncEquipment();
            this.status.avatar_switch_count += 1;
            return { ok: true, variant: variant.key, support_status: variantSupportStatus(variant) };
        }
        catch (err) {
            this.status.errors.push(`avatar switch to '${variantKey}' failed: ${err.message}`);
            return { ok: false, error: err.message };
        }
        finally {
            this._switchInFlight = false;
            this.status.avatar_switch_in_flight = false;
            this.status.settled = true;
            const pending = this._pendingVariant;
            this._pendingVariant = null;
            if (pending && pending !== this.status.avatar_variant)
                this.switchAvatarVariant(pending);
        }
    }
    async _loadLocomotionClips() {
        if (!this.status.real_vrm_loaded) {
            this.status.retargeted_walk_loaded = false;
            this.status.retargeted_track_count = 0;
            this.status.retargeted_non_identity_quaternion_samples = 0;
            this.status.locomotion_clips = [];
            this.status.animation_mixer_active = false;
            if (this.status.avatar_static_glb_loaded)
                this.status.current_animation_state = "static-glb";
            return;
        }
        try {
            const clips = await createRetargetedLocomotionClips(this.vrm, MOCAP_URLS);
            if (!clips.walk || !clips.walk.tracks.length)
                throw new Error("retargeted walk produced no tracks");
            this.mixer = new THREE.AnimationMixer(this.vrm.scene);
            this.actions = {};
            this.status.jump_playback = jumpPlaybackStatus(this._jumpPlaybackFault);
            this._lastJumpActionTime = null;
            for (const [state, clip] of Object.entries(clips)) {
                const action = this.mixer.clipAction(clip);
                action.enabled = true;
                const isJump = state === "jump";
                const useFault = isJump && this._jumpPlaybackFault === JUMP_PLAYBACK_FAULT;
                action.setLoop(isJump && !useFault ? THREE.LoopOnce : THREE.LoopRepeat, isJump && !useFault ? 1 : Infinity);
                action.clampWhenFinished = isJump && !useFault;
                action.setEffectiveWeight(state === "idle" ? 1 : 0);
                action.play();
                if (isJump && !useFault)
                    action.paused = true;
                this.actions[state] = action;
            }
            this.actions.walk.setEffectiveTimeScale(WORLD_MOVE_SPEED_MPS / WALK_NATURAL_SPEED_MPS);
            this._animState = "idle";
            this.status.retargeted_walk_loaded = true;
            this.status.retargeted_run_loaded = Boolean(clips.run && clips.run.tracks.length);
            this.status.retarget_source_animation =
                "self-authored procedural idle, walk, run, and jump clips";
            this.status.retargeted_track_count = clips.walk.tracks.length;
            this.status.retargeted_track_names = clips.walk.tracks.map((track) => track.name).slice(0, 40);
            this.status.retargeted_non_identity_quaternion_samples = countNonIdentityQuaternionSamples(clips.walk);
            this.status.locomotion_clips = Object.values(clips).map((clip) => `${clip.name}(${clip.duration.toFixed(2)}s,${clip.tracks.length}t)`);
            this.status.animation_mixer_active = true;
            this.status.mapped_bone_count = clips.walk.tracks.filter((t) => t.name.endsWith(".quaternion")).length;
            this._syncJumpPlaybackTelemetry();
        }
        catch (err) {
            this.status.errors.push(`locomotion clip load failed: ${err.message}`);
            this.status.retargeted_walk_loaded = false;
            this.status.retargeted_run_loaded = false;
            this.status.animation_mixer_active = false;
        }
    }
    _updateLocomotionState(delta) {
        if (!this.actions)
            return;
        const airborne = this.status.avatar_grounded === false || (this.status.avatar_jump_height_m || 0) > 0.02;
        const desired = airborne && this.actions.jump
            ? "jump"
            : this.status.locomotion_movement_mode === "run" && this.actions.run
                ? "run"
                : this.status.locomotion_moving
                    ? "walk"
                    : "idle";
        const previous = this._animState;
        if (desired !== previous) {
            const jump = this.actions.jump;
            const playback = this.status.jump_playback;
            if (desired === "jump" && jump) {
                playback.cycle_count += 1;
                if (this._jumpPlaybackFault !== JUMP_PLAYBACK_FAULT) {
                    jump.reset();
                    jump.setLoop(THREE.LoopOnce, 1);
                    jump.clampWhenFinished = true;
                    jump.setEffectiveTimeScale(1);
                    jump.play();
                    playback.takeoff_reset_count += 1;
                }
                playback.takeoff_action_time_seconds = Number(jump.time.toFixed(4));
                playback.takeoff_weight = Number(jump.getEffectiveWeight().toFixed(4));
                this._lastJumpActionTime = jump.time;
            }
            else if (previous === "jump" && jump) {
                playback.landing_count += 1;
                playback.landing_action_time_seconds = Number(jump.time.toFixed(4));
                this._lastJumpActionTime = null;
            }
            this._animState = desired;
        }
        this.status.current_animation_state = this._animState;
        if ((desired === "walk" || desired === "run") && this.actions[desired]) {
            const speedMps = Number(this.status.locomotion_speed_mps) || WORLD_MOVE_SPEED_MPS;
            const playbackRate = speedMps / WALK_NATURAL_SPEED_MPS;
            this.actions[desired].setEffectiveTimeScale(playbackRate);
            this.status.locomotion_playback_rate = Number(playbackRate.toFixed(3));
        }
        const step = LOCOMOTION_CROSSFADE_S > 0 ? delta / LOCOMOTION_CROSSFADE_S : 1;
        for (const [state, action] of Object.entries(this.actions)) {
            const target = state === this._animState ? 1 : 0;
            const weight = action.getEffectiveWeight();
            const next = target > weight ? Math.min(target, weight + step) : Math.max(target, weight - step);
            action.setEffectiveWeight(next);
        }
    }
    _syncJumpPlaybackTelemetry() {
        const action = this.actions && this.actions.jump;
        const playback = this.status.jump_playback;
        if (!action || !playback)
            return;
        const duration = Number(action.getClip().duration) || 0;
        const time = Number(action.time) || 0;
        const airborne = this.status.avatar_grounded === false || (this.status.avatar_jump_height_m || 0) > 0.02;
        if (airborne &&
            this._lastJumpActionTime !== null &&
            time + 0.05 < this._lastJumpActionTime) {
            playback.midair_restart_count += 1;
        }
        this._lastJumpActionTime = airborne ? time : null;
        playback.clip_duration_seconds = Number(duration.toFixed(4));
        playback.action_time_seconds = Number(time.toFixed(4));
        playback.normalized_time = duration > 0 ? Number((time / duration).toFixed(4)) : 0;
        playback.effective_weight = Number(action.getEffectiveWeight().toFixed(4));
        playback.effective_time_scale = Number(action.getEffectiveTimeScale().toFixed(4));
        playback.loop_mode = action.loop === THREE.LoopOnce
            ? "LoopOnce"
            : action.loop === THREE.LoopPingPong
                ? "LoopPingPong"
                : "LoopRepeat";
        playback.repetitions = Number.isFinite(action.repetitions) ? action.repetitions : "Infinity";
        playback.clamp_when_finished = action.clampWhenFinished === true;
        playback.paused = action.paused === true;
        playback.running = action.isRunning();
        playback.finished = action.paused === true && duration > 0 && time >= duration - 0.0001;
        playback.airborne = airborne;
        playback.phase = !airborne
            ? "grounded"
            : time < 0.18
                ? "crouch-launch"
                : time < 0.42
                    ? "airborne-tuck"
                    : time < duration - 0.0001
                        ? "descent-landing"
                        : "landing-hold";
    }
    async _loadItem(item) {
        if (this.loadedItemObjects.has(item.itemId)) {
            return this.loadedItemObjects.get(item.itemId).clone(true);
        }
        const loader = new GLTFLoader();
        let assetRoot = null;
        let assetLoaded = false;
        let assetMeshCount = 0;
        try {
            const gltf = await loader.loadAsync(item.assetUri);
            assetRoot = gltf.scene || new THREE.Group();
            assetMeshCount = countMeshes(assetRoot);
            assetLoaded = true;
        }
        catch (err) {
            this.status.errors.push(`${item.itemId} asset load failed: ${err.message}`);
        }
        const visualRoot = new THREE.Group();
        visualRoot.name = `attached-equipment-${item.itemId}`;
        if (assetRoot) {
            assetRoot.name = `asset-${item.itemId}`;
            assetRoot.scale.setScalar(0.2);
            visualRoot.add(assetRoot);
        }
        const marker = makeVisualMarker(item);
        marker.name = `visible-equipment-marker-${item.itemId}`;
        visualRoot.add(marker);
        visualRoot.userData.equipmentProof = {
            itemId: item.itemId,
            assetLoaded,
            assetMeshCount,
            visualMarkerAttached: true,
        };
        this.loadedItemObjects.set(item.itemId, visualRoot.clone(true));
        return visualRoot;
    }
    _attachmentTarget(item) {
        const point = item.attachmentPoint;
        if (this.vrm && this.vrm.humanoid && typeof this.vrm.humanoid.getNormalizedBoneNode === "function") {
            const bone = this.vrm.humanoid.getNormalizedBoneNode(point);
            if (bone)
                return { node: bone, type: "vrm-normalized-bone" };
        }
        return { node: this.anchors[point] || this.avatarRig, type: "fallback-anchor" };
    }
    _syncEquipment() {
        this._equipmentSyncChain = (this._equipmentSyncChain || Promise.resolve())
            .then(() => this._syncEquipmentNow())
            .catch((err) => {
            this.status.errors.push(`equipment sync failed: ${err.message}`);
            this.status.settled = true;
        });
        return this._equipmentSyncChain;
    }
    async _syncEquipmentNow() {
        const items = this.avatar && Array.isArray(this.avatar.equippedItems) ? this.avatar.equippedItems : [];
        for (const object of this.attachedObjects) {
            if (object.parent)
                object.parent.remove(object);
        }
        this.attachedObjects = [];
        this.status.attachedItems = [];
        if (!items.length) {
            this.status.settled = true;
            return;
        }
        this.status.settled = false;
        for (const item of items) {
            const target = this._attachmentTarget(item);
            const object = await this._loadItem(item);
            applyLocalTransform(object, item);
            const seating = item.mode === "worn" && item.attachmentPoint === "head" && target.type !== "fallback-anchor"
                ? this._seatOnHeadTop(object, item)
                : null;
            target.node.add(object);
            this.attachedObjects.push(object);
            const validation = object.userData.equipmentProof || {};
            this.status.attachedItems.push({
                itemId: item.itemId,
                mode: item.mode,
                attachmentPoint: item.attachmentPoint,
                assetUri: item.assetUri,
                target: target.type,
                asset_loaded: validation.assetLoaded === true,
                asset_mesh_count: validation.assetMeshCount || 0,
                visual_marker_attached: validation.visualMarkerAttached === true,
                seating,
            });
        }
        this.status.settled = true;
    }
    setAvatar(avatar) {
        const previousSignature = this._equipmentSignature;
        this.avatar = avatar || null;
        this._syncAvatarTransform();
        const requestedVariant = this.avatar && this.avatar.avatar_variant;
        if (requestedVariant &&
            AVATAR_VARIANTS[requestedVariant] &&
            requestedVariant !== this.status.avatar_variant) {
            this.switchAvatarVariant(requestedVariant);
        }
        const requestedHeight = this.avatar ? this.avatar.preferred_height_m : null;
        const currentHeight = this.status.avatar_preferred_height_m;
        const normalized = requestedHeight === null || requestedHeight === undefined || requestedHeight === ""
            ? null
            : Number.isFinite(Number(requestedHeight))
                ? Number(requestedHeight)
                : null;
        if (normalized !== currentHeight)
            this.applyPreferredHeightM(normalized);
        const items = this.avatar && Array.isArray(this.avatar.equippedItems) ? this.avatar.equippedItems : [];
        this._equipmentSignature = JSON.stringify(items.map((item) => [
            item.itemId,
            item.mode,
            item.attachmentPoint,
            item.assetUri,
            item.localTransform,
        ]));
        if (this._equipmentSignature !== previousSignature)
            this._syncEquipment();
    }
    _syncAvatarTransform() {
        if (!this.avatarRig)
            return;
        if (!this.avatar) {
            this.avatarRig.visible = false;
            this.status.avatar_visual_visible = false;
            return;
        }
        const visual = this.avatar.transition_visual || {};
        const reducedMotion = this.motionPreference?.isReduced?.() === true;
        const visualScale = reducedMotion
            ? 1
            : Number.isFinite(Number(visual.scale)) ? Number(visual.scale) : 1;
        this.avatarRig.visible = reducedMotion || visual.visible !== false;
        this.status.avatar_visual_visible = this.avatarRig.visible;
        this.status.avatar_visual_scale = Number(visualScale.toFixed(3));
        const p = this.avatar.position || [0, 0, 0];
        this.avatarRig.position.set(p[0], p[1] || 0, p[2]);
        this.avatarRig.rotation.y = (this.avatar.rotation_y || 0) + (reducedMotion ? 0 : Number(visual.spin_y) || 0);
        this.avatarRig.scale.setScalar(Math.max(0.001, visualScale));
        const locomotion = this.avatar.locomotion || {};
        this.status.locomotion_moving = locomotion.moving === true;
        this.status.locomotion_movement_mode = locomotion.movement_mode || (locomotion.moving ? "walk" : "idle");
        this.status.locomotion_run_mode = locomotion.run_mode === true;
        this.status.locomotion_speed_mps = Number(locomotion.speed_mps) || 0;
        this.status.avatar_grounded = locomotion.grounded !== false;
        this.status.avatar_jump_height_m = Number.isFinite(Number(locomotion.jump_height_m))
            ? Number(locomotion.jump_height_m)
            : Math.max(0, Number(p[1]) || 0);
    }
    isSettled() {
        return this.status.settled === true;
    }
    debugState() {
        const items = this.avatar && Array.isArray(this.avatar.equippedItems) ? this.avatar.equippedItems : [];
        const hasHeld = this.status.attachedItems.some((item) => item.mode === "held");
        const hasWorn = this.status.attachedItems.some((item) => item.mode === "worn");
        return {
            ...this.status,
            expected_item_count: items.length,
            attached_item_count: this.status.attachedItems.length,
            has_held_item: hasHeld,
            has_worn_item: hasWorn,
            visible_on_avatar: !!this.avatar &&
                items.length > 0 &&
                this.status.attachedItems.length === items.length &&
                this.status.attachedItems.every((item) => item.visual_marker_attached),
        };
    }
    rigProbe() {
        if (!this.avatarRig || !this.scene)
            return { ok: false, reason: "layer not initialised" };
        const humanoid = this.vrm && this.vrm.humanoid;
        const rawBone = (name) => name && humanoid && typeof humanoid.getRawBoneNode === "function"
            ? humanoid.getRawBoneNode(name)
            : null;
        this.scene.updateMatrixWorld(true);
        const _w = new THREE.Vector3();
        const bones = {};
        for (const name of ["hips", "head", "leftHand", "rightHand", "leftLowerLeg", "rightLowerLeg", "leftFoot", "rightFoot"]) {
            const node = rawBone(name);
            if (!node) {
                bones[name] = null;
                continue;
            }
            node.getWorldPosition(_w);
            const local = this.avatarRig.worldToLocal(_w.clone());
            bones[name] = {
                node_name: node.name,
                world: [_w.x, _w.y, _w.z],
                local: [local.x, local.y, local.z],
            };
        }
        const bodyDetail = {};
        const bodyBounds = this._avatarModel ? avatarBodyBounds(this._avatarModel, bodyDetail) : null;
        const bodyTopWorldY = bodyBounds ? Number(bodyBounds.max.y.toFixed(4)) : null;
        const bodyBottomWorldY = bodyBounds ? Number(bodyBounds.min.y.toFixed(4)) : null;
        let skullTopWorldY = null;
        const headBoneNode = rawBone("head");
        const headTopOffset = this._rigMetrics && this._rigMetrics.head_top_offset_m;
        if (headBoneNode && this._avatarModel && Number.isFinite(headTopOffset)) {
            const scale = this._avatarModel.getWorldScale(new THREE.Vector3()).y || 1;
            headBoneNode.getWorldPosition(_w);
            skullTopWorldY = Number((_w.y + headTopOffset * scale).toFixed(4));
        }
        const items = [];
        for (let i = 0; i < this.attachedObjects.length; i += 1) {
            const object = this.attachedObjects[i];
            const meta = this.status.attachedItems[i] || {};
            object.getWorldPosition(_w);
            const itemWorld = new THREE.Vector3().copy(_w);
            const itemAsset = object.children.find((c) => c.name && c.name.startsWith("asset-"));
            const itemBox = new THREE.Box3().setFromObject(itemAsset || object);
            const itemBottomWorldY = itemBox.isEmpty() ? null : Number(itemBox.min.y.toFixed(4));
            const itemTopWorldY = itemBox.isEmpty() ? null : Number(itemBox.max.y.toFixed(4));
            const boneNode = rawBone(meta.attachmentPoint);
            let boneWorld = null;
            let distance = null;
            if (boneNode) {
                const bw = new THREE.Vector3();
                boneNode.getWorldPosition(bw);
                boneWorld = [bw.x, bw.y, bw.z];
                distance = Number(bw.distanceTo(itemWorld).toFixed(5));
            }
            items.push({
                itemId: meta.itemId || null,
                mode: meta.mode || null,
                attachmentPoint: meta.attachmentPoint || null,
                target: meta.target || null,
                parent_name: object.parent ? object.parent.name : null,
                item_world: [itemWorld.x, itemWorld.y, itemWorld.z],
                raw_bone_world: boneWorld,
                distance_to_raw_bone_m: distance,
                item_bottom_world_y: itemBottomWorldY,
                item_top_world_y: itemTopWorldY,
                head_seat_gap_m: meta.attachmentPoint === "head" && itemBottomWorldY !== null && skullTopWorldY !== null
                    ? Number((itemBottomWorldY - skullTopWorldY).toFixed(4))
                    : null,
                head_seat_gap_vs_silhouette_m: meta.attachmentPoint === "head" && itemBottomWorldY !== null && bodyTopWorldY !== null
                    ? Number((itemBottomWorldY - bodyTopWorldY).toFixed(4))
                    : null,
            });
        }
        const modelWorld = this._avatarModel
            ? this._avatarModel.getWorldPosition(new THREE.Vector3())
            : null;
        return {
            ok: true,
            animation_time_seconds: Number((this.status.animation_time_seconds || 0).toFixed(3)),
            avatar_variant: this.status.avatar_variant,
            render_source: this.status.avatar_render_source || null,
            animation_state: this.status.current_animation_state,
            mixer_active: this.status.animation_mixer_active === true,
            locomotion_moving: this.status.locomotion_moving === true,
            avatar_rig_world: [this.avatarRig.position.x, this.avatarRig.position.y, this.avatarRig.position.z],
            avatar_model_local_y: this._avatarModel ? Number(this._avatarModel.position.y.toFixed(4)) : null,
            avatar_model_world_y: modelWorld ? Number(modelWorld.y.toFixed(4)) : null,
            body_bottom_world_y: bodyBottomWorldY,
            body_top_world_y: bodyTopWorldY,
            skull_top_world_y: skullTopWorldY,
            rig_metrics: this._rigMetrics || null,
            body_top_mesh: bodyDetail.top_mesh || null,
            head_bone_world_y: bones.head ? Number(bones.head.world[1].toFixed(4)) : null,
            bones,
            items,
        };
    }
    _loop() {
        const delta = this.clock ? this.clock.getDelta() : 0;
        if (this.mixer && this.avatarRig.visible) {
            this._updateLocomotionState(delta);
            this.mixer.update(delta);
            this._syncJumpPlaybackTelemetry();
            this.status.animation_time_seconds = Number((this.status.animation_time_seconds + delta).toFixed(3));
        }
        if (this.vrm && typeof this.vrm.update === "function")
            this.vrm.update(delta);
        if (!this.sharedScene)
            this.renderer.render(this.scene, this.camera);
        this._raf = requestAnimationFrame(this._loop);
    }
    resize() {
        if (this.sharedScene)
            return;
        if (!this.renderer || !this.camera)
            return;
        const w = this.mount.clientWidth || 640;
        const h = this.mount.clientHeight || 420;
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
    }
    setHost(host) {
        if (!this.sharedScene || !host || !host.scene)
            return false;
        this.host = host;
        this.renderer = host.renderer || null;
        this.scene = host.scene;
        this.camera = host.camera || null;
        if (this.avatarRig)
            this.scene.add(this.avatarRig);
        return true;
    }
    dispose() {
        if (this._raf)
            cancelAnimationFrame(this._raf);
        if (this._onResize)
            window.removeEventListener("resize", this._onResize);
        if (this.sharedScene) {
            if (this.avatarRig) {
                if (this.avatarRig.parent)
                    this.avatarRig.parent.remove(this.avatarRig);
                this._disposeModel(this.avatarRig);
            }
            return;
        }
        if (this.renderer) {
            this.renderer.dispose();
            if (this.renderer.domElement.parentNode)
                this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
        }
    }
}
