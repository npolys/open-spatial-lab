import * as THREE from "./vendor/scene-core/vendor/three/three.module.js";
import { glueCameraThroughFrames, properPortalLocalRotation, } from "./live-adapter-portal-geometry.mjs";
const WORLD_ROOM_COLORS = {
    "location-a": 0x3aa0ff,
    "location-b": 0xff7a3a,
    "location-lobby": 0x42d68a,
};
const DEFAULT_WORLD_ROOM_COLOR = 0x3aa0ff;
const SCENE_BACKDROP_COLOR = 0x0b1020;
function destWorldRingColor(locationId) {
    return String(locationId || "") === "location-b" ? 0xffc266 : 0x66e0ff;
}
function worldRoomColor(locationId) {
    return WORLD_ROOM_COLORS[String(locationId || "")] ?? DEFAULT_WORLD_ROOM_COLOR;
}
const PORTAL_FRAME_CENTER_Y = 1.35;
const RT_SCALE = 0.75;
const MAX_RT_DIM = 1536;
const PEER_POSE_STALE_MS = 4000;
const PORTAL_AVATAR_FAULTS = new Set([
    "capsule_only",
    "coarse_pose",
    "widen_circle",
    "dual_representation",
]);
function vec3(value, fallback) {
    const src = Array.isArray(value) ? value : fallback || [0, 0, 0];
    return [Number(src[0]) || 0, Number(src[1]) || 0, Number(src[2]) || 0];
}
export function shouldSuppressDestinationRing(takeover, portalKey) {
    return !!(takeover && takeover.engaged && takeover.portal_key === portalKey);
}
function roundForSignature(n) {
    return Math.round((Number(n) || 0) * 20) / 20;
}
function makeApertureWindowMaterial(texture) {
    return new THREE.ShaderMaterial({
        uniforms: { uMap: { value: texture } },
        vertexShader: [
            "varying vec4 vClip;",
            "void main() {",
            "  vClip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);",
            "  gl_Position = vClip;",
            "}",
        ].join("\n"),
        fragmentShader: [
            "uniform sampler2D uMap;",
            "varying vec4 vClip;",
            "void main() {",
            "  vec2 ndc = vClip.xy / max(vClip.w, 1e-5);",
            "  vec2 uv = ndc * 0.5 + 0.5;",
            "  gl_FragColor = texture2D(uMap, uv);",
            "}",
        ].join("\n"),
        side: THREE.DoubleSide,
        depthWrite: true,
        transparent: false,
        toneMapped: false,
    });
}
function makeTakeoverMaterial(texture) {
    return new THREE.ShaderMaterial({
        uniforms: { uMap: { value: texture } },
        vertexShader: [
            "varying vec2 vUv;",
            "void main() {",
            "  vUv = uv;",
            "  gl_Position = vec4(position.xy, 0.0, 1.0);",
            "}",
        ].join("\n"),
        fragmentShader: [
            "uniform sampler2D uMap;",
            "varying vec2 vUv;",
            "void main() { gl_FragColor = texture2D(uMap, vUv); }",
        ].join("\n"),
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
    });
}
function disposeObject(root) {
    root.traverse((node) => {
        if (node.geometry && typeof node.geometry.dispose === "function")
            node.geometry.dispose();
        const mats = Array.isArray(node.material) ? node.material : node.material ? [node.material] : [];
        for (const m of mats) {
            for (const v of Object.values(m)) {
                if (v && v.isTexture && typeof v.dispose === "function")
                    v.dispose();
            }
            if (typeof m.dispose === "function")
                m.dispose();
        }
    });
}
function applyPreviewClipping(root, clipPlane) {
    if (!root || !clipPlane)
        return;
    root.traverse((node) => {
        const mats = Array.isArray(node.material) ? node.material : node.material ? [node.material] : [];
        for (const material of mats)
            material.clippingPlanes = [clipPlane];
    });
}
function buildAvatarProxy(avatar) {
    const group = new THREE.Group();
    group.name = `dest-avatar-proxy-${avatar.player_id || avatar.avatar_id || "unknown"}`;
    const mat = new THREE.MeshStandardMaterial({
        color: 0xe8eefc,
        emissive: 0x46d18a,
        emissiveIntensity: 0.22,
        roughness: 0.55,
    });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.75, 6, 14), mat);
    body.position.y = 0.82;
    group.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.23, 16, 16), mat.clone());
    head.position.y = 1.47;
    group.add(head);
    group.userData.destAvatar = {
        player_id: avatar.player_id || null,
        avatar_id: avatar.avatar_id || null,
        display_name: avatar.display_name || null,
        distance_from_anchor_m: avatar.distance_from_anchor_m ?? null,
    };
    return group;
}
function buildEntityMesh(entity) {
    const size = Math.max(0.15, Number(entity.size_m) || 0.5);
    const color = new THREE.Color(String(entity.color || "#8899aa"));
    const mat = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.55,
        metalness: 0.1,
        emissive: color.clone().multiplyScalar(0.18),
    });
    const mesh = String(entity.shape) === "sphere"
        ? new THREE.Mesh(new THREE.SphereGeometry(size / 2, 24, 18), mat)
        : new THREE.Mesh(new THREE.BoxGeometry(size, size, size), mat);
    const p = Array.isArray(entity.position) ? entity.position : [0, 0, 0];
    mesh.position.set(Number(p[0]) || 0, Number(p[1]) || 0, Number(p[2]) || 0);
    mesh.name = `dest-entity-${entity.object_id || "unknown"}`;
    mesh.userData.destEntity = {
        object_id: entity.object_id || null,
        position: [mesh.position.x, mesh.position.y, mesh.position.z],
    };
    return mesh;
}
export class SpatialPortalPreviewManager {
    constructor(opts = {}) {
        this.records = new Map();
        this.renderer = null;
        this.mainCamera = null;
        this.hostScene = null;
        this.controlledPlayerId =
            typeof opts.controlledPlayerId === "function" ? opts.controlledPlayerId : () => null;
        this.AvatarLayerClass = opts.AvatarLayerClass || null;
        this.getMount = typeof opts.getMount === "function" ? opts.getMount : () => null;
        this.motionPreference = opts.motionPreference || null;
        this.nowMs = typeof opts.nowMs === "function" ? opts.nowMs : () => Date.now();
        const queryFault = typeof window !== "undefined"
            ? new URLSearchParams(window.location.search).get("portal_avatar_fault")
            : null;
        this.avatarFault = PORTAL_AVATAR_FAULTS.has(opts.avatarFault)
            ? opts.avatarFault
            : PORTAL_AVATAR_FAULTS.has(queryFault)
                ? queryFault
                : null;
        this.peerPlayers = new Map();
        this.avatarRepresentationCreateCount = 0;
        this.avatarRepresentationDisposeCount = 0;
        this._identityFilterByMachine = new WeakMap();
        this._lastIdentityFilter = null;
        this.takeover = {
            engaged: false,
            portal_key: null,
            engaged_at: null,
            frames_rendered: 0,
            last_engaged: null,
        };
        this._takeoverQuad = null;
        this._tmpVec = new THREE.Vector3();
    }
    bindScene(renderer, camera, hostScene) {
        this.renderer = renderer || null;
        this.mainCamera = camera || null;
        this.hostScene = hostScene || null;
        if (this.renderer)
            this.renderer.localClippingEnabled = true;
        if (this.takeover.engaged) {
            this.takeover.engaged = false;
            this.takeover.portal_key = null;
        }
        this._takeoverQuad = null;
    }
    pruneToPortalKeys(validKeys) {
        const keep = new Set(validKeys || []);
        for (const [key, rec] of this.records) {
            if (keep.has(key))
                continue;
            this._disposeRecord(rec);
            this.records.delete(key);
        }
    }
    _disposeRecord(rec) {
        if (!rec)
            return;
        this._disposeAvatarRepresentations(rec);
        if (rec.scene)
            disposeObject(rec.scene);
        if (rec.renderTarget)
            rec.renderTarget.dispose();
        if (rec.apertureMaterial)
            rec.apertureMaterial.dispose();
        if (rec.takeoverMaterial)
            rec.takeoverMaterial.dispose();
    }
    dispose() {
        for (const rec of this.records.values())
            this._disposeRecord(rec);
        this.records.clear();
        this.bindScene(null, null, null);
        this.peerPlayers.clear();
    }
    setPeerPlayers(peers) {
        const next = new Map();
        for (const peer of Array.isArray(peers) ? peers : []) {
            if (!peer || !peer.player_id || !Array.isArray(peer.position))
                continue;
            const lastSeenMs = Math.max(0, Number(peer.last_seen_ms) || 0);
            if (lastSeenMs > PEER_POSE_STALE_MS)
                continue;
            next.set(peer.player_id, {
                ...peer,
                received_at_ms: this.nowMs() - lastSeenMs,
            });
        }
        this.peerPlayers = next;
        for (const rec of this.records.values()) {
            if (rec.machine && rec.portalEntry) {
                this._reconcileAvatarRepresentations(rec, rec.machine, rec.portalEntry);
            }
        }
    }
    _disposeAvatarRepresentations(rec) {
        if (!rec || !rec.avatarRepresentations)
            return;
        for (const representation of rec.avatarRepresentations.values()) {
            if (representation.layer) {
                try {
                    representation.layer.dispose();
                }
                catch { }
            }
            if (representation.proxy && representation.proxy.parent) {
                representation.proxy.parent.remove(representation.proxy);
            }
            if (representation.proxy)
                disposeObject(representation.proxy);
            representation.disposed = true;
            this.avatarRepresentationDisposeCount += 1;
        }
        rec.avatarRepresentations.clear();
        rec.avatarProxies = [];
    }
    _destinationAvatars(machine) {
        const region = machine && machine.region ? machine.region : null;
        const snapshot = region && region.avatars && Array.isArray(region.avatars.avatars) ? region.avatars.avatars : [];
        const live = machine && machine.presence && machine.presence.occupancy && Array.isArray(machine.presence.occupancy.avatars)
            ? machine.presence.occupancy.avatars
            : null;
        let candidates = snapshot;
        const circle = (region && region.avatars && region.avatars.circle) || (region && region.region) || null;
        const center = circle && Array.isArray(circle.center) && circle.center.length >= 3 &&
            circle.center.slice(0, 3).every((value) => Number.isFinite(Number(value)))
            ? circle.center.slice(0, 3).map(Number)
            : null;
        const baseRadius = circle ? Number(circle.radius_m) : NaN;
        const circleValid = !!center && Number.isFinite(baseRadius) && baseRadius >= 0;
        const radius = circleValid && this.avatarFault === "widen_circle" ? baseRadius + 1 : baseRadius;
        if (live) {
            const snapById = new Map();
            for (const a of snapshot) {
                if (a && a.player_id)
                    snapById.set(a.player_id, a);
            }
            candidates = [];
            for (const entry of live) {
                if (!entry || !Array.isArray(entry.position))
                    continue;
                const pos = entry.position;
                let distance = null;
                let inside = false;
                if (circleValid) {
                    const dx = (Number(pos[0]) || 0) - (Number(center[0]) || 0);
                    const dz = (Number(pos[2]) || 0) - (Number(center[2]) || 0);
                    distance = Math.hypot(dx, dz);
                    inside = distance <= radius;
                }
                const snap = entry.player_id ? snapById.get(entry.player_id) : null;
                candidates.push({
                    ...(snap || {}),
                    player_id: entry.player_id || (snap ? snap.player_id : null),
                    avatar_id: entry.avatar_id ?? (snap ? snap.avatar_id : null),
                    display_name: entry.display_name ?? (snap ? snap.display_name : null),
                    position: pos.slice(0, 3),
                    rotation_y: entry.rotation_y ?? (snap ? snap.rotation_y : 0),
                    distance_from_anchor_m: distance != null ? Number(distance.toFixed(3)) : snap ? snap.distance_from_anchor_m : null,
                    inside_destination_circle: inside,
                    destination_circle_valid: circleValid,
                    destination_circle_center: center ? center.slice() : null,
                    destination_circle_radius_m: circleValid ? radius : null,
                    authoritative_presence_position: pos.slice(0, 3),
                });
            }
        }
        else {
            candidates = snapshot.map((entry) => {
                const pos = entry && Array.isArray(entry.position) ? entry.position : null;
                let distance = null;
                let inside = false;
                if (pos && circleValid) {
                    distance = Math.hypot(Number(pos[0]) - center[0], Number(pos[2]) - center[2]);
                    inside = distance <= radius;
                }
                return {
                    ...entry,
                    distance_from_anchor_m: distance == null
                        ? entry && entry.distance_from_anchor_m != null ? entry.distance_from_anchor_m : null
                        : Number(distance.toFixed(3)),
                    inside_destination_circle: inside,
                    destination_circle_valid: circleValid,
                    destination_circle_center: center ? center.slice() : null,
                    destination_circle_radius_m: circleValid ? radius : null,
                    authoritative_presence_position: pos ? pos.slice(0, 3) : null,
                };
            });
        }
        const controlledPlayerId = String(this.controlledPlayerId() || "");
        const inputPlayerIds = candidates.map((avatar) => avatar && avatar.player_id).filter(Boolean);
        const avatars = controlledPlayerId
            ? candidates.filter((avatar) => !avatar || avatar.player_id !== controlledPlayerId)
            : candidates;
        const identityFilter = {
            controlled_player_id: controlledPlayerId || null,
            input_player_ids: inputPlayerIds,
            suppressed_player_ids: controlledPlayerId
                ? inputPlayerIds.filter((playerId) => playerId === controlledPlayerId)
                : [],
            rendered_player_ids: avatars.map((avatar) => avatar && avatar.player_id).filter(Boolean),
            source: live ? "live_presence" : "snapshot_fallback",
            applied_at: new Date().toISOString(),
        };
        this._lastIdentityFilter = identityFilter;
        if (machine && typeof machine === "object") {
            this._identityFilterByMachine.set(machine, identityFilter);
        }
        return avatars;
    }
    _signature(machine, portalEntry) {
        const entities = machine && machine.region && Array.isArray(machine.region.entities) ? machine.region.entities : [];
        const avatars = this._destinationAvatars(machine);
        const tf = portalEntry ? portalEntry.target_frame : null;
        const tfPos = tf && Array.isArray(tf.position) ? tf.position : [0, 0, 0];
        const tfFwd = tf && Array.isArray(tf.forward) ? tf.forward : [0, 0, 1];
        const parts = [
            portalEntry && portalEntry.target_location_id,
            machine && machine.region && machine.region.region ? machine.region.region.radius_m : null,
            `controlled:${String(this.controlledPlayerId() || "")}`,
            `tf:${roundForSignature(tfPos[0])}:${roundForSignature(tfPos[2])}` +
                `:${roundForSignature(tfFwd[0])}:${roundForSignature(tfFwd[2])}` +
                `:${tf && tf.pose_source ? tf.pose_source : "preset"}`,
        ];
        for (const e of entities) {
            const p = Array.isArray(e.position) ? e.position : [0, 0, 0];
            parts.push(`${e.object_id}:${roundForSignature(p[0])}:${roundForSignature(p[2])}`);
        }
        for (const a of avatars) {
            parts.push(`av-${a.player_id}`);
        }
        return parts.join("|");
    }
    _poseForAvatar(avatar, portalEntry) {
        if (!avatar || !avatar.player_id || this.avatarFault === "coarse_pose")
            return null;
        const pose = this.peerPlayers.get(avatar.player_id);
        if (!pose || pose.location_id !== portalEntry.target_location_id)
            return null;
        if (!Array.isArray(pose.position) || this.nowMs() - pose.received_at_ms > PEER_POSE_STALE_MS)
            return null;
        return pose;
    }
    _fullAvatarSnapshot(avatar, pose) {
        return {
            avatar_id: pose.avatar_id || avatar.avatar_id || null,
            continuity_id: pose.continuity_id || avatar.continuity_id || null,
            display_name: pose.display_name || avatar.display_name || null,
            position: pose.position.slice(0, 3),
            rotation_y: Number(pose.rotation_y) || 0,
            avatar_variant: pose.avatar_variant || avatar.avatar_variant || null,
            equippedItems: Array.isArray(pose.equippedItems) ? pose.equippedItems : [],
            locomotion: pose.locomotion && typeof pose.locomotion === "object" ? { ...pose.locomotion } : {},
            transition_visual: pose.transition_visual && typeof pose.transition_visual === "object"
                ? { ...pose.transition_visual }
                : null,
        };
    }
    _reconcileAvatarRepresentations(rec, machine, portalEntry) {
        if (!rec || !rec.scene)
            return;
        const now = this.nowMs();
        const avatars = this._destinationAvatars(machine);
        rec.identityFilter =
            (machine && this._identityFilterByMachine.get(machine)) || this._lastIdentityFilter;
        const liveIds = new Set();
        const previousPlayerIds = Array.from(rec.avatarRepresentations.keys());
        for (const avatar of avatars) {
            const playerId = avatar && avatar.player_id;
            if (!playerId || !Array.isArray(avatar.position))
                continue;
            liveIds.add(playerId);
            let representation = rec.avatarRepresentations.get(playerId);
            if (!representation) {
                const proxy = buildAvatarProxy(avatar);
                rec.scene.add(proxy);
                applyPreviewClipping(proxy, rec.clipPlane);
                representation = {
                    player_id: playerId,
                    state: "proxy",
                    proxy,
                    layer: null,
                    desired_full: false,
                    latest_avatar: null,
                    last_pose_seq: null,
                    pose_samples: [],
                    created_at_ms: now,
                    disposed: false,
                };
                rec.avatarRepresentations.set(playerId, representation);
                this.avatarRepresentationCreateCount += 1;
            }
            const presencePosition = avatar.authoritative_presence_position || avatar.position;
            representation.proxy.position.set(Number(presencePosition[0]) || 0, 0, Number(presencePosition[2]) || 0);
            representation.proxy.rotation.y = Number(avatar.rotation_y) || 0;
            const pose = this._poseForAvatar(avatar, portalEntry);
            const classificationPosition = pose ? pose.position : presencePosition;
            const center = avatar.destination_circle_center;
            const radius = avatar.destination_circle_radius_m;
            const distance = avatar.destination_circle_valid && center && Number.isFinite(radius)
                ? Math.hypot(Number(classificationPosition[0]) - Number(center[0]), Number(classificationPosition[2]) - Number(center[2]))
                : null;
            const inside = distance != null && distance <= radius;
            const desiredFull = inside && !!pose && !!this.AvatarLayerClass && this.avatarFault !== "capsule_only";
            representation.desired_full = desiredFull;
            representation.distance_from_anchor_m = distance == null ? null : Number(distance.toFixed(4));
            representation.circle_valid = avatar.destination_circle_valid === true;
            representation.circle_center = center ? center.slice() : null;
            representation.circle_radius_m = Number.isFinite(radius) ? radius : null;
            representation.pose_source = pose ? "player-pose" : "presence";
            if (!desiredFull) {
                representation.state = inside && this.AvatarLayerClass && this.avatarFault !== "capsule_only"
                    ? "proxy_pending_full"
                    : "proxy";
                representation.proxy.visible = true;
                if (representation.layer && representation.layer.avatarRig) {
                    representation.layer.avatarRig.visible = false;
                }
                continue;
            }
            const fullAvatar = this._fullAvatarSnapshot(avatar, pose);
            representation.latest_avatar = fullAvatar;
            if (!representation.layer) {
                const mount = this.getMount();
                if (!mount) {
                    representation.state = "proxy_pending_full";
                    representation.proxy.visible = true;
                    continue;
                }
                representation.state = "proxy_pending_full";
                representation.proxy.visible = true;
                const layer = new this.AvatarLayerClass(mount, "player", { location_id: portalEntry.target_location_id }, {
                    host: { scene: rec.scene, camera: rec.camera, renderer: this.renderer },
                    motionPreference: this.motionPreference,
                });
                representation.layer = layer;
                layer.__portalPreview = true;
                layer.avatar = fullAvatar;
                if (layer.avatarRig)
                    layer.avatarRig.visible = false;
                layer.ready.then(() => {
                    if (representation.disposed || rec.avatarRepresentations.get(playerId) !== representation)
                        return;
                    if (representation.latest_avatar)
                        layer.setAvatar(representation.latest_avatar);
                    applyPreviewClipping(layer.avatarRig, rec.clipPlane);
                    if (layer.avatarRig)
                        layer.avatarRig.visible = false;
                });
            }
            const layer = representation.layer;
            const newPose = representation.last_pose_seq !== pose.seq;
            if (newPose) {
                representation.last_pose_seq = pose.seq;
                representation.last_pose_received_at_ms = pose.received_at_ms;
                representation.pose_samples.push({
                    seq: pose.seq,
                    received_at_ms: pose.received_at_ms,
                    accepted_at_ms: now,
                    position: pose.position.slice(0, 3),
                    aperture_frame_at_ms: null,
                    pose_to_aperture_ms: null,
                });
                if (representation.pose_samples.length > 64)
                    representation.pose_samples.shift();
            }
            if (layer && layer.avatarRig && layer.status && layer.status.renderer !== "failed") {
                layer.setAvatar(fullAvatar);
                applyPreviewClipping(layer.avatarRig, rec.clipPlane);
                const requestedVariant = fullAvatar.avatar_variant;
                const variantReady = !requestedVariant || layer.status.avatar_variant === requestedVariant;
                if (layer.isSettled() && variantReady) {
                    representation.state = "full";
                    representation.proxy.visible = this.avatarFault === "dual_representation";
                    representation.full_visible_at_ms = representation.full_visible_at_ms || now;
                }
                else {
                    representation.state = "proxy_pending_full";
                    representation.proxy.visible = true;
                    layer.avatarRig.visible = false;
                }
            }
        }
        for (const [playerId, representation] of rec.avatarRepresentations) {
            if (liveIds.has(playerId))
                continue;
            if (representation.layer) {
                try {
                    representation.layer.dispose();
                }
                catch { }
            }
            if (representation.proxy && representation.proxy.parent) {
                representation.proxy.parent.remove(representation.proxy);
            }
            if (representation.proxy)
                disposeObject(representation.proxy);
            representation.disposed = true;
            rec.avatarRepresentations.delete(playerId);
            this.avatarRepresentationDisposeCount += 1;
        }
        rec.avatarProxies = Array.from(rec.avatarRepresentations.values()).map((entry) => entry.proxy);
        const nextPlayerIds = Array.from(rec.avatarRepresentations.keys());
        rec.lastAvatarReconcile = {
            at: new Date(now).toISOString(),
            at_ms: now,
            previous_player_ids: previousPlayerIds,
            next_player_ids: nextPlayerIds,
            removed_player_ids: previousPlayerIds.filter((playerId) => !nextPlayerIds.includes(playerId)),
            added_player_ids: nextPlayerIds.filter((playerId) => !previousPlayerIds.includes(playerId)),
        };
    }
    _buildPreviewScene(rec, machine, portalEntry) {
        this._disposeAvatarRepresentations(rec);
        if (rec.scene)
            disposeObject(rec.scene);
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(SCENE_BACKDROP_COLOR);
        const roomColor = new THREE.Color(worldRoomColor(portalEntry.target_location_id));
        scene.add(new THREE.AmbientLight(0xffffff, 0.75));
        const key = new THREE.DirectionalLight(0xffffff, 0.9);
        key.position.set(4, 8, 6);
        scene.add(key);
        const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.MeshStandardMaterial({
            color: roomColor.clone().multiplyScalar(0.35),
            roughness: 0.95,
        }));
        floor.rotation.x = -Math.PI / 2;
        floor.name = "dest-room-floor";
        scene.add(floor);
        const grid = new THREE.GridHelper(12, 12, 0xffffff, 0x88aacc);
        grid.material.transparent = true;
        grid.material.opacity = 0.28;
        scene.add(grid);
        const wallMat = new THREE.MeshStandardMaterial({
            color: roomColor.clone().multiplyScalar(0.55),
            roughness: 0.9,
            side: THREE.DoubleSide,
        });
        const backWall = new THREE.Mesh(new THREE.PlaneGeometry(12, 5), wallMat);
        backWall.position.set(0, 2.5, -6);
        backWall.name = "dest-room-wall-z";
        scene.add(backWall);
        const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(12, 5), wallMat.clone());
        leftWall.rotation.y = Math.PI / 2;
        leftWall.position.set(-6, 2.5, 0);
        leftWall.name = "dest-room-wall-x";
        scene.add(leftWall);
        rec.roomDressing = {
            world_color: `#${roomColor.getHexString()}`,
            floor_color: `#${floor.material.color.getHexString()}`,
            wall_color: `#${wallMat.color.getHexString()}`,
            backdrop_color: `#${new THREE.Color(SCENE_BACKDROP_COLOR).getHexString()}`,
            recipe: "buildRoomReplica(floor*0.35,walls*0.55,z-6,x-6,grid0.28)",
        };
        const entityMeshes = [];
        const entities = machine.region && Array.isArray(machine.region.entities) ? machine.region.entities : [];
        for (const entity of entities) {
            const mesh = buildEntityMesh(entity);
            scene.add(mesh);
            entityMeshes.push(mesh);
        }
        const destPortal = machine.region ? machine.region.destination_portal : null;
        const targetFrame = portalEntry.target_frame || null;
        rec.destRing = null;
        rec.destRingMesh = null;
        if (destPortal && targetFrame && Array.isArray(targetFrame.position)) {
            const ringColor = destWorldRingColor(portalEntry.target_location_id);
            const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.075, 18, 80), new THREE.MeshStandardMaterial({
                color: ringColor,
                emissive: ringColor,
                emissiveIntensity: 0.72,
                roughness: 0.32,
                metalness: 0.24,
            }));
            const tp = targetFrame.position;
            ring.position.set(Number(tp[0]) || 0, Number(tp[1]) || PORTAL_FRAME_CENTER_Y, Number(tp[2]) || 0);
            const fwd = Array.isArray(targetFrame.forward) ? targetFrame.forward : [0, 0, 1];
            ring.rotation.y = Math.atan2(Number(fwd[0]) || 0, Number(fwd[2]) || 0);
            ring.scale.set((Number(targetFrame.width_m) || 1.8) / 2, (Number(targetFrame.height_m) || 2.8) / 2, 1);
            ring.name = "dest-portal-ring";
            scene.add(ring);
            rec.destRingMesh = ring;
            const payloadTrigger = Array.isArray(destPortal.trigger_position)
                ? destPortal.trigger_position
                : null;
            rec.destRing = {
                world_position: [ring.position.x, ring.position.y, ring.position.z],
                yaw: ring.rotation.y,
                color: `#${new THREE.Color(ringColor).getHexString()}`,
                target_frame_pose_source: targetFrame.pose_source || "preset_placeholder",
                payload_trigger_position: payloadTrigger ? payloadTrigger.slice(0, 3) : null,
                target_frame_vs_payload_m: payloadTrigger
                    ? Math.hypot((Number(tp[0]) || 0) - (Number(payloadTrigger[0]) || 0), (Number(tp[2]) || 0) - (Number(payloadTrigger[2]) || 0))
                    : null,
            };
        }
        const tf = portalEntry.target_frame || null;
        if (tf && Array.isArray(tf.forward) && Array.isArray(tf.position)) {
            const n = new THREE.Vector3(tf.forward[0], tf.forward[1], tf.forward[2]).normalize();
            const planePoint = new THREE.Vector3(tf.position[0] - n.x * 0.1, tf.position[1] - n.y * 0.1, tf.position[2] - n.z * 0.1);
            rec.clipPlane = new THREE.Plane(n, -n.dot(planePoint));
            scene.traverse((node) => {
                const mats = Array.isArray(node.material) ? node.material : node.material ? [node.material] : [];
                for (const m of mats)
                    m.clippingPlanes = [rec.clipPlane];
            });
        }
        else {
            rec.clipPlane = null;
        }
        rec.scene = scene;
        rec.entityMeshes = entityMeshes;
        rec.avatarProxies = [];
        rec.avatarRepresentations = rec.avatarRepresentations || new Map();
        this._reconcileAvatarRepresentations(rec, machine, portalEntry);
    }
    _ensureRecord(portalKey, machine, portalEntry) {
        let rec = this.records.get(portalKey);
        if (!rec) {
            const renderTarget = new THREE.WebGLRenderTarget(768, 768, {
                minFilter: THREE.LinearFilter,
                magFilter: THREE.LinearFilter,
            });
            if ("SRGBColorSpace" in THREE)
                renderTarget.texture.colorSpace = THREE.SRGBColorSpace;
            rec = {
                portalKey,
                scene: null,
                camera: new THREE.PerspectiveCamera(60, 1, 0.05, 80),
                renderTarget,
                apertureMaterial: makeApertureWindowMaterial(renderTarget.texture),
                takeoverMaterial: null,
                signature: null,
                entityMeshes: [],
                avatarProxies: [],
                avatarRepresentations: new Map(),
                active: false,
                cameraMapped: false,
                lastCameraTransform: null,
                framesRendered: 0,
                portalEntry: null,
                roomDressing: null,
                destRing: null,
                destRingMesh: null,
                identityFilter: null,
                lastAvatarReconcile: null,
            };
            this.records.set(portalKey, rec);
        }
        rec.portalEntry = portalEntry;
        rec.machine = machine;
        const sig = this._signature(machine, portalEntry);
        if (sig !== rec.signature) {
            this._buildPreviewScene(rec, machine, portalEntry);
            rec.signature = sig;
        }
        else {
            this._reconcileAvatarRepresentations(rec, machine, portalEntry);
        }
        return rec;
    }
    static machineRenderable(machine) {
        if (!machine || !machine.supported)
            return false;
        const statusOk = machine.status === "warm" ||
            machine.status === "cooling" ||
            (machine.status === "loading" && machine.region && machine.region.streaming);
        if (!statusOk)
            return false;
        const hasEntities = machine.region && Array.isArray(machine.region.entities) && machine.region.entities.length > 0;
        const hasAvatars = machine.region &&
            machine.region.avatars &&
            Array.isArray(machine.region.avatars.avatars) &&
            machine.region.avatars.avatars.length > 0;
        const hasPortal = machine.region && machine.region.destination_portal;
        return !!(hasEntities || hasAvatars || hasPortal);
    }
    _cameraFrontLocalZ(portalEntry) {
        if (!this.mainCamera || !portalEntry || !portalEntry.frame)
            return null;
        const frame = portalEntry.frame;
        const fp = Array.isArray(frame.position) ? frame.position : [0, PORTAL_FRAME_CENTER_Y, 0];
        const fwd = Array.isArray(frame.forward) ? frame.forward : [0, 0, 1];
        this.mainCamera.getWorldPosition(this._tmpVec);
        return ((this._tmpVec.x - fp[0]) * fwd[0] +
            (this._tmpVec.y - fp[1]) * fwd[1] +
            (this._tmpVec.z - fp[2]) * fwd[2]);
    }
    _cameraOnAllowedSide(portalEntry) {
        const z = this._cameraFrontLocalZ(portalEntry);
        if (z == null || z < -0.1)
            return false;
        const traversal = portalEntry ? portalEntry.traversal : null;
        if (!traversal || traversal.mode !== "one_way")
            return true;
        return traversal.allowed_entry_side === "front";
    }
    surfaceForPortal(portalKey, machine, portalEntry) {
        this.lastSurfaceAttempt = { portal_key: portalKey || null, reason: null };
        if (!this.renderer || !this.mainCamera) {
            this.lastSurfaceAttempt.reason = "renderer_or_camera_unavailable";
            return null;
        }
        if (!portalKey || !portalEntry || !portalEntry.frame || !portalEntry.target_frame) {
            this.lastSurfaceAttempt.reason = "portal_frames_unavailable";
            return null;
        }
        if (!SpatialPortalPreviewManager.machineRenderable(machine)) {
            this.lastSurfaceAttempt.reason = "destination_content_unavailable";
            const idle = this.records.get(portalKey);
            if (idle)
                idle.active = false;
            return null;
        }
        if (!this._cameraOnAllowedSide(portalEntry)) {
            this.lastSurfaceAttempt.reason = "camera_on_blocked_side";
            const blocked = this.records.get(portalKey);
            if (blocked)
                blocked.active = false;
            return null;
        }
        const rec = this._ensureRecord(portalKey, machine, portalEntry);
        rec.active = true;
        this.lastSurfaceAttempt.reason = "spatial_destination_visible";
        return {
            material: rec.apertureMaterial,
            record: rec,
            debug: this._recordDebug(rec),
        };
    }
    renderActive() {
        if (!this.renderer || !this.mainCamera)
            return;
        const renderer = this.renderer;
        const size = renderer.getSize(new THREE.Vector2());
        const rtW = Math.min(MAX_RT_DIM, Math.max(256, Math.round(size.x * RT_SCALE)));
        const rtH = Math.min(MAX_RT_DIM, Math.max(256, Math.round(size.y * RT_SCALE)));
        this.mainCamera.getWorldPosition(this._tmpVec);
        const camPos = [this._tmpVec.x, this._tmpVec.y, this._tmpVec.z];
        const fwd = new THREE.Vector3();
        this.mainCamera.getWorldDirection(fwd);
        const camTarget = [camPos[0] + fwd.x * 4, camPos[1] + fwd.y * 4, camPos[2] + fwd.z * 4];
        for (const rec of this.records.values()) {
            if (!rec.active || !rec.scene || !rec.portalEntry)
                continue;
            if (rec.machine)
                this._reconcileAvatarRepresentations(rec, rec.machine, rec.portalEntry);
            if (rec.renderTarget.width !== rtW || rec.renderTarget.height !== rtH) {
                rec.renderTarget.setSize(rtW, rtH);
            }
            const camFwdVec = [fwd.x, fwd.y, fwd.z];
            const glued = glueCameraThroughFrames(rec.portalEntry.frame, rec.portalEntry.target_frame, camPos, camFwdVec);
            if (!glued || glued.source_local.z < -0.1) {
                rec.cameraMapped = false;
                continue;
            }
            const t = {
                position: glued.position,
                target: [
                    glued.position[0] + glued.forward[0] * 4,
                    glued.position[1] + glued.forward[1] * 4,
                    glued.position[2] + glued.forward[2] * 4,
                ],
                rotation_y: Math.atan2(glued.forward[0], glued.forward[2]),
            };
            rec.camera.fov = this.mainCamera.fov;
            rec.camera.near = this.mainCamera.near;
            rec.camera.far = Math.max(this.mainCamera.far, 80);
            rec.camera.aspect = size.x > 0 && size.y > 0 ? size.x / size.y : 1;
            rec.camera.position.set(t.position[0], t.position[1], t.position[2]);
            rec.camera.lookAt(t.target[0], t.target[1], t.target[2]);
            rec.camera.updateProjectionMatrix();
            rec.camera.updateMatrixWorld(true);
            rec.cameraMapped = true;
            rec.lastCameraTransform = {
                position: t.position.slice(),
                target: t.target.slice(),
                rotation_y: t.rotation_y,
                source_local: glued.source_local,
            };
            const secondaryRingSuppressed = shouldSuppressDestinationRing(this.takeover, rec.portalKey);
            if (rec.destRingMesh)
                rec.destRingMesh.visible = !secondaryRingSuppressed;
            if (rec.destRing)
                rec.destRing.secondary_ring_suppressed = secondaryRingSuppressed;
            const prevTarget = renderer.getRenderTarget();
            renderer.setRenderTarget(rec.renderTarget);
            renderer.clear();
            renderer.render(rec.scene, rec.camera);
            renderer.setRenderTarget(prevTarget);
            rec.framesRendered += 1;
            const frameAt = this.nowMs();
            for (const representation of rec.avatarRepresentations.values()) {
                for (const sample of representation.pose_samples) {
                    if (sample.aperture_frame_at_ms != null)
                        continue;
                    sample.aperture_frame_at_ms = frameAt;
                    sample.pose_to_aperture_ms = Math.max(0, frameAt - sample.received_at_ms);
                }
            }
            if (this.takeover.engaged && this.takeover.portal_key === rec.portalKey) {
                this.takeover.frames_rendered += 1;
                if (this.takeover.last_engaged) {
                    this.takeover.last_engaged.frames_rendered = this.takeover.frames_rendered;
                    this.takeover.last_engaged.last_camera = rec.lastCameraTransform
                        ? {
                            position: rec.lastCameraTransform.position.slice(),
                            target: rec.lastCameraTransform.target.slice(),
                            rotation_y: rec.lastCameraTransform.rotation_y,
                        }
                        : null;
                }
            }
        }
    }
    engageTakeover(portalKey) {
        const rec = this.records.get(portalKey);
        const attempt = { at: new Date().toISOString(), portal_key: portalKey, reason: null };
        this.takeover.last_attempt = attempt;
        if (!rec || !rec.active || !rec.cameraMapped || !this.hostScene) {
            attempt.reason = !rec
                ? "no_record_for_portal"
                : !rec.active
                    ? "record_inactive"
                    : !rec.cameraMapped
                        ? "camera_not_mapped"
                        : "no_host_scene";
            return false;
        }
        if (this.takeover.engaged && this.takeover.portal_key === portalKey)
            return true;
        if (!rec.takeoverMaterial)
            rec.takeoverMaterial = makeTakeoverMaterial(rec.renderTarget.texture);
        if (!this._takeoverQuad) {
            this._takeoverQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), rec.takeoverMaterial);
            this._takeoverQuad.name = "portal-takeover-window";
            this._takeoverQuad.frustumCulled = false;
            this._takeoverQuad.renderOrder = 9999;
            this.hostScene.add(this._takeoverQuad);
        }
        else {
            this._takeoverQuad.material = rec.takeoverMaterial;
        }
        this.takeover.engaged = true;
        this.takeover.portal_key = portalKey;
        this.takeover.engaged_at = new Date().toISOString();
        this.takeover.frames_rendered = 0;
        this.takeover.last_engaged = {
            portal_key: portalKey,
            engaged_at: this.takeover.engaged_at,
            frames_rendered: 0,
            last_camera: rec.lastCameraTransform
                ? {
                    position: rec.lastCameraTransform.position.slice(),
                    target: rec.lastCameraTransform.target.slice(),
                    rotation_y: rec.lastCameraTransform.rotation_y,
                }
                : null,
        };
        return true;
    }
    disengageTakeover() {
        if (this._takeoverQuad && this._takeoverQuad.parent) {
            this._takeoverQuad.parent.remove(this._takeoverQuad);
        }
        this._takeoverQuad = null;
        this.takeover.engaged = false;
        this.takeover.portal_key = null;
    }
    _recordDebug(rec) {
        return {
            portal_key: rec.portalKey,
            active: rec.active,
            camera_mapped: rec.cameraMapped,
            projection: "screen_space_projective_window",
            camera_mapping: "portal-frame 180deg rotation glue (shared with the crossing remap)",
            glue_convention: "proper_rotation_180deg_about_up",
            destination_coordinates: "raw destination world space (no re-basing)",
            entity_mesh_count: rec.entityMeshes.length,
            avatar_proxy_count: Array.from(rec.avatarRepresentations.values()).filter((entry) => entry.proxy && entry.proxy.visible).length,
            avatar_full_count: Array.from(rec.avatarRepresentations.values()).filter((entry) => entry.state === "full" && entry.layer && entry.layer.avatarRig && entry.layer.avatarRig.visible).length,
            avatar_representation_count: rec.avatarRepresentations.size,
            avatar_fault: this.avatarFault,
            avatar_representations: Array.from(rec.avatarRepresentations.values()).map((entry) => {
                const rig = entry.layer && entry.layer.avatarRig;
                const latest = entry.pose_samples.length ? entry.pose_samples[entry.pose_samples.length - 1] : null;
                const positionError = rig && latest
                    ? Math.hypot(rig.position.x - latest.position[0], rig.position.y - latest.position[1], rig.position.z - latest.position[2])
                    : null;
                return {
                    player_id: entry.player_id,
                    state: entry.state,
                    proxy_visible: !!(entry.proxy && entry.proxy.visible),
                    full_visible: !!(rig && rig.visible),
                    visible_representation_count: (entry.proxy && entry.proxy.visible ? 1 : 0) + (rig && rig.visible ? 1 : 0),
                    pose_source: entry.pose_source,
                    pose_seq: entry.last_pose_seq,
                    distance_from_anchor_m: entry.distance_from_anchor_m,
                    circle_valid: entry.circle_valid,
                    circle_center: entry.circle_center,
                    circle_radius_m: entry.circle_radius_m,
                    world_position: rig
                        ? [rig.position.x, rig.position.y, rig.position.z]
                        : entry.proxy
                            ? [entry.proxy.position.x, entry.proxy.position.y, entry.proxy.position.z]
                            : null,
                    rotation_y: rig ? rig.rotation.y : entry.proxy ? entry.proxy.rotation.y : null,
                    avatar_variant: entry.layer && entry.layer.status ? entry.layer.status.avatar_variant : null,
                    avatar_render_source: entry.layer && entry.layer.status ? entry.layer.status.avatar_render_source : null,
                    transition_visual: entry.latest_avatar && entry.latest_avatar.transition_visual
                        ? { ...entry.latest_avatar.transition_visual }
                        : null,
                    avatar_visual_scale: entry.layer && entry.layer.status ? entry.layer.status.avatar_visual_scale : null,
                    attached_item_count: entry.layer && typeof entry.layer.debugState === "function"
                        ? entry.layer.debugState().attached_item_count
                        : null,
                    animation_state: entry.layer && entry.layer.status ? entry.layer.status.current_animation_state : null,
                    locomotion_movement_mode: entry.layer && entry.layer.status ? entry.layer.status.locomotion_movement_mode : null,
                    grounded: entry.layer && entry.layer.status ? entry.layer.status.avatar_grounded : null,
                    jump_height_m: entry.layer && entry.layer.status ? entry.layer.status.avatar_jump_height_m : null,
                    position_error_m: positionError == null ? null : Number(positionError.toFixed(5)),
                    latest_pose_to_aperture_ms: latest ? latest.pose_to_aperture_ms : null,
                    pose_samples: entry.pose_samples.map((sample) => ({ ...sample })),
                };
            }),
            controlled_identity_filter: rec.identityFilter || null,
            last_avatar_reconcile: rec.lastAvatarReconcile || null,
            frames_rendered: rec.framesRendered,
            render_target: { width: rec.renderTarget.width, height: rec.renderTarget.height },
            last_camera: rec.lastCameraTransform,
            room_dressing: rec.roomDressing || null,
            dest_ring: rec.destRing || null,
            ring_alignment: this._ringAlignmentProbe(rec),
            spatial_render_standard_conformance: false,
        };
    }
    _ringAlignmentProbe(rec) {
        if (!rec.cameraMapped || !this.mainCamera || !rec.portalEntry)
            return null;
        const frame = rec.portalEntry.frame;
        const targetFrame = rec.portalEntry.target_frame;
        if (!frame || !targetFrame)
            return null;
        const sp = vec3(frame.position, [0, PORTAL_FRAME_CENTER_Y, 0]);
        const sr = vec3(frame.right, [1, 0, 0]);
        const su = vec3(frame.up, [0, 1, 0]);
        const tp = vec3(targetFrame.position, [0, PORTAL_FRAME_CENTER_Y, 0]);
        const tr = vec3(targetFrame.right, [1, 0, 0]);
        const tu = vec3(targetFrame.up, [0, 1, 0]);
        const halfW = (Number(frame.width_m) || 1.8) / 2;
        const halfH = (Number(frame.height_m) || 2.8) / 2;
        const samples = [
            { label: "center", a: 0, b: 0 },
            { label: "right_rim", a: halfW, b: 0 },
            { label: "left_rim", a: -halfW, b: 0 },
            { label: "top_rim", a: 0, b: halfH },
            { label: "bottom_rim", a: 0, b: -halfH },
        ];
        this.mainCamera.updateMatrixWorld(true);
        rec.camera.updateMatrixWorld(true);
        const points = [];
        let maxDelta = 0;
        for (const s of samples) {
            const srcWorld = new THREE.Vector3(sp[0] + sr[0] * s.a + su[0] * s.b, sp[1] + sr[1] * s.a + su[1] * s.b, sp[2] + sr[2] * s.a + su[2] * s.b);
            const mappedPlane = properPortalLocalRotation({ x: s.a, y: s.b, z: 0 });
            const dstWorld = new THREE.Vector3(tp[0] + tr[0] * mappedPlane.x + tu[0] * mappedPlane.y, tp[1] + tr[1] * mappedPlane.x + tu[1] * mappedPlane.y, tp[2] + tr[2] * mappedPlane.x + tu[2] * mappedPlane.y);
            const srcNdc = srcWorld.clone().project(this.mainCamera);
            const dstNdc = dstWorld.clone().project(rec.camera);
            const delta = Math.hypot(srcNdc.x - dstNdc.x, srcNdc.y - dstNdc.y);
            if (delta > maxDelta)
                maxDelta = delta;
            points.push({
                label: s.label,
                source_ndc: [Number(srcNdc.x.toFixed(5)), Number(srcNdc.y.toFixed(5))],
                dest_ndc: [Number(dstNdc.x.toFixed(5)), Number(dstNdc.y.toFixed(5))],
                ndc_delta: Number(delta.toFixed(6)),
            });
        }
        return {
            convention: "dest_local_x_negated_180deg_rotation",
            points,
            max_ndc_delta: Number(maxDelta.toFixed(6)),
        };
    }
    sampleApertureTexels(portalKey, worldPoints) {
        const rec = this.records.get(portalKey);
        if (!rec || !rec.active || !rec.cameraMapped || !this.renderer || !rec.scene)
            return null;
        const rt = rec.renderTarget;
        if (!rt || !rt.width || !rt.height)
            return null;
        rec.camera.updateMatrixWorld(true);
        const out = [];
        for (const wp of Array.isArray(worldPoints) ? worldPoints : []) {
            const p = Array.isArray(wp) ? wp : wp && Array.isArray(wp.position) ? wp.position : null;
            if (!p)
                continue;
            const ndc = new THREE.Vector3(Number(p[0]) || 0, Number(p[1]) || 0, Number(p[2]) || 0).project(rec.camera);
            const inView = Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1 && ndc.z > -1 && ndc.z < 1;
            let rgba = null;
            if (inView) {
                const px = Math.min(rt.width - 1, Math.max(0, Math.round((ndc.x * 0.5 + 0.5) * (rt.width - 1))));
                const py = Math.min(rt.height - 1, Math.max(0, Math.round((ndc.y * 0.5 + 0.5) * (rt.height - 1))));
                const buf = new Uint8Array(4);
                try {
                    this.renderer.readRenderTargetPixels(rt, px, py, 1, 1, buf);
                    rgba = [buf[0], buf[1], buf[2], buf[3]];
                }
                catch (e) {
                    rgba = null;
                }
            }
            out.push({
                world_point: [Number(p[0]) || 0, Number(p[1]) || 0, Number(p[2]) || 0],
                label: wp && wp.label ? wp.label : null,
                ndc: [Number(ndc.x.toFixed(4)), Number(ndc.y.toFixed(4))],
                in_view: inView,
                rgba,
            });
        }
        return {
            portal_key: portalKey,
            render_target: { width: rt.width, height: rt.height },
            samples: out,
        };
    }
    debug() {
        const records = {};
        for (const [key, rec] of this.records) {
            const entry = this._recordDebug(rec);
            entry.entities = rec.entityMeshes.map((mesh) => {
                const cameraSpace = rec.cameraMapped
                    ? mesh.getWorldPosition(new THREE.Vector3()).applyMatrix4(rec.camera.matrixWorldInverse)
                    : null;
                return {
                    object_id: mesh.userData.destEntity.object_id,
                    world_position: mesh.userData.destEntity.position.slice(),
                    camera_space: cameraSpace
                        ? [
                            Number(cameraSpace.x.toFixed(4)),
                            Number(cameraSpace.y.toFixed(4)),
                            Number(cameraSpace.z.toFixed(4)),
                        ]
                        : null,
                };
            });
            entry.avatars = Array.from(rec.avatarRepresentations.values()).map((representation) => ({
                player_id: representation.player_id,
                display_name: representation.proxy.userData.destAvatar.display_name,
                representation: representation.state,
                world_position: representation.layer && representation.layer.avatarRig
                    ? [
                        representation.layer.avatarRig.position.x,
                        representation.layer.avatarRig.position.y,
                        representation.layer.avatarRig.position.z,
                    ]
                    : [representation.proxy.position.x, representation.proxy.position.y, representation.proxy.position.z],
                distance_from_anchor_m: representation.distance_from_anchor_m,
            }));
            records[key] = entry;
        }
        return {
            _claim: "runtime seamless portal aperture render — prefetched destination " +
                "fabric rendered spatially through the ring; local validation layer, " +
                "spatial_render_standard_conformance:false",
            avatar_representation_create_count: this.avatarRepresentationCreateCount,
            avatar_representation_dispose_count: this.avatarRepresentationDisposeCount,
            records,
            takeover: {
                engaged: this.takeover.engaged,
                portal_key: this.takeover.portal_key,
                engaged_at: this.takeover.engaged_at,
                frames_rendered: this.takeover.frames_rendered,
                last_engaged: this.takeover.last_engaged,
                last_attempt: this.takeover.last_attempt || null,
            },
            last_surface_attempt: this.lastSurfaceAttempt || null,
        };
    }
}
