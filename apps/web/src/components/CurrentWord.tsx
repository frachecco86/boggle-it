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
 */
export function CurrentWord({ word }: CurrentWordProps) {
  const long = word.length >= 5;
  return (
    <div
      className={`current-word-banner${word.length > 0 ? ' current-word-banner--active' : ''}${
        long ? ' current-word-banner--long' : ''
      }`}
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
