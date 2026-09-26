import { useEffect, useState } from 'react';
import { SERVER_BASE } from '../net/socket.js';

export interface Definition {
  word: string;
  /** Categoria grammaticale (`sost`, `verb`, …), se nota. */
  pos?: string;
  /** Definizioni, una per senso. Vuoto = nessuna disponibile. */
  senses: string[];
}

/**
 * Carica la definizione di una parola dal server, solo quando `enabled` è true.
 *
 * Perché un hook e non un componente: la definizione non vive più in una
 * nuvoletta separata ma sul RETRO del riquadro di composizione (che ruota). Lo
 * stato del caricamento serve al componente che disegna la carta, quindi è più
 * semplice esporlo come hook.
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
 * Contenuto del RETRO della carta: le definizioni della parola.
 *
 * Non è un pannello a sé (non ha un pulsante che lo apre): è il retro della carta
 * di composizione, quindi qui c'è solo il contenuto. Se la parola non ha una
 * definizione si mostra il link a Wikizionario, così il retro non resta mai
 * vuoto o "rotto".
 */
export function DefinitionBack({ word, def, loading }: { word: string; def: Definition | null; loading: boolean }) {
  const hasSenses = (def?.senses.length ?? 0) > 0;
  return (
    <div className="current-word-card__definition">
      <div className="current-word-card__def-head">
        <strong>{def?.word ?? word}</strong>
        {/*
         * La categoria si mostra solo se è una sola e non è "n.c.": l'indice dei
         * tag può avere valori compositi (`sost verb agg`) che qui sembrerebbero
         * un errore.
         */}
        {def?.pos && def.pos !== 'n.c.' && !def.pos.includes(' ') && (
          <span className="current-word-card__def-pos">{def.pos}</span>
        )}
      </div>
      {loading && !def ? (
        <p className="current-word-card__def-loading">Cerco la definizione…</p>
      ) : hasSenses ? (
        <ol className="current-word-card__def-senses">
          {def!.senses.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      ) : (
        <p className="current-word-card__def-none">
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
