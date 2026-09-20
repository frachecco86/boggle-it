import { useAppStore } from '../state/store.js';

/** Riepilogo multiplayer: classifica finale o di round + parole per giocatore. */
export function MultiplayerSummaryScreen() {
  const { roundResults, finalScores, missedWords, room, playerId, startRoom, leaveRoom } = useAppStore();
  const isFinal = Boolean(finalScores);
  const results = finalScores ?? roundResults ?? [];
  const isHost = room?.hostId === playerId;
  const isLastRound = room ? room.currentRound >= room.rounds : false;
  const sortedWords = [...missedWords].sort((a, b) => b.length - a.length);

  return (
    <div className="screen summary">
      <h2 className="screen__title">{isFinal ? 'Classifica finale' : `Fine round ${room?.currentRound ?? ''}`}</h2>

      <ul className="results-list">
        {results.map((r, i) => (
          <li key={r.playerId} className={`result-row${r.playerId === playerId ? ' result-row--you' : ''}`}>
            <span className="result-row__rank">{i + 1}</span>
            <div className="result-row__body">
              <div className="result-row__head">
                <span className="result-row__name">{r.nickname}</span>
                <span className="result-row__score">{isFinal ? r.totalScore : r.roundScore}</span>
              </div>
              <div className="chip-list chip-list--compact">
                {r.words.map((w) => (
                  <span key={w} className="chip chip--small">
                    {w.toUpperCase()}
                  </span>
                ))}
              </div>
            </div>
          </li>
        ))}
      </ul>

      {!isFinal && sortedWords.length > 0 && (
        <section className="summary__section">
          <h3 className="summary__label">Parole che esistevano</h3>
          <div className="chip-list chip-list--muted">
            {sortedWords.map((w) => (
              <span key={w} className="chip chip--muted">
                {w.toUpperCase()}
              </span>
            ))}
          </div>
        </section>
      )}

      <div className="summary__actions">
        {isFinal ? (
          <button className="btn btn--primary btn--big" onClick={leaveRoom}>
            Torna alla home
          </button>
        ) : isHost ? (
          <button className="btn btn--primary btn--big" onClick={startRoom} disabled={isLastRound}>
            {isLastRound ? 'Ultimo round…' : 'Prossimo round'}
          </button>
        ) : (
          <p className="lobby__waiting">In attesa dell'host per il prossimo round…</p>
        )}
        {!isFinal && (
          <button className="btn btn--ghost" onClick={leaveRoom}>
            Esci dalla stanza
          </button>
        )}
      </div>
    </div>
  );
}
