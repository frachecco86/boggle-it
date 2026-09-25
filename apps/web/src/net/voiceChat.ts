/**
 * Voce di stanza: il "tieni premuto per parlare" del multiplayer.
 *
 * Come funziona, in breve:
 *  1. **Si preme** → si apre il microfono e si chiede al server un posto nel
 *     canale (`voice:start`). Se il posto non c'è, si avvisa e non parte nulla.
 *  2. **Si parla** → un AudioWorklet (@see audio/worklets/voice-capture.worklet.js)
 *     riduce la voce a 16 kHz mono e la impacchetta in blocchi da 64 ms, che
 *     partono subito (`voice:chunk`). Il server li inoltra agli altri della stanza.
 *  3. **Si ascolta** → ogni blocco ricevuto viene messo in coda su un piccolo
 *     buffer (120 ms) e suonato in sequenza. Il buffer assorbe i ritardi della
 *     rete: senza, ogni pacchetto che arriva in ritardo produrrebbe un buco.
 *  4. **Si rilascia** → si manda l'ultimo blocco parziale, poi `voice:stop`, che
 *     libera il posto in modo che un altro possa parlare.
 *
 * Scelte che vale la pena conoscere:
 *  - **Nessuna registrazione**: l'audio vive solo in RAM, il server non conserva
 *    nulla e chi non è nella stanza non riceve niente.
 *  - **Il microfono resta aperto** finché si è in stanza (si chiude dopo un
 *    minuto di silenzio): riaprire il flusso a ogni frase costerebbe 100-300 ms
 *    proprio all'inizio della frase, quando serve la reattività.
 *  - **La voce di chi parla non torna indietro** (il server usa `socket.to`):
 *    con le casse accese si sentirebbe la propria voce in ritardo.
 *  - Chi ascolta con le casse e parla subito dopo può sentire un po' della
 *    propria voce riflessa dagli altoparlanti: il rimedio è il tasto di muto o
 *    le cuffie, non un automatismo che taglierebbe la voce.
 */
import {
  VOICE_SAMPLE_RATE,
  VOICE_SILENCE_MS,
  type VoiceAudioPayload,
} from '@boggle/shared';
import { audio } from '../audio/AudioEngine.js';
import { getSocket, type GameSocket } from './socket.js';
import { useAppStore } from '../state/store.js';

/**
 * Ritardo con cui si comincia a suonare il primo blocco di una voce.
 *
 * È il buffer anti-strappo: 120 ms di audio in anticipo assorbono i ritardi
 * tipici di una rete mobile senza che il ritardo totale diventi fastidioso.
 */
const PLAYBACK_LEAD_S = 0.12;

/**
 * Ritardo massimo tollerato prima di riallinearsi.
 *
 * Se la coda supera questo valore (rete che si blocca, pagina in background) si
 * ricomincia da `PLAYBACK_LEAD_S`: meglio un taglio che una voce che parla con
 * due secondi di ritardo.
 */
const PLAYBACK_MAX_LEAD_S = 0.6;

/**
 * Dopo quanto silenzio si chiude il microfono per non consumare batteria.
 * Non è un tempo di gioco: serve solo a non tenere la traccia audio aperta per
 * una partita intera se non si parla mai.
 */
const MIC_IDLE_CLOSE_MS = 60_000;

/** Coda di riproduzione di una voce: quando suonerà il prossimo blocco. */
interface Playback {
  /** Istante (in secondi del contesto) in cui suonerà il prossimo blocco. */
  nextTime: number;
  /** Volume della singola voce: oggi fisso, domani un cursore dedicato. */
  gain: GainNode;
}

const WORKLET_URL = new URL('../audio/worklets/voice-capture.worklet.js', import.meta.url);

