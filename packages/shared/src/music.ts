/**
 * Catalogo delle musiche di sottofondo.
 *
 * Tutte le tracce sono **reali, royalty-free e incluse nel bundle** (niente
 * generazione sintetica). Sono in loop e adatte a un gioco di parole: ritmo
 * non invadente, niente voci, volume pensato per stare sotto agli effetti.
 *
 * In multiplayer la traccia la sceglie l'HOST e vale per tutta la stanza
 * (vedi `RoomState.musicId`); in single player ognuno scegle la propria.
 *
 * Licenze: tutte **CC0 1.0** (pubblico dominio). Attribuzioni in `credits`:
 * CC0 non le richiede, ma le manteniamo per correttezza.
 */

export const MUSIC_TRACKS = [
  {
    id: 'classica',
    label: 'Allegra classica',
    mood: '8-bit leggero, il tema originale',
    file: '/audio/tracks/classica.mp3',
    credits: '“Happy Adventure” di TinyWorlds (CC0)',
  },
  {
    id: 'allegra',
    label: 'Luna park',
    mood: 'positiva, giocosa, in loop',
    file: '/audio/tracks/allegra.mp3',
    credits: '“Amusement park Stage” di MintoDog (CC0) — OpenGameArt',
  },
  {
    id: 'azione',
    label: 'Azione',
    mood: 'ritmo sostenuto per partite veloci',
    file: '/audio/tracks/azione.mp3',
    credits: '“8bit Action Title” di MintoDog (CC0) — OpenGameArt',
  },
  {
    id: 'spazio',
    label: 'Spazio',
    mood: 'atmosferica, per concentrarsi',
    file: '/audio/tracks/spazio.mp3',
    credits: '“8-bit Unknown Planet” di HydroGene (CC0) — OpenGameArt',
  },
  {
    id: 'rilassante',
    label: 'Rilassante',
    mood: 'morbida, da sottofondo',
    file: '/audio/tracks/rilassante.mp3',
    credits: '“Happy Wireframes” di Bobjt (CC0) — OpenGameArt',
  },
  {
    id: 'overworld',
    label: 'Avventura',
    mood: 'ritmata, un po\' retrò',
    file: '/audio/tracks/overworld.mp3',
    credits: '“8bit theme - Upbeat Overworld” di Wolfgang_ (CC0) — OpenGameArt',
  },
] as const;

export type MusicId = (typeof MUSIC_TRACKS)[number]['id'];

export const MUSIC_IDS: MusicId[] = MUSIC_TRACKS.map((t) => t.id);

export const DEFAULT_MUSIC_ID: MusicId = 'classica';

export function isMusicId(value: unknown): value is MusicId {
  return typeof value === 'string' && (MUSIC_IDS as string[]).includes(value);
}

/** Nessuna musica: valore speciale accettato in giro (host o impostazioni). */
export type MusicChoice = MusicId | 'none';

export function isMusicChoice(value: unknown): value is MusicChoice {
  return value === 'none' || isMusicId(value);
}

export function musicTrack(id: MusicId) {
  return MUSIC_TRACKS.find((t) => t.id === id) ?? MUSIC_TRACKS[0];
}
