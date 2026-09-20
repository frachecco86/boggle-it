import { APP_VERSION } from '../version.js';
import { useAppStore } from '../state/store.js';

/**
 * Barra superiore fissa, presente in ogni schermata.
 *
 * Contiene la voce **Classifica** (con le statistiche dei giocatori) e il numero
 * di versione cliccabile che apre le novità. È discreta: non ruba spazio al gioco.
 */
export function VersionBar() {
  const setScreen = useAppStore((s) => s.setScreen);
  const screen = useAppStore((s) => s.screen);

  // Sulla schermata classifica la voce è evidenziata e non riapre se stessa.
  const onLeaderboard = screen === 'leaderboard';

  return (
    <div className="topbar">
      <button
        type="button"
        className={`topbar__item${onLeaderboard ? ' topbar__item--active' : ''}`}
        onClick={() => setScreen('leaderboard')}
        title="Classifica e statistiche"
        aria-current={onLeaderboard ? 'page' : undefined}
      >
        <span className="topbar__icon" aria-hidden>
          🏆
        </span>
        <span className="topbar__label">Classifica</span>
      </button>

      <button
        type="button"
        className={`topbar__item${screen === 'words' ? ' topbar__item--active' : ''}`}
        onClick={() => setScreen('words')}
        title="Tutte le parole che si possono trovare"
        aria-current={screen === 'words' ? 'page' : undefined}
      >
        <span className="topbar__icon" aria-hidden>
          📖
        </span>
        <span className="topbar__label">Parole</span>
      </button>

      <button
        type="button"
        className="versionbar"
        onClick={() => setScreen('changelog')}
        title="Novità di questa versione"
        aria-label={`Versione ${APP_VERSION}: apri le novità`}
      >
        v{APP_VERSION}
      </button>
    </div>
  );
}
