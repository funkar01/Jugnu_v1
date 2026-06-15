import fs from 'fs';
import path from 'path';

const file = 'public/gltf/MonacoRoad.glb';
console.log('Inspecting:', file);

if (!fs.existsSync(file)) {
    console.error('File not found!');
    process.exit(1);
}

const buffer = fs.readFileSync(file);
const magic = buffer.readUInt32LE(0);
const version = buffer.readUInt32LE(4);
const length = buffer.readUInt32LE(8);

console.log(`GLB Magic: 0x${magic.toString(16)} (expected: 0x46544c67)`);
console.log(`GLB Version: ${version}`);
console.log(`GLB Length: ${length} bytes`);

// Read Chunk 0 (JSON)
const chunkLength = buffer.readUInt32LE(12);
const chunkType = buffer.readUInt32LE(16);
console.log(`Chunk 0 Length: ${chunkLength}`);
console.log(`Chunk 0 Type: 0x${chunkType.toString(16)} (expected: 0x4e4f534a for JSON)`);

if (chunkType !== 0x4e4f534a) {
    console.error('Chunk 0 is not JSON!');
    process.exit(1);
}

const jsonString = buffer.toString('utf8', 20, 20 + chunkLength);
const gltf = JSON.parse(jsonString);

console.log('\n--- GLTF Structure ---');
console.log('Nodes:', gltf.nodes ? gltf.nodes.length : 0);
console.log('Meshes:', gltf.meshes ? gltf.meshes.length : 0);
console.log('Materials:', gltf.materials ? gltf.materials.length : 0);
console.log('Accessors:', gltf.accessors ? gltf.accessors.length : 0);

if (gltf.scenes) {
    console.log('Scenes:', JSON.stringify(gltf.scenes, null, 2));
}

if (gltf.nodes) {
    console.log('\n--- Nodes list (first 20) ---');
    gltf.nodes.slice(0, 20).forEach((node, i) => {
        console.log(`Node ${i}: name="${node.name || ''}", mesh=${node.mesh !== undefined ? node.mesh : 'none'}, translation=${node.translation ? JSON.stringify(node.translation) : 'none'}, rotation=${node.rotation ? JSON.stringify(node.rotation) : 'none'}, scale=${node.scale ? JSON.stringify(node.scale) : 'none'}`);
    });
}

if (gltf.meshes) {
    console.log('\n--- Meshes list ---');
    gltf.meshes.forEach((mesh, i) => {
        console.log(`Mesh ${i}: name="${mesh.name || ''}", primitives:`, mesh.primitives.length);
    });
}

// Bounding box from accessors
let minX = Infinity, minY = Infinity, minZ = Infinity;
let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

if (gltf.accessors) {
    gltf.accessors.forEach((acc) => {
        if (acc.type === 'VEC3' && acc.min && acc.max) {
            minX = Math.min(minX, acc.min[0]);
            minY = Math.min(minY, acc.min[1]);
            minZ = Math.min(minZ, acc.min[2]);
            maxX = Math.max(maxX, acc.max[0]);
            maxY = Math.max(maxY, acc.max[1]);
            maxZ = Math.max(maxZ, acc.max[2]);
        }
    });
}

console.log('\n--- Cumulative Accessor Bounds (Approximation of local/world bounds) ---');
console.log(`Min: [${minX}, ${minY}, ${minZ}]`);
console.log(`Max: [${maxX}, ${maxY}, ${maxZ}]`);
const sizeX = maxX - minX;
const sizeY = maxY - minY;
const sizeZ = maxZ - minZ;
console.log(`Size: [${sizeX}, ${sizeY}, ${sizeZ}]`);
