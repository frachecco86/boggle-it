import { useCallback } from 'react';
import { GridBoard } from '../components/GridBoard.js';
import { Timer } from '../components/Timer.js';
import { FoundCounter } from '../components/FoundCounter.js';
import { CurrentWord } from '../components/CurrentWord.js';
import { BackHome } from '../components/BackHome.js';
import { useSoloGame } from '../game/useSoloGame.js';
import { useAppStore } from '../state/store.js';
import { SchedaPreview } from '../components/SchedaPreview.js';
import { CountdownOverlay } from '../components/CountdownOverlay.js';
import { RoundSummary } from './RoundSummary.js';

/**
 * Partita single player completa (schede pre-calcolate dal server).
 *
 * Nota sulle parole: quelle TROVATE non compaiono nell'elenco mentre si gioca
 * (solo a fine round), per non rivelare troppo presto le soluzioni. Quello che
 * si vede sopra la griglia è la parola in composizione, come nel Boggle.
 */
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
        <BackHome />
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
        <BackHome />
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

  // Countdown di inizio: 3-2-1 con animazione e suoni.
  if (state.phase === 'countdown') {
    return (
      <div className="screen">
        <BackHome confirm />
        <CountdownOverlay onComplete={game.beginRound} />
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
        allWords={state.scheda?.words}
        isGameOver={state.phase === 'gameEnd'}
        saveStatus={state.saveStatus}
        onNext={game.nextRound}
        onExit={() => setScreen(state.phase === 'gameEnd' ? 'solo-setup' : 'home')}
      />
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
        <BackHome confirm />
        <Timer timeLeftMs={state.timeLeftMs} totalMs={soloRoundDurationMs} />
        <div className="game__round">
          Round {state.round}/{soloRounds} · {soloDifficulty}
        </div>
      </div>

      <div className="game__main">
        {/* Anteprima della parola in composizione, sopra la griglia (stile Boggle). */}
        <CurrentWord word={state.currentWord} />
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
          {/* Solo il NUMERO di parole trovate: l'elenco rivelerebbe le soluzioni.
              Altezza fissa, così non sposta nulla mentre si gioca. */}
          <FoundCounter count={state.found.length} />
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
