import { VolumeSliders } from './VolumeSliders.js';

/**
 * Audio della home: i tre volumi (effetti, musica, chat vocale) SUBITO visibili.
 *
 * Prima erano dentro un pannello che si apriva toccando "Audio": per alzare la
 * musica bisognava aprire un menù. Ora il blocco è sempre aperto, compatto (una
 * riga per volume, icona + cursore, senza scritte) e sta in alto nella home.
 *
 * I volumi fini stanno qui; in partita lo stesso mixer si alza dal tasto tondo
 * in basso a sinistra (vedi `FloatingControls`), così non serve tornare in home.
 */
export function AudioSettings() {
  return (
    <section className="audio-settings audio-settings--compact" aria-label="Volumi audio">
      <VolumeSliders compact />
    </section>
  );
}
