import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FoundWord } from '@boggle/shared';
import { isValidPath, pathMatchesWord, scoreForWord, wordFromPath } from '@boggle/shared';
import { GridBoard } from '../components/GridBoard.js';
import { Timer } from '../components/Timer.js';
import { FoundCounter } from '../components/FoundCounter.js';
import { OpponentFeed } from '../components/OpponentFeed.js';
import { CurrentWord } from '../components/CurrentWord.js';
import { BackHome } from '../components/BackHome.js';
import { useAppStore } from '../state/store.js';
import { audio } from '../audio/AudioEngine.js';

type Feedback = { kind: 'valid' | 'invalid' | 'duplicate'; text: string };

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
  const [myWords, setMyWords] = useState<FoundWord[]>([]);
  const [timeLeftMs, setTimeLeftMs] = useState(roundDurationMs);
  const [flashError, setFlashError] = useState(false);
  const flashTimer = useRef<number | null>(null);
  const feedbackTimer = useRef<number | null>(null);

  const currentWord = useMemo(() => (grid ? wordFromPath(grid, selectedPath) : ''), [grid, selectedPath]);
  const myRoundWordStrings = useMemo(() => new Set(myWords.map((w) => w.word)), [myWords]);
  const score = useMemo(() => myWords.reduce((a, b) => a + b.points, 0), [myWords]);

  // Badge "+N" per giocatore: somma i punti degli eventi recenti (finestra 3.5s).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    return () => {
      if (flashTimer.current) window.clearTimeout(flashTimer.current);
      if (feedbackTimer.current) window.clearTimeout(feedbackTimer.current);
    };
  }, []);

  const badges = useMemo(() => {
    const map = new Map<string, { points: number; id: number }>();
    for (const ev of opponentEvents) {
      if (now - ev.at > 3500) continue;
      const current = map.get(ev.playerId);
      map.set(ev.playerId, { points: (current?.points ?? 0) + ev.points, id: ev.id });
    }
    return map;
  }, [opponentEvents, now]);

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

  const flash = useCallback((kind: Feedback['kind'], text: string) => {
    setFeedback({ kind, text });
    if (kind === 'invalid') {
      setFlashError(true);
      if (flashTimer.current) window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => setFlashError(false), 500);
    }
    // Durata allineata al single player (l'animazione del toast è di 2.6s).
    if (feedbackTimer.current) window.clearTimeout(feedbackTimer.current);
    feedbackTimer.current = window.setTimeout(() => setFeedback(null), 2600);
  }, []);

  const handleCommit = useCallback(
    async (path: number[]) => {
      if (!grid) return;
      if (!isValidPath(grid, path)) return;
      const word = wordFromPath(grid, path);
      if (word.length < 3) {
        audio.play('invalid');
        flash('invalid', 'Minimo 3 lettere');
        return;
      }
      if (!pathMatchesWord(grid, path, word)) return;
      if (myRoundWordStrings.has(word)) {
        audio.play('already-found');
        flash('duplicate', 'Già trovata');
        return;
      }
      const res = await submitWord(word, path);
      if (res.accepted) {
        const points = res.points ?? scoreForWord(word);
        setMyWords((prev) => [...prev, { word, points, at: Date.now() }]);
        audio.playWordFound(word.length);
        flash('valid', `${word.toUpperCase()} +${points}`);
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate?.(30);
      } else if (res.reason && /gia|già/i.test(res.reason)) {
        audio.play('already-found');
        flash('duplicate', 'Già trovata');
      } else {
        audio.play('invalid');
        flash('invalid', res.reason ?? 'Non valida');
      }
    },
    [grid, myRoundWordStrings, submitWord, flash],
  );

  if (!grid || !room) {
    return (
      <div className="screen">
        <BackHome confirm onLeave={leaveRoom} />
        <h2 className="screen__title">In attesa della griglia…</h2>
      </div>
    );
  }

  const others = room.players.filter((p) => p.id !== playerId);
  const toastClass =
    feedback?.kind === 'valid'
      ? 'toast--valid'
      : feedback?.kind === 'duplicate'
        ? 'toast--duplicate'
        : 'toast--invalid';

  return (
    <div className="screen game">
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

      <div className="game__topbar">
        <BackHome confirm onLeave={leaveRoom} />
        <Timer timeLeftMs={timeLeftMs} totalMs={roundDurationMs} />
        <div className="game__round">
          Round {room.currentRound}/{room.rounds} · {room.difficulty} · stanza {roomCode}
        </div>
      </div>

      <div className="game__main">
        <CurrentWord word={currentWord} />
        <GridBoard
          grid={grid}
          selectedPath={selectedPath}
          onPathChange={setSelectedPath}
          onCommit={handleCommit}
          flashError={flashError}
        />
        <aside className="game__side">
          <div className="score-chip">
            <span className="score-chip__value">{score}</span>
            <span className="score-chip__label">tuo round</span>
          </div>
          {/* Solo il numero: l'elenco si vede nel riepilogo di fine round.
              Altezza fissa per non spostare la pagina durante il gioco. */}
          <FoundCounter count={myWords.length} />
        </aside>
      </div>

      <section className="scoreboard">
        <h3 className="summary__label">Classifica</h3>
        <ul className="player-list">
          {[...room.players]
            .sort((a, b) => b.score - a.score)
            .map((p, i) => {
              const badge = badges.get(p.id);
              return (
                <li key={p.id} className={`player-row${p.id === playerId ? ' player-row--you' : ''}`}>
                  <span className="player-row__rank">{i + 1}</span>
                  <span className="player-row__avatar" aria-hidden>
                    {p.photoUrl ? <img src={p.photoUrl} alt="" /> : p.avatar}
                  </span>
                  <span className="player-row__name">
                    {p.nickname}
                    {badge && (
                      <span key={badge.id} className="score-pop" aria-label={`+${badge.points} punti`}>
                        +{badge.points}
                      </span>
                    )}
                  </span>
                  <span className="player-row__score">{p.score}</span>
                </li>
              );
            })}
        </ul>
        {others.length === 0 && (
          <p className="scoreboard__hint">Sei da solo per ora: condividi il codice {roomCode}.</p>
        )}
      </section>

      {/* Notifiche degli avversari: profilo + punti, in basso, che sfumano. */}
      <OpponentFeed events={opponentEvents} now={now} />

      {feedback && (
        <div className={`toast ${toastClass}`} key={feedback.text}>
          {feedback.kind === 'valid' && `✓ ${feedback.text}`}
          {feedback.kind === 'duplicate' && `• ${feedback.text}`}
          {feedback.kind === 'invalid' && `✗ ${feedback.text}`}
        </div>
      )}
    </div>
  );
}
