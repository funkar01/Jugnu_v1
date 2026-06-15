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

const node = gltf.nodes[0];
const baseScale = node.scale || [1, 1, 1];

// Find the center of the spline points
let sumSX = 0, sumSZ = 0;
splinePoints.forEach(p => { sumSX += p.x; sumSZ += p.z; });
const splineCenter = { x: sumSX / splinePoints.length, z: sumSZ / splinePoints.length };

// Find the center of the GLB model vertices
let sumGX = 0, sumGZ = 0;
vertices.forEach(v => { sumGX += v.x; sumGZ += v.z; });
const glbCenter = { x: sumGX / vertices.length, z: sumGZ / vertices.length };

console.log('Spline Center:', splineCenter);
console.log('GLB Center:', glbCenter);

// Let's do a search over:
// - scaleX: uniform or non-uniform
// - scaleZ: uniform or non-uniform
// - rotY: rotation around Y (in radians)
// - transX, transZ: translation offsets

function getDistance(p1, p2) {
    return Math.sqrt((p1.x - p2.x)**2 + (p1.z - p2.z)**2);
}

// We want to transform GLB vertices and measure distance to spline points.
// Or vice versa: transform spline points to match GLB vertices.
// Let's find transformation parameters for GLB mesh:
//   x' = (x - glbCenter.x) * sX * cos(theta) - (z - glbCenter.z) * sZ * sin(theta) + tX
//   z' = (x - glbCenter.x) * sX * sin(theta) + (z - glbCenter.z) * sZ * cos(theta) + tZ
// To find the best fit, we can minimize the sum of squared distances from transformed spline points to their nearest GLB vertices.
// But wait, the GLB mesh is a high-density set of vertices, so for any point we can find the nearest vertex in GLB.

let bestParams = null;
let minError = Infinity;

// Grid search for alignment parameters
console.log('Running alignment search...');
const angleSteps = 36;
const scaleXSteps = 20;
const scaleZSteps = 20;

for (let a = 0; a < angleSteps; a++) {
    const theta = (a / angleSteps) * Math.PI * 2;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);

        for (let sxIdx = 0; sxIdx < scaleXSteps; sxIdx++) {
            // scale search range expanded to [0.01, 0.16]
            const sX = 0.01 + (sxIdx / scaleXSteps) * 0.15;

            for (let szIdx = 0; szIdx < scaleZSteps; szIdx++) {
                const sZ = 0.01 + (szIdx / scaleZSteps) * 0.15;

            // Compute translation to align center of transformed GLB with center of spline
            // Let's assume tX = splineCenter.x, tZ = splineCenter.z if we center first.
            const tX = splineCenter.x;
            const tZ = splineCenter.z;

            // Evaluate error
            let totalDist = 0;
            let ok = true;
            for (let i = 0; i < splinePoints.length; i++) {
                const sp = splinePoints[i];

                // Find nearest GLB vertex after applying inverse transformation to sp
                // Or transform GLB vertices and find nearest to sp.
                // It is faster to transform all GLB vertices (subsampled) and find nearest.
                // Let's subsample GLB vertices to 300 points for speed.
                const subsample = 300;
                let minDist = Infinity;
                for (let k = 0; k < vertices.length; k += Math.floor(vertices.length / subsample)) {
                    const v = vertices[k];
                    // Center, scale, rotate, translate
                    const rx = (v.x - glbCenter.x) * sX;
                    const rz = (v.z - glbCenter.z) * sZ;
                    const tx = rx * cos - rz * sin + tX;
                    const tz = rx * sin + rz * cos + tZ;
                    
                    const dist = Math.sqrt((tx - sp.x)**2 + (tz - sp.z)**2);
                    if (dist < minDist) {
                        minDist = dist;
                    }
                }
                totalDist += minDist * minDist;
            }

            const error = Math.sqrt(totalDist / splinePoints.length);
            if (error < minError) {
                minError = error;
                bestParams = { sX, sZ, theta, thetaDeg: (theta * 180 / Math.PI).toFixed(1), tX, tZ, error };
            }
        }
    }
}

console.log('Best Parameters:', bestParams);
