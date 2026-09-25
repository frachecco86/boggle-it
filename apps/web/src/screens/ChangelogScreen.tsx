import { APP_VERSION, CHANGE_LABELS, RELEASES } from '../version.js';
import { BackHome } from '../components/BackHome.js';
import { RichText } from '../components/RichText.js';

/**
 * Pagina delle novità: ogni versione con le funzionalità introdotte.
 * Le voci sono in linguaggio tecnico ma leggibile: cosa è cambiato e perché.
 */
export function ChangelogScreen() {
  return (
    <div className="screen changelog">
      <BackHome />
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

          {/*
           * Card promozionale: due-tre righe per chi vuole sapere in fretta cosa
           * porta la versione. Sta SOPRA l'elenco delle modifiche perché è il
           * punto d'ingresso: chi cerca i dettagli li trova subito sotto.
           */}
          {release.promo && (
            <aside className="promo">
              <span className="promo__emoji" aria-hidden>
                {release.promo.emoji ?? '✨'}
              </span>
              <div className="promo__body">
                <p className="promo__headline">{release.promo.headline}</p>
                <p className="promo__text">
                  <RichText text={release.promo.text} />
                </p>
              </div>
            </aside>
          )}

          {release.changes.map((group) => (
            <section key={group.kind} className="release__group">
              <h4 className={`release__kind release__kind--${group.kind}`}>
                {CHANGE_LABELS[group.kind]}
              </h4>
              <ul className="release__items">
                {group.items.map((item) => (
                  <li key={item}>
                    {/* Le note usano `**grassetto**`, `*corsivo*` e `` `codice` ``:
                        senza `RichText` si vedevano gli asterischi a schermo. */}
                    <RichText text={item} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </article>
      ))}
    </div>
  );
}
