/**
 * Test dell'evidenziazione nelle note di rilascio.
 *
 * Perché contano: le note sono **la documentazione per chi gioca** e usano tre
 * forme in linea. Un errore qui non si vede in compilazione — si vede come
 * asterischi a schermo (è esattamente quello che succedeva prima).
 *
 * Il parsing produce un albero, quindi i test possono verificare anche i markup
 * **annidati** (codice dentro grassetto) senza montare React.
 */
import { describe, expect, it } from 'vitest';
import { parseInline, type InlineNode } from './RichText.js';

/** Scorciatoia: tipo, testo e — se c'è — i figli, in una stringa leggibile. */
const show = (node: InlineNode): string =>
  node.children ? `${node.kind}:${node.text}[${node.children.map(show).join('|')}]` : `${node.kind}:${node.text}`;
const parts = (input: string) => parseInline(input).map(show);

describe('evidenziazione del testo', () => {
  it('un testo senza marcatori resta un testo unico', () => {
    expect(parts('Nessuna formattazione qui')).toEqual(['text:Nessuna formattazione qui']);
  });

  it('rende il grassetto', () => {
    expect(parts('Vuoi **giocare** adesso')).toEqual(['text:Vuoi ', 'bold:giocare[text:giocare]', 'text: adesso']);
  });

  it('rende il corsivo', () => {
    expect(parts('Tab *Da solo* e *Con altri*')).toEqual([
      'text:Tab ',
      'italic:Da solo[text:Da solo]',
      'text: e ',
      'italic:Con altri[text:Con altri]',
    ]);
  });

  it('rende i frammenti di codice', () => {
    expect(parts('Il campo `promo` è opzionale')).toEqual([
      'text:Il campo ',
      'code:promo',
      'text: è opzionale',
    ]);
  });

  it('il grassetto non viene scambiato per corsivo', () => {
    expect(parts('**forte**')).toEqual(['bold:forte[text:forte]']);
  });

  it('un asterisco dentro il codice non apre un corsivo', () => {
    expect(parts('`a*b`')).toEqual(['code:a*b']);
  });

  it('i marcatori non chiusi restano testo normale', () => {
    expect(parts('un **grassetto aperto')).toEqual(['text:un **grassetto aperto']);
    expect(parts('un *corsivo aperto')).toEqual(['text:un *corsivo aperto']);
    expect(parts('un `codice aperto')).toEqual(['text:un `codice aperto']);
  });

  it('un asterisco isolato non fa nulla', () => {
    expect(parts('2 * 3 = 6')).toEqual(['text:2 * 3 = 6']);
  });

  it('gestisce testo vuoto e formattazione agli estremi', () => {
    expect(parts('')).toEqual([]);
    expect(parts('**tutto**')).toEqual(['bold:tutto[text:tutto]']);
    expect(parts('*tutto*')).toEqual(['italic:tutto[text:tutto]']);
  });

  it('sostituisce i ritorni a capo nel testo normale senza perdere nulla', () => {
    expect(parts('riga uno\nriga **due**')).toEqual(['text:riga uno\nriga ', 'bold:due[text:due]']);
  });

  it('un frammento di codice dentro il grassetto resta codice', () => {
    // Era il caso sbagliato: `**Il campo `promo` è opzionale**` mostrava i
    // backtick in vista dentro il grassetto.
    expect(parts('**Il campo `promo` è opzionale**')).toEqual([
      'bold:Il campo `promo` è opzionale[text:Il campo |code:promo|text: è opzionale]',
    ]);
  });

  it('anche il corsivo può contenere codice', () => {
    expect(parts('*il campo `promo`*')).toEqual(['italic:il campo `promo`[text:il campo |code:promo]']);
  });
});
