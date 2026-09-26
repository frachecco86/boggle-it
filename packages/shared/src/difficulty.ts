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
    /** Sfondo principale della pagina (tema chiaro). */
    background: string;
    /**
     * Sfondo della pagina nel tema SCURO.
     *
     * Perché un gradiente a parte invece di scurire quello chiaro: la
     * sovrapposizione scura su un gradiente pastello produceva un fondo quasi
     * nero e piatto, uguale per tutte le difficoltà ("monotono"). Qui ogni
     * difficoltà ha il suo fondo scuro con un alone del proprio colore.
     */
    backgroundDark: string;
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
      /*
       * Chiaro: azzurro cielo. Tre strati — due aloni agli angoli e una base
       * sfumata — invece di un solo gradiente pallido: dà profondità senza
       * togliere leggibilità al testo.
       */
      background:
        'radial-gradient(900px 620px at 8% -8%, #d3f0ff 0%, rgba(211, 240, 255, 0) 62%), radial-gradient(820px 640px at 96% 2%, #cfe4ff 0%, rgba(207, 228, 255, 0) 58%), linear-gradient(165deg, #f0f9ff 0%, #dcefff 48%, #c9e2fb 100%)',
      /* Scuro: notte blu, con un alone azzurro in alto a sinistra. */
      backgroundDark:
        'radial-gradient(900px 620px at 10% -10%, rgba(31, 155, 191, 0.45) 0%, rgba(31, 155, 191, 0) 60%), radial-gradient(760px 560px at 92% 0%, rgba(86, 217, 255, 0.22) 0%, rgba(86, 217, 255, 0) 58%), linear-gradient(170deg, #0d1a24 0%, #0b131c 55%, #080e15 100%)',
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
      /* Chiaro: lavanda con un tocco di blu e di rosa agli angoli. */
      background:
        'radial-gradient(880px 620px at 6% -8%, #e6ddff 0%, rgba(230, 221, 255, 0) 62%), radial-gradient(840px 640px at 98% 4%, #dbe6ff 0%, rgba(219, 230, 255, 0) 58%), linear-gradient(165deg, #f8f5ff 0%, #eae4ff 48%, #dcd5fb 100%)',
      /* Scuro: viola profondo con due aloni (viola e indaco). */
      backgroundDark:
        'radial-gradient(900px 620px at 8% -10%, rgba(124, 92, 255, 0.42) 0%, rgba(124, 92, 255, 0) 60%), radial-gradient(780px 580px at 94% 2%, rgba(99, 132, 255, 0.24) 0%, rgba(99, 132, 255, 0) 58%), linear-gradient(170deg, #171331 0%, #12102a 55%, #0c0a1c 100%)',
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
      /* Chiaro: rosa pesca con un alone caldo in alto a destra. */
      background:
        'radial-gradient(880px 620px at 10% -8%, #ffe0ee 0%, rgba(255, 224, 238, 0) 62%), radial-gradient(820px 620px at 98% 0%, #ffe6d6 0%, rgba(255, 230, 214, 0) 56%), linear-gradient(165deg, #fff6fa 0%, #ffe6f0 48%, #fbd8e6 100%)',
      /* Scuro: prugna con un alone rosa e uno corallo. */
      backgroundDark:
        'radial-gradient(900px 620px at 8% -10%, rgba(214, 71, 127, 0.42) 0%, rgba(214, 71, 127, 0) 60%), radial-gradient(780px 580px at 94% 2%, rgba(255, 138, 106, 0.2) 0%, rgba(255, 138, 106, 0) 58%), linear-gradient(170deg, #2a1020 0%, #200c19 55%, #16070f 100%)',
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
