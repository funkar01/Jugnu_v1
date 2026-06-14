import fs from 'fs';
const path = 'public/gltf/jugu1/jugu1.glb';
if (fs.existsSync(path)) {
    const data = fs.readFileSync(path);
    const chunkLength = data.readUInt32LE(12);
    const chunkType = data.readUInt32LE(16);
    console.log('Chunk length:', chunkLength);
    console.log('Chunk type:', chunkType.toString(16), chunkType === 0x4E4F534A ? 'JSON' : 'OTHER');
    if (chunkType === 0x4E4F534A) {
        const jsonStr = data.slice(20, 20 + chunkLength).toString('utf-8');
        const gltf = JSON.parse(jsonStr);
        console.log('Nodes:', gltf.nodes ? gltf.nodes.map(n => n.name) : 'none');
        console.log('Meshes:', gltf.meshes ? gltf.meshes.map(m => m.name) : 'none');
        console.log('Animations:', gltf.animations ? gltf.animations.map(a => a.name) : 'none');
        console.log('Materials:', gltf.materials ? gltf.materials.map(m => m.name) : 'none');
    }
}
