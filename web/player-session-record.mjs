const PLAYER_SESSION_RECORD_VERSION = 1;
export function parsePlayerSessionRecord(serialized) {
    try {
        const record = JSON.parse(serialized);
        if (!record || record.version !== PLAYER_SESSION_RECORD_VERSION)
            return null;
        return record;
    }
    catch {
        return null;
    }
}
export function createPlayerSessionRecord({ activeEndpointKey, locationId, position, rotationY, orbitAzimuthRad, orbitPolarRad, orbitDistanceM, cameraMode, savedAt, }) {
    return {
        version: PLAYER_SESSION_RECORD_VERSION,
        active_endpoint_key: activeEndpointKey,
        location_id: locationId,
        position: Array.isArray(position) ? position.slice(0, 3).map(Number) : null,
        rotation_y: Number.isFinite(Number(rotationY)) ? Number(rotationY) : null,
        orbit_azimuth_rad: Number.isFinite(orbitAzimuthRad) ? Number(orbitAzimuthRad) : null,
        orbit_polar_rad: Number.isFinite(orbitPolarRad) ? Number(orbitPolarRad) : null,
        orbit_distance_m: Number.isFinite(orbitDistanceM) ? Number(orbitDistanceM) : null,
        camera_mode: cameraMode,
        saved_at: savedAt,
    };
}
