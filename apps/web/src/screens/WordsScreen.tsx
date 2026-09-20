import { useEffect, useMemo, useState } from 'react';
import {
  DIFFICULTIES,
  DIFFICULTY_ORDER,
  type Difficulty,
  type GridSize,
  type WordCatalogEntry,
  type WordCatalogQuery,
  type WordCatalogResponse,
} from '@boggle/shared';
import { useAppStore } from '../state/store.js';
import { fetchWordCatalog } from '../game/statsClient.js';

type SortField = WordCatalogQuery['sort'];

const SORTS: { id: SortField; label: string }[] = [
  { id: 'occurrences', label: 'Occorrenze' },
  { id: 'length', label: 'Lunghezza' },
  { id: 'word', label: 'Alfabetico' },
];

const PAGE_SIZE = 100;

/**
 * Catalogo delle parole: tutte le parole componibili nelle schede, con quante
 * volte compaiono. Ordinabile per lunghezza o occorrenze, con ricerca e filtri.
 *
 * A cosa serve: sapere quali parole esistono davvero e quanto sono "comuni".
 * Una parola presente in molte schede è più facile da incontrare.
 */
export function WordsScreen() {
  const setScreen = useAppStore((s) => s.setScreen);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortField>('occurrences');
  const [direction, setDirection] = useState<'asc' | 'desc'>('desc');
  const [gridSize, setGridSize] = useState<GridSize | 'all'>('all');
  const [difficulty, setDifficulty] = useState<Difficulty | 'all'>('all');
  const [minLength, setMinLength] = useState<number | 'all'>('all');
  const [offset, setOffset] = useState(0);

  const [data, setData] = useState<WordCatalogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);

  // Ogni cambio di filtro riparte dalla prima pagina.
  useEffect(() => {
    setOffset(0);
  }, [search, sort, direction, gridSize, difficulty, minLength]);

  useEffect(() => {
    const controller = new AbortController();
    let alive = true;
    setLoading(true);
    const timer = window.setTimeout(() => {
      fetchWordCatalog(
        {
          search: search || undefined,
          sort,
          direction,
          gridSize: gridSize === 'all' ? undefined : gridSize,
          difficulty: difficulty === 'all' ? undefined : difficulty,
          minLength: minLength === 'all' ? undefined : minLength,
          limit: PAGE_SIZE,
          offset,
        },
        controller.signal,
      ).then((res) => {
        if (!alive) return;
        setLoading(false);
        if (!res) {
          setOffline(true);
          setData(null);
          return;
        }
        setOffline(false);
        setData(res);
      });
    }, 250);

    return () => {
      alive = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [search, sort, direction, gridSize, difficulty, minLength, offset]);

  const maxByLength = useMemo(() => {
    if (!data?.byLength.length) return 1;
    return Math.max(...data.byLength.map((b) => b.words));
  }, [data]);

  const toggleDirection = () => setDirection((d) => (d === 'asc' ? 'desc' : 'asc'));

  return (
    <div className="screen words">
      <button className="btn btn--ghost" onClick={() => setScreen('home')}>
        ← Home
      </button>

      <header className="words__head">
        <h2 className="screen__title">Parole</h2>
        <p className="screen__hint">
          Tutte le parole componibili nelle schede, con quante volte compaiono.
        </p>
      </header>

      {/* Distribuzione per lunghezza: dà subito l'idea di quante parole lunghe esistono */}
      {data && data.byLength.length > 0 && (
        <section className="words__dist">
          <h3 className="summary__label">Distribuzione per lunghezza</h3>
          <div className="words__bars">
            {data.byLength.map((b) => (
              <button
                key={b.length}
                className={`words__bar${minLength === b.length ? ' words__bar--active' : ''}`}
                onClick={() => setMinLength(minLength === b.length ? 'all' : b.length)}
                title={`${b.words} parole di ${b.length} lettere`}
              >
                <span className="words__bar-fill" style={{ height: `${(b.words / maxByLength) * 100}%` }} />
                <span className="words__bar-value">{b.words}</span>
                <span className="words__bar-label">{b.length}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="words__filters">
        <label className="words__search">
          <span className="visually-hidden">Cerca una parola</span>
          <input
            type="search"
            value={search}
            placeholder="Cerca una parola…"
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>

        <label className="leaderboard__filter">
          <span>Ordina per</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortField)}>
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        <button className="btn btn--secondary words__dir" onClick={toggleDirection}>
          {direction === 'desc' ? '↓ Decrescente' : '↑ Crescente'}
        </button>

        <label className="leaderboard__filter">
          <span>Griglia</span>
          <select
            value={gridSize}
            onChange={(e) => setGridSize(e.target.value === 'all' ? 'all' : (Number(e.target.value) as GridSize))}
          >
            <option value="all">Tutte</option>
            {[4, 5, 6].map((s) => (
              <option key={s} value={s}>
                {s}×{s}
              </option>
            ))}
          </select>
        </label>

        <label className="leaderboard__filter">
          <span>Difficoltà</span>
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value === 'all' ? 'all' : (e.target.value as Difficulty))}
          >
            <option value="all">Tutte</option>
            {DIFFICULTY_ORDER.map((d) => (
              <option key={d} value={d}>
                {DIFFICULTIES[d].label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {offline && (
        <div className="banner banner--error">Server non raggiungibile: catalogo non disponibile.</div>
      )}

      {loading && !data ? (
        <div className="loading loading--inline">
          <div className="loading__spinner" />
          <p>Carico il catalogo…</p>
        </div>
      ) : !data || data.total === 0 ? (
        <p className="leaderboard__empty">
          {offline ? 'Riprova quando il server è raggiungibile.' : 'Nessuna parola con questi filtri.'}
        </p>
      ) : (
        <>
          <p className="words__count">
            <strong>{data.total.toLocaleString('it-IT')}</strong> parole
            {minLength !== 'all' ? ` di ${minLength} lettere` : ''}
            {` · ${data.offset + 1}–${Math.min(data.offset + PAGE_SIZE, data.total)}`}
          </p>

          <ol className="words__list">
            {data.entries.map((e) => (
              <WordRow key={e.word} entry={e} />
            ))}
          </ol>

          {data.total > PAGE_SIZE && (
            <div className="words__pager">
              <button
                className="btn btn--secondary"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              >
                ← Precedenti
              </button>
              <span className="words__page-info">
                pagina {Math.floor(offset / PAGE_SIZE) + 1} di {Math.ceil(data.total / PAGE_SIZE)}
              </span>
              <button
                className="btn btn--secondary"
                disabled={offset + PAGE_SIZE >= data.total}
                onClick={() => setOffset(offset + PAGE_SIZE)}
              >
                Successivi →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Una riga del catalogo: parola, lunghezza, occorrenze e punti. */
function WordRow({ entry }: { entry: WordCatalogEntry }) {
  return (
    <li className="words__row">
      <span className="words__word">{entry.word.toUpperCase()}</span>
      <span className="words__meta">
        <span className="words__len">{entry.length} lettere</span>
        <span className="words__points">+{entry.points}</span>
      </span>
      <span className="words__occ" title={`Presente in ${entry.occurrences} schede`}>
        {entry.occurrences}×
      </span>
    </li>
  );
}
