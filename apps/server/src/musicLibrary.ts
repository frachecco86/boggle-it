/**
 * Libreria musicale del server: tracce incluse + MP3 caricati dall'admin.
 *
 * Le tracce incluse nel bundle (vedi `@boggle/shared/music`) sono sempre
 * disponibili. L'admin può caricarire **MP3 aggiuntivi** dal pannello: i file
 * vengono salvati in `DATA_DIR/music/` (lo stesso volume di profili e schede,
 * così un solo mount basta) e descritti in `library.json`.
 *
 * PERCHÉ sul server e non nel browser dell'admin: la playlist è CONDIVISA —
 * quando l'host scegle una traccia in stanza, tutti i giocatori devono poterla
 * scaricare. Salvarla solo in locale significherebbe che gli altri sentono
 * silenzio (o un errore 404).
 *
 * Gli id delle tracce caricate hanno prefisso `up-`, per non collidere mai con
 * gli id delle tracce incluse.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DEFAULT_MUSIC_CATALOG, type MusicTrackMeta } from '@boggle/shared';
import { DATA_DIR } from './schede.js';

/** Cartella dei file musicali caricati (default; sovrascrivibile via MUSIC_DIR). */
export const MUSIC_DIR = process.env.MUSIC_DIR
  ? path.resolve(process.env.MUSIC_DIR)
  : path.join(DATA_DIR, 'music');

/** Quanto può pesare un MP3 caricato. Le tracce incluse stanno sotto 1,5 MB. */
export const MUSIC_MAX_BYTES = 6 * 1024 * 1024;

/** Estensione dedotta dal mime: il browser la usa per il codec. */
function extensionFor(mime: string): string {
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('wav')) return 'wav';
  if (mime.includes('mp4') || mime.includes('aac') || mime.includes('m4a')) return 'm4a';
  if (mime.includes('webm')) return 'webm';
  return 'mp3';
}

/** Voce del manifest (include il file su disco, oltre ai metadati pubblici). */
interface StoredTrack extends MusicTrackMeta {
  /** Nome del file dentro `MUSIC_DIR`. */
  filename: string;
  /** Mime con cui è stato caricato. */
  mime: string;
}

/**
 * Nome file sicuro ricavato dall'etichetta. Non è mai un percorso: viene
 * combinato con un id casuale, quindi anche due etichette identiche non
 * collidono e nessuno può uscire dalla cartella con `../`.
 */
function slugify(label: string): string {
  const slug = label
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  return slug || 'traccia';
}

export class MusicLibrary {
  /** Cartella dei file e del manifest. Iniettabile per i test. */
  private readonly dir: string;
  private readonly manifestFile: string;
  /** Traccia le voci caricate, indicizzate per id. */
  private readonly uploaded = new Map<string, StoredTrack>();

  constructor(dir: string = MUSIC_DIR) {
    this.dir = dir;
    this.manifestFile = path.join(dir, 'library.json');
    this.load();
  }

  /** Legge il manifest da disco (tollerante a file mancante o corrotto). */
  private load(): void {
    if (!existsSync(this.manifestFile)) return;
    try {
      const raw = JSON.parse(readFileSync(this.manifestFile, 'utf8')) as unknown;
      if (!Array.isArray(raw)) return;
      for (const entry of raw as StoredTrack[]) {
        // Salta le voci il cui file è sparito: meglio ometterle che servire 404.
        if (!entry?.id || !entry.filename) continue;
        if (!existsSync(path.join(this.dir, entry.filename))) continue;
        this.uploaded.set(entry.id, entry);
      }
    } catch (err) {
      console.warn('⚠ Libreria musicale illeggibile, la ignoro:', err);
    }
  }

  private save(): void {
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(this.manifestFile, JSON.stringify([...this.uploaded.values()], null, 2));
  }

  /** Catalogo completo: tracce incluse + caricate, in ordine di inserimento. */
  list(): MusicTrackMeta[] {
    return [...DEFAULT_MUSIC_CATALOG, ...[...this.uploaded.values()].map((t) => this.toMeta(t))];
  }

  /** Solo le tracce caricate (usato dal pannello admin). */
  listUploaded(): MusicTrackMeta[] {
    return [...this.uploaded.values()].map((t) => this.toMeta(t));
  }

  /** Percorso assoluto del file di una traccia caricata, o null. */
  fileOf(id: string): { path: string; mime: string } | null {
    const track = this.uploaded.get(id);
    if (!track) return null;
    const filePath = path.join(this.dir, track.filename);
    if (!existsSync(filePath)) return null;
    return { path: filePath, mime: track.mime };
  }

  /** Aggiunge una traccia. Ritorna i metadati pubblici. */
  add(input: { label: string; credits?: string; mood?: string; data: Buffer; mime: string }): MusicTrackMeta {
    const label = input.label.trim().slice(0, 60) || 'Traccia caricata';
    const id = `up-${randomUUID().slice(0, 8)}`;
    const filename = `${id}-${slugify(label)}.${extensionFor(input.mime)}`;
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(path.join(this.dir, filename), input.data);
    const stored: StoredTrack = {
      id,
      label,
      mood: input.mood?.trim().slice(0, 80) || 'caricata dall\'admin',
      credits: input.credits?.trim().slice(0, 160) || 'caricata dall\'admin',
      // URL servito dal server (non dal bundle web come le tracce incluse).
      file: `/music/${id}/file`,
      uploaded: true,
      filename,
      mime: input.mime,
    };
    this.uploaded.set(id, stored);
    this.save();
    return this.toMeta(stored);
  }

  /** Rimuove una traccia caricata (file + manifest). */
  remove(id: string): boolean {
    const track = this.uploaded.get(id);
    if (!track) return false;
    try {
      rmSync(path.join(this.dir, track.filename), { force: true });
    } catch {
      /* file già assente: il manifest va comunque ripulito */
    }
    this.uploaded.delete(id);
    this.save();
    return true;
  }

  /** true se l'id corrisponde a una traccia caricata presente. */
  has(id: string): boolean {
    return this.uploaded.has(id);
  }

  private toMeta(track: StoredTrack): MusicTrackMeta {
    return {
      id: track.id,
      label: track.label,
      mood: track.mood,
      file: track.file,
      credits: track.credits,
      uploaded: true,
    };
  }
}
