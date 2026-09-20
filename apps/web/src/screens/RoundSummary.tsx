import { useEffect, useRef } from 'react';

interface RoundSummaryProps {
  round: number;
  rounds: number;
  score: number;
  totalScore: number;
  words: string[];
  missedWords: string[];
  isGameOver: boolean;
  onNext: () => void;
  onExit: () => void;
}

/** Riepilogo di fine round (o di fine partita) con confetti leggeri. */
export function RoundSummary(props: RoundSummaryProps) {
  const { round, rounds, score, totalScore, words, missedWords, isGameOver, onNext, onExit } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Burst di particelle con canvas 2D + rAF (nessuna dipendenza).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const resize = () => {
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
    };
    resize();

    const colors = ['#7c5cff', '#37d67a', '#ffb020', '#ff5c8a', '#3cc8f2'];
    const parts = Array.from({ length: 70 }, () => ({
      x: canvas.width / 2,
      y: canvas.height * 0.25,
      vx: (Math.random() - 0.5) * 9 * dpr,
      vy: (Math.random() - 0.9) * 9 * dpr,
      size: (2 + Math.random() * 4) * dpr,
      color: colors[Math.floor(Math.random() * colors.length)]!,
      life: 1,
    }));

    let raf = 0;
    const step = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;
      for (const p of parts) {
        p.vy += 0.16 * dpr;
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.008;
        if (p.life > 0) {
          alive = true;
          ctx.globalAlpha = Math.max(0, p.life);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      if (alive) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    window.addEventListener('resize', resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <div className="screen summary">
      <canvas ref={canvasRef} className="summary__confetti" aria-hidden />
      <h2 className="screen__title">
        {isGameOver ? 'Partita finita' : `Fine round ${round} di ${rounds}`}
      </h2>

      {!isGameOver && (
        <p className="summary__round-score">
          Punti del round: <strong>{score}</strong>
        </p>
      )}
      <p className="summary__total">
        Totale: <strong>{totalScore}</strong>
      </p>

      <section className="summary__section">
        <h3 className="summary__label">Le tue parole ({words.length})</h3>
        <div className="chip-list">
          {words.length === 0 && <span className="summary__empty">Nessuna parola trovata</span>}
          {words.map((w) => (
            <span key={w} className="chip">
              {w.toUpperCase()}
            </span>
          ))}
        </div>
      </section>

      {missedWords.length > 0 && (
        <section className="summary__section">
          <h3 className="summary__label">Parole che esistevano</h3>
          <div className="chip-list chip-list--muted">
            {missedWords.map((w) => (
              <span key={w} className="chip chip--muted">
                {w.toUpperCase()}
              </span>
            ))}
          </div>
        </section>
      )}

      <div className="summary__actions">
        {!isGameOver ? (
          <button className="btn btn--primary btn--big" onClick={onNext}>
            Prossimo round
          </button>
        ) : (
          <button className="btn btn--primary btn--big" onClick={onExit}>
            Rigioca
          </button>
        )}
        <button className="btn btn--ghost" onClick={onExit}>
          Torna alla home
        </button>
      </div>
    </div>
  );
}
