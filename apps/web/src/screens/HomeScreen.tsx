import { useState } from 'react';
import { useAppStore } from '../state/store.js';

/** Schermata iniziale: nickname, scelta modalita'. */
export function HomeScreen() {
  const { nickname, setNickname, setScreen, joinRoom, createRoom, errorMessage, clearError } = useAppStore();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const handleJoin = async () => {
    if (code.trim().length < 4) return;
    setBusy(true);
    clearError();
    try {
      await joinRoom(code.trim());
    } catch {
      /* errore mostrato dallo store */
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = async () => {
    setBusy(true);
    clearError();
    try {
      await createRoom(4, 3);
    } catch {
      /* errore mostrato dallo store */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen home">
      <header className="home__header">
        <h1 className="title">
          <span className="title__b">BOGGLE</span>
          <span className="title__it">IT</span>
        </h1>
        <p className="home__tagline">Trova più parole degli altri. Scorri il dito sulle lettere.</p>
      </header>

      <label className="field">
        <span className="field__label">Il tuo nome</span>
        <input
          className="field__input"
          value={nickname}
          maxLength={20}
          placeholder="Giocatore"
          onChange={(e) => setNickname(e.target.value)}
        />
      </label>

      {errorMessage && <div className="banner banner--error">{errorMessage}</div>}

      <div className="home__actions">
        <button className="btn btn--primary btn--big" disabled={busy} onClick={() => setScreen('solo-setup')}>
          Gioca da solo
        </button>
        <button className="btn btn--secondary btn--big" disabled={busy} onClick={handleCreate}>
          Crea partita
        </button>
        <div className="join">
          <input
            className="field__input join__input"
            value={code}
            placeholder="CODICE"
            maxLength={6}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
          />
          <button className="btn btn--secondary" disabled={busy || code.length < 4} onClick={handleJoin}>
            Entra
          </button>
        </div>
      </div>

      <footer className="home__footer">
        Dizionario: Morph-it! (UniBO, CC BY-SA 2.0) + lessico comune + abbreviazioni Wikizionario.
      </footer>
    </div>
  );
}
