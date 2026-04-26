import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const inputDir = path.join(process.cwd(), 'public', 'Domains');
const outputDir = path.join(inputDir, 'thumbs');

if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

const domains = ['Domain.png', 'Domain1.png', 'Domain2.png', 'Domain3.png'];

async function generate() {
    for (const d of domains) {
        const inPath = path.join(inputDir, d);
        const outPath = path.join(outputDir, `thumb_${d.replace('.png', '.jpg')}`);
        
        console.log(`Processing ${inPath}...`);
        try {
            await sharp(inPath)
                .resize(512, 256, { fit: 'cover' })
                .jpeg({ quality: 80 })
                .toFile(outPath);
            console.log(`Created ${outPath}`);
        } catch (e) {
            console.error(`Error processing ${d}:`, e);
        }
    }
}

generate();
