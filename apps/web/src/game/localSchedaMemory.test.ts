/**
 * Memoria LOCALE delle schede già viste.
 *
 * È la copia in `localStorage` della cronologia del profilo, e serve a due cose:
 * il single player OFFLINE (l'app Android senza rete pesca dal bundle, dove il
 * server non può escludere niente) e chi gioca senza profilo. I test tengono
 * dietro a entrambe, più ai due modi in cui questo codice si rompe di solito:
 * storage assente/corrotto e crescita senza limite.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pickScheda, SchedaMemory } from '@boggle/shared';

/*
 * I test del web girano in ambiente Node (nessun jsdom nel repo), quindi si
 * fornisce uno stub di `localStorage` PRIMA di importare i moduli che lo usano.
 */
const memory = new Map<string, string>();
const storageStub = {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => void memory.set(k, v),
  removeItem: (k: string) => void memory.delete(k),
  clear: () => memory.clear(),
};
vi.stubGlobal('localStorage', storageStub);

const { localViewCounts, markLocalSeen, clearLocalSeen } = await import('./localSchedaMemory.js');
const { saveProfile, setActiveProfile } = await import('./profileStore.js');
import type { SavedProfile } from './profileStore.js';

const saved = (id: string): SavedProfile => ({
  id,
  token: `token-${id}`,
  nickname: `Nick ${id}`,
  avatar: '🐱',
  // `profile` è un campo obbligatorio dell'interfaccia; qui interessa solo l'id,
  // che è ciò su cui è keysata la memoria.
  profile: { id } as unknown as SavedProfile['profile'],
});

const pool = (ids: string[]) => ids.map((id) => ({ id }));

beforeEach(() => {
  memory.clear();
});

describe('localSchedaMemory', () => {
  it('senza nulla di salvato la memoria è vuota', () => {
    expect(localViewCounts().size).toBe(0);
  });

  it('conta le VOLTE, non solo «l’ho vista»', () => {
    // È la misura con cui `pickScheda` sceglie la meno vista: un flag non basterebbe.
    markLocalSeen('a');
    markLocalSeen('a');
    markLocalSeen('b');
    expect(localViewCounts()).toEqual(new Map([['a', 2], ['b', 1]]));
  });

  it('ignora l’id vuoto', () => {
    markLocalSeen('');
    markLocalSeen(null);
    markLocalSeen(undefined);
    expect(localViewCounts().size).toBe(0);
  });

  it('la memoria è PER PROFILO: un altro profilo non vede niente', async () => {
    // Stesso telefono, due persone: se la chiave fosse unica, Alice escluderebbe
    // le griglie a Bob.
    saveProfile(saved('alice'));
    markLocalSeen('a');
    saveProfile(saved('bob'));
    expect(localViewCounts().size).toBe(0);
    markLocalSeen('b');
    setActiveProfile('alice');
    expect([...localViewCounts().keys()]).toEqual(['a']);
    setActiveProfile('bob');
    expect([...localViewCounts().keys()]).toEqual(['b']);
    setActiveProfile(null);
    expect(localViewCounts().size).toBe(0);
  });

  it('un JSON corrotto non fa sparire il gioco: si riparte da zero', () => {
    localStorage.setItem('boggle-it.schedaMemory.v1.anonimo', '{non-è-json');
    expect(localViewCounts().size).toBe(0);
    // E si può ancora scrivere sopra.
    markLocalSeen('a');
    expect(localViewCounts().get('a')).toBe(1);
  });

  it('un contatore illeggibile vale una vista', () => {
    localStorage.setItem('boggle-it.schedaMemory.v1.anonimo', JSON.stringify({ a: 'x', b: 4, c: 0 }));
    const counts = localViewCounts();
    expect(counts.get('a')).toBe(1);
    expect(counts.get('b')).toBe(4);
    expect(counts.get('c')).toBe(1);
  });

  it('non cresce all’infinito: dimentica la griglia vista più tempo fa', () => {
    // 800 è il tetto: si scrive poco oltre e si verifica che il più vecchio sia
    // caduto e il più recente sia rimasto.
    for (let i = 0; i < 805; i++) markLocalSeen(`s-${i}`);
    const counts = localViewCounts();
    expect(counts.size).toBe(800);
    expect(counts.has('s-0')).toBe(false);
    expect(counts.has('s-4')).toBe(false);
    expect(counts.has('s-804')).toBe(true);
  });

  it('la pesca offline usa la STESSA regola del server', () => {
    // Il collegamento che tiene insieme i due mondi: i contatori locali finiscono
    // nel livello `player` di una `SchedaMemory`, quindi offline valgono le mai
    // viste e, in mancanza, la somma più bassa.
    markLocalSeen('gia-vista-1');
    markLocalSeen('gia-vista-2');
    markLocalSeen('gia-vista-2');
    const memory2 = new SchedaMemory({ player: localViewCounts() });
    const fresh = pickScheda(pool(['mai-vista', 'gia-vista-1', 'gia-vista-2']), memory2, () => 0);
    expect(fresh?.scheda.id).toBe('mai-vista');
    expect(fresh?.relaxed).toEqual([]);

    // Pool esaurito (succede con 10-15 schede per gruppo): vince la meno vista.
    const again = pickScheda(pool(['gia-vista-1', 'gia-vista-2']), memory2, () => 0);
    expect(again?.scheda.id).toBe('gia-vista-1');
    expect(again?.seenTimes).toBe(1);
  });

  it('clearLocalSeen azzera solo il profilo attivo', () => {
    saveProfile(saved('alice'));
    markLocalSeen('a');
    saveProfile(saved('bob'));
    markLocalSeen('b');
    setActiveProfile('alice');
    clearLocalSeen();
    expect(localViewCounts().size).toBe(0);
    setActiveProfile('bob');
    expect([...localViewCounts().keys()]).toEqual(['b']);
  });
});
