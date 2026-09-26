import { useCallback } from 'react';
import { GridBoard } from '../components/GridBoard.js';
import { Timer } from '../components/Timer.js';
import { GameStats } from '../components/GameStats.js';
import { CurrentWord } from '../components/CurrentWord.js';
import { BackHome } from '../components/BackHome.js';
import { useSoloGame } from '../game/useSoloGame.js';
import { useAppStore } from '../state/store.js';
import { CountdownOverlay } from '../components/CountdownOverlay.js';
import { useFinalCountdown } from '../game/useFinalCountdown.js';
import { RoundSummary } from './RoundSummary.js';

/**
 * Partita single player completa (schede pre-calcolate dal server).
 *
 * Il round parte da solo (3-2-1 e si gioca): non c'è una schermata "Pronto?"
 * intermedia, e soprattutto **non si vede la scheda prima di giocare** — la
 * griglia che si apriva lì era quella esatta del round, cioè un vantaggio per
 * chi giocava.
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

  // Tick crescente negli ultimi 10 secondi del round.
  useFinalCountdown(state.timeLeftMs, state.phase === 'playing');

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
        onReplay={() => game.start()}
        onExit={() => setScreen('home')}
      />
    );
  }

  const feedback = state.feedback;

  return (
    <div className="screen game">
      {/*
       * Barra in alto su UNA riga: home, timer, informazioni del round e i due
       * numeri della partita (punti e parole) in forma compatta, allineati a
       * destra alla stessa altezza del timer.
       *
       * I due riquadri che stavano sotto la griglia (punteggio e conteggio
       * parole) sono spariti da lì: occupavano l'altezza che serve alla griglia.
       */}
      <div className="game__topbar">
        <BackHome confirm />
        <Timer timeLeftMs={state.timeLeftMs} totalMs={soloRoundDurationMs} />
        <div className="game__round">
          <span className="game__round-num">
            R{state.round}/{soloRounds}
          </span>
          <span className="game__round-diff">{soloDifficulty}</span>
        </div>
        {/* I due numeri per ULTIMI: sono allineati al bordo destro. */}
        <GameStats points={game.totalScore} words={state.found.length} />
      </div>

      {/*
       * Griglia e anteprima parola: nient'altro. La schermata non scorre
       * (l'altezza è esattamente quella del viewport) e la griglia prende tutto
       * lo spazio che avanza.
       */}
      <div className="game__main">
        <CurrentWord word={state.currentWord} feedback={feedback} />
        <GridBoard
          grid={state.grid!}
          selectedPath={state.selectedPath}
          onPathChange={handlePathChange}
          onCommit={game.commitPath}
          flashError={feedback?.kind === 'invalid'}
        />
      </div>
    </div>
  );
}
