import { useCallback, useEffect, useRef, useState } from 'react';
import { SFX_SLOTS, SFX_SLOT_LABELS, type SfxSlot } from '@boggle/shared';
import { ClipRecorder, isRecordingSupported } from '../game/audioRecorder.js';

interface Props {
  /** URL corrente delle clip salvate (dal profilo). */
  clips: Record<string, string | undefined>;
  /** Salva una clip: riceve data URL, mime e durata. */
  onSave: (slot: SfxSlot, dataUrl: string, durationMs: number) => Promise<void>;
  onDelete: (slot: SfxSlot) => Promise<void>;
  maxDurationMs: number;
}

/**
 * Registratore delle 5 fasce audio. Ogni fascia è opzionale: se manca, si usa
 * l'effetto sintetizzato. Le clip sono personali (il server le tiene private).
 */
export function SfxRecorder({ clips, onSave, onDelete, maxDurationMs }: Props) {
  const supported = isRecordingSupported();
  const recorderRef = useRef<ClipRecorder | null>(null);
  const [recordingSlot, setRecordingSlot] = useState<SfxSlot | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [busySlot, setBusySlot] = useState<SfxSlot | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Fascia appena salvata: mostra una conferma breve, poi sparisce. */
  const [savedSlot, setSavedSlot] = useState<SfxSlot | null>(null);
  const savedTimer = useRef<number | null>(null);
  const tickRef = useRef<number | null>(null);

  // Pulizia: microfono mai lasciato aperto.
  useEffect(() => {
    return () => {
      recorderRef.current?.cancel();
      if (tickRef.current !== null) window.clearInterval(tickRef.current);
      if (savedTimer.current !== null) window.clearTimeout(savedTimer.current);
    };
  }, []);

  const start = useCallback(
    async (slot: SfxSlot) => {
      setError(null);
      try {
        recorderRef.current?.cancel();
        const recorder = new ClipRecorder();
        recorderRef.current = recorder;
        await recorder.start(maxDurationMs);
        setRecordingSlot(slot);
        setElapsedMs(0);
        tickRef.current = window.setInterval(() => setElapsedMs((v) => v + 100), 100);
      } catch (err) {
        setError(
          err instanceof Error && err.name === 'NotAllowedError'
            ? 'Permesso microfono negato'
            : 'Microfono non disponibile',
        );
        setRecordingSlot(null);
      }
    },
    [maxDurationMs],
  );

  const stop = useCallback(
    async (slot: SfxSlot) => {
      const recorder = recorderRef.current;
      if (!recorder) return;
      if (tickRef.current !== null) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }
      setRecordingSlot(null);
      setBusySlot(slot);
      try {
        const clip = await recorder.stop();
        await onSave(slot, clip.dataUrl, clip.durationMs);
        /*
         * Conferma esplicita di avvenuto salvataggio.
         *
         * Prima l'unico segnale era il passaggio della riga a "registrato": se
         * il salvataggio falliva in modo silenzioso (o la clip veniva
         * sovrascritta con la vecchia) l'utente non aveva modo di accorgersene.
         * Ora c'è un messaggio verde per qualche secondo.
         */
        setError(null);
        setSavedSlot(slot);
        if (savedTimer.current !== null) window.clearTimeout(savedTimer.current);
        savedTimer.current = window.setTimeout(() => setSavedSlot(null), 3000);
      } catch (err) {
        // Mostra il motivo reale (es. errore del server) invece di un messaggio
        // generico: senza, ogni problema appare come "registrazione non riuscita".
        setError(err instanceof Error ? err.message : 'Registrazione non riuscita');
      } finally {
        setBusySlot(null);
        recorderRef.current = null;
      }
    },
    [onSave],
  );

  const remove = useCallback(
    async (slot: SfxSlot) => {
      setBusySlot(slot);
      try {
        await onDelete(slot);
      } finally {
        setBusySlot(null);
      }
    },
    [onDelete],
  );

  return (
    <section className="profile-section">
      <h3 className="summary__label">Suoni delle parole</h3>
      <p className="profile-section__hint">
        Registra un suono per ogni lunghezza: lo sentirai tu quando trovi una parola. Se non
        registri nulla, si usa il suono predefinito.
      </p>

      {!supported && (
        <div className="banner banner--error">Il microfono non è disponibile su questo dispositivo.</div>
      )}
      {error && <div className="banner banner--error">{error}</div>}

      <ul className="sfx-list">
        {SFX_SLOTS.map((slot) => {
          const recording = recordingSlot === slot;
          const busy = busySlot === slot;
          const hasClip = Boolean(clips[slot]);
          return (
            <li key={slot} className="sfx-row">
              <span className="sfx-row__label">{SFX_SLOT_LABELS[slot]}</span>

              {recording ? (
                <span className="sfx-row__elapsed">{(elapsedMs / 1000).toFixed(1)}s</span>
              ) : savedSlot === slot ? (
                <span className="sfx-row__saved">✓ salvato</span>
              ) : hasClip ? (
                <span className="sfx-row__ok">registrato</span>
              ) : (
                <span className="sfx-row__empty">predefinito</span>
              )}

              <div className="sfx-row__actions">
                {hasClip && !recording && (
                  <button
                    type="button"
                    className="btn btn--tiny"
                    onClick={() => {
                      const url = clips[slot];
                      // `?t=` evita che il browser serva una copia in cache della
                      // clip precedente dopo una riregistrazione.
                      if (url) void new Audio(`${url}#t=${Date.now()}`).play().catch(() => undefined);
                    }}
                  >
                    ▶
                  </button>
                )}
                {recording ? (
                  <button type="button" className="btn btn--tiny btn--danger" onClick={() => void stop(slot)}>
                    ■ stop
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn--tiny"
                    disabled={!supported || busy}
                    onClick={() => void start(slot)}
                  >
                    {hasClip ? '⟲ riregistra' : '● registra'}
                  </button>
                )}
                {hasClip && !recording && (
                  <button
                    type="button"
                    className="btn btn--tiny btn--ghost"
                    disabled={busy}
                    onClick={() => void remove(slot)}
                  >
                    ✕
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
