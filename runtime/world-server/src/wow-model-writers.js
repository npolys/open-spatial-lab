'use strict';
function boxMesh(size) {
    const h = (Number(size) || 1) / 2;
    const positions = [
        -h, -h, -h, h, -h, -h, h, h, -h, -h, h, -h,
        -h, -h, h, h, -h, h, h, h, h, -h, h, h,
    ];
    const indices = [
        0, 2, 1, 0, 3, 2,
        4, 5, 6, 4, 6, 7,
        0, 1, 5, 0, 5, 4,
        3, 7, 6, 3, 6, 2,
        0, 4, 7, 0, 7, 3,
        1, 2, 6, 1, 6, 5,
    ];
    return { positions, indices };
}
function sphereMesh(size, segments, rings) {
    const r = (Number(size) || 1) / 2;
    const seg = Math.max(6, Number(segments) || 16);
    const rng = Math.max(4, Number(rings) || 12);
    const positions = [];
    const indices = [];
    for (let y = 0; y <= rng; y++) {
        const v = y / rng;
        const phi = v * Math.PI;
        for (let x = 0; x <= seg; x++) {
            const u = x / seg;
            const theta = u * Math.PI * 2;
            positions.push(-r * Math.cos(theta) * Math.sin(phi), r * Math.cos(phi), r * Math.sin(theta) * Math.sin(phi));
        }
    }
    for (let y = 0; y < rng; y++) {
        for (let x = 0; x < seg; x++) {
            const a = y * (seg + 1) + x;
            const b = a + seg + 1;
            indices.push(a, b, a + 1, b, b + 1, a + 1);
        }
    }
    return { positions, indices };
}
function meshForSceneObject(obj) {
    const size = Number(obj && obj.size_m) || 1;
    return String(obj && obj.shape) === 'sphere' ? sphereMesh(size) : boxMesh(size);
}
function hexToRgb01(hex) {
    const clean = String(hex || '#cccccc').replace('#', '');
    const n = parseInt(clean.length === 3
        ? clean.split('').map(c => c + c).join('')
        : clean.slice(0, 6), 16);
    if (!Number.isFinite(n))
        return [0.8, 0.8, 0.8];
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
const f = (n) => (Math.round(Number(n) * 1e6) / 1e6).toString();
function writeObj(mesh, name) {
    const lines = [
        '# Wavefront OBJ — Open Spatial Lab, generated from the live hosted primitive "' + name + '"',
        '# served through OpenSpatialAsset GET / (content-negotiated). model/obj',
        'mtllib ' + name + '.mtl',
        'o ' + name,
    ];
    for (let i = 0; i < mesh.positions.length; i += 3)
        lines.push('v ' + f(mesh.positions[i]) + ' ' + f(mesh.positions[i + 1]) + ' ' + f(mesh.positions[i + 2]));
    lines.push('usemtl ' + name + '-material');
    for (let i = 0; i < mesh.indices.length; i += 3)
        lines.push('f ' + (mesh.indices[i] + 1) + ' ' + (mesh.indices[i + 1] + 1) + ' ' + (mesh.indices[i + 2] + 1));
    return Buffer.from(lines.join('\n') + '\n', 'utf8');
}
function writeMtl(colorHex, name) {
    const [r, g, b] = hexToRgb01(colorHex);
    return Buffer.from([
        '# Wavefront MTL — Open Spatial Lab. model/mtl',
        'newmtl ' + name + '-material',
        'Kd ' + f(r) + ' ' + f(g) + ' ' + f(b),
        'Ka 0 0 0',
        'Ks 0.1 0.1 0.1',
        'Ns 32',
        'd 1',
        'illum 2',
        '',
    ].join('\n'), 'utf8');
}
function writeStl(mesh, name) {
    const p = mesh.positions;
    const lines = ['solid ' + name];
    for (let i = 0; i < mesh.indices.length; i += 3) {
        const a = mesh.indices[i] * 3, b = mesh.indices[i + 1] * 3, c = mesh.indices[i + 2] * 3;
        const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
        const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const len = Math.hypot(nx, ny, nz) || 1;
        nx /= len;
        ny /= len;
        nz /= len;
        lines.push('  facet normal ' + f(nx) + ' ' + f(ny) + ' ' + f(nz));
        lines.push('    outer loop');
        lines.push('      vertex ' + f(p[a]) + ' ' + f(p[a + 1]) + ' ' + f(p[a + 2]));
        lines.push('      vertex ' + f(p[b]) + ' ' + f(p[b + 1]) + ' ' + f(p[b + 2]));
        lines.push('      vertex ' + f(p[c]) + ' ' + f(p[c + 1]) + ' ' + f(p[c + 2]));
        lines.push('    endloop');
        lines.push('  endfacet');
    }
    lines.push('endsolid ' + name);
    return Buffer.from(lines.join('\n') + '\n', 'utf8');
}
function writeGltfJson(mesh, colorHex, name) {
    const positions = Float32Array.from(mesh.positions);
    const indices = Uint16Array.from(mesh.indices);
    const posBytes = Buffer.from(positions.buffer, positions.byteOffset, positions.byteLength);
    const idxBytes = Buffer.from(indices.buffer, indices.byteOffset, indices.byteLength);
    const pad = (4 - (idxBytes.length % 4)) % 4;
    const bin = Buffer.concat([idxBytes, Buffer.alloc(pad), posBytes]);
    let min = [Infinity, Infinity, Infinity];
    let max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < mesh.positions.length; i += 3)
        for (let k = 0; k < 3; k++) {
            min[k] = Math.min(min[k], mesh.positions[i + k]);
            max[k] = Math.max(max[k], mesh.positions[i + k]);
        }
    const [r, g, b] = hexToRgb01(colorHex);
    const gltf = {
        asset: {
            version: '2.0',
            generator: 'Open Spatial Lab — OpenSpatialAsset content-negotiated model/gltf+json '
                + '. Generated from the live hosted primitive.',
        },
        scene: 0,
        scenes: [{ name: name, nodes: [0] }],
        nodes: [{ name: name, mesh: 0 }],
        meshes: [{ name: name, primitives: [{ attributes: { POSITION: 1 }, indices: 0, material: 0, mode: 4 }] }],
        materials: [{
                name: name + '-material',
                pbrMetallicRoughness: { baseColorFactor: [r, g, b, 1], metallicFactor: 0, roughnessFactor: 0.9 },
            }],
        accessors: [
            { bufferView: 0, componentType: 5123, count: indices.length, type: 'SCALAR' },
            { bufferView: 1, componentType: 5126, count: positions.length / 3, type: 'VEC3', min, max },
        ],
        bufferViews: [
            { buffer: 0, byteOffset: 0, byteLength: idxBytes.length, target: 34963 },
            { buffer: 0, byteOffset: idxBytes.length + pad, byteLength: posBytes.length, target: 34962 },
        ],
        buffers: [{ byteLength: bin.length, uri: 'data:application/octet-stream;base64,' + bin.toString('base64') }],
    };
    return Buffer.from(JSON.stringify(gltf, null, 2) + '\n', 'utf8');
}
function writeX3dXml(mesh, colorHex, name) {
    const [r, g, b] = hexToRgb01(colorHex);
    const coordIndex = [];
    for (let i = 0; i < mesh.indices.length; i += 3)
        coordIndex.push(mesh.indices[i], mesh.indices[i + 1], mesh.indices[i + 2], -1);
    const points = [];
    for (let i = 0; i < mesh.positions.length; i += 3)
        points.push(f(mesh.positions[i]) + ' ' + f(mesh.positions[i + 1]) + ' ' + f(mesh.positions[i + 2]));
    return Buffer.from([
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<!DOCTYPE X3D PUBLIC "ISO//Web3D//DTD X3D 3.3//EN" "https://www.web3d.org/specifications/x3d-3.3.dtd">',
        '<X3D profile="Interchange" version="3.3">',
        '  <head>',
        '    <meta name="generator" content="Open Spatial Lab — OpenSpatialAsset model/x3d+xml"/>',
        '    <meta name="title" content="' + name + '"/>',
        '  </head>',
        '  <Scene>',
        '    <Shape DEF="' + name + '">',
        '      <Appearance>',
        '        <Material diffuseColor="' + f(r) + ' ' + f(g) + ' ' + f(b) + '"/>',
        '      </Appearance>',
        '      <IndexedFaceSet solid="true" coordIndex="' + coordIndex.join(' ') + '">',
        '        <Coordinate point="' + points.join(' ') + '"/>',
        '      </IndexedFaceSet>',
        '    </Shape>',
        '  </Scene>',
        '</X3D>',
        '',
    ].join('\n'), 'utf8');
}
function writeUsda(mesh, colorHex, name) {
    const [r, g, b] = hexToRgb01(colorHex);
    const points = [];
    for (let i = 0; i < mesh.positions.length; i += 3)
        points.push('(' + f(mesh.positions[i]) + ', ' + f(mesh.positions[i + 1]) + ', ' + f(mesh.positions[i + 2]) + ')');
    const counts = [];
    for (let i = 0; i < mesh.indices.length; i += 3)
        counts.push(3);
    return Buffer.from([
        '#usda 1.0',
        '(',
        '    defaultPrim = "' + name + '"',
        '    doc = "Open Spatial Lab — OpenSpatialAsset content-negotiated model/vnd.usda"',
        '    metersPerUnit = 1',
        '    upAxis = "Y"',
        ')',
        '',
        'def Mesh "' + name + '"',
        '{',
        '    int[] faceVertexCounts = [' + counts.join(', ') + ']',
        '    int[] faceVertexIndices = [' + mesh.indices.join(', ') + ']',
        '    point3f[] points = [' + points.join(', ') + ']',
        '    color3f[] primvars:displayColor = [(' + f(r) + ', ' + f(g) + ', ' + f(b) + ')]',
        '}',
        '',
    ].join('\n'), 'utf8');
}
module.exports = {
    boxMesh,
    sphereMesh,
    meshForSceneObject,
    writeObj,
    writeMtl,
    writeStl,
    writeGltfJson,
    writeX3dXml,
    writeUsda,
};
