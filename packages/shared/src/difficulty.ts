/**
 * Difficoltà della griglia.
 *
 * La difficoltà agisce sulla DISTRIBUZIONE DELLE LETTERE (più o meno vocali e
 * consonanti rare). La dimensione della griglia (4x4, 5x5, 6x6) è una scelta separata.
 *
 * Ogni livello porta con sé anche un tema visivo (colori) e una tonalità ambient.
 */
import type { GridSize } from './types.js';

export type Difficulty = 'molto-facile' | 'facile' | 'normale' | 'difficile';

export interface DifficultyMeta {
  id: Difficulty;
  label: string;
  description: string;
  /** Colori del tema, applicati come variabili CSS. */
  theme: {
    /** Sfondo principale della pagina. */
    background: string;
    /** Sfondo delle superfici (griglia, pannelli). */
    surface: string;
    /** Colore accento (tile selezionate, bottoni). */
    accent: string;
    /** Colore accento attenuato. */
    accentSoft: string;
  };
}

export const DIFFICULTY_ORDER: Difficulty[] = ['molto-facile', 'facile', 'normale', 'difficile'];

export const DIFFICULTIES: Record<Difficulty, DifficultyMeta> = {
  'molto-facile': {
    id: 'molto-facile',
    label: 'Molto facile',
    description: 'Tantissime vocali e solo lettere comuni: ideale per iniziare.',
    theme: {
      background: 'radial-gradient(1200px 800px at 50% -10%, #eafbf1 0%, #d7f2e4 55%, #cbeadb 100%)',
      surface: '#ffffff',
      accent: '#1fa97a',
      accentSoft: '#5fd0a6',
    },
  },
  facile: {
    id: 'facile',
    label: 'Facile',
    description: 'Più vocali e lettere comuni: molte parole possibili.',
    theme: {
      background: 'radial-gradient(1200px 800px at 50% -10%, #eaf7fb 0%, #d5eef5 55%, #c7e7f0 100%)',
      surface: '#ffffff',
      accent: '#1f9bbf',
      accentSoft: '#66c9e2',
    },
  },
  normale: {
    id: 'normale',
    label: 'Normale',
    description: 'Distribuzione bilanciata di vocali e consonanti.',
    theme: {
      background: 'radial-gradient(1200px 800px at 50% -10%, #f3f1ff 0%, #e7e3fb 55%, #ded9f7 100%)',
      surface: '#ffffff',
      accent: '#6b4fe0',
      accentSoft: '#9b86f0',
    },
  },
  difficile: {
    id: 'difficile',
    label: 'Difficile',
    description: 'Meno vocali e più consonanti rare: parole più difficili da comporre.',
    theme: {
      background: 'radial-gradient(1200px 800px at 50% -10%, #fdf0f5 0%, #f8e2ec 55%, #f4d6e3 100%)',
      surface: '#ffffff',
      accent: '#d6477f',
      accentSoft: '#ef85b2',
    },
  },
};

export function isDifficulty(value: unknown): value is Difficulty {
  return (
    value === 'molto-facile' || value === 'facile' || value === 'normale' || value === 'difficile'
  );
}

/** Durate di round selezionabili (secondi). */
export const ROUND_DURATIONS_SEC = [90, 120, 180] as const;
export type RoundDurationSec = (typeof ROUND_DURATIONS_SEC)[number];

export function isRoundDuration(value: unknown): value is RoundDurationSec {
  return ROUND_DURATIONS_SEC.includes(Number(value) as RoundDurationSec);
}

export type { GridSize };
