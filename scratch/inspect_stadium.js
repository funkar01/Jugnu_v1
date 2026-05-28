const fs = require('fs');
const path = require('path');

// Simple parser for GLTF JSON chunk
const filePath = 'public/gltf/Wankhede Stadium/Wankhede.glb';
if (!fs.existsSync(filePath)) {
    console.error('File not found:', filePath);
    process.exit(1);
}

const buffer = fs.readFileSync(filePath);
const magic = buffer.readUInt32LE(0);
if (magic !== 0x46546C67) {
    console.error('Not a GLB file');
    process.exit(1);
}

const length = buffer.readUInt32LE(8);
const chunkLength = buffer.readUInt32LE(12);
const chunkType = buffer.readUInt32LE(16);

if (chunkType !== 0x4E4F534A) {
    console.error('First chunk is not JSON');
    process.exit(1);
}

const jsonChunk = buffer.toString('utf8', 20, 20 + chunkLength);
const gltf = JSON.parse(jsonChunk);

console.log('--- GLTF Meshes ---');
if (gltf.meshes) {
    gltf.meshes.forEach((mesh, idx) => {
        console.log(`Mesh ${idx}: "${mesh.name}"`);
    });
} else {
    console.log('No meshes found');
}

console.log('\n--- GLTF Nodes ---');
if (gltf.nodes) {
    gltf.nodes.forEach((node, idx) => {
        console.log(`Node ${idx}: "${node.name}" (mesh: ${node.mesh})`);
    });
} else {
    console.log('No nodes found');
}
