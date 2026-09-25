/**
 * Canale voce delle stanze: il "tieni premuto per parlare" del multiplayer.
 *
 * Il server NON decodifica, non registra e non conserva nulla dell'audio: fa da
 * ponte fra chi parla e gli altri della stanza (inoltro puro, come una radio).
 * Tutta la logica delicata sta qui e non dentro `index.ts` perché è **pura**
 * rispetto al tempo (`now` arriva come parametro) e quindi si può testare senza
 * socket e senza timer.
 *
 * Tre regole, in ordine di importanza:
 *  1. **Solo chi è nella stanza** parla e ascolta (il codice stanza lo decide
 *     `index.ts` con `socketState`; qui non si conosce Socket.IO).
 *  2. **Tetto ai parlanti simultanei** (`VOICE_MAX_TALKERS`): ogni voce aperta
 *     costa banda a TUTTI gli ascoltatori, non solo a chi parla.
 *  3. **Tetto alla frequenza** dei pacchetti di ogni giocatore: un client
 *     impazzito non deve poter inondare la stanza.
 *
 * Il posto di chi parla si libera in due modi: il rilascio del tasto
 * (`stop`) oppure il silenzio prolungato (`VOICE_TALKER_TIMEOUT_MS`), così un
 * client che si chiude o perde la rete non blocca il canale per sempre.
 */
import {
  VOICE_CHUNK_BYTES,
  VOICE_MAX_CHUNKS_PER_SECOND,
  VOICE_MAX_TALKERS,
} from '@boggle/shared';

/**
 * Silenzio oltre il quale il posto di chi parla viene liberato.
 *
 * Più lungo del silenzio che spegne l'indicatore "sta parlando"
 * (`VOICE_SILENCE_MS`, 400 ms): una pausa fra due frasi non deve far perdere il
 * canale a metà discorso, ma un client morto va comunque liberato in fretta.
 */
export const VOICE_TALKER_TIMEOUT_MS = 3000;

/** Chi ha il microfono aperto in questo momento. */
interface Talker {
  code: string;
  playerId: string;
  /** Ultimo pacchetto ricevuto (ms, orologio del server). */
  lastChunkAt: number;
  /** Inizio della finestra usata per il limite di frequenza. */
  windowStartedAt: number;
  /** Pacchetti ricevuti nella finestra corrente. */
  chunksInWindow: number;
}

export type VoiceStartResult = { ok: true } | { ok: false; message: string };

export class VoiceRelay {
  /** socketId → stato del parlante (l'identità di rete, non il playerId). */
  private readonly talkers = new Map<string, Talker>();

  /**
   * Apre il canale per un socket. Il chiamante ha già verificato che il socket
   * sia in una stanza: qui si decide solo se c'è posto.
   */
  start(socketId: string, code: string, playerId: string, now: number = Date.now()): VoiceStartResult {
    this.prune(now);
    const already = this.talkers.get(socketId);
    if (already) {
      // Ritentare mentre si sta già parlando è normale (il tasto viene premuto
      // più volte): non si consuma un secondo posto.
      already.lastChunkAt = now;
      return { ok: true };
    }
    if (this.countInRoom(code, now) >= VOICE_MAX_TALKERS) {
      return { ok: false, message: `Troppe voci insieme: si può parlare in ${VOICE_MAX_TALKERS} alla volta.` };
    }
    this.talkers.set(socketId, {
      code,
      playerId,
      lastChunkAt: now,
      windowStartedAt: now,
      chunksInWindow: 0,
    });
    return { ok: true };
  }

  /**
   * Valida un pacchetto e dice a chi va inoltrato.
   *
   * `null` = da scartare (troppo grande, vuoto, non allineato a 16 bit, senza
   * canale aperto o oltre il limite di frequenza). Scartare in silenzio è
   * voluto: rispondere a ogni pacchetto anomalo darebbe a chi attacca un canale
   * di amplificazione gratis.
   */
  chunk(
    socketId: string,
    byteLength: number,
    now: number = Date.now(),
  ): { code: string; playerId: string } | null {
    this.prune(now);
    const talker = this.talkers.get(socketId);
    if (!talker) return null;
    // Int16: i pacchetti dispari non sono campioni validi.
    if (byteLength <= 0 || byteLength % 2 !== 0 || byteLength > VOICE_CHUNK_BYTES) return null;

    if (now - talker.windowStartedAt >= 1000) {
      talker.windowStartedAt = now;
      talker.chunksInWindow = 0;
    }
    talker.chunksInWindow++;
    if (talker.chunksInWindow > VOICE_MAX_CHUNKS_PER_SECOND) return null;

    talker.lastChunkAt = now;
    return { code: talker.code, playerId: talker.playerId };
  }

  /** Il tasto è stato rilasciato: libera subito il posto. */
  stop(socketId: string): void {
    this.talkers.delete(socketId);
  }

  /** Il socket è uscito dalla stanza o si è disconnesso. */
  forget(socketId: string): void {
    this.talkers.delete(socketId);
  }

  /** Quante voci sono aperte in una stanza adesso. */
  countInRoom(code: string, now: number = Date.now()): number {
    this.prune(now);
    let n = 0;
    for (const t of this.talkers.values()) if (t.code === code) n++;
    return n;
  }

  /** true se quel giocatore sta parlando in una stanza (per test e diagnostica). */
  isTalking(code: string, playerId: string, now: number = Date.now()): boolean {
    this.prune(now);
    for (const t of this.talkers.values()) {
      if (t.code === code && t.playerId === playerId) return true;
    }
    return false;
  }

  /**
   * Dimentica chi non manda pacchetti da troppo tempo.
   *
   * Non serve un timer: ogni operazione ripulisce prima di guardare, quindi lo
   * stato è sempre coerente con `now` e non ci sono intervalli da fermare.
   */
  private prune(now: number): void {
    for (const [socketId, t] of this.talkers) {
      if (now - t.lastChunkAt > VOICE_TALKER_TIMEOUT_MS) this.talkers.delete(socketId);
    }
  }
}
