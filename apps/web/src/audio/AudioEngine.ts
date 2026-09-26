/**
 * Motore audio: effetti sintetizzati (Web Audio API) + musica di sottofondo.
 *
 * Musica: tracce REALI royalty-free incluse nel bundle (vedi shared/music.ts),
 * non generate sinteticamente. In multiplayer l'host scegle la traccia per
 * tutta la stanza; in single player si usa la preferenza del profilo.
 *
 * Clip personali: se il profilo ha registrato un suono per la fascia di
 * lunghezza, `playWordFound` lo usa al posto della sintesi (vedi PersonalSfx).
 * In multiplayer si sente anche la clip dell'AVVERSARIO che ha trovato la
 * parola, a metà volume: le sue registrazioni vengono scaricate all'ingresso
 * in stanza e tenute in una banca separata (`setOpponentClips`).
 *
 * Tutto e' "lazy": l'AudioContext viene creato al primo gesto utente (policy dei browser),
 * e nulla suona finche' l'utente non interagisce.
 */
import {
  DEFAULT_MUSIC_CATALOG,
  DEFAULT_MUSIC_ID,
  findMusicTrack,
  musicTrack,
  type MusicChoice,
  type MusicTrackMeta,
} from '@boggle/shared';
import { PersonalSfx, slotForLength } from '../game/audioRecorder.js';

export type SfxKind =
  | 'word-3'
  | 'word-4'
  | 'word-5'
  | 'word-6'
  | 'word-7plus'
  | 'already-found'
  | 'invalid'
  | 'tap'
  /* Countdown di inizio round: tre… due… uno… via! */
  | 'countdown-tick'
  | 'countdown-go';

export interface AudioSettings {
  sfxEnabled: boolean;
  musicEnabled: boolean;
  sfxVolume: number;
  musicVolume: number;
  /**
   * Volume delle VOCI della stanza (multiplayer).
   *
   * Separato dagli altri due: le voci non devono essere zittite dal muto degli
   * effetti e nemmeno seguire il volume della musica. Sta sotto il master, così
   * resta un solo volume generale.
   */
  voiceVolume: number;
  /**
   * Traccia musicale attiva: id di una traccia del catalogo, oppure `'none'`.
   * Gli id non sono più solo quelli inclusi nel bundle: l'admin può aggiungere
   * tracce a runtime, quindi è una stringa.
   */
  musicTrack: MusicChoice;
}

const DEFAULT_SETTINGS: AudioSettings = {
  sfxEnabled: true,
  musicEnabled: true,
  sfxVolume: 0.6,
  musicVolume: 0.28,
  voiceVolume: 1,
  musicTrack: DEFAULT_MUSIC_ID,
};

/**
 * Frequenze dei motivi per lunghezza parola.
 * Scale pentatonica: qualsiasi combinazione suona consonante.
 * 3 → nota singola, 4 → intervallo, 5 → arpeggio, 6 → accordo, 7+ → accordo + sparkle.
 */
const SUCCESS_MOTIFS: Record<
  Exclude<SfxKind, 'already-found' | 'invalid' | 'tap' | 'countdown-tick' | 'countdown-go'>,
  number[]
