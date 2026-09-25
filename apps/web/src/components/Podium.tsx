import { useMemo, type CSSProperties } from 'react';
import type { RoundResultEntry } from '@boggle/shared';
import { avatarFromNickname } from '../avatars.js';

interface PodiumPlayer {
  id: string;
  avatar: string;
  photoUrl?: string;
}

interface PodiumProps {
  /** Classifica finale (viene riordinata per punteggio, non serve che arrivi ordinata). */
  results: RoundResultEntry[];
  /** Avatar e foto per giocatore: i risultati contengono solo il nickname. */
  players?: PodiumPlayer[];
  /** Giocatore di chi guarda: la sua pedana resta evidenziata. */
  meId?: string | null;
}

/** Medaglie per i primi tre posti. */
const MEDALS = ['🥇', '🥈', '🥉'] as const;

/**
 * Ordine visivo delle pedane: 2°, 1°, 3°.
 *
 * Il vincitore sta al centro e sulla pedana più alta, come su un podio vero: se
 * l'ordine fosse 1°, 2°, 3° la lettura sarebbe quella di una classifica, non di un
 * podio.
 */
const VISUAL_ORDER = [1, 0, 2] as const;

/**
 * Pedana vuota: si usa quando i giocatori sono due.
 *
 * Motivo: con due soli posti il vincitore scivolerebbe a destra (2° a sinistra,
 * 1° a destra) e cambierebbe posizione rispetto alla partita a tre. Con questo
 * spazio invisibile al posto del terzo il vincitore resta **sempre al centro**,
 * in qualunque numero di giocatori: la corona si cerca sempre nello stesso punto.
 */
const POSTO_VUOTO = -1;

/**
 * Posti da disegnare, nell'ordine visivo (2°, 1°, 3°).
 *
 * - 0 o 1 giocatore: nessuna pedana (il podio non si mostra affatto).
 * - 2 giocatori: `[2°, 1°, vuoto]` → il vincitore resta al centro.
 * - 3 o più: `[2°, 1°, 3°]` (dal quarto in poi si passa alla riga «a seguire»).
 *
 * È una funzione a sé perché è **pura**: si prova senza browser e senza montare
 * React (`Podium.test.ts`), ed è il punto dove il numero di giocatori si traduce
 * in disposizione — cioè dove i casi strani si nascondono.
 */
export function postiPodio(giocatori: number): number[] {
  if (giocatori < 2) return [];
  const visibili = VISUAL_ORDER.filter((i) => i < giocatori);
  return visibili.length === 2 ? [1, 0, POSTO_VUOTO] : visibili;
}

/** Giocatori che restano fuori dal podio: dal quarto in poi. */
export function quantiAseguire(giocatori: number): number {
  return Math.max(0, giocatori - 3);
}

/** Coriandoli: pochi elementi decorativi, distribuiti in modo deterministico. */
const CONFETTI = ['🎉', '✨', '🎊', '⭐'] as const;

/**
 * Podio di fine partita multiplayer: i primi tre con avatar, nome e punteggio.
 *
 * Perché un componente a sé: la schermata di riepilogo ha già molto contenuto
 * (classifica completa, parole di ognuno, azioni) e l'effetto di scena è solo
 * decorativo — non deve complicare la logica del riepilogo.
 *
 * L'animazione è volutamente **semplice e breve** (un'entrata a scaglioni, un
 * alone sul vincitore, qualche coriandolo) e si appoggia al blocco globale
 * `prefers-reduced-motion`, che la disattiva per chi lo richiede.
 *
 * Numero di giocatori:
 * - **1 solo**: niente podio (un podio con una persona sola non è un podio): si
 *   vede direttamente la classifica.
 * - **2**: due pedane, con il vincitore al centro come nella partita a tre.
 * - **3**: il podio completo.
 * - **4 o più**: i primi tre sul podio e gli altri elencati subito sotto, in una
 *   riga compatta. Prima sparivano dal podio e si ritrovavano solo nella
 *   classifica: chi guardava si chiedeva dove fossero finiti.
 */
