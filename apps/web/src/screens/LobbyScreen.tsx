import { useState } from 'react';
import {
  DIFFICULTIES,
  DIFFICULTY_ORDER,
  resolveSchedaVariant,
  ROUND_DURATIONS_SEC,
  SCHEDA_VARIANT_HINTS,
  SCHEDA_VARIANT_LABELS,
  SCHEDA_VARIANTS,
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
    shuffleScheda,
    configureRoom,
    leaveRoom,
    playerId,
  } = useAppStore();
  const [copied, setCopied] = useState(false);
  /** Messaggio momentaneo sotto il codice stanza ("Link copiato!"). */
  const [inviteFeedback, setInviteFeedback] = useState<string | null>(null);
  // Chi sta parlando adesso: l'indicatore compare accanto al nome.
  const speakers = useVoiceSpeakers();

  const isHost = room?.hostId === playerId;

  const canStart = (room?.players.filter((p) => p.connected).length ?? 0) >= 1;

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
      <h2 className="screen__title">Sala d'attesa</h2>

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
              {!p.connected && <span className="badge badge--off">offline</span>}
            </li>
          ))}
        </ul>
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

            {/* Criteri delle schede: cambia l'insieme da cui si pesca la scheda. */}
            <span className="field__label">Schede</span>
            <div className="rounds-options">
              {SCHEDA_VARIANTS.map((v) => (
                <button
                  key={v}
                  className={`pill${variant === v ? ' pill--active' : ''}`}
                  title={SCHEDA_VARIANT_HINTS[v]}
                  onClick={() =>
                    configureRoom(
                      room.gridSize,
                      room.difficulty,
                      room.rounds,
                      room.roundDurationMs,
                      room.musicId,
                      room.maxPlayers,
                      v,
                    )
                  }
                >
                  {SCHEDA_VARIANT_LABELS[v]}
                </button>
              ))}
            </div>
            <p className="settings-host__hint">{SCHEDA_VARIANT_HINTS[variant]}</p>

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

      {isHost ? (
        <button className="btn btn--primary btn--big" disabled={!canStart} onClick={startRoom}>
          Avvia partita
        </button>
      ) : (
        <p className="lobby__waiting">In attesa che l'host avvii la partita…</p>
      )}
    </div>
  );
}
