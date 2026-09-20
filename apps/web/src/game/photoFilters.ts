/**
 * Filtri foto, interamente nel browser con canvas.
 *
 * Perché locali: nessuna API esterna, nessun costo, nessun upload della foto a
 * terzi, e funziona anche offline (l'app Android li usa senza rete). Il risultato
 * è un JPEG 256×256 di ~15-30 KB, perfetto per essere salvato come avatar.
 *
 * Gli stili sono "cartoon/poster" ricavati da operazioni classiche di image
 * processing: posterizzazione dei colori, rilevazione di bordi (Sobel) e
 * sovrapposizione. Non è AI generativa: non inventa uno stile nuovo, ma dà
 * un effetto fumetto/illustrazione pulito e coerente.
 */

export const PHOTO_FILTERS = [
  { id: 'originale', label: 'Originale', hint: 'La tua foto, solo ritagliata' },
  { id: 'cartoon', label: 'Cartoon', hint: 'Colori piatti e contorni' },
  { id: 'fumetto', label: 'Fumetto', hint: 'Contorni marcati, tinte piene' },
  { id: 'poster', label: 'Poster', hint: 'Pochi livelli di colore' },
  { id: 'schizzo', label: 'Schizzo', hint: 'Matita su carta' },
  { id: 'seppia', label: 'Seppia', hint: 'Tono caldo, vintage' },
] as const;

export type PhotoFilterId = (typeof PHOTO_FILTERS)[number]['id'];

export const DEFAULT_PHOTO_FILTER: PhotoFilterId = 'cartoon';
export const PHOTO_SIZE = 256;

/** Ritaglia la foto in un quadrato centrato, alla dimensione voluta. */
export function cropSquare(
  source: HTMLImageElement | HTMLVideoElement,
  size = PHOTO_SIZE,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const sw = 'videoWidth' in source ? source.videoWidth : source.naturalWidth;
  const sh = 'videoHeight' in source ? source.videoHeight : source.naturalHeight;
  const side = Math.min(sw, sh);
  const sx = (sw - side) / 2;
  const sy = (sh - side) / 2;
  ctx.drawImage(source, sx, sy, side, side, 0, 0, size, size);
  return canvas;
}

type Pixels = { data: Uint8ClampedArray; width: number; height: number };

function toGray(p: Pixels): Uint8ClampedArray {
  const { data } = p;
  const gray = new Uint8ClampedArray(data.length / 4);
  for (let i = 0, g = 0; i < data.length; i += 4, g++) {
    gray[g] = (data[i]! * 0.299 + data[i + 1]! * 0.587 + data[i + 2]! * 0.114) | 0;
  }
  return gray;
}

/** Rilevazione bordi (Sobel), ritornata come mappa di intensità 0-255. */
function sobelEdges(p: Pixels): Uint8ClampedArray {
  const { width, height } = p;
  const gray = toGray(p);
  const edges = new Uint8ClampedArray(gray.length);
  const g = (x: number, y: number) => gray[y * width + x] ?? 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const gx =
        -g(x - 1, y - 1) - 2 * g(x - 1, y) - g(x - 1, y + 1) +
        g(x + 1, y - 1) + 2 * g(x + 1, y) + g(x + 1, y + 1);
      const gy =
        -g(x - 1, y - 1) - 2 * g(x, y - 1) - g(x + 1, y - 1) +
        g(x - 1, y + 1) + 2 * g(x, y + 1) + g(x + 1, y + 1);
      edges[y * width + x] = Math.min(255, Math.hypot(gx, gy));
    }
  }
  return edges;
}

/** Posterizza: riduce i canali a `levels` valori. */
function posterize(value: number, levels: number): number {
  const step = 255 / (levels - 1);
  return Math.round(Math.round(value / step) * step);
}

/** Applica un filtro ai pixel di un canvas, in place. */
export function applyFilter(canvas: HTMLCanvasElement, filter: PhotoFilterId): void {
  if (filter === 'originale') return;
  const ctx = canvas.getContext('2d')!;
  const { width, height } = canvas;
  const image = ctx.getImageData(0, 0, width, height);
  const p: Pixels = { data: image.data, width, height };
  const edges = filter === 'schizzo' ? sobelEdges(p) : null;

  for (let i = 0; i < p.data.length; i += 4) {
    const r = p.data[i]!;
    const g = p.data[i + 1]!;
    const b = p.data[i + 2]!;

    if (filter === 'poster') {
      p.data[i] = posterize(r, 4);
      p.data[i + 1] = posterize(g, 4);
      p.data[i + 2] = posterize(b, 4);
      continue;
    }

    if (filter === 'seppia') {
      p.data[i] = Math.min(255, r * 0.393 + g * 0.769 + b * 0.189);
      p.data[i + 1] = Math.min(255, r * 0.349 + g * 0.686 + b * 0.168);
      p.data[i + 2] = Math.min(255, r * 0.272 + g * 0.534 + b * 0.131);
      continue;
    }

    // Cartoon e fumetto: colori piatti + contorni scuri.
    const levels = filter === 'fumetto' ? 4 : 5;
    const edgeGain = filter === 'fumetto' ? 1.35 : 0.9;
    const edge = edges ? edges[i / 4]! : 0;

    if (filter === 'schizzo') {
      // Matita: sfondo chiarissimo, bordi scuri.
      const ink = 255 - Math.min(255, edge * 1.6);
      p.data[i] = ink;
      p.data[i + 1] = ink;
      p.data[i + 2] = ink;
      continue;
    }

    // Saturazione leggermente aumentata: l'effetto "cartone" è più vivo.
    const avg = (r + g + b) / 3;
    const sat = 1.35;
    let nr = posterize(Math.min(255, avg + (r - avg) * sat), levels);
    let ng = posterize(Math.min(255, avg + (g - avg) * sat), levels);
    let nb = posterize(Math.min(255, avg + (b - avg) * sat), levels);

    // Contorni: scurisce i pixel dove il gradiente è alto.
    if (edge > 28) {
      const dark = Math.max(0, 1 - (edge / 255) * edgeGain);
      nr *= dark;
      ng *= dark;
      nb *= dark;
    }
    p.data[i] = nr;
    p.data[i + 1] = ng;
    p.data[i + 2] = nb;
  }

  ctx.putImageData(image, 0, 0);
}

/** Canvas con foto ritagliata + filtro, pronto per l'anteprima o il salvataggio. */
export function renderPhoto(
  source: HTMLImageElement | HTMLVideoElement,
  filter: PhotoFilterId,
  size = PHOTO_SIZE,
): HTMLCanvasElement {
  const canvas = cropSquare(source, size);
  applyFilter(canvas, filter);
  return canvas;
}

/** Data URL JPEG (qualità 0.85): ~15-30 KB a 256×256. */
export function canvasToDataUrl(canvas: HTMLCanvasElement, quality = 0.85): string {
  return canvas.toDataURL('image/jpeg', quality);
}
