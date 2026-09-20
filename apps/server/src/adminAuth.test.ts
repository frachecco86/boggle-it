/**
 * Test dell'autenticazione admin.
 *
 * Verifichiamo la logica in isolamento (confronto a tempo costante e sessioni),
 * perché il server completo richiede il dizionario e un database.
 */
import { describe, expect, it } from 'vitest';
import { randomBytes, timingSafeEqual } from 'node:crypto';

/** Replica della funzione usata dal server: confronto a tempo costante. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  const len = Math.max(bufA.length, bufB.length, 1);
  const padA = Buffer.alloc(len);
  const padB = Buffer.alloc(len);
  bufA.copy(padA);
  bufB.copy(padB);
  return timingSafeEqual(padA, padB) && bufA.length === bufB.length;
}

describe('confronto a tempo costante', () => {
  it('accetta stringhe identiche', () => {
    expect(safeEqual('admin', 'admin')).toBe(true);
    expect(safeEqual('olidata1986', 'olidata1986')).toBe(true);
    expect(safeEqual('', '')).toBe(true);
  });

  it('rifiuta stringhe diverse', () => {
    expect(safeEqual('admin', 'Admin')).toBe(false);
    expect(safeEqual('admin', 'admi')).toBe(false);
    expect(safeEqual('admin', 'admin ')).toBe(false);
    expect(safeEqual('password1', 'password2')).toBe(false);
  });

  it('rifiuta lunghezze diverse anche se il prefisso coincide', () => {
    // Il controllo sulla lunghezza è esplicito: senza, il padding renderebbe
    // 'admin' uguale a 'adminXXXX'.
    expect(safeEqual('admin', 'adminXXXX')).toBe(false);
  });

  it('gestisce stringhe vuote', () => {
    expect(safeEqual('', 'a')).toBe(false);
    expect(safeEqual('a', '')).toBe(false);
  });
});

describe('sessioni admin', () => {
  /** Replica della gestione sessioni del server. */
  const SESSION_MS = 12 * 60 * 60 * 1000;
  const sessions = new Map<string, number>();

  const create = () => {
    const token = randomBytes(32).toString('hex');
    sessions.set(token, Date.now() + SESSION_MS);
    return token;
  };
  const valid = (token: string) => {
    const exp = sessions.get(token);
    if (exp === undefined) return false;
    if (exp < Date.now()) {
      sessions.delete(token);
      return false;
    }
    return true;
  };

  it('genera token lunghi e casuali', () => {
    const tokens = new Set(Array.from({ length: 50 }, create));
    expect(tokens.size).toBe(50); // nessuna collisione
    for (const t of tokens) expect(t).toMatch(/^[0-9a-f]{64}$/);
  });

  it('accetta una sessione appena creata', () => {
    const t = create();
    expect(valid(t)).toBe(true);
  });

  it('rifiuta un token inventato', () => {
    expect(valid('deadbeef'.repeat(8))).toBe(false);
    expect(valid('')).toBe(false);
  });

  it('rifiuta una sessione scaduta e la rimuove', () => {
    const t = randomBytes(32).toString('hex');
    sessions.set(t, Date.now() - 1000); // già scaduta
    expect(valid(t)).toBe(false);
    expect(sessions.has(t)).toBe(false); // rimossa
  });

  it('il logout invalida la sessione', () => {
    const t = create();
    expect(valid(t)).toBe(true);
    sessions.delete(t);
    expect(valid(t)).toBe(false);
  });
});
