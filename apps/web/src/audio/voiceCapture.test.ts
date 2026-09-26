/**
 * Il worklet di cattura è un ASSET separato: non entra nel bundle e non può
 * importare le costanti condivise. Le ricopia.
 *
 * Questi test esistono per una ragione sola: impedire che le due copie divergano
 * in silenzio. Se qualcuno cambia `VOICE_SAMPLE_RATE` o `VOICE_CHUNK_SAMPLES` nel
 * pacchetto condiviso e non aggiorna il worklet, il server comincerebbe a
 * rifiutare i pacchetti (dimensioni non valide) e la voce smetterebbe di
 * funzionare **in partita**, che è il posto peggiore dove scoprirlo.
 *
 * Il file viene letto come testo (`?raw`): qui interessa quello che contiene, non
 * quello che fa — girerebbe solo dentro un browser con l'audio acceso.
 */
import { describe, expect, it } from 'vitest';
import { VOICE_CHUNK_SAMPLES, VOICE_SAMPLE_RATE } from '@boggle/shared';
import workletSource from './worklets/voice-capture.worklet.js?raw';

describe('worklet di cattura della voce', () => {
  it('usa la stessa frequenza di campionamento del gioco', () => {
    expect(workletSource).toContain(`WORKLET_SAMPLE_RATE = ${VOICE_SAMPLE_RATE}`);
  });

  it('impacchetta gli stessi campioni per blocco', () => {
    expect(workletSource).toContain(`WORKLET_CHUNK_SAMPLES = ${VOICE_CHUNK_SAMPLES}`);
  });

  it('registra il processore con il nome che il client cerca', () => {
    expect(workletSource).toContain("registerProcessor('voice-capture'");
  });

  it('resta autonomo: nessun import nel contesto dei worklet', () => {
    expect(workletSource).not.toMatch(/^\s*import\s/m);
  });

  it('manda il blocco finale prima di confermare la pausa', () => {
    // L'ordine è il contratto con `voiceChat.closeChannel`: prima il pacchetto,
    // poi la conferma. Invertendolo si perderebbe l'ultima sillaba di ogni frase.
    const flush = workletSource.indexOf('this.flush();');
    const ack = workletSource.indexOf("this.port.postMessage('paused')");
    expect(flush).toBeGreaterThan(-1);
    expect(ack).toBeGreaterThan(flush);
  });
});

describe('worklet di cattura: qualità (anti-aliasing)', () => {
  it('filtra prima di decimare: niente semplice media a blocchi', () => {
    /*
     * Regressione: la prima versione faceva la media di 2-3 campioni. A 44,1 kHz
     * il rapporto è 2,756, quindi la finestra cambiava di lunghezza e la voce
     * "gracchiava". Ora deve esserci un filtro a più sezioni e un'interpolazione.
     */
    expect(workletSource).toContain('lowpassBiquad');
    expect(workletSource).toContain('biquad(');
    // Decimazione a fase continua (interpolazione lineare), non a blocchi.
    expect(workletSource).toContain('this.nextAt');
    expect(workletSource).toMatch(/while \(this\.nextAt <= this\.inputIndex\)/);
    // L'alto-passo toglie continua e tonfi.
    expect(workletSource).toContain('highpassPole');
  });

  it('usa due sezioni di passa-basso in cascata (4° ordine)', () => {
    expect(workletSource).toContain('this.lp1');
    expect(workletSource).toContain('this.lp2');
  });
});
