import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'boggle-it.theme';

/** Tema salvato, o quello di sistema se non c'è una scelta. */
function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    /* storage non disponibile */
  }
  // Nessuna scelta salvata: rispettiamo la preferenza del sistema operativo.
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

/**
 * Interruttore del tema, in alto a sinistra.
 *
 * Il tema è applicato con `data-theme` sull'elemento radice: tutte le variabili
 * colore cambiano di conseguenza, senza toccare i singoli componenti.
 *
 * La scelta è salvata e ha priorità sulla preferenza di sistema, che viene usata
 * solo al primo avvio.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  // Applica il tema e salvalo.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* storage non disponibile: il tema vale solo per questa sessione */
    }
  }, [theme]);

  const toggle = () => setTheme((t) => (t === 'light' ? 'dark' : 'light'));
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      title={isDark ? 'Passa al tema chiaro' : 'Passa al tema scuro'}
      aria-label={isDark ? 'Attiva tema chiaro' : 'Attiva tema scuro'}
      aria-pressed={isDark}
    >
      <span className="theme-toggle__icon" aria-hidden>
        {isDark ? '☀️' : '🌙'}
      </span>
    </button>
  );
}

/** Applica il tema salvato all'avvio, prima che React renderizzi. */
export function applyStoredTheme(): void {
  document.documentElement.dataset.theme = initialTheme();
}
