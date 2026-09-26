/**
 * Cattura della voce per il "tieni premuto per parlare" (AudioWorklet).
 *
 * Perché un worklet e non `MediaRecorder`: `MediaRecorder` consegna l'audio a
 * pacchetti chiusi (una clip intera o frammenti non decodificabili da soli),
 * quindi il ritardo minimo è la durata della clip. Qui invece i campioni escono
 * **mentre** si parla: si accumulano 64 ms, si mandano, e chi ascolta li accoda.
 *
 * QUALITÀ DEL CAMPIONAMENTO (perché non basta una media):
 * il microfono di norma gira a 48 kHz, il canale voce a 16 kHz. Ridurre la
 * frequenza senza un filtro adeguato produce **aliasing** (le frequenze sopra gli
 * 8 kHz si ribaltano nello spettro) e la voce "gracchia". La prima versione
 * faceva la media di 2–3 campioni: a 48 kHz il rapporto è 3 esatto e va bene, ma
 * a 44,1 kHz è 2,756 e la finestra cambiava di lunghezza (2 o 3 campioni), con
 * un'increspatura periodica = distorsione. Qui:
 *  1. un **filtro passa-basso Butterworth del 4° ordine** (due biquad in cascata)
 *     a 0,45 · 16 kHz taglia tutto ciò che non sta nel canale;
 *  2. un **un alto-passo a un polo** a ~80 Hz toglie i tonfi e la continua;
 *  3. la decimazione è una **interpolazione lineare a fase continua**: si emette
 *     un campione alla volta al momento giusto, senza increspature.
 * Il costo è qualche moltiplicazione in più per campione (irrilevante: sono
 * ~48k campioni/s), il guadagno è una voce pulita.
 *
 * Questo file è un **asset**, non un modulo del bundle: lo carica
 * `audioWorklet.addModule()`. Per questo non importa nulla (nel contesto dei
 * worklet gli import non sono affidabili) e le due costanti qui sotto sono una
 * copia di quelle condivise (`VOICE_SAMPLE_RATE`, `VOICE_CHUNK_SAMPLES`): il test
 * `voiceCapture.test.ts` verifica che non divergano.
 *
 * Protocollo con la pagina:
 *  - riceve `'resume'` → comincia a mandare pacchetti;
 *  - riceve `'pause'`  → smette, manda l'ultimo pacchetto parziale e risponde
 *    `'paused'`. La risposta serve a chi aspetta: garantisce che il pacchetto
 *    finale sia stato consegnato PRIMA di chiudere il canale sul server,
 *    altrimenti l'ultima sillaba andrebbe persa.
 */

const WORKLET_SAMPLE_RATE = 16000;
const WORKLET_CHUNK_SAMPLES = 1024;

/** Coefficienti di un biquad (sezione del 2° ordine), forma diretta II trasposta. */
function lowpassBiquad(sampleRate, cutoff, q) {
  const w0 = (2 * Math.PI * cutoff) / sampleRate;
  const cosW0 = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  const a0 = 1 + alpha;
  return {
    b0: ((1 - cosW0) / 2) / a0,
    b1: (1 - cosW0) / a0,
    b2: ((1 - cosW0) / 2) / a0,
    a1: (-2 * cosW0) / a0,
    a2: (1 - alpha) / a0,
    // Stato della sezione (forma diretta II trasposta).
    s1: 0,
    s2: 0,
  };
}

/** Applica una sezione biquad al campione `x`, aggiornando il suo stato interno. */
function biquad(c, x) {
  const y = c.b0 * x + c.s1;
  c.s1 = c.b1 * x - c.a1 * y + c.s2;
  c.s2 = c.b2 * x - c.a2 * y;
  return y;
}

/** Filtro a un polo (alto-passo): toglie continua e tonfi del microfono. */
function highpassPole(sampleRate, cutoff) {
  const rc = 1 / (2 * Math.PI * cutoff);
  const dt = 1 / sampleRate;
  const alpha = rc / (rc + dt);
  return alpha;
}

class VoiceCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // Quanti campioni di ingresso servono per un campione a 16 kHz (3 a 48 kHz).
    this.ratio = sampleRate / WORKLET_SAMPLE_RATE;

    /*
     * Passa-basso Butterworth del 4° ordine = due biquad con i Q canonici.
     * Taglio a 0,45 · 16 kHz = 7,2 kHz: dentro il canale voce, sotto il Nyquist
     * di destinazione (8 kHz), così non resta niente da ribaltare.
     */
    const cutoff = 0.45 * WORKLET_SAMPLE_RATE;
    this.lp1 = lowpassBiquad(sampleRate, cutoff, 0.5411961);
    this.lp2 = lowpassBiquad(sampleRate, cutoff, 1.306563);
    // Memoria dell'alto-passo a un polo.
    this.hpAlpha = highpassPole(sampleRate, 80);
    this.hpPrevIn = 0;
    this.hpPrevOut = 0;

    /*
     * Decimazione a fase continua: `nextAt` è la posizione (in campioni di
     * ingresso) del prossimo campione da emettere; `prev` è il campione filtrato
     * precedente, per l'interpolazione lineare.
     */
    this.nextAt = 0;
    this.inputIndex = 0;
    this.prev = 0;

    this.chunk = new Int16Array(WORKLET_CHUNK_SAMPLES);
    this.filled = 0;
    this.running = false;
    this.port.onmessage = (event) => {
      const message = event.data;
      if (message === 'resume') {
        this.running = true;
        return;
      }
      if (message === 'pause') {
        this.running = false;
        this.flush();
        // Conferma: il messaggio audio è stato inviato prima di questo.
        this.port.postMessage('paused');
      }
    };
  }

  /** Manda il pacchetto parziale, se c'è qualcosa da mandare. */
  flush() {
    if (this.filled === 0) return;
    // `slice` copia: il buffer trasferito non deve essere riusato qui.
    const out = this.chunk.slice(0, this.filled);
    this.filled = 0;
    this.port.postMessage(out, [out.buffer]);
  }

  /** Mette un campione nel pacchetto, inviandolo quando è pieno. */
  push(value) {
    const clamped = value > 1 ? 1 : value < -1 ? -1 : value;
    this.chunk[this.filled++] = Math.round(clamped * 32767);
    if (this.filled === WORKLET_CHUNK_SAMPLES) this.flush();
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel || !this.running) return true;

    for (let i = 0; i < channel.length; i++) {
      // 1. Alto-passo a un polo (toglie continua/tonfi).
      const x0 = channel[i];
      const hp = this.hpAlpha * (this.hpPrevOut + x0 - this.hpPrevIn);
      this.hpPrevIn = x0;
      this.hpPrevOut = hp;

      // 2. Passa-basso del 4° ordine in cascata (anti-aliasing).
      const filtered = biquad(this.lp2, biquad(this.lp1, hp));

      // 3. Emette i campioni di uscita la cui posizione è stata raggiunta,
      //    interpolando fra il campione precedente e questo.
      while (this.nextAt <= this.inputIndex) {
        const frac = this.nextAt - (this.inputIndex - 1);
        const t = frac < 0 ? 0 : frac > 1 ? 1 : frac;
        this.push(this.prev + (filtered - this.prev) * t);
        this.nextAt += this.ratio;
      }

      this.prev = filtered;
      this.inputIndex++;
    }
    return true;
  }
}

registerProcessor('voice-capture', VoiceCaptureProcessor);
