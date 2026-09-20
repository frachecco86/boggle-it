import type { Difficulty, GridSize } from '@boggle/shared';
import { useGridPreview } from '../game/useGridPreview.js';

interface GridPreviewProps {
  gridSize: GridSize;
  difficulty: Difficulty;
  /** Se false, non interroga il server (es. nella home prima di scegliere). */
  enabled?: boolean;
}

/**
 * Anteprima: mostra una griglia reale generata dal server con le impostazioni scelte,
 * il numero esatto di parole trovabili e qualche esempio.
 */
export function GridPreview({ gridSize, difficulty, enabled = true }: GridPreviewProps) {
  const { loading, data, error } = useGridPreview(gridSize, difficulty, enabled);

  return (
    <section className="grid-preview" aria-live="polite">
      <div className="grid-preview__head">
        <span className="grid-preview__title">Anteprima</span>
        <span className="grid-preview__meta">
          {gridSize}×{gridSize}
        </span>
      </div>

      <div className="grid-preview__body">
        <div
          className="grid-preview__mini"
          style={{ ["--grid-size" as string]: gridSize }}
          data-loading={loading || undefined}
        >
          {data
            ? data.grid.flatMap((row, ri) =>
                [...row].map((ch, ci) => (
                  <span key={`${ri}-${ci}`} className="grid-preview__cell">
                    {ch}
                  </span>
                )),
              )
            : Array.from({ length: gridSize * gridSize }, (_, i) => (
                <span key={i} className="grid-preview__cell grid-preview__cell--empty" />
              ))}
        </div>

        <div className="grid-preview__info">
          <div className="grid-preview__count">
            {error ? (
              <span className="grid-preview__error">{error}</span>
            ) : loading && !data ? (
              <span className="grid-preview__loading">Calcolo…</span>
            ) : data ? (
              <>
                <span className="grid-preview__number">
                  {data.truncated ? `${data.wordCount}+` : data.wordCount}
                </span>
                <span className="grid-preview__label">
                  {data.truncated ? 'parole o più' : 'parole trovabili'}
                </span>
              </>
            ) : (
              <span className="grid-preview__loading">—</span>
            )}
          </div>

          {data && data.sampleWords.length > 0 && (
            <div className="grid-preview__samples">
              <span className="grid-preview__samples-label">Le più lunghe:</span>
              <div className="chip-list chip-list--compact">
                {data.sampleWords.slice(0, 5).map((w) => (
                  <span key={w} className="chip chip--small chip--muted">
                    {w.toUpperCase()}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <p className="grid-preview__note">
        {loading && data
          ? 'Aggiornando…'
          : 'Scheda di esempio dal catalogo. Ogni partita ne pesca una diversa.'}
      </p>
    </section>
  );
}
