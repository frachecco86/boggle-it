/**
 * Test della decisione "entra subito dall'invito?".
 *
 * Conta perché è la differenza fra due esperienze opposte: chi ha già un'identità
 * apre il link e si ritrova nella stanza (è il comportamento atteso da un invito);
 * chi non ce l'ha deve poter scegliere il nome prima, altrimenti entrerebbe come
 * "Giocatore" anonimo in una stanza dove lo aspettano con il suo nome.
 *
 * La funzione è pura, quindi si prova senza browser (il progetto non usa jsdom).
 */
import { describe, expect, it } from 'vitest';
import { canAutoJoinFromInvite } from './invite.js';

describe('invito: si entra direttamente?', () => {
  it('con un profilo si entra subito, anche senza nome locale', () => {
    expect(canAutoJoinFromInvite(true, '')).toBe(true);
  });

  it('con un nome salvato nel dispositivo si entra subito, anche senza profilo', () => {
    expect(canAutoJoinFromInvite(false, 'Margherita')).toBe(true);
  });

  it('senza profilo e senza nome NON si entra: prima si sceglie come chiamarsi', () => {
    expect(canAutoJoinFromInvite(false, '')).toBe(false);
  });

  it('un nome di soli spazi non conta come identità', () => {
    expect(canAutoJoinFromInvite(false, '   ')).toBe(false);
    expect(canAutoJoinFromInvite(false, '\t\n')).toBe(false);
  });
});
