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

// Apply Z-squash to the spline points to map them to the wide, uniform aspect ratio Monaco track
const squashZ = 0.00625 / 0.02875; // 0.2173913
const unsquashedSpline = splinePoints.map(p => {
    return {
        x: p.x,
        z: splineCenter.z + (p.z - splineCenter.z) * squashZ
    };
});

// Now let's fit the unsquashed spline to the uniformly scaled model!
// Model uniform scale = 0.0362.
// Rotation Y = 4.3633 (250 degrees).
// Translation = (-0.022, 0.0003).

// Let's compute the transformed spline points under these uniform parameters:
const s = 0.0694;
const theta = 4.3633;
const cos = Math.cos(theta);
const sin = Math.sin(theta);
const tx = -0.022;
const tz = 0.0003;

console.log('Spline Center:', splineCenter);
console.log('GLB Center:', glbCenter);

const finalSpline = unsquashedSpline.map(p => {
    // Center relative to splineCenter
    const cx = p.x - splineCenter.x;
    const cz = p.z - splineCenter.z;

    // We scale by 5.7966 (the ratio from spline to GLB) and then by s (0.0362)
    // Wait, the spline to GLB scale ratio was:
    //   sx_ratio = 5.7966 (since old model had scale 0.1725, and raw bounds was 26.7m, spline was 0.23m)
    // Actually, let's look at the mapping:
    // If we map the unsquashed spline to the raw GLB:
    //   X scale factor = 5.7966
    //   Z scale factor = 5.7966 (since Z is now unsquashed!)
    // So the scale factor to map the unsquashed spline to the raw GLB is a UNIFORM 5.7966!
    // Then we scale the raw GLB uniformly by s = 0.0362 to fit on the table.
    // So the total scale factor applied to the unsquashed spline is:
    //   total_scale = 5.7966 * 0.0362 = 0.2098 ~ 0.21.
    // Let's rotate it by 250 degrees and translate it by (-0.022, 0.0003).
    const scale_total = 5.796626 * s;
    const rx = cx * scale_total * cos - cz * scale_total * sin + tx;
    const rz = cx * scale_total * sin + cz * scale_total * cos + tz;
    return { x: rx, z: rz };
});

// Let's check the error between finalSpline and uniformly scaled GLB
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
console.log('Uniform Alignment Error:', error, 'meters (expected around 0.003m on table!)');

// Let's plot both in ASCII to verify
const width = 80;
const height = 40;
const grid = Array(height).fill(null).map(() => Array(width).fill(' '));

// Find bounds of finalSpline and uniformly scaled GLB to fit in plotter
let minX = Infinity, maxX = -Infinity;
let minZ = Infinity, maxZ = -Infinity;

finalSpline.forEach(sp => {
    minX = Math.min(minX, sp.x);
    maxX = Math.max(maxX, sp.x);
    minZ = Math.min(minZ, sp.z);
    maxZ = Math.max(maxZ, sp.z);
});

// Draw Spline
finalSpline.forEach(sp => {
    const col = Math.floor(((sp.x - minX) / (maxX - minX || 1)) * (width - 1));
    const row = Math.floor(((sp.z - minZ) / (maxZ - minZ || 1)) * (height - 1));
    if (row >= 0 && row < height && col >= 0 && col < width) {
        grid[row][col] = 'S';
    }
});

console.log('\n--- UNIFORM TRANSFORMED SPLINE PLOT (S) ---');
grid.forEach(row => console.log(row.join('')));

// Print the transformed points for domainExpansion.ts
console.log('\n--- Points to paste in domainExpansion.ts ---');
const pointsStr = finalSpline.map(p => `            new THREE.Vector3(${p.x.toFixed(6)}, 0.003, ${p.z.toFixed(6)})`).join(',\n');
console.log(pointsStr);
