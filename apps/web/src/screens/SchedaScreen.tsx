import { useEffect, useMemo, useState } from 'react';
import { DIFFICULTIES, DIFFICULTY_ORDER, type Difficulty, type GridSize } from '@boggle/shared';
import { loadCatalog, loadScheda, type CatalogInfo, type SchedaMeta } from '../game/schedeLoader.js';
import { useAppStore } from '../state/store.js';
import { BackHome } from '../components/BackHome.js';
import { InfoBox } from '../components/InfoBox.js';
import type { Scheda } from '@boggle/shared';

type SortField = 'id' | 'maxScore' | 'longest' | 'words';

const SORTS: { id: SortField; label: string }[] = [
  { id: 'maxScore', label: 'Punteggio massimo' },
  { id: 'longest', label: 'Parola più lunga' },
  { id: 'words', label: 'Numero di parole' },
  { id: 'id', label: 'Numero scheda' },
];

/**
 * "Sfoglia le schede": elenco filtrabile e ordinabile, più il dettaglio.
 *
 * Perché una lista e non solo un selettore: con 750 schede il selettore a tendina
 * rendeva impossibile "trovare una scheda con punteggio alto" o "vedere tutte le
 * 5×5 facili". Qui si filtrano per dimensione, difficoltà e taglia del punteggio,
 * si ordina, e si apre la scheda che interessa.
 *
 * I metadati (punteggio massimo, parole, parola più lunga) arrivano dal catalogo:
 * il client non deve scaricare 750 schede per ordinarle.
 */
