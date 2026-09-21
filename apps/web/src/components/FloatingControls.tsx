import { useAppStore } from '../state/store.js';

/**
 * Controlli audio rapidi, sempre visibili in basso a sinistra.
 *
 * Tre icone:
 *  - 🔊/🔇 effetti sonori (on/off)
 *  - 🎵/🔕 musica (on/off)
 *  - ⏭ traccia successiva (se la musica era spenta, la riattiva)
 *
 * Perché sempre visibili e non dentro un pannello: durante una partita non si
 * vuole aprire un menu per zittire la musica. I volumi fini restano nel pannello
 * Audio della home.
 */
export function FloatingControls() {
  const { audioSettings, setAudioSettings, nextMusicTrack } = useAppStore();

  return (
    <div className="floating-controls" role="group" aria-label="Controlli audio rapidi">
      <button
        type="button"
        className={`floating-controls__btn${audioSettings.sfxEnabled ? '' : ' floating-controls__btn--off'}`}
        onClick={() => setAudioSettings({ sfxEnabled: !audioSettings.sfxEnabled })}
        title={audioSettings.sfxEnabled ? 'Disattiva gli effetti sonori' : 'Attiva gli effetti sonori'}
        aria-label={audioSettings.sfxEnabled ? 'Disattiva gli effetti sonori' : 'Attiva gli effetti sonori'}
        aria-pressed={audioSettings.sfxEnabled}
      >
        <span aria-hidden>{audioSettings.sfxEnabled ? '🔊' : '🔇'}</span>
      </button>

      <button
        type="button"
        className={`floating-controls__btn${audioSettings.musicEnabled ? '' : ' floating-controls__btn--off'}`}
        onClick={() => setAudioSettings({ musicEnabled: !audioSettings.musicEnabled })}
        title={audioSettings.musicEnabled ? 'Disattiva la musica' : 'Attiva la musica'}
        aria-label={audioSettings.musicEnabled ? 'Disattiva la musica' : 'Attiva la musica'}
        aria-pressed={audioSettings.musicEnabled}
      >
        <span aria-hidden>{audioSettings.musicEnabled ? '🎵' : '🎵'}</span>
      </button>

      <button
        type="button"
        className="floating-controls__btn"
        onClick={() => nextMusicTrack()}
        title="Traccia successiva"
        aria-label="Passa alla traccia successiva"
      >
        <span aria-hidden>⏭</span>
      </button>
    </div>
  );
}
