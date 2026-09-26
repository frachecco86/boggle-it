import { useState } from 'react';
import { useAppStore } from '../state/store.js';
import { Volume2 } from './icons.js';
import { VolumeSliders } from './VolumeSliders.js';

/**
 * Tasto dei volumi, in basso a sinistra, sempre visibile.
 *
 * Prima era una pillola con tre tasti (effetti, musica, traccia successiva) alta
 * ~50px: occupava spazio in ogni schermata e durante la partita copriva l'angolo
 * della griglia. Ora è un tasto TONDO piccolo e, toccandolo, un pannello si ALZA
 * con l'effetto slide e contiene tutti i volumi (effetti, musica, chat vocale) e
 * il salto di traccia.
 *
 * Perché resta in basso a sinistra: durante una partita non si vuole aprire un
 * menu per zittire la musica, ma il pollice arriva lì senza coprire la griglia.
 */
export function FloatingControls() {
  const { audioSettings, nextMusicTrack } = useAppStore();
  const [open, setOpen] = useState(false);

  const muted = !audioSettings.sfxEnabled && !audioSettings.musicEnabled;

  return (
    <div className={`floating-controls${open ? ' floating-controls--open' : ''}`}>
      {open && (
        <div className="volume-panel" role="group" aria-label="Volumi">
          <VolumeSliders compact />
          <button
            type="button"
            className="volume-panel__next"
            onClick={() => nextMusicTrack()}
            aria-label="Passa alla traccia successiva"
          >
            <span aria-hidden>⏭</span> Traccia successiva
          </button>
        </div>
      )}

      <button
        type="button"
        className={`floating-controls__knob${muted ? ' floating-controls__knob--off' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? 'Chiudi i volumi' : 'Apri i volumi'}
        title="Volumi"
      >
        <Volume2 size={18} aria-hidden />
      </button>
    </div>
  );
}
