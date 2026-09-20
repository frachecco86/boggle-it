import { useEffect, useMemo, useState } from 'react';
import {
  DIFFICULTIES,
  DIFFICULTY_ORDER,
  type Difficulty,
  type GridSize,
  type LeaderboardEntry,
  type LeaderboardKind,
  type LeaderboardPeriod,
  type PlayerStats,
} from '@boggle/shared';
import { useAppStore } from '../state/store.js';
import { activeToken } from '../game/profileStore.js';
import { fetchLeaderboard, fetchMyStats } from '../game/statsClient.js';

const KINDS: { id: LeaderboardKind; label: string; hint: string }[] = [
  { id: 'best', label: 'Migliori', hint: 'Punteggio più alto in una partita' },
  { id: 'total', label: 'Totali', hint: 'Somma dei punti di tutte le partite' },
  { id: 'longest', label: 'Parole lunghe', hint: 'La parola più lunga trovata' },
];

const PERIODS: { id: LeaderboardPeriod; label: string }[] = [
  { id: 'all', label: 'Sempre' },
  { id: 'month', label: '30 giorni' },
  { id: 'week', label: '7 giorni' },
];

const SIZES: (GridSize | 'all')[] = ['all', 4, 5, 6];

/**
 * Classifica e statistiche personali.
 *
 * Tre classifiche (miglior punteggio, totale, parola più lunga) con filtri per
 * dimensione griglia, difficoltà e periodo. Confrontare una 4×4 con una 6×6 non
 * avrebbe senso: nella 6×6 ci sono molte più parole, quindi i filtri servono a
 * rendere i confronti onesti.
 */
