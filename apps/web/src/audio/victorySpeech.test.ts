/**
 * Test delle frasi di vittoria e della scelta della voce.
 *
 * Perché conta: le frasi vengono lette a voce alta a fine partita. Un segnaposto
 * `{nome}` non sostituito (o una frase duplicata) si sentirebbe subito, e la voce
 * deve essere quella italiana e possibilmente femminile: sui dispositivi con più
 * voci installate la scelta non è arbitraria.
 */
import { describe, expect, it } from 'vitest';
import { VICTORY_PHRASES, pickFemaleItalianVoice, pickVictoryPhrase } from './victorySpeech.js';

describe('victorySpeech — frasi', () => {
  it('ce ne sono abbastanza per non ripetersi spesso', () => {
    expect(VICTORY_PHRASES.length).toBeGreaterThanOrEqual(20);
  });

  it('nessuna frase è duplicata', () => {
    expect(new Set(VICTORY_PHRASES).size).toBe(VICTORY_PHRASES.length);
  });

  it('tutte contengono il segnaposto del nome', () => {
    for (const phrase of VICTORY_PHRASES) {
      expect(phrase).toContain('{nome}');
    }
  });

  it('il nome viene inserito e il segnaposto sparisce', () => {
    for (const random of [0, 0.33, 0.5, 0.99, 1]) {
      const phrase = pickVictoryPhrase('Margherita', () => random);
      expect(phrase).toContain('Margherita');
      expect(phrase).not.toContain('{nome}');
    }
  });

  it('senza nome usa un appellativo generico', () => {
    const phrase = pickVictoryPhrase('   ', () => 0);
    expect(phrase).not.toContain('{nome}');
    expect(phrase).toContain('campione');
  });

  it('un valore di random fuori intervallo non esce dall\u2019elenco', () => {
    expect(pickVictoryPhrase('A', () => -1)).toBeTruthy();
    expect(pickVictoryPhrase('A', () => 42)).toBeTruthy();
  });
});

describe('victorySpeech — voce', () => {
  const voices = [
    { name: 'Microsoft David - English (United States)', lang: 'en-US' },
    { name: 'Alice', lang: 'it-IT' },
    { name: 'Luca', lang: 'it-IT' },
    { name: 'Google italiano', lang: 'it-IT' },
  ];

  it('sceglie una voce italiana', () => {
    const voice = pickFemaleItalianVoice(voices);
    expect(voice?.lang.startsWith('it')).toBe(true);
  });

  it('preferisce la voce femminile nota', () => {
    expect(pickFemaleItalianVoice(voices)?.name).toBe('Alice');
  });

  it('preferisce le voci "natural" a parità di genere', () => {
    const voice = pickFemaleItalianVoice([
      { name: 'Federica', lang: 'it-IT' },
      { name: 'Elsa Online (Natural)', lang: 'it-IT' },
    ]);
    expect(voice?.name).toBe('Elsa Online (Natural)');
  });

  it('senza voci italiane non inventa: ritorna null', () => {
    expect(pickFemaleItalianVoice([{ name: 'David', lang: 'en-US' }])).toBeNull();
  });
});
