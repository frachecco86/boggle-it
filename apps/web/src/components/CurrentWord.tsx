import { lengthBucket } from '../game/lengthBucket.js';
import { WordDefinition } from './WordDefinition.js';

export interface CurrentWordFeedback {
  kind: 'valid' | 'invalid' | 'duplicate';
  /** Parola inviata (anche quella rifiutata: serve a capire cosa non andava). */
  word: string;
  /** Punti guadagnati: presenti solo quando `kind` è `'valid'`. */
  points?: number;
  /** Motivo del rifiuto (per `invalid` e `duplicate`). */
  reason?: string;
}

interface CurrentWordProps {
  /** Parola attualmente in composizione (lettere dello swipe). */
  word: string;
  /**
   * Esito dell'ultima parola inviata. Mostrato SOLO quando non si sta
   * componendo: appena il dito riparte, il rettangolo torna alle lettere.
   */
  feedback?: CurrentWordFeedback | null;
  /**
   * Parola SUGGERITA dalla modalità apprendimento: appare nel riquadro quando
   * non si sta componendo né c'è un esito, con il pulsante "?" per la definizione.
   */
  hintWord?: string | null;
}

/**
 * Anteprima della parola in composizione, sopra la griglia.
 *
 * Come nel Boggle originale: mentre scorri le lettere vedi il testo che si sta
 * formando, così sai cosa stai per inviare. Le lettere appaiono con una piccola
 * animazione per dare l'idea di composizione.
 *
 * Qui compare anche l'ESITO della parola appena inviata (punti guadagnati,
 * "già trovata", "non valida"). Prima l'esito era una nuvoletta in fondo allo
 * schermo, lontano da dove si guarda: il punteggio si leggeva con la coda
 * dell'occhio mentre la griglia è al centro. Nello stesso rettangolo l'occhio
 * non deve spostarsi, e il colore del riquadro cambia con la lunghezza della
 * parola (3 lettere giallo, 4 verde, 5 azzurro, 6 viola, 7+ oro).
 *
 * ALTEZZA COSTANTE: il contenitore ha altezza fissa in CSS e il testo non va mai
 * a capo (`white-space: nowrap`). Il carattere si riduce al crescere della
 * parola, così la griglia sotto non si sposta di un pixel durante il gioco.
 */
export function CurrentWord({ word, feedback, hintWord }: CurrentWordProps) {
  // Soglie progressive: oltre le 8 lettere il testo si rimpicciolisce, oltre le
  // 12 ancora. Servono perché con l'altezza fissa una parola lunga uscirebbe.
  const sizeClass = word.length > 12 ? ' current-word-banner--xlong' : word.length >= 8 ? ' current-word-banner--long' : '';

  // La composizione ha la precedenza: se il dito è già sulla griglia, quello che
  // interessa è la parola nuova, non l'esito di quella precedente.
  if (word.length > 0) {
    return (
      <div
        className={`current-word-banner current-word-banner--active${sizeClass}`}
        aria-live="polite"
        aria-atomic="true"
      >
        {[...word].map((letter, i) => (
          <span key={`${i}-${letter}`} className="current-word-banner__letter">
            {letter.toUpperCase()}
          </span>
        ))}
      </div>
    );
  }

  if (feedback) {
    const length = lengthBucket(feedback.word.length);
    return (
      <div
        className={`current-word-banner current-word-banner--feedback current-word-banner--${feedback.kind}${
          feedback.kind === 'valid' ? ' current-word-banner--scored' : ''
        }`}
        data-len={length}
        aria-live="polite"
        aria-atomic="true"
      >
        <span className="current-word-banner__word">{feedback.word.toUpperCase()}</span>
        {feedback.kind === 'valid' && feedback.points !== undefined ? (
          <span className="current-word-banner__points">+{feedback.points}</span>
        ) : (
          <span className="current-word-banner__reason">{feedback.reason}</span>
        )}
        {/*
         * Pulsante "?": apre la DEFINIZIONE della parola appena trovata.
         * Solo per le parole valide (per una parola errata non c'è niente da
         * spiegare) e solo se la parola ha una voce nel dizionario interno.
         */}
        {feedback.kind === 'valid' && <WordDefinition word={feedback.word} />}
      </div>
    );
  }

  /*
   * Parola SUGGERITA (modalità apprendimento): sta nel riquadro finché non si
   * tocca la griglia. La definizione si può aprire: è lì che si impara il
   * significato della parola appena rivelata.
   */
  if (hintWord) {
    return (
      <div className="current-word-banner current-word-banner--hint" aria-live="polite" aria-atomic="true">
        <span className="current-word-banner__hint-icon" aria-hidden>
          💡
        </span>
        <span className="current-word-banner__word">{hintWord.toUpperCase()}</span>
        <WordDefinition word={hintWord} />
      </div>
    );
  }

  return (
    <div className="current-word-banner" aria-live="polite" aria-atomic="true">
      <span className="current-word-banner__placeholder">Componi una parola…</span>
    </div>
  );
}
