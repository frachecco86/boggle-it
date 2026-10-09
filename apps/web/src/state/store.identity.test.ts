/**
 * Propagazione di nome e avatar nella stanza (multiplayer).
 *
 * REGRESSIONE: cambiare nome/avatar nella sala d'attesa aggiornava soltanto lo
 * store locale. Il server — unica fonte di `room.players`, da cui vivono la
 * barra avatar in partita, il podio e i risultati — restava all'identità
 * dell'ingresso: in partita si vedevano sempre i valori vecchi.
 *
 * `setNickname`/`setAvatar` devono quindi emettere `room:updateIdentity`, ma
 * solo quando si è davvero in una stanza (l'editore vive anche in home). Il
 * debounce (250 ms) accoda l'invio: si scrive il nome a ogni tasto, non si deve
 * inondare la stanza di broadcast.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const memory = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => void memory.set(k, v),
  removeItem: (k: string) => void memory.delete(k),
  clear: () => memory.clear(),
});

// Finto socket: si osserva cosa lo store emette senza aprire connessioni.
const { emit } = vi.hoisted(() => ({ emit: vi.fn() }));
vi.mock('../net/socket.js', () => ({
  getSocket: () => ({ emit }),
  SERVER_BASE: '',
  SERVER_URL: '',
}));

const { useAppStore } = await import('./store.js');

const baseRoom = {
  code: 'ABC123',
  hostId: 'p1',
  gridSize: 4,
  difficulty: 'normale',
  rounds: 3,
  roundDurationMs: 120_000,
  maxPlayers: 8,
  currentRound: 0,
  phase: 'lobby',
  matchNumber: 1,
  players: [{ id: 'p1', nickname: 'Alice', avatar: '🐱', score: 0, connected: true, isHost: true }],
} as const;

beforeEach(() => {
  emit.mockClear();
  vi.useFakeTimers();
  // Identità anonima: nessun profilo attivo, così `setAvatar` non tenta il
  // salvataggio sul server e la prova resta sul percorso "solo stanza".
  useAppStore.setState({
    roomCode: null,
    playerId: null,
    room: null,
    activeProfileId: null,
    nickname: 'Alice',
    avatar: '🐱',
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('setNickname / setAvatar → room:updateIdentity', () => {
  it('in stanza emette il nuovo nome dopo il debounce', () => {
    useAppStore.setState({ roomCode: 'ABC123', playerId: 'p1', room: baseRoom as never });

    useAppStore.getState().setNickname('Aldo');
    // Il debounce non è ancora scaduto: niente invii.
    expect(emit).not.toHaveBeenCalled();

    vi.advanceTimersByTime(250);
    expect(emit).toHaveBeenCalledWith('room:updateIdentity', { nickname: 'Aldo', avatar: '🐱' });
  });

  it('in stanza emette il nuovo avatar', () => {
    useAppStore.setState({ roomCode: 'ABC123', playerId: 'p1', room: baseRoom as never });

    useAppStore.getState().setAvatar('🦊');
    vi.advanceTimersByTime(250);
    expect(emit).toHaveBeenCalledWith('room:updateIdentity', { nickname: 'Alice', avatar: '🦊' });
  });

  it('una raffica di tasti produce UN solo invio con il valore finale', () => {
    useAppStore.setState({ roomCode: 'ABC123', playerId: 'p1', room: baseRoom as never });

    const { setNickname } = useAppStore.getState();
    setNickname('A');
    setNickname('Al');
    setNickname('Ald');
    setNickname('Aldo');
    vi.advanceTimersByTime(250);

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith('room:updateIdentity', { nickname: 'Aldo', avatar: '🐱' });
  });

  it('nome svuotato: si manda solo l\'avatar, non un nome vuoto', () => {
    useAppStore.setState({ roomCode: 'ABC123', playerId: 'p1', room: baseRoom as never });

    useAppStore.getState().setNickname('   ');
    vi.advanceTimersByTime(250);
    expect(emit).toHaveBeenCalledWith('room:updateIdentity', { avatar: '🐱' });
  });

  it('fuori da una stanza non emette nulla (editore della home)', () => {
    // roomCode/playerId azzerati nel beforeEach.
    useAppStore.getState().setNickname('Aldo');
    useAppStore.getState().setAvatar('🦊');
    vi.advanceTimersByTime(500);
    expect(emit).not.toHaveBeenCalled();
    // Ma lo store locale si aggiorna comunque (single player / home).
    expect(useAppStore.getState().nickname).toBe('Aldo');
    expect(useAppStore.getState().avatar).toBe('🦊');
  });
});
