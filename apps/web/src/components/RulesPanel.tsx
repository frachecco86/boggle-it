import { useEffect, useRef, useState } from 'react';
import { scoreForWord } from '@boggle/shared';
import { Close, FileText } from './icons.js';

interface RulesPanelProps {
  /** Mostra la regola del bonus unicità (solo in multiplayer). */
  multiplayer?: boolean;
  /** Aperto all'avvio (utile la prima volta). */
  defaultOpen?: boolean;
}

/**
 * Regole e punteggi, consultabili prima di iniziare.
 *
 * PERCHÉ UN MODAL E NON UN MENÙ A TENDINA (com'era prima)
 * ------------------------------------------------------
 * Il pannello stava DENTRO il foglio "Impostazioni partita", che ha
 * `max-height` e `overflow-y: auto`. Aprendosi in linea, il contenuto cresceva
 * oltre l'altezza disponibile: la tabella dei punteggi finiva tagliata e per
 * leggerla serviva uno scorrimento annidato (quello del pannello dentro quello
 * del foglio), che su telefono è scomodo e nell'app Android ancora di più.
 *
 * Ora è un livello sopra al foglio, con altezza propria e un solo scorrimento:
 * il foglio sotto resta esattamente com'era e i punteggi si leggono tutti.
 *
 * Mostra le fasce di punteggio REALI, derivate da `scoreForWord`, così non
 * possono divergere dal gioco: se cambia la formula, cambia qui.
 */
export function RulesPanel({ multiplayer = false, defaultOpen = false }: RulesPanelProps) {
  const [open, setOpen] = useState(defaultOpen);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  /*
   * I punti sono DERIVATI da `scoreForWord`, non scritti a mano: se la formula
   * cambia, il pannello si aggiorna da solo. Scriverli a mano è il modo sicuro
   * per farli divergere dal gioco (è già successo con la validazione difficoltà).
   */
  const rows = Array.from({ length: 8 }, (_, i) => {
    const length = i + 3; // da 3 a 10
    return {
      // Ogni fascia è una lunghezza ESATTA: qui non si appiattisce nulla.
      // Con l'etichetta "10 o più" la tabella suggeriva un tetto dopo le 10
      // lettere, ma la scala cresce di un punto per lettera senza fermarsi.
      label: `${length} lettere`,
      points: scoreForWord('x'.repeat(length)),
    };
  });

  /*
   * Escape chiude. È il gesto atteso da un pannello sovrapposto, e senza questo
   * l'unica via d'uscita sarebbe il tasto ✕ (o il click fuori, che su schermi
   * piccoli è facile mancare).
   */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        /*
         * `stopPropagation`: il foglio delle impostazioni ha a sua volta una
         * chiusura su Escape. Senza questo, un solo Escape chiuderebbe ENTRAMBI
         * e l'utente perderebbe le impostazioni che stava scegliendo.
         */
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open]);

  /*
   * Il fuoco va sulla ✕ all'apertura: su desktop e con la tastiera il pannello
   * è subito controllabile, e i lettori di schermo annunciano il titolo.
   */
  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  const close = () => setOpen(false);

  return (
    <>
      <button
        type="button"
        className="rules__toggle"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className="rules__icon" aria-hidden>
          <FileText size={18} />
        </span>
        <span className="rules__title">Regole e punteggi</span>
        <span className="rules__chevron" aria-hidden>
          ›
        </span>
      </button>

      {open && (
        <div className="rules-modal" role="dialog" aria-modal="true" aria-label="Regole e punteggi">
          {/* Click fuori dal pannello: chiude. È il gesto che ci si aspetta. */}
          <button
            type="button"
            className="rules-modal__backdrop"
            onClick={close}
            aria-label="Chiudi regole e punteggi"
          />

          <div className="rules-modal__panel" ref={panelRef}>
            <header className="rules-modal__head">
              <h3 className="rules-modal__title">
                <span className="rules-modal__title-icon" aria-hidden>
                  <FileText size={18} />
                </span>
                Regole e punteggi
              </h3>
              <button
                type="button"
                className="rules-modal__close"
                onClick={close}
                ref={closeRef}
                aria-label="Chiudi regole e punteggi"
              >
                <Close size={18} />
              </button>
            </header>

            <div className="rules-modal__body">
              <div className="rules__how">
                <p className="rules__how-line">
                  Trova parole di <strong>almeno 3 lettere</strong> scorrendo il dito sulle
                  lettere <strong>adiacenti</strong> (anche in diagonale).
                </p>
                <p className="rules__how-line">
                  Ogni lettera si può usare <strong>una volta sola</strong> per parola.
                  Tornare indietro sull'ultima lettera annulla l'ultimo passo.
                </p>
                <p className="rules__how-line">
                  Le parole valide sono quelle presenti nella scheda: puoi vederle
                  nell'anteprima.
                </p>
              </div>

              <div className="rules__scores">
                <span className="rules__label">Punteggio per parola</span>
                {rows.map((r) => (
                  <div key={r.label} className="rules__row">
                    <span className="rules__row-label">{r.label}</span>
                    <span className="rules__row-dots" aria-hidden />
                    <span className="rules__row-points">
                      {r.points} {r.points === 1 ? 'punto' : 'punti'}
                    </span>
                  </div>
                ))}
                <p className="rules__note">
                  Più lunga è la parola, più vale: una da 9 lettere vale{' '}
                  <strong>7 volte</strong> una da 3. La scala non ha un tetto: ogni
                  lettera oltre la terza aggiunge un punto.
                </p>
              </div>

              {multiplayer && (
                <div className="rules__multi">
                  <span className="rules__label">In multiplayer</span>
                  <p className="rules__how-line">
                    Una parola trovata da <strong>un solo giocatore</strong> vale{' '}
                    <strong>il doppio</strong>. Se la trovano in più, ognuno prende i punti
                    normali.
                  </p>
                  <p className="rules__how-line rules__example">
                    Esempio: <em>strada</em> (6 lettere) → <strong>4 punti</strong>, oppure{' '}
                    <strong>8</strong> se la trovi solo tu.
                  </p>
                </div>
              )}
            </div>

            <footer className="rules-modal__foot">
              <button type="button" className="btn btn--primary" onClick={close}>
                Ho capito
              </button>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}
