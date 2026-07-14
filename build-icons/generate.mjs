import sharp from 'sharp';
import { readFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const svg = readFileSync(join(__dirname, 'icon.svg'));
const outDir = join(__dirname, '..', 'public', 'icons');
mkdirSync(outDir, { recursive: true });

const targets = [
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'favicon-32.png', size: 32 },
  { name: 'favicon-16.png', size: 16 },
];

for (const t of targets) {
  await sharp(svg).resize(t.size, t.size).png().toFile(join(outDir, t.name));
}

// Maskable icon: needs ~20% safe-zone padding, background fills to edges
const maskableSize = 512;
const pad = Math.round(maskableSize * 0.14);
await sharp(svg)
  .resize(maskableSize - pad * 2, maskableSize - pad * 2)
  .extend({
    top: pad, bottom: pad, left: pad, right: pad,
    background: { r: 67, g: 56, b: 202, alpha: 1 },
  })
  .png()
  .toFile(join(outDir, 'icon-maskable-512.png'));

console.log('Icons generated in', outDir);
