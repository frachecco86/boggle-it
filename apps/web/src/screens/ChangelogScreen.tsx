import { APP_VERSION, CHANGE_LABELS, RELEASES } from '../version.js';
import { useAppStore } from '../state/store.js';

/**
 * Pagina delle novità: ogni versione con le funzionalità introdotte.
 * Le voci sono in linguaggio tecnico ma leggibile: cosa è cambiato e perché.
 */
export function ChangelogScreen() {
  const setScreen = useAppStore((s) => s.setScreen);

  return (
    <div className="screen changelog">
      <button className="btn btn--ghost" onClick={() => setScreen('home')}>
        ← Home
      </button>
      <header className="changelog__head">
        <h2 className="screen__title">Novità</h2>
        <p className="screen__hint">
          Versione attuale <strong>v{APP_VERSION}</strong> · {RELEASES.length} versioni pubblicate
        </p>
      </header>

      {RELEASES.map((release) => (
        <article key={release.version} className="release">
          <header className="release__head">
            <span className="release__version">v{release.version}</span>
            {release.version === APP_VERSION && <span className="release__current">attuale</span>}
            <time className="release__date" dateTime={release.date}>
              {new Date(release.date).toLocaleDateString('it-IT', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </time>
          </header>
          <h3 className="release__title">{release.title}</h3>

          {release.changes.map((group) => (
            <section key={group.kind} className="release__group">
              <h4 className={`release__kind release__kind--${group.kind}`}>
                {CHANGE_LABELS[group.kind]}
              </h4>
              <ul className="release__items">
                {group.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          ))}
        </article>
      ))}
    </div>
  );
}
