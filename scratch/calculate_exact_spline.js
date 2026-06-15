import fs from 'fs';

const splinePoints = [
    { x: -0.065, z: -0.085 }, // Sainte Devote (Turn 1)
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

// Center of spline points
let sumSX = 0, sumSZ = 0;
splinePoints.forEach(p => { sumSX += p.x; sumSZ += p.z; });
const splineCenter = { x: sumSX / splinePoints.length, z: sumSZ / splinePoints.length };

// Center of GLB model vertices
let sumGX = 0, sumGZ = 0;
vertices.forEach(v => { sumGX += v.x; sumGZ += v.z; });
const glbCenter = { x: sumGX / vertices.length, z: sumGZ / vertices.length };

// Fit the model to the circle of radius 0.18 (diameter 0.36)
// Size X of raw model = 4.6108, Size Z = 1.9307.
const s = 0.05;
const theta = 4.3633; // 250 degrees rotation
const cos = Math.cos(theta);
const sin = Math.sin(theta);
const tx = -0.022;
const tz = 0.0003;

// We transform the spline points:
// 1. Center: (cx, cz)
// 2. squashZ to match model aspect ratio: Z size ratio / X size ratio = (1.93/11.19) / (4.61/26.73) = 1.0 (since model was scaled uniformly, wait!)
// Wait, the spline aspect ratio is Z_size / X_size = 0.19 / 0.23 = 0.826.
// The model aspect ratio is Z_size / X_size = 1.9307 / 4.6108 = 0.4187.
// So Z must be squashed by 0.4187 / 0.826 = 0.5069.
// And we want the X-dimension of the spline to match the scaled model's X-dimension:
// Model scaled X-size = 4.6108 * 0.05 = 0.230.
// Spline original X-size = 0.225 (since max is 0.125, min is -0.100, wait: 0.125 - (-0.100) = 0.225. Let's calculate exactly below).

let minX = Infinity, maxX = -Infinity;
let minZ = Infinity, maxZ = -Infinity;
splinePoints.forEach(sp => {
    const cx = sp.x - splineCenter.x;
    const cz = sp.z - splineCenter.z;
    minX = Math.min(minX, cx);
    maxX = Math.max(maxX, cx);
    minZ = Math.min(minZ, cz);
    maxZ = Math.max(maxZ, cz);
});

const splineXSize = maxX - minX; // 0.225
const splineZSize = maxZ - minZ; // 0.190

// To fit the model size on the table (sizeX = 4.6108 * s, sizeZ = 1.9307 * s):
const scaleX = (4.6108 * s) / splineXSize;
const scaleZ = (1.9307 * s) / splineZSize;

const finalSpline = splinePoints.map(p => {
    const cx = p.x - splineCenter.x;
    const cz = p.z - splineCenter.z;

    const x_scaled = cx * scaleX;
    const z_scaled = cz * scaleZ;

    // Rotate and translate
    const rx = x_scaled * cos - z_scaled * sin + tx;
    const rz = x_scaled * sin + z_scaled * cos + tz;
    return { x: rx, z: rz };
});

// Calculate error
let totalDist = 0;
finalSpline.forEach((sp, idx) => {
    let minDist = Infinity;
    vertices.forEach(v => {
        // Uniformly scale the GLB vertex centered around glbCenter, rotate, and translate
        const rx = (v.x - glbCenter.x) * s * cos - (v.z - glbCenter.z) * s * sin + tx;
        const rz = (v.x - glbCenter.x) * s * sin + (v.z - glbCenter.z) * s * cos + tz;
        const dist = Math.sqrt((rx - sp.x)**2 + (rz - sp.z)**2);
        if (dist < minDist) {
            minDist = dist;
        }
    });
    totalDist += minDist * minDist;
});

const error = Math.sqrt(totalDist / finalSpline.length);
console.log('Exact Alignment Error:', error, 'meters');

// Print points for copy pasting
const pointsStr = finalSpline.map(p => `            new THREE.Vector3(${p.x.toFixed(6)}, 0.003, ${p.z.toFixed(6)})`).join(',\n');
console.log('\n--- Points to paste in domainExpansion.ts ---');
console.log(pointsStr);
