import { useState } from 'react';
import { useAppStore } from '../state/store.js';

/** Pannello impostazioni audio: effetti, musica e volumi. */
export function AudioSettings() {
  const { audioSettings, setAudioSettings } = useAppStore();
  const [open, setOpen] = useState(false);

  return (
    <section className="audio-settings">
      <button className="audio-settings__toggle" onClick={() => setOpen((v) => !v)}>
        <span className="audio-settings__icon" aria-hidden>
          {audioSettings.sfxEnabled || audioSettings.musicEnabled ? '🔊' : '🔇'}
        </span>
        Audio
        <span className={`audio-settings__chevron${open ? ' audio-settings__chevron--open' : ''}`}>⌄</span>
      </button>

      {open && (
        <div className="audio-settings__panel">
          <label className="audio-settings__row">
            <input
              type="checkbox"
              checked={audioSettings.sfxEnabled}
              onChange={(e) => setAudioSettings({ sfxEnabled: e.target.checked })}
            />
            <span>Effetti sonori</span>
          </label>
          <label className="audio-settings__row audio-settings__row--slider">
            <span>Volume effetti</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={audioSettings.sfxVolume}
              disabled={!audioSettings.sfxEnabled}
              onChange={(e) => setAudioSettings({ sfxVolume: Number(e.target.value) })}
            />
          </label>

          <label className="audio-settings__row">
            <input
              type="checkbox"
              checked={audioSettings.musicEnabled}
              onChange={(e) => setAudioSettings({ musicEnabled: e.target.checked })}
            />
            <span>Musica di sottofondo</span>
          </label>
          <label className="audio-settings__row audio-settings__row--slider">
            <span>Volume musica</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={audioSettings.musicVolume}
              disabled={!audioSettings.musicEnabled}
              onChange={(e) => setAudioSettings({ musicVolume: Number(e.target.value) })}
            />
          </label>
        </div>
      )}
    </section>
  );
}
