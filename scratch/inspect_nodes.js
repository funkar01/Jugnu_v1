import fs from 'fs';

const file = 'public/gltf/MonacoRoad.glb';
const buffer = fs.readFileSync(file);
const chunkLength = buffer.readUInt32LE(12);
const jsonString = buffer.toString('utf8', 20, 20 + chunkLength);
const gltf = JSON.parse(jsonString);

console.log('Nodes structure:');
console.log(JSON.stringify(gltf.nodes, null, 2));

console.log('Meshes structure:');
console.log(JSON.stringify(gltf.meshes, null, 2));

if (gltf.extensions) {
    console.log('Extensions:', JSON.stringify(gltf.extensions, null, 2));
}
