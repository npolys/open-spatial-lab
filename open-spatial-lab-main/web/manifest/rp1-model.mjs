import { UM_FACET_TYPE, UM_ENTITY_TYPE } from "./interfaces.mjs";
export const RP1_POINTER_NAMES = Object.freeze({
    fabric: "rp1.fabric",
    anchorSet: "rp1.anchorSet",
    placeGraph: "rp1.placeGraph",
    attachmentIndex: "rp1.attachmentIndex",
    assetProfile: "rp1.assetProfile",
    sessionContext: "rp1.sessionContext",
});
export const SPATIAL_CONSENT_KEYS = Object.freeze({
    locationShare: "spatial.locationShare",
    anchorShare: "spatial.anchorShare",
    crossWorldLinking: "spatial.crossWorldLinking",
    sessionReplay: "spatial.sessionReplay",
});
const RP1_ENTITY_TYPES = Object.freeze({
    anchorSet: "rp1:AnchorSet",
    placeMembership: "rp1:PlaceMembership",
    attachmentPolicy: "rp1:AttachmentPolicy",
    assetProfile: "rp1:AssetProfile",
});
export const RP1_MODEL = Object.freeze({
    standard: "RP1 / MSF Spatial Fabric integration (non-normative)",
    integration_doc: "universalmanifest/integrations/rp1-spatial-fabric.md",
    maps: "World Navigator crossing -> RP1 parent-scope -> child-scope attachment, one context",
    emits: {
        pointers: Object.values(RP1_POINTER_NAMES),
        consents: Object.values(SPATIAL_CONSENT_KEYS),
        facets: ["spatialAnchors", "placeMembership", "spatialFabricAttachmentPolicy", "spatialAssetProfile"],
    },
    shape: "Universal Manifest v0.4 facets/pointers/consents; RP1 v0.1 semantics preserved",
    fail_closed_conformance: false,
    scope_boundary: "RP1 pointer/facet MODEL from live crossing state (parent/child scope + attachment). " +
        "Fail-closed traversal/session enforcement + journey-07/J22 acceptance = runtime. " +
        "um_conformance stays false.",
});
export function buildRp1Section(nav, opts = {}) {
    if (!nav || typeof nav !== "object")
        return null;
    const hasScope = (nav.root_fabric && (isNonEmptyString(nav.root_fabric.url) || isNonEmptyString(nav.root_fabric.container))) ||
        (nav.portal_attachment && typeof nav.portal_attachment === "object") ||
        (nav.child_fabric && (isNonEmptyString(nav.child_fabric.url) || isNonEmptyString(nav.child_fabric.container)));
    if (!hasScope)
        return null;
    const issuedAt = isoOrNow(opts.issuedAt);
    const issuedMs = Date.parse(issuedAt);
    const ttlSeconds = Number.isFinite(Number(opts.ttlSeconds)) ? Number(opts.ttlSeconds) : 3600;
    const crossWorldLinking = normAllowDeny(opts.crossWorldLinking, "denied");
    const sessionStatus = normSessionStatus(opts.sessionContextStatus, "active");
    const attachmentStatus = normAttachmentStatus(opts.attachmentStatus, "active");
    const rootScopeId = scopeIdFor(nav.root_fabric, "root");
    const childScopeRef = childScopeRefFor(nav);
    const attachment = attachmentSummaryFor(nav);
    const facets = [];
    const anchorsFacet = spatialAnchorsFacet(rootScopeId, attachment, nav);
    if (anchorsFacet)
        facets.push(anchorsFacet);
    facets.push(placeMembershipFacet(rootScopeId, nav));
    facets.push(spatialFabricAttachmentPolicyFacet(rootScopeId, childScopeRef, attachment, crossWorldLinking));
    facets.push(spatialAssetProfileFacet());
    const attachmentPolicyFacetId = urnFacetId("spatialFabricAttachmentPolicy", rootScopeId);
    const consents = spatialConsents({
        facetRef: attachmentPolicyFacetId,
        issuedAt,
        ttlSeconds,
        crossWorldLinking,
        sessionReplay: "denied",
    });
    const pointers = rp1Pointers({
        nav,
        rootFabricUrl: nav.root_fabric && isNonEmptyString(nav.root_fabric.url) ? nav.root_fabric.url : null,
        childScopeRef,
        issuedMs,
        attachmentStatus,
        sessionStatus,
    });
    const summary = {
        context_id: isNonEmptyString(nav.context_id) ? nav.context_id : null,
        single_context: nav.single_context === true,
        root_scope_id: rootScopeId,
        child_scope_ref: childScopeRef,
        attachment_point_id: attachment ? attachment.attachmentPointId : null,
        promotion_count: Number(nav.promotion_count) || 0,
        cross_world_linking: crossWorldLinking,
        attachment_status: attachmentStatus,
        session_context_status: sessionStatus,
        facet_count: facets.length,
        pointer_count: pointers.length,
        consent_count: consents.length,
    };
    return { facets, pointers, consents, summary };
}
function spatialAnchorsFacet(rootScopeId, attachment, nav) {
    if (!attachment || !attachment.attachmentPointId) {
        return {
            "@id": urnFacetId("spatialAnchors", rootScopeId),
            "@type": UM_FACET_TYPE,
            name: "spatialAnchors",
            entity: {
                "@id": urnEntityId("spatialAnchors", rootScopeId),
                "@type": [UM_ENTITY_TYPE, RP1_ENTITY_TYPES.anchorSet],
                scopeId: rootScopeId,
                world: worldTokenFor(nav),
                anchors: [],
            },
        };
    }
    const coords = coordinatesFrom(attachment.transformPosition);
    const anchor = {
        id: `anchor-${attachment.attachmentPointId}`,
        kind: "portal",
        attachmentPointId: attachment.attachmentPointId,
        freshnessTtlSeconds: 900,
    };
    if (coords)
        anchor.coordinates = coords;
    return {
        "@id": urnFacetId("spatialAnchors", rootScopeId),
        "@type": UM_FACET_TYPE,
        name: "spatialAnchors",
        entity: {
            "@id": urnEntityId("spatialAnchors", rootScopeId),
            "@type": [UM_ENTITY_TYPE, RP1_ENTITY_TYPES.anchorSet],
            scopeId: rootScopeId,
            world: worldTokenFor(nav),
            anchors: [anchor],
        },
    };
}
function placeMembershipFacet(rootScopeId, nav) {
    const places = placesFor(nav);
    return {
        "@id": urnFacetId("placeMembership", rootScopeId),
        "@type": UM_FACET_TYPE,
        name: "placeMembership",
        entity: {
            "@id": urnEntityId("placeMembership", rootScopeId),
            "@type": [UM_ENTITY_TYPE, RP1_ENTITY_TYPES.placeMembership],
            scopeId: rootScopeId,
            places,
        },
    };
}
function spatialFabricAttachmentPolicyFacet(rootScopeId, childScopeRef, attachment, crossWorldLinking) {
    const att = {
        attachmentPointId: attachment ? attachment.attachmentPointId : "portal-attachment",
        parentPlace: `rp1:place:${rootScopeId}`,
        childScopeRef: childScopeRef || "urn:rp1:child-scope:unresolved",
        linkVisibility: crossWorldLinking === "allowed" ? "cross-world" : "local-only",
        freshnessSource: RP1_POINTER_NAMES.attachmentIndex,
        onFreshnessFailure: "deny-child-scope-traversal",
        consentRequired: [SPATIAL_CONSENT_KEYS.crossWorldLinking],
    };
    if (attachment && attachment.orientation)
        att.orientation = attachment.orientation;
    return {
        "@id": urnFacetId("spatialFabricAttachmentPolicy", rootScopeId),
        "@type": UM_FACET_TYPE,
        name: "spatialFabricAttachmentPolicy",
        entity: {
            "@id": urnEntityId("spatialFabricAttachmentPolicy", rootScopeId),
            "@type": [UM_ENTITY_TYPE, RP1_ENTITY_TYPES.attachmentPolicy],
            rootScopeId,
            compositionModel: "parent-scope-to-child-scope",
            attachments: [att],
        },
    };
}
function spatialAssetProfileFacet() {
    return {
        "@id": urnFacetId("spatialAssetProfile", "active"),
        "@type": UM_FACET_TYPE,
        name: "spatialAssetProfile",
        entity: {
            "@id": urnEntityId("spatialAssetProfile", "active"),
            "@type": [UM_ENTITY_TYPE, RP1_ENTITY_TYPES.assetProfile],
            deliveryFormats: ["gltf", "glb"],
            lodPolicy: "consumer-selects-supported-lod",
            transportBoundary: "external-pointer-only",
            toolingHints: ["manifolder-resource-view"],
            maxEmbeddedBytes: 0,
        },
    };
}
function spatialConsents({ facetRef, issuedAt, ttlSeconds, crossWorldLinking, sessionReplay }) {
    const grantedAt = issuedAt;
    const expiresAt = new Date(Date.parse(issuedAt) + ttlSeconds * 1000).toISOString();
    const mk = (key, value, scope, purpose) => ({
        "@id": urnConsentId(key),
        "@type": "um:Consent",
        facetRef,
        scope,
        purpose,
        grantedAt,
        expiresAt,
        name: key,
        value,
    });
    return [
        mk(SPATIAL_CONSENT_KEYS.locationShare, "allowed", ["place-membership"], "share place membership (not precise coordinates) for wayfinding"),
        mk(SPATIAL_CONSENT_KEYS.anchorShare, "allowed", ["saved-anchors"], "reuse intentionally-portable saved anchors across sessions"),
        mk(SPATIAL_CONSENT_KEYS.crossWorldLinking, crossWorldLinking, ["child-scope-attachment"], "traverse a parent-scope -> child-scope attachment across worlds"),
        mk(SPATIAL_CONSENT_KEYS.sessionReplay, sessionReplay, ["session-context"], "replay or reuse an active runtime session context"),
    ];
}
function rp1Pointers({ nav, rootFabricUrl, childScopeRef, issuedMs, attachmentStatus, sessionStatus }) {
    const base = rootFabricUrl ? deriveFabricBase(rootFabricUrl) : "urn:rp1:fabric";
    const ptr = (name, url, extra = {}) => ({
        "@type": "rp1:pointer",
        target: url,
        name,
        url,
        ...extra,
    });
    const observedAt = isoAt(issuedMs + 2 * 60 * 1000);
    const attachmentExpiresAt = attachmentStatus === "stale"
        ? isoAt(issuedMs - 5 * 60 * 1000)
        : isoAt(issuedMs + 15 * 60 * 1000);
    const sessionObservedAt = isoAt(issuedMs + 3 * 60 * 1000);
    const sessionExpiresAt = sessionStatus === "revoked" || sessionStatus === "stale"
        ? isoAt(issuedMs - 1 * 60 * 1000)
        : isoAt(issuedMs + 6 * 60 * 1000);
    const pointers = [
        ptr(RP1_POINTER_NAMES.fabric, `${base}/index.msf`),
        ptr(RP1_POINTER_NAMES.anchorSet, `${base}/anchors`),
        ptr(RP1_POINTER_NAMES.placeGraph, `${base}/places`),
        ptr(RP1_POINTER_NAMES.attachmentIndex, `${base}/attachments`, {
            observedAt,
            expiresAt: attachmentExpiresAt,
            status: attachmentStatus,
        }),
        ptr(RP1_POINTER_NAMES.assetProfile, `${base}/asset-profile.json`),
        ptr(RP1_POINTER_NAMES.sessionContext, sessionContextUrl(nav, base), {
            observedAt: sessionObservedAt,
            expiresAt: sessionExpiresAt,
            status: sessionStatus,
        }),
    ];
    if (childScopeRef) {
        const ai = pointers.find((p) => p.name === RP1_POINTER_NAMES.attachmentIndex);
        if (ai)
            ai.childScopeRef = childScopeRef;
    }
    return pointers;
}
function scopeIdFor(fabric, fallbackKind) {
    if (fabric) {
        const key = isNonEmptyString(fabric.container) ? fabric.container : isNonEmptyString(fabric.url) ? fabric.url : null;
        if (key)
            return `fs_${slugify(key)}`;
    }
    return `fs_${fallbackKind}`;
}
function childScopeRefFor(nav) {
    if (nav.child_fabric && isNonEmptyString(nav.child_fabric.url))
        return nav.child_fabric.url;
    if (nav.portal_attachment && isNonEmptyString(nav.portal_attachment.resolved_url))
        return nav.portal_attachment.resolved_url;
    if (nav.portal_attachment && isNonEmptyString(nav.portal_attachment.sReference))
        return nav.portal_attachment.sReference;
    return null;
}
function attachmentSummaryFor(nav) {
    const pa = nav.portal_attachment;
    if (!pa || typeof pa !== "object")
        return null;
    const summary = {
        attachmentPointId: pa.node_id != null ? String(pa.node_id) : "portal-attachment",
        transformPosition: Array.isArray(pa.transform_position) ? pa.transform_position : null,
    };
    return summary;
}
function placesFor(nav) {
    const places = [];
    const rootPlace = nav.root_fabric && (isNonEmptyString(nav.root_fabric.container) ? nav.root_fabric.container : isNonEmptyString(nav.root_fabric.url) ? nav.root_fabric.url : null);
    const childPlace = nav.child_fabric && (isNonEmptyString(nav.child_fabric.container) ? nav.child_fabric.container : isNonEmptyString(nav.child_fabric.url) ? nav.child_fabric.url : null);
    if (rootPlace) {
        places.push(`rp1:place:${slugify(rootPlace)}`);
    }
    if (childPlace) {
        places.push(`rp1:place:${slugify(childPlace)}`);
    }
    if (places.length === 0)
        places.push("rp1:place:active-scope");
    return places;
}
function worldTokenFor(nav) {
    const root = nav.root_fabric && (isNonEmptyString(nav.root_fabric.container) ? nav.root_fabric.container : isNonEmptyString(nav.root_fabric.url) ? nav.root_fabric.url : null);
    if (root) {
        return `rp1:${slugify(root)}`;
    }
    return "rp1:active";
}
function coordinatesFrom(pos) {
    if (!Array.isArray(pos) || pos.length < 3)
        return null;
    const x = Number(pos[0]);
    const y = Number(pos[1]);
    const z = Number(pos[2]);
    if (![x, y, z].every((n) => Number.isFinite(n)))
        return null;
    return { x: round4(x), y: round4(y), z: round4(z) };
}
function deriveFabricBase(url) {
    const u = isNonEmptyString(url) ? url : "urn:rp1:fabric";
    const m = u.match(/^(https?:\/\/[^?#]*?)\/[^/?#]*\.[A-Za-z0-9]+([?#].*)?$/);
    if (m)
        return m[1];
    return u.replace(/\/+$/, "");
}
function sessionContextUrl(nav, base) {
    const ctx = isNonEmptyString(nav.context_id) ? slugify(nav.context_id) : "active";
    return `${base}/sessions/${ctx}/context`;
}
function urnFacetId(kind, id) {
    return `urn:um:facet:rp1:${kind}:${slugify(id)}`;
}
function urnEntityId(kind, id) {
    return `urn:um:entity:rp1:${kind}:${slugify(id)}`;
}
function urnConsentId(key) {
    return `urn:um:consent:${slugify(key)}`;
}
function slugify(v) {
    return (String(v == null ? "x" : v)
        .replace(/^https?:\/\//, "")
        .replace(/[^A-Za-z0-9._-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 96) || "x");
}
function isoOrNow(v) {
    if (typeof v === "string" && Number.isFinite(Date.parse(v)))
        return new Date(Date.parse(v)).toISOString();
    return new Date().toISOString();
}
function isoAt(ms) {
    const t = Number.isFinite(ms) ? ms : Date.now();
    return new Date(t).toISOString();
}
function round4(n) {
    return Math.round(n * 1e4) / 1e4;
}
function isNonEmptyString(v) {
    return typeof v === "string" && v.length > 0;
}
function normAllowDeny(v, dflt) {
    return v === "allowed" || v === "denied" ? v : dflt;
}
function normSessionStatus(v, dflt) {
    if (v === undefined || v === null)
        return dflt;
    return v === "active" || v === "stale" || v === "revoked" ? v : "stale";
}
function normAttachmentStatus(v, dflt) {
    if (v === undefined || v === null)
        return dflt;
    return v === "active" || v === "stale" ? v : "stale";
}
