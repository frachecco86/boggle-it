/**
 * Registrazione delle clip audio personali (5 fasce di lunghezza parola).
 *
 * Usa `MediaRecorder` con il codec migliore disponibile: Opus in WebM (o
 * `audio/mp4` su Safari). A 32 kbps una clip da 3 secondi pesa ~12 KB, quindi
 * cinque clip stanno tranquillamente sotto i 100 KB.
 *
 * Le clip sono PERSONALI: ognuno registra le proprie. Il server le conserva per
 * il proprietario e, in multiplayer, le condivide con chi gioca nella stessa
 * stanza: quando un avversario trova una parola si sente la SUA clip (a volume
 * ridotto). Fuori dalla stanza restano inaccessibili.
 */
import type { SfxSlot } from '@boggle/shared';

/** Scegle il MIME migliore supportato dal browser. */
export function pickRecorderMime(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ];
  return candidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? null;
}

export function isRecordingSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== 'undefined'
  );
}

export interface Recording {
  dataUrl: string;
  mime: string;
  durationMs: number;
}

/**
 * Registratore a singola clip: `start()` apre il microfono, `stop()` chiude e
 * risolve con il data URL. Un'istanza per registrazione, per non lasciare mai
 * il microfono aperto.
 */
export class ClipRecorder {
  private recorder: MediaRecorder | null = null;
  private chunks: BlobPart[] = [];
  private stream: MediaStream | null = null;
  private startedAt = 0;
  private stopTimer: number | null = null;
  private stopped: Promise<Recording> | null = null;
  private resolveStopped: ((r: Recording) => void) | null = null;
  private rejectStopped: ((e: Error) => void) | null = null;

  get isRecording(): boolean {
    return this.recorder?.state === 'recording';
  }

  /** Apre il microfono e inizia a registrare. Lancia se non c'è permesso. */
  async start(maxDurationMs: number): Promise<void> {
    if (!isRecordingSupported()) throw new Error('Registrazione non supportata da questo browser');
    const mime = pickRecorderMime();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
    });
    this.stream = stream;
    this.chunks = [];
    this.startedAt = Date.now();
    this.recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.stopped = new Promise<Recording>((resolve, reject) => {
      this.resolveStopped = resolve;
      this.rejectStopped = reject;
    });
    this.recorder.onerror = () => this.rejectStopped?.(new Error('Errore durante la registrazione'));
    this.recorder.onstop = () => {
      this.releaseStream();
      void this.finish();
    };
    this.recorder.start();
    // Limite di sicurezza: mai clip più lunghe del previsto.
    this.stopTimer = window.setTimeout(() => this.stop(), maxDurationMs);
  }

  /** Ferma la registrazione e ritorna la clip. */
  async stop(): Promise<Recording> {
    if (this.stopTimer !== null) {
      window.clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }
    if (this.recorder?.state === 'recording') this.recorder.stop();
    if (this.stopped) return this.stopped;
    throw new Error('Nessuna registrazione in corso');
  }

  /** Annulla e libera la traccia (es. uscendo dalla pagina). */
  cancel(): void {
    if (this.stopTimer !== null) window.clearTimeout(this.stopTimer);
    this.stopTimer = null;
    if (this.recorder?.state === 'recording') {
      this.recorder.onstop = null;
      this.recorder.stop();
    }
    this.releaseStream();
    this.rejectStopped?.(new Error('Registrazione annullata'));
  }

  private async finish(): Promise<void> {
    const durationMs = Date.now() - this.startedAt;
    if (this.chunks.length === 0) {
      this.rejectStopped?.(new Error('Registrazione vuota'));
      return;
    }
    const blob = new Blob(this.chunks, { type: this.recorder?.mimeType || 'audio/webm' });
    const dataUrl = await blobToDataUrl(blob);
    this.resolveStopped?.({ dataUrl, mime: blob.type, durationMs });
  }

  private releaseStream(): void {
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    this.stream = null;
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Lettura audio non riuscita'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Suona una clip personale, con fallback sull'effetto sintetizzato.
 * Usata per le clip del proprietario e per quelle degli avversari (banche
 * separate, vedi `AudioEngine.opponentSfx`).
 */
export class PersonalSfx {
  private readonly cache = new Map<string, HTMLAudioElement>();

  /** Registra in cache l'URL della clip (con cache-busting) per una fascia. */
  set(slot: SfxSlot, url: string): void {
    this.cache.delete(slot);
    this.cache.set(slot, new Audio(url));
  }

  clear(slot: SfxSlot): void {
    this.cache.delete(slot);
  }

  clearAll(): void {
    this.cache.clear();
  }

  has(slot: SfxSlot): boolean {
    return this.cache.has(slot);
  }

  /** Suona la clip personale della fascia, se presente. true = ha suonato. */
  play(slot: SfxSlot, volume: number): boolean {
    const el = this.cache.get(slot);
    if (!el) return false;
    try {
      el.currentTime = 0;
      el.volume = Math.max(0, Math.min(1, volume));
      void el.play().catch(() => undefined);
      return true;
    } catch {
      return false;
    }
  }
}

/** Fascia di lunghezza per una parola trovata. */
export function slotForLength(length: number): SfxSlot {
  if (length <= 3) return '3';
  if (length === 4) return '4';
  if (length === 5) return '5';
  if (length === 6) return '6';
  return '7plus';
}
