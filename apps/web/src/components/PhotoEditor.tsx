import { useEffect, useRef, useState } from 'react';
import { PHOTO_SIZE, canvasToDataUrl, cropSquare } from '../game/photoCrop.js';

interface Props {
  /** Data URL JPEG del ritaglio, o null per rimuovere la foto. */
  onChange: (dataUrl: string | null) => void;
  /** URL attuale della foto salvata (se presente). */
  currentUrl?: string;
  busy?: boolean;
}

/**
 * Caricamento della foto profilo.
 *
 * Semplice per scelta: si sceglie un'immagine, viene **ritagliata al centro** in
 * un quadrato 256×256 e salvata. Niente filtri, niente stili AI: erano opzioni
 * che non servivano al gioco e portavano con sé un modello da 8 MB.
 *
 * Il ritaglio quadrato avviene nel browser: la foto originale non viene mai
 * caricata sul server, solo il risultato.
 */
export function PhotoEditor({ onChange, currentUrl, busy }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Libera il blob creato per l'anteprima quando cambia o al unmount: senza
  // questo, ogni foto scelta lasciava un object URL in memoria.
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const handleFile = (file: File) => {
    setError(null);
    if (!file.type.startsWith('image/')) {
      setError('Serve un file immagine');
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      // Ritaglio quadrato immediato: l'anteprima è già il risultato finale.
      setPreview(canvasToDataUrl(cropSquare(img, PHOTO_SIZE), 0.9));
      URL.revokeObjectURL(objectUrl);
    };
    img.onerror = () => {
      setError('Immagine non leggibile');
      URL.revokeObjectURL(objectUrl);
    };
    img.src = objectUrl;
  };

  const shown = preview ?? (currentUrl ? currentUrl : null);

  return (
    <div className="photo-editor">
      <div className="photo-editor__preview">
        {shown ? (
          <img className="photo-editor__canvas" src={shown} alt="Anteprima foto profilo" />
        ) : (
          <span className="photo-editor__placeholder">Scegli una foto</span>
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
            // Azzera l'input: senza, scegliere due volte lo stesso file non
            // scatenava `onChange` e sembrava che non succedesse nulla.
            e.target.value = '';
          }}
        />

        <div className="photo-editor__actions">
          <button type="button" className="btn btn--secondary" onClick={() => inputRef.current?.click()}>
            {shown ? 'Cambia foto' : 'Scegli foto'}
          </button>

          {preview && (
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy}
              onClick={() => onChange(preview)}
            >
              {busy ? 'Salvo…' : 'Salva foto'}
            </button>
          )}

          {preview && (
            <button type="button" className="btn btn--ghost" onClick={() => setPreview(null)}>
              Annulla
            </button>
          )}

          {currentUrl && !preview && (
            <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => onChange(null)}>
              Rimuovi foto
            </button>
          )}
        </div>

        {error && <p className="photo-editor__error">{error}</p>}
        <p className="photo-editor__note">
          La foto viene ritagliata al centro a 256×256 direttamente sul tuo dispositivo: l'originale
          non viene mai caricato.
        </p>
      </div>
    </div>
  );
}
