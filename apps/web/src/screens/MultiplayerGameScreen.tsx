import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FoundWord } from '@boggle/shared';
import { isValidPath, pathMatchesWord, scoreForWord, wordFromPath } from '@boggle/shared';
import { GridBoard } from '../components/GridBoard.js';
import { Timer } from '../components/Timer.js';
import { GameStats } from '../components/GameStats.js';
import { AvatarScoreBar, type AvatarBadge } from '../components/AvatarScoreBar.js';
import { CurrentWord, type CurrentWordFeedback } from '../components/CurrentWord.js';
import { BackHome } from '../components/BackHome.js';
import { useVoiceSpeakers } from '../components/VoiceControls.js';
import { useAppStore } from '../state/store.js';
import { audio } from '../audio/AudioEngine.js';
import { useFinalCountdown } from '../game/useFinalCountdown.js';

type Feedback = CurrentWordFeedback;

/**
 * Quanto resta visibile l'esito della parola nel rettangolo sopra la griglia.
 *
 * Un secondo, come in single player: prima era una nuvoletta in fondo allo
 * schermo che restava 2,6 secondi e copriva la parte bassa della griglia.
 */
const FEEDBACK_VISIBLE_MS = 1000;
/** Quanto resta il "+N" sull'avatar (proprio o di un avversario). */
const BADGE_VISIBLE_MS = 1600;

