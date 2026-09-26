import { useEffect, useState } from 'react';
import { lengthBucket } from '../game/lengthBucket.js';
import { DefinitionPanel, useWordDefinition } from './WordDefinition.js';

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
 * dell'occhio mentre la griglia è al centro.
 *
 * LA DEFINIZIONE SCORRE DENTRO IL RIQUADRO: il tasto "?" fa entrare un pannello
 * dal basso (slide), che copre il riquadro. Non è un flip (ruotava la carta, ma
 * il testo arrivava "al contrario" durante la rotazione) e non è una nuvoletta
 * sovrapposta (copriva la griglia). Il contenitore resta FISSO a 64px: la griglia
 * sotto non si muove mai. Il pannello ha lo stesso font del gioco, solo più
 * piccolo, e scorre in verticale se la definizione è lunga.
 */
export function CurrentWord({ word, feedback, hintWord }: CurrentWordProps) {
  // Soglie progressive: oltre le 8 lettere il testo si rimpicciolisce, oltre le
  // 12 ancora. Servono perché con l'altezza fissa una parola lunga uscirebbe.
  const sizeClass =
    word.length > 12 ? ' current-word-banner--xlong' : word.length >= 8 ? ' current-word-banner--long' : '';

  /**
   * Parola di cui si sta mostrando la definizione (pannello aperto), o `null`.
   * Una sola per volta: aprire una definizione nuova sostituisce la precedente.
   */
  const [defWord, setDefWord] = useState<string | null>(null);

  // La parola "corrente" del fronte: composizione, esito valido o suggerimento.
  const frontWord = word.length > 0 ? word : (feedback?.word ?? hintWord ?? null);

  /*
   * Il pannello si chiude quando il fronte cambia verso una parola DIVERSA.
   *
   * NON si chiude quando il suggerimento scade (`hintWord` → null) mentre lo si
   * sta leggendo: la durata riguarda l'animazione, non la lettura. Prima
   * spariva dopo ~4 secondi proprio mentre si leggeva la definizione.
   */
  useEffect(() => {
    setDefWord((current) => {
      if (current === null) return null;
      // Stessa parola (o fronte svuotato dal solo suggerimento scaduto): resta.
      if (frontWord === null || frontWord === current) return current;
      // Parola diversa (nuova composizione o nuovo esito): si chiude.
      return null;
    });
  }, [frontWord]);

  const open = defWord !== null;
  const { def, loading } = useWordDefinition(defWord ?? '', open);

  // La composizione ha la precedenza: se il dito è già sulla griglia, quello che
  // interessa è la parola nuova, non l'esito di quella precedente.
  const showFeedback = word.length === 0 && Boolean(feedback);
  const showHint = word.length === 0 && !feedback && Boolean(hintWord);
  const length = feedback ? lengthBucket(feedback.word.length) : undefined;

  /* Il tasto "?" è disponibile sulle parole "piene": esito valido o suggerimento. */
  const canDefine = showFeedback ? feedback!.kind === 'valid' : showHint;

  return (
    <div className="current-word-wrap" aria-live="polite" aria-atomic="true">
      <div
        className={`current-word-banner${word.length > 0 ? ` current-word-banner--active${sizeClass}` : ''}${
          showFeedback
            ? ` current-word-banner--feedback current-word-banner--${feedback!.kind}${
                feedback!.kind === 'valid' ? ' current-word-banner--scored' : ''
              }`
            : ''
        }${showHint ? ' current-word-banner--hint' : ''}`}
        data-len={length}
        aria-hidden={open}
      >
        {word.length > 0 ? (
          [...word].map((letter, i) => (
            <span key={`${i}-${letter}`} className="current-word-banner__letter">
              {letter.toUpperCase()}
            </span>
          ))
        ) : showFeedback ? (
          <>
            <span className="current-word-banner__word">{feedback!.word.toUpperCase()}</span>
            {feedback!.kind === 'valid' && feedback!.points !== undefined ? (
              <span className="current-word-banner__points">+{feedback!.points}</span>
            ) : (
              <span className="current-word-banner__reason">{feedback!.reason}</span>
            )}
          </>
        ) : showHint ? (
          <>
            <span className="current-word-banner__hint-icon" aria-hidden>
              💡
            </span>
            <span className="current-word-banner__word">{hintWord!.toUpperCase()}</span>
          </>
        ) : (
          <span className="current-word-banner__placeholder">Componi una parola…</span>
        )}

        {/*
         * Pulsante "?": fa entrare il pannello della definizione dal basso.
         * È dentro il riquadro, così resta dove l'occhio è puntato.
         */}
        {canDefine && (
          <button
            type="button"
            className="current-word-banner__flip"
            onClick={() => setDefWord(frontWord)}
            aria-label={`Definizione di ${frontWord}`}
            title="Che parola è?"
          >
            ?
          </button>
        )}
      </div>

      {/*
       * Pannello della definizione: SCORRE dal basso dentro il riquadro (fisso,
       * 64px). `aria-hidden` quando è chiuso, così non viene letto dagli screen
       * reader una definizione che non è visibile.
       */}
      <div className={`current-word-panel${open ? ' current-word-panel--open' : ''}`} aria-hidden={!open}>
        {defWord && <DefinitionPanel word={defWord} def={def} loading={loading} />}
        <button
          type="button"
          className="current-word-banner__flip current-word-banner__flip--close"
          onClick={() => setDefWord(null)}
          aria-label="Torna alla parola"
          title="Torna alla parola"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
