import { useEffect, useMemo, useRef, useState } from 'react';
import {
  PHOTO_FILTERS,
  canvasToDataUrl,
  renderPhoto,
  type PhotoFilterId,
} from '../game/photoFilters.js';

interface Props {
  /** Data URL JPEG del ritaglio con filtro applicato, o null per rimuovere. */
  onChange: (dataUrl: string | null) => void;
  /** URL attuale della foto salvata (se presente). */
  currentUrl?: string;
  busy?: boolean;
}

/**
 * Editor foto profilo: scegli un file, ritaglia in quadrato, prova i filtri
 * (tutti in canvas, nessuna API esterna) e conferma.
 */
export function PhotoEditor({ onChange, currentUrl, busy }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [filter, setFilter] = useState<PhotoFilterId>('cartoon');
  const [error, setError] = useState<string | null>(null);

  // Disegna l'anteprima quando cambiano foto o filtro.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!image) return;
    const rendered = renderPhoto(image, filter);
    canvas.width = rendered.width;
    canvas.height = rendered.height;
    canvas.getContext('2d')!.drawImage(rendered, 0, 0);
  }, [image, filter]);

  const preview = useMemo(() => {
    if (!image) return null;
    return canvasToDataUrl(renderPhoto(image, filter));
  }, [image, filter]);

  const handleFile = (file: File) => {
    setError(null);
    if (!file.type.startsWith('image/')) {
      setError('Serve un file immagine');
      return;
    }
    const img = new Image();
    img.onload = () => setImage(img);
    img.onerror = () => setError('Immagine non leggibile');
    img.src = URL.createObjectURL(file);
  };

  return (
    <div className="photo-editor">
      <div className="photo-editor__preview">
        <canvas ref={canvasRef} className="photo-editor__canvas" width={256} height={256} />
        {!image && (
          <div className="photo-editor__placeholder">
            {currentUrl ? (
              <img src={currentUrl} alt="Foto profilo attuale" />
            ) : (
              <span>Scegli una foto</span>
            )}
          </div>
        )}
      </div>

      <div className="photo-editor__controls">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
        <button type="button" className="btn btn--secondary" onClick={() => inputRef.current?.click()}>
          {image ? 'Cambia foto' : 'Scegli foto'}
        </button>

        {image && (
          <>
            <div className="photo-editor__filters">
              {PHOTO_FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  title={f.hint}
                  className={`photo-editor__filter${filter === f.id ? ' photo-editor__filter--active' : ''}`}
                  onClick={() => setFilter(f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="photo-editor__actions">
              <button
                type="button"
                className="btn btn--primary"
                disabled={busy || !preview}
                onClick={() => preview && onChange(preview)}
              >
                {busy ? 'Salvo…' : 'Salva foto'}
              </button>
              <button type="button" className="btn btn--ghost" onClick={() => setImage(null)}>
                Annulla
              </button>
            </div>
          </>
        )}

        {currentUrl && !image && (
          <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => onChange(null)}>
            Rimuovi foto
          </button>
        )}

        {error && <p className="photo-editor__error">{error}</p>}
        <p className="photo-editor__note">
          I filtri sono applicati sul tuo dispositivo: la foto originale non viene mai caricata,
          solo il risultato 256×256.
        </p>
      </div>
    </div>
  );
}
