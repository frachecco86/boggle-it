import { MUSIC_TRACKS, type MusicChoice } from '@boggle/shared';

interface Props {
  value: MusicChoice;
  onChange: (choice: MusicChoice) => void;
  /** Titolo della sezione (cambia fra single player e stanza). */
  title?: string;
  hint?: string;
  disabled?: boolean;
}

/** Selettore della musica di sottofondo (tracce reali CC0 incluse). */
export function MusicPicker({ value, onChange, title = 'Musica', hint, disabled }: Props) {
  return (
    <section className="profile-section">
      <h3 className="summary__label">{title}</h3>
      {hint && <p className="profile-section__hint">{hint}</p>}
      <div className="music-list">
        {MUSIC_TRACKS.map((track) => (
          <button
            key={track.id}
            type="button"
            disabled={disabled}
            className={`music-option${value === track.id ? ' music-option--active' : ''}`}
            onClick={() => onChange(track.id)}
          >
            <span className="music-option__label">{track.label}</span>
            <span className="music-option__mood">{track.mood}</span>
            <span className="music-option__credits">{track.credits}</span>
          </button>
        ))}
        <button
          type="button"
          disabled={disabled}
          className={`music-option${value === 'none' ? ' music-option--active' : ''}`}
          onClick={() => onChange('none')}
        >
          <span className="music-option__label">Nessuna musica</span>
          <span className="music-option__mood">solo effetti sonori</span>
        </button>
      </div>
    </section>
  );
}
