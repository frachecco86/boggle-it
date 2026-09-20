/**
 * Motore audio: effetti sintetizzati (Web Audio API) + musica di sottofondo.
 *
 * Perché sintesi e non file: zero asset da scaricare, zero licenze da verificare,
 * latenza nulla. Eccetto la musica, che è un loop CC0 reale (~231 KB).
 *
 * Tutto è "lazy": l'AudioContext viene creato al primo gesto utente (policy dei browser),
 * e nulla suona finché l'utente non interagisce.
 */

export type SfxKind =
  | 'word-3'
  | 'word-4'
  | 'word-5'
  | 'word-6'
  | 'word-7plus'
  | 'already-found'
  | 'invalid'
  | 'tap'
  | 'opponent';

export interface AudioSettings {
  sfxEnabled: boolean;
  musicEnabled: boolean;
  sfxVolume: number;
  musicVolume: number;
}

const DEFAULT_SETTINGS: AudioSettings = {
  sfxEnabled: true,
  musicEnabled: true,
  sfxVolume: 0.6,
  musicVolume: 0.28,
};

// "Happy Adventure" di TinyWorlds (CC0) — 8-bit allegro ma leggero, in loop.
const MUSIC_SRC = '/audio/music-happy.mp3';

/**
 * Frequenze dei motivi per lunghezza parola.
 * Scale pentatonica: qualsiasi combinazione suona consonante.
 * 3 → nota singola, 4 → intervallo, 5 → arpeggio, 6 → accordo, 7+ → accordo + sparkle.
 */
const SUCCESS_MOTIFS: Record<Exclude<SfxKind, 'already-found' | 'invalid' | 'tap' | 'opponent'>, number[]> = {
  'word-3': [523.25],                       // C5
  'word-4': [523.25, 659.25],               // C5 E5
  'word-5': [523.25, 659.25, 783.99],       // C5 E5 G5
  'word-6': [523.25, 659.25, 783.99, 1046.5], // + C6
  'word-7plus': [523.25, 659.25, 783.99, 1046.5, 1318.5], // + E6
};

