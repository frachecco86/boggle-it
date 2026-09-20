import { useCallback, useEffect, useState } from 'react';
import type { Scheda, SchedaStats } from '@boggle/shared';
import { loadRandomScheda } from '../game/schedeLoader.js';
import { fetchSchedaStats } from '../game/statsClient.js';

interface SchedaPreviewProps {
  size: 4 | 5 | 6;
  difficulty: import('@boggle/shared').Difficulty;
  /** Scheda già scelta (in multiplayer arriva dal server), se disponibile. */
  scheda?: Scheda | null;
  /** Mostra il pulsante per pescare un'altra scheda. */
  canShuffle?: boolean;
  /** Chiamato quando l'utente conferma: riceve la scheda scelta. */
  onPlay: (scheda: Scheda) => void;
  /** Etichetta del pulsante di conferma. */
  playLabel?: string;
  busy?: boolean;
}

/**
 * Anteprima della scheda prima di giocare.
 *
 * Mostra la griglia REALE e cosa aspettarsi: quante parole, quante per ogni
 * lunghezza, il punteggio massimo realizzabile e il record su quella scheda.
 *
 * Perché è utile: senza, il giocatore scopre solo giocando se la scheda è ricca
 * o povera di parole lunghe. Con l'anteprima può scegliere consapevolmente.
 */
export function SchedaPreview({
  size,
  difficulty,
  scheda: schedaProp,
  canShuffle = true,
  onPlay,
  playLabel = 'Gioca',
  busy = false,
}: SchedaPreviewProps) {
  const [scheda, setScheda] = useState<Scheda | null>(schedaProp ?? null);
  const [stats, setStats] = useState<SchedaStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Se il genitore fornisce una scheda (multiplayer), usiamo quella.
  useEffect(() => {
    if (schedaProp) setScheda(schedaProp);
  }, [schedaProp]);

  /** Pesca una scheda nuova e ne carica le statistiche. */
  const shuffle = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await loadRandomScheda(size, difficulty);
      if (!next) throw new Error('Nessuna scheda disponibile');
      setScheda(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [size, difficulty]);

  // Prima scheda all'apertura (se non ne arriva una dal genitore).
  useEffect(() => {
    if (!scheda && !schedaProp) void shuffle();
  }, [scheda, schedaProp, shuffle]);

  // Statistiche della scheda corrente.
  useEffect(() => {
    if (!scheda) return;
    let alive = true;
    setStats(null);
    fetchSchedaStats(scheda.id).then((s) => {
      if (alive) setStats(s);
    });
    return () => {
      alive = false;
    };
  }, [scheda]);

  const maxByLength = stats?.byLength.length
    ? Math.max(...stats.byLength.map((b) => b.words))
    : 1;

  const rows = scheda?.grid.split('\n') ?? [];

  return (
    <section className="scheda-preview">
      <h3 className="summary__label">La tua scheda</h3>

      <div className="scheda-preview__body">
        <div className="scheda-preview__grid" data-loading={loading || undefined}>
          {rows.map((row, ri) => (
            <div key={ri} className="scheda-preview__row">
              {[...row].map((ch, ci) => (
                <span key={ci} className="scheda-preview__cell">
                  {ch === 'q' ? 'Qu' : ch.toUpperCase()}
                </span>
              ))}
            </div>
          ))}
        </div>

        <div className="scheda-preview__stats">
          {!stats ? (
            <p className="scheda-preview__loading">Calcolo le statistiche…</p>
          ) : (
            <>
              <div className="scheda-preview__numbers">
                <div className="scheda-preview__num">
                  <span className="scheda-preview__num-value">{stats.wordCount}</span>
                  <span className="scheda-preview__num-label">parole trovate in totale</span>
                </div>
                <div className="scheda-preview__num">
                  <span className="scheda-preview__num-value scheda-preview__num-value--max">
                    {stats.maxScore}
                  </span>
                  <span className="scheda-preview__num-label">punteggio massimo</span>
                </div>
                <div className="scheda-preview__num">
                  <span className="scheda-preview__num-value scheda-preview__num-value--record">
                    {stats.record ? stats.record.score : '—'}
                  </span>
                  <span className="scheda-preview__num-label">
                    {stats.record ? (
                      <>
                        record di {stats.record.avatar} {stats.record.nickname}
                      </>
                    ) : (
                      'nessun record: gioca tu il primo'
                    )}
                  </span>
                </div>
              </div>

              <div className="scheda-preview__dist">
                <span className="scheda-preview__dist-title">Parole per lunghezza</span>
                {stats.byLength.map((b) => (
                  <div key={b.length} className="scheda-preview__bar-row">
                    <span className="scheda-preview__bar-len">{b.length}</span>
                    <span className="scheda-preview__bar">
                      <span
                        className="scheda-preview__bar-fill"
                        style={{ width: `${(b.words / maxByLength) * 100}%` }}
                      />
                    </span>
                    <span className="scheda-preview__bar-count">{b.words}</span>
                    <span className="scheda-preview__bar-pts">{b.points} pt</span>
                  </div>
                ))}
              </div>

              {stats.longest && (
                <p className="scheda-preview__longest">
                  Parola più lunga possibile: <strong>{stats.longest.toUpperCase()}</strong> (
                  {stats.longest.length} lettere)
                </p>
              )}

              {stats.gamesPlayed > 0 && (
                <p className="scheda-preview__played">
                  Giocata {stats.gamesPlayed} {stats.gamesPlayed === 1 ? 'volta' : 'volte'}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {error && <div className="banner banner--error">{error}</div>}

      <div className="scheda-preview__actions">
        {canShuffle && (
          <button className="btn btn--secondary" disabled={loading || busy} onClick={() => void shuffle()}>
            🎲 Cambia scheda
          </button>
        )}
        <button
          className="btn btn--primary"
          disabled={!scheda || loading || busy}
          onClick={() => scheda && onPlay(scheda)}
        >
          {playLabel}
        </button>
      </div>
    </section>
  );
}
