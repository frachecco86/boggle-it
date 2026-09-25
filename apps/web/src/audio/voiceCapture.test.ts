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
