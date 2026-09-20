// Genera le icone PNG (launcher Android + web) della margherita di Sbooble.
//
// Perche' non usare un rasterizzatore SVG esterno: il repo non dipende da
// librerie native (librsvg, sharp, canvas). Qui disegniamo la margherita in
// coordinate matematiche e codifichiamo il PNG con zlib, incluso in Node.
//
// Uso: node tools/gen-icon.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

/* ---------------- Codifica PNG ---------------- */

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

/** rgba: Uint8Array di size*size*4 -> Buffer PNG */
function encodePng(rgba, size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filtro: none
    rgba.copy
      ? rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
      : Buffer.from(rgba.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------------- Geometria della margherita ---------------- */

const PETALS = 12;

function mix(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

/**
 * Colore di un punto in coordinate normalizzate (-1..1), con la margherita
 * centrata. Ritorna [r,g,b,a] con alpha 0..1.
 */
function sample(nx, ny, opts) {
  const { withBackground } = opts;
  const r = Math.hypot(nx, ny);
  const angle = Math.atan2(ny, nx);

  // Sfondo tondo giallo pallido (opzionale: per l'icona intera).
  let color = [0, 0, 0, 0];
  if (withBackground) {
    if (r <= 0.98) {
      const t = Math.min(1, r / 0.98);
      color = [...mix([255, 253, 245], [255, 238, 186], t), 1];
    }
  }

  // Petali: ellissi ruotate attorno al centro.
  const petalDist = 0.5; // distanza del centro del petalo
  const petalRx = 0.175;
  const petalRy = 0.29;
  for (let i = 0; i < PETALS; i++) {
    const a = (i / PETALS) * Math.PI * 2 + Math.PI / 2;
    // Ruota il punto nel sistema del petalo
    const px = nx * Math.cos(-a) - ny * Math.sin(-a);
    const py = nx * Math.sin(-a) + ny * Math.cos(-a);
    const d = ((px - 0) / petalRx) ** 2 + ((py - petalDist) / petalRy) ** 2;
    if (d <= 1) {
      const even = i % 2 === 0;
      const shade = Math.min(1, Math.max(0, (py - petalDist + petalRy) / (2 * petalRy)));
      const top = even ? [255, 255, 255] : [255, 246, 251];
      const bottom = even ? [255, 226, 240] : [255, 208, 230];
      const petal = mix(bottom, top, shade);
      // Bordo rosa
      if (d > 0.88) color = [...mix(petal, [255, 179, 212], 1), 1];
      else color = [...petal, 1];
    }
  }

  // Centro giallo
  const centerR = 0.34;
  if (r <= centerR) {
    const t = r / centerR;
    const yellow = mix([255, 226, 110], [255, 210, 63], t);
    if (r > centerR - 0.028) color = [...mix(yellow, [232, 168, 0], 1), 1];
    else color = [...yellow, 1];

    // Faccina
    const eyeDx = 0.13;
    const eyeY = -0.07;
    const er = 0.04;
    const leftEye = Math.hypot(nx + eyeDx, ny - eyeY);
    const rightEye = Math.hypot(nx - eyeDx, ny - eyeY);
    if (leftEye < er || rightEye < er) color = [90, 67, 0, 1];

    // Guance
    const cheekR = 0.055;
    if (Math.hypot(nx + 0.22, ny - 0.06) < cheekR || Math.hypot(nx - 0.22, ny - 0.06) < cheekR) {
      color = [...mix(color.slice(0, 3), [255, 158, 196], 0.75), 1];
    }

    // Bocca (arco) — approssimata con una fascia di distanza
    const mouthCenterY = 0.06;
    const mouthR = 0.15;
    const dm = Math.hypot(nx, ny - mouthCenterY);
    if (ny > 0.09 && Math.abs(dm - mouthR) < 0.022) color = [90, 67, 0, 1];
  }

  return color;
}

/** Rasterizza a `size` px con supersampling per bordi morbidi. */
function rasterize(size, opts = {}) {
  const { withBackground = true, scale = 1, ss = 3 } = opts;
  const out = Buffer.alloc(size * size * 4);
  const half = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let acc = [0, 0, 0, 0];
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const px = x + (sx + 0.5) / ss;
          const py = y + (sy + 0.5) / ss;
          const nx = ((px - half) / half) * scale;
          const ny = ((py - half) / half) * scale;
          const c = sample(nx, ny, { withBackground });
          acc[0] += c[0] * c[3];
          acc[1] += c[1] * c[3];
          acc[2] += c[2] * c[3];
          acc[3] += c[3];
        }
      }
      const n = ss * ss;
      const a = acc[3] / n;
      const i = (y * size + x) * 4;
      if (a > 0) {
        out[i] = Math.round(acc[0] / acc[3]);
        out[i + 1] = Math.round(acc[1] / acc[3]);
        out[i + 2] = Math.round(acc[2] / acc[3]);
      }
      out[i + 3] = Math.round(a * 255);
    }
  }
  return out;
}

function write(file, size, opts) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, encodePng(rasterize(size, opts), size));
  return file;
}

/* ---------------- Output ---------------- */

const androidRes = path.join(ROOT, 'apps/web/android/app/src/main/res');
const webPublic = path.join(ROOT, 'apps/web/public');

// Icone launcher classiche (margherita su sfondo tondo).
const MIPMAPS = [
  ['mdpi', 48],
  ['hdpi', 72],
  ['xhdpi', 96],
  ['xxhdpi', 144],
  ['xxxhdpi', 192],
];
for (const [density, size] of MIPMAPS) {
  write(path.join(androidRes, `mipmap-${density}/ic_launcher.png`), size, { withBackground: true });
  write(path.join(androidRes, `mipmap-${density}/ic_launcher_round.png`), size, { withBackground: true });
  // Foreground adattivo: solo il fiore, piu' piccolo, su trasparente.
  write(path.join(androidRes, `mipmap-${density}/ic_launcher_foreground.png`), size, {
    withBackground: false,
    scale: 0.62,
  });
}

// Icona web / PWA / store.
write(path.join(webPublic, 'icon-512.png'), 512, { withBackground: true });
write(path.join(webPublic, 'icon-192.png'), 192, { withBackground: true });
write(path.join(webPublic, 'favicon.png'), 64, { withBackground: true });

console.log('✓ Icone generate:');
console.log('  apps/web/android/app/src/main/res/mipmap-*/ic_launcher.png');
console.log('  apps/web/android/app/src/main/res/mipmap-*/ic_launcher_foreground.png');
console.log('  apps/web/public/icon-512.png, icon-192.png, favicon.png');
