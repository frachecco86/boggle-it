import { useCallback, useEffect, useState } from 'react';
import { DIFFICULTIES, DIFFICULTY_ORDER, type Difficulty, type GridSize } from '@boggle/shared';
import { SERVER_BASE } from '../net/socket.js';
import { useAppStore } from '../state/store.js';
import { MusicAdmin } from '../components/MusicAdmin.js';
import { BackHome } from '../components/BackHome.js';

interface SchedaMetaDTO {
  id: string;
  size: GridSize;
  difficulty: Difficulty;
  grid: string;
  longest: number;
  wordCount: number;
}

interface AdminListResponse {
  total: number;
  count: number;
  byKey: Record<string, number>;
  schede: SchedaMetaDTO[];
}

/**
 * Pannello admin: elenco schede (con anteprima visiva) e generazione di nuove.
 *
 * Accesso con UTENTE e PASSWORD, configurati come variabili d'ambiente sul server
 * (`ADMIN_USER`, `ADMIN_PASSWORD`): nulla di segreto sta nel codice o su GitHub.
 * Il login restituisce un token di sessione, salvato in localStorage e inviato
 * come Bearer nelle richieste successive. La password viaggia una volta sola.
 */
export function AdminScreen() {
  const { adminToken, setAdminToken, setScreen, setSchedaId } = useAppStore();
  const [userInput, setUserInput] = useState('admin');
  const [passwordInput, setPasswordInput] = useState('');
  const [authed, setAuthed] = useState(false);
  const [list, setList] = useState<AdminListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Filtri + form di generazione
  const [filterSize, setFilterSize] = useState<GridSize | 0>(0);
  const [filterDifficulty, setFilterDifficulty] = useState<Difficulty | ''>('');
  const [genSize, setGenSize] = useState<GridSize>(4);
  const [genDifficulty, setGenDifficulty] = useState<Difficulty>('normale');
  const [genCount, setGenCount] = useState(10);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(
    async (token: string, size: GridSize | 0, difficulty: Difficulty | '') => {
      const params = new URLSearchParams();
      if (size) params.set('size', String(size));
      if (difficulty) params.set('difficulty', difficulty);
      const res = await fetch(`${SERVER_BASE}/admin/schede?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) throw new Error('Sessione scaduta');
      if (res.status === 503) throw new Error('Admin non configurato sul server');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as AdminListResponse;
    },
    [],
  );

  /** Login: scambia utente e password con un token di sessione. */
  const connect = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${SERVER_BASE}/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: userInput, password: passwordInput }),
      });
      if (res.status === 503) {
        throw new Error('Admin non configurato sul server (ADMIN_USER / ADMIN_PASSWORD)');
      }
      if (res.status === 401) throw new Error('Utente o password non validi');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { token } = (await res.json()) as { token: string };

      // Il token sostituisce la password: da qui in poi viaggia solo quello.
      const data = await load(token, filterSize, filterDifficulty);
      setAdminToken(token);
      setPasswordInput('');
      setList(data);
      setAuthed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setAuthed(false);
    } finally {
      setBusy(false);
    }
  }, [userInput, passwordInput, filterSize, filterDifficulty, load, setAdminToken]);

  /** Logout: invalida la sessione sul server e dimentica il token. */
  const logout = useCallback(async () => {
    if (adminToken) {
      void fetch(`${SERVER_BASE}/admin/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
    }
    setAdminToken('');
    setAuthed(false);
    setList(null);
  }, [adminToken, setAdminToken]);

  // Se il token è già salvato, prova a entrare automaticamente.
  useEffect(() => {
    // Il token di sessione è ancora valido? Proviamo a usarlo.
    if (adminToken && !authed) {
      load(adminToken, filterSize, filterDifficulty)
        .then((data) => {
          setList(data);
          setAuthed(true);
        })
        .catch(() => {
          // Sessione scaduta: si torna al login.
          setAdminToken('');
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ricarica quando cambiano i filtri (solo da autenticati).
  useEffect(() => {
    if (!authed) return;
    load(adminToken, filterSize, filterDifficulty)
      .then(setList)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, [authed, adminToken, filterSize, filterDifficulty, load]);

  const generate = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`${SERVER_BASE}/admin/schede/genera`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ size: genSize, difficulty: genDifficulty, count: genCount }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { created: SchedaMetaDTO[]; total: number };
      setNotice(`Generate ${data.created.length} schede. Totale catalogo: ${data.total}.`);
      setList(await load(adminToken, filterSize, filterDifficulty));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (!authed) {
    return (
      <div className="screen admin">
        {/* Tasto Home nella barra in alto, come in tutte le altre schermate. */}
        <BackHome />
        <h2 className="screen__title">Amministrazione schede</h2>
        <p className="screen__hint">
          Accedi con l'utente e la password admin (variabili d'ambiente{' '}
          <code>ADMIN_USER</code> e <code>ADMIN_PASSWORD</code> sul server).
        </p>
        <label className="field">
          <span className="field__label">Utente</span>
          <input
            className="field__input"
            type="text"
            autoComplete="username"
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field__label">Password</span>
          <input
            className="field__input"
            type="password"
            autoComplete="current-password"
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void connect()}
          />
        </label>
        {error && <div className="banner banner--error">{error}</div>}
        <div className="summary__actions">
          <button
            className="btn btn--primary"
            disabled={busy || !userInput || !passwordInput}
            onClick={() => void connect()}
          >
            {busy ? 'Verifico…' : 'Entra'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen admin">
      {/* Il tasto Home è quello della barra in alto: qui non ne serve un secondo. */}
      <BackHome />
      <div className="admin__topbar">
        <h2 className="screen__title">Schede ({list?.total ?? '…'})</h2>
        <button className="btn btn--ghost" onClick={() => void logout()}>
          Esci
        </button>
      </div>

      {error && <div className="banner banner--error">{error}</div>}
      {notice && <div className="banner banner--ok">{notice}</div>}

      <section className="admin__section">
        <h3 className="summary__label">Genera nuove schede</h3>
        <div className="admin__form">
          <label className="field field--inline">
            <span className="field__label">Griglia</span>
            <select
              className="field__input"
              value={genSize}
              onChange={(e) => setGenSize(Number(e.target.value) as GridSize)}
            >
              {[4, 5, 6].map((s) => (
                <option key={s} value={s}>
                  {s}×{s}
                </option>
              ))}
            </select>
          </label>
          <label className="field field--inline">
            <span className="field__label">Difficoltà</span>
            <select
              className="field__input"
              value={genDifficulty}
              onChange={(e) => setGenDifficulty(e.target.value as Difficulty)}
            >
              {DIFFICULTY_ORDER.map((d) => (
                <option key={d} value={d}>
                  {DIFFICULTIES[d].label}
                </option>
              ))}
            </select>
          </label>
          <label className="field field--inline">
            <span className="field__label">Quante</span>
            <input
              className="field__input"
              type="number"
              min={1}
              max={100}
              value={genCount}
              onChange={(e) => setGenCount(Number(e.target.value))}
            />
          </label>
          <button className="btn btn--primary" disabled={busy} onClick={() => void generate()}>
            {busy ? 'Genero…' : 'Genera e salva'}
          </button>
        </div>
      </section>

      <MusicAdmin token={adminToken} />

      <section className="admin__section">
        <h3 className="summary__label">Filtra</h3>
        <div className="admin__form">
          <label className="field field--inline">
            <span className="field__label">Griglia</span>
            <select
              className="field__input"
              value={filterSize}
              onChange={(e) => setFilterSize(Number(e.target.value) as GridSize | 0)}
            >
              <option value={0}>Tutte</option>
              {[4, 5, 6].map((s) => (
                <option key={s} value={s}>
                  {s}×{s}
                </option>
              ))}
            </select>
          </label>
          <label className="field field--inline">
            <span className="field__label">Difficoltà</span>
            <select
              className="field__input"
              value={filterDifficulty}
              onChange={(e) => setFilterDifficulty(e.target.value as Difficulty | '')}
            >
              <option value="">Tutte</option>
              {DIFFICULTY_ORDER.map((d) => (
                <option key={d} value={d}>
                  {DIFFICULTIES[d].label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {list && (
          <p className="admin__counts">
            {Object.entries(list.byKey)
              .sort()
              .map(([key, n]) => `${key}: ${n}`)
              .join(' · ')}
          </p>
        )}
      </section>

      <section className="admin__section">
        <h3 className="summary__label">Elenco ({list?.count ?? 0})</h3>
        <div className="admin__grid">
          {list?.schede.map((s) => (
            <button
              key={s.id}
              className="admin__card"
              onClick={() => {
                setSchedaId(s.id);
                setScreen('scheda');
              }}
              title="Apri la pagina della scheda"
            >
              <div className="admin__card-grid" style={{ ['--grid-size' as string]: s.size }}>
                {s.grid.split('\n').flatMap((row, ri) =>
                  [...row].map((ch, ci) => (
                    <span key={`${ri}-${ci}`} className="admin__card-cell">
                      {ch === 'q' ? 'Q' : ch.toUpperCase()}
                    </span>
                  )),
                )}
              </div>
              <div className="admin__card-meta">
                <strong>{s.id}</strong>
                <span>
                  {s.wordCount} parole · max {s.longest}
                </span>
              </div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