export function SchedaScreen() {
  const { schedaId, setSchedaId } = useAppStore();
  const [scheda, setScheda] = useState<Scheda | null>(null);
  const [catalog, setCatalog] = useState<CatalogInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [size, setSize] = useState<GridSize | 'all'>('all');
  const [difficulty, setDifficulty] = useState<Difficulty | 'all'>('all');
  const [sort, setSort] = useState<SortField>('maxScore');
  const [direction, setDirection] = useState<'asc' | 'desc'>('desc');
  const [minScore, setMinScore] = useState<number | 'all'>('all');

  // Carica il catalogo (per il selettore): server, con fallback alle schede incluse.
  useEffect(() => {
    void loadCatalog().then((data) => {
      if (!data) return;
      setCatalog(data);
      if (!schedaId) {
        const first = Object.entries(data.byKey).find(([, n]) => n > 0);
        const firstId = first ? data.ids[first[0]]?.[0] : undefined;
        if (firstId) setSchedaId(firstId);
      }
    });
  }, [schedaId, setSchedaId]);

  // Carica la scheda scelta (server, con fallback offline).
  useEffect(() => {
    if (!schedaId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void loadScheda(schedaId)
      .then((data) => {
        if (cancelled) return;
        if (!data) throw new Error('Scheda non disponibile');
        setScheda(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [schedaId]);

  /**
   * Elenco filtrato e ordinato. Se il server non manda `meta` (versione vecchia o
   * bundle offline) si ricade sugli id senza filtri di punteggio: la pagina resta
   * utilizzabile, solo senza ordinamento per punteggio.
   */
  const list = useMemo((): SchedaMeta[] => {
    if (!catalog) return [];
    const meta: SchedaMeta[] =
      catalog.meta?.length
        ? catalog.meta
        : Object.entries(catalog.ids).flatMap(([key, ids]) => {
            const [s, d] = key.split('-');
            return ids.map((id) => ({
              id,
              size: Number(s) as GridSize,
              difficulty: d as Difficulty,
              words: 0,
              maxScore: 0,
              longest: 0,
            }));
          });

    const filtered = meta.filter((m) => {
      if (size !== 'all' && m.size !== size) return false;
      if (difficulty !== 'all' && m.difficulty !== difficulty) return false;
      if (minScore !== 'all' && m.maxScore < minScore) return false;
      return true;
    });

    const dir = direction === 'asc' ? 1 : -1;
    filtered.sort((a, b) => {
      if (sort === 'id') return dir * a.id.localeCompare(b.id, 'it');
      if (sort === 'maxScore') return dir * (a.maxScore - b.maxScore) || a.id.localeCompare(b.id, 'it');
      if (sort === 'longest') return dir * (a.longest - b.longest) || a.id.localeCompare(b.id, 'it');
      return dir * (a.words - b.words) || a.id.localeCompare(b.id, 'it');
    });
    return filtered;
  }, [catalog, size, difficulty, sort, direction, minScore]);

  const rows = useMemo(() => (scheda ? scheda.grid.split('\n') : []), [scheda]);
  const byLength = useMemo(() => {
    if (!scheda) return [];
    const map = new Map<number, string[]>();
    for (const word of scheda.words) {
      const list = map.get(word.length) ?? [];
      list.push(word);
      map.set(word.length, list);
    }
    return [...map.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([length, words]) => ({ length, points: Math.max(0, length - 2), words: words.sort() }));
  }, [scheda]);

  // Punteggio massimo della scheda mostrata: somma dei punti di tutte le parole.
  const maxScore = useMemo(
    () => (scheda ? scheda.words.reduce((total, w) => total + Math.max(0, w.length - 2), 0) : 0),
    [scheda],
  );

  return (
    <div className="screen scheda">
      <div className="scheda__topbar">
        <BackHome />
        <InfoBox title="Come nascono le schede" label="Come nascono le schede">
          <p>
            Ogni scheda è una griglia <strong>pre-generata e pre-risolta</strong>: l'elenco
            delle parole è calcolato in anticipo, così tutti i giocatori trovano le stesse
            soluzioni e la partita è riproducibile.
          </p>
          <p>
            La <strong>difficoltà</strong> decide quante vocali e consonanti rare entrano
            nella griglia, e per i livelli facili anche <strong>quali parole valgono</strong>:
            <em> molto facile</em> e <em>facile</em> accettano solo parole di uso comune.
          </p>
          <p>
            Ogni scheda rispetta cinque criteri, scelti per rendere il{' '}
            <strong>punteggio massimo prevedibile</strong> entro la stessa difficoltà:
          </p>
          <ul>
            <li>
              <strong>Lessico</strong> — le parole valide (comune o completo)
            </li>
            <li>
              <strong>Quantità</strong> — un minimo di parole, per non annoiare
            </li>
            <li>
              <strong>Lunghezza</strong> — una scala di taglie e un minimo di parole lunghe
            </li>
            <li>
              <strong>Rarità</strong> — quante parole astruse sono ammesse
            </li>
            <li>
              <strong>Punteggio</strong> — il massimo teorico deve stare in una banda
              attorno al valore atteso
            </li>
          </ul>
          <p>
            Il <strong>punteggio massimo</strong> mostrato è il totale di TUTTE le parole
            trovabili: è il tetto teorico, non quello che si fa in una partita. Si calcola
            come <code>lunghezza − 2</code> per parola.
          </p>
        </InfoBox>
      </div>

      {/* Filtri: con 750 schede servono a trovare una fascia di punteggio o un gruppo. */}
      <section className="scheda__filters">
        <label className="leaderboard__filter">
          <span>Griglia</span>
          <select
            value={size}
            onChange={(e) => setSize(e.target.value === 'all' ? 'all' : (Number(e.target.value) as GridSize))}
          >
            <option value="all">Tutte</option>
            {([4, 5, 6] as GridSize[]).map((s) => (
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
          <span>Ordina per</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortField)}>
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        <button className="btn btn--secondary" onClick={() => setDirection((d) => (d === 'asc' ? 'desc' : 'asc'))}>
          {direction === 'desc' ? '↓ Decrescente' : '↑ Crescente'}
        </button>

        {/* Scorciatoie sul punteggio: è il criterio che si usa davvero per scegliere. */}
        <div className="scheda__score-pills">
          <span className="field__label">Punteggio minimo</span>
          {(['all', 100, 250, 500] as const).map((v) => (
            <button
              key={String(v)}
              className={`pill${minScore === v ? ' pill--active' : ''}`}
              onClick={() => setMinScore(v)}
            >
              {v === 'all' ? 'Tutti' : `${v}+`}
            </button>
          ))}
        </div>
      </section>

      {catalog?.offline && (
        <div className="banner banner--warn">
          Server non raggiungibile: elenco dal bundle locale (senza punteggi massimi).
        </div>
      )}

      <div className="scheda__split">
        {/* Elenco: si apre la scheda che interessa. */}
        <section className="scheda__list">
          <p className="words__count">
            <strong>{list.length}</strong> schede
            {catalog ? ` su ${catalog.total}` : ''}
          </p>
          <ul className="scheda__items">
            {list.slice(0, 200).map((m) => (
              <li key={m.id}>
                <button
                  className={`scheda__item${m.id === schedaId ? ' scheda__item--active' : ''}`}
                  onClick={() => setSchedaId(m.id)}
                  style={{ ['--level-accent' as string]: DIFFICULTIES[m.difficulty].theme.accent }}
                >
                  <span className="scheda__item-id">{m.id}</span>
                  <span className="scheda__item-meta">
                    <span className="scheda__item-diff">{DIFFICULTIES[m.difficulty].label}</span>
                    <span className="scheda__item-score" title="Punteggio massimo ottenibile">
                      {m.maxScore} pt
                    </span>
                    <span className="scheda__item-extra" title="Parole · parola più lunga">
                      {m.words}p · max {m.longest}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {list.length > 200 && (
            <p className="screen__hint">
              Mostrate le prime 200: usa i filtri per restringere.
            </p>
          )}
        </section>

        {/* Dettaglio della scheda selezionata. */}
        <section className="scheda__detail">
          {error && <div className="banner banner--error">{error}</div>}
          {loading && !scheda && <p className="scheda__loading">Carico la scheda…</p>}

          {scheda && (
            <>
              <header className="scheda__head">
                <h2 className="screen__title">{scheda.id}</h2>
                <p className="scheda__meta">
                  {scheda.size}×{scheda.size} · {DIFFICULTIES[scheda.difficulty].label} ·{' '}
                  {scheda.words.length} parole · più lunga {scheda.longest} lettere ·{' '}
                  <strong>massimo {maxScore} punti</strong>
                </p>
              </header>

              <div className="scheda__grid" style={{ ['--grid-size' as string]: scheda.size }}>
                {rows.flatMap((row, ri) =>
                  [...row].map((ch, ci) => (
                    <span key={`${ri}-${ci}`} className="scheda__cell">
                      {ch === 'q' ? 'Qu' : ch.toUpperCase()}
                    </span>
                  )),
                )}
              </div>

              <section className="scheda__words">
                <h3 className="summary__label">Tutte le parole trovabili</h3>
                {byLength.map(({ length, points, words }) => (
                  <div key={length} className="scheda__group">
                    <div className="scheda__group-head">
                      <strong>{length} lettere</strong>
                      <span className="scheda__points">
                        {points} {points === 1 ? 'punto' : 'punti'}
                      </span>
                      <span className="scheda__count">{words.length}</span>
                    </div>
                    <div className="chip-list chip-list--compact">
                      {words.map((w) => (
                        <span key={w} className="chip chip--small">
                          {w.toUpperCase()}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </section>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
