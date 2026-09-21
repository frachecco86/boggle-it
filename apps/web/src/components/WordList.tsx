import { useEffect, useRef } from 'react';
import type { FoundWord } from '@boggle/shared';

interface WordListProps {
  words: FoundWord[];
  currentWord: string;
  /**
   * Se true, la parola in composizione NON è mostrata in questo pannello: viene
   * già mostrata come anteprima sopra la griglia (stile Boggle). Evita di
   * duplicarla.
   */
  hideCurrentWord?: boolean;
  /**
   * Se false, mostra solo il CONTEGGIO senza l'elenco. Serve durante la partita:
   * sapere quante parole hai trovato è utile, ma vederle tutte rivelerebbe le
   * soluzioni trovate agli altri (e in single player toglie la sorpresa).
   */
  showItems?: boolean;
}

/**
 * Pannello delle parole TROVATE.
 *
 * La parola in composizione non compare più qui: è mostrata come anteprima in
 * alto, sopra la griglia, come nel Boggle originale (vedi `CurrentWord`).
 * Durante la partita l'elenco resta nascosto (solo il numero): le parole si
 * vedono tutte nel riepilogo di fine round.
 */
export function WordList({ words, currentWord, hideCurrentWord = true, showItems = true }: WordListProps) {
  const listRef = useRef<HTMLUListElement>(null);

  // Pop dell'ultima parola aggiunta via WAAPI.
  useEffect(() => {
    const list = listRef.current;
    if (!list || list.children.length === 0) return;
    const last = list.lastElementChild as HTMLElement;
    last?.animate(
      [
        { transform: 'scale(0.6)', opacity: 0 },
        { transform: 'scale(1.08)', opacity: 1 },
        { transform: 'scale(1)', opacity: 1 },
      ],
      { duration: 260, easing: 'ease-out' },
    );
  }, [words.length]);

  const sorted = [...words].sort((a, b) => b.points - a.points || a.word.localeCompare(b.word));

  return (
    <div className="word-list">
      {!hideCurrentWord && (
        <div className={`current-word${currentWord.length >= 3 ? ' current-word--ready' : ''}`} aria-live="polite">
          {currentWord.toUpperCase()}
        </div>
      )}
      <h3 className="word-list__title">
        Trovate <span className="word-list__count">{sorted.length}</span>
      </h3>
      {showItems && (
        <ul ref={listRef} className="word-list__items">
          {sorted.map((w) => (
            <li key={w.word} className="word-list__item">
              <span>{w.word.toUpperCase()}</span>
              <span className="word-list__points">+{w.points}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
