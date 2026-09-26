import { useEffect, useState } from 'react';
import { SERVER_BASE } from '../net/socket.js';

export interface Definition {
  word: string;
  /** Categoria grammaticale (`sost`, `verb`, …), se nota. */
  pos?: string;
  /** Definizioni, una per senso. Vuoto = nessuna disponibile. */
  senses: string[];
  /** Nota grammaticale per le forme flesse (`femminile di mulo`, `plurale di iato`). */
  note?: string;
}

/**
 * Carica la definizione di una parola dal server, solo quando `enabled` è true.
 *
 * La definizione non vive in una nuvoletta ma in un pannello che SCORRE dentro
 * il riquadro di composizione (vedi `CurrentWord`): lo stato del caricamento
 * serve a chi disegna quel pannello, quindi è più semplice esporlo come hook.
 */
export function useWordDefinition(word: string, enabled: boolean) {
  const [def, setDef] = useState<Definition | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || def) return;
    let alive = true;
    const controller = new AbortController();
    setLoading(true);
    fetch(`${SERVER_BASE}/words/${encodeURIComponent(word)}/definition`, {
      signal: controller.signal,
    })
      .then((res) => (res.ok ? (res.json() as Promise<Definition>) : null))
      .then((data) => {
        if (alive) setDef(data ?? { word, senses: [] });
      })
      .catch(() => {
        if (alive) setDef({ word, senses: [] });
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [enabled, def, word]);

  // Cambiando parola la definizione precedente non vale più.
  useEffect(() => {
    setDef(null);
  }, [word]);

  return { def, loading };
}

/**
 * Contenuto del pannello della definizione.
 *
 * Ordine richiesto: PRIMA le definizioni (il significato), POI la nota
 * grammaticale (la morfologia) in tono attenuato. Così `amo` mostra il
 * significato di `amare` e sotto "prima persona di amare".
 *
 * Se non c'è nulla si mostra il link a Wikizionario: il pannello non resta mai
 * vuoto o "rotto".
 *
 * Il testo usa lo STESSO font del resto del gioco (`--font`), solo ridimensionato:
 * è un pannello dentro il riquadro, non una finestra a sé.
 */
export function DefinitionPanel({
  word,
  def,
  loading,
}: {
  word: string;
  def: Definition | null;
  loading: boolean;
}) {
  const hasSenses = (def?.senses.length ?? 0) > 0;
  return (
    <div className="current-word-panel__body">
      <div className="current-word-panel__head">
        <strong className="current-word-panel__word">{def?.word ?? word}</strong>
        {/*
         * La categoria si mostra solo se è una sola e non è "n.c.": l'indice dei
         * tag può avere valori compositi (`sost verb agg`) che qui sembrerebbero
         * un errore.
         */}
        {def?.pos && def.pos !== 'n.c.' && !def.pos.includes(' ') && (
          <span className="current-word-panel__pos">{def.pos}</span>
        )}
      </div>
      {loading && !def ? (
        <p className="current-word-panel__loading">Cerco la definizione…</p>
      ) : hasSenses || def?.note ? (
        <>
          {hasSenses && (
            <ol className="current-word-panel__senses">
              {def!.senses.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          )}
          {def?.note && <p className="current-word-panel__note">— {def.note}</p>}
        </>
      ) : (
        <p className="current-word-panel__none">
          Definizione non disponibile nel dizionario interno.{' '}
          <a
            href={`https://it.wiktionary.org/wiki/${encodeURIComponent(word)}`}
            target="_blank"
            rel="noreferrer"
          >
            Apri su Wikizionario ↗
          </a>
        </p>
      )}
    </div>
  );
}
