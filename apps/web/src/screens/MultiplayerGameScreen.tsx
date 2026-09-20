import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FoundWord } from '@boggle/shared';
import { isValidPath, pathMatchesWord, scoreForWord, wordFromPath } from '@boggle/shared';
import { GridBoard } from '../components/GridBoard.js';
import { Timer } from '../components/Timer.js';
import { WordList } from '../components/WordList.js';
import { useAppStore } from '../state/store.js';

/** Partita multiplayer: griglia sincronizzata dal server, validazione lato server. */
export function MultiplayerGameScreen() {
  const { grid, room, roomCode, liveWords, roundEndsAt, roundDurationMs, countdown, submitWord, playerId } =
    useAppStore();
  const [selectedPath, setSelectedPath] = useState<number[]>([]);
  const [feedback, setFeedback] = useState<{ kind: 'valid' | 'invalid'; text: string } | null>(null);
  const [myWords, setMyWords] = useState<FoundWord[]>([]);
  const [timeLeftMs, setTimeLeftMs] = useState(roundDurationMs);
  const [shake, setShake] = useState(false);

  const currentWord = useMemo(() => (grid ? wordFromPath(grid, selectedPath) : ''), [grid, selectedPath]);
  const myRoundWordStrings = useMemo(() => new Set(myWords.map((w) => w.word)), [myWords]);
  const score = useMemo(() => myWords.reduce((a, b) => a + b.points, 0), [myWords]);
  const shakeTimer = useRef<number | null>(null);

  // Timer compensato dalla latenza del server (endsAt e' un timestamp server).
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

  const handleCommit = useCallback(
    async (path: number[]) => {
      if (!grid) return;
      if (!isValidPath(grid, path)) return;
      const word = wordFromPath(grid, path);
      if (word.length < 3) {
        flash('invalid', 'Minimo 3 lettere');
        return;
      }
      if (!pathMatchesWord(grid, path, word)) return;
      if (myRoundWordStrings.has(word)) {
        flash('invalid', 'Già trovata');
        return;
      }
      const res = await submitWord(word, path);
      if (res.accepted) {
        const points = scoreForWord(word);
        setMyWords((prev) => [...prev, { word, points, at: Date.now() }]);
        flash('valid', `${word.toUpperCase()} +${points}`);
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate?.(30);
      } else {
        flash('invalid', res.reason ?? 'Non valida');
      }
    },
    [grid, myRoundWordStrings, submitWord],
  );

  const flash = (kind: 'valid' | 'invalid', text: string) => {
    setFeedback({ kind, text });
    if (kind === 'invalid') {
      setShake(true);
      if (shakeTimer.current) window.clearTimeout(shakeTimer.current);
      shakeTimer.current = window.setTimeout(() => setShake(false), 420);
    }
    window.setTimeout(() => setFeedback(null), 1400);
  };

  if (!grid || !room) {
    return (
      <div className="screen">
        <h2 className="screen__title">In attesa della griglia…</h2>
      </div>
    );
  }

  const others = room.players.filter((p) => p.id !== playerId);

  return (
    <div className="screen game">
      {countdown !== null && (
        <div className="countdown-overlay" aria-hidden>
          <span key={countdown} className="countdown-overlay__num">
            {countdown}
          </span>
        </div>
      )}

      <div className="game__topbar">
        <Timer timeLeftMs={timeLeftMs} totalMs={roundDurationMs} />
        <div className="game__round">
          Round {room.currentRound}/{room.rounds} · stanza {roomCode}
        </div>
      </div>

      <div className="game__main">
        <GridBoard
          grid={grid}
          selectedPath={selectedPath}
          onPathChange={setSelectedPath}
          onCommit={handleCommit}
          shake={shake}
        />
        <aside className="game__side">
          <div className="score-chip">
            <span className="score-chip__value">{score}</span>
            <span className="score-chip__label">tuo round</span>
          </div>
          <WordList words={myWords} currentWord={currentWord} />
        </aside>
      </div>

      <section className="live-feed">
        <h3 className="summary__label">In diretta</h3>
        <ul className="live-feed__list">
          {liveWords
            .slice(-6)
            .reverse()
            .map((w, i) => (
              <li key={`${w.playerId}-${w.word}-${i}`} className={`live-feed__item${w.playerId === playerId ? ' live-feed__item--me' : ''}`}>
                <span className="live-feed__who">{w.nickname}</span>
                <span className="live-feed__word">{w.word.toUpperCase()}</span>
                <span className="live-feed__points">+{w.points}</span>
              </li>
            ))}
        </ul>
      </section>

      <section className="scoreboard">
        <h3 className="summary__label">Classifica</h3>
        <ul className="player-list">
          {[...room.players]
            .sort((a, b) => b.score - a.score)
            .map((p, i) => (
              <li key={p.id} className={`player-row${p.id === playerId ? ' player-row--you' : ''}`}>
                <span className="player-row__rank">{i + 1}</span>
                <span className="player-row__name">{p.nickname}</span>
                <span className="player-row__score">{p.score}</span>
              </li>
            ))}
        </ul>
        {others.length === 0 && <p className="scoreboard__hint">Sei da solo per ora: condividi il codice {roomCode}.</p>}
      </section>

      {feedback && (
        <div className={`toast toast--${feedback.kind}`} key={feedback.text}>
          {feedback.kind === 'valid' ? `✓ ${feedback.text}` : `✗ ${feedback.text}`}
        </div>
      )}
    </div>
  );
}