/** Partita multiplayer: griglia sincronizzata, validazione server, parole avversarie nascoste. */
export function MultiplayerGameScreen() {
  const {
    grid,
    room,
    roomCode,
    roundEndsAt,
    roundDurationMs,
    countdown,
    submitWord,
    playerId,
    opponentEvents,
    leaveRoom,
  } = useAppStore();
  const [selectedPath, setSelectedPath] = useState<number[]>([]);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  /** "+N" sul PROPRIO avatar: gli avversari lo vedono sul loro, io sul mio. */
  const [myBadge, setMyBadge] = useState<AvatarBadge | null>(null);
  const myBadgeTimer = useRef<number | null>(null);
  const [myWords, setMyWords] = useState<FoundWord[]>([]);
  const [timeLeftMs, setTimeLeftMs] = useState(roundDurationMs);
  const [flashError, setFlashError] = useState(false);
  // Chi sta parlando adesso: l'indicatore compare sull'avatar nella barra.
  const speakers = useVoiceSpeakers();
  const flashTimer = useRef<number | null>(null);
  const feedbackTimer = useRef<number | null>(null);

  // Tick crescente negli ultimi 10 secondi del round. In multiplayer il round è
  // attivo quando il server ha comunicato una scadenza (`roundEndsAt`).
  useFinalCountdown(timeLeftMs, roundEndsAt > 0);

  const currentWord = useMemo(() => (grid ? wordFromPath(grid, selectedPath) : ''), [grid, selectedPath]);
  const myRoundWordStrings = useMemo(() => new Set(myWords.map((w) => w.word)), [myWords]);
  const score = useMemo(() => myWords.reduce((a, b) => a + b.points, 0), [myWords]);

  // Orologio condiviso: i badge "+N" durano pochi secondi e vanno fatti scadere.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    return () => {
      if (flashTimer.current) window.clearTimeout(flashTimer.current);
      if (feedbackTimer.current) window.clearTimeout(feedbackTimer.current);
      if (myBadgeTimer.current) window.clearTimeout(myBadgeTimer.current);
    };
  }, []);

  // Badge "+N" per giocatore: somma i punti degli eventi recenti (finestra 3.5s).
  const opponentBadges = useMemo(() => {
    const map = new Map<string, AvatarBadge>();
    for (const ev of opponentEvents) {
      if (now - ev.at > 3500) continue;
      const current = map.get(ev.playerId);
      map.set(ev.playerId, {
        points: (current?.points ?? 0) + ev.points,
        id: ev.id,
        len: ev.wordLength,
      });
    }
    return map;
  }, [opponentEvents, now]);

  /** Badge della barra avatar: quelli degli avversari + il proprio. */
  const badges = useMemo(() => {
    if (!myBadge || !playerId) return opponentBadges;
    const map = new Map(opponentBadges);
    map.set(playerId, myBadge);
    return map;
  }, [opponentBadges, myBadge, playerId]);

  // Timer compensato dalla latenza del server (endsAt è un timestamp server).
  useEffect(() => {
    if (!roundEndsAt) return;
    let raf = 0;
    const tick = () => {
      const left = Math.max(0, roundEndsAt - Date.now());
      setTimeLeftMs(left);
      if (left > 0) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [roundEndsAt]);

  // Reset parole locali a inizio round
  useEffect(() => {
    setMyWords([]);
    setSelectedPath([]);
  }, [grid]);

  const flash = useCallback((feedback: Feedback) => {
    setFeedback(feedback);
    if (feedback.kind === 'invalid') {
      setFlashError(true);
      if (flashTimer.current) window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => setFlashError(false), 500);
    }
    // Durata allineata al single player: l'esito si spegne da solo.
    if (feedbackTimer.current) window.clearTimeout(feedbackTimer.current);
    feedbackTimer.current = window.setTimeout(() => setFeedback(null), FEEDBACK_VISIBLE_MS);
  }, []);

  const handleCommit = useCallback(
    async (path: number[]) => {
      if (!grid) return;
      if (!isValidPath(grid, path)) return;
      const word = wordFromPath(grid, path);
      if (word.length < 3) {
        audio.play('invalid');
        flash({ kind: 'invalid', word, reason: 'Minimo 3 lettere' });
        return;
      }
      if (!pathMatchesWord(grid, path, word)) return;
      if (myRoundWordStrings.has(word)) {
        audio.play('already-found');
        flash({ kind: 'duplicate', word, reason: 'Già trovata' });
        return;
      }
      const res = await submitWord(word, path);
      if (res.accepted) {
        const points = res.points ?? scoreForWord(word);
        setMyWords((prev) => [...prev, { word, points, at: Date.now() }]);
        audio.playWordFound(word.length);
        flash({ kind: 'valid', word, points });
        /*
         * Il "+N" compare anche sul PROPRIO avatar, come per gli avversari: in
         * partita si vede subito quanto ha reso la parola, senza dover leggere
         * il totale nella barra in alto.
         */
        setMyBadge({ points, id: Date.now(), len: word.length });
        if (myBadgeTimer.current) window.clearTimeout(myBadgeTimer.current);
        myBadgeTimer.current = window.setTimeout(() => setMyBadge(null), BADGE_VISIBLE_MS);
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate?.(30);
      } else if (res.reason && /gia|già/i.test(res.reason)) {
        audio.play('already-found');
        flash({ kind: 'duplicate', word, reason: 'Già trovata' });
      } else {
        audio.play('invalid');
        flash({ kind: 'invalid', word, reason: res.reason ?? 'Non valida' });
      }
    },
    [grid, myRoundWordStrings, submitWord, flash],
  );

  if (!grid || !room) {
    return (
      <div className="screen game">
        <BackHome confirm onLeave={leaveRoom} />
        {/*
          Countdown di inizio round: i numeri arrivano dal server e la griglia
          non c'è ancora. Si mostra qui la sovrapposizione, perché la schermata
          di gioco vera (più sotto) richiede una griglia.
        */}
        {countdown !== null ? (
          <div className="countdown-overlay" role="status" aria-live="assertive">
            <div className="countdown">
              <svg className="countdown__ring" viewBox="0 0 100 100" aria-hidden>
                <circle className="countdown__ring-bg" cx="50" cy="50" r="45" />
              </svg>
              <span key={countdown} className="countdown__num">
                {countdown}
              </span>
            </div>
            <p className="countdown__hint">Preparati…</p>
          </div>
        ) : (
          <h2 className="screen__title">In attesa della griglia…</h2>
        )}
      </div>
    );
  }

  const others = room.players.filter((p) => p.id !== playerId);

  return (
    <div className="screen game screen--mp">
      {/*
        Countdown sincronizzato: i numeri arrivano dal server (stesso per tutti).
        Animazione e suoni sono locali, così ognuno li sente senza ritardo di rete.
      */}
      {countdown !== null && (
        <div className="countdown-overlay" role="status" aria-live="assertive">
          <div className="countdown">
            <svg className="countdown__ring" viewBox="0 0 100 100" aria-hidden>
              <circle className="countdown__ring-bg" cx="50" cy="50" r="45" />
            </svg>
            <span key={countdown} className="countdown__num">
              {countdown}
            </span>
          </div>
          <p className="countdown__hint">Preparati…</p>
        </div>
      )}

      {/* Una riga sola: home, timer, i due numeri compatti e il round. */}
      <div className="game__topbar">
        <BackHome confirm onLeave={leaveRoom} />
        <Timer timeLeftMs={timeLeftMs} totalMs={roundDurationMs} />
        <div className="game__round">
          <span className="game__round-num">
            R{room.currentRound}/{room.rounds}
          </span>
          <span className="game__round-room">stanza {roomCode}</span>
        </div>
        {/* I due numeri per ULTIMI: sono allineati al bordo destro. */}
        <GameStats points={score} words={myWords.length} pointsLabel="Punti del round" />
      </div>

      {/*
        Solo griglia e anteprima parola: la classifica che stava qui sotto è
        diventata la barra di avatar in fondo, che resta sempre visibile senza
        far scorrere la pagina.
      */}
      <div className="game__main">
        <CurrentWord word={currentWord} feedback={feedback} />
        <GridBoard
          grid={grid}
          selectedPath={selectedPath}
          onPathChange={setSelectedPath}
          onCommit={handleCommit}
          flashError={flashError}
        />
      </div>

      {/* Barra dei giocatori: avatar tondi, punteggio sotto, "+N" che si
          sovrappone all'avatar di chi ha appena segnato. */}
      <AvatarScoreBar
        players={room.players}
        meId={playerId}
        badges={badges}
        speakers={speakers}
        showNames={room.players.length <= 4}
        hint={others.length === 0 ? `Sei da solo per ora: condividi il codice ${roomCode}.` : undefined}
      />
    </div>
  );
}
