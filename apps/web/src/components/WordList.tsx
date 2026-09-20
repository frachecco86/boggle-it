import { useEffect, useRef } from 'react';
import type { FoundWord } from '@boggle/shared';

interface WordListProps {
  words: FoundWord[];
  currentWord: string;
}

/** Pannello parole: parola corrente + elenco di quelle trovate con pop animato. */
export function WordList({ words, currentWord }: WordListProps) {
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
      <div className={`current-word${currentWord.length >= 3 ? ' current-word--ready' : ''}`} aria-live="polite">
        {currentWord.toUpperCase()}
      </div>
      <ul ref={listRef} className="word-list__items">
        {sorted.map((w) => (
          <li key={w.word} className="word-list__item">
            <span>{w.word.toUpperCase()}</span>
            <span className="word-list__points">+{w.points}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
