import { useMemo, useState } from 'react';
import { DIFFICULTIES, type GameHistoryEntry, type ModeStats, type PlayerStats } from '@boggle/shared';

interface Props {
  stats: PlayerStats;
}

/** Riga di statistiche per una modalità (single player o multiplayer). */
function ModeCard({ title, stats, hint }: { title: string; stats: ModeStats; hint?: string }) {
  return (
    <div className="mode-card">
      <div className="mode-card__head">
        <h4 className="mode-card__title">{title}</h4>
        {hint && <span className="mode-card__hint">{hint}</span>}
      </div>
      {stats.games === 0 ? (
        <p className="mode-card__empty">Nessuna partita.</p>
      ) : (
        <div className="mode-card__grid">
          <div className="mode-card__item">
            <span className="mode-card__value">{stats.bestScore}</span>
            <span className="mode-card__label">miglior punteggio</span>
          </div>
          <div className="mode-card__item">
            <span className="mode-card__value">{stats.games}</span>
            <span className="mode-card__label">partite</span>
          </div>
          <div className="mode-card__item">
            <span className="mode-card__value">{stats.avgScore}</span>
            <span className="mode-card__label">media punti</span>
          </div>
          <div className="mode-card__item">
            <span className="mode-card__value">{stats.totalWords}</span>
            <span className="mode-card__label">parole trovate</span>
          </div>
        </div>
      )}
    </div>
  );
}

/** Data breve, es. "21 set 2026". */
function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Statistiche personali del giocatore.
 *
 * Contiene:
 *  - **tutte le parole trovate**, raggruppate per lunghezza (ordinate);
 *  - le **statistiche separate** fra single player e multiplayer, perché una
 *    partita in otto dipende dagli avversari e mescolarla con quella in solitaria
 *    renderebbe i numeri poco leggibili;
 *  - lo **storico delle partite**, dalla più recente.
 */
export function MyStats({ stats }: Props) {
  /** Filtro per lunghezza nell'elenco parole ('all' = tutte). */
  const [lengthFilter, setLengthFilter] = useState<number | 'all'>('all');
  const [showAllWords, setShowAllWords] = useState(false);

  const totalDistinct = useMemo(
    () => stats.wordsByLength.reduce((sum, g) => sum + g.words.length, 0),
    [stats.wordsByLength],
  );

  const visibleWords = useMemo(() => {
    if (lengthFilter === 'all') return stats.wordsByLength;
    return stats.wordsByLength.filter((g) => g.length === lengthFilter);
  }, [stats.wordsByLength, lengthFilter]);

  // L'elenco completo può essere lungo: di default se ne mostrano un po'.
  const WORD_LIMIT = 60;
  const shown = useMemo(() => {
    const flat = visibleWords.flatMap((g) => g.words.map((w) => ({ word: w, length: g.length })));
    return showAllWords ? flat : flat.slice(0, WORD_LIMIT);
  }, [visibleWords, showAllWords]);
  const truncated = lengthFilter === 'all' && !showAllWords && totalDistinct > shown.length;

  return (
    <section className="my-stats">
      <header className="my-stats__head">
        <h3 className="summary__label">Le tue statistiche</h3>
        {stats.bestRank > 0 && (
          <span className="my-stats__rank">
            #{stats.bestRank} in classifica
          </span>
        )}
      </header>

      {/* Sintesi complessiva */}
      <div className="my-stats__grid">
        <div className="my-stats__item">
          <span className="my-stats__value">{stats.games}</span>
          <span className="my-stats__label">partite totali</span>
        </div>
        <div className="my-stats__item">
          <span className="my-stats__value">{stats.bestScore}</span>
          <span className="my-stats__label">punteggio più alto</span>
        </div>
        <div className="my-stats__item">
          <span className="my-stats__value">{stats.avgScore}</span>
          <span className="my-stats__label">media punti</span>
        </div>
        <div className="my-stats__item">
          <span className="my-stats__value">{stats.totalWords}</span>
          <span className="my-stats__label">parole in totale</span>
        </div>
        {stats.longest && (
          <div className="my-stats__item my-stats__item--wide">
            <span className="my-stats__value my-stats__value--word">{stats.longest.toUpperCase()}</span>
            <span className="my-stats__label">la tua parola più lunga</span>
          </div>
        )}
      </div>

      {/* Divisione per modalità */}
      <div className="my-stats__modes">
        <ModeCard title="Da solo" stats={stats.solo} />
        <ModeCard title="Multiplayer" stats={stats.multi} hint="con altri giocatori" />
      </div>

      {/* Tutte le parole trovate, per lunghezza */}
      {totalDistinct > 0 && (
        <div className="my-stats__words">
          <h4 className="my-stats__subtitle">
            Tutte le parole che hai trovato <span className="my-stats__count">{totalDistinct}</span>
          </h4>

          <div className="my-stats__lengths">
            <button
              type="button"
              className={`pill${lengthFilter === 'all' ? ' pill--active' : ''}`}
              onClick={() => setLengthFilter('all')}
            >
              Tutte {totalDistinct}
            </button>
            {stats.wordsByLength.map((g) => (
              <button
                key={g.length}
                type="button"
                className={`pill${lengthFilter === g.length ? ' pill--active' : ''}`}
                onClick={() => setLengthFilter(lengthFilter === g.length ? 'all' : g.length)}
              >
                {g.length} lettere {g.words.length}
              </button>
            ))}
          </div>

          <ol className="my-stats__word-list">
            {shown.map((w) => (
              <li key={w.word} className="my-stats__word">
                <span className="my-stats__word-text">{w.word.toUpperCase()}</span>
                <span className="my-stats__word-len">{w.length}</span>
              </li>
            ))}
          </ol>

          {truncated && (
            <button type="button" className="btn btn--ghost" onClick={() => setShowAllWords(true)}>
              Mostra tutte le {totalDistinct} parole
            </button>
          )}
        </div>
      )}

      {/* Storico partite */}
      {stats.history.length > 0 && (
        <div className="my-stats__history">
          <h4 className="my-stats__subtitle">Partite recenti</h4>
          <ul className="history-list">
            {stats.history.map((g: GameHistoryEntry) => (
              <li key={g.id} className="history-row">
                <span className={`history-row__mode history-row__mode--${g.mode}`}>
                  {g.mode === 'solo' ? 'da solo' : 'multi'}
                </span>
                <span className="history-row__meta">
                  {g.gridSize}×{g.gridSize} · {DIFFICULTIES[g.difficulty]?.label ?? g.difficulty}
                  <span className="history-row__date">{formatDate(g.playedAt)}</span>
                </span>
                <span className="history-row__words">
                  {g.words}
                  {g.wordCount > 0 ? `/${g.wordCount}` : ''} parole
                </span>
                <span className="history-row__score">{g.score} pt</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
