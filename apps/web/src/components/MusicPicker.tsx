import type { MusicTrackMeta } from '@boggle/shared';
import { useAppStore } from '../state/store.js';

interface Props {
  value: string;
  onChange: (choice: string) => void;
  /** Titolo della sezione (cambia fra single player e stanza). */
  title?: string;
  hint?: string;
  disabled?: boolean;
}

/**
 * Selettore della musica di sottofondo.
 *
 * L'elenco arriva dal catalogo DINAMICO (store): tracce incluse nel bundle +
 * MP3 caricati dall'admin. Le tracce caricate sono condivise, quindi compaiono
 * a tutti i giocatori.
 */
export function MusicPicker({ value, onChange, title = 'Musica', hint, disabled }: Props) {
  const catalog = useAppStore((s) => s.musicCatalog);

  const renderTrack = (track: MusicTrackMeta) => (
    <button
      key={track.id}
      type="button"
      disabled={disabled}
      className={`music-option${value === track.id ? ' music-option--active' : ''}`}
      onClick={() => onChange(track.id)}
    >
      <span className="music-option__label">
        {track.label}
        {track.uploaded && <span className="music-option__badge">nuova</span>}
      </span>
      <span className="music-option__mood">{track.mood}</span>
      <span className="music-option__credits">{track.credits}</span>
    </button>
  );

  return (
    <section className="profile-section">
      <h3 className="summary__label">{title}</h3>
      {hint && <p className="profile-section__hint">{hint}</p>}
      <div className="music-list">
        {catalog.map(renderTrack)}
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
