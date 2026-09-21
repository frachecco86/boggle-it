import type { OpponentEvent } from '../state/store.js';

interface Props {
  events: OpponentEvent[];
  /** Timestamp corrente, per capire quali eventi sono ancora "freschi". */
  now: number;
}

/** Quanto resta visibile la notifica di una parola trovata da un avversario. */
const VISIBLE_MS = 3200;
/** Massimo numero di notifiche impilate contemporaneamente. */
const MAX_VISIBLE = 3;

/**
 * Notifiche degli avversari, in basso.
 *
 * Quando un altro giocatore trova una parola compare una scheda con il suo
 * profilo (foto o avatar), il nome e i punti, che sfuma dopo qualche secondo.
 *
 * Perché una notifica a parte e non solo il badge accanto al nome nella
 * classifica: la classifica può essere fuori schermo, mentre queste schede
 * compaiono sempre nello stesso punto e danno un colpo d'occhio immediato su
 * "chi sta segnando". Insieme all'esultanza sonora (a volume ridotto), rendono
 * percepibile l'andamento della partita senza dover leggere i numeri.
 */
export function OpponentFeed({ events, now }: Props) {
  // Solo gli eventi recenti, i più nuovi in fondo (così scorrono verso l'alto).
  const visible = events.filter((ev) => now - ev.at < VISIBLE_MS).slice(-MAX_VISIBLE);

  if (visible.length === 0) return null;

  return (
    <div className="opponent-feed" role="status" aria-live="polite">
      {visible.map((ev) => (
        <div key={ev.id} className="opponent-feed__card">
          <span className="opponent-feed__avatar" aria-hidden>
            {ev.photoUrl ? <img src={ev.photoUrl} alt="" /> : ev.avatar}
          </span>
          <span className="opponent-feed__body">
            <span className="opponent-feed__name">{ev.nickname}</span>
            <span className="opponent-feed__detail">
              parola da {ev.wordLength} lettere
            </span>
          </span>
          <span className="opponent-feed__points">+{ev.points}</span>
        </div>
      ))}
    </div>
  );
}
