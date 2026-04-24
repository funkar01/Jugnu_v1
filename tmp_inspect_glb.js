const fs = require('fs');
const path = 'public/gltf/jugu1/jugu1.glb';
console.log('exists', fs.existsSync(path));
const data = fs.readFileSync(path);
console.log('header', data.slice(0, 4).toString('ascii'));
console.log('length', data.length);
console.log('version', data.readUInt32LE(4));
console.log('lengthLE', data.readUInt32LE(8));
