import fs from 'fs';

// Existing spline points from domainExpansion.ts
const splinePoints = [
    { x: -0.065, z: -0.085 }, // Sainte Devote
    { x: -0.010, z: -0.070 }, // Beau Rivage
    { x: 0.050,  z: -0.042 }, // Massenet
    { x: 0.085,  z: -0.048 }, // Casino Square
    { x: 0.125,  z: -0.018 }, // Mirabeau Haute
    { x: 0.078,  z: 0.0045 }, // Hairpin
    { x: 0.105,  z: 0.022  }, // Mirabeau Bas
    { x: 0.130,  z: 0.046  }, // Portier
    { x: 0.090,  z: 0.082  }, // Tunnel entry
    { x: 0.000,  z: 0.105  }, // Tunnel mid
    { x: -0.050, z: 0.095  }, // Tunnel exit
    { x: -0.082, z: 0.074  }, // Chicane L
    { x: -0.074, z: 0.066  }, // Chicane R
    { x: -0.100, z: 0.042  }, // Tabac
    { x: -0.085, z: 0.016  }, // Pool 1
    { x: -0.095, z: 0.002  }, // Pool 2
    { x: -0.085, z: -0.014 }, // Pool 3
    { x: -0.095, z: -0.026 }, // Pool 4
    { x: -0.075, z: -0.050 }, // Rascasse Entry
    { x: -0.080, z: -0.065 }, // Rascasse Apex
    { x: -0.100, z: -0.046 }, // Noghes
    { x: -0.095, z: -0.028 }, // Main Straight Start
    { x: -0.078, z: -0.055 }  // Main Straight Mid
];

const file = 'public/gltf/MonacoRoad.glb';
if (!fs.existsSync(file)) {
    console.error('File not found!');
    process.exit(1);
}

const buffer = fs.readFileSync(file);
const chunkLength = buffer.readUInt32LE(12);
const jsonString = buffer.toString('utf8', 20, 20 + chunkLength);
const gltf = JSON.parse(jsonString);

const binHeaderOffset = 20 + chunkLength;
const binDataOffset = binHeaderOffset + 8;

const primitive = gltf.meshes[0].primitives[0];
const posAccessor = gltf.accessors[primitive.attributes.POSITION];
const bufferView = gltf.bufferViews[posAccessor.bufferView];

const byteOffset = (bufferView.byteOffset || 0) + (posAccessor.byteOffset || 0) + binDataOffset;
const count = posAccessor.count;
const byteStride = bufferView.byteStride || 12;

const vertices = [];
for (let i = 0; i < count; i++) {
    const offset = byteOffset + i * byteStride;
    const x = buffer.readFloatLE(offset);
    const z = buffer.readFloatLE(offset + 8);
    vertices.push({ x, z });
}

// Node scale
const node = gltf.nodes[0];
const scale = node.scale || [1, 1, 1];

// Let's create a 2D ASCII grid
const width = 80;
const height = 40;
const grid = Array(height).fill(null).map(() => Array(width).fill(' '));

// Bounds of spline points
let minSX = Infinity, maxSX = -Infinity;
let minSZ = Infinity, maxSZ = -Infinity;
splinePoints.forEach(p => {
    minSX = Math.min(minSX, p.x);
    maxSX = Math.max(maxSX, p.x);
    minSZ = Math.min(minSZ, p.z);
    maxSZ = Math.max(maxSZ, p.z);
});

console.log('Spline Bounds: X:', [minSX, maxSX], 'Z:', [minSZ, maxSZ]);

// Bounds of GLB vertices (scaled)
let minGX = Infinity, maxGX = -Infinity;
let minGZ = Infinity, maxGZ = -Infinity;
vertices.forEach(v => {
    const sx = v.x * scale[0];
    const sz = v.z * scale[2];
    minGX = Math.min(minGX, sx);
    maxGX = Math.max(maxGX, sx);
    minGZ = Math.min(minGZ, sz);
    maxGZ = Math.max(maxGZ, sz);
});

console.log('GLB Bounds: X:', [minGX, maxGX], 'Z:', [minGZ, maxGZ]);

// Draw Spline Points onto grid as 'S'
splinePoints.forEach((p, idx) => {
    const col = Math.floor(((p.x - minSX) / (maxSX - minSX || 1)) * (width - 1));
    const row = Math.floor(((p.z - minSZ) / (maxSZ - minSZ || 1)) * (height - 1));
    if (row >= 0 && row < height && col >= 0 && col < width) {
        grid[row][col] = 'S';
    }
});

console.log('\n--- SPLINE PLOT (S) ---');
grid.forEach(row => console.log(row.join('')));

// Clear grid
for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
        grid[r][c] = ' ';
    }
}

// Draw GLB Vertices (sampled) onto grid as 'G'
const step = Math.max(1, Math.floor(vertices.length / 1000));
for (let i = 0; i < vertices.length; i += step) {
    const v = vertices[i];
    const sx = v.x * scale[0];
    const sz = v.z * scale[2];
    const col = Math.floor(((sx - minGX) / (maxGX - minGX || 1)) * (width - 1));
    const row = Math.floor(((sz - minGZ) / (maxGZ - minGZ || 1)) * (height - 1));
    if (row >= 0 && row < height && col >= 0 && col < width) {
        grid[row][col] = 'G';
    }
}

console.log('\n--- GLB MODEL PLOT (G) ---');
grid.forEach(row => console.log(row.join('')));
