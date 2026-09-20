import { useEffect, useMemo, useState } from 'react';
import { scoreForWord, type Scheda } from '@boggle/shared';
import { SERVER_BASE } from '../net/socket.js';
import { useAppStore } from '../state/store.js';

interface CatalogInfo {
  total: number;
  byKey: Record<string, number>;
  /** Id delle schede raggruppati per chiave `size-difficulty`. */
  ids: Record<string, string[]>;
}

/**
 * Pagina scheda: griglia e TUTTE le parole trovabili.
 *
 * Le soluzioni sono pubbliche per scelta di prodotto (vedi SPEC §3.5): serve anche
 * a studiare le griglie. L'elenco è raggruppato per lunghezza, con i punti.
 */
export function SchedaScreen() {
  const { schedaId, setSchedaId, setScreen } = useAppStore();
  const [scheda, setScheda] = useState<Scheda | null>(null);
  const [catalog, setCatalog] = useState<CatalogInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Carica il catalogo (per il selettore) una volta sola.
  useEffect(() => {
    fetch(`${SERVER_BASE}/schede`)
      .then(async (res) => (res.ok ? ((await res.json()) as CatalogInfo) : null))
      .then((data) => {
        if (!data) return;
        setCatalog(data);
        if (!schedaId) {
          const first = Object.entries(data.byKey).find(([, n]) => n > 0);
          const firstId = first ? data.ids[first[0]]?.[0] : undefined;
          if (firstId) setSchedaId(firstId);
        }
      })
      .catch(() => setCatalog(null));
  }, [schedaId, setSchedaId]);

  // Carica la scheda scelta.
  useEffect(() => {
    if (!schedaId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`${SERVER_BASE}/schede/${encodeURIComponent(schedaId)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as Scheda;
      })
      .then((data) => {
        if (!cancelled) setScheda(data);
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
      .map(([length, words]) => ({ length, points: scoreForWord('x'.repeat(length)), words: words.sort() }));
  }, [scheda]);

  return (
    <div className="screen scheda">
      <div className="scheda__topbar">
        <button className="btn btn--ghost" onClick={() => setScreen('home')}>
          ← Home
        </button>
        <div className="scheda__picker">
          <label className="field__label" htmlFor="scheda-select">
            Scheda
          </label>
          <select
            id="scheda-select"
            className="field__input"
            value={schedaId ?? ''}
            onChange={(e) => setSchedaId(e.target.value || null)}
          >
            {catalog
              ? Object.entries(catalog.byKey)
                  .filter(([, n]) => n > 0)
                  .flatMap(([key]) =>
                    (catalog.ids[key] ?? []).map((id) => (
                      <option key={id} value={id}>
                        {id}
                      </option>
                    )),
                  )
              : schedaId && <option value={schedaId}>{schedaId}</option>}
          </select>
        </div>
      </div>

      {error && <div className="banner banner--error">{error}</div>}
      {loading && !scheda && <p className="scheda__loading">Carico la scheda…</p>}

      {scheda && (
        <>
          <header className="scheda__head">
            <h2 className="screen__title">{scheda.id}</h2>
            <p className="scheda__meta">
              {scheda.size}×{scheda.size} · {scheda.difficulty} · {scheda.words.length} parole · più
              lunga {scheda.longest} lettere
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
    </div>
  );
}
