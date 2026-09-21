interface FoundCounterProps {
  /** Numero di parole trovate finora in questo round. */
  count: number;
}

/**
 * Contatore delle parole trovate, durante la partita.
 *
 * Perché solo un NUMERO e non l'elenco: mostrare le parole mentre si gioca
 * rivelava le soluzioni (e in multiplayer le esponeva agli altri). L'elenco
 * completo — trovate e mancate — si vede nel riepilogo di fine round.
 *
 * Altezza FISSA per scelta: la vecchia card cresceva a ogni parola trovata,
 * spingendo in basso il resto della pagina. Un elemento che cambia dimensione
 * durante il gioco produce uno spostamento della finestra che distrae.
 */
export function FoundCounter({ count }: FoundCounterProps) {
  return (
    <div className="found-counter" aria-live="polite" aria-atomic="true">
      <span className="found-counter__value">{count}</span>
      <span className="found-counter__label">
        {count === 1 ? 'parola trovata' : 'parole trovate'}
      </span>
    </div>
  );
}
