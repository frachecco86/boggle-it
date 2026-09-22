import { useEffect, useMemo, useRef, useState } from 'react';
import type { RoundResultEntry } from '@boggle/shared';
import { audio } from '../audio/AudioEngine.js';
import { buildReplayPlan, revealedCountAt, type ReplayStep } from '../game/replay.js';

interface RoundReplayProps {
  /** Risultati del round appena concluso (con `timeline`). */
  results: RoundResultEntry[];
  /** Chiamato quando il replay finisce (o viene saltato). */
  onDone: () => void;
  /** Avatar/foto per giocatore, per la barra in basso. */
  players?: Array<{ id: string; avatar: string; photoUrl?: string }>;
}

/**
 * Replay "arcade" di fine round, in stile Boggle originale.
 *
 * In basso ci sono i concorrenti; le parole indovinate si accendono una alla
 * volta rispettando la timeline REALE di quando sono state trovate, come se la
 * partita venisse ripercorsa velocissima. Il punteggio di ogni giocatore si
 * accumula fino al totale del round, con un suono a ogni scoperta.
 *
 * Perché un componente a sé: la schermata di riepilogo ha molti contenuti
 * (elenco completo, parole mancate, filtri) e non deve occuparsi anche
 * dell'animazione. Qui c'è solo il replay; al termine si passa al riepilogo.
 */
export function RoundReplay({ results, onDone, players }: RoundReplayProps) {
  const plan = useMemo(() => buildReplayPlan(results), [results]);
  const [revealed, setRevealed] = useState(0);
  const [done, setDone] = useState(false);
  const lastRevealedRef = useRef(0);
  const reduced = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );

  // Nessuna timeline disponibile (partite vecchie o round senza parole): si passa
  // direttamente al riepilogo, senza animazione.
  useEffect(() => {
    if (plan.steps.length === 0) onDone();
  }, [plan, onDone]);

  // Avanza il replay con rAF. Con `prefers-reduced-motion` si salta subito.
  useEffect(() => {
    if (plan.steps.length === 0) return;
    if (reduced) {
      setRevealed(plan.steps.length);
      setDone(true);
      return;
    }
    let raf = 0;
    const started = performance.now();
    const tick = () => {
      const elapsed = performance.now() - started;
      const n = revealedCountAt(plan, elapsed);
      if (n !== lastRevealedRef.current) {
        // Un suono per ogni parola rivelata (anche più d'una nello stesso frame).
        for (let i = lastRevealedRef.current; i < n; i++) {
          audio.playReveal(plan.steps[i]!.unique);
        }
        lastRevealedRef.current = n;
        setRevealed(n);
      }
      if (elapsed < plan.durationMs) {
        raf = requestAnimationFrame(tick);
      } else {
        setDone(true);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [plan, reduced]);

  // Alla fine: accordo e, dopo una breve pausa, si passa al riepilogo.
  useEffect(() => {
    if (!done) return;
    audio.playRevealEnd();
    const t = window.setTimeout(onDone, 1100);
    return () => window.clearTimeout(t);
  }, [done, onDone]);

  // Saltare il replay: tutte le parole visibili, totali definitivi.
  const skip = () => {
    lastRevealedRef.current = plan.steps.length;
    setRevealed(plan.steps.length);
    setDone(true);
  };

  /**
   * Parole rivelate per giocatore, in ordine cronologico. Array e non mappa per
   * mantenere l'ordine di scoperta (una mappa lo altererebbe in alcuni motori).
   */
  const byPlayer = useMemo(() => {
    const map = new Map<string, { words: ReplayStep[]; score: number }>();
    for (const r of results) map.set(r.playerId, { words: [], score: 0 });
    for (let i = 0; i < revealed; i++) {
      const step = plan.steps[i]!;
      const entry = map.get(step.playerId);
      if (!entry) continue;
      entry.words.push(step);
      entry.score += step.points;
    }
    return map;
  }, [revealed, plan, results]);

  const totalWords = plan.steps.length;
  const progress = totalWords > 0 ? revealed / totalWords : 1;
  const started = revealed > 0;

  return (
    <div className="replay">
      <div className="replay__head">
        <h3 className="replay__title">Rivediamo il round</h3>
        <span className="replay__counter">
          {revealed}/{totalWords} parole
        </span>
      </div>

      <div className="replay__bar">
        <div className="replay__bar-fill" style={{ width: `${Math.max(2, progress * 100)}%` }} />
      </div>

      {/* I concorrenti in basso, come nel Boggle: per ognuno le parole che si
          accendono man mano e il punteggio che sale. */}
      <div className="replay__players">
        {results.map((r) => {
          const data = byPlayer.get(r.playerId);
          const words = data?.words ?? [];
          const score = data?.score ?? 0;
          const player = players?.find((p) => p.id === r.playerId);
          return (
            <div key={r.playerId} className={`replay__player${score > 0 ? ' replay__player--active' : ''}`}>
              <div className="replay__player-head">
                <span className="replay__avatar" aria-hidden>
                  {player?.photoUrl ? <img src={player.photoUrl} alt="" /> : (player?.avatar ?? '🐱')}
                </span>
                <span className="replay__name">{r.nickname}</span>
                {/* Il `key` fa ripartire l'animazione di pop a ogni punto. */}
                <span key={score} className="replay__score">
                  {score}
                </span>
              </div>
              <div className="replay__words">
                {words.map((w) => (
                  <span
                    key={w.word}
                    className={`replay__word${w.unique ? ' replay__word--unique' : ''}`}
                  >
                    {w.word.toUpperCase()}
                    {w.unique && <span className="replay__x2">×2</span>}
                  </span>
                ))}
                {started && words.length === 0 && <span className="replay__empty-label">…</span>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="replay__actions">
        {!done && (
          <button className="btn btn--ghost" onClick={skip}>
            Salta
          </button>
        )}
      </div>
    </div>
  );
}
