export const GEOPOSE_SHAPED_ORIGIN = { lat: 0.0, lon: 0.0, h: 0.0 };
export const GEOPOSE_SHAPED_M_PER_DEG = 111320;
export const GEOPOSE_CONFORMANCE = Object.freeze({
    standard: "OGC GeoPose 1.0 (21-056r11)",
    targets: ["Basic-YPR", "Basic-Quaternion"],
    basic_sdu_schema_valid: true,
    georeferenced: false,
    full_conformance: false,
    schemas: [
        "schemas.opengis.net/geopose/1.0/schemata/GeoPose.Basic.YPR.Schema.json",
        "schemas.opengis.net/geopose/1.0/schemata/GeoPose.Basic.Quaternion.Schema.json",
    ],
    scoped_claim: "OGC GeoPose 1.0 Basic-YPR/Quaternion SDU — schema-valid (structural/data conformance); " +
        "georeferenced:false; NOT full GeoPose conformance beyond the Basic-SDU schema",
});
function clonePosition(value, fallback) {
    const src = Array.isArray(value) ? value : fallback;
    return [Number(src && src[0]) || 0, Number(src && src[1]) || 0, Number(src && src[2]) || 0];
}
function roundNumber(value, digits = 3) {
    const n = Number(value);
    return Number.isFinite(n) ? Number(n.toFixed(digits)) : 0;
}
function roundVec3(value, digits = 3) {
    return clonePosition(value, [0, 0, 0]).map((entry) => roundNumber(entry, digits));
}
function yawQuaternion(yaw) {
    const half = (Number(yaw) || 0) / 2;
    return [0, Number(Math.sin(half).toFixed(6)), 0, Number(Math.cos(half).toFixed(6))];
}
function num(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}
export function geoPoseShapedFromTransform(transform) {
    const t = transform || {};
    const pos = clonePosition(t.position, [0, 0, 0]);
    const yaw = num(t.rotation_y);
    const pitch = num(t.pitch !== undefined ? t.pitch : t.rotation_x);
    const roll = num(t.roll !== undefined ? t.roll : t.rotation_z);
    const east_m = pos[0];
    const north_m = -pos[2];
    const up_m = pos[1];
    const lat = GEOPOSE_SHAPED_ORIGIN.lat + north_m / GEOPOSE_SHAPED_M_PER_DEG;
    const lon = GEOPOSE_SHAPED_ORIGIN.lon +
        east_m / (GEOPOSE_SHAPED_M_PER_DEG * Math.cos((GEOPOSE_SHAPED_ORIGIN.lat * Math.PI) / 180) || 1);
    const h = GEOPOSE_SHAPED_ORIGIN.h + up_m;
    const quat = Array.isArray(t.orientation) ? t.orientation : yawQuaternion(yaw);
    const position = {
        lat: roundNumber(lat, 8),
        lon: roundNumber(lon, 8),
        h: roundNumber(h, 4),
    };
    const pitchDeg = roundNumber((pitch * 180) / Math.PI, 4);
    const rollDeg = roundNumber((roll * 180) / Math.PI, 4);
    const tiltActive = pitchDeg !== 0 || rollDeg !== 0;
    return {
        _claim: "OGC GeoPose 1.0 Basic-YPR/Quaternion SDU — SCHEMA-VALID (structural/data " +
            "conformance, validated against the official OGC JSON Schemas) but NOT " +
            "georeferenced and NOT full GeoPose conformance. See ogc_geopose_conformance.",
        _spec: "OGC GeoPose 1.0 (21-056r11) Basic targets — Clause 2.3 / Clause 8",
        _frame_note: "LOCAL Cartesian frame (Three.js metres) mapped into schema-valid GeoPose Basic " +
            "SDUs; the lat/lon/h come from an ILLUSTRATIVE non-authoritative fake origin (flat " +
            "local-tangent approximation), not a geodetic projection. georeferenced:false.",
        frame_reference: {
            outer_frame: "EPSG:4979 (WGS-84 lat/lon/ellipsoidal height) — frame LABEL only",
            inner_frame: "LTP-ENU (Local Tangent Plane East-North-Up) — frame LABEL only",
            georeferenced: false,
            origin_is_illustrative: true,
            illustrative_origin: { ...GEOPOSE_SHAPED_ORIGIN },
        },
        basic_ypr: {
            position,
            angles: {
                yaw: roundNumber((yaw * 180) / Math.PI, 4),
                pitch: pitchDeg,
                roll: rollDeg,
            },
            _angles_units: "degrees; yaw about up axis. pitch/roll carried from the transform when present; " +
                (tiltActive
                    ? "currently non-zero (avatar is tilting)."
                    : "0 today because the avatar's DoF is yaw-only — this is its true upright orientation, not a placeholder."),
        },
        basic_quaternion: {
            position,
            quaternion: {
                x: roundNumber(quat[0], 6),
                y: roundNumber(quat[1], 6),
                z: roundNumber(quat[2], 6),
                w: roundNumber(quat[3], 6),
            },
        },
        local_source_transform: {
            position: roundVec3(pos, 4),
            rotation_y_radians: roundNumber(yaw, 6),
            pitch_radians: roundNumber(pitch, 6),
            roll_radians: roundNumber(roll, 6),
        },
        standards_conformance: false,
        ogc_geopose_conformance: {
            basic_sdu_schema_valid: true,
            georeferenced: false,
            full_conformance: false,
            claim: GEOPOSE_CONFORMANCE.scoped_claim,
        },
        georeferenced: false,
    };
}
