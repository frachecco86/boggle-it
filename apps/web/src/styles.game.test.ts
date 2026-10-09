/**
 * Test di regressione sul CSS della PARTITA.
 *
 * Nel progetto non c'è jsdom né testing-library, quindi qui il foglio di stile si
 * legge com'è: è un testo, e le regole in fondo sono la memoria di bug che nessun
 * test di logica avrebbe mai potuto prendere.
 *
 * Il bug da cui nasce questo file (telefono, parola sbagliata): il rettangolo che
 * mostra l'esito è `white-space: nowrap`, e la colonna del grid che lo contiene
 * era quella IMPLICITA (`auto`), la cui dimensione minima è la *min-content* degli
 * item. Una parola rifiutata lunga + il suo motivo (~550px) allargava la colonna
 * più dello schermo: la griglia — che legge la propria larghezza in `cqw` — si
 * ingrandiva e perdeva le colonne fuori dal bordo, non più toccabili. Sotto i
 * ~560px di viewport sempre, con «Sito desktop» (980px) mai: sembrava un bug
 * «del mobile», era una colonna senza pavimento.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(fileURLToPath(new URL('./styles.css', import.meta.url)), 'utf8');

/**
 * Corpo del primo blocco il cui selettore apre UNA RIGA (`selector` va passato
 * completo di `{`, altrimenti `.grid-cell` troverebbe prima `.grid-cells`).
 * Le parentesi sono bilanciate: serve per i `@keyframes` e per i `@media`, che
 * hanno blocchi annidati.
 */
function blockOf(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`^[ \\t]*${escaped}`, 'm').exec(css);
  expect(match, `in styles.css non c'è "${selector}"`).not.toBeNull();
  const open = css.indexOf('{', match!.index);
  let depth = 0;
  for (let p = open; p < css.length; p++) {
    if (css[p] === '{') depth++;
    else if (css[p] === '}') {
      depth--;
      if (depth === 0) return css.slice(open + 1, p);
    }
  }
  throw new Error(`blocco non chiuso per "${selector}"`);
}

describe('partita — la griglia non può essere più larga dello schermo', () => {
  it('la colonna di .game__main ha un pavimento di 0', () => {
    // Senza `grid-template-columns: minmax(0, 1fr)` la traccia implicita `auto`
    // si allarga fino alla min-content del testo del banner.
    expect(blockOf('.game__main {')).toMatch(/grid-template-columns:\s*minmax\(0\s*,\s*1fr\)/);
  });

  it('l\'item del banner è elastico dove serve (sul grid item, non sul figlio)', () => {
    const wrap = blockOf('.current-word-wrap {');
    expect(wrap).toMatch(/min-width:\s*0/);
    expect(wrap).toMatch(/overflow:\s*hidden/);
  });

  it('parola e motivo si accorciano invece di allargare tutto', () => {
    const shrinking = css.slice(
      css.indexOf('.current-word-banner__word,'),
      css.indexOf('.current-word-banner__word,') + 600,
    );
    expect(shrinking).toMatch(/min-width:\s*0/);
    expect(shrinking).toMatch(/text-overflow:\s*ellipsis/);
  });
});

describe('partita — l\'esito di un errore non disturba il tocco', () => {
  it('l\'animazione d\'errore non ingrandisce niente', () => {
    // `scale(` o `box-shadow` che si allarga = la griglia che sembra (o diventa)
    // più grande mentre il giocatore sta già per ritoccare.
    const nudge = blockOf('@keyframes grid-nudge {');
    expect(nudge).not.toMatch(/scale\(/);
    expect(nudge).not.toMatch(/box-shadow/);
    expect(nudge).toMatch(/translateX/);
  });

  it('non esiste più il flash che si allargava attorno al board', () => {
    expect(css).not.toMatch(/error-flash/);
  });

  it('rispetta chi preferisce ridurre le animazioni', () => {
    const reduced = blockOf('@media (prefers-reduced-motion: reduce) {\n  .grid-cell');
    expect(reduced).toMatch(/\.grid-board--error\s*\{[^}]*animation:\s*none/);
    expect(reduced).toMatch(/\.grid-cell\s*\{[^}]*animation:\s*none/);
  });
});

describe('partita — l\'ingresso delle celle non deve ripartire', () => {
  /*
   * `animation` è una SHORTHAND: `.tile--selected` e `.tile--hint` la scrivono,
   * quindi TOLTA la selezione tornava `tile-in` nello stile calcolato e il
   * browser lo riavviava (celle a `scale(0.4)`/`opacity:0` e poi rimbalzo).
   * L'ingresso sta sull'involucro `.grid-cell`, che non cambia mai classe: i
   * rettangoli che legge lo swipe restano gli stessi.
   */
  it('la cella non dichiara un\'animazione propria', () => {
    expect(blockOf('.tile {')).not.toMatch(/animation:/);
  });

  it('l\'ingresso è sull\'involucro', () => {
    expect(blockOf('.grid-cell {')).toMatch(/animation:\s*tile-in/);
  });
});
