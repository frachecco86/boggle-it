import { useAppStore } from '../state/store.js';
import { BackHome } from '../components/BackHome.js';
import { SchedaBrowser } from '../components/SchedaBrowser.js';

/**
 * "Sfoglia le schede": elenco filtrabile e ordinabile, più il dettaglio.
 *
 * Il contenuto vero vive in `SchedaBrowser`, perché la stessa sfoglia si apre
 * anche dalla tab "Sfoglia" del pannello admin: qui resta solo la cornice della
 * schermata (titolo, tasto Home). Vedi `components/SchedaBrowser.tsx`.
 *
 * Chi vede le soluzioni: solo l'admin. Il tasto in home è dentro l'area admin e
 * l'elenco non è raggiungibile da un giocatore durante una partita. Vedi la
 * schermata admin per il dettaglio.
 */
export function SchedaScreen() {
  const { setScreen } = useAppStore();

  return (
    <div className="screen scheda">
      <div className="scheda__topbar">
        <BackHome />
      </div>
      <h2 className="screen__title">Sfoglia le schede</h2>
      <p className="screen__hint">
        Elenco completo del catalogo, con le soluzioni. Questa pagina è dell&apos;amministratore:
        si apre dal pannello Admin.{' '}
        <button className="btn btn--tiny btn--ghost" onClick={() => setScreen('admin')}>
          Apri Admin
        </button>
      </p>
      <SchedaBrowser />
    </div>
  );
}
