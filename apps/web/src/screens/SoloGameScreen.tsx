import { useCallback } from 'react';
import { GridBoard } from '../components/GridBoard.js';
import { Timer } from '../components/Timer.js';
import { WordList } from '../components/WordList.js';
import { useSoloGame } from '../game/useSoloGame.js';
import { useAppStore } from '../state/store.js';
import { SchedaPreview } from '../components/SchedaPreview.js';

/** Partita single player completa (schede pre-calcolate dal server). */
export function SoloGameScreen() {
  const {
    soloGridSize,
    soloDifficulty,
    soloRounds,
    soloRoundDurationMs,
    setScreen,
  } = useAppStore();
  const game = useSoloGame({
    gridSize: soloGridSize,
    difficulty: soloDifficulty,
    rounds: soloRounds,
    roundDurationMs: soloRoundDurationMs,
  });
  const { state } = game;

  const handlePathChange = useCallback((path: number[]) => game.setSelectedPath(path), [game]);

  if (state.loading) {
    return (
      <div className="loading">
        <div className="loading__spinner" />
        <p>Preparo la scheda…</p>
      </div>
    );
  }

  if (game.loadError) {
    return (
      <div className="screen">
        <h2 className="screen__title">Scheda non disponibile</h2>
        <p className="screen__hint">{game.loadError}</p>
        <button className="btn btn--ghost" onClick={() => setScreen('home')}>
          Torna alla home
        </button>
      </div>
    );
  }

  if (state.phase === 'idle') {
    return (
      <div className="screen">
        <h2 className="screen__title">Pronto?</h2>
        <p className="screen__hint">
          Trova parole di almeno 3 lettere scorrendo sulle lettere adiacenti.
        </p>
        {/* Anteprima: mostra la scheda e cosa aspettarsi prima di iniziare. */}
        <SchedaPreview
          size={soloGridSize}
          difficulty={soloDifficulty}
          onPlay={(scheda) => game.start(scheda)}
          playLabel="Inizia il round"
        />
        <button className="btn btn--ghost" onClick={() => setScreen('home')}>
          Torna alla home
        </button>
      </div>
    );
  }

  if (state.phase === 'roundEnd' || state.phase === 'gameEnd') {
    return (
      <div className="screen summary">
        <h2 className="screen__title">
          {state.phase === 'gameEnd' ? 'Partita finita' : `Fine round ${state.round} di ${soloRounds}`}
        </h2>
        <p className="summary__round-score">
          Punti del round: <strong>{state.score}</strong>
        </p>
        <p className="summary__total">
          Totale: <strong>{game.totalScore}</strong>
        </p>

        <section className="summary__section">
          <h3 className="summary__label">Le tue parole ({state.found.length})</h3>
          <div className="chip-list">
            {state.found.length === 0 && <span className="summary__empty">Nessuna parola trovata</span>}
            {state.found.map((f) => (
              <span key={f.word} className="chip">
                {f.word.toUpperCase()}
              </span>
            ))}
          </div>
        </section>

        <div className="summary__actions">
          {state.phase === 'gameEnd' ? (
            <button className="btn btn--primary btn--big" onClick={() => setScreen('solo-setup')}>
              Rigioca
            </button>
          ) : (
            <button className="btn btn--primary btn--big" onClick={game.nextRound}>
              Prossimo round
            </button>
          )}
          <button className="btn btn--ghost" onClick={() => setScreen('home')}>
            Torna alla home
          </button>
        </div>
      </div>
    );
  }

  const feedback = state.feedback;
  const toastClass =
    feedback?.kind === 'valid'
      ? 'toast--valid'
      : feedback?.kind === 'duplicate'
        ? 'toast--duplicate'
        : 'toast--invalid';

  return (
    <div className="screen game">
      <div className="game__topbar">
        <Timer timeLeftMs={state.timeLeftMs} totalMs={soloRoundDurationMs} />
        <div className="game__round">
          Round {state.round}/{soloRounds} · {soloDifficulty}
        </div>
      </div>

      <div className="game__main">
        <GridBoard
          grid={state.grid!}
          selectedPath={state.selectedPath}
          onPathChange={handlePathChange}
          onCommit={game.commitPath}
          flashError={feedback?.kind === 'invalid'}
        />
        <aside className="game__side">
          <div className="score-chip">
            <span className="score-chip__value">{game.totalScore}</span>
            <span className="score-chip__label">punti</span>
          </div>
          <WordList words={state.found} currentWord={state.currentWord} />
        </aside>
      </div>

      {feedback && (
        <div
          className={`toast ${toastClass}`}
          onAnimationEnd={game.clearFeedback}
          key={feedback.word + feedback.kind}
        >
          {feedback.kind === 'valid' && `✓ ${feedback.word.toUpperCase()} +${feedback.points}`}
          {feedback.kind === 'duplicate' && `• ${feedback.word.toUpperCase()} — ${feedback.reason}`}
          {feedback.kind === 'invalid' && `✗ ${feedback.word.toUpperCase()} — ${feedback.reason}`}
        </div>
      )}
    </div>
  );
}
