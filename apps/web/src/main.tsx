import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import './styles.css';
import { applyStoredTheme } from './components/ThemeToggle.js';

// Applica il tema salvato PRIMA di renderizzare: evita il lampo bianco
// quando l'utente ha scelto il tema scuro.
applyStoredTheme();

const root = document.getElementById('root');
if (!root) throw new Error('#root non trovato');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
