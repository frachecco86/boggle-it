import { useEffect, useRef } from 'react';
import { audio } from '../audio/AudioEngine.js';

/** Secondi finali in cui scatta il feedback sonoro. */
export const FINAL_SECONDS = 10;

/**
 * Decide se suonare il tick per questo aggiornamento del timer.
 *
 * Estratta dal hook perché è pura e quindi testabile senza React (il progetto non
 * usa jsdom né testing-library). Ritorna il secondo da suonare, o `null`.
 *
 * Regole:
 *  - solo negli ultimi `FINAL_SECONDS` e mai a 0 (il round è finito);
 *  - al massimo UNA volta per secondo: il timer si aggiorna a ogni frame, senza
 *    questo controllo il tick partirebbe decine di volte al secondo;
 *  - `lastPlayed` è il secondo già suonato, e viene passato/ritornato dal chiamante.
 */
export function nextTickSecond(
  timeLeftMs: number,
  active: boolean,
  lastPlayed: number | null,
): number | null {
  if (!active) return null;
  const secondsLeft = Math.ceil(timeLeftMs / 1000);
  if (secondsLeft > FINAL_SECONDS || secondsLeft <= 0) return null;
  if (lastPlayed === secondsLeft) return null;
  return secondsLeft;
}

/**
 * Feedback sonoro degli ultimi secondi del round.
 *
 * Un tick per secondo, con tono crescente: si sente che il tempo sta finendo
 * senza guardare il timer. Il volume resta volutamente basso: è un promemoria,
 * non un allarme (vedi `playRoundTick`).
 *
 * PERCHÉ UN HOOK: il timer del single player e quello del multiplayer usano due
 * implementazioni diverse (deadline locale vs `roundEndsAt` del server), ma il
 * feedback deve essere identico. Qui la logica sta in un solo posto.
 */
export function useFinalCountdown(timeLeftMs: number, active: boolean): void {
  const lastTickRef = useRef<number | null>(null);

  useEffect(() => {
    const seconds = nextTickSecond(timeLeftMs, active, lastTickRef.current);
    if (seconds === null) {
      // Round non attivo o fuori finestra: se è finito, azzera così il prossimo
      // round riparte pulito (senza, l'ultimo secondo suonato non risuonerebbe).
      if (!active) lastTickRef.current = null;
      return;
    }
    lastTickRef.current = seconds;
    audio.playRoundTick(seconds);
  }, [timeLeftMs, active]);
}
