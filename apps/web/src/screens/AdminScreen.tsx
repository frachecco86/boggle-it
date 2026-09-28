import { useCallback, useEffect, useState } from 'react';
import {
  DIFFICULTIES,
  DIFFICULTY_ORDER,
  SCHEDA_VARIANT_HINTS,
  SCHEDA_VARIANT_LABELS,
  SCHEDA_VARIANTS,
  type AppConfig,
  type Difficulty,
  type GridSize,
  type SchedaVariant,
} from '@boggle/shared';
import { SERVER_BASE } from '../net/socket.js';
import { useAppStore } from '../state/store.js';
import { MusicAdmin } from '../components/MusicAdmin.js';
import { ProfilesAdmin } from '../components/ProfilesAdmin.js';
import { BackHome } from '../components/BackHome.js';

interface SchedaMetaDTO {
  id: string;
  size: GridSize;
  difficulty: Difficulty;
  variant: SchedaVariant;
  grid: string;
  longest: number;
  wordCount: number;
}

interface AdminListResponse {
  total: number;
  count: number;
  byKey: Record<string, number>;
  byVariant: Record<string, Record<SchedaVariant, number>>;
  config: AppConfig;
  schede: SchedaMetaDTO[];
}

/** Ambiti di cancellazione offerti dal pannello. */
type DeleteScope = 'extra' | 'ale' | 'variant' | 'all';

const DELETE_SCOPES: { id: DeleteScope; label: string; hint: string }[] = [
  { id: 'extra', label: 'Aggiunte dall’admin', hint: 'Svuota schede-extra (standard e full generate dal pannello).' },
  { id: 'ale', label: 'Solo Ale', hint: 'Svuota schede-ale: le “ale” generate a runtime.' },
  { id: 'variant', label: 'Per variante', hint: 'Cancella tutte le schede di una sola variante, base inclusa.' },
  { id: 'all', label: 'TUTTE le schede', hint: 'Azzera l’intero catalogo, base versionata compresa. Irreversibile.' },
];

/** Le sezioni del pannello, mostrate come tab. */
type AdminTab = 'schede' | 'musica' | 'profili';

const TABS: { id: AdminTab; label: string }[] = [
  { id: 'schede', label: 'Schede' },
  { id: 'musica', label: 'Musica' },
  { id: 'profili', label: 'Profili' },
];

/**
 * Pannello admin: schede, musica e profili, in TRE tab separate.
 *
 * Accesso con UTENTE e PASSWORD, configurati come variabili d'ambiente sul server
 * (`ADMIN_USER`, `ADMIN_PASSWORD`): nulla di segreto sta nel codice o su GitHub.
 * Il login restituisce un token di sessione, salvato in localStorage e inviato
 * come Bearer nelle richieste successive. La password viaggia una volta sola.
 *
 * Perché le tab: prima le tre aree erano una sotto l'altra in un'unica pagina
 * lunga, e per arrivare ai profili si scorreva oltre tutte le schede. Le tab
 * tengono ogni area a portata di un click, e ogni sezione carica i suoi dati solo
 * quando serve (le schede non vengono richieste se si apre la tab Musica).
 *
 * Nella tab Schede stanno TUTTE le operazioni sul catalogo: il tipo di scheda di
 * default (scelta di prodotto, non del giocatore), la generazione — comprese le
 * “ale” — il filtro, la sfoglia-schede e la cancellazione. Prima la sfoglia era
 * un tasto della home: l'admin è l'unico che deve poter vedere le soluzioni.
 */
