export const IWPS_CONFORMANCE = Object.freeze({
    standard: "OMA3 IWPS Base Specification v0.3",
    iwps_conformance: false,
    shaped: true,
    base_query_teleport: false,
    wire_vocabulary: "demo-native snake_case ({portal_id}, handoff_id). IWPS camelCase is a POST-HOC READING, never transmitted.",
    mandatory_response_fields: "approval + destinationUrl (§5.3.2 Table 2, both M) are SYNTHESIZED IN THE BROWSER, not returned by a server",
    ack_nack: "NOT IMPLEMENTED — sourceAckUrl/sourceNackUrl (§5.3.3 step 9, a SHALL) are served by no route and never called",
    teleport_id: "handoff_id alias; NOT a UUID v4 (§5.3.2 Table 1)",
    teleport_pin: "deterministic hash of handoff_id; NOT randomly generated (§5.3.2 Table 1); no PIN UX",
    expiration: "hardcoded 0; enforced nowhere (§5.3.3 step 4)",
    profile: "No-Security (§5.4.1) — per §5.4 this build SHALL NOT interoperate with Internet- or OMA3-security IWPS worlds",
    assets: "blocked upstream — §5.6 Asset Transfer Framework is the literal word 'TBD' in the shipped v0.3 spec",
    full_conformance: false,
    spec_sections: {
        query_api: "§5.3.2 Query API (Table 1/2) — NOT IMPLEMENTED by our destination",
        teleport_api: "§5.3.3 Teleport API (Table 3/4) — NOT IMPLEMENTED by our destination",
        naming: "§3.5 Naming Conventions (camelCase keys, kebab-case URL paths)",
        uris: "§5.2 Uniform Resource Identifiers and Locators",
        call_order: "§5.1.1 API Flow Overview (Query then Teleport) — the one property we genuinely hold",
        security: "§5.4.1 No Security profile",
        assets: "§5.6 Asset Transfer Framework (TBD in the spec — nothing to conform to)",
    },
    claim: "IWPS-SHAPED, NOT IWPS-CONFORMANT: Query->Teleport call order and vocabulary, rendered " +
        "post-hoc from our own crossing. No IWPS parameter is on the wire; the destination " +
        "implements neither API.",
});
export const IWPS_CONFORMANCE_LABEL = "iwps_conformance: false · IWPS-SHAPED (2 POSTs, Query→Teleport order, kebab-case) · NOT IWPS-CONFORMANT: no IWPS parameter on the wire, destination implements neither API, ack/nack never called";
export const IWPS_URLS = Object.freeze({
    queryPath: "/portal/exit-intent",
    teleportPath: "/portal/arrival",
    naming_rule: "kebab-case URL paths per IWPS §3.5.3",
});
export function iwpsUris({ sourceBaseUrl, targetBaseUrl, location }) {
    const loc = opaqueLocation(location);
    const portalUri = (targetBaseUrl || "") + IWPS_URLS.queryPath + (loc ? `?location=${encodeURIComponent(loc)}` : "");
    const destinationUri = (targetBaseUrl || "") + IWPS_URLS.teleportPath;
    return {
        portalUrl: portalUri,
        destinationUrl: destinationUri,
        sourceBaseUrl: sourceBaseUrl || null,
        method: "POST",
    };
}
export function opaqueLocation(arrival) {
    if (typeof arrival === "string")
        return arrival;
    if (!arrival || typeof arrival !== "object")
        return null;
    const pos = Array.isArray(arrival.position) ? arrival.position : null;
    const rot = arrival.rotation_y != null ? Number(arrival.rotation_y) : null;
    if (!pos)
        return arrival.location || null;
    const round = (n) => Number(Number(n || 0).toFixed(4));
    return `loc:${round(pos[0])},${round(pos[1])},${round(pos[2])}` + (rot != null ? `;yaw=${round(rot)}` : "");
}
export function teleportIdFromHandoff(handoffId) {
    return handoffId != null ? String(handoffId) : null;
}
export function teleportPinFromHandoff(handoffId) {
    const s = String(handoffId || "");
    let h = 0;
    for (let i = 0; i < s.length; i++)
        h = (h * 31 + s.charCodeAt(i)) % 100;
    return h;
}
export function iwpsQueryFromHandoff(packet) {
    const p = packet && typeof packet === "object" ? packet : {};
    const source = p.source || {};
    const target = p.target || {};
    const teleportId = teleportIdFromHandoff(p.handoff_id);
    const uris = iwpsUris({
        sourceBaseUrl: source.base_url,
        targetBaseUrl: target.base_url,
        location: target.arrival_position != null
            ? { position: target.arrival_position, rotation_y: target.arrival_rotation_y }
            : null,
    });
    const location = opaqueLocation({
        position: target.arrival_position,
        rotation_y: target.arrival_rotation_y,
    });
    const avatarContext = p.avatar_context || {};
    const userId = avatarContext.continuity_id || avatarContext.avatar_id || null;
    const request = {
        sourceClientType: "browser",
        teleportId,
        userId,
        teleportPin: teleportPinFromHandoff(p.handoff_id),
        sourceAckUrl: (source.base_url || "") + "/portal/source-ack",
        sourceNackUrl: (source.base_url || "") + "/portal/source-nack",
        location,
        assets: null,
    };
    const response = {
        approval: true,
        location,
        destinationUrl: uris.destinationUrl,
        portalUrl: uris.portalUrl,
        expiration: 0,
        _synthesized: true,
        _not_received: "SYNTHESIZED CLIENT-SIDE. The destination implements no IWPS Query API (§5.3.2) and " +
            "returned none of these fields. approval + destinationUrl are Mandatory (Table 2) and " +
            "are fabricated here. NOT a protocol response.",
    };
    return {
        api: "Query",
        spec: IWPS_CONFORMANCE.spec_sections.query_api,
        method: "POST",
        portalUrl: uris.portalUrl,
        request,
        response,
    };
}
export function iwpsTeleportFromHandoff(packet) {
    const p = packet && typeof packet === "object" ? packet : {};
    const source = p.source || {};
    const target = p.target || {};
    const teleportId = teleportIdFromHandoff(p.handoff_id);
    const uris = iwpsUris({
        sourceBaseUrl: source.base_url,
        targetBaseUrl: target.base_url,
        location: target.arrival_position != null
            ? { position: target.arrival_position, rotation_y: target.arrival_rotation_y }
            : null,
    });
    const avatarContext = p.avatar_context || {};
    const userId = avatarContext.continuity_id || avatarContext.avatar_id || null;
    const request = {
        teleportId,
        teleportPin: teleportPinFromHandoff(p.handoff_id),
        userId,
        launchClient: false,
        sourceAckUrl: (source.base_url || "") + "/portal/source-ack",
        sourceNackUrl: (source.base_url || "") + "/portal/source-nack",
        assets: null,
    };
    const response = {
        approval: true,
        _synthesized: true,
        _not_received: "SYNTHESIZED CLIENT-SIDE. The destination implements no IWPS Teleport API (§5.3.3) " +
            "and returned no `approval` (Mandatory, Table 4). NOT a protocol response.",
    };
    return {
        api: "Teleport",
        spec: IWPS_CONFORMANCE.spec_sections.teleport_api,
        method: "POST",
        destinationUrl: uris.destinationUrl,
        request,
        response,
        ackCallback: request.sourceAckUrl,
        nackCallback: request.sourceNackUrl,
        ack_nack_implemented: false,
        ack_nack_note: "§5.3.3 step 9 is a SHALL and we DO NOT satisfy it: sourceAckUrl/sourceNackUrl are " +
            "served by no route and are never called. Dead strings, named honestly.",
    };
}
export function iwpsQueryTeleportFromHandoff(packet, extra = {}) {
    const p = packet && typeof packet === "object" ? packet : {};
    const query = iwpsQueryFromHandoff(p);
    const teleport = iwpsTeleportFromHandoff(p);
    return {
        _claim: IWPS_CONFORMANCE.claim,
        standard: IWPS_CONFORMANCE.standard,
        flow: ["Query", "Teleport"],
        teleportId: query.request.teleportId,
        correlation_note: "IWPS teleportId is the demo's internal handoff_id (adapter alias): the on-the-wire " +
            "vocabulary is IWPS v0.3; the internal correlation key stays handoff_id so the e2e " +
            "correlation and the 041 backend are untouched.",
        location: query.response.location,
        query,
        teleport,
        transport: {
            iwps_parameters_on_the_wire: false,
            wire_format: "demo-native snake_case; request body is {portal_id}, response is handoff_id/arrival_position/...",
            query_call: {
                iwps_api: "Query",
                posted_to: extra.query_endpoint || null,
                role: "OUR OWN demo crossing POST. IWPS-shaped only in call order + kebab-case POST-only path. " +
                    "Carries ZERO IWPS Table 1 parameters. The destination implements no IWPS Query API (§5.3.2).",
                iwps_api_implemented_by_destination: false,
            },
            teleport_call: {
                iwps_api: "Teleport",
                posted_to: extra.teleport_endpoint || null,
                role: "OUR OWN demo crossing POST. IWPS-shaped only in call order + kebab-case POST-only path. " +
                    "Carries ZERO IWPS Table 3 parameters. The destination implements no IWPS Teleport API (§5.3.3).",
                iwps_api_implemented_by_destination: false,
            },
        },
        iwps_conformance: false,
        conformance: { ...IWPS_CONFORMANCE },
    };
}
