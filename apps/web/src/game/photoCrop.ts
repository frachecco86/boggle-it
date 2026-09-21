/**
 * Preparazione della foto profilo, interamente nel browser con canvas.
 *
 * Perché locale: nessuna API esterna, nessun costo e la foto **originale non
 * lascia mai il dispositivo**. Si carica solo il risultato ritagliato a 256×256
 * (~15-30 KB), perfetto come avatar.
 *
 * Qui non ci sono filtri né effetti: solo il ritaglio quadrato centrato. Gli
 * effetti (filtri canvas e stili AI) sono stati rimossi — aggiungevano complessità
 * e un modello da 8 MB nel bundle per un risultato che non serviva al gioco.
 */

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
  // `imageSmoothingQuality` alto: il ridimensionamento verso 256px è il solo
  // passaggio che può degradare la foto, meglio farlo bene.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, sx, sy, side, side, 0, 0, size, size);
  return canvas;
}

/** Data URL JPEG: ~15-30 KB a 256×256. */
export function canvasToDataUrl(canvas: HTMLCanvasElement, quality = 0.85): string {
  return canvas.toDataURL('image/jpeg', quality);
}
