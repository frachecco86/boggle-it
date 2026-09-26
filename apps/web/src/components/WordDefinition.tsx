import { useEffect, useRef, useState } from 'react';
import { SERVER_BASE } from '../net/socket.js';

interface Definition {
  word: string;
  /** Categoria grammaticale (`sost`, `verb`, …), se nota. */
  pos?: string;
  /** Definizioni, una per senso. Vuoto = nessuna disponibile. */
  senses: string[];
}

interface Props {
  /** Parola di cui mostrare la definizione. */
  word: string;
}

/**
 * Pulsante "?" con la DEFINIZIONE della parola, per la modalità apprendimento.
 *
 * Perché un pulsante e non mostrare sempre la definizione: il riquadro di
 * composizione è piccolo e la definizione può essere lunga. Il giocatore la apre
 * quando vuole sapere cosa significa la parola appena trovata (o suggerita).
 *
 * Le definizioni arrivano dal server (`/words/:word/definition`), estratte dal
 * dump di Wikizionario. Se la parola non ha una definizione, il pulsante si apre
 * lo stesso e mostra il link alla voce su Wikizionario — così non resta mai
 * "rotto" e si può comunque approfondire.
 *
 * Comportamento: chiude con Escape o cliccando fuori (come l'InfoBox).
 */
export function WordDefinition({ word }: Props) {
  const [open, setOpen] = useState(false);
  const [def, setDef] = useState<Definition | null>(null);
  const [loading, setLoading] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Chiude con Escape o con un click fuori dal componente.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  // Carica la definizione la prima volta che si apre (non prima: la maggior
  // parte delle parole non viene mai aperta).
  useEffect(() => {
    if (!open || def || loading) return;
    setLoading(true);
    let alive = true;
    const controller = new AbortController();
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
  }, [open, def, loading, word]);

  // Cambiando parola (parola nuova trovata) la definizione precedente non vale.
  useEffect(() => {
    setDef(null);
  }, [word]);

  const hasSenses = (def?.senses.length ?? 0) > 0;

  return (
    <div className="word-def" ref={rootRef}>
      <button
        type="button"
        className={`word-def__btn${open ? ' word-def__btn--open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Chiudi la definizione' : `Definizione di ${word}`}
        aria-expanded={open}
        title="Che parola è?"
      >
        ?
      </button>

      {open && (
        <div className="word-def__panel" role="dialog" aria-label={`Definizione di ${word}`}>
          <div className="word-def__head">
            <strong className="word-def__title">{def?.word ?? word}</strong>
            {/*
             * La categoria si mostra solo se è una sola e non è "n.c.":
             * l'indice dei tag può avere valori compositi (`sost verb agg`) che
             * nel pannello sembrerebbero un errore. Meglio ometterla che
             * mostrare rumore.
             */}
            {def?.pos && def.pos !== 'n.c.' && !def.pos.includes(' ') && (
              <span className="word-def__pos">{def.pos}</span>
            )}
          </div>
          {loading && !def ? (
            <p className="word-def__loading">Cerco la definizione…</p>
          ) : hasSenses ? (
            <ol className="word-def__senses">
              {def!.senses.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          ) : (
            <p className="word-def__none">
              Definizione non disponibile nel dizionario interno.
              <a
                className="word-def__link"
                href={`https://it.wiktionary.org/wiki/${encodeURIComponent(word)}`}
                target="_blank"
                rel="noreferrer"
              >
                Apri su Wikizionario ↗
              </a>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
