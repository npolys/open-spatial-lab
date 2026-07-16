'use strict';
export const WOW_INTENT = Object.freeze({
    JOIN: 'join',
    FOLLOW: 'follow',
    PREVIEW: 'preview',
});
const KNOWN_INTENTS = new Set([WOW_INTENT.JOIN, WOW_INTENT.FOLLOW, WOW_INTENT.PREVIEW]);
export const DEFAULT_INTENT = WOW_INTENT.JOIN;
export const ASPECT_KIND = Object.freeze({
    USER: 'user',
    NODE: 'node',
});
export const OSL_WORLDS = Object.freeze({
    lobby: Object.freeze({ key: 'lobby', apiBase: '/api/lobby', label: 'Lobby' }),
    a: Object.freeze({ key: 'a', apiBase: '/api/a', label: 'Location A' }),
    b: Object.freeze({ key: 'b', apiBase: '/api/b', label: 'Location B' }),
});
export const ROLE_TO_WORLD = Object.freeze({
    source: 'a',
    target: 'b',
    player: 'lobby',
});
export const DEFAULT_WORLD = 'a';
export function parseWowFragment(fragment) {
    const raw = String(fragment == null ? '' : fragment);
    const body = raw.startsWith('#') ? raw.slice(1) : raw;
    if (body === '') {
        return {
            intent: DEFAULT_INTENT,
            aspectId: null,
            recognized: true,
            bare: true,
            raw,
            reason: null,
        };
    }
    const m = /^([A-Za-z]+)(?:=([\s\S]*))?$/.exec(body);
    if (!m) {
        return unrecognized(raw, 'fragment is not a `verb` or `verb=value` token');
    }
    const verb = m[1].toLowerCase();
    if (!KNOWN_INTENTS.has(verb)) {
        return unrecognized(raw, `"${verb}" is not a WoW intent verb (join|follow|preview)`);
    }
    let aspectId = null;
    if (m[2] !== undefined) {
        let value = m[2];
        try {
            value = decodeURIComponent(value);
        }
        catch (_) { }
        value = value.trim();
        if (value !== '')
            aspectId = value;
    }
    return {
        intent: verb,
        aspectId,
        recognized: true,
        bare: false,
        raw,
        reason: null,
    };
}
function unrecognized(raw, reason) {
    return {
        intent: DEFAULT_INTENT,
        aspectId: null,
        recognized: false,
        bare: false,
        raw,
        reason,
    };
}
export function intentRegistersPresence(intent) {
    return intent === WOW_INTENT.JOIN || intent === WOW_INTENT.FOLLOW;
}
export function followTargetFor(parsed) {
    if (parsed.intent !== WOW_INTENT.FOLLOW)
        return null;
    return parsed.aspectId || null;
}
export function resolveAspect(aspectId, opts = {}) {
    if (!aspectId)
        return { kind: null, id: null, qualified: false, candidates: [] };
    const spatialId = opts.spatialId || null;
    const slash = String(aspectId).indexOf('/');
    if (slash > 0) {
        const kind = aspectId.slice(0, slash).toLowerCase();
        const id = aspectId.slice(slash + 1);
        if (kind === ASPECT_KIND.USER && id)
            return { kind: ASPECT_KIND.USER, id, qualified: true, candidates: [`/wow/user/${enc(id)}`] };
        if (kind === ASPECT_KIND.NODE && id && spatialId)
            return { kind: ASPECT_KIND.NODE, id, qualified: true, candidates: [`/wow/spatial/${enc(spatialId)}/node/${enc(id)}`] };
        if (kind === ASPECT_KIND.NODE && id)
            return { kind: ASPECT_KIND.NODE, id, qualified: true, candidates: [] };
    }
    const id = String(aspectId);
    const candidates = [`/wow/user/${enc(id)}`];
    if (spatialId)
        candidates.push(`/wow/spatial/${enc(spatialId)}/node/${enc(id)}`);
    return { kind: null, id, qualified: false, candidates };
}
function enc(s) { return encodeURIComponent(String(s)); }
export function worldUrlFor(origin, worldKey) {
    const key = normalizeWorldKey(worldKey) || DEFAULT_WORLD;
    return `${stripTrailingSlash(origin)}/w/${key}/`;
}
export function wowApiBase(worldUrl) {
    return `${stripTrailingSlash(worldUrl)}/wow`;
}
function stripTrailingSlash(s) { return String(s || '').replace(/\/+$/, ''); }
function normalizeWorldKey(k) {
    const key = String(k || '').toLowerCase();
    return Object.prototype.hasOwnProperty.call(OSL_WORLDS, key) ? key : null;
}
export function parseWorldUrl(href, opts = {}) {
    const u = new URL(String(href));
    let worldKey = null;
    let worldSource = 'default';
    const pathMatch = /^\/w\/([^/]+)(\/.*)?$/.exec(u.pathname);
    if (pathMatch) {
        const k = normalizeWorldKey(decodeURIComponent(pathMatch[1]));
        if (k) {
            worldKey = k;
            worldSource = 'path';
        }
    }
    if (!worldKey) {
        const active = String(u.searchParams.get('active') || '').toLowerCase();
        const roleParam = String(u.searchParams.get('role') || '').toLowerCase();
        const stage = ['1', 'true'].includes(String(u.searchParams.get('stage') || '').toLowerCase());
        const role = roleParam === 'target' ? 'target'
            : (roleParam === 'player' || (!roleParam && stage)) ? 'player'
                : 'source';
        if (active === 'target' || active === 'b') {
            worldKey = 'b';
            worldSource = 'query:active';
        }
        else if (active === 'source' || active === 'a') {
            worldKey = 'a';
            worldSource = 'query:active';
        }
        else if (active === 'lobby') {
            worldKey = 'lobby';
            worldSource = 'query:active';
        }
        else if (role === 'player') {
            worldKey = 'lobby';
            worldSource = 'query:role';
        }
        else if (role === 'target') {
            worldKey = 'b';
            worldSource = 'query:role';
        }
        else {
            worldKey = DEFAULT_WORLD;
            worldSource = roleParam ? 'query:role' : 'default';
        }
    }
    const frag = parseWowFragment(u.hash);
    const aspect = resolveAspect(frag.aspectId, opts);
    const worldUrl = worldUrlFor(u.origin, worldKey);
    return {
        world: worldKey,
        worldSource,
        worldUrl,
        apiBase: OSL_WORLDS[worldKey].apiBase,
        wowApiBase: wowApiBase(worldUrl),
        intent: frag.intent,
        aspectId: frag.aspectId,
        aspect,
        recognized: frag.recognized,
        bare: frag.bare,
        reason: frag.reason,
        registersPresence: intentRegistersPresence(frag.intent),
        followTarget: followTargetFor(frag),
        persistUrl: buildWorldUrl(worldUrl, { intent: frag.intent, aspectId: frag.aspectId }),
    };
}
export function buildWorldUrl(worldUrl, { intent = DEFAULT_INTENT, aspectId = null } = {}) {
    const base = `${stripTrailingSlash(worldUrl)}/`;
    const verb = KNOWN_INTENTS.has(intent) ? intent : DEFAULT_INTENT;
    if (verb === DEFAULT_INTENT && !aspectId)
        return base;
    if (!aspectId)
        return `${base}#${verb}`;
    return `${base}#${verb}=${encodeURIComponent(aspectId)}`;
}
export const WOW_CORE_INTERPRETATIONS = Object.freeze([
    Object.freeze({
        id: 'I1', subject: '"aspect.id" is a placeholder, not a literal',
        spec_says: 'URL#join=aspect.id',
        we_read: 'the value after "=" is an aspect identifier',
        reasoning: '§ Optional Feature addresses a concrete aspect as /wow/user/4182 and /wow/world advertises "live aspects"; the other cells are concrete literals, so aspect.id reads as object.field.',
    }),
    Object.freeze({
        id: 'I2', subject: 'what an aspect IS',
        spec_says: '"Read and write aspects of the world ... (e.g user avatar)" -> /wow/user/4182; "expose parts of scene" -> /wow/scene/node',
        we_read: 'an aspect is a user/avatar (/wow/user/{id}) or a scene node (/wow/spatial/{id}/node/{nodeId})',
        reasoning: 'those are the only resources the spec itself calls aspects. We invent no third id-space.',
        gap: 'aspect id SYNTAX is never defined (opaque? typed? unique across kinds?), and the spec never says what to do when an aspect.id does not resolve.',
    }),
    Object.freeze({
        id: 'I3', subject: 'fragment is a single verb[=value] token; verb matched case-insensitively',
        spec_says: 'URL#join, URL#join=aspect.id',
        we_read: 'exactly one verb per URL; #Join == #join; compound fragments are not WoW intents',
        reasoning: 'the spec never shows a separator or a repeated verb. Liberal in what we accept, strict in what we emit (always lowercase).',
        gap: 'case sensitivity and compound fragments are unspecified.',
    }),
    Object.freeze({
        id: 'I4', subject: 'unrecognized fragments are not hijacked',
        spec_says: '(nothing)',
        we_read: '#some-anchor is not a WoW intent: fall back to the bare-URL join reading and flag recognized:false so ordinary anchor behaviour is untouched',
        reasoning: 'visiting URL#anchor is still visiting URL (so the join reading survives), but swallowing every fragment would break every non-WoW use of the fragment on the same page.',
    }),
    Object.freeze({
        id: 'I5', subject: 'PREVIEW registers no presence; FOLLOW does — THE LOAD-BEARING READING',
        spec_says: 'Preview: "experence world without" [TRUNCATED MID-SENTENCE UPSTREAM]. Follow: "follow the world as new or existing user". Join: "join the world as new or existing user".',
        we_read: 'preview = experience the world WITHOUT JOINING it: no session, no presence registration. follow = a real user (presence registered) whose viewpoint is attached to an aspect.',
        reasoning: 'The Preview clause is cut off upstream. The only reading that completes it naturally, keeps Preview distinct from Join, and explains why Join and Follow BOTH say "as new or existing user" while Preview conspicuously does not, is "without joining". Follow keeps the user wording, so Follow is not the no-session mode — Preview is.',
        rejected_alternative: 'follow = social-media subscribe (no presence). Rejected: it would make Follow\'s own description ("as new or existing user") false, would near-duplicate Preview, and would leave Preview\'s "without" unexplained.',
        gap: 'the words "without joining" are OURS. The spec sentence stops at "without".',
    }),
    Object.freeze({
        id: 'I6', subject: 'bare #follow (no aspect) follows the WORLD',
        spec_says: 'URL#follow',
        we_read: 'register presence and track the world with a free camera — a join FLAGGED as following, so a follow-target can attach later without a reload',
        reasoning: 'the row is titled "Follow world"; with no aspect there is nothing to attach to.',
        gap: 'the spec does not say what following a world (rather than an aspect) does.',
    }),
    Object.freeze({
        id: 'I7', subject: 'a world URL is a PATH prefix; OSL mounts worlds at /w/{world}',
        spec_says: 'URL/wow/world, URL/wow/user/4182',
        we_read: 'the world URL must be an origin-or-path prefix, because the spec composes the optional resources onto it by plain path concatenation',
        reasoning: 'you cannot append "/wow/world" to "http://host/?role=player" and get anything meaningful. OSL\'s legacy entry URLs were query-based, which is precisely why no OSL origin answered URL/wow/world (gap G-NEW-1). The legacy query form still resolves to the same world, so nothing breaks.',
    }),
    Object.freeze({
        id: 'I8', subject: 'the persisted/shared URL carries the fragment',
        spec_says: 'Persist: "store or bookmark URL". Share: "send URL to second user".',
        we_read: 'the bookmarked/shared URL includes its fragment, so restoring or sharing returns the same world AND aspect AND mode; a bare join emits the clean fragment-less URL',
        reasoning: 'in both rows the artefact is *the URL*, and a URL includes its fragment. A URL that cannot be bookmarked back into the same state satisfies neither row.',
    }),
    Object.freeze({
        id: 'I9', subject: 'upstream self-contradiction: /wow/scene/ vs /wow/spatial/',
        spec_says: 'README.md § Optional Feature says URL/wow/scene/ and URL/wow/scene/node. API.yaml, in the SAME repo, says /wow/spatial/{spatialID} and /wow/spatial/{spatialID}/node/{nodeId}.',
        we_read: 'we emit and serve the API.yaml spelling (/wow/spatial/...)',
        reasoning: 'API.yaml is the machine-readable, generated and testable artefact, and is what OSL already serves. This is a CONTRADICTION IN THE SPEC, not an ambiguity — it needs an upstream fix, not a reading.',
        gap: 'UPSTREAM DEFECT: the prose spec and the OpenAPI file disagree on the scene/spatial path.',
    }),
    Object.freeze({
        id: 'I10', subject: 'a /w/{world} URL is a WORLD ENTRY, so it boots the embodied player role',
        spec_says: '(nothing — the spec never says what role or embodiment a world entry starts in)',
        we_read: 'visiting a world URL means entering the world as an embodied player; an explicit ?role= still wins',
        reasoning: 'the Core Requirements say you JOIN a world by visiting its URL "as new or existing user". OSL\'s legacy ?role=source|target inspector windows are Open Spatial Lab observer views, not WoW world entries, so they must not be the default a WoW client lands in.',
        gap: 'the spec says nothing about roles, embodiment, or what a visitor IS on arrival.',
    }),
    Object.freeze({
        id: 'I11', subject: 'OpenSpatialAsset media types — API.yaml vs the README registration table disagree',
        spec_says: 'API.yaml GET / negotiates 21 model/* types (incl. model/vnd.collada+xml, model/vrml); the README\'s IANA table lists model/u3d but NOT those two, and marks las/glExtRef/SPZ as wanted-but-unregistered (😦).',
        we_read: 'negotiate the API.yaml set (the machine-readable artifact wins, same rule as I9) and ALSO accept model/u3d because the README registers it; carry the 😦 unregistered column verbatim.',
        reasoning: 'the count 21 is DERIVED, not quoted: wow-media-types.js re-reads the upstream YAML and throws on any drift, so the transcription is re-checked rather than trusted. The two lists genuinely differ — a contradiction to declare, not silently reconcile.',
        gap: 'UPSTREAM DEFECT: the prose registration table and the OpenAPI content block are not the same set.',
    }),
    Object.freeze({
        id: 'I12', subject: 'an OpenSpatialAsset URL is a PATH PREFIX (the spec describes one asset per base URL)',
        spec_says: 'paths are `/` (HEAD/GET bytes) and `/wow/asset` (the Asset descriptor), rooted at an asset ORIGIN; the spec never says how a server hosting MANY assets addresses them.',
        we_read: 'the base is a path prefix — HEAD/GET / compose as /wow/asset/{assetId}/ and the descriptor as /wow/asset/{assetId}/wow/asset. No index endpoint is invented; a bare GET /wow/asset 404s.',
        reasoning: 'the same reading I7 took for world URLs, blessed by the spec\'s own server URL carrying a /v1 path segment. Discovery is by URL — the WoW premise — not by a catalogue the spec does not define.',
    }),
    Object.freeze({
        id: 'I13', subject: 'OpenSpatialAsset 403 vs 404 — a 404 may CONCEAL existence (spec text, not our liberty)',
        spec_says: '404 = "Element does not exist OR user does not have authorization to know whether this resource exists or not." 403 = "User does not have authorization to view this resource."',
        we_read: 'a restricted asset answers 403 (it is admitted to exist); a hidden asset answers 404 even though it exists (existence concealed). Both arms are exercised on REAL, live primitives, so both are provable on the wire.',
        reasoning: 'the existence-concealing 404 is the spec\'s own sentence; we implement both arms rather than pick one. Our authorization is a labelled local demo bearer token — enough to make 403/404 real, explicitly NOT an SSO integration.',
    }),
    Object.freeze({
        id: 'I14', subject: 'the OpenUserManifest base is a PATH PREFIX per user, at a SEPARATE origin',
        spec_says: 'the manifest is rooted at `/` of a manifest origin (server URL carries /v1); HEAD/GET / return one manifest; the spec never says how an origin serving many users addresses them.',
        we_read: 'the manifest lives at its OWN origin (a separate port — RFC 6454 makes that a distinct web origin) and composes as /v1/{userId}/; a world DEREFERENCES it instead of reading it inlined.',
        reasoning: 'same prefix reading as I7/I12; the separate origin is not hand-waved — the browser\'s own same-origin policy agrees a different port is a different origin. /wow/user STILL inlines the signed manifest (declared, versioned redundancy D10), so no existing client breaks.',
    }),
    Object.freeze({
        id: 'I15', subject: 'OpenUserManifest 302 is on GET only — a redirected manifest is un-HEAD-able',
        spec_says: 'API.yaml puts 302 "Resource is located elsewhere" on GET; HEAD declares only 200/403/404 and says "Redirects are not followed."',
        we_read: 'GET 302s to the location; HEAD answers 200 with the ETag OF THE POINTER (never a 302), because by the spec\'s own sentence a HEAD 302 would be read as unauthorized. We invent no code the spec does not list for HEAD.',
        reasoning: 'following the spec EXACTLY exposes a real hole: a relocated manifest cannot be HEAD-checked for freshness. Reported upstream. The asset pillar\'s elsewhere HEAD takes the same reading for the same reason.',
        gap: 'UPSTREAM DEFECT: HEAD has no way to express "located elsewhere", so a redirected resource is un-HEAD-able.',
    }),
]);
export default {
    WOW_INTENT,
    DEFAULT_INTENT,
    ASPECT_KIND,
    OSL_WORLDS,
    ROLE_TO_WORLD,
    DEFAULT_WORLD,
    parseWowFragment,
    parseWorldUrl,
    buildWorldUrl,
    worldUrlFor,
    wowApiBase,
    resolveAspect,
    intentRegistersPresence,
    followTargetFor,
    WOW_CORE_INTERPRETATIONS,
};
