import { useCallback } from 'react';
import type { Dictionary } from '@boggle/dictionary';
import { GridBoard } from '../components/GridBoard.js';
import { Timer } from '../components/Timer.js';
import { WordList } from '../components/WordList.js';
import { useSoloGame } from '../game/useSoloGame.js';
import { useAppStore } from '../state/store.js';
import { RoundSummary } from './RoundSummary.js';

/** Partita single player completa. */
export function SoloGameScreen({ dictionary }: { dictionary: Dictionary }) {
  const { soloGridSize, soloRounds, setScreen } = useAppStore();
  const game = useSoloGame({ dictionary, gridSize: soloGridSize, rounds: soloRounds });
  const { state } = game;

  const handlePathChange = useCallback((path: number[]) => game.setSelectedPath(path), [game]);

  if (state.phase === 'idle') {
    return (
      <div className="screen">
        <h2 className="screen__title">Pronto?</h2>
        <p className="screen__hint">Trova parole di almeno 3 lettere scorrendo sulle lettere adiacenti.</p>
        <button className="btn btn--primary btn--big" onClick={game.start}>
          Inizia il round
        </button>
        <button className="btn btn--ghost" onClick={() => setScreen('home')}>
          Torna alla home
        </button>
      </div>
    );
  }

  if (state.phase === 'roundEnd' || state.phase === 'gameEnd') {
    return (
      <RoundSummary
        round={state.round}
        rounds={soloRounds}
        score={state.score}
        totalScore={game.totalScore}
        words={state.found.map((f) => f.word)}
        missedWords={state.missedWords}
        isGameOver={state.phase === 'gameEnd'}
        onNext={game.nextRound}
        onExit={() => setScreen('home')}
      />
    );
  }

  return (
    <div className="screen game">
      <div className="game__topbar">
        <Timer timeLeftMs={state.timeLeftMs} totalMs={180_000} />
        <div className="game__round">
          Round {state.round}/{soloRounds}
        </div>
      </div>

      <div className="game__main">
        <GridBoard
          grid={state.grid!}
          selectedPath={state.selectedPath}
          onPathChange={handlePathChange}
          onCommit={game.commitPath}
          shake={state.feedback?.kind === 'invalid'}
        />
        <aside className="game__side">
          <div className="score-chip">
            <span className="score-chip__value">{game.totalScore}</span>
            <span className="score-chip__label">punti</span>
          </div>
          <WordList words={state.found} currentWord={state.currentWord} />
        </aside>
      </div>

      {state.feedback && (
        <div
          className={`toast toast--${state.feedback.kind}`}
          onAnimationEnd={game.clearFeedback}
          key={state.feedback.word + state.feedback.kind}
        >
          {state.feedback.kind === 'valid'
            ? `✓ ${state.feedback.word.toUpperCase()} +${state.feedback.points}`
            : `✗ ${state.feedback.word.toUpperCase()} — ${state.feedback.reason}`}
        </div>
      )}
    </div>
  );
}
