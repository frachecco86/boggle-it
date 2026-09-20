import { useEffect, useRef } from 'react';

interface TimerProps {
  timeLeftMs: number;
  totalMs: number;
}

function format(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Timer con barra di avanzamento e pulse rosso sotto i 10 secondi. */
export function Timer({ timeLeftMs, totalMs }: TimerProps) {
  const urgent = timeLeftMs <= 10_000;
  const pct = Math.max(0, Math.min(100, (timeLeftMs / totalMs) * 100));
  const wobbleRef = useRef<HTMLSpanElement>(null);

  // Pulse rosso via WAAPI sui secondi finali (senza dipendenze).
  useEffect(() => {
    const el = wobbleRef.current;
    if (!el || !urgent) return;
    const anim = el.animate(
      [
        { transform: 'scale(1)', color: 'var(--danger)' },
        { transform: 'scale(1.15)', color: '#ff5c5c' },
        { transform: 'scale(1)', color: 'var(--danger)' },
      ],
      { duration: 900, iterations: Infinity },
    );
    return () => anim.cancel();
  }, [urgent]);

  return (
    <div className={`timer${urgent ? ' timer--urgent' : ''}`}>
      <span ref={wobbleRef} className="timer__value">
        {format(timeLeftMs)}
      </span>
      <div className="timer__bar">
        <div className="timer__bar-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