> = {
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
  /**
   * Ingresso delle VOCI della stanza (multiplayer).
   *
   * Sta sotto il master come musica ed effetti, così il volume generale resta
   * uno solo, ma è separato da `sfxGain`: le voci non devono essere zittite dal
   * muto degli effetti né dal volume degli effetti.
   */
  private voiceGain: GainNode | null = null;
  private musicEl: HTMLAudioElement | null = null;
  private musicSource: MediaElementAudioSourceNode | null = null;
  private settings: AudioSettings = { ...DEFAULT_SETTINGS };
  private unlocked = false;
  /** Clip personali del profilo, indicizzate per fascia di lunghezza. */
  private readonly personalSfx = new PersonalSfx();
  /**
   * Clip audio degli AVVERSARI, indicizzate per id giocatore della stanza.
   *
   * In multiplayer si sente la registrazione di chi ha trovato la parola, non la
   * propria: il client scarica le clip dei compagni di stanza (vedi store) e le
   * registra qui. Restano separate da `personalSfx` per non sovrascrivere mai le
   * proprie con quelle di un altro giocatore.
   */
  private readonly opponentSfx = new Map<string, PersonalSfx>();
  /**
   * Volume delle esultanze proprie (parola trovata).
   *
   * 0.5 = metà di quanto suonavano prima: le esultanze dei giocatori erano
   * troppo invadenti, soprattutto in multiplayer dove se ne sommano molte.
   */
  private static readonly CELEBRATION_VOLUME_SCALE = 0.5;
  /**
   * Volume con cui si sentono le esultanze degli AVVERSARI: metà della metà.
   *
   * Si applica sia alla clip registrata dall'avversario sia al motivo
   * sintetizzato quando l'avversario non ha registrato quella fascia. Così le
   * parole degli altri si distinguono a colpo d'orecchio dalle proprie e non
   * coprono la propria partita.
   */
  private static readonly OPPONENT_VOLUME_SCALE = 0.25;
  /** Traccia attualmente caricata (per capire quando cambiarla). */
  private loadedTrack: MusicChoice | null = null;
  /** Catalogo corrente: tracce incluse + quelle caricate dall'admin. */
  private catalog: MusicTrackMeta[] = [...DEFAULT_MUSIC_CATALOG];

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

      this.voiceGain = this.ctx.createGain();
      this.voiceGain.gain.value = this.settings.voiceVolume;
      this.voiceGain.connect(this.masterGain);

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

  /**
   * Il contesto audio condiviso, o `null` se l'audio non è ancora sbloccato.
   *
   * Serve a chi riproduce audio fuori dal motore — oggi le voci della stanza —
   * per non creare un secondo `AudioContext`: due contesti sullo stesso telefono
   * si contendono l'uscita audio e vanno sbloccati entrambi al primo gesto.
   */
  get context(): AudioContext | null {
    return this.ctx;
  }

  /** Ingresso a cui collegare le voci dei giocatori (null finché non sbloccato). */
  get voiceInput(): GainNode | null {
    return this.voiceGain;
  }

  getSettings(): AudioSettings {
    return { ...this.settings };
  }

  /* ------------------------------------------------------------------ */
  /* Clip personali del profilo                                         */
  /* ------------------------------------------------------------------ */

  /** Registra le clip del profilo attivo (chiamata dopo il login o il refresh). */
  setPersonalClips(clips: Array<{ slot: Parameters<PersonalSfx['set']>[0]; url: string }>): void {
    this.personalSfx.clearAll();
    for (const clip of clips) this.personalSfx.set(clip.slot, clip.url);
  }

  setPersonalClip(slot: Parameters<PersonalSfx['set']>[0], url: string): void {
    this.personalSfx.set(slot, url);
  }

  clearPersonalClip(slot: Parameters<PersonalSfx['set']>[0]): void {
    this.personalSfx.clear(slot);
  }

  /**
   * Registra le clip di un AVVERSARIO (o le aggiorna tutte se già presenti).
   * Chiamare con un elenco vuoto equivale a rimuoverle.
   */
  setOpponentClips(
    playerId: string,
    clips: Array<{ slot: Parameters<PersonalSfx['set']>[0]; url: string }>,
  ): void {
    const bank = new PersonalSfx();
    for (const clip of clips) bank.set(clip.slot, clip.url);
    this.opponentSfx.set(playerId, bank);
  }

  /** Dimentica le clip di un avversario (uscito dalla stanza). */
  clearOpponentClips(playerId: string): void {
    this.opponentSfx.delete(playerId);
  }

  /** Dimentica tutti gli avversari (uscita dalla stanza, cambio profilo). */
  clearAllOpponentClips(): void {
    this.opponentSfx.clear();
  }

  setSettings(next: Partial<AudioSettings>): void {
    /*
     * Igiene dei numeri: le preferenze salvate da una versione precedente del
     * gioco non hanno `voiceVolume`. Senza questo controllo il valore sarebbe
     * `undefined` e `setTargetAtTime(undefined)` porterebbe il guadagno a NaN
     * (audio muto e non più recuperabile senza ricaricare la pagina).
     */
    const merged = { ...this.settings, ...next };
    const num = (v: number | undefined, fallback: number) =>
      typeof v === 'number' && Number.isFinite(v) ? v : fallback;
    this.settings = {
      ...merged,
      sfxVolume: num(merged.sfxVolume, DEFAULT_SETTINGS.sfxVolume),
      musicVolume: num(merged.musicVolume, DEFAULT_SETTINGS.musicVolume),
      voiceVolume: num(merged.voiceVolume, DEFAULT_SETTINGS.voiceVolume),
    };
    if (this.sfxGain && this.ctx) {
      this.sfxGain.gain.setTargetAtTime(this.settings.sfxVolume, this.ctx.currentTime, 0.05);
    }
    if (this.musicGain && this.ctx) {
      const target = this.settings.musicEnabled ? this.settings.musicVolume : 0;
      this.musicGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.4);
    }
    if (this.voiceGain && this.ctx) {
      this.voiceGain.gain.setTargetAtTime(this.settings.voiceVolume, this.ctx.currentTime, 0.05);
    }
    if (this.settings.musicEnabled && this.unlocked) this.startMusic();
  }

  /**
   * Aggiorna il catalogo musicale (tracce incluse + caricate dall'admin).
   *
   * Se la traccia attiva non esiste più (l'admin l'ha cancellata) si torna alla
   * predefinita: senza questo il player resterebbe puntato a un file 404.
   */
  setMusicCatalog(tracks: MusicTrackMeta[]): void {
    if (tracks.length === 0) return;
    this.catalog = tracks;
    if (this.settings.musicTrack !== 'none' && !findMusicTrack(tracks, this.settings.musicTrack)) {
      this.settings = { ...this.settings, musicTrack: tracks[0]!.id };
      this.reloadMusicTrack();
      return;
    }
    // La traccia esiste ancora: se il file è cambiato (nuova versione) ricarica.
    if (this.musicEl) this.reloadMusicTrack();
  }

  /** Catalogo corrente (per l'interfaccia). */
  getCatalog(): MusicTrackMeta[] {
    return [...this.catalog];
  }

  /**
   * Passa alla traccia successiva del catalogo (tasto ⏭).
   *
   * Se la musica è spenta la attiva: il tasto serve a "mettere su qualcosa",
   * non solo a saltare una traccia già in riproduzione.
   */
  nextMusicTrack(): MusicChoice {
    const tracks = this.catalog;
    if (tracks.length === 0) return this.settings.musicTrack;
    const currentIdx = tracks.findIndex((t) => t.id === this.settings.musicTrack);
    const next = tracks[(currentIdx + 1) % tracks.length]!;
    const wasDisabled = !this.settings.musicEnabled;
    this.settings = { ...this.settings, musicTrack: next.id };
    if (wasDisabled) {
      this.setSettings({ musicEnabled: true });
    } else {
      this.reloadMusicTrack();
    }
    return next.id;
  }

  /**
   * Cambia la traccia musicale mantenendo il contesto audio.
   * Chiamata quando l'host cambia musica in stanza, o quando cambia la preferenza.
   */
  setMusicTrack(track: MusicChoice): void {
    if (this.settings.musicTrack === track) return;
    this.settings = { ...this.settings, musicTrack: track };
    this.reloadMusicTrack();
  }

  /** Ricrea l'elemento audio se la traccia attiva è cambiata. */
  private reloadMusicTrack(): void {
    const wanted = this.settings.musicTrack;
    if (this.loadedTrack === wanted) return;
    this.loadedTrack = wanted;
    const wasPlaying = this.musicEl ? !this.musicEl.paused : false;
    if (this.musicEl) {
      this.musicEl.pause();
      this.musicSource?.disconnect();
      this.musicSource = null;
      this.musicEl = null;
    }
    if (wanted === 'none') return;
    if (!this.settings.musicEnabled || !this.unlocked) return;
    this.startMusic();
    const element = this.currentMusicElement();
    if (wasPlaying && element) void element.play().catch(() => undefined);
  }

  /**
   * Legge l'elemento musicale evitando il narrowing di TypeScript: `startMusic()`
   * può riassegnarlo, quindi va riletto dopo la chiamata.
   */
  private currentMusicElement(): HTMLAudioElement | null {
    return this.musicEl;
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
      case 'countdown-tick':
        this.playCountdownTick();
        break;
      case 'countdown-go':
        this.playCountdownGo();
        break;
    }
  }

  /**
   * Sceglie l'effetto per una parola trovata dal GIOCATORE STESSO.
   * Se il profilo ha registrato una clip per quella fascia, suona quella;
   * altrimenti usa il motivo sintetizzato.
   */
  playWordFound(length: number): void {
    if (!this.settings.sfxEnabled) return;
    // La vibrazione accompagna solo le parole proprie: vibrare anche per quelle
    // degli avversari renderebbe impossibile distinguere i due eventi al tatto.
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate?.(30);
    }
    const slot = slotForLength(length);
    const scale = AudioEngine.CELEBRATION_VOLUME_SCALE;
    if (this.personalSfx.play(slot, this.settings.sfxVolume * scale)) return;
    this.playSuccessMotif(length, scale, true);
  }

  /**
   * Esultanza di un AVVERSARIO, a volume ridotto (metà del proprio).
   *
   * Con `playerId` si suona la SUA clip registrata, per la fascia della parola
   * trovata; se non l'ha registrata (o non è ancora stata scaricata) si ricade
   * sul motivo sintetizzato. In entrambi i casi il volume è dimezzato, così le
   * parole degli altri non si confondono con le proprie.
   *
   * IMPORTANTE: mai la clip di chi ascolta. Era il bug: l'avversario trovava una
   * parola e si sentiva la PROPRIA registrazione, perché il fallback passava da
   * `playWordFound` (che suona le clip del profilo attivo).
   */
  playOpponentWord(length: number, playerId?: string): void {
    if (!this.settings.sfxEnabled) return;
    const scale = AudioEngine.OPPONENT_VOLUME_SCALE;
    const slot = slotForLength(length);
    if (playerId) {
      const bank = this.opponentSfx.get(playerId);
      // La clip dell'avversario suona solo se ESISTE: altrimenti si passa al
      // motivo sintetizzato, sempre a volume ridotto.
      if (bank?.play(slot, this.settings.sfxVolume * scale)) return;
    }
    this.playSuccessMotif(length, scale, false);
  }

  /**
   * Motivo sintetizzato per una parola trovata, per fascia di lunghezza.
   * `volumeScale` riduce il volume (0.5 per le parole degli avversari).
   */
  private playSuccessMotif(length: number, volumeScale: number, sparkle = false): void {
    // I motivi sono per lunghezza: si sceglie quello e si scala il volume.
    const motif =
      length >= 7
        ? SUCCESS_MOTIFS['word-7plus']
        : length === 6
          ? SUCCESS_MOTIFS['word-6']
          : length === 5
            ? SUCCESS_MOTIFS['word-5']
            : length === 4
              ? SUCCESS_MOTIFS['word-4']
              : SUCCESS_MOTIFS['word-3'];
    if (!this.unlocked || !this.ctx) return;
    // Lo sparkle finale (parole da 7+ lettere) solo per le parole proprie.
    this.playSuccess(motif, sparkle && length >= 7, volumeScale);
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
  private playSuccess(freqs: number[], sparkle: boolean, volumeScale = 1): void {
    if (!this.ctx || !this.sfxGain) return;
    const noteMs = 85;
    freqs.forEach((freq, i) => {
      const start = this.ctx!.currentTime + (i * noteMs) / 1000;
      this.blip(freq, start, noteMs / 1000, 'triangle', 0.19 * volumeScale);
      // Armonica leggera: rende il suono più "pieno" senza alzare il volume.
      this.blip(freq * 2, start, (noteMs / 1000) * 0.7, 'sine', 0.06 * volumeScale);
    });
    if (sparkle) {
      const base = this.ctx.currentTime + (freqs.length * noteMs) / 1000;
      [1567.98, 2093.0].forEach((f, i) =>
        this.blip(f, base + i * 0.07, 0.22, 'sine', 0.07 * volumeScale),
      );
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

  /**
   * Tick del countdown: nota breve, acuta e secca. Il tono SALE a ogni numero,
   * così si percepisce l'avvicinarsi della partenza (come nei giochi veri).
   */
  private playCountdownTick(): void {
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    // Il numero corrente non è noto qui: due note alternate creano comunque
    // una sensazione di progressione.
    const notes = [659.25, 783.99]; // E5, G5
    const freq = notes[this.countdownStep % notes.length]!;
    this.countdownStep++;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.22, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    osc.connect(gain).connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.25);
    // Armonica: dà corpo al tick senza alzare il volume.
    this.blip(freq * 2, now, 0.12, 'sine', 0.06);
  }

  /** "Via!": accordo ascendente che segnala l'inizio della partita. */
  private playCountdownGo(): void {
    if (!this.ctx || !this.sfxGain) return;
    this.countdownStep = 0; // pronto per il prossimo countdown
    const now = this.ctx.currentTime;
    // Do-Mi-Sol-Do: accordo maggiore brillante.
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      this.blip(freq, now + i * 0.06, 0.45, 'triangle', 0.2);
    });
    // Sparkle finale.
    [1567.98, 2093.0].forEach((f, i) => this.blip(f, now + 0.24 + i * 0.07, 0.3, 'sine', 0.08));
  }

  /**
   * Tick degli ultimi 10 secondi del round: un suono per secondo, con tono
   * CRESCENTE, così si percepisce che il tempo sta finendo senza dover guardare.
   *
   * `remainingSeconds` è il numero di secondi rimasti (10 → 1). Il tono sale
   * linearmente da ~520 Hz a ~1040 Hz (un'ottava).
   *
   * TIMBRO DEDICATO: prima era una `sine` debolissima (picco 0.045→0.085), che
   * moltiplicata per il volume degli effetti (~0.6) scendeva a ~0.03 ed era
   * impercettibile su un telefono o sotto la musica. Ora è un **campanello**
   * (due oscillatori in rapporto di quinta + armonica acuta) con picco più alto
   * e attacco netto: si sente chiaramente che il tempo scade, ma resta sotto le
   * esultanze delle parole così non le copre. Rispetta sempre il muto.
   * Negli ultimi 3 secondi il volume sale ancora, per chiudere la corsa.
   */
  playRoundTick(remainingSeconds: number): void {
    // Stessa condizione degli altri effetti pubblici: rispetta il muto.
    if (!this.settings.sfxEnabled || !this.unlocked || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const total = 10;
    // 0 al decimo secondo rimasto, 1 all'ultimo: progressione lineare.
    const t = Math.min(1, Math.max(0, (total - remainingSeconds) / (total - 1)));
    const freq = 520 * Math.pow(2, t); // 520 Hz → 1040 Hz (una ottava)
    // 0.16 → 0.30: chiaramente udibile, ma sotto le esultanze (0.19+).
    const peak = 0.16 + 0.14 * t;

    /*
     * Campanello: oscillatore principale `triangle` (attacco netto) + una quinta
     * sopra (`sine`, più tenue) + un'armonica acuta. Due parziali rendono il
     * timbro riconoscibile anche a volume basso, dove una sola `sine` si perde
     * sotto la musica di sottofondo.
     */
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0.0001, now);
    // Attacco rapido (~8 ms) e coda breve: un "din" secco, non un ronzio.
    gain.gain.exponentialRampToValueAtTime(peak, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    osc.connect(gain).connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.2);

    // Parziali: quinta sopra e ottava+quinta, per un timbro di campanello.
    this.blip(freq * 1.5, now, 0.16, 'sine', peak * 0.45);
    this.blip(freq * 3, now, 0.1, 'sine', peak * 0.2);
  }

  /** Passo corrente del countdown (alterna le note dei tick). */
  private countdownStep = 0;

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

  /**
   * Suono di svolgimento del replay di fine round: una parola si accende.
   *
   * Volutamente diverso dall'esultanza di gioco: qui il replay corre veloce e
   * molte parole si susseguono in pochi secondi, quindi serve un "click" breve e
   * pulito, non un motivo. Le parole uniche (punti doppi) hanno un timbro più
   * brillante, così si nota a colpo d'orecchio quali hanno fatto la differenza.
   */
  playReveal(unique = false): void {
    if (!this.settings.sfxEnabled || !this.unlocked || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    // Base più acuta per le uniche: suona "speciale".
    const base = unique ? 1174.66 : 880; // D6 / A5
    this.blip(base, now, 0.07, 'triangle', unique ? 0.16 : 0.1);
    this.blip(base * 1.5, now, 0.05, 'sine', unique ? 0.07 : 0.04);
  }

  /**
   * Chiusura del replay: piccolo accordo che segna "riepilogo completo".
   * Distingue il momento in cui i totali sono definitivi.
   */
  playRevealEnd(): void {
    if (!this.settings.sfxEnabled || !this.unlocked || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    [523.25, 659.25, 783.99].forEach((f, i) =>
      this.blip(f, now + i * 0.05, 0.3, 'triangle', 0.14),
    );
  }

  /* ------------------------------------------------------------------ */
  /* Musica                                                             */
  /* ------------------------------------------------------------------ */

  /** Avvia (o riprende) la musica di sottofondo, con fade-in. */
  startMusic(): void {
    if (!this.settings.musicEnabled || !this.ctx || !this.musicGain) return;
    if (this.settings.musicTrack === 'none') return;
    if (!this.musicEl) {
      // La traccia attiva arriva dal catalogo (tracce incluse + caricate).
      this.loadedTrack = this.settings.musicTrack;
      this.musicEl = new Audio(musicTrack(this.settings.musicTrack, this.catalog).file);
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
