import { useState } from 'react';
import { VolumeSliders } from './VolumeSliders.js';
import { Volume2 } from './icons.js';

/**
 * Audio della home: i tre volumi (effetti, musica, chat vocale) dietro un tasto
 * compatto con pannello a discesa.
 *
 * PERCHÉ UN DROPDOWN E NON IL BLOCCO SEMPRE APERTO: i tre cursori sempre in linea
 * occupavano una fascia intera della home (~90px), che è la schermata dove lo
 * spazio è più conteso (profilo, modalità, tasti, codice stanza). Ora resta una
 * sola riga con il tasto, e i cursori compaiono solo quando servono.
 *
 * PERCHÉ NON È UN TASTO FLOTTANTE: gli angoli in alto sono già presi dalla barra
 * fissa (interruttore del tema e Home a sinistra, Classifica/Parole/versione a
 * destra). Un tondo in più coprirebbe quei comandi o il titolo della home. Qui
 * resta nel flusso, subito sotto le azioni di gioco.
 *
 * Il pannello riusa `VolumeSliders`: sono gli stessi cursori del tasto volumi in
 * partita, quindi il mixer si comporta allo stesso modo nelle due schermate.
 */
export function AudioSettings() {
  const [open, setOpen] = useState(false);

  return (
    <div className={`home-audio${open ? ' home-audio--open' : ''}`}>
      <button
        type="button"
        className="home-audio__toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? 'Chiudi i volumi' : 'Apri i volumi'}
      >
        <Volume2 size={16} aria-hidden />
        <span>Volume</span>
      </button>

      {open && (
        <div className="home-audio__panel" role="group" aria-label="Volumi audio">
          <VolumeSliders compact />
        </div>
      )}
    </div>
  );
}
