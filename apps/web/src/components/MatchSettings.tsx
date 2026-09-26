import {
  DIFFICULTIES,
  DIFFICULTY_ORDER,
  ROUND_DURATIONS_SEC,
  SCHEDA_VARIANT_HINTS,
  SCHEDA_VARIANT_LABELS,
  SCHEDA_VARIANTS,
  type Difficulty,
  type GridSize,
  type SchedaVariant,
} from '@boggle/shared';
import { RulesPanel } from './RulesPanel.js';

interface MatchSettingsProps {
  size: GridSize;
  difficulty: Difficulty;
  rounds: number;
  durationMs: number;
  /** Insieme di criteri delle schede da giocare. */
  variant: SchedaVariant;
  onSize: (s: GridSize) => void;
  onDifficulty: (d: Difficulty) => void;
  onRounds: (r: number) => void;
  onDuration: (ms: number) => void;
  onVariant: (v: SchedaVariant) => void;
  onClose: () => void;
}

/**
 * Impostazioni della partita: **un solo menù** per single player e multiplayer.
 *
 * Perché un foglio sovrapposto (e non un blocco in fondo alla home): le scelte
 * sono quattro (griglia, difficoltà, durata, round) e in linea spingevano il
 * contenuto della home fuori dallo schermo — con la pagina che scorreva proprio
 * mentre si sceglieva. Qui il foglio si apre sopra la home, quindi la home resta
 * della stessa altezza e il menù sta **tutto in una schermata**.
 *
 * Le stesse impostazioni valgono per le due modalità (`Gioca da solo` e `Crea la
 * stanza` sono i tasti della home, sotto l'interruttore di modalità): qui si
 * sceglie e si chiude. Prima ogni modalità aveva il suo tasto dentro al foglio,
 * per cui la stessa scelta si poteva fare in due punti diversi.
 */
export function MatchSettings({
  size,
  difficulty,
  rounds,
  durationMs,
  variant,
  onSize,
  onDifficulty,
  onRounds,
  onDuration,
  onVariant,
  onClose,
}: MatchSettingsProps) {
  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label="Impostazioni partita">
      {/* Toccando fuori dal pannello si chiude: è il gesto che ci si aspetta. */}
      <button type="button" className="sheet__backdrop" onClick={onClose} aria-label="Chiudi le impostazioni" />

      <div className="sheet__panel">
        <header className="sheet__head">
          <h3 className="sheet__title">Impostazioni partita</h3>
          <button type="button" className="sheet__close" onClick={onClose} aria-label="Chiudi le impostazioni">
            ✕
          </button>
        </header>

        {/* Ogni riga tiene etichetta e scelte sulla stessa linea: quattro righe
            compatte invece di otto (etichetta sopra + pulsanti sotto). */}
        <div className="sheet__row">
          <span className="sheet__label">Griglia</span>
          <div className="rounds-options">
            {([4, 5, 6] as GridSize[]).map((s) => (
              <button
                key={s}
                type="button"
                className={`pill${size === s ? ' pill--active' : ''}`}
                onClick={() => onSize(s)}
              >
                {s}×{s}
              </button>
            ))}
          </div>
        </div>

        <div className="sheet__row">
          <span className="sheet__label">Difficoltà</span>
          <div className="difficulty-options difficulty-options--compact">
            {DIFFICULTY_ORDER.map((id) => (
              <button
                key={id}
                type="button"
                className={`difficulty-option difficulty-option--compact${
                  difficulty === id ? ' difficulty-option--active' : ''
                }`}
                style={{ ['--level-accent' as string]: DIFFICULTIES[id].theme.accent }}
                onClick={() => onDifficulty(id)}
              >
                <span className="difficulty-option__dot" />
                <span className="difficulty-option__label">{DIFFICULTIES[id].label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="sheet__row">
          <span className="sheet__label">Durata</span>
          <div className="rounds-options">
            {ROUND_DURATIONS_SEC.map((sec) => (
              <button
                key={sec}
                type="button"
                className={`pill${durationMs === sec * 1000 ? ' pill--active' : ''}`}
                onClick={() => onDuration(sec * 1000)}
              >
                {sec} sec
              </button>
            ))}
          </div>
        </div>

        <div className="sheet__row">
          <span className="sheet__label">Round</span>
          <div className="rounds-options">
            {[1, 3, 5].map((r) => (
              <button
                key={r}
                type="button"
                className={`pill${rounds === r ? ' pill--active' : ''}`}
                onClick={() => onRounds(r)}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {/*
         * Criteri delle schede: due cataloghi diversi, non due difficoltà. Le
         * schede "full criteria" seguono i criteri completi (rapporto
         * vocali/consonanti per livello, frequenza delle lettere, numero di
         * parole e parole ancora); le standard sono il catalogo storico.
         */}
        <div className="sheet__row">
          <span className="sheet__label">Schede</span>
          <div className="rounds-options">
            {SCHEDA_VARIANTS.map((v) => {
              /*
               * Le schede "ale" esistono solo sulla griglia 5×5 (la calibrazione è
               * per dimensione e il catalogo è concentrato lì). Altrove il tasto è
               * disabilitato: sceglierlo darebbe "nessuna scheda disponibile".
               */
              const disabled = v === 'ale' && size !== 5;
              return (
                <button
                  key={v}
                  type="button"
                  disabled={disabled}
                  className={`pill${variant === v ? ' pill--active' : ''}`}
                  title={
                    disabled
                      ? 'Disponibili solo sulla griglia 5×5'
                      : SCHEDA_VARIANT_HINTS[v]
                  }
                  onClick={() => onVariant(v)}
                >
                  {SCHEDA_VARIANT_LABELS[v]}
                </button>
              );
            })}
          </div>
        </div>
        <p className="sheet__note">
          {variant === 'ale' && size !== 5
            ? 'Le schede Ale sono disponibili solo sulla griglia 5×5.'
            : SCHEDA_VARIANT_HINTS[variant]}
        </p>

        {/* Le regole stanno qui perché prima erano nell'anteprima della scheda,
            che non c'è più (vedere la scheda prima di giocare avvantaggia). */}
        <RulesPanel />

        <div className="sheet__actions">
          <button type="button" className="btn btn--primary" onClick={onClose}>
            Fatto
          </button>
        </div>
      </div>
    </div>
  );
}
