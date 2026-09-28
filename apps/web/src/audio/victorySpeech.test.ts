/**
 * Test delle frasi di vittoria e della scelta della voce.
 *
 * Perché conta: le frasi vengono lette a voce alta a fine partita. Un segnaposto
 * `{nome}` non sostituito (o una frase duplicata) si sentirebbe subito, e la voce
 * deve essere quella italiana e possibilmente femminile: sui dispositivi con più
 * voci installate la scelta non è arbitraria.
 */
import { describe, expect, it } from 'vitest';
import {
  RUNNER_UP_PHRASES,
  VICTORY_PHRASES,
  pickFemaleItalianVoice,
  pickRunnerUpPhrase,
  pickVictoryLine,
  pickVictoryPhrase,
} from './victorySpeech.js';

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

/*
 * La voce di fine partita deve parlare a TUTTI. Prima si sentiva solo sul
 * dispositivo di chi vinceva: in multiplayer la sentiva una persona sola.
 * Chi non ha vinto non può però sentire una frase in seconda persona
 * ("hai vinto"): direbbe a tutti di aver vinto.
 */
describe('victorySpeech — chi ascolta', () => {
  it('al vincitore arriva la frase di vittoria, con il proprio nome', () => {
    const line = pickVictoryLine('Margherita', true, () => 0);
    expect(line).toContain('Margherita');
    expect(VICTORY_PHRASES.map((p) => p.replace('{nome}', 'Margherita'))).toContain(line);
  });

  it('a chi non ha vinto arriva il NOME DEL VINCITORE, non una frase di vittoria propria', () => {
    const line = pickVictoryLine('Margherita', false, () => 0);
    expect(line).toContain('Margherita');
    expect(line).not.toContain('{nome}');
    // Mai una frase di vittoria in seconda persona a chi ha perso.
    expect(VICTORY_PHRASES).not.toContain(line);
  });

  it('le frasi per gli altri non parlano in seconda persona', () => {
    for (const phrase of RUNNER_UP_PHRASES) {
      expect(phrase).toContain('{nome}');
      expect(phrase.toLowerCase()).not.toContain('hai vinto');
      expect(phrase.toLowerCase()).not.toContain('hai battuto');
    }
  });

  it('le frasi per gli altri non sono duplicate', () => {
    expect(new Set(RUNNER_UP_PHRASES).size).toBe(RUNNER_UP_PHRASES.length);
  });

  it('il nome del vincitore viene inserito ovunque', () => {
    for (const random of [0, 0.33, 0.5, 0.99, 1]) {
      const line = pickRunnerUpPhrase('Margherita', () => random);
      expect(line).toContain('Margherita');
      expect(line).not.toContain('{nome}');
    }
  });

  it('senza vincitore non si dice nulla (meglio il silenzio di una frase sbagliata)', () => {
    expect(pickVictoryLine('', true)).toBeNull();
    expect(pickVictoryLine('   ', false)).toBeNull();
  });
});
