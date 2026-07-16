'use strict';
const fs = require('fs');
const nodePath = require('path');
const SPEC_NEGOTIATED_MEDIA_TYPES = Object.freeze([
    { mediaType: 'model/3mf', iana: true, ext: '3mf', binary: true },
    { mediaType: 'model/e57', iana: true, ext: 'e57', binary: true },
    { mediaType: 'model/gltf-binary', iana: true, ext: 'glb', binary: true },
    { mediaType: 'model/gltf+json', iana: true, ext: 'gltf', binary: false },
    { mediaType: 'model/JT', iana: true, ext: 'jt', binary: true },
    { mediaType: 'model/iges', iana: true, ext: 'iges', binary: true },
    { mediaType: 'model/mtl', iana: true, ext: 'mtl', binary: false },
    { mediaType: 'model/obj', iana: true, ext: 'obj', binary: false },
    { mediaType: 'model/prc', iana: true, ext: 'prc', binary: true },
    { mediaType: 'model/step', iana: true, ext: 'step', binary: true },
    { mediaType: 'model/step+xml', iana: true, ext: 'stpx', binary: false },
    { mediaType: 'model/step+zip', iana: true, ext: 'stpz', binary: true },
    { mediaType: 'model/step-xml+zip', iana: true, ext: 'stpxz', binary: true },
    { mediaType: 'model/stl', iana: true, ext: 'stl', binary: false },
    { mediaType: 'model/vnd.collada+xml', iana: true, ext: 'dae', binary: false },
    { mediaType: 'model/vnd.usda', iana: true, ext: 'usda', binary: false },
    { mediaType: 'model/vnd.usdz+zip', iana: true, ext: 'usdz', binary: true },
    { mediaType: 'model/vrml', iana: true, ext: 'wrl', binary: false },
    { mediaType: 'model/x3d-vrml', iana: true, ext: 'x3dv', binary: false },
    { mediaType: 'model/x3d+fastinfoset', iana: true, ext: 'x3db', binary: true },
    { mediaType: 'model/x3d+xml', iana: true, ext: 'x3d', binary: false },
]);
const README_ONLY_MEDIA_TYPES = Object.freeze([
    { mediaType: 'model/u3d', iana: true, ext: 'u3d', binary: true },
]);
const WANTED_BUT_UNREGISTERED = Object.freeze([
    Object.freeze({ name: 'las', iana: false, note: 'LAS point cloud — upstream wants it; IANA has not registered it (😦).' }),
    Object.freeze({ name: 'glExtRef', iana: false, note: 'glTF External Reference — upstream wants it; IANA has not registered it (😦).' }),
    Object.freeze({ name: 'SPZ', iana: false, note: 'Niantic SPZ gaussian splats — upstream wants it; IANA has not registered it (😦).' }),
]);
const PROVISIONAL_MEDIA_TYPES = Object.freeze([
    {
        mediaType: 'application/msf+jws', iana: false, ext: 'msf', binary: true, provisional: true,
        note: 'PROVISIONAL, UNREGISTERED, OURS (D8). No such IANA media type exists. OpenSpatialAsset '
            + 'negotiates 21 model/* types and has NO signed-document type; this label is what we propose '
            + 'upstream. Serving it here makes the proposal an implementer\'s, not a '
            + 'bystander\'s. It does NOT make us conformant — nothing does; there is no conformance suite.',
    },
]);
const ALL_MEDIA_TYPES = Object.freeze(SPEC_NEGOTIATED_MEDIA_TYPES.concat(README_ONLY_MEDIA_TYPES, PROVISIONAL_MEDIA_TYPES)
    .map(entry => Object.freeze(entry)));
