import { useEffect, useState } from 'react';
import {
  DIFFICULTIES,
  DIFFICULTY_ORDER,
  ROUND_DURATIONS_SEC,
  type Difficulty,
  type GridSize,
} from '@boggle/shared';
import { useAppStore } from '../state/store.js';
import { loadCatalog } from '../game/schedeLoader.js';
import { AudioSettings } from '../components/AudioSettings.js';
import { AvatarPicker } from '../components/AvatarPicker.js';
import { GridPreview } from '../components/GridPreview.js';

/** Schermata iniziale: avatar, nickname, modalità, impostazioni host e audio. */
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
  const [showHostOptions, setShowHostOptions] = useState(false);
  /** Numero totale di schede disponibili nel catalogo (mostrato in home). */
  const [schedeTotal, setSchedeTotal] = useState<number | null>(null);

  useEffect(() => {
    // Il conteggio arriva dal server; offline usa l'indice incluso nel bundle.
    void loadCatalog().then((data) => setSchedeTotal(data?.total ?? null));
  }, []);

  // Impostazioni usate come default quando si crea una stanza.
  const [hostGridSize, setHostGridSize] = useState<GridSize>(soloGridSize);
  const [hostDifficulty, setHostDifficulty] = useState<Difficulty>(soloDifficulty);
  const [hostDurationMs, setHostDurationMs] = useState(soloRoundDurationMs);

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
      await createRoom(hostGridSize, hostDifficulty, soloRounds, hostDurationMs);
    } catch {
      /* errore mostrato dallo store */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen home">
      <header className="home__header">
        <img className="home__logo" src="/logo.svg" alt="" aria-hidden />
        <h1 className="title">
          <span className="title__b">sbooble</span>
        </h1>
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
        <button className="btn btn--primary btn--big" disabled={busy} onClick={() => setScreen('solo-setup')}>
          Gioca da solo
        </button>

        <button
          className="btn btn--secondary btn--big"
          disabled={busy}
          onClick={() => setShowHostOptions((v) => !v)}
        >
          {showHostOptions ? 'Chiudi impostazioni' : 'Crea partita'}
        </button>

        {showHostOptions && (
          <div
            className="host-options"
            style={{ ['--level-accent' as string]: DIFFICULTIES[hostDifficulty].theme.accent }}
          >
            <span className="field__label">Griglia</span>
            <div className="rounds-options">
              {([4, 5, 6] as GridSize[]).map((s) => (
                <button
                  key={s}
                  className={`pill${hostGridSize === s ? ' pill--active' : ''}`}
                  onClick={() => setHostGridSize(s)}
                >
                  {s}×{s}
                </button>
              ))}
            </div>

            <span className="field__label">Difficoltà</span>
            <div className="difficulty-options difficulty-options--compact">
              {DIFFICULTY_ORDER.map((id) => (
                <button
                  key={id}
                  className={`difficulty-option difficulty-option--compact${
                    hostDifficulty === id ? ' difficulty-option--active' : ''
                  }`}
                  style={{ ['--level-accent' as string]: DIFFICULTIES[id].theme.accent }}
                  onClick={() => setHostDifficulty(id)}
                >
                  <span className="difficulty-option__dot" />
                  <span className="difficulty-option__label">{DIFFICULTIES[id].label}</span>
                </button>
              ))}
            </div>

            <span className="field__label">Durata round</span>
            <div className="rounds-options">
              {ROUND_DURATIONS_SEC.map((sec) => (
                <button
                  key={sec}
                  className={`pill${hostDurationMs === sec * 1000 ? ' pill--active' : ''}`}
                  onClick={() => setHostDurationMs(sec * 1000)}
                >
                  {sec} sec
                </button>
              ))}
            </div>

            <GridPreview gridSize={hostGridSize} difficulty={hostDifficulty} enabled={showHostOptions} />

            <button
              className="btn btn--primary"
              disabled={busy}
              onClick={() => {
                setSoloSetup(hostGridSize, hostDifficulty, soloRounds, hostDurationMs);
                void handleCreate();
              }}
            >
              Crea la stanza
            </button>
          </div>
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
    </div>
  );
}
