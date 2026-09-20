import { useState } from 'react';
import type { GridSize } from '@boggle/shared';
import { useAppStore } from '../state/store.js';

/** Lobby multiplayer: codice stanza, giocatori, impostazioni host. */
export function LobbyScreen() {
  const {
    room,
    roomCode,
    nickname,
    setNickname,
    startRoom,
    configureRoom,
    leaveRoom,
    playerId,
  } = useAppStore();
  const [copied, setCopied] = useState(false);

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
        <h3 className="summary__label">Giocatori ({room.players.length})</h3>
        <ul className="player-list">
          {room.players.map((p) => (
            <li key={p.id} className={`player-row${p.connected ? '' : ' player-row--off'}`}>
              <span className="player-row__avatar">{p.nickname.slice(0, 1).toUpperCase()}</span>
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
        <div className="settings-grid">
          <label className="field">
            <span className="field__label">Il tuo nome</span>
            <input
              className="field__input"
              value={nickname}
              maxLength={20}
              onChange={(e) => setNickname(e.target.value)}
            />
          </label>
          {isHost ? (
            <div className="settings-host">
              <GridSizePicker value={room.gridSize} onChange={(size) => configureRoom(size, room.rounds)} />
              <RoundsPicker value={room.rounds} onChange={(rounds) => configureRoom(room.gridSize, rounds)} />
              <p className="settings-host__hint">Le modifiche sono visibili a tutti in tempo reale.</p>
            </div>
          ) : (
            <div className="settings-readonly">
              <span>Griglia {room.gridSize}×{room.gridSize}</span>
              <span>{room.rounds} round</span>
            </div>
          )}
        </div>
      </section>

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

function GridSizePicker({ value, onChange }: { value: GridSize; onChange: (s: GridSize) => void }) {
  return (
    <div className="rounds-options">
      {([4, 5, 6] as GridSize[]).map((s) => (
        <button key={s} className={`pill${value === s ? ' pill--active' : ''}`} onClick={() => onChange(s)}>
          {s}×{s}
        </button>
      ))}
    </div>
  );
}

function RoundsPicker({ value, onChange }: { value: number; onChange: (r: number) => void }) {
  return (
    <div className="rounds-options">
      {[1, 3, 5].map((r) => (
        <button key={r} className={`pill${value === r ? ' pill--active' : ''}`} onClick={() => onChange(r)}>
          {r} round
        </button>
      ))}
    </div>
  );
}