export function LeaderboardScreen() {
  const setScreen = useAppStore((s) => s.setScreen);
  // Il token vive nel profileStore, non nello store di navigazione.
  const token = activeToken();
  const [kind, setKind] = useState<LeaderboardKind>('best');
  const [period, setPeriod] = useState<LeaderboardPeriod>('all');
  const [gridSize, setGridSize] = useState<GridSize | 'all'>('all');
  const [difficulty, setDifficulty] = useState<Difficulty | 'all'>('all');

  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [games, setGames] = useState(0);
  const [myProfileId, setMyProfileId] = useState<string | null>(null);
  const [myStats, setMyStats] = useState<PlayerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);

  // Carica la classifica quando cambiano i filtri.
  useEffect(() => {
    const controller = new AbortController();
    let alive = true;
    setLoading(true);

    fetchLeaderboard(
      {
        kind,
        period,
        gridSize: gridSize === 'all' ? undefined : gridSize,
        difficulty: difficulty === 'all' ? undefined : difficulty,
      },
      token,
      controller.signal,
    ).then((res) => {
      if (!alive) return;
      setLoading(false);
      if (!res) {
        setOffline(true);
        setEntries([]);
        return;
      }
      setOffline(false);
      setEntries(res.entries);
      setGames(res.gamesConsidered);
      setMyProfileId(res.myProfileId ?? null);
    });

    return () => {
      alive = false;
      controller.abort();
    };
  }, [kind, period, gridSize, difficulty, token]);

  // Statistiche personali (solo se c'è un profilo).
  useEffect(() => {
    if (!token) {
      setMyStats(null);
      return;
    }
    const controller = new AbortController();
    fetchMyStats(token, controller.signal).then(setMyStats);
    return () => controller.abort();
  }, [token]);

  const activeKind = useMemo(() => KINDS.find((k) => k.id === kind)!, [kind]);
  const hasFilters = gridSize !== 'all' || difficulty !== 'all' || period !== 'all';

  const formatValue = (e: LeaderboardEntry) => {
    if (kind === 'longest') return e.longest ? e.longest.toUpperCase() : '—';
    return `${e.value} pt`;
  };

  const subtitle = (e: LeaderboardEntry) => {
    if (kind === 'total') return `${e.games ?? 0} ${(e.games ?? 0) === 1 ? 'partita' : 'partite'}`;
    if (kind === 'longest') return `${e.longest.length} lettere · ${e.score} pt`;
    return `${e.words} parole · ${e.gridSize}×${e.gridSize} ${DIFFICULTIES[e.difficulty].label.toLowerCase()}`;
  };

  return (
    <div className="screen leaderboard">
      <button className="btn btn--ghost" onClick={() => setScreen('home')}>
        ← Home
      </button>

      <header className="leaderboard__head">
        <h2 className="screen__title">Classifica</h2>
        <p className="screen__hint">{activeKind.hint}</p>
      </header>

      {myStats && myStats.games > 0 && (
        <section className="my-stats">
          <h3 className="summary__label">Le tue statistiche</h3>
          <div className="my-stats__grid">
            <div className="my-stats__item">
              <span className="my-stats__value">{myStats.bestScore}</span>
              <span className="my-stats__label">miglior punteggio</span>
            </div>
            <div className="my-stats__item">
              <span className="my-stats__value">{myStats.games}</span>
              <span className="my-stats__label">partite</span>
            </div>
            <div className="my-stats__item">
              <span className="my-stats__value">{myStats.avgScore}</span>
              <span className="my-stats__label">media punti</span>
            </div>
            <div className="my-stats__item">
              <span className="my-stats__value">{myStats.bestRank > 0 ? `#${myStats.bestRank}` : '—'}</span>
              <span className="my-stats__label">posizione</span>
            </div>
            {myStats.longest && (
              <div className="my-stats__item my-stats__item--wide">
                <span className="my-stats__value my-stats__value--word">
                  {myStats.longest.toUpperCase()}
                </span>
                <span className="my-stats__label">la tua parola più lunga</span>
              </div>
            )}
          </div>
        </section>
      )}

      {!token && (
        <p className="leaderboard__note">
          Gioca con un profilo per entrare in classifica. La classifica è visibile a tutti.
        </p>
      )}

      <div className="leaderboard__tabs" role="tablist">
        {KINDS.map((k) => (
          <button
            key={k.id}
            role="tab"
            aria-selected={kind === k.id}
            className={`leaderboard__tab${kind === k.id ? ' leaderboard__tab--active' : ''}`}
            onClick={() => setKind(k.id)}
          >
            {k.label}
          </button>
        ))}
      </div>

      <div className="leaderboard__filters">
        <label className="leaderboard__filter">
          <span>Griglia</span>
          <select
            value={gridSize}
            onChange={(e) => setGridSize(e.target.value === 'all' ? 'all' : (Number(e.target.value) as GridSize))}
          >
            {SIZES.map((s) => (
              <option key={String(s)} value={String(s)}>
                {s === 'all' ? 'Tutte' : `${s}×${s}`}
              </option>
            ))}
          </select>
        </label>

        <label className="leaderboard__filter">
          <span>Difficoltà</span>
          <select
            value={difficulty}
            onChange={(e) =>
              setDifficulty(e.target.value === 'all' ? 'all' : (e.target.value as Difficulty))
            }
          >
            <option value="all">Tutte</option>
            {DIFFICULTY_ORDER.map((d) => (
              <option key={d} value={d}>
                {DIFFICULTIES[d].label}
              </option>
            ))}
          </select>
        </label>

        <label className="leaderboard__filter">
          <span>Periodo</span>
          <select value={period} onChange={(e) => setPeriod(e.target.value as LeaderboardPeriod)}>
            {PERIODS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {offline && <div className="banner banner--error">Server non raggiungibile: classifica non disponibile.</div>}

      {loading ? (
        <div className="loading loading--inline">
          <div className="loading__spinner" />
          <p>Carico la classifica…</p>
        </div>
      ) : entries.length === 0 ? (
        <p className="leaderboard__empty">
          {offline
            ? 'Riprova quando il server è raggiungibile.'
            : hasFilters
              ? 'Nessuna partita con questi filtri. Prova ad allargare la ricerca.'
              : 'Nessuna partita registrata ancora. Gioca la prima!'}
        </p>
      ) : (
        <ol className="leaderboard__list">
          {entries.map((e) => {
            const isMe = e.profileId === myProfileId;
            return (
              <li
                key={`${e.profileId}-${e.rank}`}
                className={`leaderboard__row${isMe ? ' leaderboard__row--me' : ''}${e.rank <= 3 ? ` leaderboard__row--top${e.rank}` : ''}`}
              >
                <span className="leaderboard__rank">{e.rank}</span>
                <span className="leaderboard__avatar" aria-hidden>
                  {e.avatar}
                </span>
                <span className="leaderboard__body">
                  <span className="leaderboard__name">
                    {e.nickname}
                    {isMe && <span className="badge badge--you">tu</span>}
                  </span>
                  <span className="leaderboard__sub">{subtitle(e)}</span>
                </span>
                <span className={`leaderboard__value${kind === 'longest' ? ' leaderboard__value--word' : ''}`}>
                  {formatValue(e)}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {!loading && entries.length > 0 && (
        <p className="leaderboard__note">
          {games.toLocaleString('it-IT')} partite considerate
          {hasFilters ? ' con i filtri attuali' : ''}. Miglior punteggio per giocatore.
        </p>
      )}
    </div>
  );
}
