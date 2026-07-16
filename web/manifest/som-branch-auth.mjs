import { createReceiptChain, appendChainEvent, sealReceiptChain, chainTraceRows, chainToReceiptEvents, createReceipt, mergeFragment, finalizeReceipt, } from "./receipt-hub.mjs";
import { createReceiptHashChain, appendReceiptToChain, sealReceiptHashChain, verifyReceiptChain, } from "./bilateral-chain.mjs";
import { buildCrossingSensorGateSurface } from "./consent-gating.mjs";
import { RP1_MODEL } from "./rp1-model.mjs";
import { UM_V04_CONTEXT, UM_V04_MANIFEST_VERSION, UM_FACET_TYPE, UM_ENTITY_TYPE } from "./interfaces.mjs";
function isNonEmptyString(v) {
    return typeof v === "string" && v.length > 0;
}
function isIsoDateTime(v) {
    return isNonEmptyString(v) && Number.isFinite(Date.parse(v));
}
function asArray(v) {
    return Array.isArray(v) ? v : v === undefined || v === null ? [] : [v];
}
const SEGMENT_RE = /^[A-Za-z0-9._~-]+$/;
function segmentProblem(seg) {
    if (seg === "." || seg === "..")
        return `dot segment "${seg}" refused (no traversal aliasing)`;
    if (!SEGMENT_RE.test(seg))
        return `segment "${seg}" outside [A-Za-z0-9._~-]+`;
    return null;
}
export function parseSomPath(path) {
    if (!isNonEmptyString(path) || !path.startsWith("/")) {
        return { ok: false, error: "SOM path must be a non-empty absolute /-separated string" };
    }
    const segments = path.slice(1).split("/");
    for (const seg of segments) {
        if (seg === "*" || seg === "**")
            return { ok: false, error: `wildcard "${seg}" is not allowed in a concrete path` };
        const problem = segmentProblem(seg);
        if (problem)
            return { ok: false, error: problem };
    }
    return { ok: true, segments };
}
export function parseSomGlob(pattern) {
    if (!isNonEmptyString(pattern) || !pattern.startsWith("/")) {
        return { ok: false, error: "scope glob must be a non-empty absolute /-separated string" };
    }
    const segments = pattern.slice(1).split("/");
    for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        if (seg === "**") {
            if (i !== segments.length - 1) {
                return { ok: false, error: '"**" is only supported as the FINAL segment (fixture-attested grammar; anything else fails closed)' };
            }
            continue;
        }
        if (seg === "*")
            continue;
        const problem = segmentProblem(seg);
        if (problem)
            return { ok: false, error: problem };
    }
    return { ok: true, segments };
}
export function somGlobMatch(pattern, path) {
    const g = pattern && typeof pattern === "object" && pattern.ok === true ? pattern : parseSomGlob(pattern);
    const p = parseSomPath(path);
    if (!g.ok || !p.ok)
        return false;
    const gs = g.segments;
    const ps = p.segments;
    const tailGlobstar = gs[gs.length - 1] === "**";
    const fixed = tailGlobstar ? gs.slice(0, -1) : gs;
    if (tailGlobstar) {
        if (ps.length < fixed.length + 1)
            return false;
    }
    else if (ps.length !== fixed.length) {
        return false;
    }
    for (let i = 0; i < fixed.length; i++) {
        if (fixed[i] === "*")
            continue;
        if (fixed[i] !== ps[i])
            return false;
    }
    return true;
}
export function somScopesMatch(scopes, path) {
    for (const s of asArray(scopes))
        if (somGlobMatch(s, path))
            return s;
    return null;
}
export function parseSomScopeEntries(entries) {
    const out = { readScopes: [], writeScopes: [], other: [], malformed: [] };
    for (const raw of asArray(entries)) {
        if (!isNonEmptyString(raw)) {
            out.malformed.push({ entry: String(raw), error: "scope entry must be a non-empty string" });
            continue;
        }
        let bucket = null;
        let glob = null;
        if (raw.startsWith("som.read:")) {
            bucket = out.readScopes;
            glob = raw.slice("som.read:".length);
        }
        else if (raw.startsWith("som.write:")) {
            bucket = out.writeScopes;
            glob = raw.slice("som.write:".length);
        }
        else {
            out.other.push(raw);
            continue;
        }
        const parsed = parseSomGlob(glob);
        if (!parsed.ok)
            out.malformed.push({ entry: raw, error: parsed.error });
        else if (!bucket.includes(glob))
            bucket.push(glob);
    }
    return out;
}
function validateGlobList(globs, malformed, kind) {
    const valid = [];
    for (const g of asArray(globs)) {
        const parsed = typeof g === "string" ? parseSomGlob(g) : { ok: false, error: "scope glob must be a string" };
        if (parsed.ok) {
            if (!valid.includes(g))
                valid.push(g);
        }
        else {
            malformed.push({ entry: `${kind}:${String(g)}`, error: parsed.error });
        }
    }
    return valid;
}
export function buildSomBranchAuthorizationFacet({ serviceDid, readScopes = [], writeScopes = [], id } = {}) {
    if (!isNonEmptyString(serviceDid))
        throw new Error("buildSomBranchAuthorizationFacet: serviceDid is required");
    const malformed = [];
    const reads = validateGlobList(readScopes, malformed, "som.read");
    const writes = validateGlobList(writeScopes, malformed, "som.write");
    if (malformed.length > 0) {
        throw new Error(`buildSomBranchAuthorizationFacet: malformed scope glob(s) — ${malformed.map((m) => `${m.entry} (${m.error})`).join("; ")}`);
    }
    const localName = serviceDid.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
    return {
        "@id": isNonEmptyString(id) ? id : `urn:um:facet:rp1:som-branch-authorization:${localName}`,
        "@type": [UM_FACET_TYPE, "rp1:SOMBranchAuthorization"],
        name: "somBranchAuthorization",
        entity: {
            "@type": [UM_ENTITY_TYPE, "rp1:SOMBranchAuthorization"],
            serviceDID: serviceDid,
            hostFunctions: [...(reads.length > 0 ? ["som.read"] : []), ...(writes.length > 0 ? ["som.write"] : [])],
            somScopes: [...reads.map((g) => `som.read:${g}`), ...writes.map((g) => `som.write:${g}`)],
        },
    };
}
export function buildInterServiceAuthorizationFacet({ channels = [], id } = {}) {
    const validated = [];
    for (const [i, c] of asArray(channels).entries()) {
        if (!c || !isNonEmptyString(c.sourceService) || !isNonEmptyString(c.targetCategory) || !isNonEmptyString(c.messageType)) {
            throw new Error(`buildInterServiceAuthorizationFacet: channels[${i}] must name ALL THREE of sourceService, targetCategory, messageType (page bar R6)`);
        }
        validated.push({ sourceService: c.sourceService, targetCategory: c.targetCategory, messageType: c.messageType });
    }
    return {
        "@id": isNonEmptyString(id) ? id : "urn:um:facet:rp1:inter-service-authorization:fabric-policy",
        "@type": [UM_FACET_TYPE, "rp1:InterServiceAuthorization"],
        name: "interServiceAuthorization",
        entity: {
            "@type": [UM_ENTITY_TYPE, "rp1:InterServiceAuthorization"],
            authorizedChannels: validated,
        },
    };
}
function facetTypes(facet) {
    return asArray(facet?.["@type"]);
}
export function extractSomAuthorization(manifest) {
    for (const facet of asArray(manifest?.facets)) {
        const types = facetTypes(facet);
        const entity = facet?.entity;
        if (!entity || typeof entity !== "object")
            continue;
        let picked = null;
        if (types.includes("rp1:SOMBranchAuthorization") || types.includes("rp1:ServiceRequirement")) {
            const malformed = [];
            const fromEntries = parseSomScopeEntries(entity.somScopes);
            malformed.push(...fromEntries.malformed);
            const readScopes = [...fromEntries.readScopes, ...validateGlobList(entity.somReadScopes, malformed, "somReadScopes")];
            const writeScopes = [...fromEntries.writeScopes, ...validateGlobList(entity.somWriteScopes, malformed, "somWriteScopes")];
            if (readScopes.length + writeScopes.length + malformed.length > 0) {
                picked = {
                    serviceDid: isNonEmptyString(entity.serviceDID) ? entity.serviceDID : manifest?.subject,
                    readScopes,
                    writeScopes,
                    malformed,
                    sourceType: types.includes("rp1:SOMBranchAuthorization") ? "rp1:SOMBranchAuthorization" : "rp1:ServiceRequirement",
                };
            }
        }
        else if (types.includes("rp1:ServiceAuth")) {
            const parsed = parseSomScopeEntries(entity.scope);
            if (parsed.readScopes.length + parsed.writeScopes.length + parsed.malformed.length > 0) {
                picked = {
                    serviceDid: isNonEmptyString(entity.issuedForService) ? entity.issuedForService : manifest?.subject,
                    readScopes: parsed.readScopes,
                    writeScopes: parsed.writeScopes,
                    malformed: parsed.malformed,
                    sourceType: "rp1:ServiceAuth",
                };
            }
        }
        if (picked && isNonEmptyString(picked.serviceDid)) {
            return { ...picked, sourceFacetId: facet["@id"] ?? null };
        }
    }
    return null;
}
export function extractInterServiceAuthorization(manifest) {
    for (const facet of asArray(manifest?.facets)) {
        if (!facetTypes(facet).includes("rp1:InterServiceAuthorization"))
            continue;
        const entity = facet?.entity;
        const channels = [];
        const malformed = [];
        for (const c of asArray(entity?.authorizedChannels)) {
            if (c && isNonEmptyString(c.sourceService) && isNonEmptyString(c.targetCategory) && isNonEmptyString(c.messageType)) {
                channels.push({ sourceService: c.sourceService, targetCategory: c.targetCategory, messageType: c.messageType });
            }
            else {
                malformed.push(c);
            }
        }
        return { channels, malformed, sourceFacetId: facet["@id"] ?? null };
    }
    return null;
}
export function createSomTree({ branches = [], eventChain = null } = {}) {
    const tree = {
        kind: "runtime-som-tree",
        nodes: new Map(),
        authorizations: new Map(),
        decisions: [],
        eventChain,
    };
    for (const b of asArray(branches)) {
        const parsed = parseSomPath(b);
        if (!parsed.ok)
            throw new Error(`createSomTree: branch "${b}" — ${parsed.error}`);
        tree.nodes.set(b, { branchRoot: true });
    }
    return tree;
}
export function registerSomAuthorization(tree, manifestOrAuth) {
    if (!tree || !(tree.authorizations instanceof Map))
        throw new Error("registerSomAuthorization: a SOM tree is required");
    let auth = null;
    if (manifestOrAuth && Array.isArray(manifestOrAuth.facets)) {
        auth = extractSomAuthorization(manifestOrAuth);
        if (!auth)
            throw new Error("registerSomAuthorization: the manifest carries no SOM authorization facet (nothing to register — default deny stands)");
    }
    else if (manifestOrAuth && isNonEmptyString(manifestOrAuth.serviceDid)) {
        const malformed = [];
        auth = {
            serviceDid: manifestOrAuth.serviceDid,
            readScopes: validateGlobList(manifestOrAuth.readScopes, malformed, "som.read"),
            writeScopes: validateGlobList(manifestOrAuth.writeScopes, malformed, "som.write"),
            malformed,
            sourceFacetId: manifestOrAuth.sourceFacetId ?? null,
            sourceType: manifestOrAuth.sourceType ?? "(pre-extracted)",
        };
    }
    if (!auth || !isNonEmptyString(auth.serviceDid)) {
        throw new Error("registerSomAuthorization: pass a manifest with a SOM facet, or { serviceDid, readScopes, writeScopes }");
    }
    if (tree.authorizations.has(auth.serviceDid)) {
        throw new Error(`registerSomAuthorization: service ${auth.serviceDid} is already registered (authorization replacement refused)`);
    }
    tree.authorizations.set(auth.serviceDid, auth);
    return auth;
}
function recordSomDecision(tree, decision, eventFields) {
    tree.decisions.push(decision);
    if (tree.eventChain) {
        decision.event = appendChainEvent(tree.eventChain, eventFields);
    }
    return decision;
}
export function somWrite(tree, { serviceDid, path, value, at } = {}) {
    if (!tree || !(tree.nodes instanceof Map))
        throw new Error("somWrite: a SOM tree is required");
    const service = isNonEmptyString(serviceDid) ? serviceDid : "(unidentified-service)";
    const atFields = isIsoDateTime(at) ? { at } : {};
    const deny = (reason, extraEventFields = {}) => recordSomDecision(tree, { kind: "som.write", serviceDid: service, path, allowed: false, applied: false, matchedScope: null, reason }, { eventClass: "capability-denied", subject: service, capability: "som.access", reason, ...extraEventFields, ...atFields });
    const parsedPath = parseSomPath(path);
    if (!parsedPath.ok)
        return deny(`som-write-refused-malformed-path`);
    if (!isNonEmptyString(serviceDid))
        return deny("som-write-refused-unidentified-service", { target: path });
    const auth = tree.authorizations.get(serviceDid);
    if (!auth)
        return deny("som-write-refused-service-not-registered", { target: path });
    const matched = somScopesMatch(auth.writeScopes, path);
    if (!matched)
        return deny("som-write-outside-authorized-branch", { target: path });
    tree.nodes.set(path, { value, writtenBy: serviceDid, ...(isIsoDateTime(at) ? { at } : {}) });
    return recordSomDecision(tree, { kind: "som.write", serviceDid, path, allowed: true, applied: true, matchedScope: matched, reason: "som-write-within-authorized-branch" }, {
        eventClass: "capability-granted",
        subject: serviceDid,
        capability: "som.access",
        target: matched,
        reason: "som-write-within-authorized-branch",
        ...atFields,
    });
}
export function somRead(tree, { serviceDid, path, at } = {}) {
    if (!tree || !(tree.nodes instanceof Map))
        throw new Error("somRead: a SOM tree is required");
    const service = isNonEmptyString(serviceDid) ? serviceDid : "(unidentified-service)";
    const atFields = isIsoDateTime(at) ? { at } : {};
    const deny = (reason, extraEventFields = {}) => recordSomDecision(tree, { kind: "som.read", serviceDid: service, path, allowed: false, matchedScope: null, reason }, { eventClass: "capability-denied", subject: service, capability: "som.access", reason, ...extraEventFields, ...atFields });
    const parsedPath = parseSomPath(path);
    if (!parsedPath.ok)
        return deny("som-read-refused-malformed-path");
    if (!isNonEmptyString(serviceDid))
        return deny("som-read-refused-unidentified-service", { target: path });
    const auth = tree.authorizations.get(serviceDid);
    if (!auth)
        return deny("som-read-refused-service-not-registered", { target: path });
    const matched = somScopesMatch(auth.readScopes, path);
    if (!matched)
        return deny("som-read-outside-authorized-scope", { target: path });
    const node = tree.nodes.get(path);
    return recordSomDecision(tree, { kind: "som.read", serviceDid, path, allowed: true, matchedScope: matched, reason: "som-read-within-authorized-scope", node: node ?? null }, {
        eventClass: "capability-granted",
        subject: serviceDid,
        capability: "som.access",
        target: matched,
        reason: "som-read-within-authorized-scope",
        ...atFields,
    });
}
export function getSomNode(tree, path) {
    return tree?.nodes?.get(path);
}
export function somSnapshot(tree) {
    const paths = [...tree.nodes.keys()].sort();
    return JSON.stringify(paths.map((p) => [p, tree.nodes.get(p)]));
}
export function createMediatedChannel({ authorizationManifest = null, eventChain = null } = {}) {
    const extraction = authorizationManifest ? extractInterServiceAuthorization(authorizationManifest) : null;
    return {
        kind: "runtime-mediated-channel",
        channels: extraction?.channels ?? [],
        malformedChannels: extraction?.malformed ?? [],
        authorizationFacetId: extraction?.sourceFacetId ?? null,
        services: new Map(),
        eventChain,
        log: [],
    };
}
export function registerFabricService(channel, { did, category, onMessage } = {}) {
    if (!channel || !(channel.services instanceof Map))
        throw new Error("registerFabricService: a mediated channel is required");
    if (!isNonEmptyString(did) || !isNonEmptyString(category))
        throw new Error("registerFabricService: did and category are required");
    if (channel.services.has(did))
        throw new Error(`registerFabricService: service ${did} is already registered (identity replacement refused)`);
    const svc = { did, category, onMessage: typeof onMessage === "function" ? onMessage : null, inbox: [] };
    channel.services.set(did, svc);
    return svc;
}
export function sendInterServiceMessage(channel, { from, targetCategory, messageType, payload, at } = {}) {
    if (!channel || !(channel.services instanceof Map))
        throw new Error("sendInterServiceMessage: a mediated channel is required");
    const sender = isNonEmptyString(from) ? from : "(unidentified-sender)";
    const atFields = isIsoDateTime(at) ? { at } : {};
    let allowed = false;
    let matchedChannel = null;
    let reason;
    if (!isNonEmptyString(from) || !isNonEmptyString(targetCategory) || !isNonEmptyString(messageType)) {
        reason = "inter-service-message-refused-malformed-request";
    }
    else if (!channel.services.has(from)) {
        reason = "inter-service-message-refused-sender-not-a-registered-service";
    }
    else {
        matchedChannel =
            channel.channels.find((c) => c.sourceService === from && c.targetCategory === targetCategory && c.messageType === messageType) ?? null;
        if (matchedChannel) {
            allowed = true;
            reason = `authorized-inter-service-${messageType}-message`;
        }
        else {
            reason = "inter-service-message-refused-channel-not-named-by-authorization-manifest";
        }
    }
    const recipients = [];
    if (allowed) {
        for (const svc of channel.services.values()) {
            if (svc.category !== targetCategory || svc.did === from)
                continue;
            const delivery = { from, messageType, payload, ...(isIsoDateTime(at) ? { at } : {}) };
            svc.inbox.push(delivery);
            if (svc.onMessage)
                svc.onMessage(delivery);
            recipients.push(svc.did);
        }
    }
    const decision = {
        kind: "inter-service.message",
        from: sender,
        targetCategory,
        messageType,
        allowed,
        delivered: allowed && recipients.length > 0,
        recipients,
        matchedChannel,
        reason,
    };
    if (channel.eventChain) {
        decision.event = appendChainEvent(channel.eventChain, {
            eventClass: allowed ? "capability-granted" : "capability-denied",
            subject: sender,
            capability: "inter-service.message",
            ...(isNonEmptyString(messageType) ? { target: messageType } : {}),
            reason,
            ...atFields,
        });
    }
    channel.log.push(decision);
    return decision;
}
export function createSomGatingSession({ subject, chainId, serviceManifests = [], channelAuthorizationManifest = null, branches = [] } = {}) {
    if (!isNonEmptyString(subject))
        throw new Error("createSomGatingSession: subject (the session's review subject DID) is required");
    const eventChain = createReceiptChain({ subject });
    const hashChain = createReceiptHashChain(isNonEmptyString(chainId) ? { chainId } : {});
    const tree = createSomTree({ branches, eventChain });
    for (const m of asArray(serviceManifests))
        registerSomAuthorization(tree, m);
    const channel = createMediatedChannel({ authorizationManifest: channelAuthorizationManifest, eventChain });
    return { kind: "runtime-som-gating-session", subject, eventChain, hashChain, tree, channel, sealed: false };
}
const SENSOR_CAPABILITY_NAMES = Object.freeze({
    "eye-tracking": "sensor.eyeTracking",
    "hand-tracking": "sensor.handTracking",
    "room-geometry": "sensor.roomGeometry",
    microphone: "sensor.microphone",
});
export function recordSensorGateDecisions(eventChain, { subject, serviceRequests = {}, enterpriseReinforced = true, at } = {}) {
    if (!isNonEmptyString(subject))
        throw new Error("recordSensorGateDecisions: subject is required");
    const surface = buildCrossingSensorGateSurface({ enterpriseReinforced, serviceRequests });
    const atFields = isIsoDateTime(at) ? { at } : {};
    const events = [];
    for (const g of surface.gates) {
        if (g.effective === "granted")
            continue;
        events.push(appendChainEvent(eventChain, {
            eventClass: g.effective === "denied" ? "capability-denied" : "capability-granted",
            subject,
            capability: SENSOR_CAPABILITY_NAMES[g.sensor] ?? `sensor.${g.sensor}`,
            reason: g.effective === "denied" ? `${g.sensor}-denied-gate-held-at-crossing` : `${g.sensor}-${g.effective}-constraint-held`,
            ...atFields,
        }));
    }
    return { surface, events };
}
export async function sealSomGatingSession(session, { manifestId, evaluatorDid, admissionReceipt = null, privateKeyInput, keyRef, now } = {}) {
    if (!session || session.kind !== "runtime-som-gating-session")
        throw new Error("sealSomGatingSession: a SOM gating session is required");
    if (session.sealed)
        throw new Error("sealSomGatingSession: session already sealed");
    if (!isNonEmptyString(evaluatorDid))
        throw new Error("sealSomGatingSession: evaluatorDid (the mediator/evaluator DID) is required");
    if (!privateKeyInput)
        throw new Error("sealSomGatingSession: privateKeyInput is required — chain links are Profile A signed (runtime contract)");
    const at = isIsoDateTime(now) ? now : new Date().toISOString();
    sealReceiptChain(session.eventChain, { at });
    const links = [];
    const signOpts = { envelope: { subject: evaluatorDid, issuedAt: at }, privateKeyInput, ...(keyRef ? { keyRef } : {}) };
    if (admissionReceipt)
        links.push(await appendReceiptToChain(session.hashChain, admissionReceipt, signOpts));
    const summary = createReceipt({
        manifestId: isNonEmptyString(manifestId) ? manifestId : session.subject,
        evaluatorId: evaluatorDid,
    });
    mergeFragment(summary, { events: chainToReceiptEvents(session.eventChain, { defaultAt: at }) });
    finalizeReceipt(summary, { now: at });
    links.push(await appendReceiptToChain(session.hashChain, summary, signOpts));
    await sealReceiptHashChain(session.hashChain, { at });
    const chainReport = await verifyReceiptChain(session.hashChain, { expectChainId: session.hashChain.chainId });
    session.sealed = true;
    return { summaryReceipt: summary, links, chainReport, traceRows: chainTraceRows(session.eventChain) };
}
export const FACTORY_FLOOR_SOM_DEMO = Object.freeze({
    user: "did:peer:2.Ez6LRp1FactoryFloorSafetyPairwiseUserProjection",
    safetyService: "did:web:factory.example.com:services:floor-safety",
    monitoringService: "did:web:factory.example.com:services:press-monitoring",
    navigationService: "did:web:factory.example.com:services:navigation",
    advertisingService: "did:web:factory.example.com:services:advertising",
    mediator: "did:web:factory.example.com:fabric:browser-mediator",
    userProjectionManifestId: "urn:uuid:33333333-4444-4555-8666-777777777777",
    branches: Object.freeze({
        safety: "/factory/floor-2/safety-service",
        monitoring: "/factory/floor-2/press-monitoring",
        navigation: "/factory/floor-2/navigation-service",
    }),
});
function demoServiceManifest({ serviceDid, readScopes, writeScopes, issuedAt }) {
    return {
        "@context": UM_V04_CONTEXT,
        "@id": `urn:uuid:${globalThis.crypto.randomUUID()}`,
        "@type": "um:Manifest",
        manifestVersion: UM_V04_MANIFEST_VERSION,
        subject: serviceDid,
        issuedAt,
        expiresAt: new Date(Date.parse(issuedAt) + 8 * 3600e3).toISOString(),
        facets: [buildSomBranchAuthorizationFacet({ serviceDid, readScopes, writeScopes })],
    };
}
export async function runFactoryFloorSomDemo({ privateKeyInput, keyRef, admissionReceipt = null, now } = {}) {
    const D = FACTORY_FLOOR_SOM_DEMO;
    const at = isIsoDateTime(now) ? now : new Date().toISOString();
    const serviceManifests = [
        demoServiceManifest({
            serviceDid: D.monitoringService,
            readScopes: ["/factory/floor-2/**"],
            writeScopes: [`${D.branches.monitoring}/**`],
            issuedAt: at,
        }),
        demoServiceManifest({
            serviceDid: D.safetyService,
            readScopes: ["/factory/floor-2/**"],
            writeScopes: [`${D.branches.safety}/**`],
            issuedAt: at,
        }),
        demoServiceManifest({
            serviceDid: D.navigationService,
            readScopes: ["/factory/floor-2/**"],
            writeScopes: [`${D.branches.navigation}/**`],
            issuedAt: at,
        }),
    ];
    const plantPolicyManifest = {
        "@context": UM_V04_CONTEXT,
        "@id": `urn:uuid:${globalThis.crypto.randomUUID()}`,
        "@type": "um:Manifest",
        manifestVersion: UM_V04_MANIFEST_VERSION,
        subject: D.mediator,
        issuedAt: at,
        expiresAt: new Date(Date.parse(at) + 8 * 3600e3).toISOString(),
        facets: [
            buildInterServiceAuthorizationFacet({
                channels: [{ sourceService: D.safetyService, targetCategory: "navigation", messageType: "hazard-reroute" }],
            }),
        ],
    };
    const session = createSomGatingSession({
        subject: D.user,
        serviceManifests,
        channelAuthorizationManifest: plantPolicyManifest,
        branches: Object.values(D.branches),
    });
    registerFabricService(session.channel, { did: D.safetyService, category: "safety" });
    registerFabricService(session.channel, { did: D.advertisingService, category: "advertising" });
    registerFabricService(session.channel, {
        did: D.navigationService,
        category: "navigation",
        onMessage: ({ from, messageType }) => {
            somWrite(session.tree, {
                serviceDid: D.navigationService,
                path: `${D.branches.navigation}/reroute-path`,
                value: { rerouteFor: messageType, requestedBy: from, aisle: "aisle-7-detour" },
                at,
            });
        },
    });
    appendChainEvent(session.eventChain, {
        eventClass: "session-admitted",
        subject: D.user,
        reason: "bilateral-authorisation-completed",
        at,
    });
    const writes = {
        ownBranch: somWrite(session.tree, {
            serviceDid: D.monitoringService,
            path: `${D.branches.monitoring}/telemetry-panel`,
            value: { pressId: "hydraulic-press-3", status: "clear" },
            at,
        }),
        crossBranchBlocked: somWrite(session.tree, {
            serviceDid: D.monitoringService,
            path: `${D.branches.safety}/alert-overlay`,
            value: { hijack: "attempted" },
            at,
        }),
        forkliftAlert: somWrite(session.tree, {
            serviceDid: D.safetyService,
            path: `${D.branches.safety}/forklift-alert`,
            value: { hazard: "forklift", aisle: 7, dismissable: false },
            at,
        }),
    };
    const messages = {
        hazardReroute: sendInterServiceMessage(session.channel, {
            from: D.safetyService,
            targetCategory: "navigation",
            messageType: "hazard-reroute",
            payload: { hazard: "forklift", aisle: 7 },
            at,
        }),
        adPushRefused: sendInterServiceMessage(session.channel, {
            from: D.advertisingService,
            targetCategory: "navigation",
            messageType: "ad-push",
            payload: { ad: "banner" },
            at,
        }),
    };
    const sensors = recordSensorGateDecisions(session.eventChain, { subject: D.user, enterpriseReinforced: true, at });
    let sealed = null;
    if (privateKeyInput) {
        sealed = await sealSomGatingSession(session, {
            manifestId: D.userProjectionManifestId,
            evaluatorDid: D.mediator,
            admissionReceipt,
            privateKeyInput,
            keyRef,
            now: at,
        });
    }
    return { session, writes, messages, sensors, sealed, at };
}
export function somGatingPanelRecord(session, { chainReport } = {}) {
    const rows = session?.eventChain?.events ?? [];
    return {
        kind: "um-rp1-som-gating",
        label: "RP1 SOM branch-auth + inter-service gating (R6/R7)",
        subject: session?.subject ?? "(unknown)",
        chainId: session?.hashChain?.chainId ?? null,
        events: rows.length,
        granted: rows.filter((e) => e.eventClass === "capability-granted").length,
        denied: rows.filter((e) => e.eventClass === "capability-denied").length,
        chain: chainReport ? (chainReport.valid ? "verified" : "BROKEN") : session?.sealed ? "sealed-unverified" : "unsealed",
        preview: feature_SOM_CONFORMANCE.claim_label,
        at: new Date().toISOString(),
    };
}
export const feature_SOM_CONFORMANCE = Object.freeze({
    wo: "runtime",
    bars: Object.freeze(["R6 — inter-service messaging authorization-gated", "R7 — SOM branch-authorization (write scoping)"]),
    bucket: "Bucket 3 — demonstration-only (runtime matrix); FORWARD registered-profile candidate",
    claim_label: "RP1-components demonstration — inter-service authorization + SOM write scoping are FORWARD registered-profile " +
        "candidates (v0.4 README); no v0.4 conformance claim; rp1:* vocabulary is suggested non-normative pending " +
        "multi-ecosystem validation.",
    forward_anchor: "spec/v0.4/README.md §'Explicitly deferred (FORWARD)': 'WASM content trust and inter-service authorization — " +
        "spatial/RP1-driven registered-profile candidates (publisher/module-hash trust chains; service-to-service " +
        "message authorization), not Base additions.'",
    um_conformance: false,
    no_v04_fixtures: "conformance/v0.4/expected.json carries no SOM/inter-service entries — there is nothing to claim against",
    chain_reuse: "runtime's receipt hash-chain is THE chain (single-chain discipline, matrix G6): decisions ride runtime's EVENT " +
        "chain (appendChainEvent, 16-class labels, minimized-receipt whitelist); at seal the events fold into ONE hub " +
        "receipt that lands on runtime's chain via appendReceiptToChain (the runtime-verify E7 route), created through " +
        "createReceiptHashChain({chainId}) — the reserved RP1-review-chain path. No second chain is implemented here.",
    glob_grammar: "literal segments + '*' (exactly one segment) + trailing '/**' (ONE or more descendant segments; the branch " +
        "root itself is NOT matched — protective pin). '**' anywhere else, relative patterns, dot segments, and " +
        "wildcards in concrete paths are refused: a malformed scope or path authorizes NOTHING.",
    vocabulary: Object.freeze({
        published: Object.freeze(["rp1:SOMBranchAuthorization", "rp1:InterServiceAuthorization", "somScopes", "hostFunctions", "serviceDID"]),
        fixture_shapes: Object.freeze([
            "somReadScopes/somWriteScopes (service-requirement-manifest.jsonld)",
            "serviceAuth.scope 'som.read:<glob>' / 'som.write:<glob>' entries (service-scoped-user-projection-manifest.jsonld)",
            "capability-granted/-denied rows with capability som.access / inter-service.message (expected-receipt-trace.json)",
        ]),
        demonstration_suggested: Object.freeze([
            "authorizedChannels[{sourceService,targetCategory,messageType}] — camel-cases the page's own triple ('the " +
                "source, the target category, and the message type'); ONLY the type name InterServiceAuthorization is " +
                "published in the rp1 facet context",
        ]),
    }),
    fail_closed: Object.freeze([
        "unregistered service ⇒ SOM write/read denied; unregistered sender ⇒ message refused",
        "no matching write-scope glob ⇒ write blocked, tree untouched",
        "no (source, targetCategory, messageType) triple ⇒ message refused, never delivered",
        "malformed glob / path / triple ⇒ authorizes nothing (excluded + reported)",
        "no authorization manifest ⇒ zero channels ⇒ all messages refused",
    ]),
    demo_boundary: "In-process browser-demo trust model: enforcement holds for this module's service-facing API (somWrite is the " +
        "only exported mutator; sendInterServiceMessage is the only transport). Not an OS/process-isolation or WASM-" +
        "sandbox claim (R2's components), and facet extraction does not re-verify manifest signatures — the crossing pipeline " +
        "(runtime/137) owns evaluation.",
    builds_on: Object.freeze({
        rp1_model: RP1_MODEL.standard,
        consent_gates: "runtime gateSensorRequest/buildCrossingSensorGateSurface — sensor denials in the same scenes, reused not reimplemented",
        receipt_hub: "runtime — event chain + canonical receipt lifecycle",
        hash_chain: "runtime — THE receipt hash chain (append/seal/verify)",
    }),
});
