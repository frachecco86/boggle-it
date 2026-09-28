import { useEffect, useState } from 'react';
import { DIFFICULTIES, SCHEDA_VARIANT_LABELS, type Difficulty, type GridSize } from '@boggle/shared';
import { useAppStore } from '../state/store.js';
import { loadCatalog } from '../game/schedeLoader.js';
import { consumeRoomCodeFromUrl } from '../net/roomLink.js';
import { canAutoJoinFromInvite } from '../net/invite.js';import { AudioSettings } from '../components/AudioSettings.js';
import { AvatarPicker } from '../components/AvatarPicker.js';
import { MatchSettings } from '../components/MatchSettings.js';
import { User, Users } from '../components/icons.js';

/** Modalità scelta nell'interruttore in cima alla home. */
type HomeMode = 'solo' | 'multi';


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
    refreshAppConfig,
    schedaVariantFor,
    learningMode,
    setLearningMode,
  } = useAppStore();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  /**
   * Single player o multiplayer.
   *
   * Un solo interruttore con due icone al posto di due pulsanti separati: la
   * modalità decide COSA fa il tasto principale e quali comandi servono (in
   * multiplayer compaiono il codice stanza e l'invito), mentre le impostazioni
   * della partita sono le stesse per entrambe.
   */
  const [mode, setMode] = useState<HomeMode>('solo');
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
   * Configurazione globale (tipo di scheda di default): la decide l'admin e va
   * riletta all'ingresso in home. Così una modifica fatta dal pannello si vede
   * alla prima partita successiva, senza ricaricare la pagina.
   */
  useEffect(() => {
    void refreshAppConfig();
  }, [refreshAppConfig]);

  /*
   * Link di invito: chi apre `?stanza=CODICE` entra DIRETTAMENTE nella stanza.
   *
   * Prima il codice veniva solo scritto nel campo "Entra" e si aspettava un
   * tocco: chi riceveva l'invito vedeva la home e doveva capire da solo che
   * bastava premere un tasto. Ora si entra e basta — è quello che ci si aspetta
   * aprendo un invito.
   *
   * L'ingresso automatico avviene SOLO se c'è già un'identità (un profilo o un
   * nome salvato dal dispositivo, vedi `partialize` nello store): entrare come
   * "Giocatore" anonimo in una stanza dove ti aspettano con il tuo nome sarebbe
   * peggio che chiedere. Senza identità resta il comportamento di prima: codice
   * nel campo e invito scritto, così si sceglie il nome prima di entrare.
   */
  useEffect(() => {
    const fromLink = consumeRoomCodeFromUrl();
    if (!fromLink) return;
    setMode('multi');
    setCode(fromLink);
    setInviteCode(fromLink);

    const hasIdentity = canAutoJoinFromInvite(Boolean(profile), nickname);
    if (!hasIdentity) return;

    /*
     * `void` e non `await`: l'effetto non deve diventare asincrono. Un errore
     * (stanza piena, codice scaduto) viene già mostrato dallo store, quindi qui
     * non c'è nulla da gestire: si resta in home con il messaggio.
     */
    void (async () => {
      setBusy(true);
      clearError();
      try {
        await joinRoom(fromLink);
      } catch {
        /* errore mostrato dallo store */
      } finally {
        setBusy(false);
      }
    })();
    // Dipendenze volutamente vuote: l'invito si consuma UNA volta all'avvio,
    // non a ogni cambio di `nickname` o `profile` (che rimonterebbero il join).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Impostazioni della partita (single player e stanza): le stesse per entrambe.
  const [hostGridSize, setHostGridSize] = useState<GridSize>(soloGridSize);
  const [hostDifficulty, setHostDifficulty] = useState<Difficulty>(soloDifficulty);
  const [hostDurationMs, setHostDurationMs] = useState(soloRoundDurationMs);
  const [hostRounds, setHostRounds] = useState(soloRounds);

  /** Variante in vigore per la griglia scelta (decisa dall'admin). */
  const schedaVariant = schedaVariantFor(hostGridSize);

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
      /*
       * Le impostazioni scelte restano anche come preferenza del dispositivo: le
       * due modalità condividono lo stesso menù, quindi non ha senso che la
       * scelta fatta per la stanza si perda tornando in home.
       */
      setSoloSetup(hostGridSize, hostDifficulty, hostRounds, hostDurationMs);
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

      {/* Interruttore di modalità: icone e due sole voci. */}
      <div className="home__mode" role="group" aria-label="Modalità di gioco">
        <button
          type="button"
          className={`home__mode-btn${mode === 'solo' ? ' home__mode-btn--active' : ''}`}
          aria-pressed={mode === 'solo'}
          onClick={() => setMode('solo')}
        >
          <User size={17} aria-hidden />
          Da solo
        </button>
        <button
          type="button"
          className={`home__mode-btn${mode === 'multi' ? ' home__mode-btn--active' : ''}`}
          aria-pressed={mode === 'multi'}
          onClick={() => setMode('multi')}
        >
          <Users size={17} aria-hidden />
          Multiplayer
        </button>
      </div>

      <div className="home__actions">
        {/* Un solo tasto principale: cambia con la modalità scelta. */}
        {mode === 'solo' ? (
          <button className="btn btn--primary btn--big" disabled={busy} onClick={handlePlaySolo}>
            Gioca da solo
          </button>
        ) : (
          <button className="btn btn--primary btn--big" disabled={busy} onClick={handleCreate}>
            Crea la stanza
          </button>
        )}

        {/*
         * Modalità apprendimento: un tasto della home (solo single player).
         *
         * L'ETICHETTA NON CAMBIA: è sempre "Modalità apprendimento". Prima
         * diventava "Apprendimento attivo · disattiva" quando era accesa, ma così
         * il testo del tasto indicava ora COSA FA il tocco (attiva) ora CHE COSA
         * SEI (attivo): due letture diverse dello stesso tasto, e il gesto di
         * spegnimento sembrava un'altra azione invece del ritorno allo stato di
         * partenza.
         *
         * Lo stato acceso si legge dallo stile (`home__learn--active`) e da
         * `aria-pressed` (per i lettori di schermo), non dal testo: è il
         * comportamento standard di un interruttore.
         *
         * Il foglio delle impostazioni si apre SOLO attivando: serve a scegliere
         * griglia e difficoltà prima di iniziare, e non c'è nulla da scegliere per
         * tornare alla partita a tempo.
         */}
        {mode === 'solo' && (
          <button
            type="button"
            className={`btn home__learn${learningMode ? ' home__learn--active' : ''}`}
            aria-pressed={learningMode}
            disabled={busy}
            onClick={() => {
              const next = !learningMode;
              setLearningMode(next);
              if (next) setShowSettings(true);
            }}
          >
            <span aria-hidden>💡</span> Modalità apprendimento
          </button>
        )}

        <button
          className="btn btn--secondary"
          disabled={busy}
          onClick={() => setShowSettings(true)}
        >
          Impostazioni partita
        </button>

        {/* Le impostazioni in vigore, in chiaro: valgono per entrambe le modalità. */}
        <p className="home__setup">
          {hostGridSize}×{hostGridSize} · {DIFFICULTIES[hostDifficulty].label} ·{' '}
          {Math.round(hostDurationMs / 1000)}s · {hostRounds} round ·{' '}
          {SCHEDA_VARIANT_LABELS[schedaVariant]}
        </p>

        {mode === 'multi' && (
          <>
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
              <button
                className="btn btn--secondary"
                disabled={busy || code.length < 4}
                onClick={handleJoin}
              >
                Entra
              </button>
            </div>
          </>
        )}
      </div>

      {/*
       * I tre volumi stanno dietro il tasto tondo in alto a destra: sempre
       * raggiungibili, ma senza occupare una fascia della home (vedi
       * `AudioSettings`).
       */}
      <AudioSettings />

      <div className="home__links">
        <button className="btn btn--ghost" onClick={() => setScreen('admin')}>
          Admin
        </button>
        <button className="btn btn--ghost" onClick={() => setScreen('profiles')}>
          Profili
        </button>
      </div>

      {/*
       * Il footer con i crediti (dizionario, musica) è stato TOLTO dalla home:
       * erano quattro righe di testo legale in fondo alla schermata, che
       * spingevano i comandi fuori dallo schermo su telefoni bassi. I crediti
       * delle licenze CC restano nei file di licenza del repository e nel
       * README; la voce del dizionario non è un'informazione di gioco.
       */}

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
          variant={schedaVariant}
          learningMode={learningMode}
          /**
           * "Gioca subito" solo in single player: avvia la partita con le
           * impostazioni appena scelte. In multiplayer non c'è nulla da avviare:
           * si crea il codice e si aspetta chi entra.
           */
          onPlayNow={mode === 'solo' && !busy ? handlePlaySolo : undefined}
          onSize={setHostGridSize}
          onDifficulty={setHostDifficulty}
          onRounds={setHostRounds}
          onDuration={setHostDurationMs}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
