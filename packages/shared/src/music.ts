/**
 * Catalogo delle musiche di sottofondo.
 *
 * Tutte le tracce INCLUSE sono **reali, royalty-free e nel bundle** (niente
 * generazione sintetica). Sono in loop e adatte a un gioco di parole: ritmo
 * non invadente, niente voci, volume pensato per stare sotto agli effetti.
 *
 * L'admin può **caricare MP3** dal pannello: vengono salvati sul server
 * (`DATA_DIR/music/`) e compaiono nel catalogo di TUTTI i giocatori. Il client
 * scarica il catalogo dinamico da `GET /music` e lo passa al motore audio con
 * `setMusicCatalog`. Gli id delle tracce caricate sono quindi stringhe, non più
 * solo gli id letterali di questo file: vedi `MusicChoice`.
 *
 * In multiplayer la traccia la sceglie l'HOST e vale per tutta la stanza
 * (vedi `RoomState.musicId`); in single player ognuno scegle la propria.
 *
 * Licenze: le tracce incluse sono tutte **CC0 1.0** (pubblico dominio).
 * Attribuzioni in `credits`: CC0 non le richiede, ma le manteniamo per correttezza.
 */

/** Una traccia del catalogo, statica (bundle) o caricata dall'admin. */
export interface MusicTrackMeta {
  id: string;
  label: string;
  /** Breve descrizione del carattere della traccia. */
  mood: string;
  /** Percorso/URL del file audio (mp3). */
  file: string;
  credits: string;
  /** true se è stata caricata dall'admin (non versionata nel bundle). */
  uploaded?: boolean;
}

/**
 * Traccia nel pannello admin: metadati + stato di attivazione.
 *
 * Il catalogo PUBBLICO (`/music`) contiene solo le tracce attive, quindi l'admin
 * non potrebbe vedere quelle spente né riaccenderle. Questo tipo è quello che il
 * server restituisce su `/admin/music`.
 */
export interface AdminMusicTrack extends MusicTrackMeta {
  enabled: boolean;
}

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
] as const satisfies readonly MusicTrackMeta[];

/** Id delle tracce incluse nel bundle (unione letterale, per i tipi). */
export type MusicId = (typeof MUSIC_TRACKS)[number]['id'];

export const MUSIC_IDS: string[] = MUSIC_TRACKS.map((t) => t.id);

export const DEFAULT_MUSIC_ID: MusicId = 'classica';

/** Catalogo di default: le tracce incluse nel bundle. */
export const DEFAULT_MUSIC_CATALOG: MusicTrackMeta[] = [...MUSIC_TRACKS];

/**
 * Scelta musicale: `'none'` per la musica spenta, altrimenti l'id di una traccia.
 *
 * NON è più un'unione di id letterali: l'admin può aggiungere tracce a runtime,
 * quindi un id valido è una qualsiasi stringa non vuota presente nel catalogo.
 */
export type MusicChoice = string;

/** true se la stringa ha la forma di una scelta musicale (validazione lato server). */
export function isMusicChoice(value: unknown): value is MusicChoice {
  return typeof value === 'string' && value.length > 0 && value.length <= 64;
}

/** true se l'id è una delle tracce incluse nel bundle. */
export function isBuiltInMusicId(value: unknown): value is MusicId {
  return typeof value === 'string' && (MUSIC_IDS as string[]).includes(value);
}

/** Traccia del catalogo, con fallback sulla prima disponibile. */
export function findMusicTrack(catalog: readonly MusicTrackMeta[], id: string): MusicTrackMeta | undefined {
  return catalog.find((t) => t.id === id);
}

/** Traccia attiva (con fallback sulla prima del catalogo). */
export function musicTrack(id: MusicChoice, catalog: readonly MusicTrackMeta[] = DEFAULT_MUSIC_CATALOG): MusicTrackMeta {
  return findMusicTrack(catalog, id) ?? catalog[0] ?? MUSIC_TRACKS[0];
}
