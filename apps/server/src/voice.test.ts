/**
 * Test del canale voce: i limiti che proteggono la stanza.
 *
 * Perché contano: il server fa da ponte fra i giocatori senza guardare l'audio,
 * quindi gli unici freni sono questi. Un tetto ai parlanti simultanei sbagliato
 * (o assente) moltiplica la banda per tutti gli ascoltatori; un tetto alla
 * frequenza sbagliato trasforma un client impazzito in un inondatore.
 *
 * Qui il tempo è SEMPRE passato a mano (`now`): niente timer, test deterministici.
 */
import { describe, expect, it } from 'vitest';
import { VOICE_CHUNK_BYTES, VOICE_MAX_CHUNKS_PER_SECOND, VOICE_MAX_TALKERS } from '@boggle/shared';
import { VoiceRelay, VOICE_TALKER_TIMEOUT_MS } from './voice.js';

const ROOM = 'ABC123';

describe('VoiceRelay', () => {
  it('accetta un pacchetto solo da chi ha il canale aperto', () => {
    const relay = new VoiceRelay();
    expect(relay.chunk('s1', VOICE_CHUNK_BYTES, 0)).toBeNull();

    relay.start('s1', ROOM, 'p1', 0);
    expect(relay.chunk('s1', VOICE_CHUNK_BYTES, 10)).toEqual({ code: ROOM, playerId: 'p1' });
  });

  it('rifiuta chi apre il canale quando le voci sono già tutte occupate', () => {
    const relay = new VoiceRelay();
    for (let i = 0; i < VOICE_MAX_TALKERS; i++) {
      expect(relay.start(`s${i}`, ROOM, `p${i}`, 0)).toEqual({ ok: true });
    }
    const denied = relay.start('extra', ROOM, 'p-extra', 0);
    expect(denied.ok).toBe(false);
    // Il rifiuto non deve consumare un posto né aprire il canale.
    expect(relay.chunk('extra', VOICE_CHUNK_BYTES, 10)).toBeNull();
    expect(relay.countInRoom(ROOM, 10)).toBe(VOICE_MAX_TALKERS);
  });

  it('il tetto vale per stanza, non globalmente', () => {
    const relay = new VoiceRelay();
    for (let i = 0; i < VOICE_MAX_TALKERS; i++) relay.start(`s${i}`, ROOM, `p${i}`, 0);
    expect(relay.start('altra', 'ZZZ999', 'pz', 0)).toEqual({ ok: true });
  });

  it('ripetere `start` mentre si parla non consuma un secondo posto', () => {
    const relay = new VoiceRelay();
    relay.start('s1', ROOM, 'p1', 0);
    relay.start('s1', ROOM, 'p1', 10);
    relay.start('s1', ROOM, 'p1', 20);
    expect(relay.countInRoom(ROOM, 20)).toBe(1);
  });

  it('libera il posto quando il tasto viene rilasciato', () => {
    const relay = new VoiceRelay();
    relay.start('s1', ROOM, 'p1', 0);
    relay.stop('s1');
    expect(relay.countInRoom(ROOM, 0)).toBe(0);
    expect(relay.chunk('s1', VOICE_CHUNK_BYTES, 5)).toBeNull();
  });

  it('libera il posto di chi sparisce senza mandare `stop`', () => {
    const relay = new VoiceRelay();
    relay.start('s1', ROOM, 'p1', 0);
    const lastChunk = 10;
    relay.chunk('s1', VOICE_CHUNK_BYTES, lastChunk);

    // Ancora dentro la finestra di silenzio: il posto è suo.
    expect(relay.countInRoom(ROOM, lastChunk + VOICE_TALKER_TIMEOUT_MS)).toBe(1);
    // Oltre la finestra: il posto torna libero anche senza `stop`.
    expect(relay.countInRoom(ROOM, lastChunk + VOICE_TALKER_TIMEOUT_MS + 1)).toBe(0);
    expect(relay.chunk('s1', VOICE_CHUNK_BYTES, lastChunk + VOICE_TALKER_TIMEOUT_MS + 2)).toBeNull();
  });

  it('una pausa fra due frasi non fa perdere il canale', () => {
    const relay = new VoiceRelay();
    relay.start('s1', ROOM, 'p1', 0);
    // Pausa normale mentre si parla: molto meno del silenzio che libera il posto.
    const pause = VOICE_TALKER_TIMEOUT_MS / 2;
    relay.chunk('s1', VOICE_CHUNK_BYTES, pause);
    expect(relay.isTalking(ROOM, 'p1', pause)).toBe(true);
    // E il parlante non è stato raddoppiato, né scalzato.
    expect(relay.countInRoom(ROOM, pause)).toBe(1);
  });

  it('scarta i pacchetti malformati', () => {
    const relay = new VoiceRelay();
    relay.start('s1', ROOM, 'p1', 0);
    expect(relay.chunk('s1', 0, 1)).toBeNull(); // vuoto
    expect(relay.chunk('s1', 1023, 2)).toBeNull(); // dispari: non è Int16
    expect(relay.chunk('s1', VOICE_CHUNK_BYTES + 2, 3)).toBeNull(); // oltre il tetto
    expect(relay.chunk('s1', 1024, 4)).toEqual({ code: ROOM, playerId: 'p1' }); // valido
  });

  it('frena chi manda pacchetti troppo spesso', () => {
    const relay = new VoiceRelay();
    relay.start('s1', ROOM, 'p1', 0);

    // Un pacchetto ogni 10 ms: 100 in un secondo, molti più del consentito.
    let accepted = 0;
    for (let i = 0; i < 100; i++) {
      if (relay.chunk('s1', VOICE_CHUNK_BYTES, i * 10)) accepted++;
    }
    expect(accepted).toBe(VOICE_MAX_CHUNKS_PER_SECOND);

    // Passato il secondo, la finestra riparte: chi parla davvero non è bloccato.
    expect(relay.chunk('s1', VOICE_CHUNK_BYTES, 1000)).toEqual({ code: ROOM, playerId: 'p1' });
  });

  it('il pacchetto di un parlante va attribuito a lui, non a un altro', () => {
    const relay = new VoiceRelay();
    relay.start('s1', ROOM, 'p1', 0);
    relay.start('s2', ROOM, 'p2', 0);
    expect(relay.chunk('s2', VOICE_CHUNK_BYTES, 10)?.playerId).toBe('p2');
    expect(relay.chunk('s1', VOICE_CHUNK_BYTES, 10)?.playerId).toBe('p1');
  });

  it('uscire dalla stanza dimentica il canale aperto', () => {
    const relay = new VoiceRelay();
    relay.start('s1', ROOM, 'p1', 0);
    relay.forget('s1');
    expect(relay.countInRoom(ROOM, 0)).toBe(0);
    expect(relay.chunk('s1', VOICE_CHUNK_BYTES, 1)).toBeNull();
  });
});
