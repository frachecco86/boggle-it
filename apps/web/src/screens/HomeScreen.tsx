import { useEffect, useState } from 'react';
import { type Difficulty, type GridSize } from '@boggle/shared';
import { useAppStore } from '../state/store.js';
import { loadCatalog } from '../game/schedeLoader.js';
import { consumeRoomCodeFromUrl } from '../net/roomLink.js';
import { AudioSettings } from '../components/AudioSettings.js';
import { AvatarPicker } from '../components/AvatarPicker.js';
import { MatchSettings } from '../components/MatchSettings.js';

/** Schermata iniziale: profilo, modalità di gioco, impostazioni partita e audio. */
export function HomeScreen() {
  const {
    nickname,
    setNickname,
    avatar,
    setAvatar,
    setScreen,
    joinRoom,
    createRoom,
    errorMessage,
    clearError,
    profile,
    soloGridSize,
    soloDifficulty,
    soloRoundDurationMs,
    setSoloSetup,
    soloRounds,
  } = useAppStore();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  /** Foglio delle impostazioni partita (griglia, difficoltà, durata, round). */
  const [showSettings, setShowSettings] = useState(false);
  /** Codice arrivato da un link di invito (`?stanza=CODICE`). */
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  /** Numero totale di schede disponibili nel catalogo (mostrato in home). */
  const [schedeTotal, setSchedeTotal] = useState<number | null>(null);

  useEffect(() => {
    // Il conteggio arriva dal server; offline usa l'indice incluso nel bundle.
    void loadCatalog().then((data) => setSchedeTotal(data?.total ?? null));
  }, []);

  /*
   * Link di invito: se l'indirizzo contiene `?stanza=CODICE` il codice viene
   * scritto nel campo "Entra" e si spiega cosa fare. Non si entra da soli:
   * l'invitato può scegliere prima il proprio nome o il profilo, e un ingresso
   * automatico con un nome sbagliato lo costringerebbe a uscire e rifare tutto.
   */
  useEffect(() => {
    const fromLink = consumeRoomCodeFromUrl();
    if (!fromLink) return;
    setCode(fromLink);
    setInviteCode(fromLink);
  }, []);

  // Impostazioni della partita (single player e stanza): le stesse per entrambe.
  const [hostGridSize, setHostGridSize] = useState<GridSize>(soloGridSize);
  const [hostDifficulty, setHostDifficulty] = useState<Difficulty>(soloDifficulty);
  const [hostDurationMs, setHostDurationMs] = useState(soloRoundDurationMs);
  const [hostRounds, setHostRounds] = useState(soloRounds);

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
      await createRoom(hostGridSize, hostDifficulty, hostRounds, hostDurationMs);
    } catch {
      /* errore mostrato dallo store */
    } finally {
      setBusy(false);
    }
  };

  /**
   * Gioca da solo: si parte **subito**, con le impostazioni scelte.
   *
   * Prima si passava da una seconda schermata (`SoloSetupScreen`) che richiedeva
   * le stesse scelte già fatte qui, e mostrava la griglia della scheda prima di
   * giocare. Ora le impostazioni stanno in un solo posto (il foglio) e il single
   * player è a un tocco.
   */
  const handlePlaySolo = () => {
    setSoloSetup(hostGridSize, hostDifficulty, hostRounds, hostDurationMs);
    setShowSettings(false);
    setScreen('solo-game');
  };

  return (
    <div className="screen home">
      <header className="home__header">
        {/*
         * Icona e nome su una riga: la margherita resta il segno della home ma
         * in formato "marchio", accanto al nome invece che sopra. Due vantaggi:
         * è **più piccola** come richiesto e libera ~30px di altezza, che servono
         * a far respirare il resto della schermata.
         */}
        <div className="home__lockup">
          <img className="home__logo" src="/logo.svg" alt="" aria-hidden />
          <h1 className="title">
            <span className="title__b">sbooble</span>
          </h1>
        </div>
        <p className="home__author">un gioco di Margherita Checco</p>
        <p className="home__tagline">Trova più parole degli altri. Scorri il dito sulle lettere.</p>
        {schedeTotal !== null && (
          <p className="home__schede">
            <strong>{schedeTotal}</strong> schede disponibili nel catalogo
          </p>
        )}
      </header>

      {profile ? (
        <section className="profile-card profile-card--active">
          <button className="profile-card__avatar" onClick={() => setScreen('profile')} title="Il mio profilo">
            {profile.photoUrl ? (
              <img src={profile.photoUrl} alt="" />
            ) : (
              <span aria-hidden>{profile.avatar}</span>
            )}
          </button>
          <div className="profile-card__body">
            <span className="field__label">Stai giocando come</span>
            <strong className="profile-card__name">{profile.nickname}</strong>
            <div className="profile-card__links">
              <button className="btn btn--tiny" onClick={() => setScreen('profile')}>
                Il mio profilo
              </button>
              <button className="btn btn--tiny btn--ghost" onClick={() => setScreen('profiles')}>
                Cambia profilo
              </button>
            </div>
          </div>
        </section>
      ) : (
        <section className="profile-card">
          <AvatarPicker value={avatar} onChange={setAvatar} />
          <label className="field profile-card__field">
            <span className="field__label">Il tuo nome</span>
            <input
              className="field__input"
              value={nickname}
              maxLength={20}
              placeholder="Giocatore"
              onChange={(e) => setNickname(e.target.value)}
            />
          </label>
          <button className="btn btn--tiny btn--ghost" onClick={() => setScreen('profiles')}>
            Accedi o crea un profilo
          </button>
        </section>
      )}

      {errorMessage && <div className="banner banner--error">{errorMessage}</div>}

      <div className="home__actions">
        <button className="btn btn--primary btn--big" disabled={busy} onClick={handlePlaySolo}>
          Gioca da solo
        </button>

        <button
          className="btn btn--secondary btn--big"
          disabled={busy}
          onClick={() => setShowSettings(true)}
        >
          Impostazioni partita
        </button>

        {inviteCode && (
          <p className="join__invite" role="status">
            <span aria-hidden>🔗</span>
            <span>
              Invito per la stanza <strong>{inviteCode}</strong>: premi Entra per giocare.
            </span>
          </p>
        )}

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

      <AudioSettings />

      <div className="home__links">
        <button
          className="btn btn--ghost"
          onClick={() => setScreen('scheda')}
        >
          Sfoglia le schede
        </button>
        <button className="btn btn--ghost" onClick={() => setScreen('admin')}>
          Admin
        </button>
        <button className="btn btn--ghost" onClick={() => setScreen('profiles')}>
          Profili
        </button>
      </div>

      <footer className="home__footer">
        Dizionario: Morph-it! (UniBO, CC BY-SA 2.0) + lessico comune + abbreviazioni Wikizionario.
        <br />
        Musica: “Happy Adventure” di TinyWorlds (CC0). Suoni generati nel browser.
      </footer>

      {/*
       * Menù delle impostazioni: si apre sopra la home (foglio sovrapposto), così
       * la schermata resta della stessa altezza e le quattro scelte stanno in una
       * schermata sola. Da qui partono ENTRAMBE le modalità, con le stesse
       * impostazioni: single player e stanza non chiedono più le stesse cose in
       * due posti diversi.
       */}
      {showSettings && (
        <MatchSettings
          size={hostGridSize}
          difficulty={hostDifficulty}
          rounds={hostRounds}
          durationMs={hostDurationMs}
          onSize={setHostGridSize}
          onDifficulty={setHostDifficulty}
          onRounds={setHostRounds}
          onDuration={setHostDurationMs}
          onSolo={handlePlaySolo}
          onCreate={() => {
            setSoloSetup(hostGridSize, hostDifficulty, hostRounds, hostDurationMs);
            void handleCreate();
          }}
          busy={busy}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
