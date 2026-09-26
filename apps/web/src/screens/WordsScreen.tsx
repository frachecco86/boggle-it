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
import { BackHome } from '../components/BackHome.js';
import { InfoBox } from '../components/InfoBox.js';
import { fetchWordCatalog } from '../game/statsClient.js';

type SortField = WordCatalogQuery['sort'];
/** Le due schede della pagina. */
type Tab = 'schede' | 'dizionario';

const SORTS: { id: SortField; label: string }[] = [
  { id: 'occurrences', label: 'Occorrenze' },
  { id: 'length', label: 'Lunghezza' },
  { id: 'word', label: 'Alfabetico' },
];

/** Base delle voci di Wikizionario: il server manda solo il titolo della pagina. */
const WIKTIONARY_BASE = 'https://it.wiktionary.org/wiki/';

const PAGE_SIZE = 100;

/**
 * Parole: due viste sui dati.
 *
 *  1. **Nelle schede** — le parole componibili nelle griglie, con quante volte
 *     compaiono. Serve a capire quanto è "comune" una parola nel gioco.
 *  2. **Dizionario** — l'intero lessico (403k parole), ognuna con la categoria
 *     grammaticale e il link alla voce di Wikizionario.
 *
 * Perché due viste e non due pagine: sono lo stesso elenco con filtri diversi.
 * Tenerle insieme evita di duplicare filtri e paginazione, e permette di passare
 * da "parole del gioco" a "tutte le parole" con un click.
 */
