import { useEffect } from 'react';
import { HomeScreen } from './screens/HomeScreen.js';
import { SoloSetupScreen } from './screens/SoloSetupScreen.js';
import { SoloGameScreen } from './screens/SoloGameScreen.js';
import { SchedaScreen } from './screens/SchedaScreen.js';
import { AdminScreen } from './screens/AdminScreen.js';
import { ProfilesScreen } from './screens/ProfilesScreen.js';
import { ProfileScreen } from './screens/ProfileScreen.js';
import { ChangelogScreen } from './screens/ChangelogScreen.js';
import { LeaderboardScreen } from './screens/LeaderboardScreen.js';
import { WordsScreen } from './screens/WordsScreen.js';
import { VersionBar } from './components/VersionBar.js';
import { ThemeToggle } from './components/ThemeToggle.js';
import { LobbyScreen } from './screens/LobbyScreen.js';
import { MultiplayerGameScreen } from './screens/MultiplayerGameScreen.js';
import { MultiplayerSummaryScreen } from './screens/MultiplayerSummaryScreen.js';
import { DIFFICULTIES, type Difficulty } from '@boggle/shared';
import { bindSocketEvents, useAppStore } from './state/store.js';
import { getActiveProfile } from './game/profileStore.js';
import { audio, installAudioUnlock } from './audio/AudioEngine.js';

/**
 * Radice dell'app.
 *
 * Nota: il client NON scarica più il dizionario (4 MB). Le parole valide arrivano
 * dalle SCHEDE pre-calcolate del server, quindi in avvio non c'è nulla da caricare.
 */
export function App() {
  const screen = useAppStore((s) => s.screen);
  const setScreen = useAppStore((s) => s.setScreen);
  const soloDifficulty = useAppStore((s) => s.soloDifficulty);
  const roomDifficulty = useAppStore((s) => s.room?.difficulty);
  const audioSettings = useAppStore((s) => s.audioSettings);

  // Collega gli eventi Socket.IO allo store.
  useEffect(() => bindSocketEvents(), []);

  /**
   * Idrata il profilo attivo all'avvio.
   *
   * Senza questo, dopo un reload lo store partiva con `sfxUrls` vuoto e `profile`
   * vecchio (dal localStorage): le clip audio NON venivano registrate nel motore
   * audio, quindi l'app le mostrava come mancanti finche' non si cambiava profilo.
   */
  useEffect(() => {
    void useAppStore.getState().switchProfile(getActiveProfile()?.id ?? '');
  }, []);

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

  return (
    <div className="app">
      <ThemeToggle />
      <VersionBar />
      {screen === 'home' && <HomeScreen />}
      {screen === 'solo-setup' && <SoloSetupScreen onStart={() => setScreen('solo-game')} />}
      {screen === 'solo-game' && <SoloGameScreen />}
      {screen === 'scheda' && <SchedaScreen />}
      {screen === 'admin' && <AdminScreen />}
      {screen === 'profiles' && <ProfilesScreen />}
      {screen === 'profile' && <ProfileScreen />}
      {screen === 'leaderboard' && <LeaderboardScreen />}
      {screen === 'words' && <WordsScreen />}
      {screen === 'changelog' && <ChangelogScreen />}
      {screen === 'lobby' && <LobbyScreen />}
      {screen === 'mp-game' && <MultiplayerGameScreen />}
      {screen === 'summary' && <MultiplayerSummaryScreen />}
    </div>
  );
}
