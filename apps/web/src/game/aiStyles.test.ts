import { describe, expect, it } from 'vitest';
import { AI_STYLES, ORT_RUNTIME_FILES, isAiStyle } from './aiStyles.js';

/**
 * Gli stili AI sono descritti da un catalogo: qui verifichiamo la coerenza dei
 * dati (id unici, URL raggiungibili come forma, etichette piene). L'inferenza
 * vera richiede il browser e un modello da 8 MB: è coperta dalla prova manuale.
 */
describe('stili AI per la foto profilo', () => {
  it('espone i tre stili AnimeGANv2 senza duplicati', () => {
    const ids = AI_STYLES.map((s) => s.id);
    expect(ids).toEqual(['hayao', 'shinkai', 'paprika']);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('ogni stile ha etichette, descrizione e URL https dei pesi', () => {
    for (const style of AI_STYLES) {
      expect(style.label.length).toBeGreaterThan(0);
      expect(style.hint.length).toBeGreaterThan(0);
      expect(style.url).toMatch(/^https:\/\//);
      expect(style.file).toMatch(/\.onnx$/);
      // I pesi devono essere quelli dello stile giusto (niente copia-incolla).
      expect(style.url.toLowerCase()).toContain(style.id);
    }
  });

  it('il riconoscimento di uno stile è stretto', () => {
    expect(isAiStyle('hayao')).toBe(true);
    expect(isAiStyle('paprika')).toBe(true);
    expect(isAiStyle('cartoon')).toBe(false); // è un filtro canvas, non uno stile AI
    expect(isAiStyle('')).toBe(false);
    expect(isAiStyle(undefined)).toBe(false);
    expect(isAiStyle(42)).toBe(false);
  });

  it('elenca i file di runtime da mettere in cache per l\'uso offline', () => {
    expect(ORT_RUNTIME_FILES).toContain('ort-wasm-simd-threaded.wasm');
    // Non la variante JSEP (WebGPU): 27 MB invece di 13.6, non ci serve.
    expect(ORT_RUNTIME_FILES.some((f) => f.includes('jsep'))).toBe(false);
  });
});
