import { useState } from 'react';
import { scoreForWord } from '@boggle/shared';

interface RulesPanelProps {
  /** Mostra la regola del bonus unicità (solo in multiplayer). */
  multiplayer?: boolean;
  /** Aperto all'avvio (utile la prima volta). */
  defaultOpen?: boolean;
}

/**
 * Regole e punteggi, consultabili prima di iniziare.
 *
 * Mostra le fasce di punteggio REALI, derivate da `scoreForWord`, così non
 * possono divergere dal gioco: se cambia la formula, cambia qui.
 */
export function RulesPanel({ multiplayer = false, defaultOpen = false }: RulesPanelProps) {
  const [open, setOpen] = useState(defaultOpen);

  /*
   * I punti sono DERIVATI da `scoreForWord`, non scritti a mano: se la formula
   * cambia, il pannello si aggiorna da solo. Scriverli a mano è il modo sicuro
   * per farli divergere dal gioco (è già successo con la validazione difficoltà).
   */
  const rows = Array.from({ length: 8 }, (_, i) => {
    const length = i + 3; // da 3 a 10
    return {
      label: length === 10 ? '10 o più' : `${length} lettere`,
      points: scoreForWord('x'.repeat(length)),
    };
  });

  return (
    <section className={`rules${open ? ' rules--open' : ''}`}>
      <button
        type="button"
        className="rules__toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="rules__icon" aria-hidden>
          📋
        </span>
        <span className="rules__title">Regole e punteggi</span>
        <span className={`rules__chevron${open ? ' rules__chevron--open' : ''}`}>⌄</span>
      </button>

      {open && (
        <div className="rules__body">
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
                  {r.label === '10 o più' ? `${r.points}+` : r.points}{' '}
                  {r.points === 1 ? 'punto' : 'punti'}
                </span>
              </div>
            ))}
            <p className="rules__note">
              Più lunga è la parola, più vale: una da 9 lettere vale{' '}
              <strong>7 volte</strong> una da 3.
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
      )}
    </section>
  );
}
