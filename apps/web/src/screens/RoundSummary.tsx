import { useEffect, useMemo, useRef, useState } from 'react';
import { BackHome } from '../components/BackHome.js';

interface RoundSummaryProps {
  round: number;
  rounds: number;
  score: number;
  totalScore: number;
  /** Parole trovate (in tutta la partita, a fine partita). */
  words: string[];
  /** Parole della scheda che NON sono state trovate. */
  missedWords: string[];
  isGameOver: boolean;
  /** Tutte le parole della scheda, per mostrare anche quelle fuori lista. */
  allWords?: string[];
  onNext: () => void;
  /** A fine partita: ricomincia con le stesse impostazioni. */
  onReplay?: () => void;
  onExit: () => void;
  /**
   * Esito della registrazione della partita in classifica (solo a fine partita).
   * Trasformare un fallimento silenzioso in un messaggio esplicito è il modo più
   * diretto per non far credere che la partita sia salvata quando non lo è.
   */
  saveStatus?: 'idle' | 'anonymous' | 'saving' | 'saved' | 'failed';
}

/**
 * Riepilogo di fine round o di fine partita.
 *
 * Mostra TUTTE le parole della scheda: quelle trovate in evidenza e quelle
 * mancate in tono attenuato. A cosa serve: sapere cosa era possibile trovare è
 * la parte più utile per migliorare, e vedere quante parole sfuggite dà il senso
 * di quanto c'era ancora da scoprire.
 */
export function RoundSummary(props: RoundSummaryProps) {
  const {
    round,
    rounds,
    score,
    totalScore,
    words,
    missedWords,
    isGameOver,
    allWords,
    onNext,
    onReplay,
    onExit,
    saveStatus,
  } = props;
  /** A fine partita il tasto principale rigioca (se chi chiama lo permette). */
  const replay = onReplay ?? onExit;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [filterLength, setFilterLength] = useState<number | 'all'>('all');
  /** Mostra/nasconde le parole mancate (l'elenco completo può essere lungo). */
  const [showMissed, setShowMissed] = useState(true);

  const foundSet = useMemo(() => new Set(words), [words]);

  /**
   * Elenco completo delle parole: se il chiamante passa `allWords` usiamo quello
   * (comprende anche eventuali parole non in `words` né in `missedWords`),
   * altrimenti uniamo trovate e mancate.
   */
  const everyWord = useMemo(() => {
    const base = allWords && allWords.length > 0 ? allWords : [...words, ...missedWords];
    return [...new Set(base)].sort((a, b) => a.length - b.length || a.localeCompare(b, 'it'));
  }, [allWords, words, missedWords]);

  /** Distribuzione per lunghezza, per i pulsanti di filtro. */
  const lengths = useMemo(() => {
    const m = new Map<number, { total: number; found: number }>();
    for (const w of everyWord) {
      const e = m.get(w.length) ?? { total: 0, found: 0 };
      e.total++;
      if (foundSet.has(w)) e.found++;
      m.set(w.length, e);
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([length, v]) => ({ length, ...v }));
  }, [everyWord, foundSet]);

  const visible = useMemo(() => {
    const byLen = filterLength === 'all' ? everyWord : everyWord.filter((w) => w.length === filterLength);
    return showMissed ? byLen : byLen.filter((w) => foundSet.has(w));
  }, [everyWord, filterLength, showMissed, foundSet]);

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

  const foundCount = words.length;
  const totalCount = everyWord.length;

  return (
    <div className="screen summary">
      <BackHome confirm={!isGameOver} />
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

      {isGameOver && saveStatus && saveStatus !== 'idle' && (
        <p className={`summary__save summary__save--${saveStatus}`}>
          {saveStatus === 'saving' && 'Salvo la partita in classifica…'}
          {saveStatus === 'saved' && '✓ Partita salvata in classifica.'}
          {saveStatus === 'anonymous' && 'Gioca con un profilo per entrare in classifica.'}
          {saveStatus === 'failed' && '⚠ Non sono riuscito a salvare la partita in classifica (server irraggiungibile).'}
        </p>
      )}

      {/* Riassunto: quante trovate su quante possibili. */}
      <p className="summary__ratio">
        Hai trovato <strong>{foundCount}</strong> parole su <strong>{totalCount}</strong> (
        {totalCount > 0 ? Math.round((foundCount / totalCount) * 100) : 0}%)
      </p>

      <section className="summary__section">
        <div className="summary__controls">
          <h3 className="summary__label">Tutte le parole</h3>
          <label className="summary__toggle">
            <input
              type="checkbox"
              checked={showMissed}
              onChange={(e) => setShowMissed(e.target.checked)}
            />
            <span>Mostra anche le mancate</span>
          </label>
        </div>

        {/* Filtri per lunghezza, con quante ne hai trovate su quante. */}
        <div className="summary__lengths">
          <button
            className={`pill${filterLength === 'all' ? ' pill--active' : ''}`}
            onClick={() => setFilterLength('all')}
          >
            Tutte {totalCount}
          </button>
          {lengths.map((l) => (
            <button
              key={l.length}
              className={`pill${filterLength === l.length ? ' pill--active' : ''}`}
              onClick={() => setFilterLength(filterLength === l.length ? 'all' : l.length)}
            >
              {l.length} lettere {l.found}/{l.total}
            </button>
          ))}
        </div>

        <div className="chip-list">
          {visible.length === 0 && (
            <span className="summary__empty">
              {showMissed ? 'Nessuna parola con questo filtro' : 'Nessuna parola trovata'}
            </span>
          )}
          {visible.map((w) => {
            const trovata = foundSet.has(w);
            return (
              <span
                key={w}
                className={`chip${trovata ? ' chip--found' : ' chip--muted'}`}
                title={trovata ? 'Trovata' : 'Non trovata'}
              >
                {trovata && <span className="chip__check">✓</span>}
                {w.toUpperCase()}
              </span>
            );
          })}
        </div>
      </section>

      <div className="summary__actions">
        {!isGameOver ? (
          <button className="btn btn--primary btn--big" onClick={onNext}>
            Prossimo round
          </button>
        ) : (
          <button className="btn btn--primary btn--big" onClick={replay}>
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