export function Podium({ results, players, meId }: PodiumProps) {
  /**
   * Tutti i giocatori, dal primo all'ultimo. Il podio ne mostra tre; gli altri
   * (dal quarto in poi) finiscono nella riga "a seguire".
   */
  const ordinati = useMemo(
    () => [...results].sort((a, b) => b.totalScore - a.totalScore),
    [results],
  );
  const top = ordinati.slice(0, 3);
  const altri = ordinati.slice(3);
  const playerById = useMemo(() => new Map((players ?? []).map((p) => [p.id, p])), [players]);

  // Con un solo giocatore non c'è un podio da mostrare: si va diretti alla classifica.
  const pedane = postiPodio(ordinati.length);
  if (pedane.length === 0) return null;

  const winner = top[0]!;

  return (
    <section className="podium" aria-label="Podio della partita">
      <p className="podium__title">
        <span aria-hidden>🏆</span> Vince <strong>{winner.nickname}</strong> con {winner.totalScore}{' '}
        punti
      </p>

      <div className="podium__steps">
        {pedane.map((i) => {
          // Posto vuoto (due giocatori): occupa la sua parte di larghezza e
          // basta, senza contenuto e fuori dall'albero di accessibilità.
          if (i === POSTO_VUOTO) {
            return <div key="vuoto" className="podium__place podium__place--empty" aria-hidden />;
          }
          const r = top[i];
          if (!r) return null;
          const player = playerById.get(r.playerId);
          const isWinner = i === 0;
          return (
            <div
              key={r.playerId}
              className={`podium__place podium__place--${i + 1}${
                r.playerId === meId ? ' podium__place--you' : ''
              }`}
              /* Il 3° sale per primo, poi il 2° e infine il vincitore. */
              style={{ '--delay': `${[2, 1, 0][i]! * 0.14}s` } as CSSProperties}
            >
              <div className="podium__head">
                <span className="podium__avatar-wrap">
                  <span className="podium__avatar" aria-hidden>
                    {player?.photoUrl ? (
                      <img src={player.photoUrl} alt="" />
                    ) : (
                      (player?.avatar ?? avatarFromNickname(r.nickname))
                    )}
                  </span>
                  {isWinner && (
                    <span className="podium__crown" aria-hidden>
                      👑
                    </span>
                  )}
                </span>
                <span className="podium__name">{r.nickname}</span>
                <span className="podium__score">{r.totalScore}</span>
              </div>

              <div className="podium__block">
                <span className="podium__medal" aria-hidden>
                  {MEDALS[i]}
                </span>
                <span className="podium__rank">{i + 1}°</span>
              </div>
            </div>
          );
        })}

        {/* Coriandoli decorativi: nessuna informazione, quindi fuori dall'albero
            di accessibilità. Con `prefers-reduced-motion` non si animano. */}
        <div className="podium__confetti" aria-hidden>
          {Array.from({ length: 12 }, (_, i) => (
            <span
              key={i}
              className="podium__confetti-piece"
              style={{
                left: `${(i * 8.3 + 3) % 100}%`,
                animationDelay: `${(i % 6) * 0.28}s`,
                fontSize: `${0.7 + (i % 3) * 0.22}rem`,
              }}
            >
              {CONFETTI[i % CONFETTI.length]}
            </span>
          ))}
        </div>
      </div>

      {/*
       * Quarto posto in poi: restano fuori dal podio (che è a tre, come quello
       * olimpico) ma non spariscono dalla schermata. Una riga compatta, in tono
       * sommesso: il podio resta il protagonista e chi è arrivato dopo si vede
       * subito, senza dover scorrere fino alla classifica completa.
       */}
      {altri.length > 0 && (
        <ol className="podium__rest" aria-label="Gli altri giocatori">
          {altri.map((r, i) => (
            <li
              key={r.playerId}
              className={`podium__rest-row${r.playerId === meId ? ' podium__rest-row--you' : ''}`}
            >
              <span className="podium__rest-rank">{i + 4}°</span>
              <span className="podium__rest-name">{r.nickname}</span>
              <span className="podium__rest-score">{r.totalScore}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
