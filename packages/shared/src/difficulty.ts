/**
 * Difficoltà della griglia.
 *
 * La difficoltà agisce sulla DISTRIBUZIONE DELLE LETTERE (più o meno vocali e
 * consonanti rare). La dimensione della griglia (4x4, 5x5, 6x6) è una scelta separata.
 *
 * Ogni livello porta con sé anche un tema visivo (colori di sfondo e tile) e,
 * opzionalmente, una durata di round consigliata.
 */
import type { GridSize } from './types.js';

export type Difficulty = 'facile' | 'normale' | 'difficile';

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

export const DIFFICULTY_ORDER: Difficulty[] = ['facile', 'normale', 'difficile'];

export const DIFFICULTIES: Record<Difficulty, DifficultyMeta> = {
  facile: {
    id: 'facile',
    label: 'Facile',
    description: 'Più vocali e lettere comuni: più parole possibili.',
    theme: {
      background: 'radial-gradient(1200px 800px at 50% -10%, #1d3a4d 0%, #0d1f2b 55%)',
      surface: '#14303f',
      accent: '#2fb6a8',
      accentSoft: '#6fe0d4',
    },
  },
  normale: {
    id: 'normale',
    label: 'Normale',
    description: 'Distribuzione bilanciata di vocali e consonanti.',
    theme: {
      background: 'radial-gradient(1200px 800px at 50% -10%, #23284f 0%, #0f1225 55%)',
      surface: '#1a1e3d',
      accent: '#7c5cff',
      accentSoft: '#a08bff',
    },
  },
  difficile: {
    id: 'difficile',
    label: 'Difficile',
    description: 'Meno vocali e più consonanti rare: parole più difficili da comporre.',
    theme: {
      background: 'radial-gradient(1200px 800px at 50% -10%, #4a1f3a 0%, #24101d 55%)',
      surface: '#38182c',
      accent: '#e0538f',
      accentSoft: '#ff8fb8',
    },
  },
};

export function isDifficulty(value: unknown): value is Difficulty {
  return value === 'facile' || value === 'normale' || value === 'difficile';
}

/** Durate di round selezionabili (secondi). */
export const ROUND_DURATIONS_SEC = [90, 120, 180] as const;
export type RoundDurationSec = (typeof ROUND_DURATIONS_SEC)[number];

export function isRoundDuration(value: unknown): value is RoundDurationSec {
  return ROUND_DURATIONS_SEC.includes(Number(value) as RoundDurationSec);
}

/** Toni ambient per la musica/atmosfera, per difficoltà. */
export const DIFFICULTY_ROOT_TONE: Record<Difficulty, number> = {
  facile: 293.66, // D4
  normale: 220.0, // A3
  difficile: 164.81, // E3
};

export type { GridSize };
