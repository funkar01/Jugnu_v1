import fs from 'fs';

const file = 'public/gltf/MonacoRoad.glb';
if (!fs.existsSync(file)) {
    console.error('File not found!');
    process.exit(1);
}

const buffer = fs.readFileSync(file);
const chunkLength = buffer.readUInt32LE(12);
const jsonString = buffer.toString('utf8', 20, 20 + chunkLength);
const gltf = JSON.parse(jsonString);

// Read binary buffer
const binHeaderOffset = 20 + chunkLength;
const binChunkLength = buffer.readUInt32LE(binHeaderOffset);
const binChunkType = buffer.readUInt32LE(binHeaderOffset + 4);
const binDataOffset = binHeaderOffset + 8;

console.log(`Binary Chunk Length: ${binChunkLength}, Type: 0x${binChunkType.toString(16)}`);

const mesh = gltf.meshes[0];
const primitive = mesh.primitives[0];
const posAccessorIdx = primitive.attributes.POSITION;
const posAccessor = gltf.accessors[posAccessorIdx];
const bufferView = gltf.bufferViews[posAccessor.bufferView];

const byteOffset = (bufferView.byteOffset || 0) + (posAccessor.byteOffset || 0) + binDataOffset;
const count = posAccessor.count;
const byteStride = bufferView.byteStride || 12; // 3 floats * 4 bytes

console.log(`Reading ${count} vertices, starting at offset ${byteOffset}, stride ${byteStride}`);

const vertices = [];
for (let i = 0; i < count; i++) {
    const offset = byteOffset + i * byteStride;
    const x = buffer.readFloatLE(offset);
    const y = buffer.readFloatLE(offset + 4);
    const z = buffer.readFloatLE(offset + 8);
    vertices.push({ x, y, z });
}

// Node scale
const node = gltf.nodes[0];
const scale = node.scale || [1, 1, 1];
console.log('Node Scale:', scale);

// Calculate bounds of raw and scaled vertices
let rawBounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
let scaledBounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };

vertices.forEach(v => {
    rawBounds.min[0] = Math.min(rawBounds.min[0], v.x);
    rawBounds.min[1] = Math.min(rawBounds.min[1], v.y);
    rawBounds.min[2] = Math.min(rawBounds.min[2], v.z);
    
    rawBounds.max[0] = Math.max(rawBounds.max[0], v.x);
    rawBounds.max[1] = Math.max(rawBounds.max[1], v.y);
    rawBounds.max[2] = Math.max(rawBounds.max[2], v.z);

    const sx = v.x * scale[0];
    const sy = v.y * scale[1];
    const sz = v.z * scale[2];

    scaledBounds.min[0] = Math.min(scaledBounds.min[0], sx);
    scaledBounds.min[1] = Math.min(scaledBounds.min[1], sy);
    scaledBounds.min[2] = Math.min(scaledBounds.min[2], sz);

    scaledBounds.max[0] = Math.max(scaledBounds.max[0], sx);
    scaledBounds.max[1] = Math.max(scaledBounds.max[1], sy);
    scaledBounds.max[2] = Math.max(scaledBounds.max[2], sz);
});

console.log('Raw vertex bounds:', rawBounds);
console.log('Scaled vertex bounds:', scaledBounds);

// Let's print a sample of 20 vertices
console.log('\nSample vertices (first 20):');
vertices.slice(0, 20).forEach((v, idx) => {
    const sx = (v.x * scale[0]).toFixed(4);
    const sy = (v.y * scale[1]).toFixed(4);
    const sz = (v.z * scale[2]).toFixed(4);
    console.log(`v[${idx}]: [${v.x.toFixed(4)}, ${v.y.toFixed(4)}, ${v.z.toFixed(4)}] => Scaled: [${sx}, ${sy}, ${sz}]`);
});
