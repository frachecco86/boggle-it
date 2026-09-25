import { House } from 'lucide-react';
import { useAppStore } from '../state/store.js';

interface BackHomeProps {
  /** Destinazione dopo la conferma (default: home). */
  to?: 'home';
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
 * Tasto "torna alla home", nella barra in alto a sinistra, in ogni schermata.
 *
 * Perché un componente condiviso: prima ogni schermata aveva una sua variante
 * ("← Home", "Torna alla home", o nulla). Qui c'è una sola implementazione, con
 * comportamento coerente (uscita dalla stanza, conferma) e **un solo aspetto**.
 *
 * Il tasto è **minimale**: solo l'icona della casa, alta come gli altri comandi
 * della barra (`--topbar-h`), senza etichetta. Il nome resta per chi usa un
 * lettore di schermo o passa il mouse.
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
    <button
      className="back-home"
      type="button"
      onClick={handleClick}
      title="Torna alla home"
      aria-label="Torna alla home"
    >
      <House size={17} aria-hidden />
    </button>
  );
}