const ALREADY_FOUND_NOTES = [392.0, 311.13]; // G4 → Eb4 (discendente, "già sentito")
const INVALID_NOTES = [174.61, 155.56];      // F3 → Eb3 (basso, morbido)

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private musicEl: HTMLAudioElement | null = null;
  private musicSource: MediaElementAudioSourceNode | null = null;
  private settings: AudioSettings = { ...DEFAULT_SETTINGS };
  private unlocked = false;

  /** Crea il contesto audio. Va chiamato dopo un gesto utente. */
  unlock(): void {
    if (this.unlocked) {
      void this.ctx?.resume();
      return;
    }
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 1;
      this.masterGain.connect(this.ctx.destination);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.settings.sfxVolume;
      this.sfxGain.connect(this.masterGain);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0;
      this.musicGain.connect(this.masterGain);

      this.unlocked = true;
      void this.ctx.resume();
      // Se la musica era attiva, avviala ora che il contesto esiste.
      if (this.settings.musicEnabled) this.startMusic();
    } catch {
      // audio non disponibile: il gioco funziona comunque
    }
  }

  get isUnlocked(): boolean {
    return this.unlocked;
  }

  getSettings(): AudioSettings {
    return { ...this.settings };
  }

  setSettings(next: Partial<AudioSettings>): void {
    this.settings = { ...this.settings, ...next };
    if (this.sfxGain && this.ctx) {
      this.sfxGain.gain.setTargetAtTime(this.settings.sfxVolume, this.ctx.currentTime, 0.05);
    }
    if (this.musicGain && this.ctx) {
      const target = this.settings.musicEnabled ? this.settings.musicVolume : 0;
      this.musicGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.4);
    }
    if (this.settings.musicEnabled && this.unlocked) this.startMusic();
  }

  /* ------------------------------------------------------------------ */
  /* Effetti                                                             */
  /* ------------------------------------------------------------------ */

  play(kind: SfxKind): void {
    if (!this.settings.sfxEnabled || !this.unlocked || !this.ctx) return;
    switch (kind) {
      case 'word-3':
      case 'word-4':
      case 'word-5':
      case 'word-6':
      case 'word-7plus':
        this.playSuccess(SUCCESS_MOTIFS[kind], kind === 'word-7plus');
        break;
      case 'already-found':
        this.playSequence(ALREADY_FOUND_NOTES, { type: 'triangle', noteMs: 190, gain: 0.16 });
        break;
      case 'invalid':
        this.playInvalid();
        break;
      case 'tap':
        this.playTap();
        break;
      case 'opponent':
        this.playOpponent();
        break;
    }
  }

  /** Sceglie l'effetto giusto per una parola trovata. */
  playWordFound(length: number): void {
    if (length >= 7) return this.play('word-7plus');
    if (length === 6) return this.play('word-6');
    if (length === 5) return this.play('word-5');
    if (length === 4) return this.play('word-4');
    return this.play('word-3');
  }

  /** Nota singola breve: selezione di una lettera. */
  private playTap(): void {
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(1180, now + 0.06);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.1, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
    osc.connect(gain).connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.11);
  }

  /** Motivo ascendente per la parola corretta. */
  private playSuccess(freqs: number[], sparkle: boolean): void {
    if (!this.ctx || !this.sfxGain) return;
    const noteMs = 85;
    freqs.forEach((freq, i) => {
      const start = this.ctx!.currentTime + (i * noteMs) / 1000;
      this.blip(freq, start, noteMs / 1000, 'triangle', 0.19);
      // Armonica leggera: rende il suono più "pieno" senza alzare il volume.
      this.blip(freq * 2, start, (noteMs / 1000) * 0.7, 'sine', 0.06);
    });
    if (sparkle) {
      const base = this.ctx.currentTime + (freqs.length * noteMs) / 1000;
      [1567.98, 2093.0].forEach((f, i) => this.blip(f, base + i * 0.07, 0.22, 'sine', 0.07));
    }
  }

  /** Sequenza discendente "già trovata". */
  private playSequence(
    freqs: number[],
    opts: { type: OscillatorType; noteMs: number; gain: number },
  ): void {
    if (!this.ctx) return;
    freqs.forEach((freq, i) => {
      const start = this.ctx!.currentTime + (i * opts.noteMs) / 1000;
      this.blip(freq, start, opts.noteMs / 1000, opts.type, opts.gain);
    });
  }

  /** Tono basso e morbido per l'errore: non sgradevole, non punitivo. */
  private playInvalid(): void {
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(INVALID_NOTES[0]!, now);
    osc.frequency.exponentialRampToValueAtTime(INVALID_NOTES[1]!, now + 0.18);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.15, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.26);
    osc.connect(filter).connect(gain).connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.3);
  }

  /** Piccolo "ding" quando un avversario trova una parola. */
  private playOpponent(): void {
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    [1046.5, 1318.5].forEach((freq, i) => this.blip(freq, now + i * 0.06, 0.16, 'sine', 0.09));
  }

  /** Oscillatore con envelope: mattone di tutti gli effetti. */
  private blip(
    freq: number,
    startTime: number,
    duration: number,
    type: OscillatorType,
    peak: number,
  ): void {
    if (!this.ctx || !this.sfxGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(peak, startTime + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    osc.connect(gain).connect(this.sfxGain);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.02);
  }

  /* ------------------------------------------------------------------ */
  /* Musica                                                             */
  /* ------------------------------------------------------------------ */

  /** Avvia (o riprende) la musica di sottofondo, con fade-in. */
  startMusic(): void {
    if (!this.settings.musicEnabled || !this.ctx || !this.musicGain) return;
    if (!this.musicEl) {
      this.musicEl = new Audio(MUSIC_SRC);
      this.musicEl.loop = true;
      this.musicEl.preload = 'auto';
      this.musicEl.crossOrigin = 'anonymous';
      try {
        this.musicSource = this.ctx.createMediaElementSource(this.musicEl);
        this.musicSource.connect(this.musicGain);
      } catch {
        // Se il routing fallisce, usiamo il volume dell'elemento.
        this.musicEl.volume = this.settings.musicVolume;
        void this.musicEl.play().catch(() => undefined);
        return;
      }
    }
    void this.musicEl.play().catch(() => undefined);
    this.musicGain.gain.setTargetAtTime(this.settings.musicVolume, this.ctx.currentTime, 0.8);
  }

  pauseMusic(): void {
    if (this.musicEl) this.musicEl.pause();
    if (this.musicGain && this.ctx) {
      this.musicGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
    }
  }

  stopMusic(): void {
    if (this.musicEl) {
      this.musicEl.pause();
      this.musicEl.currentTime = 0;
    }
  }

  /** Nota ambient per gli sfondi/atmosfera (usata al cambio difficoltà). */
  playAmbientTone(rootHz: number): void {
    if (!this.settings.musicEnabled || !this.ctx || !this.musicGain) return;
    const now = this.ctx.currentTime;
    [rootHz, rootHz * 1.5].forEach((freq, i) => {
      this.blip(freq, now + i * 0.12, 1.6, 'sine', 0.05);
    });
  }
}

/** Istanza condivisa: un solo AudioContext per tutta l'app. */
export const audio = new AudioEngine();

/** Bootstrap audio al primo gesto utente (una sola volta). */
export function installAudioUnlock(): () => void {
  const handler = () => {
    audio.unlock();
    window.removeEventListener('pointerdown', handler);
    window.removeEventListener('keydown', handler);
    window.removeEventListener('touchstart', handler);
  };
  window.addEventListener('pointerdown', handler, { once: false });
  window.addEventListener('keydown', handler, { once: false });
  window.addEventListener('touchstart', handler, { once: false });
  return () => {
    window.removeEventListener('pointerdown', handler);
    window.removeEventListener('keydown', handler);
    window.removeEventListener('touchstart', handler);
  };
}

export { DEFAULT_SETTINGS };
