'use strict';
const crypto = require('crypto');
const fs = require('fs');
const nodePath = require('path');
const mt = require('./wow-media-types');
const mw = require('./wow-model-writers');
const REPO_ROOT = nodePath.resolve(__dirname, '..', '..', '..');
const DEV_BEARER_TOKEN = process.env.OSL_DEMO_ASSET_TOKEN || null;
const ASSET_BASE_PREFIX = '/wow/asset/';
function etagOf(bytes) {
    return '"sha256:' + crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 32) + '"';
}
function ifNoneMatchHits(headerValue, etag) {
    const raw = String(headerValue == null ? '' : headerValue).trim();
    if (!raw)
        return false;
    if (raw === '*')
        return true;
    return raw.split(',')
        .map(s => s.trim().replace(/^W\//, ''))
        .some(candidate => candidate === etag);
}
function createAssetRegistry(opts) {
    const options = opts || {};
    const getSceneObjects = typeof options.getSceneObjects === 'function' ? options.getSceneObjects : () => [];
    const geoPoseFor = typeof options.geoPoseFor === 'function' ? options.geoPoseFor : () => null;
    const proofBoundary = typeof options.proofBoundary === 'function' ? options.proofBoundary : () => null;
    const FILE_ASSETS = [
        {
            id: 'equip-crown',
            file: nodePath.join(REPO_ROOT, 'web', 'assets', 'equip-crown.glb'),
            mediaType: 'model/gltf-binary',
            label: 'Equipment — crown (glTF-binary)',
            license: 'CC0-1.0',
            cost: 'free',
            version: 1,
            age_restriction: 0,
        },
        {
            id: 'hero-held-lantern',
            file: nodePath.join(REPO_ROOT, 'web', 'assets', 'hero-held-lantern.gltf'),
            mediaType: 'model/gltf+json',
            label: 'Equipment — held lantern (glTF+JSON)',
            license: 'CC0-1.0',
            cost: 'free',
            version: 1,
            age_restriction: 0,
        },
    ];
    const ELSEWHERE_ASSETS = [];
    const cache = new Map();
    function primitiveRepresentations(obj) {
        const mesh = mw.meshForSceneObject(obj);
        const name = String(obj.object_id);
        const color = obj.color || '#cccccc';
        return [
            ['model/gltf+json', mw.writeGltfJson(mesh, color, name)],
            ['model/obj', mw.writeObj(mesh, name)],
            ['model/mtl', mw.writeMtl(color, name)],
            ['model/stl', mw.writeStl(mesh, name)],
            ['model/x3d+xml', mw.writeX3dXml(mesh, color, name)],
            ['model/vnd.usda', mw.writeUsda(mesh, color, name)],
        ];
    }
    function defineAsset(assetId) {
        const id = String(assetId || '');
        if (!id)
            return null;
        for (const spec of FILE_ASSETS) {
            if (spec.id !== id)
                continue;
            if (!fs.existsSync(spec.file))
                return null;
            return {
                id, kind: 'file', spec,
                restricted: false, hidden: false, elsewhere: null,
                content: {
                    label: spec.label, age_restriction: spec.age_restriction,
                    license: spec.license, cost: spec.cost, version: spec.version,
                },
            };
        }
        for (const spec of ELSEWHERE_ASSETS) {
            if (spec.id !== id)
                continue;
            return {
                id, kind: 'elsewhere', spec,
                restricted: false, hidden: false, elsewhere: spec.location,
                content: {
                    label: spec.label, age_restriction: spec.age_restriction,
                    license: spec.license, cost: spec.cost, version: spec.version,
                },
            };
        }
        const objs = getSceneObjects() || [];
        const match = objs.find(o => 'primitive-' + String(o.object_id) === id);
        if (match)
            return {
                id, kind: 'primitive', obj: match,
                restricted: objs[0] && objs[0].object_id === match.object_id,
                hidden: objs[1] && objs[1].object_id === match.object_id,
                elsewhere: null,
                content: {
                    label: 'Hosted primitive — ' + match.object_id + ' (' + (match.shape || 'box') + ')',
                    age_restriction: 0,
                    license: 'CC0-1.0 (Open Spatial Lab hosted primitive)',
                    cost: 'free',
                    version: 1,
                },
            };
        return null;
    }
    function representationsOf(asset) {
        if (asset.kind === 'elsewhere')
            return new Map();
        if (cache.has(asset.id))
            return cache.get(asset.id);
        const reps = new Map();
        const entries = asset.kind === 'file'
            ? [[asset.spec.mediaType, fs.readFileSync(asset.spec.file)]]
            : primitiveRepresentations(asset.obj);
        for (const [mediaType, bytes] of entries) {
            const info = mt.mediaTypeInfo(mediaType);
            reps.set(mediaType, {
                mediaType,
                bytes,
                etag: etagOf(bytes),
                ext: info ? info.ext : 'bin',
                provisional: !!(info && info.provisional),
            });
        }
        cache.set(asset.id, reps);
        return reps;
    }
    function authorize(asset, headers) {
        const auth = String((headers && (headers.authorization || headers.Authorization)) || '');
        const bearer = /^Bearer\s+(.+)$/i.exec(auth);
        const token = bearer ? bearer[1].trim() : null;
        const ok = DEV_BEARER_TOKEN !== null && token === DEV_BEARER_TOKEN;
        if (asset.hidden && !ok)
            return { status: 404, error: 'not_found',
                why: 'existence concealed — OpenSpatialAsset API.yaml: "Not Found. Element does not exist '
                    + 'or user does not have authorization to know whether this resource exists or not."' };
        if (asset.restricted && !ok)
            return { status: 403, error: 'forbidden',
                why: 'OpenSpatialAsset API.yaml: "Forbidden. User does not have authorization to view this '
                    + 'resource." Present `Authorization: Bearer <token>` (local demo token; NOT an SSO integration).' };
        return null;
    }
    function assetIds() {
        const ids = [];
        for (const spec of FILE_ASSETS)
            if (fs.existsSync(spec.file))
                ids.push(spec.id);
        for (const spec of ELSEWHERE_ASSETS)
            ids.push(spec.id);
        for (const obj of (getSceneObjects() || []))
            ids.push('primitive-' + String(obj.object_id));
        return ids;
    }
    function assetDescriptor(asset) {
        const reps = representationsOf(asset);
        const offers = Array.from(reps.keys());
        return {
            content: {
                label: asset.content.label,
                age_restriction: asset.content.age_restriction,
                license: asset.content.license,
                cost: asset.content.cost,
                version: asset.content.version,
            },
            geoPose: geoPoseFor(asset) || undefined,
            webofworlds_extension: {
                x_osl_extension: true,
                formats: offers.map((mediaType) => {
                    const rep = reps.get(mediaType);
                    return {
                        mediaType,
                        etag: rep.etag,
                        bytes: rep.bytes.length,
                        provisional: rep.provisional || undefined,
                    };
                }),
                default_representation: offers[0] || null,
                elsewhere: asset.elsewhere || undefined,
                restricted: asset.restricted || undefined,
                note: 'LABELED x-osl-extension. The canonical Asset schema (content + geoPose) has NO way to '
                    + 'advertise an asset\'s available formats — the README lists "Formats" under Optional '
                    + 'Feature / Additional asset aspects but no schema carries it. This field is OURS.',
            },
            proof_boundary: proofBoundary() || undefined,
        };
    }
    return {
        DEV_BEARER_TOKEN,
        ASSET_BASE_PREFIX,
        assetIds,
        defineAsset,
        representationsOf,
        authorize,
        assetDescriptor,
        etagOf,
        ifNoneMatchHits,
        invalidate(assetId) { if (assetId)
            cache.delete(String(assetId));
        else
            cache.clear(); },
    };
}
module.exports = { createAssetRegistry, etagOf, ifNoneMatchHits, DEV_BEARER_TOKEN, ASSET_BASE_PREFIX };
