import { useEffect, useMemo, useState } from 'react';
import {
  DIFFICULTIES,
  DIFFICULTY_ORDER,
  difficultyMeta,
  type Difficulty,
  type GameMode,
  type GridSize,
  type LeaderboardEntry,
  type LeaderboardKind,
  type LeaderboardPeriod,
  type PlayerStats,
} from '@boggle/shared';
import { activeToken } from '../game/profileStore.js';
import { BackHome } from '../components/BackHome.js';
import { MyStats } from '../components/MyStats.js';
import { fetchLeaderboard, fetchMyStats } from '../game/statsClient.js';

const KINDS: { id: LeaderboardKind; label: string; hint: string }[] = [
  { id: 'best', label: 'Migliori', hint: 'Punteggio più alto in una partita' },
  /*
   * "Somma dei punti" è disponibile per ENTRAMBE le modalità: il filtro in alto
   * (Da solo / Con altri) sceglie quali partite sommare. Sommare single player e
   * multiplayer insieme non avrebbe senso (un punteggio multiplayer dipende dagli
   * avversari), quindi la modalità è sempre esplicita.
   */
  { id: 'total', label: 'Totali', hint: 'Somma dei punti delle partite della modalità scelta' },
  { id: 'longest', label: 'Parole lunghe', hint: 'La parola più lunga trovata' },
];

/** Modalità della classifica: single player, multiplayer o tutte. */
const MODES: { id: GameMode | 'all'; label: string; hint: string }[] = [
  { id: 'solo', label: 'Da solo', hint: 'Classifica delle partite single player' },
  { id: 'multi', label: 'Con altri', hint: 'Classifica delle partite multiplayer' },
  { id: 'all', label: 'Tutte', hint: 'Single player e multiplayer insieme' },
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
  // Il token vive nel profileStore, non nello store di navigazione.
  const token = activeToken();
  const [kind, setKind] = useState<LeaderboardKind>('best');
  const [mode, setMode] = useState<GameMode | 'all'>('solo');
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
        mode,
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
  }, [kind, period, mode, gridSize, difficulty, token]);

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
  const hasFilters = gridSize !== 'all' || difficulty !== 'all' || period !== 'all' || mode !== 'solo';

  const formatValue = (e: LeaderboardEntry) => {
    if (kind === 'longest') return e.longest ? e.longest.toUpperCase() : '—';
    return `${e.value} pt`;
  };

  const subtitle = (e: LeaderboardEntry) => {
    if (kind === 'total') return `${e.games ?? 0} ${(e.games ?? 0) === 1 ? 'partita' : 'partite'}`;
    if (kind === 'longest') return `${e.longest.length} lettere · ${e.score} pt`;
    return `${e.words} parole · ${e.gridSize}×${e.gridSize} ${difficultyMeta(e.difficulty).label.toLowerCase()}`;
  };

  return (
    <div className="screen leaderboard">
      <BackHome />

      <header className="leaderboard__head">
        <h2 className="screen__title">Classifica</h2>
        <p className="screen__hint">{activeKind.hint}</p>
      </header>

      {/* Modalità: single player e multiplayer separati. È la scelta in alto
          perché cambia il senso di TUTTI i numeri sottostanti. */}
      <div className="leaderboard__modes" role="tablist" aria-label="Modalità">
        {MODES.map((m) => (
          <button
            key={m.id}
            role="tab"
            aria-selected={mode === m.id}
            title={m.hint}
            className={`leaderboard__mode${mode === m.id ? ' leaderboard__mode--active' : ''}`}
            onClick={() => setMode(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/*
       * Statistiche personali ("Le tue statistiche") IN FONDO, sotto la classifica.
       *
       * Perché non in cima: chi apre questa pagina vuole vedere la **classifica** —
       * chi è davanti, con quanti punti — mentre le statistiche personali sono un
       * approfondimento che si legge dopo (e occupano molto spazio: griglia di
       * numeri, parole per lunghezza, storico partite). Mettendole sopra, la
       * classifica finiva sotto la piega della schermata.
       */}
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
              ? `Nessuna partita ${modeLabel(mode)} con questi filtri. Prova ad allargare la ricerca.`
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
          {games.toLocaleString('it-IT')} partite {modeLabel(mode)} considerate
          {hasFilters ? ' con i filtri attuali' : ''}. Miglior punteggio per giocatore.
        </p>
      )}

      {/* Dopo la classifica: le statistiche personali complete (parole per
          lunghezza, split solo/multi, storico partite). */}
      {myStats && myStats.games > 0 && (
        <div className="leaderboard__stats">
          <MyStats stats={myStats} />
        </div>
      )}
    </div>
  );
}

/** Etichetta della modalità, per i messaggi. */
function modeLabel(mode: GameMode | 'all'): string {
  if (mode === 'solo') return 'single player';
  if (mode === 'multi') return 'multiplayer';
  return '';
}
