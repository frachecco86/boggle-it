import { useAppStore } from '../state/store.js';

/**
 * I tre volumi del gioco, in forma compatta: icona + cursore.
 *
 * Un solo componente per i due posti in cui servono:
 *  - la home (sempre visibile, "regolatori subito a portata");
 *  - il pannello che si alza dal tasto volumi durante la partita.
 *
 * Perché le icone al posto delle scritte: in partita lo spazio è quello che è e
 * nella home il blocco deve stare in poche righe. Le etichette restano nel
 * `aria-label`, quindi chi usa un lettore di schermo le sente comunque.
 *
 * La CHAT VOCALE ha il suo volume separato: è l'unico modo per sentire gli altri
 * senza alzare anche musica ed effetti (o viceversa).
 */
export function VolumeSliders({ compact = false }: { compact?: boolean }) {
  const { audioSettings, setAudioSettings } = useAppStore();

  return (
    <div className={`volume-sliders${compact ? ' volume-sliders--compact' : ''}`}>
      <label className="volume-slider" title="Volume effetti sonori">
        <span className="volume-slider__icon" aria-hidden>
          {audioSettings.sfxEnabled ? '🔊' : '🔇'}
        </span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={audioSettings.sfxVolume}
          disabled={!audioSettings.sfxEnabled}
          aria-label="Volume effetti sonori"
          onChange={(e) => setAudioSettings({ sfxVolume: Number(e.target.value) })}
        />
        <button
          type="button"
          className="volume-slider__toggle"
          aria-pressed={audioSettings.sfxEnabled}
          aria-label={audioSettings.sfxEnabled ? 'Disattiva gli effetti sonori' : 'Attiva gli effetti sonori'}
          onClick={() => setAudioSettings({ sfxEnabled: !audioSettings.sfxEnabled })}
        >
          {audioSettings.sfxEnabled ? 'on' : 'off'}
        </button>
      </label>

      <label className="volume-slider" title="Volume musica">
        <span className="volume-slider__icon" aria-hidden>
          🎵
        </span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={audioSettings.musicVolume}
          disabled={!audioSettings.musicEnabled}
          aria-label="Volume musica"
          onChange={(e) => setAudioSettings({ musicVolume: Number(e.target.value) })}
        />
        <button
          type="button"
          className="volume-slider__toggle"
          aria-pressed={audioSettings.musicEnabled}
          aria-label={audioSettings.musicEnabled ? 'Disattiva la musica' : 'Attiva la musica'}
          onClick={() => setAudioSettings({ musicEnabled: !audioSettings.musicEnabled })}
        >
          {audioSettings.musicEnabled ? 'on' : 'off'}
        </button>
      </label>

      <label className="volume-slider" title="Volume chat vocale">
        <span className="volume-slider__icon" aria-hidden>
          🎙️
        </span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          // Il valore può mancare nelle preferenze salvate da versioni precedenti.
          value={audioSettings.voiceVolume ?? 1}
          aria-label="Volume chat vocale"
          onChange={(e) => setAudioSettings({ voiceVolume: Number(e.target.value) })}
        />
      </label>
    </div>
  );
}
