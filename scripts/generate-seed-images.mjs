// One-off utility used to generate placeholder demo photos for the seed
// content in `src/content/**`. Real photography should replace these files
// (same relative path under `src/assets/photos/`) — see README.md.
//
// Run with: node scripts/generate-seed-images.mjs
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const WIDTH = 1600;
const HEIGHT = 1067;

const photos = [
  { file: 'fauna/aguila-imperial-en-vuelo.jpg', title: 'Águila imperial en vuelo', color: '#4b5d3a' },
  { file: 'fauna/aguila-imperial-posada.jpg', title: 'Águila imperial posada', color: '#5a6b45' },
  { file: 'fauna/lince-iberico-al-acecho.jpg', title: 'Lince ibérico al acecho', color: '#7a5c3a' },
  { file: 'fauna/lince-iberico-cachorro.jpg', title: 'Cachorro de lince ibérico', color: '#8a6b45' },
  { file: 'fauna/flamencos-en-la-marisma.jpg', title: 'Flamencos en la marisma', color: '#b5657a' },
  { file: 'fauna/camaleon-comun-en-rama.jpg', title: 'Camaleón común en rama', color: '#3f6b4f' },
  { file: 'fauna/ciervo-en-berrea.jpg', title: 'Ciervo en berrea', color: '#6b4f3a' },
  { file: 'viajes/amanecer-en-la-rocina.jpg', title: 'Amanecer en La Rocina', color: '#3a5b7a' },
  { file: 'viajes/sendero-del-acebron.jpg', title: 'Sendero del Acebrón', color: '#2f6b5f' },
  { file: 'viajes/marisma-al-atardecer.jpg', title: 'Marisma al atardecer', color: '#7a4f3a' },
  { file: 'viajes/valle-de-ordesa.jpg', title: 'Valle de Ordesa', color: '#3a5f7a' },
  { file: 'viajes/cumbres-del-pirineo.jpg', title: 'Cumbres del Pirineo', color: '#4a5a6b' },
  { file: 'eventos/charla-de-apertura-bsc.jpg', title: 'Charla de apertura BSC', color: '#5a3a6b' },
  { file: 'eventos/taller-de-tdd.jpg', title: 'Taller de TDD', color: '#6b3a5a' },
  { file: 'eventos/concierto-principal-rock-and-blue.jpg', title: 'Concierto Rock & Blue', color: '#3a2f6b' },
];

function escapeXml(text) {
  return text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
}

function svgFor(title, color) {
  return `
    <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="${color}" />
          <stop offset="1" stop-color="#111318" />
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#bg)" />
      <text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle"
            font-family="Georgia, 'Times New Roman', serif" font-size="64"
            fill="#f5f2ea" opacity="0.92">${escapeXml(title)}</text>
      <text x="50%" y="58%" text-anchor="middle" dominant-baseline="middle"
            font-family="Helvetica, Arial, sans-serif" font-size="24"
            fill="#f5f2ea" opacity="0.6">Foto de ejemplo — sustituir por original en R2</text>
    </svg>
  `;
}

const outDir = path.resolve(import.meta.dirname, '../src/assets/photos');

for (const photo of photos) {
  const outPath = path.join(outDir, photo.file);
  await mkdir(path.dirname(outPath), { recursive: true });
  await sharp(Buffer.from(svgFor(photo.title, photo.color)))
    .jpeg({ quality: 82 })
    .toFile(outPath);
  console.log('generated', photo.file);
}
