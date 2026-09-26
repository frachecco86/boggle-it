/**
 * Test della libreria musicale: aggiunta, rimozione e persistenza su disco.
 *
 * Il punto critico è che i file sopravvivano al riavvio: l'admin carica un MP3 e
 * si aspetta di ritrovarlo dopo un redeploy (i file stanno sul volume, insieme al
 * database dei profili).
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { MusicLibrary } from './musicLibrary.js';

let dir: string;
let lib: MusicLibrary;

/** Ogni test ha la sua cartella isolata: la libreria la riceve per iniezione. */
const makeLibrary = () => new MusicLibrary(dir);

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'sbooble-music-'));
  lib = makeLibrary();
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const fakeMp3 = (bytes = 128) => ({ data: Buffer.alloc(bytes, 7), mime: 'audio/mpeg' });

describe('MusicLibrary', () => {
  it('include sempre le tracce del bundle', () => {
    const l = makeLibrary();
    const ids = l.list().map((t) => t.id);
    expect(ids).toContain('classica');
    expect(ids).toContain('overworld');
    expect(l.listUploaded()).toHaveLength(0);
  });

  it('aggiunge una traccia: id prefissato, file su disco e metadati pubblici', () => {
    const l = makeLibrary();
    const track = l.add({ label: 'Battaglia finale', credits: 'me', ...fakeMp3() });
    expect(track.id.startsWith('up-')).toBe(true);
    expect(track.label).toBe('Battaglia finale');
    expect(track.uploaded).toBe(true);
    expect(track.file).toBe(`/music/${track.id}/file`);
    // Il file esiste davvero e ha un nome sicuro (slug dell'etichetta + estensione).
    const file = l.fileOf(track.id);
    expect(file).not.toBeNull();
    expect(file!.path.endsWith('.mp3')).toBe(true);
    expect(path.basename(file!.path)).toContain('battaglia-finale');
  });

  it('sopravvive al riavvio: una nuova istanza rilegge il manifest', () => {
    const l = makeLibrary();
    const track = l.add({ label: 'Persistente', ...fakeMp3(64) });
    // Simula un riavvio del server: nuova istanza sullo stesso volume.
    const reloaded = makeLibrary();
    expect(reloaded.listUploaded().map((t) => t.id)).toContain(track.id);
    expect(reloaded.fileOf(track.id)).not.toBeNull();
  });

  it('rimuove la traccia, il file e la voce dal manifest', () => {
    const l = makeLibrary();
    const track = l.add({ label: 'Temporanea', ...fakeMp3() });
    const filePath = l.fileOf(track.id)!.path;
    expect(l.remove(track.id)).toBe(true);
    expect(l.fileOf(track.id)).toBeNull();
    expect(existsSync(filePath)).toBe(false);
    const reloaded = makeLibrary();
    expect(reloaded.listUploaded()).toHaveLength(0);
  });

  it('ignora le voci il cui file è sparito (meglio non servirle che dare 404)', () => {
    const l = makeLibrary();
    const track = l.add({ label: 'Orfana', ...fakeMp3() });
    rmSync(l.fileOf(track.id)!.path, { force: true });
    const reloaded = makeLibrary();
    expect(reloaded.listUploaded()).toHaveLength(0);
  });

  it('due etichette identiche non collidono', () => {
    const l = makeLibrary();
    const a = l.add({ label: 'Stessa', ...fakeMp3() });
    const b = l.add({ label: 'Stessa', ...fakeMp3() });
    expect(a.id).not.toBe(b.id);
    expect(l.fileOf(a.id)!.path).not.toBe(l.fileOf(b.id)!.path);
  });

  it('un\'etichetta con percorso non può uscire dalla cartella', () => {
    const l = makeLibrary();
    const track = l.add({ label: '../../etc/passwd', ...fakeMp3() });
    const filePath = l.fileOf(track.id)!.path;
    // Il nome è derivato dallo slug: nessun separatore di percorso sopravvive.
    expect(path.dirname(filePath)).toBe(path.resolve(dir));
    expect(path.basename(filePath)).not.toContain('/');
    expect(path.basename(filePath)).not.toContain('..');
  });

  it('senza estensione il mime decide il formato del file', () => {
    const l = makeLibrary();
    const ogg = l.add({ label: 'Formato', data: Buffer.alloc(32, 1), mime: 'audio/ogg' });
    expect(l.fileOf(ogg.id)!.path.endsWith('.ogg')).toBe(true);
  });

  it('il manifest su disco è JSON valido e contiene i metadati', () => {
    const l = makeLibrary();
    const track = l.add({ label: 'Con metadati', credits: 'Autore X', ...fakeMp3() });
    const raw = readFileSync(path.join(dir, 'library.json'), 'utf8');
    const parsed = JSON.parse(raw) as Array<{ id: string; credits: string }>;
    const entry = parsed.find((t) => t.id === track.id);
    expect(entry?.credits).toBe('Autore X');
  });
});

