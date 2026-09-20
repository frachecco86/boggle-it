import { useEffect, useState } from 'react';
import { loadDictionary, type Dictionary } from '@boggle/dictionary';
import { HomeScreen } from './screens/HomeScreen.js';
import { SoloSetupScreen } from './screens/SoloSetupScreen.js';
import { SoloGameScreen } from './screens/SoloGameScreen.js';
import { LobbyScreen } from './screens/LobbyScreen.js';
import { MultiplayerGameScreen } from './screens/MultiplayerGameScreen.js';
import { MultiplayerSummaryScreen } from './screens/MultiplayerSummaryScreen.js';
import { DIFFICULTIES, type Difficulty } from '@boggle/shared';
import { bindSocketEvents, useAppStore } from './state/store.js';
import { SERVER_BASE } from './net/socket.js';
import { audio, installAudioUnlock } from './audio/AudioEngine.js';

export function App() {
  const screen = useAppStore((s) => s.screen);
  const setScreen = useAppStore((s) => s.setScreen);
  const soloDifficulty = useAppStore((s) => s.soloDifficulty);
  const roomDifficulty = useAppStore((s) => s.room?.difficulty);
  const audioSettings = useAppStore((s) => s.audioSettings);
  const [dictionary, setDictionary] = useState<Dictionary | null>(null);
  const [dictError, setDictError] = useState<string | null>(null);

  // Carica il dizionario una sola volta.
  // Con `VITE_DICTIONARY_URL` (es. CDN Netlify) lo prende da li', altrimenti dal server.
  useEffect(() => {
    let cancelled = false;
    const dictBase = import.meta.env.VITE_DICTIONARY_URL ?? `${SERVER_BASE}/dictionary`;
    loadDictionary(dictBase)
      .then((d) => {
        if (!cancelled) setDictionary(d);
      })
      .catch((err: unknown) => {
        if (!cancelled) setDictError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Collega gli eventi Socket.IO allo store.
  useEffect(() => bindSocketEvents(), []);

  // Audio: sblocca il contesto al primo gesto utente e tieni lo store allineato.
  useEffect(() => installAudioUnlock(), []);
  useEffect(() => {
    audio.setSettings(audioSettings);
  }, [audioSettings]);

  /**
   * Tema visivo per difficoltà: sfondo, superfici e accento.
   * In multiplayer vince la difficoltà della stanza; altrimenti quella scelta per il single player.
   */
  const difficulty: Difficulty = roomDifficulty ?? soloDifficulty;
  useEffect(() => {
    const theme = DIFFICULTIES[difficulty].theme;
    const root = document.documentElement;
    root.style.setProperty('--difficulty-bg', theme.background);
    root.style.setProperty('--difficulty-surface', theme.surface);
    root.style.setProperty('--primary', theme.accent);
    root.style.setProperty('--primary-soft', theme.accentSoft);
    root.dataset.difficulty = difficulty;
  }, [difficulty]);

  if (dictError) {
    return (
      <div className="screen">
        <h2 className="screen__title">Dizionario non disponibile</h2>
        <p className="screen__hint">{dictError}</p>
        <p className="screen__hint">
          Avvia il server (<code>pnpm dev:server</code>) oppure genera il dizionario con{' '}
          <code>pnpm build:dict</code>.
        </p>
      </div>
    );
  }

  if (!dictionary) {
    return (
      <div className="loading">
        <div className="loading__spinner" />
        <p>Carico il dizionario italiano…</p>
      </div>
    );
  }

  return (
    <div className="app">
      {screen === 'home' && <HomeScreen />}
      {screen === 'solo-setup' && <SoloSetupScreen onStart={() => setScreen('solo-game')} />}
      {screen === 'solo-game' && <SoloGameScreen dictionary={dictionary} />}
      {screen === 'lobby' && <LobbyScreen />}
      {screen === 'mp-game' && <MultiplayerGameScreen />}
      {screen === 'summary' && <MultiplayerSummaryScreen />}
    </div>
  );
}
