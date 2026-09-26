import { useEffect, useMemo, useState } from 'react';
import {
  acceptedWords,
  DIFFICULTIES,
  DIFFICULTY_ORDER,
  difficultyMeta,
  resolveSchedaVariant,
  SCHEDA_VARIANT_LABELS,
  SCHEDA_VARIANTS,
  schedaVariantOf,
  type Difficulty,
  type GridSize,
  type SchedaVariant,
} from '@boggle/shared';
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
  /** Filtro sui criteri di generazione: tutte / standard / full criteria. */
  const [variant, setVariant] = useState<SchedaVariant | 'all'>('all');

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
      if (variant !== 'all' && resolveSchedaVariant(m.variant) !== variant) return false;
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
  }, [catalog, size, difficulty, sort, direction, minScore, variant]);

  const rows = useMemo(() => (scheda ? scheda.grid.split('\n') : []), [scheda]);
  const byLength = useMemo(() => {
    if (!scheda) return [];
    const map = new Map<number, string[]>();
    // Parole che il giocatore può trovare (insieme accettato), non le sole attese.
    for (const word of acceptedWords(scheda)) {
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
    () =>
      scheda
        ? acceptedWords(scheda).reduce((total, w) => total + Math.max(0, w.length - 2), 0)
        : 0,
    [scheda],
  );

  return (
    <div className="screen scheda">
      <div className="scheda__topbar">
        <BackHome />
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

        {/*
         * Filtro sui CRITERI di generazione: permette di vedere solo le schede
         * "full criteria" (quelle con l'etichetta FULL nell'elenco) o solo quelle
         * del catalogo standard.
         */}
        {/* Criteri di generazione: il pulsante "?" spiega i due insiemi, standard e full. */}
        <div className="scheda__score-pills">
          <span className="field__label">Criteri</span>
          {(['all', ...SCHEDA_VARIANTS] as const).map((v) => (
            <button
              key={String(v)}
              className={`pill${variant === v ? ' pill--active' : ''}`}
              onClick={() => setVariant(v as SchedaVariant | 'all')}
            >
              {v === 'all' ? 'Tutti' : SCHEDA_VARIANT_LABELS[v as SchedaVariant]}
            </button>
          ))}
          <InfoBox title="Come nascono le schede" label="Come nascono le schede">
            <p>
              Ogni scheda è una griglia <strong>pre-generata e pre-risolta</strong>: le parole
              trovabili sono calcolate in anticipo, così tutti i giocatori hanno le stesse
              soluzioni. Il catalogo ha <strong>10 schede standard + 5 full</strong> per ognuna
              delle 9 combinazioni dimensione × difficoltà.
            </p>
            <p>
              <strong>Lessico</strong> — valgono <em>tutte</em> le parole del dizionario
              componibili sulla griglia. La difficoltà distingue poi le parole{' '}
              <strong>attese</strong> (le più frequenti, mostrate nel riepilogo) da quelle
              <strong> accettate</strong> (l'intero dizionario): una parola rara fuori fascia
              vale lo stesso. Le abbreviazioni e le etichette di materia non sono parole
              valide.
            </p>
            <p>
              <strong>Rarità</strong> — in griglia entra solo la <code>z</code>, l'unica lettera
              rara italiana. Le lettere non italiane (<code>k w x y j</code>, quasi solo
              prestiti) non vengono mai pescate: erano quasi sempre celle morte.
            </p>
            <p>
              <strong>Criteri <em>standard</em></strong> (il catalogo storico):
            </p>
            <ul>
              <li>
                <strong>Composizione</strong> — vocali 40–52% / 27–38% / 16–27% e{' '}
                <code>z</code> fino al 3% / 12% / 12% (facile / normale / difficile)
              </li>
              <li>
                <strong>Densità</strong> — parole accettate in banda: su 4×4 46–200 /
                25–120 / 10–60
              </li>
              <li>
                <strong>Una parola lunga</strong> — almeno 6 / 7 / 8 lettere (4×4 / 5×5 / 6×6)
              </li>
            </ul>
            <p>
              <strong>Criteri <em>full</em></strong> (più severi):
            </p>
            <ul>
              <li>
                <strong>Composizione</strong> — vocali 40–45% / 30–35% / 16–29%, con almeno
                una <code>z</code> obbligatoria nel difficile
              </li>
              <li>
                <strong>Densità</strong> — banda stretta: su 4×4 121–170 / 60–100 / 25–44
              </li>
              <li>
                <strong>Parole ancora</strong> — più parole lunghe (es. 2 da 6+ nel 4×4
                facile, 4 da 7+ nel 6×6 normale)
              </li>
              <li>
                <strong>Lunghezza media</strong> — dentro una banda misurata (es. 4,4 nel
                4×4 facile; 3,8 nel difficile)
              </li>
              <li>
                <strong>Struttura</strong> — nessuna zona morta: niente consonanti lontane
                da ogni vocale, al massimo una riga/colonna senza vocali, niente <code>h</code>{' '}
                senza <code>c</code>/<code>g</code>
              </li>
            </ul>
            <p>
              Il <strong>punteggio massimo</strong> mostrato è il totale di TUTTE le parole
              trovabili: è il tetto teorico, non quello che si fa in una partita. Si calcola
              come <code>lunghezza − 2</code> per parola.
            </p>
          </InfoBox>
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
                  style={{ ['--level-accent' as string]: difficultyMeta(m.difficulty).theme.accent }}
                >
                  <span className="scheda__item-id">{m.id}</span>
                  {resolveSchedaVariant(m.variant) !== 'standard' && (
                    <span
                      className="scheda__item-variant"
                      title={`Generata con i criteri ${SCHEDA_VARIANT_LABELS[resolveSchedaVariant(m.variant)]}`}
                    >
                      {resolveSchedaVariant(m.variant) === 'full' ? 'FULL' : 'ALE'}
                    </span>
                  )}
                  <span className="scheda__item-meta">
                    <span className="scheda__item-diff">{difficultyMeta(m.difficulty).label}</span>
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
                <h2 className="screen__title">
                  {scheda.id}
                  {schedaVariantOf(scheda) !== 'standard' && (
                    <span className="scheda__variant">
                      {SCHEDA_VARIANT_LABELS[schedaVariantOf(scheda)]}
                    </span>
                  )}
                </h2>
                <p className="scheda__meta">
                  {scheda.size}×{scheda.size} · {difficultyMeta(scheda.difficulty).label} ·{' '}
                  {acceptedWords(scheda).length} parole · più lunga {scheda.longest} lettere ·{' '}
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
