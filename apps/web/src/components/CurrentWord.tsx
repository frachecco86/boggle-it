import { useEffect, useState } from 'react';
import { lengthBucket } from '../game/lengthBucket.js';
import { DefinitionBack, useWordDefinition } from './WordDefinition.js';

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
 * LA DEFINIZIONE RUOTA IL RIQUADRO (non apre una nuvoletta): il tasto "?" fa
 * girare la carta di 180° sull'asse orizzontale, e il retro mostra le
 * definizioni. Prima la definizione compariva in un pannello sovrapposto, che
 * copriva la griglia ed era un secondo elemento da chiudere; ora lo stesso
 * riquadro cambia faccia, quindi non si aggiunge nulla allo schermo e la
 * griglia resta visibile. Riaprire/chiudere è lo stesso gesto del "?".
 *
 * ALTEZZA COSTANTE: il contenitore ha altezza fissa in CSS e il fronte non va
 * mai a capo. Il retro, invece, può scorrere in verticale (una definizione lunga
 * non entra in 64px): è l'unica parte che scrolla, e solo quando è girata.
 */
export function CurrentWord({ word, feedback, hintWord }: CurrentWordProps) {
  // Soglie progressive: oltre le 8 lettere il testo si rimpicciolisce, oltre le
  // 12 ancora. Servono perché con l'altezza fissa una parola lunga uscirebbe.
  const sizeClass =
    word.length > 12 ? ' current-word-banner--xlong' : word.length >= 8 ? ' current-word-banner--long' : '';

  /**
   * Parola di cui si sta mostrando la definizione (retro della carta), o `null`.
   * Una sola per volta: aprire una definizione nuova sostituisce la precedente.
   */
  const [defWord, setDefWord] = useState<string | null>(null);

  // La parola "corrente" del fronte: composizione, esito valido o suggerimento.
  const frontWord = word.length > 0 ? word : (feedback?.word ?? hintWord ?? null);
  // Se cambia la parola sul fronte (nuova composizione, nuovo esito) la
  // definizione aperta non è più pertinente: si gira indietro da sola.
  useEffect(() => {
    setDefWord(null);
  }, [frontWord]);

  const flipped = defWord !== null;
  const { def, loading } = useWordDefinition(defWord ?? '', flipped);

  // La composizione ha la precedenza: se il dito è già sulla griglia, quello che
  // interessa è la parola nuova, non l'esito di quella precedente.
  const showFeedback = word.length === 0 && Boolean(feedback);
  const showHint = word.length === 0 && !feedback && Boolean(hintWord);
  const length = feedback ? lengthBucket(feedback.word.length) : undefined;

  /* Il tasto "?" è disponibile sulle parole "piene": esito valido o suggerimento. */
  const canDefine = showFeedback ? feedback!.kind === 'valid' : showHint;

  return (
    <div
      className={`current-word-card${flipped ? ' current-word-card--flipped' : ''}`}
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="current-word-card__inner">
        {/* FRONTE: parola in composizione, esito o suggerimento. */}
        <div
          className={`current-word-banner${word.length > 0 ? ` current-word-banner--active${sizeClass}` : ''}${
            showFeedback
              ? ` current-word-banner--feedback current-word-banner--${feedback!.kind}${
                  feedback!.kind === 'valid' ? ' current-word-banner--scored' : ''
                }`
              : ''
          }${showHint ? ' current-word-banner--hint' : ''}`}
          data-len={length}
          aria-hidden={flipped}
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
           * Pulsante "?": fa GIRARE la carta e mostra la definizione sul retro.
           * È dentro il fronte, così ruota via con esso.
           */}
          {canDefine && (
            <button
              type="button"
              className="current-word-card__flip"
              onClick={() => setDefWord(frontWord)}
              aria-label={`Definizione di ${frontWord}`}
              title="Che parola è?"
            >
              ?
            </button>
          )}
        </div>

        {/* RETRO: definizione della parola, con il tasto per tornare indietro. */}
        <div className="current-word-card__back" aria-hidden={!flipped}>
          {defWord && <DefinitionBack word={defWord} def={def} loading={loading} />}
          <button
            type="button"
            className="current-word-card__flip current-word-card__flip--back"
            onClick={() => setDefWord(null)}
            aria-label="Torna alla parola"
            title="Torna alla parola"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
