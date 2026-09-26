import { useCallback, useEffect, useState } from 'react';
import { SERVER_BASE } from '../net/socket.js';

interface AdminProfile {
  id: string;
  nickname: string;
  avatar: string;
  hasPhoto: boolean;
  games: number;
  createdAt: number;
}

/**
 * Tab "Profili" del pannello admin: elenco e cancellazione.
 *
 * La cancellazione è IRREVERSIBILE e porta via, per le foreign key a cascata,
 * sessioni, foto, clip audio e partite in classifica. Per questo non basta un
 * click: il server richiede `?confirm=<nickname>`, e qui il nickname va digitato
 * esatto. Un id sbagliato non può quindi cancellare il profilo di un altro per
 * sbaglio.
 */
export function ProfilesAdmin({ token }: { token: string }) {
  const [profiles, setProfiles] = useState<AdminProfile[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** Profilo in attesa di conferma (mostra il campo con il nickname da digitare). */
  const [pending, setPending] = useState<AdminProfile | null>(null);
  const [confirmText, setConfirmText] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${SERVER_BASE}/admin/profiles`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const body = (await res.json()) as { profiles?: AdminProfile[] };
      if (Array.isArray(body.profiles)) setProfiles(body.profiles);
    } catch {
      /* l'elenco è di supporto: un errore di rete non deve svuotare la pagina */
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const confirmDelete = async () => {
    if (!pending) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(
        `${SERVER_BASE}/admin/profiles/${encodeURIComponent(pending.id)}?confirm=${encodeURIComponent(confirmText)}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
      );
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setNotice(`Profilo "${pending.nickname}" cancellato.`);
      setPending(null);
      setConfirmText('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const resetGames = async () => {
    if (!window.confirm('Azzerare TUTTE le partite in classifica? I profili restano.')) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`${SERVER_BASE}/admin/games/reset`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = (await res.json().catch(() => ({}))) as { removed?: number; error?: string };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setNotice(`Azzerate ${body.removed ?? 0} partite dalla classifica.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="admin__section">
      <div className="admin__topbar">
        <h3 className="summary__label">Profili ({profiles?.length ?? '…'})</h3>
        <button className="btn btn--ghost" disabled={busy} onClick={() => void resetGames()}>
          Azzera classifica
        </button>
      </div>
      <p className="admin__hint">
        Cancellare un profilo elimina account, foto, clip audio e partite in classifica. È
        irreversibile.
      </p>

      {error && <div className="banner banner--error">{error}</div>}
      {notice && <div className="banner banner--ok">{notice}</div>}

      {profiles && profiles.length === 0 && <p className="screen__hint">Nessun profilo registrato.</p>}

      <ul className="admin__profile-list">
        {profiles?.map((p) => (
          <li key={p.id} className="admin__profile-row">
            <span className="admin__profile-avatar" aria-hidden>
              {p.avatar}
            </span>
            <div className="admin__profile-info">
              <strong>{p.nickname}</strong>
              <span className="admin__profile-meta">
                {p.games} {p.games === 1 ? 'partita' : 'partite'}
                {p.hasPhoto ? ' · foto' : ''} · dal{' '}
                {new Date(p.createdAt).toLocaleDateString('it-IT')}
              </span>
            </div>
            <button
              type="button"
              className="btn btn--tiny btn--ghost"
              disabled={busy}
              onClick={() => {
                setPending(p);
                setConfirmText('');
                setNotice(null);
                setError(null);
              }}
              title="Cancella il profilo"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>

      {/* Conferma inline: richiede di digitare il nickname, come il server. */}
      {pending && (
        <div className="admin__confirm" role="dialog" aria-label="Conferma cancellazione">
          <p>
            Cancellare <strong>{pending.nickname}</strong>? Per confermare digita il nickname.
          </p>
          <div className="admin__form">
            <input
              className="field__input"
              type="text"
              value={confirmText}
              placeholder={pending.nickname}
              onChange={(e) => setConfirmText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && confirmText === pending.nickname && void confirmDelete()}
            />
            <button
              className="btn btn--danger"
              disabled={busy || confirmText !== pending.nickname}
              onClick={() => void confirmDelete()}
            >
              {busy ? 'Cancello…' : 'Cancella'}
            </button>
            <button
              className="btn btn--ghost"
              disabled={busy}
              onClick={() => {
                setPending(null);
                setConfirmText('');
              }}
            >
              Annulla
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
