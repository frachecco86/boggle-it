import { useState } from 'react';
import {
  DIFFICULTIES,
  DIFFICULTY_ORDER,
  ROUND_DURATIONS_SEC,
  type Difficulty,
  type GridSize,
} from '@boggle/shared';
import { useAppStore } from '../state/store.js';

const SIZES: { size: GridSize; label: string; hint: string }[] = [
  { size: 4, label: '4 × 4', hint: 'Classica · 16 lettere' },
  { size: 5, label: '5 × 5', hint: 'Media · 25 lettere' },
  { size: 6, label: '6 × 6', hint: 'Grande · 36 lettere' },
];

/** Configurazione partita single player: dimensione, difficoltà, durata, round. */
export function SoloSetupScreen({ onStart }: { onStart: () => void }) {
  const {
    soloGridSize,
    soloDifficulty,
    soloRounds,
    soloRoundDurationMs,
    setSoloSetup,
    setScreen,
  } = useAppStore();

  const [size, setSize] = useState<GridSize>(soloGridSize);
  const [difficulty, setDifficulty] = useState<Difficulty>(soloDifficulty);
  const [rounds, setRounds] = useState(soloRounds);
  const [durationMs, setDurationMs] = useState(soloRoundDurationMs);

  const activeDifficulty = DIFFICULTIES[difficulty];

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
        <h3 className="setup__label">Difficoltà</h3>
        <div className="difficulty-options">
          {DIFFICULTY_ORDER.map((id) => {
            const meta = DIFFICULTIES[id];
            return (
              <button
                key={id}
                className={`difficulty-option${difficulty === id ? ' difficulty-option--active' : ''}`}
                style={{ ['--level-accent' as string]: meta.theme.accent }}
                onClick={() => setDifficulty(id)}
              >
                <span className="difficulty-option__dot" />
                <span className="difficulty-option__label">{meta.label}</span>
                <span className="difficulty-option__hint">{meta.description}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="setup__section">
        <h3 className="setup__label">Durata del round</h3>
        <div className="rounds-options">
          {ROUND_DURATIONS_SEC.map((sec) => (
            <button
              key={sec}
              className={`pill${durationMs === sec * 1000 ? ' pill--active' : ''}`}
              onClick={() => setDurationMs(sec * 1000)}
            >
              {sec} sec
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

      <div className="setup__summary" style={{ ['--level-accent' as string]: activeDifficulty.theme.accent }}>
        <span className="setup__summary-dot" />
        <span>
          {activeDifficulty.label} · {size}×{size} · {durationMs / 1000}s · {rounds}{' '}
          {rounds === 1 ? 'round' : 'round'}
        </span>
      </div>

      <button
        className="btn btn--primary btn--big"
        onClick={() => {
          setSoloSetup(size, difficulty, rounds, durationMs);
          onStart();
        }}
      >
        Inizia
      </button>
    </div>
  );
}
