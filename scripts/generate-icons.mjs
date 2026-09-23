// Genera los iconos PNG de la PWA sin dependencias (codificador PNG propio con zlib de Node).
// Dibuja la marca (casa granate con una "P" azul, como el logo de Prakisama) sobre fondo blanco,
// por muestreo 3×3 (suavizado de bordes). Los colores son los de prakisama.com.
//   node scripts/generate-icons.mjs        (o: npm run icons)
// Para cambiar el diseño, edita `glyph()` y vuelve a ejecutarlo; también hay un favicon.svg equivalente.

import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const WHITE = [255, 255, 255];
const RED = [198, 38, 84]; // #c62654
const BLUE = [7, 66, 144]; // #074290

const inRect = (u, v, x0, y0, x1, y1) => u >= x0 && u <= x1 && v >= y0 && v <= y1;
const inCircle = (u, v, cx, cy, r) => (u - cx) ** 2 + (v - cy) ** 2 <= r * r;

/** Distancia de un punto a un segmento. */
function segDist(u, v, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((u - x1) * dx + (v - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(u - (x1 + t * dx), v - (y1 + t * dy));
}

/**
 * Marca en coordenadas de 0 a 1: casa (tejado + paredes) en granate y "P" en azul.
 * Devuelve 'red', 'blue' o null (fondo). favicon.svg dibuja lo mismo con las mismas cifras.
 */
function glyph(u, v) {
  const half = 0.035; // mitad del grosor del trazo de la casa
  const house =
    segDist(u, v, 0.12, 0.5, 0.5, 0.14) <= half ||
    segDist(u, v, 0.5, 0.14, 0.88, 0.5) <= half ||
    segDist(u, v, 0.21, 0.5, 0.21, 0.85) <= half ||
    segDist(u, v, 0.21, 0.85, 0.79, 0.85) <= half ||
    segDist(u, v, 0.79, 0.85, 0.79, 0.5) <= half;
  if (house) return 'red';
  const stem = u >= 0.36 && u <= 0.47 && v >= 0.36 && v <= 0.78;
  const bowl = u >= 0.47 && Math.hypot(u - 0.47, v - 0.52) <= 0.16;
  const counter = Math.hypot(u - 0.53, v - 0.52) <= 0.05;
  return (stem || bowl) && !counter ? 'blue' : null;
}

function roundedMask(u, v, radius) {
  const dx = Math.max(radius - u, u - (1 - radius), 0);
  const dy = Math.max(radius - v, v - (1 - radius), 0);
  return dx * dx + dy * dy <= radius * radius;
}

/** size px, glyphScale = tamaño del dibujo respecto al lienzo, rounded = esquinas redondeadas transparentes */
function render(size, { glyphScale, rounded }) {
  const px = Buffer.alloc(size * size * 4);
  const SS = 3;
  const cx = 0.5; // centro del dibujo
  const cy = 0.495;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = (x + (sx + 0.5) / SS) / size;
          const v = (y + (sy + 0.5) / SS) / size;
          if (rounded && !roundedMask(u, v, 0.19)) continue;
          const part = glyph((u - 0.5) / glyphScale + cx, (v - 0.5) / glyphScale + cy);
          const c = part === 'red' ? RED : part === 'blue' ? BLUE : WHITE;
          r += c[0]; g += c[1]; b += c[2]; a += 255;
        }
      }
      const n = SS * SS;
      const covered = a / 255; // muestras opacas
      const i = (y * size + x) * 4;
      px[i] = covered ? Math.round(r / covered) : 0;
      px[i + 1] = covered ? Math.round(g / covered) : 0;
      px[i + 2] = covered ? Math.round(b / covered) : 0;
      px[i + 3] = Math.round(a / n);
    }
  }
  return px;
}

// --- Codificador PNG mínimo (RGBA, 8 bits) ---
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}
function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // profundidad
  ihdr[9] = 6; // RGBA
  const rows = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    rows[y * (size * 4 + 1)] = 0; // filtro "None"
    rgba.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const outDir = new URL('../public/icons/', import.meta.url);
mkdirSync(outDir, { recursive: true });
const targets = [
  ['icon-192.png', 192, { glyphScale: 0.92, rounded: true }],
  ['icon-512.png', 512, { glyphScale: 0.92, rounded: true }],
  // Maskable: sin esquinas y con el dibujo dentro de la "zona segura" central (80 %).
  ['icon-maskable-512.png', 512, { glyphScale: 0.74, rounded: false }],
  // iOS aplica su propia máscara y no admite transparencia.
  ['apple-touch-icon.png', 180, { glyphScale: 0.86, rounded: false }],
];
for (const [name, size, opts] of targets) {
  writeFileSync(new URL(name, outDir), encodePng(size, render(size, opts)));
  console.log(`✔ public/icons/${name}`);
}
