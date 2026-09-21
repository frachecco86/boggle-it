import { useEffect, useRef, useState, type ReactNode } from 'react';

interface Props {
  /** Titolo del pannello. */
  title: string;
  /** Contenuto: paragrafi, elenchi, link. */
  children: ReactNode;
  /** Etichetta del pulsante, per l'accessibilità. */
  label?: string;
}

/**
 * Pulsante "?" che apre un pannello informativo.
 *
 * Perché un popover e non una pagina separata: le informazioni servono MENTRE si
 * guarda l'elenco (perché una scheda ha quel punteggio, cosa significa un tag),
 * quindi portare l'utente altrove lo farebbe perdere il contesto.
 *
 * Dettagli di comportamento:
 *  - si apre con click (niente hover: sui telefoni non esiste);
 *  - si chiude con Escape, cliccando fuori o sul pulsante;
 *  - il pannello è `position: absolute` dentro un contenitore `relative`, così
 *    resta ancorato al pulsante anche scorrendo;
 *  - `role="dialog"` + `aria-modal="false"`: è un pannello non bloccante, il resto
 *    della pagina resta utilizzabile.
 */
export function InfoBox({ title, children, label = 'Informazioni' }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      // Click fuori dal componente: chiude. Il click sul pulsante è gestito dal
      // suo handler, che inverte lo stato.
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  return (
    <div className="info-box" ref={rootRef}>
      <button
        type="button"
        className={`info-box__btn${open ? ' info-box__btn--open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Chiudi le informazioni' : label}
        aria-expanded={open}
        title={label}
      >
        <span aria-hidden>?</span>
      </button>

      {open && (
        <div className="info-box__panel" role="dialog" aria-label={title}>
          <div className="info-box__head">
            <h3 className="info-box__title">{title}</h3>
            <button
              type="button"
              className="info-box__close"
              onClick={() => setOpen(false)}
              aria-label="Chiudi"
            >
              ✕
            </button>
          </div>
          <div className="info-box__body">{children}</div>
        </div>
      )}
    </div>
  );
}
