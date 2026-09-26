import type { PlayerPublic } from '@boggle/shared';
import { lengthBucket } from '../game/lengthBucket.js';
import { SpeakingIndicator } from './VoiceControls.js';

/** Punti guadagnati "adesso" da un giocatore, con l'id per riavviare l'effetto. */
export interface AvatarBadge {
  points: number;
  id: number;
  /** Lunghezza della parola trovata (fascia 3…7), per il colore del "+N". */
  len: number;
}

interface AvatarScoreBarProps {
  players: PlayerPublic[];
  meId: string | null;
  /** Badge "+N" attivi, per id giocatore (finestra di pochi secondi). */
  badges: Map<string, AvatarBadge>;
  /** Id di chi sta parlando in questo momento. */
  speakers: string[];
  /** Con pochi giocatori si può mostrare anche il nome sotto l'avatar. */
  showNames?: boolean;
  /** Riga di servizio (es. "sei da solo: condividi il codice"). */
  hint?: string;
}

/**
 * Barra dei giocatori in fondo alla partita multiplayer: avatar tondi, punteggio
 * sotto e il "+N" che si sovrappone all'avatar quando qualcuno trova una parola.
 *
 * Perché in fondo e non in classifica: la classifica era un elenco che scorreva
 * fuori schermo, proprio mentre si gioca. Qui tutti gli avatar restano visibili
 * nello stesso punto, e il numero dei punti si accende SOPRA chi ha segnato —
 * si capisce chi sta andando forte con la coda dell'occhio, senza leggere.
 *
 * L'ordine è per punteggio decrescente: chi è davanti sta a sinistra. Gli avatar
 * non si spostano a ogni parola, solo quando qualcuno supera qualcun altro.
 */
export function AvatarScoreBar({
  players,
  meId,
  badges,
  speakers,
  showNames = false,
  hint,
}: AvatarScoreBarProps) {
  const ordered = [...players].sort((a, b) => b.score - a.score);

  return (
    <div className="avatar-bar">
      <ul className="avatar-bar__list">
        {ordered.map((p) => {
          const badge = badges.get(p.id);
          const speaking = speakers.includes(p.id);
          return (
            <li
              key={p.id}
              className={`avatar-bar__item${p.id === meId ? ' avatar-bar__item--you' : ''}${
                p.connected ? '' : ' avatar-bar__item--off'
              }`}
            >
              <span
                className={`avatar-bar__avatar${speaking ? ' avatar-bar__avatar--speaking' : ''}`}
                title={`${p.nickname}: ${p.score} punti`}
                aria-label={`${p.nickname}, ${p.score} punti${speaking ? ', sta parlando' : ''}`}
              >
                {p.photoUrl ? <img src={p.photoUrl} alt="" /> : <span aria-hidden>{p.avatar}</span>}
                {badge && (
                  /* `key` sull'id del badge: ogni nuova parola rimonta il nodo e
                     l'animazione riparte da capo, anche se i punti sono uguali. */
                  <span
                    key={badge.id}
                    className="avatar-bar__pop"
                    data-len={lengthBucket(badge.len)}
                    aria-hidden
                  >
                    +{badge.points}
                  </span>
                )}
                {speaking && (
                  <span className="avatar-bar__speaking">
                    <SpeakingIndicator name={p.nickname} />
                  </span>
                )}
              </span>
              <span className="avatar-bar__score">{p.score}</span>
              {showNames && <span className="avatar-bar__name">{p.nickname}</span>}
            </li>
          );
        })}
      </ul>
      {hint && <p className="avatar-bar__hint">{hint}</p>}
    </div>
  );
}
