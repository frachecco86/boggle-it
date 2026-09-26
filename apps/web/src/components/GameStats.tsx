import { CheckCircle, Star } from './icons.js';

interface GameStatsProps {
  /** Punti della partita (totali in single player, del round in multiplayer). */
  points: number;
  /** Parole trovate nel round corrente. */
  words: number;
  /** Etichetta accessibile dei punti: cambia fra single player e stanza. */
  pointsLabel?: string;
  wordsLabel?: string;
}

/**
 * I due numeri della partita, in forma COMPATTA: icona + numero.
 *
 * Perché non due riquadri con l'etichetta scritta (era la versione precedente):
 * occupavano ~180px di altezza sotto la griglia, proprio lo spazio che serve
 * alla griglia stessa. Qui stanno nella barra in alto, alla stessa altezza del
 * timer e allineati a destra: l'icona dice cos'è il numero senza una parola, e la
 * schermata di gioco resta di una sola schermata, senza scorrimento.
 *
 * I numeri usano `tabular-nums`: cambiando cifra non si allargano, quindi la
 * barra non si muove di un pixel mentre si gioca.
 */
export function GameStats({
  points,
  words,
  pointsLabel = 'Punti',
  wordsLabel = 'Parole trovate',
}: GameStatsProps) {
  return (
    <div className="game-stats" aria-live="polite">
      <span className="game-stats__item" title={pointsLabel} aria-label={`${pointsLabel}: ${points}`}>
        <Star size={14} aria-hidden />
        <b className="game-stats__value">{points}</b>
      </span>
      <span className="game-stats__item" title={wordsLabel} aria-label={`${wordsLabel}: ${words}`}>
        <CheckCircle size={14} aria-hidden />
        <b className="game-stats__value">{words}</b>
      </span>
    </div>
  );
}