class VoiceChat {
  private readonly socket: GameSocket = getSocket();
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private node: AudioWorkletNode | null = null;
  /** true quando il server ha aperto il canale e i blocchi possono partire. */
  private forwarding = false;
  private opening = false;
  /**
   * Cosa fare quando il worklet conferma di aver mandato l'ultimo blocco.
   * Serve a chiudere il canale sul server nell'ordine giusto (vedi `closeChannel`).
   */
  private onFlushed: (() => void) | null = null;
  private idleTimer: number | null = null;
  private noticeTimer: number | null = null;
  private sweep: number | null = null;
  /** Ultimo blocco ricevuto per giocatore (ms, `performance.now()`). */
  private readonly lastChunkAt = new Map<string, number>();
  private readonly playback = new Map<string, Playback>();
  /** Firma dell'ultimo elenco di parlanti pubblicato, per non aggiornare React inutilmente. */
  private speakerKey = '';

  /* ------------------------------------------------------------------ */
  /* Tasto premuto / rilasciato                                          */
  /* ------------------------------------------------------------------ */

  /** Il tasto è stato premuto: apre il microfono e comincia a trasmettere. */
  async press(): Promise<void> {
    if (useAppStore.getState().voiceMuted) {
      this.notice('Microfono silenziato: tocca l\'icona del muto per parlare.');
      return;
    }
    if (useAppStore.getState().voiceTalking) return;
    this.setTalking(true);

    const opened = await this.openChannel();
    // Rilasciato mentre si apriva: il canale si chiude subito, senza trasmettere.
    if (!useAppStore.getState().voiceTalking) {
      if (opened) this.closeChannel();
      return;
    }
    if (!opened) {
      this.setTalking(false);
      return;
    }
    this.forwarding = true;
    this.node?.port.postMessage('resume');
  }

  /** Il tasto è stato rilasciato: manda la coda e chiude il canale. */
  release(): void {
    if (!useAppStore.getState().voiceTalking) return;
    this.setTalking(false);
    // Se l'apertura è ancora in corso, se ne occupa `press` al ritorno dell'ack.
    if (!this.forwarding) return;
    this.closeChannel();
  }

  /** Passa al muto (o ne esce). Se si stava parlando, si chiude il canale. */
  setMuted(muted: boolean): void {
    useAppStore.setState({ voiceMuted: muted });
    if (muted) {
      this.release();
      this.notice('Microfono silenziato.');
    } else {
      this.notice('Microfono riattivato.');
    }
  }

  /** Uscita dalla stanza (o fine partita): si spegne tutto e si libera il microfono. */
  leaveRoom(): void {
    this.releaseNow();
    this.closeMic();
    this.playback.clear();
    this.lastChunkAt.clear();
    this.publishSpeakers();
    this.clearNotice();
  }

  /* ------------------------------------------------------------------ */
  /* Apertura e chiusura del canale                                      */
  /* ------------------------------------------------------------------ */

  /** Prepara microfono e worklet, poi chiede il posto al server. */
  private async openChannel(): Promise<boolean> {
    if (this.opening) return false;
    this.opening = true;
    try {
      if (!(await this.ensureCapture())) return false;
      return await new Promise<boolean>((resolve) => {
        // Rete di sicurezza: un ack che non arriva non deve lasciare il tasto
        // "acceso" per sempre.
        const timer = window.setTimeout(() => {
          this.notice('Il server non risponde: riprova.');
          resolve(false);
        }, 3000);
        this.socket.emit('voice:start', (res) => {
          window.clearTimeout(timer);
          if ('ok' in res && res.ok) {
            resolve(true);
            return;
          }
          this.notice('message' in res ? res.message : 'Canale voce non disponibile.');
          resolve(false);
        });
      });
    } finally {
      this.opening = false;
    }
  }

  /**
   * Chiude il canale in modo ordinato.
   *
   * L'ordine conta: il worklet manda l'ultimo blocco parziale e risponde
   * `'paused'`; solo DOPO si manda `voice:stop`. Invertendo i due passi il
   * server avrebbe già liberato il posto e il blocco finale verrebbe scartato,
   * cioè si perderebbe l'ultima sillaba di ogni frase.
   */
  private closeChannel(): void {
    const node = this.node;
    if (!node) {
      this.finishChannel();
      return;
    }
    // Rete di sicurezza: se il worklet non risponde, si chiude comunque.
    const timer = window.setTimeout(() => this.finishChannel(), 250);
    this.onFlushed = () => {
      window.clearTimeout(timer);
      this.finishChannel();
    };
    node.port.postMessage('pause');
  }