export function AdminScreen() {
  const { adminToken, setAdminToken, setScreen, setSchedaId } = useAppStore();
  const [tab, setTab] = useState<AdminTab>('schede');
  const [userInput, setUserInput] = useState('admin');
  const [passwordInput, setPasswordInput] = useState('');
  const [authed, setAuthed] = useState(false);
  const [list, setList] = useState<AdminListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Tipo di scheda di default (configurazione globale)
  const [defaultVariant, setDefaultVariant] = useState<SchedaVariant>('standard');
  const [configSaved, setConfigSaved] = useState(false);

  // Filtri + form di generazione
  const [filterSize, setFilterSize] = useState<GridSize | 0>(0);
  const [filterDifficulty, setFilterDifficulty] = useState<Difficulty | ''>('');
  const [filterVariant, setFilterVariant] = useState<SchedaVariant | ''>('');
  const [genVariant, setGenVariant] = useState<SchedaVariant>('standard');
  const [genSize, setGenSize] = useState<GridSize>(4);
  const [genDifficulty, setGenDifficulty] = useState<Difficulty>('normale');
  const [genCount, setGenCount] = useState(10);
  const [notice, setNotice] = useState<string | null>(null);

  // Cancellazione
  const [deleteScope, setDeleteScope] = useState<DeleteScope>('extra');
  const [deleteVariant, setDeleteVariant] = useState<SchedaVariant>('ale');
  const [deleteConfirm, setDeleteConfirm] = useState('');

  const load = useCallback(
    async (token: string, size: GridSize | 0, difficulty: Difficulty | '', variant: SchedaVariant | '') => {
      const params = new URLSearchParams();
      if (size) params.set('size', String(size));
      if (difficulty) params.set('difficulty', difficulty);
      if (variant) params.set('variant', variant);
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
      const data = await load(token, filterSize, filterDifficulty, filterVariant);
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
  }, [userInput, passwordInput, filterSize, filterDifficulty, filterVariant, load, setAdminToken]);

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
    if (adminToken && !authed) {
      load(adminToken, filterSize, filterDifficulty, filterVariant)
        .then((data) => {
          setList(data);
          setAuthed(true);
        })
        .catch(() => {
          setAdminToken('');
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ricarica quando cambiano i filtri (solo da autenticati e solo nella tab Schede).
  useEffect(() => {
    if (!authed || tab !== 'schede') return;
    load(adminToken, filterSize, filterDifficulty, filterVariant)
      .then(setList)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, [authed, adminToken, filterSize, filterDifficulty, filterVariant, load, tab]);

  // Allinea il selettore del default (e il filtro) alla configurazione del server.
  useEffect(() => {
    if (list?.config) setDefaultVariant(list.config.defaultSchedaVariant);
  }, [list?.config]);

  /** Salva il tipo di scheda di default (configurazione globale). */
  const saveDefaultVariant = async () => {
    setBusy(true);
    setError(null);
    setConfigSaved(false);
    try {
      const res = await fetch(`${SERVER_BASE}/admin/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ defaultSchedaVariant: defaultVariant }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const config = (await res.json()) as AppConfig;
      setDefaultVariant(config.defaultSchedaVariant);
      setConfigSaved(true);
      setNotice(`Tipo di scheda di default: ${SCHEDA_VARIANT_LABELS[config.defaultSchedaVariant]}.`);
      setList(await load(adminToken, filterSize, filterDifficulty, filterVariant));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const generate = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`${SERVER_BASE}/admin/schede/genera`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          size: genSize,
          difficulty: genDifficulty,
          count: genCount,
          variant: genVariant,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { created: SchedaMetaDTO[]; total: number };
      setNotice(`Generate ${data.created.length} schede. Totale catalogo: ${data.total}.`);
      setList(await load(adminToken, filterSize, filterDifficulty, filterVariant));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const cancelAll = async () => {
    if (deleteConfirm !== 'DELETE') return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const params = new URLSearchParams({ scope: deleteScope, confirm: 'DELETE' });
      if (deleteScope === 'variant') params.set('variant', deleteVariant);
      const res = await fetch(`${SERVER_BASE}/admin/schede?${params}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { removed: number; remaining: number };
      setNotice(`Cancellate ${data.removed} schede. Restano ${data.remaining}.`);
      setDeleteConfirm('');
      setList(await load(adminToken, filterSize, filterDifficulty, filterVariant));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (!authed) {
    return (
      <div className="screen admin">
        <BackHome />
        <h2 className="screen__title">Amministrazione</h2>
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

  const byVariantTotals = list
    ? SCHEDA_VARIANTS.map((v) =>
        Object.values(list.byVariant).reduce((n, counts) => n + (counts?.[v] ?? 0), 0),
      )
    : [];

  return (
    <div className="screen admin">
      <BackHome />
      <div className="admin__topbar">
        <h2 className="screen__title">Amministrazione</h2>
        <button className="btn btn--ghost" onClick={() => void logout()}>
          Esci
        </button>
      </div>

      {/* Le tre sezioni come tab: ognuna carica i suoi dati solo quando è aperta. */}
      <div className="admin__tabs" role="tablist" aria-label="Sezioni amministrazione">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`admin__tab${tab === t.id ? ' admin__tab--active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <div className="banner banner--error">{error}</div>}
      {notice && tab === 'schede' && <div className="banner banner--ok">{notice}</div>}

      {tab === 'schede' && (
        <>
          {/* Tipo di scheda di default: scelta di prodotto, non del giocatore. */}
          <section className="admin__section">
            <h3 className="summary__label">Tipo di scheda di default</h3>
            <p className="admin__hint">
              Vale per <strong>tutte</strong> le partite — single player e stanze — e i
              giocatori non possono cambiarlo. Nelle impostazioni partita lo vedono solo come
              etichetta.
            </p>
            <div className="admin__form">
              <div className="rounds-options">
                {SCHEDA_VARIANTS.map((v) => (
                  <button
                    key={v}
                    type="button"
                    className={`pill${defaultVariant === v ? ' pill--active' : ''}`}
                    title={SCHEDA_VARIANT_HINTS[v]}
                    onClick={() => {
                      setDefaultVariant(v);
                      setConfigSaved(false);
                    }}
                  >
                    {SCHEDA_VARIANT_LABELS[v]}
                  </button>
                ))}
              </div>
              <button
                className="btn btn--primary"
                disabled={busy || configSaved || list?.config?.defaultSchedaVariant === defaultVariant}
                onClick={() => void saveDefaultVariant()}
              >
                {configSaved ? 'Salvato' : 'Salva'}
              </button>
            </div>
          </section>

          <section className="admin__section">
            <h3 className="summary__label">Genera nuove schede</h3>
            <div className="admin__form">
              <label className="field field--inline">
                <span className="field__label">Tipo</span>
                <select
                  className="field__input"
                  value={genVariant}
                  onChange={(e) => {
                    const v = e.target.value as SchedaVariant;
                    setGenVariant(v);
                  }}
                >
                  {SCHEDA_VARIANTS.map((v) => (
                    <option key={v} value={v}>
                      {SCHEDA_VARIANT_LABELS[v]}
                    </option>
                  ))}
                </select>
              </label>
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
            <p className="admin__hint">
              {genVariant === 'ale' ? (
                <>
                  Le schede <strong>Ale</strong> usano la calibrazione ad anelli di
                  frequenza (<code>frequency-it.txt</code>) e il dizionario: la prima generazione
                  carica gli ingressi (qualche secondo), poi è immediata. La generazione segue il
                  flusso <strong>a tre secchi</strong> ma tiene solo la fascia scelta: i candidati
                  delle altre fasce vengono scartati. Vengono salvate in{' '}
                  <code>schede-ale/</code>, separate dalle altre.
                </>
              ) : (
                <>
                  Le schede <strong>{SCHEDA_VARIANT_LABELS[genVariant]}</strong> vengono salvate in{' '}
                  <code>schede-extra/</code>.
                </>
              )}
            </p>
          </section>

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
              <label className="field field--inline">
                <span className="field__label">Tipo</span>
                <select
                  className="field__input"
                  value={filterVariant}
                  onChange={(e) => setFilterVariant(e.target.value as SchedaVariant | '')}
                >
                  <option value="">Tutti</option>
                  {SCHEDA_VARIANTS.map((v) => (
                    <option key={v} value={v}>
                      {SCHEDA_VARIANT_LABELS[v]}
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
                {' — per tipo: '}
                {SCHEDA_VARIANTS.map((v, i) => `${SCHEDA_VARIANT_LABELS[v]} ${byVariantTotals[i] ?? 0}`).join(
                  ' · ',
                )}
              </p>
            )}
          </section>

          <section className="admin__section">
            <div className="admin__section-head">
              <h3 className="summary__label">Elenco ({list?.count ?? 0})</h3>
              {/* Sfoglia le schede: da qui, perché solo l'admin vede le soluzioni. */}
              <button className="btn btn--secondary" onClick={() => setScreen('scheda')}>
                Sfoglia le schede
              </button>
            </div>
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
                      {s.variant !== 'standard' ? ` · ${SCHEDA_VARIANT_LABELS[s.variant]}` : ''}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </section>

          {/* Cancellazione: operazione irreversibile, protetta da conferma digitata. */}
          <section className="admin__section admin__section--danger">
            <h3 className="summary__label">Cancella schede</h3>
            <div className="admin__form">
              <label className="field field--inline">
                <span className="field__label">Cosa</span>
                <select
                  className="field__input"
                  value={deleteScope}
                  onChange={(e) => setDeleteScope(e.target.value as DeleteScope)}
                >
                  {DELETE_SCOPES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              {deleteScope === 'variant' && (
                <label className="field field--inline">
                  <span className="field__label">Variante</span>
                  <select
                    className="field__input"
                    value={deleteVariant}
                    onChange={(e) => setDeleteVariant(e.target.value as SchedaVariant)}
                  >
                    {SCHEDA_VARIANTS.map((v) => (
                      <option key={v} value={v}>
                        {SCHEDA_VARIANT_LABELS[v]}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="field field--inline">
                <span className="field__label">
                  Scrivi <code>DELETE</code>
                </span>
                <input
                  className="field__input"
                  value={deleteConfirm}
                  placeholder="DELETE"
                  onChange={(e) => setDeleteConfirm(e.target.value)}
                />
              </label>
              <button
                className="btn btn--danger"
                disabled={busy || deleteConfirm !== 'DELETE'}
                onClick={() => void cancelAll()}
              >
                Cancella
              </button>
            </div>
            <p className="admin__hint">
              {DELETE_SCOPES.find((s) => s.id === deleteScope)?.hint}{' '}
              {deleteScope === 'all' && <strong>Irreversibile.</strong>}
            </p>
          </section>
        </>
      )}

      {tab === 'musica' && <MusicAdmin token={adminToken} />}
      {tab === 'profili' && <ProfilesAdmin token={adminToken} />}
    </div>
  );
}
