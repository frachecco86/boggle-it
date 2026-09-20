import { useEffect, useState } from 'react';
import type { Scheda } from '@boggle/shared';
import {
  DIFFICULTIES,
  DIFFICULTY_ORDER,
  ROUND_DURATIONS_SEC,
  type GridSize,
} from '@boggle/shared';
import { useAppStore } from '../state/store.js';
import { AvatarPicker } from '../components/AvatarPicker.js';
import { SchedaPreview } from '../components/SchedaPreview.js';
import { loadScheda } from '../game/schedeLoader.js';
import { GridPreview } from '../components/GridPreview.js';
import { MusicPicker } from '../components/MusicPicker.js';
import type { MusicChoice } from '@boggle/shared';

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

  const isHost = room?.hostId === playerId;

  /**
   * Carica la scheda scelta dall'host, per mostrarne griglia e statistiche a TUTTI.
   * La scheda è la stessa per tutti: si gioca quella.
   */
  const [pendingScheda, setPendingScheda] = useState<Scheda | null>(null);
  const [pendingLoading, setPendingLoading] = useState(false);
  const pendingId = room?.pendingSchedaId;
  useEffect(() => {
    if (!pendingId) {
      setPendingScheda(null);
      return;
    }
    let alive = true;
    setPendingLoading(true);
    loadScheda(pendingId)
      .then((s) => {
        if (alive) setPendingScheda(s ?? null);
      })
      .finally(() => {
        if (alive) setPendingLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [pendingId]);
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

  return (
    <div className="screen lobby">
      <button className="btn btn--ghost setup__back" onClick={leaveRoom}>
        ← Esci
      </button>
      <h2 className="screen__title">Sala d'attesa</h2>

      <button className="room-code" onClick={copyCode} title="Copia codice">
        <span className="room-code__label">Codice stanza</span>
        <span className="room-code__value">{roomCode}</span>
        <span className="room-code__hint">{copied ? 'Copiato!' : 'Tocca per copiare'}</span>
      </button>

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
              <span className="player-row__name">{p.nickname}</span>
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

            <MusicPicker
              value={(room.musicId ?? 'none') as MusicChoice}
              onChange={(choice) =>
                configureRoom(room.gridSize, room.difficulty, room.rounds, room.roundDurationMs, choice)
              }
              title="Musica della stanza"
              hint="La traccia la sentono tutti i giocatori."
            />

            <GridPreview gridSize={room.gridSize} difficulty={room.difficulty} />

            <p className="settings-host__hint">Le modifiche sono visibili a tutti in tempo reale.</p>
          </div>
        ) : (
          <div className="settings-readonly">
            <span>
              {activeDifficulty.label} · {room.gridSize}×{room.gridSize} · {room.roundDurationMs / 1000}s ·{' '}
              {room.rounds} round · max {room.maxPlayers} giocatori
            </span>
          </div>
        )}
      </section>

      {/* Anteprima della scheda: la vedono TUTTI, così nessuno è sorpreso.
          Solo l'host può pescarne un'altra. */}
      {room.pendingSchedaId ? (
        <SchedaPreview
          size={room.gridSize}
          difficulty={room.difficulty}
          scheda={pendingScheda}
          canShuffle={isHost}
          busy={pendingLoading}
          onPlay={() => startRoom()}
          playLabel="Avvia partita"
        />
      ) : (
        isHost && (
          <div className="lobby__pick">
            <p className="screen__hint">Pesca una scheda per vedere cosa aspettarti.</p>
            <button className="btn btn--secondary" onClick={shuffleScheda}>
              🎲 Scegli la scheda
            </button>
          </div>
        )
      )}

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