  private finishChannel(): void {
    this.onFlushed = null;
    if (!this.forwarding) return;
    this.forwarding = false;
    this.socket.emit('voice:stop');
    this.touchIdle();
  }

  /** Chiusura immediata, senza attendere il worklet (uscita dalla stanza). */
  private releaseNow(): void {
    this.onFlushed = null;
    if (!this.forwarding) return;
    this.forwarding = false;
    this.socket.emit('voice:stop');
  }

  /* ------------------------------------------------------------------ */
  /* Cattura                                                             */
  /* ------------------------------------------------------------------ */

  /** Microfono + worklet, aperti una volta sola e riusati fra una frase e l'altra. */
  private async ensureCapture(): Promise<boolean> {
    audio.unlock();
    const ctx = audio.context;
    if (!ctx) {
      this.notice('Audio non disponibile su questo dispositivo.');
      return false;
    }
    try {
      if (!this.node) {
        if (!ctx.audioWorklet) {
          this.notice('Questo browser non supporta la voce in stanza.');
          return false;
        }
        await ctx.audioWorklet.addModule(WORKLET_URL);
        const node = new AudioWorkletNode(ctx, 'voice-capture', {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          outputChannelCount: [1],
        });
        node.port.onmessage = (event) => this.onWorkletMessage(event.data);
        /*
         * Un AudioWorkletNode il cui ingresso arriva dal microfono e la cui
         * uscita non porta a nessuna destinazione può non venire elaborato:
         * lo si collega a un gain a volume ZERO. Il grafo resta "vivo" e il
         * microfono non finisce nelle casse (che sarebbe un fischio immediato).
         */
        const sink = ctx.createGain();
        sink.gain.value = 0;
        node.connect(sink);
        sink.connect(ctx.destination);
        this.node = node;
      }
      if (!this.stream) {
        /*
         * Solo `channelCount`: cancellazione dell'eco, soppressione del rumore
         * e guadagno automatico restano quelli decisi dal browser (di norma
         * attivi). Imporli qui toglierebbe voce a chi parla piano.
         */
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 } });
        this.source = ctx.createMediaStreamSource(this.stream);
        this.source.connect(this.node);
      }
      this.touchIdle();
      return true;
    } catch (err) {
      this.notice(micErrorMessage(err));
      this.closeMic();
      return false;
    }
  }

  /**
   * Blocchi dal worklet: si inoltrano al server solo a canale aperto.
   *
   * Nota: l'ultimo blocco parziale arriva qui PRIMA della conferma `'paused'`
   * (i messaggi di un `MessagePort` mantengono l'ordine), quindi viene inoltrato
   * prima che il canale si chiuda.
   */
  private onWorkletMessage(data: unknown): void {
    if (data === 'paused') {
      const flushed = this.onFlushed;
      this.onFlushed = null;
      flushed?.();
      return;
    }
    if (!this.forwarding) return;
    if (!(data instanceof Int16Array)) return;
    /*
     * Il buffer è stato trasferito dal worklet: si può passare al server così com'è,
     * senza copiarlo.
     *
     * Il controllo `instanceof ArrayBuffer` serve al compilatore: in TypeScript 5.7+
     * `data.buffer` ha tipo `ArrayBufferLike`, cioè **ArrayBuffer oppure
     * SharedArrayBuffer**, mentre il protocollo accetta solo il primo (un buffer
     * condiviso fra i due thread non avrebbe senso qui: il worklet lo trasferisce).
     * Il controllo restringe il tipo senza copie.
     */
    const buffer = data.buffer;
    if (!(buffer instanceof ArrayBuffer)) return;
    this.socket.emit('voice:chunk', buffer);
  }

  /** Chiude il microfono (e i nodi) se non si parla da un po'. */
  private touchIdle(): void {
    if (this.idleTimer !== null) window.clearTimeout(this.idleTimer);
    this.idleTimer = window.setTimeout(() => {
      this.idleTimer = null;
      if (this.forwarding || useAppStore.getState().voiceTalking) return;
      this.closeMic();
    }, MIC_IDLE_CLOSE_MS);
  }

  private closeMic(): void {
    if (this.idleTimer !== null) {
      window.clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    this.source?.disconnect();
    this.source = null;
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    this.stream = null;
    this.node?.port.postMessage('pause');
  }

  /* ------------------------------------------------------------------ */
  /* Riproduzione                                                        */
  /* ------------------------------------------------------------------ */

  /** Un blocco di voce da un altro giocatore: si accoda e si suona. */
  receive({ playerId, data }: VoiceAudioPayload): void {
    const ctx = audio.context;
    const voiceInput = audio.voiceInput;
    if (!ctx || !voiceInput) return;
    // Il server valida già le dimensioni: qui è solo una cintura in più, perché
    // un `byteLength` dispari farebbe lanciare `new Int16Array` in mezzo a un
    // evento del socket.
    if (data.byteLength === 0 || data.byteLength % 2 !== 0) return;
    const samples = new Int16Array(data);
    if (samples.length === 0) return;

    let state = this.playback.get(playerId);
    if (!state) {
      state = { nextTime: 0, gain: ctx.createGain() };
      state.gain.connect(voiceInput);
      this.playback.set(playerId, state);
    }

    const buffer = ctx.createBuffer(1, samples.length, VOICE_SAMPLE_RATE);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) channel[i] = samples[i]! / 32768;

    const now = ctx.currentTime;
    if (state.nextTime < now + PLAYBACK_LEAD_S) state.nextTime = now + PLAYBACK_LEAD_S;
    if (state.nextTime > now + PLAYBACK_MAX_LEAD_S) state.nextTime = now + PLAYBACK_LEAD_S;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(state.gain);
    source.start(state.nextTime);
    state.nextTime += buffer.duration;

    this.markSpeaking(playerId);
  }

  /** Segna che quel giocatore sta parlando e aggiorna l'indicatore. */
  private markSpeaking(playerId: string): void {
    this.lastChunkAt.set(playerId, performance.now());
    if (this.sweep !== null) return;
    // Un solo intervallo per tutti: si spegne da sé quando nessuno parla.
    this.sweep = window.setInterval(() => this.publishSpeakers(), 200);
    this.publishSpeakers();
  }

  /** Ricalcola chi sta parlando (silenzio oltre `VOICE_SILENCE_MS`) e lo pubblica. */
  private publishSpeakers(): void {
    const now = performance.now();
    const ids: string[] = [];
    for (const [playerId, at] of this.lastChunkAt) {
      if (now - at < VOICE_SILENCE_MS) ids.push(playerId);
      else this.lastChunkAt.delete(playerId);
    }
    if (this.sweep !== null && ids.length === 0) {
      window.clearInterval(this.sweep);
      this.sweep = null;
    }
    const key = ids.join(',');
    if (key === this.speakerKey) return;
    this.speakerKey = key;
    useAppStore.setState({ voiceSpeakers: ids });
  }

  /* ------------------------------------------------------------------ */
  /* Stato condiviso con l'interfaccia                                   */
  /* ------------------------------------------------------------------ */

  private setTalking(talking: boolean): void {
    useAppStore.setState({ voiceTalking: talking });
  }

  /** Avviso momentaneo accanto al tasto (permesso negato, canale pieno…). */
  private notice(text: string): void {
    useAppStore.setState({ voiceNotice: text });
    if (this.noticeTimer !== null) window.clearTimeout(this.noticeTimer);
    this.noticeTimer = window.setTimeout(() => {
      this.noticeTimer = null;
      useAppStore.setState({ voiceNotice: null });
    }, 4000);
  }

  private clearNotice(): void {
    if (this.noticeTimer !== null) {
      window.clearTimeout(this.noticeTimer);
      this.noticeTimer = null;
    }
    useAppStore.setState({ voiceNotice: null });
  }
}

/** Messaggio comprensibile per il motivo per cui il microfono non si apre. */
function micErrorMessage(err: unknown): string {
  const name = (err as { name?: string } | null)?.name ?? '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Permesso microfono negato: consentilo nelle impostazioni del browser.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'Nessun microfono trovato.';
  }
  if (name === 'NotReadableError') {
    return 'Microfono già in uso da un\'altra app.';
  }
  return 'Non riesco ad aprire il microfono.';
}

export const voiceChat = new VoiceChat();
