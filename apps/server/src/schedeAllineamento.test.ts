/**
 * Le schede pre-calcolate devono restare allineate al dizionario.
 *
 * PERCHÉ QUESTO FILE ESISTE (0.47.0)
 * Il gioco accetta solo le parole elencate nella scheda (`acceptedWords`, cioè
 * `allWords`): la scheda è la materializzazione di «dizionario ∩ componibili» e
 * serve a non avere un solver nel client. Quando il dizionario cresce e le schede
 * restano ferme, una parola Italiana vera viene **rifiutata in partita**. Misurato
 * sulle schede committate: **101 schede su 270 disallineate**, +315 parole mancanti
 * (la famiglia delle 4.339 parole tecniche riammesse nella 0.43.0).
 *
 * COSA COPRE E COSA NO — importante per chi legge il changelog
 *  - COPRE le schede **versionate** (`packages/shared/schede/`): se qualcuno cambia
 *    il dizionario senza fare `pnpm sync:schede`, questi asseriti si spengono.
 *  - NON può coprire le schede generate dall'amministratore nel volume
 *    (`schede-ale/`, `schede-extra/`): non sono in git e il test non le vede. Dopo
 *    un cambio di dizionario vanno **svuotate e rigenerate** a mano: la procedura è
 *    in `docs/ALE-RUNTIME-SERVER.md` (blocco ⚠ in testa) e `docs/DEPLOY.md`.
 *    È il motivo per cui una scheda ale già in produzione continua a rifiutare
 *    `setosa` anche con questo codice.
 *
 * La misura completa (tutte le 270 schede, non solo le canarie) è `pnpm check:schede`:
 * sola diagnosi, non scrive nulla, esce 1 se c'è deriva.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  acceptedWords,
  buildGrid,
  findWordPath,
  schedaVariantOf,
  solveGrid,
  type GridSize,
  type Scheda,
  type SchedaFile,
} from '@boggle/shared';
import { BASE_SCHEDE_DIR } from './schede.js';
import { DICT_DIR, loadAleInputs } from './ale.js';

function loadAllSchede(): Scheda[] {
  const out: Scheda[] = [];
  for (const file of readdirSync(BASE_SCHEDE_DIR).filter((f) => f.endsWith('.json'))) {
    const parsed = JSON.parse(readFileSync(path.join(BASE_SCHEDE_DIR, file), 'utf8')) as SchedaFile;
    out.push(...parsed.schede);
  }
  return out;
}

const schede = loadAllSchede();

describe('invarianti delle schede versionate', () => {
  it('il catalogo base è presente e completo', () => {
    // 30 schede per ognuna delle 9 combinazioni dimensione × difficoltà.
    expect(schede.length).toBe(270);
  });

  it('ogni scheda ha un insieme accettato non vuoto e coerente', () => {
    for (const scheda of schede) {
      const accepted = acceptedWords(scheda);
      expect(accepted.length, `${scheda.id}: insieme accettato vuoto`).toBeGreaterThan(0);
      // `words` (parole attese della fascia) è un sottoinsieme di `allWords`.
      for (const word of scheda.words) {
        expect(accepted, `${scheda.id}: "${word}" in words ma non in allWords`).toContain(word);
      }
      // `longest` è la lunghezza della parola più lunga dell'insieme accettato.
      const longest = accepted.reduce((max, w) => Math.max(max, w.length), 0);
      expect(scheda.longest, `${scheda.id}: longest disallineato`).toBe(longest);
    }
  });

  it('le schede `ale` hanno words === allWords (invariante di schedaAle.ts)', () => {
    const ale = schede.filter((s) => schedaVariantOf(s) === 'ale');
    expect(ale.length).toBeGreaterThan(0);
    for (const scheda of ale) {
      expect(scheda.words, `${scheda.id}: ale deve avere words === allWords`).toEqual(scheda.allWords);
    }
  });

  it('la griglia corrisponde alla dimensione dichiarata', () => {
    for (const scheda of schede) {
      const rows = scheda.grid.split('\n');
      expect(rows.length, `${scheda.id}: righe`).toBe(scheda.size);
      for (const row of rows) expect(row.length, `${scheda.id}: colonne`).toBe(scheda.size);
    }
  });
});

/**
 * CANARIE. Parole del dizionario che le schede NON accettavano perché gli elenchi
 * erano risolti con il dizionario precedente a `technical-words.txt`. Sono il
 * ricordo eseguibile del bug: se falliscono, le schede sono di nuovo disallineate
 * (o sono state rigenerate con un dizionario vecchio) → `pnpm check:schede`.
 */