const BY_MEDIA_TYPE = new Map(ALL_MEDIA_TYPES.map(entry => [entry.mediaType.toLowerCase(), entry]));
function mediaTypeInfo(mediaType) {
    return BY_MEDIA_TYPE.get(String(mediaType || '').toLowerCase()) || null;
}
function assertSpecTranscriptionIsFaithful(specYamlPath) {
    const p = specYamlPath || nodePath.join(nodePath.sep + nodePath.join('Users', 'grig', 'work'), 'spatial-computing-research-projects-msf', 'research', 'xr-runtime-comparison', 'web-of-worlds', 'repos', 'WoWAPI', 'specification', 'OpenSpatialAsset', 'API.yaml');
    if (!fs.existsSync(p))
        return { skipped: true, reason: 'upstream WoWAPI clone not present at ' + p };
    const text = fs.readFileSync(p, 'utf8');
    const getBlock = text.slice(text.indexOf('    get:'), text.indexOf('  /wow/asset:') === -1 ? text.length : text.indexOf('  /wow/asset:'));
    const found = [];
    const re = /^ {12}([A-Za-z0-9][\w.+-]*\/[\w.+-]+):\s*$/gm;
    let m;
    while ((m = re.exec(getBlock)) !== null)
        found.push(m[1]);
    const ours = SPEC_NEGOTIATED_MEDIA_TYPES.map(e => e.mediaType);
    const oursSet = new Set(ours.map(s => s.toLowerCase()));
    const specSet = new Set(found.map(s => s.toLowerCase()));
    const missing = found.filter(s => !oursSet.has(s.toLowerCase()));
    const extra = ours.filter(s => !specSet.has(s.toLowerCase()));
    if (found.length === 0)
        throw new Error('wow-media-types: DRIFT GUARD BROKEN — extracted ZERO media types from ' + p
            + '. The guard is measuring nothing; fix the extractor before trusting any count.');
    if (missing.length || extra.length || found.length !== ours.length)
        throw new Error('wow-media-types: TRANSCRIPTION DRIFT vs ' + p
            + ' — spec negotiates ' + found.length + ', we transcribe ' + ours.length
            + '; spec-has-we-lack=[' + missing.join(', ') + ']'
            + '; we-have-spec-lacks=[' + extra.join(', ') + ']');
    return { count: ours.length, spec_count: found.length, missing, extra, source: p };
}
function parseAccept(headerValue) {
    const raw = String(headerValue == null ? '' : headerValue).trim();
    if (!raw)
        return [];
    const ranges = [];
    for (const part of raw.split(',')) {
        const bits = part.trim().split(';');
        const range = bits.shift();
        if (!range)
            continue;
        const slash = range.indexOf('/');
        if (slash === -1)
            continue;
        const type = range.slice(0, slash).trim().toLowerCase();
        const subtype = range.slice(slash + 1).trim().toLowerCase();
        if (!type || !subtype)
            continue;
        let q = 1;
        for (const param of bits) {
            const eq = param.indexOf('=');
            if (eq === -1)
                continue;
            if (param.slice(0, eq).trim().toLowerCase() !== 'q')
                continue;
            const parsed = Number(param.slice(eq + 1).trim());
            if (Number.isFinite(parsed))
                q = Math.min(1, Math.max(0, parsed));
        }
        const specificity = type === '*' ? 0 : (subtype === '*' ? 1 : 2);
        ranges.push({ type, subtype, q, specificity });
    }
    return ranges;
}
function rangeMatches(range, mediaType) {
    const slash = mediaType.indexOf('/');
    const type = mediaType.slice(0, slash).toLowerCase();
    const subtype = mediaType.slice(slash + 1).toLowerCase();
    if (range.type === '*' && range.subtype === '*')
        return true;
    if (range.type !== type)
        return false;
    return range.subtype === '*' || range.subtype === subtype;
}
function negotiate(acceptHeader, offers) {
    const list = Array.isArray(offers) ? offers.filter(Boolean) : [];
    if (!list.length)
        return { mediaType: null, q: 0, negotiated: false, reason: 'no_representations' };
    const ranges = parseAccept(acceptHeader);
    if (!ranges.length)
        return { mediaType: list[0], q: 1, negotiated: false, reason: 'no_accept_header_default_representation' };
    let best = null;
    for (const offer of list) {
        let chosen = null;
        for (const range of ranges) {
            if (!rangeMatches(range, offer))
                continue;
            if (!chosen
                || range.specificity > chosen.specificity
                || (range.specificity === chosen.specificity && range.q > chosen.q))
                chosen = range;
        }
        if (!chosen || chosen.q <= 0)
            continue;
        const candidate = { mediaType: offer, q: chosen.q, specificity: chosen.specificity };
        if (!best
            || candidate.q > best.q
            || (candidate.q === best.q && candidate.specificity > best.specificity))
            best = candidate;
    }
    if (!best)
        return {
            mediaType: null, q: 0, negotiated: true, reason: 'not_acceptable',
            offered: list.slice(),
        };
    return {
        mediaType: best.mediaType, q: best.q, negotiated: true,
        reason: 'content_negotiated', offered: list.slice(),
    };
}
module.exports = {
    SPEC_NEGOTIATED_MEDIA_TYPES,
    README_ONLY_MEDIA_TYPES,
    WANTED_BUT_UNREGISTERED,
    PROVISIONAL_MEDIA_TYPES,
    ALL_MEDIA_TYPES,
    SPEC_NEGOTIATED_COUNT: SPEC_NEGOTIATED_MEDIA_TYPES.length,
    mediaTypeInfo,
    assertSpecTranscriptionIsFaithful,
    parseAccept,
    negotiate,
};
