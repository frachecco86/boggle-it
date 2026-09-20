import { useEffect, useMemo, useRef, useState } from 'react';
import {
  PHOTO_FILTERS,
  canvasToDataUrl,
  cropSquare,
  renderPhoto,
  type PhotoFilterId,
} from '../game/photoFilters.js';
import {
  AI_INPUT_SIZE,
  AI_STYLES,
  applyAiStyle,
  isStyleCached,
  isStyleReady,
  type AiStyleId,
} from '../game/aiStyles.js';

interface Props {
  /** Data URL JPEG del ritaglio con effetto applicato, o null per rimuovere. */
  onChange: (dataUrl: string | null) => void;
  /** URL attuale della foto salvata (se presente). */
  currentUrl?: string;
  busy?: boolean;
}

type Effect = { kind: 'filter'; id: PhotoFilterId } | { kind: 'ai'; id: AiStyleId };

interface Progress {
  phase: 'download' | 'run';
  percent: number;
}

/**
 * Editor foto profilo.
 *
 * Due livelli di effetto:
 *  - **Filtri** rapidi in canvas (istantanei, zero download);
 *  - **Stili AI** (AnimeGANv2) eseguiti nel browser: vera rete neurale di style
 *    transfer. I pesi (8.25 MB) e il runtime si scaricano al primo uso e restano
 *    in cache, quindi le volte successive funzionano anche offline.
 */
export function PhotoEditor({ onChange, currentUrl, busy }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [effect, setEffect] = useState<Effect>({ kind: 'ai', id: 'hayao' });
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** URL dei risultati AI già calcolati, per non rieseguire la rete. */
  const [aiResults, setAiResults] = useState<Partial<Record<AiStyleId, string>>>({});
  const [cached, setCached] = useState<Partial<Record<AiStyleId, boolean>>>({});

  // Il ritaglio quadrato: base comune a filtri e AI.
  const cropped = useMemo(() => (image ? cropSquare(image, AI_INPUT_SIZE) : null), [image]);

  // Anteprima: i filtri sono immediati; per l'AI serve un risultato già calcolato.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !cropped) return;
    if (effect.kind === 'filter') {
      const rendered = renderPhoto(image!, effect.id, AI_INPUT_SIZE);
      canvas.width = rendered.width;
      canvas.height = rendered.height;
      canvas.getContext('2d')!.drawImage(rendered, 0, 0);
      return;
    }
    const done = aiResults[effect.id];
    if (!done) {
      canvas.width = cropped.width;
      canvas.height = cropped.height;
      canvas.getContext('2d')!.drawImage(cropped, 0, 0);
      return;
    }
    const img = new Image();
    img.onload = () => {
      canvas.width = AI_INPUT_SIZE;
      canvas.height = AI_INPUT_SIZE;
      canvas.getContext('2d')!.drawImage(img, 0, 0);
    };
    img.src = done;
  }, [cropped, effect, aiResults, image]);

  // Quali stili sono già in cache (per avvisare se servirà la rete).
  useEffect(() => {
    if (!image) return;
    void Promise.all(AI_STYLES.map(async (s) => [s.id, await isStyleCached(s.id)] as const)).then(
      (entries) => setCached(Object.fromEntries(entries)),
    );
  }, [image]);

  const handleFile = (file: File) => {
    setError(null);
    setAiResults({});
    if (!file.type.startsWith('image/')) {
      setError('Serve un file immagine');
      return;
    }
    const img = new Image();
    img.onload = () => setImage(img);
    img.onerror = () => setError('Immagine non leggibile');
    img.src = URL.createObjectURL(file);
  };

  /** Esegue la rete neurale sullo stile scelto (una sola volta per stile). */
  const runAi = async (style: AiStyleId) => {
    if (!cropped) return;
    if (aiResults[style]) return; // già calcolato
    setError(null);
    try {
      const out = document.createElement('canvas');
      await applyAiStyle(cropped, style, out, ({ phase, loaded, total }) => {
        setProgress({ phase, percent: total > 0 ? Math.round((loaded / total) * 100) : 0 });
      });
      setAiResults((prev) => ({ ...prev, [style]: canvasToDataUrl(out, 0.92) }));
    } catch (err) {
      setError(
        err instanceof Error
          ? `Stile non applicato: ${err.message}`
          : 'Stile non applicato (serve la rete la prima volta)',
      );
    } finally {
      setProgress(null);
    }
  };

  const ready = effect.kind === 'filter' || Boolean(aiResults[effect.id]);
  const preview = cropped && ready
    ? effect.kind === 'filter'
      ? canvasToDataUrl(renderPhoto(image!, effect.id, AI_INPUT_SIZE))
      : aiResults[effect.id]!
    : null;

  return (
    <div className="photo-editor">
      <div className="photo-editor__preview">
        <canvas ref={canvasRef} className="photo-editor__canvas" width={256} height={256} />
        {!image && (
          <div className="photo-editor__placeholder">
            {currentUrl ? <img src={currentUrl} alt="Foto profilo attuale" /> : <span>Scegli una foto</span>}
          </div>
        )}
        {progress && (
          <div className="photo-editor__progress">
            {progress.phase === 'download'
              ? `Scarico il modello… ${progress.percent}%`
              : 'Elaboro…'}
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
            <div className="photo-editor__group">
              <span className="photo-editor__group-label">Stili AI</span>
              <div className="photo-editor__filters">
                {AI_STYLES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    title={s.hint}
                    disabled={Boolean(progress)}
                    className={`photo-editor__filter${effect.kind === 'ai' && effect.id === s.id ? ' photo-editor__filter--active' : ''}`}
                    onClick={() => {
                      setEffect({ kind: 'ai', id: s.id });
                      if (!isStyleReady(s.id) && !aiResults[s.id]) void runAi(s.id);
                    }}
                  >
                    {s.label}
                    {cached[s.id] && !isStyleReady(s.id) ? ' ✓' : ''}
                  </button>
                ))}
              </div>
              <span className="photo-editor__group-hint">
                Rete neurale eseguita sul tuo dispositivo. Al primo uso scarica il modello
                (~8 MB), poi resta in cache e funziona anche offline.
              </span>
            </div>

            <div className="photo-editor__group">
              <span className="photo-editor__group-label">Filtri rapidi</span>
              <div className="photo-editor__filters">
                {PHOTO_FILTERS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    title={f.hint}
                    disabled={Boolean(progress)}
                    className={`photo-editor__filter${effect.kind === 'filter' && effect.id === f.id ? ' photo-editor__filter--active' : ''}`}
                    onClick={() => setEffect({ kind: 'filter', id: f.id })}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="photo-editor__actions">
              {effect.kind === 'ai' && !ready && !progress && (
                <button type="button" className="btn btn--primary" onClick={() => void runAi(effect.id)}>
                  Applica {AI_STYLES.find((s) => s.id === effect.id)?.label}
                </button>
              )}
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
          Tutto avviene sul tuo dispositivo: la foto originale non viene mai caricata, solo il
          risultato 256×256.
        </p>
      </div>
    </div>
  );
}
