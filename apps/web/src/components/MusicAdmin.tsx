import { useCallback, useEffect, useRef, useState } from 'react';
import type { AdminMusicTrack, MusicTrackMeta } from '@boggle/shared';
import { SERVER_BASE } from '../net/socket.js';
import { useAppStore } from '../state/store.js';

/**
 * Caricamento degli MP3 nel pannello admin.
 *
 * I file vanno sul SERVER (non restano nel browser dell'admin): la playlist è
 * condivisa, e quando l'host sceglie una traccia in stanza tutti i giocatori
 * devono poterla scaricare. I file sono serviti pubblicamente da `/music/:id/file`.
 *
 * L'upload usa un body BINARIO (non base64 in JSON): un MP3 da 5 MB diventerebbe
 * ~6,7 MB di base64 e verrebbe materializzato come stringa in memoria. Il limite
 * del parser JSON (4 MB) inoltre rifiuterebbe i file grandi.
 */
export function MusicAdmin({ token }: { token: string }) {
  const { musicCatalog, refreshMusicCatalog } = useAppStore();
  const [label, setLabel] = useState('');
  const [credits, setCredits] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /**
   * Catalogo COMPLETO (incluse le tracce spente). Non usiamo `musicCatalog`
   * perché quello arriva da `/music`, che serve solo le tracce attive: una
   * traccia spenta sparirebbe dall'elenco e non si potrebbe più riaccendere.
   */
  const [all, setAll] = useState<AdminMusicTrack[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadAdminCatalog = useCallback(async () => {
    try {
      const res = await fetch(`${SERVER_BASE}/admin/music`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const body = (await res.json()) as { all?: AdminMusicTrack[] };
      if (Array.isArray(body.all)) setAll(body.all);
    } catch {
      /* l'elenco è di supporto: se manca, restano upload e rimozione */
    }
  }, [token]);

  useEffect(() => {
    void refreshMusicCatalog();
    void loadAdminCatalog();
  }, [refreshMusicCatalog, loadAdminCatalog]);

  /** Tracce del catalogo pubblico (per chi non ha ancora caricato l'admin). */
  const fallback: AdminMusicTrack[] = musicCatalog.map((t) => ({ ...t, enabled: true }));
  const tracks = all ?? fallback;

  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const params = new URLSearchParams();
      if (label.trim()) params.set('label', label.trim());
      if (credits.trim()) params.set('credits', credits.trim());
      const res = await fetch(`${SERVER_BASE}/admin/music?${params.toString()}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          // Il mime dice al server il formato (e quindi l'estensione su disco).
          'Content-Type': file.type || 'audio/mpeg',
        },
        body: file,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const body = (await res.json()) as { track: MusicTrackMeta };
      setNotice(`Caricata "${body.track.label}". È subito disponibile per tutti.`);
      setLabel('');
      setCredits('');
      if (fileRef.current) fileRef.current.value = '';
      await refreshMusicCatalog();
      await loadAdminCatalog();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm('Rimuovere questa traccia? Sparirà dalla playlist di tutti.')) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`${SERVER_BASE}/admin/music/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setNotice('Traccia rimossa.');
      await refreshMusicCatalog();
      await loadAdminCatalog();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  /**
   * Accende o spegne una traccia.
   *
   * Non è una semplice preferenza locale: la traccia sparisce dal catalogo di
   * TUTTI (anche le incluse nel bundle), quindi nessuno può più sceglierla e chi
   * la stava ascoltando in stanza passa a un'altra senza ricaricare.
   */
  const toggle = async (track: AdminMusicTrack) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(
        `${SERVER_BASE}/admin/music/${encodeURIComponent(track.id)}/enabled`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ enabled: !track.enabled }),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setNotice(
        track.enabled
          ? `"${track.label}" rimossa dalla playlist. Il file resta: puoi riaccenderla.`
          : `"${track.label}" di nuovo disponibile per tutti.`,
      );
      await refreshMusicCatalog();
      await loadAdminCatalog();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="admin__section">
      <h3 className="summary__label">Musica di sottofondo</h3>
      <p className="admin__hint">
        Carica un MP3 per aggiungerlo alla playlist condivisa. Compare subito fra le tracce
        scegliibili da tutti i giocatori (in stanza la scegle l'host).
      </p>

      <div className="admin__form">
        <label className="field field--inline">
          <span className="field__label">Titolo</span>
          <input
            className="field__input"
            type="text"
            maxLength={60}
            placeholder="es. Battaglia finale"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </label>
        <label className="field field--inline">
          <span className="field__label">Fonte / licenza</span>
          <input
            className="field__input"
            type="text"
            maxLength={160}
            placeholder="es. “Track” di Autore (CC0)"
            value={credits}
            onChange={(e) => setCredits(e.target.value)}
          />
        </label>
        <label className="field field--inline">
          <span className="field__label">File MP3</span>
          <input
            ref={fileRef}
            className="field__input"
            type="file"
            accept="audio/*,.mp3"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
            }}
          />
        </label>
      </div>

      {error && <div className="banner banner--error">{error}</div>}
      {notice && <div className="banner banner--ok">{notice}</div>}

      {/*
       * Playlist COMPLETA, incluse le tracce spente.
       *
       * Non filtriamo per `uploaded`: le tracce incluse nel bundle sono quelle che
       * più spesso si vuole togliere di mezzo, e prima non erano nemmeno
       * elencate. Ogni riga ha l'interruttore on/off; la ✕ resta solo per le
       * tracce caricate (le incluse non si possono cancellare: sono nel client).
       */}
      <ul className="admin__music-list">
        {tracks.map((track) => (
          <li
            key={track.id}
            className={`admin__music-row${track.enabled ? '' : ' admin__music-row--off'}`}
          >
            <div className="admin__music-info">
              <strong>{track.label}</strong>
              <span>{track.credits}</span>
              <span className="admin__music-id">
                {track.id}
                {track.uploaded ? ' · caricata' : ' · inclusa'}
                {track.enabled ? '' : ' · spenta'}
              </span>
            </div>
            <audio controls preload="none" src={`${SERVER_BASE}${track.file}`} />
            <button
              type="button"
              className={`btn btn--tiny${track.enabled ? ' btn--ghost' : ''}`}
              disabled={busy}
              onClick={() => void toggle(track)}
              title={track.enabled ? 'Rimuovi dalla playlist' : 'Rimetti in playlist'}
              aria-pressed={track.enabled}
            >
              {track.enabled ? '🚫' : '↺'}
            </button>
            {track.uploaded && (
              <button
                type="button"
                className="btn btn--tiny btn--ghost"
                disabled={busy}
                onClick={() => void remove(track.id)}
                title="Elimina il file"
              >
                ✕
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
