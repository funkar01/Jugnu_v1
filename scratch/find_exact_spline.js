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

console.log('Spline Center:', splineCenter);
console.log('GLB Center:', glbCenter);

// Let's do a multi-stage coordinate alignment optimization.
// First, we find the best rotation and scaling to map the spline points to the GLB vertices.
// Let's search over a wide range.

let bestParams = null;
let minError = Infinity;

console.log('Optimizing alignment...');

// Let's search over theta (0 to 2*PI), sx (1 to 40), sz (1 to 40), tx, tz
const angleSteps = 180;
const sxSteps = 50;
const szSteps = 50;

for (let a = 0; a < angleSteps; a++) {
    const theta = (a / angleSteps) * Math.PI * 2;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);

    for (let i = 0; i < sxSteps; i++) {
        // sx in [5, 35]
        const sx = 5 + (i / sxSteps) * 30;

        for (let j = 0; j < szSteps; j++) {
            // sz in [5, 35]
            const sz = 5 + (j / szSteps) * 30;

            // Search translations around glbCenter (within -0.5 to 0.5)
            const tx = glbCenter.x;
            const tz = glbCenter.z;

            let totalDist = 0;
            let ok = true;
            for (let k = 0; k < splinePoints.length; k++) {
                const sp = splinePoints[k];
                const cx = sp.x - splineCenter.x;
                const cz = sp.z - splineCenter.z;

                // Transformed point
                const rx = cx * sx * cos - cz * sz * sin + tx;
                const rz = cx * sx * sin + cz * sz * cos + tz;

                // Find nearest GLB vertex
                let minDist = Infinity;
                // Subsample vertices for performance
                const step = Math.max(1, Math.floor(vertices.length / 500));
                for (let vIdx = 0; vIdx < vertices.length; vIdx += step) {
                    const v = vertices[vIdx];
                    const dist = Math.sqrt((v.x - rx)**2 + (v.z - rz)**2);
                    if (dist < minDist) {
                        minDist = dist;
                    }
                }
                totalDist += minDist * minDist;
            }

            const error = Math.sqrt(totalDist / splinePoints.length);
            if (error < minError) {
                minError = error;
                bestParams = { sx, sz, theta, thetaDeg: (theta * 180 / Math.PI).toFixed(1), tx, tz, error };
            }
        }
    }
}

console.log('Optimal Parameters:', bestParams);

// Output the points mapped to raw GLB space
const sx = bestParams.sx;
const sz = bestParams.sz;
const theta = bestParams.theta;
const cos = Math.cos(theta);
const sin = Math.sin(theta);
const tx = bestParams.tx;
const tz = bestParams.tz;

const rawSplinePoints = splinePoints.map((sp, idx) => {
    const cx = sp.x - splineCenter.x;
    const cz = sp.z - splineCenter.z;
    const rx = cx * sx * cos - cz * sz * sin + tx;
    const rz = cx * sx * sin + cz * sz * cos + tz;
    return { x: rx, z: rz };
});

console.log('\n--- Mapped Spline Points in Raw GLB Space ---');
console.log(JSON.stringify(rawSplinePoints, null, 2));

// Save to a javascript file for easy copy-paste
fs.writeFileSync('scratch/mapped_points.json', JSON.stringify(rawSplinePoints, null, 2));