export function WordsScreen() {
  const [tab, setTab] = useState<Tab>('schede');

  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortField>('occurrences');
  const [direction, setDirection] = useState<'asc' | 'desc'>('desc');
  const [gridSize, setGridSize] = useState<GridSize | 'all'>('all');
  const [difficulty, setDifficulty] = useState<Difficulty | 'all'>('all');
  const [minLength, setMinLength] = useState<number | 'all'>('all');
  const [pos, setPos] = useState<string>('all');
  const [onlyWithEntry, setOnlyWithEntry] = useState(false);
  /** Se true, mostra solo le parole componibili nella scheda in corso. */
  const [onlyCurrent, setOnlyCurrent] = useState(false);
  const [offset, setOffset] = useState(0);

  // Scheda in corso: single player oppure stanza multiplayer.
  const currentSchedaId = useAppStore((s) => s.currentSchedaId ?? s.room?.schedaId ?? null);

  const [data, setData] = useState<WordCatalogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);

  // Cambiando scheda si riparte dalla prima pagina e l'ordinamento predefinito
  // diventa quello più utile per quella vista.
  useEffect(() => {
    setOffset(0);
  }, [search, sort, direction, gridSize, difficulty, minLength, pos, onlyWithEntry, onlyCurrent, currentSchedaId, tab]);

  useEffect(() => {
    setOffset(0);
    if (tab === 'dizionario') {
      // Nel dizionario l'ordinamento naturale è alfabetico, non per occorrenze.
      setSort('word');
      setDirection('asc');
    } else {
      setSort('occurrences');
      setDirection('desc');
    }
  }, [tab]);

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
          pos: tab === 'dizionario' && pos !== 'all' ? pos : undefined,
          onlyWithEntry: tab === 'dizionario' && onlyWithEntry ? true : undefined,
          /*
           * Differenza fra le due viste:
           *  - `schede`: solo le parole che compaiono ALMENO in una scheda.
           *    Si ottiene filtrando per dimensione/difficoltà, oppure `schedaId`
           *    per una singola scheda. Senza alcun filtro il catalogo resta quello
           *    delle parole delle schede, perché è l'universo delle parole possibili.
           *  - `dizionario`: tutte le parole del lessico. Il server distingue i due
           *    casi con `scope`.
           */
          scope: tab,
          schedaId: tab === 'schede' && onlyCurrent && currentSchedaId ? currentSchedaId : undefined,
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
  }, [
    tab,
    search,
    sort,
    direction,
    gridSize,
    difficulty,
    minLength,
    pos,
    onlyWithEntry,
    onlyCurrent,
    currentSchedaId,
    offset,
  ]);

  const maxByLength = useMemo(() => {
    if (!data?.byLength.length) return 1;
    return Math.max(...data.byLength.map((b) => b.words));
  }, [data]);

  const maxByPos = useMemo(() => {
    if (!data?.byPos?.length) return 1;
    return Math.max(...data.byPos.map((b) => b.words));
  }, [data]);

  const toggleDirection = () => setDirection((d) => (d === 'asc' ? 'desc' : 'asc'));

  return (
    <div className="screen words">
      <div className="words__topbar">
        <BackHome />
      </div>

      <header className="words__head">
        <div className="words__title-row">
          <h2 className="screen__title">Parole</h2>
          <InfoBox title="Come leggere questo elenco" label="Come leggere questo elenco">
          <p>
            <strong>Nelle schede</strong> mostra le parole che si possono davvero comporre
            nelle griglie del gioco, con <em>in quante schede</em> compaiono: una parola
            presente in molte schede è più facile da incontrare.
          </p>
          <p>
            <strong>Dizionario</strong> mostra l'intero lessico accettato dal gioco, con la{' '}
            <strong>categoria grammaticale</strong> e il <strong>link a Wikizionario</strong>{' '}
            per le voci che ne hanno una.
          </p>
          <p>
            Il <strong>tag</strong> (per esempio <code>sost</code> = sostantivo,{' '}
            <code>verb</code> = verbo, <code>agg</code> = aggettivo) indica che tipo di parola
            è: può essere plurale, femminile o una forma coniugata — è la categoria della voce
            di dizionario da cui deriva.
          </p>
          <p>
            I tag arrivano da due fonti: <strong>Morph-it!</strong> (Università di Bologna,
            analizzatore morfologico) e <strong>Wikizionario</strong> per le voci autonome. Il
            tag copre il <strong>99%</strong> delle parole; le poche restanti sono marcate{' '}
            <code>n.c.</code> (non classificata).
          </p>
          <p className="info-box__note">
            Le definizioni testuali non sono incluse: sono disponibili seguendo il link alla
            voce di Wikizionario (licenza CC BY-SA).
          </p>
          </InfoBox>
        </div>
        {/* Due tab: stesso elenco, universo diverso (schede del gioco / lessico). */}
        <div className="words__tabs" role="tablist" aria-label="Vista delle parole">
          <button
            role="tab"
            aria-selected={tab === 'schede'}
            className={`words__tab${tab === 'schede' ? ' words__tab--active' : ''}`}
            onClick={() => setTab('schede')}
          >
            Nelle schede
          </button>
          <button
            role="tab"
            aria-selected={tab === 'dizionario'}
            className={`words__tab${tab === 'dizionario' ? ' words__tab--active' : ''}`}
            onClick={() => setTab('dizionario')}
          >
            Dizionario
          </button>
        </div>

        <p className="screen__hint">
          {tab === 'schede' ? (
            <>
              Le parole componibili nelle schede, con quante volte compaiono. Il numero indica{' '}
              <strong>in quante schede</strong> appare, non se vale in quella che stai giocando.
            </>
          ) : (
            <>
              Tutte le parole accettate dal gioco, con categoria grammaticale e link al
              dizionario. Le forme plurali e coniugate hanno il tag della loro voce di origine.
            </>
          )}
        </p>

        {tab === 'schede' && currentSchedaId && (
          <label className="words__only-current">
            <input
              type="checkbox"
              checked={onlyCurrent}
              onChange={(e) => setOnlyCurrent(e.target.checked)}
            />
            <span>Solo le parole della scheda in corso</span>
          </label>
        )}
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

      {/* Categorie grammaticali: nel tab Dizionario diventano un filtro cliccabile. */}
      {tab === 'dizionario' && data?.byPos && data.byPos.length > 0 && (
        <section className="words__dist">
          <h3 className="summary__label">Categorie grammaticali</h3>
          <div className="words__pos-bars">
            {data.byPos.slice(0, 12).map((b) => (
              <button
                key={b.pos}
                className={`words__pos${pos === b.pos ? ' words__pos--active' : ''}`}
                onClick={() => setPos(pos === b.pos ? 'all' : b.pos)}
                title={`${b.words} parole: ${b.pos}`}
              >
                <span className="words__pos-label">{b.pos}</span>
                <span className="words__pos-value">{b.words.toLocaleString('it-IT')}</span>
                <span
                  className="words__pos-fill"
                  style={{ width: `${(b.words / maxByPos) * 100}%` }}
                />
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

        {tab === 'schede' && (
          <>
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
          </>
        )}

        {tab === 'dizionario' && (
          <>
            <label className="leaderboard__filter">
              <span>Categoria</span>
              <select value={pos} onChange={(e) => setPos(e.target.value)}>
                <option value="all">Tutte</option>
                {(data?.byPos ?? []).map((b) => (
                  <option key={b.pos} value={b.pos}>
                    {b.pos} ({b.words})
                  </option>
                ))}
              </select>
            </label>

            <label className="words__only-current">
              <input
                type="checkbox"
                checked={onlyWithEntry}
                onChange={(e) => setOnlyWithEntry(e.target.checked)}
              />
              <span>Solo con voce di dizionario</span>
            </label>
          </>
        )}
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
            <strong>{data.total.toLocaleString('it-IT')}</strong>{' '}
            {tab === 'dizionario' ? 'parole nel dizionario' : 'parole'}
            {minLength !== 'all' ? ` di ${minLength} lettere` : ''}
            {pos !== 'all' && tab === 'dizionario' ? ` · ${pos}` : ''}
            {data.withEntry !== undefined && tab === 'dizionario'
              ? ` · ${data.withEntry.toLocaleString('it-IT')} con voce di dizionario`
              : ''}
            {` · ${data.offset + 1}–${Math.min(data.offset + PAGE_SIZE, data.total)}`}
          </p>

          <ol className="words__list">
            {data.entries.map((e) => (
              <WordRow key={e.word} entry={e} showOccurrences={tab === 'schede'} />
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

/**
 * Una riga del catalogo: parola, tag grammaticale, link, lunghezza, occorrenze e punti.
 *
 * `showOccurrences` è false nel tab Dizionario: lì le occorrenze sono 0 per
 * costruzione (quelle parole non stanno in nessuna scheda) e mostrare "0×" a ogni
 * riga sarebbe rumore.
 */
function WordRow({ entry, showOccurrences }: { entry: WordCatalogEntry; showOccurrences: boolean }) {
  return (
    <li className="words__row">
      <span className="words__word-wrap">
        <span className="words__word">{entry.word.toUpperCase()}</span>
        {/* Il tag sta fuori da `.words__word`: dentro verrebbe tagliato dal suo
            `overflow: hidden` (era il difetto visibile nell'elenco). */}
        {entry.pos ? <span className="words__tag" title="Categoria grammaticale">{entry.pos}</span> : null}
      </span>
      <span className="words__meta">
        <span className="words__len">{entry.length} lettere</span>
        <span className="words__points">+{entry.points}</span>
      </span>
      {showOccurrences && (
        <span className="words__occ" title={`Presente in ${entry.occurrences} schede`}>
          {entry.occurrences}×
        </span>
      )}
      {/* Link alla voce di Wikizionario: presente solo per le voci autonome. */}
      {entry.hasEntry ? (
        <a
          className="words__link"
          href={`${WIKTIONARY_BASE}${encodeURIComponent(entry.display ?? entry.word)}`}
          target="_blank"
          rel="noopener noreferrer"
          title="Apri la voce su Wikizionario"
        >
          dizionario ↗
        </a>
      ) : (
        <span className="words__link words__link--none" title="Nessuna voce di dizionario disponibile">
          —
        </span>
      )}
    </li>
  );
}