describe('abilitazione delle tracce', () => {
  it('disabilitare una traccia la toglie dal catalogo pubblico ma non da quello admin', () => {
    const l = makeLibrary();
    // Una traccia INCLUSA nel bundle: non si può cancellare, solo spegnere.
    expect(l.setEnabled('classica', false)).toBe(true);

    // Catalogo pubblico: non c'è più, quindi nessun giocatore può sceglierla.
    expect(l.list().map((t) => t.id)).not.toContain('classica');
    // Catalogo admin: c'è ancora, marcata come spenta, così si può riaccendere.
    const admin = l.listAll().find((t) => t.id === 'classica');
    expect(admin?.enabled).toBe(false);

    expect(l.setEnabled('classica', true)).toBe(true);
    expect(l.list().map((t) => t.id)).toContain('classica');
    expect(l.listAll().find((t) => t.id === 'classica')?.enabled).toBe(true);
  });

  it('funziona anche sulle tracce caricate, non solo su quelle incluse', () => {
    const l = makeLibrary();
    const track = l.add({ label: 'Mia traccia', ...fakeMp3() });
    expect(l.setEnabled(track.id, false)).toBe(true);
    expect(l.list().map((t) => t.id)).not.toContain(track.id);
    // Il file resta su disco: spegnere non è cancellare.
    expect(l.fileOf(track.id)).not.toBeNull();
  });

  it('rifiuta un id inesistente', () => {
    const l = makeLibrary();
    expect(l.setEnabled('non-esiste', false)).toBe(false);
  });

  it('la scelta sopravvive al riavvio (persistita su disabled.json)', () => {
    const first = makeLibrary();
    first.setEnabled('overworld', false);
    expect(existsSync(path.join(dir, 'disabled.json'))).toBe(true);

    const second = makeLibrary();
    expect(second.list().map((t) => t.id)).not.toContain('overworld');
    expect(second.listAll().find((t) => t.id === 'overworld')?.enabled).toBe(false);
  });

  it('rimuovere una traccia la toglie anche dall elenco dei disabilitati', () => {
    const l = makeLibrary();
    const track = l.add({ label: 'Temporanea', ...fakeMp3() });
    l.setEnabled(track.id, false);
    l.remove(track.id);
    // Senza la pulizia, un id riusato in futuro resterebbe spento senza motivo.
    const raw = JSON.parse(readFileSync(path.join(dir, 'disabled.json'), 'utf8')) as string[];
    expect(raw).not.toContain(track.id);
  });

  it('exists/isEnabled/isPlayable distinguono esistenza e attivazione', () => {
    const l = makeLibrary();
    l.setEnabled('classica', false);
    expect(l.exists('classica')).toBe(true);
    expect(l.isEnabled('classica')).toBe(false);
    expect(l.isPlayable('classica')).toBe(false);
    // Una traccia mai vista non esiste affatto.
    expect(l.exists('boh')).toBe(false);
    expect(l.isPlayable('boh')).toBe(false);
  });

  it('firstPlayable salta le tracce spente e null se sono tutte spente', () => {
    const l = makeLibrary();
    const first = l.firstPlayable();
    expect(first?.id).toBe(l.list()[0]?.id);
    for (const t of l.listAll()) l.setEnabled(t.id, false);
    expect(l.list()).toHaveLength(0);
    expect(l.firstPlayable()).toBeNull();
  });
});

describe('MusicLibrary: tracce incluse nascoste', () => {
  it('nasconde una traccia inclusa: sparisce da admin e playlist, resta il file', () => {
    const l = makeLibrary();
    // Una traccia inclusa è presente all'inizio.
    expect(l.listAll().some((t) => t.id === 'allegra')).toBe(true);
    expect(l.list().some((t) => t.id === 'allegra')).toBe(true);

    expect(l.hide('allegra')).toBe(true);
    expect(l.isHidden('allegra')).toBe(true);
    // Sparita sia dall'elenco admin sia da quello pubblico.
    expect(l.listAll().some((t) => t.id === 'allegra')).toBe(false);
    expect(l.list().some((t) => t.id === 'allegra')).toBe(false);
    // Le altre restano.
    expect(l.listAll().some((t) => t.id === 'classica')).toBe(true);
  });

  it('la traccia nascosta resta nascosta dopo un riavvio', () => {
    makeLibrary().hide('spazio');
    const reloaded = makeLibrary();
    expect(reloaded.isHidden('spazio')).toBe(true);
    expect(reloaded.listAll().some((t) => t.id === 'spazio')).toBe(false);
  });

  it('nascondere un id inesistente ritorna false', () => {
    expect(makeLibrary().hide('non-esiste')).toBe(false);
  });

  it('rimuovere una traccia caricata pulisce anche lo stato nascosto', () => {
    const l = makeLibrary();
    const track = l.add({ label: 'Prova', ...fakeMp3() });
    expect(l.hide(track.id)).toBe(true);
    expect(l.remove(track.id)).toBe(true);
    // Un id futuro riusato non deve restare nascosto.
    expect(l.isHidden(track.id)).toBe(false);
  });
});
