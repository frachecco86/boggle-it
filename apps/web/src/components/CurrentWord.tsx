interface CurrentWordProps {
  /** Parola attualmente in composizione (lettere dello swipe). */
  word: string;
}

/**
 * Anteprima della parola in composizione, sopra la griglia.
 *
 * Come nel Boggle originale: mentre scorri le lettere vedi il testo che si sta
 * formando, così sai cosa stai per inviare. Le lettere appaiono con una piccola
 * animazione per dare l'idea di composizione.
 *
 * ALTEZZA COSTANTE: il contenitore ha altezza fissa in CSS e il testo non va mai
 * a capo (`white-space: nowrap`). Il carattere si riduce al crescere della
 * parola, così la griglia sotto non si sposta di un pixel durante il gioco.
 */
export function CurrentWord({ word }: CurrentWordProps) {
  // Soglie progressive: oltre le 8 lettere il testo si rimpicciolisce, oltre le
  // 12 ancora. Servono perché con l'altezza fissa una parola lunga uscirebbe.
  const sizeClass = word.length > 12 ? ' current-word-banner--xlong' : word.length >= 8 ? ' current-word-banner--long' : '';
  return (
    <div
      className={`current-word-banner${word.length > 0 ? ' current-word-banner--active' : ''}${sizeClass}`}
      aria-live="polite"
      aria-atomic="true"
    >
      {word.length === 0 ? (
        <span className="current-word-banner__placeholder">Componi una parola…</span>
      ) : (
        [...word].map((letter, i) => (
          <span key={`${i}-${letter}`} className="current-word-banner__letter">
            {letter.toUpperCase()}
          </span>
        ))
      )}
    </div>
  );
}
