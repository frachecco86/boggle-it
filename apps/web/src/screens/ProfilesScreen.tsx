import { useEffect, useState } from 'react';
import { useAppStore } from '../state/store.js';
import { BackHome } from '../components/BackHome.js';

/**
 * Gestione profili sul dispositivo: elenco, switch rapido, aggiunta (login o
 * registrazione) e uscita. Ogni profilo conserva il proprio token, quindi lo
 * switch non richiede la password.
 */
export function ProfilesScreen() {
  const {
    profiles,
    activeProfileId,
    profileBusy,
    profileError,
    setScreen,
    refreshProfiles,
    switchProfile,
    registerProfile,
    loginProfile,
    deleteProfile,
  } = useAppStore();

  const [mode, setMode] = useState<'list' | 'add' | 'register'>('list');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    refreshProfiles();
  }, [refreshProfiles]);

  const submit = async () => {
    setLocalError(null);
    try {
      if (mode === 'register') await registerProfile(nickname.trim(), password);
      else await loginProfile(nickname.trim(), password);
      setNickname('');
      setPassword('');
      setMode('list');
      setScreen('home');
    } catch {
      /* errore mostrato dallo store */
    }
  };

  if (mode !== 'list') {
    return (
      <div className="screen profiles">
        <button className="btn btn--ghost" onClick={() => setMode('list')}>
          ← Profili
        </button>
        <h2 className="screen__title">
          {mode === 'register' ? 'Crea un profilo' : 'Accedi al tuo profilo'}
        </h2>
        <p className="screen__hint">
          Con un profilo, foto e suoni delle parole ti seguono su ogni dispositivo.
        </p>

        {(profileError || localError) && (
          <div className="banner banner--error">{localError ?? profileError}</div>
        )}

        <label className="field">
          <span className="field__label">Nickname</span>
          <input
            className="field__input"
            value={nickname}
            maxLength={20}
            onChange={(e) => setNickname(e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field__label">Password</span>
          <input
            className="field__input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void submit()}
          />
        </label>

        <div className="summary__actions">
          <button
            className="btn btn--primary"
            disabled={profileBusy || nickname.trim().length < 3 || password.length < 6}
            onClick={() => void submit()}
          >
            {profileBusy ? 'Attendo…' : mode === 'register' ? 'Crea profilo' : 'Accedi'}
          </button>
          <button
            className="btn btn--ghost"
            onClick={() => setMode(mode === 'register' ? 'add' : 'register')}
          >
            {mode === 'register' ? 'Ho già un profilo' : 'Non ho un profilo'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen profiles">
      <BackHome />
      <h2 className="screen__title">Chi gioca?</h2>
      <p className="screen__hint">
        Più profili sullo stesso dispositivo: passa da uno all'altro senza reinserire la password.
      </p>

      {profileError && <div className="banner banner--error">{profileError}</div>}

      <ul className="profile-list">
        {profiles.map((p) => (
          <li
            key={p.id}
            className={`profile-row${p.id === activeProfileId ? ' profile-row--active' : ''}`}
          >
            <span className="profile-row__avatar">
              {p.photoUrl ? <img src={p.photoUrl} alt="" /> : p.avatar}
            </span>
            <span className="profile-row__name">{p.nickname}</span>
            {p.id === activeProfileId ? (
              <span className="profile-row__badge">attivo</span>
            ) : (
              <button
                className="btn btn--tiny"
                disabled={profileBusy}
                onClick={() => void switchProfile(p.id)}
              >
                entra
              </button>
            )}
            <button
              className="btn btn--tiny btn--ghost"
              title="Rimuovi da questo dispositivo"
              onClick={() => deleteProfile(p.id)}
            >
              ✕
            </button>
          </li>
        ))}
        {profiles.length === 0 && (
          <li className="profile-row profile-row--empty">Nessun profilo su questo dispositivo</li>
        )}
      </ul>

      <div className="summary__actions">
        <button className="btn btn--primary" onClick={() => setMode('register')}>
          Crea profilo
        </button>
        <button className="btn btn--secondary" onClick={() => setMode('add')}>
          Accedi
        </button>
      </div>
      <p className="profile-section__hint">
        Il profilo è opzionale: si può giocare anche senza. Serve per foto, suoni personali e
        preferenze musicali.
      </p>
    </div>
  );
}
