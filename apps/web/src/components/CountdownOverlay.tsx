import { useEffect, useRef, useState } from 'react';
import { audio } from '../audio/AudioEngine.js';

interface CountdownOverlayProps {
  /** Secondi da contare (default 3). */
  from?: number;
  /** Chiamato quando il countdown finisce: si può iniziare. */
  onComplete: () => void;
}

/**
 * Countdown animato di inizio round: 3… 2… 1… VIA!
 *
 * Animazione e suono collaborano per dare il senso di partenza:
 *  - ogni numero compare con uno "scatto" (scale + fade) e un tick sonoro
 *  - il numero è circondato da un anello che si riempie
 *  - all'ultimo passo (VIA!) arriva un accordo ascendente e il testo diventa verde
 *
 * Il suono è nell'`AudioEngine`, non qui: così rispetta le impostazioni audio
 * dell'utente (volume, muto) senza duplicare la logica.
 */
export function CountdownOverlay({ from = 3, onComplete }: CountdownOverlayProps) {
  const [step, setStep] = useState(from);
  const doneRef = useRef(false);

  useEffect(() => {
    // Il primo tick parte subito: il "3" appare insieme al suono.
    audio.play('countdown-tick');

    const tick = window.setInterval(() => {
      setStep((s) => {
        const next = s - 1;
        if (next > 0) {
          audio.play('countdown-tick');
        } else if (next === 0) {
          // "VIA!": accordo ascendente, poi si parte.
          audio.play('countdown-go');
        }
        return next;
      });
    }, 900);

    return () => window.clearInterval(tick);
  }, []);

  // Alla fine del countdown: si avvia la partita (una sola volta).
  useEffect(() => {
    if (step > 0 || doneRef.current) return;
    doneRef.current = true;
    // Breve pausa per far vedere "VIA!" prima della griglia.
    const t = window.setTimeout(onComplete, 550);
    return () => window.clearTimeout(t);
  }, [step, onComplete]);

  const isGo = step <= 0;
  const label = isGo ? 'VIA!' : String(step);
  const progress = isGo ? 1 : (from - step) / from;

  return (
    <div className="countdown-overlay" role="status" aria-live="assertive">
      <div className={`countdown ${isGo ? 'countdown--go' : ''}`}>
        {/* Anello che si riempie a ogni numero. */}
        <svg className="countdown__ring" viewBox="0 0 100 100" aria-hidden>
          <circle className="countdown__ring-bg" cx="50" cy="50" r="45" />
          <circle
            className="countdown__ring-fill"
            cx="50"
            cy="50"
            r="45"
            style={{ strokeDashoffset: `${283 * (1 - progress)}` }}
          />
        </svg>

        {/* Il `key` è essenziale: cambiando numero, React ricrea l'elemento e
            l'animazione CSS riparte da capo (altrimenti si vedrebbe una volta sola). */}
        <span key={label} className="countdown__num">
          {label}
        </span>
      </div>

      <p className="countdown__hint">{isGo ? 'Trova più parole che puoi!' : 'Preparati…'}</p>
    </div>
  );
}
