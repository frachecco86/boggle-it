import { useEffect, useMemo } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { useAppStore } from '../state/store.js';
import { voiceChat } from '../net/voiceChat.js';

/**
 * Id dei giocatori che stanno parlando adesso, compreso chi guarda.
 *
 * Il proprio id non arriva dal server (la voce non torna mai a chi parla), quindi
 * si aggiunge localmente quando il tasto è premuto: nella classifica della
 * partita la propria riga deve mostrare l'indicatore come tutte le altre.
 */
export function useVoiceSpeakers(): string[] {
  const speakers = useAppStore((s) => s.voiceSpeakers);
  const talking = useAppStore((s) => s.voiceTalking);
  const me = useAppStore((s) => s.playerId);
  return useMemo(
    () => (talking && me && !speakers.includes(me) ? [...speakers, me] : speakers),
    [speakers, talking, me],
  );
}

/**
 * Tre barrette che si alzano e si abbassano: "sta parlando".
 *
 * Perché non un'icona: è uno stato **continuo** (dura quanto la frase), e una
 * barretta che si muove si nota con la coda dell'occhio anche mentre si guarda
 * la griglia. Il `aria-label` lo rende comprensibile anche a chi usa un lettore
 * di schermo, dove l'animazione non arriva.
 */
export function SpeakingIndicator({ name }: { name: string }) {
  return (
    <span className="speaking" role="img" aria-label={`${name} sta parlando`} title="Sta parlando">
      <span className="speaking__bar" />
      <span className="speaking__bar" />
      <span className="speaking__bar" />
    </span>
  );
}

/**
 * Comandi della voce, in basso a destra, presenti in ogni schermata di una stanza.
 *
 * Due tasti:
 *  - **parlare** (tieni premuto): grande, sotto il pollice, si illumina mentre
 *    trasmette. Non ha etichetta: l'icona del microfono dice tutto e durante una
 *    partita lo spazio è poco.
 *  - **muto**: silenzia il proprio microfono per la sessione, per quando in casa
 *    c'è rumore e non si vuole che entri in partita.
 *
 * Il rilascio è intercettato sulla **finestra**, non sul tasto: se il dito
 * scivola fuori dal pulsante, se arriva una telefonata o se la pagina perde il
 * fuoco, la voce deve fermarsi comunque. Un microfono che resta aperto perché il
 * dito è uscito dal pulsante sarebbe il difetto peggiore di questa funzione.
 */
export function VoiceControls() {
  const muted = useAppStore((s) => s.voiceMuted);
  const talking = useAppStore((s) => s.voiceTalking);
  const notice = useAppStore((s) => s.voiceNotice);

  // Uscendo dalla stanza (o smontando la schermata) si libera il microfono.
  useEffect(() => () => voiceChat.leaveRoom(), []);

  /*
   * Il rilascio si ascolta SEMPRE, non solo mentre si parla.
   *
   * Perché: fra il tocco e la registrazione dei listener passa un render, e un
   * tocco molto rapido potrebbe concludersi prima — lasciando il microfono
   * aperto fino al rilascio successivo. Ascoltando da subito il caso non esiste;
   * quando non si sta parlando `release()` non fa nulla.
   */
  useEffect(() => {
    const stop = () => voiceChat.release();
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    window.addEventListener('blur', stop);
    document.addEventListener('visibilitychange', stop);
    return () => {
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      window.removeEventListener('blur', stop);
      document.removeEventListener('visibilitychange', stop);
    };
  }, []);

  const talkLabel = muted
    ? 'Parla (microfono silenziato)'
    : talking
      ? 'Stai parlando: rilascia per finire'
      : 'Tieni premuto per parlare';

  return (
    <div className="voice-controls">
      {notice && (
        <p className="voice-controls__notice" role="status">
          {notice}
        </p>
      )}

      <div className="voice-controls__buttons" role="group" aria-label="Voce nella stanza">
        <button
          type="button"
          className={`voice-controls__btn voice-controls__mute${muted ? ' voice-controls__mute--on' : ''}`}
          onClick={() => voiceChat.setMuted(!muted)}
          aria-pressed={muted}
          aria-label={muted ? 'Riattiva il microfono' : 'Silenzia il microfono'}
          title={muted ? 'Riattiva il microfono' : 'Silenzia il microfono'}
        >
          {muted ? <MicOff size={18} aria-hidden /> : <Mic size={18} aria-hidden />}
        </button>

        <button
          type="button"
          className={`voice-controls__btn voice-controls__talk${
            talking ? ' voice-controls__talk--live' : ''
          }${muted ? ' voice-controls__talk--muted' : ''}`}
          onPointerDown={(e) => {
            // Senza questo il tocco prolungato apre il menu contestuale del
            // browser e il tasto si "incolla" (la voce non si ferma più).
            e.preventDefault();
            void voiceChat.press();
          }}
          onKeyDown={(e) => {
            if (e.key !== ' ' && e.key !== 'Enter') return;
            e.preventDefault();
            void voiceChat.press();
          }}
          onKeyUp={(e) => {
            if (e.key !== ' ' && e.key !== 'Enter') return;
            voiceChat.release();
          }}
          onContextMenu={(e) => e.preventDefault()}
          aria-pressed={talking}
          aria-label={talkLabel}
          title={talkLabel}
        >
          <Mic size={26} aria-hidden />
        </button>
      </div>
    </div>
  );
}