const CANARIE: Record<string, string[]> = {
  '4-facile-002': ['melico'],
  '4-facile-008': ['litiose', 'litoidi'],
  '4-facile-012': ['ierica', 'torica'],
  '4-facile-015': ['sudorale', 'tumorosa', 'torosa'],
  '4-normale-001': ['mutico'],
  '4-normale-018': ['cotale'], // ale
  '4-normale-020': ['ramosa'], // ale
  '4-difficile-024': ['segosi'], // ale
};

describe('canarie: parole tecniche riammesse nella 0.43.0 (0.47.0)', () => {
  const byId = new Map(schede.map((s) => [s.id, s]));

  it('le schede citate esistono nel catalogo base', () => {
    for (const id of Object.keys(CANARIE)) {
      expect(byId.has(id), `manca la scheda ${id}`).toBe(true);
    }
  });

  it.each(Object.entries(CANARIE))('%s accetta %j', (id, words) => {
    const scheda = byId.get(id)!;
    const accepted = acceptedWords(scheda);
    for (const word of words) {
      expect(accepted, `${id}: "${word}" è nel dizionario ma non tra le parole accettate`).toContain(word);
    }
  });
});

/*
 * IL CASO SEGNALATO: `setosa` rifiutata sulla scheda ale `6-facile-085`.
 *
 * Quella scheda NON è nel repo: le ale generate dall'admin vivono nel volume, e i
 * loro id proseguono la numerazione del catalogo base (che si ferma a `-030`).
 * Qui si verifica la parte che si può verificare in repo: con il dizionario giusto
 * la pipeline `ale` (`Dict'`, max 16 lettere) ammette `setosa` quando la griglia la
 * compone. Quindi una scheda ale **rigenerata** dopo questo deploy la accetta; una
 * scheda vecchia nel volume continua a rifiutarla finché non la si rigenera
 * (`docs/ALE-RUNTIME-SERVER.md`).
 *
 * Costa ~0,5 s e ~350 MB di heap (trie a 16 lettere): gira solo se `words.txt` è
 * stato generato (`pnpm --filter @boggle/dictionary build`), altrimenti è saltato —
 * `words.txt` è gitignored e il suo file di origine, `words.br`, è versionato.
 */
const DICT_FILE = path.join(DICT_DIR, 'words.txt');

describe.skipIf(!existsSync(DICT_FILE))('setosa e il dizionario usato dalle ale', () => {
  it('`setosa` è nel dizionario (whitelist di technical-words.txt)', async () => {
    const words = new Set(
      readFileSync(DICT_FILE, 'utf8')
        .split('\n')
        .map((w) => w.trim())
        .filter(Boolean),
    );
    expect(words.size).toBeGreaterThan(370_000);
    expect(words.has('setosa'), '`setosa` manca da words.txt: ricostruirlo da words.br').toBe(true);
  });

  it('la pipeline ale accetta `setosa` quando la griglia la compone', async () => {
    const inputs = loadAleInputs({ log: false });
    // Prima riga `setosa`: le 6 celle sono adiacenti in orizzontale.
    const faces = 'setosa'.padEnd(36, 'a').split('');
    faces[7] = 'r';
    faces[8] = 'l';
    faces[10] = 'n';
    faces[12] = 'm';
    faces[14] = 'i';
    const grid = buildGrid(6 as GridSize, faces);
    const wordPath = findWordPath(grid, 'setosa');
    expect(wordPath, '`setosa` non componibile sulla griglia di prova').not.toBeNull();

    const found = solveGrid(grid, inputs.trie, { limit: 50_000, minLength: 3 });
    expect(found, '`setosa` è nel dizionario ma il trie ale la scarta').toContain('setosa');
  });
});
