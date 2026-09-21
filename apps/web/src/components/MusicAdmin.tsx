import { useEffect, useRef, useState } from 'react';
import type { MusicTrackMeta } from '@boggle/shared';
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
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void refreshMusicCatalog();
  }, [refreshMusicCatalog]);

  const uploaded = musicCatalog.filter((t: MusicTrackMeta) => t.uploaded);

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

      {uploaded.length > 0 && (
        <ul className="admin__music-list">
          {uploaded.map((track) => (
            <li key={track.id} className="admin__music-row">
              <div className="admin__music-info">
                <strong>{track.label}</strong>
                <span>{track.credits}</span>
              </div>
              <audio controls preload="none" src={`${SERVER_BASE}${track.file}`} />
              <button
                type="button"
                className="btn btn--tiny btn--ghost"
                disabled={busy}
                onClick={() => void remove(track.id)}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
