/**
 * Difficoltà della griglia.
 *
 * La difficoltà agisce sulla DISTRIBUZIONE DELLE LETTERE (più o meno vocali e
 * consonanti rare). La dimensione della griglia (4x4, 5x5, 6x6) è una scelta separata.
 *
 * Ogni livello porta con sé anche un tema visivo (colori) e una tonalità ambient.
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
    description:
      'Griglia ricca, lettere comuni: tantissime parole trovabili. Ideale per iniziare.',
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
    description: 'Griglia equilibrata: un buon numero di parole, con qualche lettera rara.',
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
    description:
      'Poche parole trovabili e più lettere rare: ogni parola vale, servono quelle lunghe.',
    theme: {
      background: 'radial-gradient(1200px 800px at 50% -10%, #fdf0f5 0%, #f8e2ec 55%, #f4d6e3 100%)',
      surface: '#ffffff',
      accent: '#d6477f',
      accentSoft: '#ef85b2',
    },
  },
};

export function isDifficulty(value: unknown): value is Difficulty {
  return DIFFICULTY_ORDER.includes(value as Difficulty);
}

/**
 * Difficoltà valida a partire da un valore arbitrario, con ripiego.
 *
 * Serve per i dati STORICI: il database contiene partite registrate con i livelli
 * aboliti (`molto-facile`, `estremo`). Leggendo `DIFFICULTIES[d]` su quei valori
 * si otterrebbe `undefined` e l'interfaccia andrebbe in errore. Qui il valore
 * sconosciuto ricade su `normale`, così classifica e statistiche restano leggibili.
 */
export function resolveDifficulty(value: unknown, fallback: Difficulty = 'normale'): Difficulty {
  return isDifficulty(value) ? value : fallback;
}

/**
 * Meta di una difficoltà storica, sempre definita.
 *
 * Per un livello abolito non esiste più la voce in `DIFFICULTIES`: se ne costruisce
 * una neutra, così l'interfaccia mostra il nome originale invece di andare in errore.
 */
export function difficultyMeta(value: unknown): DifficultyMeta {
  if (isDifficulty(value)) return DIFFICULTIES[value];
  const label = typeof value === 'string' && value ? value : 'Sconosciuta';
  return {
    ...DIFFICULTIES.normale,
    id: DIFFICULTIES.normale.id,
    label,
    description: 'Livello non più disponibile.',
  };
}

/** Durate di round selezionabili (secondi). */
export const ROUND_DURATIONS_SEC = [90, 120, 180] as const;
export type RoundDurationSec = (typeof ROUND_DURATIONS_SEC)[number];

export function isRoundDuration(value: unknown): value is RoundDurationSec {
  return ROUND_DURATIONS_SEC.includes(Number(value) as RoundDurationSec);
}

export type { GridSize };
