/**
 * Cattura della voce per il "tieni premuto per parlare" (AudioWorklet).
 *
 * Perché un worklet e non `MediaRecorder`: `MediaRecorder` consegna l'audio a
 * pacchetti chiusi (una clip intera o frammenti non decodificabili da soli),
 * quindi il ritardo minimo è la durata della clip. Qui invece i campioni escono
 * **mentre** si parla: si accumulano 64 ms, si mandano, e chi ascolta li accoda.
 * Il risultato è una conversazione con ~200 ms di ritardo, non un walkie-talkie.
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

class VoiceCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // Quanti campioni di ingresso servono per un campione a 16 kHz (3 a 48 kHz).
    this.ratio = sampleRate / WORKLET_SAMPLE_RATE;
    this.chunk = new Int16Array(WORKLET_CHUNK_SAMPLES);
    this.filled = 0;
    // Accumulatore del filtro a media mobile: è anche il filtro anti-aliasing
    // della decimazione (senza, le "s" fischiano).
    this.sum = 0;
    this.count = 0;
    this.step = 0;
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

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel || !this.running) return true;

    for (let i = 0; i < channel.length; i++) {
      this.sum += channel[i];
      this.count++;
      this.step++;
      if (this.step < this.ratio) continue;

      // Un campione di uscita: media del gruppo, scalata in Int16.
      const value = this.sum / this.count;
      this.step -= this.ratio;
      this.sum = 0;
      this.count = 0;
      const clamped = value > 1 ? 1 : value < -1 ? -1 : value;
      this.chunk[this.filled++] = Math.round(clamped * 32767);
      if (this.filled === WORKLET_CHUNK_SAMPLES) this.flush();
    }
    return true;
  }
}

registerProcessor('voice-capture', VoiceCaptureProcessor);
