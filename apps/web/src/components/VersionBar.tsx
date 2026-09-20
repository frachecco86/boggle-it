import { APP_VERSION } from '../version.js';
import { useAppStore } from '../state/store.js';

/**
 * Barra superiore con il numero di versione cliccabile: apre la pagina Novità.
 * È fissa in alto a destra, discreta, in tutte le schermate.
 */
export function VersionBar() {
  const setScreen = useAppStore((s) => s.setScreen);
  return (
    <button
      type="button"
      className="versionbar"
      onClick={() => setScreen('changelog')}
      title="Novità di questa versione"
      aria-label={`Versione ${APP_VERSION}: apri le novità`}
    >
      v{APP_VERSION}
    </button>
  );
}
