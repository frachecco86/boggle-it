import { useState } from 'react';
import {
  DIFFICULTIES,
  DIFFICULTY_ORDER,
  resolveSchedaVariant,
  ROUND_DURATIONS_SEC,
  SCHEDA_VARIANT_HINTS,
  SCHEDA_VARIANT_LABELS,
  type GridSize,
} from '@boggle/shared';
import { useAppStore } from '../state/store.js';
import { BackHome } from '../components/BackHome.js';
import { roomShareText, roomUrl } from '../net/roomLink.js';
import { SpeakingIndicator, useVoiceSpeakers } from '../components/VoiceControls.js';
import { Share2 } from '../components/icons.js';
import { AvatarPicker } from '../components/AvatarPicker.js';
import { MusicPicker } from '../components/MusicPicker.js';

/** Lobby multiplayer: codice stanza, giocatori, impostazioni host. */
export function LobbyScreen() {
  const {
    room,
    roomCode,
    nickname,
    setNickname,
    avatar,
    setAvatar,
    startRoom,
    startNewMatch,
    closeRoom,
    shuffleScheda,
    configureRoom,
    leaveRoom,
    playerId,
    roomNotice,
    clearRoomNotice,
  } = useAppStore();
  const [copied, setCopied] = useState(false);
  /** Messaggio momentaneo sotto il codice stanza ("Link copiato!"). */
  const [inviteFeedback, setInviteFeedback] = useState<string | null>(null);
  // Chi sta parlando adesso: l'indicatore compare accanto al nome.
  const speakers = useVoiceSpeakers();

  const isHost = room?.hostId === playerId;

  const canStart = (room?.players.filter((p) => p.connected).length ?? 0) >= 1;

  /*
   * Partita già conclusa: l'ultimo round è chiuso (pausa in corso) o la stanza è
   * alla classifica finale.
   *
   * Si arriva qui di solito dalla schermata finale, ma non sempre: chi è arrivato
   * tardi è in sala d'attesa da prima, e se l'host se n'è andato il ruolo è
   * passato a lui. In quel caso i pulsanti giusti sono «Gioca ancora» e «Chiudi
   * la stanza», non «Avvia partita» — che il server non eseguirebbe comunque.
   */
  const matchOver =
    room !== null &&
    (room.phase === 'gameEnd' ||
      (room.phase === 'roundEnd' && room.currentRound >= room.rounds));
  /** Chi è seduto qui ma gioca la partita successiva. */
  const waitingPlayers = room?.players.filter((p) => p.waiting) ?? [];
  const iAmWaiting = room?.players.some((p) => p.id === playerId && p.waiting) ?? false;

  const copyCode = async () => {
    if (!roomCode) return;
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  /** Avviso momentaneo accanto al codice (si spegne da solo). */
  const flashInvite = (message: string) => {
    setInviteFeedback(message);
    window.setTimeout(() => setInviteFeedback(null), 2500);
  };

  /** Copia il LINK della stanza: è quello che si incolla in una chat. */
  const copyInviteLink = async () => {
    if (!roomCode) return;
    try {
      await navigator.clipboard.writeText(roomUrl(roomCode));
      flashInvite('Link copiato! Incollalo dove vuoi.');
    } catch {
      // Clipboard negata (contesto non sicuro o permesso negato): si mostra il
      // link, così si può copiarlo a mano invece di restare senza nulla.
      flashInvite(roomUrl(roomCode));
    }
  };

  /**
   * Tasto Condividi: apre il foglio di condivisione del sistema (WhatsApp,
   * Telegram, mail…) e, dove non esiste, copia il link.
   *
   * Il link condiviso è quello da cui si sta giocando: chi lo apre trova l'app
   * con il codice già scritto nel campo "Entra".
   */
  const shareInvite = async () => {
    if (!roomCode) return;
    const link = roomUrl(roomCode);
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'Sbooble', text: roomShareText(roomCode), url: link });
        return;
      } catch (err) {
        // L'utente ha chiuso il foglio di condivisione: non è un errore e non si
        // deve copiare nulla al posto suo.
        if ((err as DOMException | null)?.name === 'AbortError') return;
        // Altri motivi (permesso negato, share non disponibile in questo
        // contesto): si ripiega sul copia, che funziona sempre.
      }
    }
    await copyInviteLink();
  };

  if (!room) {
    return (
      <div className="screen">
        <h2 className="screen__title">Stanza non disponibile</h2>
        <button className="btn btn--primary" onClick={leaveRoom}>
          Torna alla home
        </button>
      </div>
    );
  }

  const activeDifficulty = DIFFICULTIES[room.difficulty];
  // Criteri delle schede della stanza (le stanze vecchie non hanno il campo).
  const variant = resolveSchedaVariant(room.schedaVariant);

  return (
    <div className="screen lobby">
      <BackHome confirm onLeave={leaveRoom} />
      <h2 className="screen__title">
        {/* Con una partita già giocata alle spalle, «sala d'attesa» dice poco. */}
        {room.matchNumber > 1 ? `Sala d'attesa — partita ${room.matchNumber}` : "Sala d'attesa"}
      </h2>

      {/*
        Avviso dello store: «è iniziata una partita nuova» o «sei arrivato tardi,
        giochi alla prossima». Arriva da un evento del socket, per questo vive
        nello store e non in un `useState` del componente.
      */}
      {roomNotice && (
        <div className="banner banner--info" role="status">
          {roomNotice}
          <button className="banner__dismiss" onClick={clearRoomNotice} aria-label="Nascondi l'avviso">
            ×
          </button>
        </div>
      )}

      <button className="room-code" onClick={copyCode} title="Copia il codice" aria-label={`Codice stanza ${roomCode}: copia il codice`}>
        <span className="room-code__label">Codice stanza</span>
        <span className="room-code__value">{roomCode}</span>
        <span className="room-code__hint">{copied ? 'Codice copiato!' : 'Tocca per copiare il codice'}</span>
      </button>

      {/* Invito: il link apre l'app con il codice già scritto. */}
      <div className="lobby__invite">
        <button className="btn btn--primary lobby__invite-btn" onClick={() => void shareInvite()}>
          <Share2 size={18} aria-hidden />
          Condividi l'invito
        </button>
        <button className="btn btn--ghost lobby__invite-copy" onClick={() => void copyInviteLink()}>
          Copia il link
        </button>
        {inviteFeedback && (
          <p className="lobby__invite-feedback" role="status">
            {inviteFeedback}
          </p>
        )}
      </div>

      <section className="lobby__section">
        <h3 className="summary__label">
          Giocatori ({room.players.length}/{room.maxPlayers})
          {room.players.length >= room.maxPlayers && ' — stanza piena'}
        </h3>
        <ul className="player-list">
          {room.players.map((p) => (
            <li key={p.id} className={`player-row${p.connected ? '' : ' player-row--off'}`}>
              <span className="player-row__avatar" aria-hidden>
                {p.photoUrl ? <img src={p.photoUrl} alt="" /> : p.avatar}
              </span>
              <span className="player-row__name">
                {p.nickname}
                {speakers.includes(p.id) && <SpeakingIndicator name={p.nickname} />}
              </span>
              {p.isHost && <span className="badge">host</span>}
              {p.id === playerId && <span className="badge badge--you">tu</span>}
              {/* In attesa della prossima partita: è in stanza, non gioca questa. */}
              {p.waiting && (
                <span className="badge badge--waiting" title="Giocherà con la prossima partita">
                  in attesa
                </span>
              )}
              {!p.connected && <span className="badge badge--off">offline</span>}
            </li>
          ))}
        </ul>
        {waitingPlayers.length > 0 && (
          <p className="lobby__hint">
            {waitingPlayers.length === 1
              ? `${waitingPlayers[0]!.nickname} giocherà con la prossima partita.`
              : `${waitingPlayers.length} giocatori giocheranno con la prossima partita.`}
          </p>
        )}
      </section>

      <section className="lobby__section">
        <h3 className="summary__label">Impostazioni</h3>
        <div className="profile-card profile-card--compact">
          <AvatarPicker value={avatar} onChange={setAvatar} />
          <label className="field profile-card__field">
            <span className="field__label">Il tuo nome</span>
            <input
              className="field__input"
              value={nickname}
              maxLength={20}
              onChange={(e) => setNickname(e.target.value)}
            />
          </label>
        </div>

        {isHost ? (
          <div className="settings-host">
            <span className="field__label">Dimensione griglia</span>
            <div className="rounds-options">
              {([4, 5, 6] as GridSize[]).map((s) => (
                <button
                  key={s}
                  className={`pill${room.gridSize === s ? ' pill--active' : ''}`}
                  onClick={() => configureRoom(s, room.difficulty, room.rounds, room.roundDurationMs, room.musicId)}
                >
                  {s}×{s}
                </button>
              ))}
            </div>

            <span className="field__label">Difficoltà</span>
            <div className="difficulty-options difficulty-options--compact">
              {DIFFICULTY_ORDER.map((id) => {
                const meta = DIFFICULTIES[id];
                return (
                  <button
                    key={id}
                    className={`difficulty-option difficulty-option--compact${
                      room.difficulty === id ? ' difficulty-option--active' : ''
                    }`}
                    style={{ ['--level-accent' as string]: meta.theme.accent }}
                    onClick={() => configureRoom(room.gridSize, id, room.rounds, room.roundDurationMs, room.musicId)}
                  >
                    <span className="difficulty-option__dot" />
                    <span className="difficulty-option__label">{meta.label}</span>
                  </button>
                );
              })}
            </div>

            <span className="field__label">Durata round</span>
            <div className="rounds-options">
              {ROUND_DURATIONS_SEC.map((sec) => (
                <button
                  key={sec}
                  className={`pill${room.roundDurationMs === sec * 1000 ? ' pill--active' : ''}`}
                  onClick={() => configureRoom(room.gridSize, room.difficulty, room.rounds, sec * 1000, room.musicId)}
                >
                  {sec} sec
                </button>
              ))}
            </div>

            <span className="field__label">Numero massimo di giocatori</span>
            <div className="rounds-options">
              {[2, 4, 8].map((n) => (
                <button
                  key={n}
                  className={`pill${room.maxPlayers === n ? ' pill--active' : ''}`}
                  onClick={() =>
                    configureRoom(
                      room.gridSize,
                      room.difficulty,
                      room.rounds,
                      room.roundDurationMs,
                      room.musicId,
                      n,
                    )
                  }
                >
                  {n === 2 ? '2 (sfida)' : n}
                </button>
              ))}
            </div>

            <span className="field__label">Round</span>
            <div className="rounds-options">
              {[1, 3, 5].map((r) => (
                <button
                  key={r}
                  className={`pill${room.rounds === r ? ' pill--active' : ''}`}
                  onClick={() => configureRoom(room.gridSize, room.difficulty, r, room.roundDurationMs, room.musicId)}
                >
                  {r}
                </button>
              ))}
            </div>

            {/*
             * Criteri delle schede: ETICHETTA, non un selettore.
             *
             * La variante la imposta l'admin a livello globale: l'host non può
             * cambiarla. Resta visibile qui perché in lobby si vede cosa si sta
             * per giocare (e il server la applica comunque).
             */}
            <span className="field__label">Schede</span>
            <div className="settings-readonly settings-readonly--inline">
              <span title={SCHEDA_VARIANT_HINTS[variant]}>{SCHEDA_VARIANT_LABELS[variant]}</span>
            </div>
            <p className="settings-host__hint">
              Il tipo di scheda è impostato dall'amministratore e vale per tutte le partite.
            </p>

            <MusicPicker
              value={room.musicId ?? 'none'}
              onChange={(choice) =>
                configureRoom(room.gridSize, room.difficulty, room.rounds, room.roundDurationMs, choice)
              }
              title="Musica della stanza"
              hint="La traccia la sentono tutti i giocatori."
            />

            <p className="settings-host__hint">Le modifiche sono visibili a tutti in tempo reale.</p>
          </div>
        ) : (
          <div className="settings-readonly">
            <span>
              {activeDifficulty.label} · {room.gridSize}×{room.gridSize} · {room.roundDurationMs / 1000}s ·{' '}
              {room.rounds} round · max {room.maxPlayers} giocatori · {SCHEDA_VARIANT_LABELS[variant]}
            </span>
          </div>
        )}
      </section>

      {/*
       * Scheda del round: si sa SOLO che è pronta. La griglia, le parole e il
       * record non si mostrano più qui: la scheda scelta dall'host è quella che
       * si gioca, quindi vederla prima era un vantaggio per chi la guardava
       * (e in "Sfoglia le schede" si sarebbero potute leggere tutte le parole).
       * L'host può ripescare a caso, senza sbirciare.
       */}
      <div className="lobby__scheda">
        <span className="lobby__scheda-state">
          {room.pendingSchedaId ? (
            <>
              <span aria-hidden>🎲</span> Scheda pronta: si scopre quando parte il round
            </>
          ) : (
            <>
              <span aria-hidden>🎲</span> Nessuna scheda pronta per il round
            </>
          )}
        </span>
        {isHost && (
          <button className="btn btn--ghost" onClick={shuffleScheda}>
            {room.pendingSchedaId ? 'Cambia scheda' : 'Scegli la scheda'}
          </button>
        )}
      </div>

      {/*
        I pulsanti in fondo cambiano con la fase della stanza:
         - partita conclusa → si decide se rigiocare o chiudere la stanza;
         - si aspetta la prossima partita → niente da avviare, solo l'attesa;
         - altrimenti → il solito «Avvia partita».
      */}
      {isHost && matchOver ? (
        <div className="summary__actions">
          <button className="btn btn--primary btn--big" onClick={startNewMatch}>
            Gioca ancora nella stessa stanza
          </button>
          <button className="btn btn--ghost" onClick={closeRoom}>
            Chiudi la stanza
          </button>
        </div>
      ) : iAmWaiting ? (
        <p className="lobby__waiting">
          Sei in stanza: giochi non appena parte una partita nuova. Nel frattempo puoi
          parlare con gli altri col microfono.
        </p>
      ) : isHost ? (
        <button className="btn btn--primary btn--big" disabled={!canStart} onClick={startRoom}>
          Avvia partita
        </button>
      ) : (
        <p className="lobby__waiting">In attesa che l'host avvii la partita…</p>
      )}
    </div>
  );
}
