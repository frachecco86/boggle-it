import { useState } from 'react';
import type { GridSize } from '@boggle/shared';
import { useAppStore } from '../state/store.js';

const SIZES: { size: GridSize; label: string; hint: string }[] = [
  { size: 4, label: '4 × 4', hint: 'Classica · 16 lettere' },
  { size: 5, label: '5 × 5', hint: 'Media · 25 lettere' },
  { size: 6, label: '6 × 6', hint: 'Grande · 36 lettere' },
];

/** Configurazione partita single player. */
export function SoloSetupScreen({ onStart }: { onStart: () => void }) {
  const { soloGridSize, soloRounds, setSoloSetup, setScreen } = useAppStore();
  const [size, setSize] = useState<GridSize>(soloGridSize);
  const [rounds, setRounds] = useState(soloRounds);

  return (
    <div className="screen setup">
      <button className="btn btn--ghost setup__back" onClick={() => setScreen('home')}>
        ← Indietro
      </button>
      <h2 className="screen__title">Partita singola</h2>

      <section className="setup__section">
        <h3 className="setup__label">Dimensione griglia</h3>
        <div className="size-options">
          {SIZES.map((s) => (
            <button
              key={s.size}
              className={`size-option${size === s.size ? ' size-option--active' : ''}`}
              onClick={() => setSize(s.size)}
            >
              <span className="size-option__label">{s.label}</span>
              <span className="size-option__hint">{s.hint}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="setup__section">
        <h3 className="setup__label">Numero di round</h3>
        <div className="rounds-options">
          {[1, 3, 5].map((r) => (
            <button
              key={r}
              className={`pill${rounds === r ? ' pill--active' : ''}`}
              onClick={() => setRounds(r)}
            >
              {r}
            </button>
          ))}
        </div>
      </section>

      <button
        className="btn btn--primary btn--big"
        onClick={() => {
          setSoloSetup(size, rounds);
          onStart();
        }}
      >
        Inizia
      </button>
    </div>
  );
}
