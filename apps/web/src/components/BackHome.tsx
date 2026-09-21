import { useAppStore } from '../state/store.js';

interface BackHomeProps {
  /** Destinazione dopo la conferma (default: home). */
  to?: 'home' | 'solo-setup';
  /** Se true chiede conferma prima di uscire (partita/stanza in corso). */
  confirm?: boolean;
  /**
   * Azione da eseguire prima di cambiare schermata.
   *
   * Serve in multiplayer: uscire dalla stanza non è solo una navigazione, va
   * anche notificato al server (`leaveRoom`). Per questo il tasto non si limita
   * a `setScreen`.
   */
  onLeave?: () => void;
}

/**
 * Tasto "torna alla home" in alto a sinistra, presente in ogni schermata.
 *
 * Perché un componente condiviso: prima ogni schermata aveva una sua variante
 * ("← Home", "Torna alla home", o nulla). Qui c'è una sola implementazione, con
 * etichetta e conferma coerenti.
 */
export function BackHome({ to = 'home', confirm = false, onLeave }: BackHomeProps) {
  const setScreen = useAppStore((s) => s.setScreen);

  const handleClick = () => {
    if (confirm && !window.confirm('Vuoi davvero uscire? I progressi andranno persi.')) {
      return;
    }
    if (onLeave) {
      onLeave();
      // In multiplayer `leaveRoom` porta già alla home: nessun doppio cambio.
      return;
    }
    setScreen(to);
  };

  return (
    <button className="btn btn--ghost back-home" type="button" onClick={handleClick} title="Torna alla home">
      <span aria-hidden>←</span> Home
    </button>
  );
}
