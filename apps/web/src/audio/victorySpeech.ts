/**
 * Voce di vittoria: alla fine della partita una voce femminile annuncia la
 * vincita con una frase diversa ogni volta.
 *
 * Perché la sintesi vocale del browser e non una clip registrata:
 *  - la frase deve contenere il NOME del profilo, che è diverso per ognuno;
 *  - con 20+ frasi servirebbero 20 file audio (peso nell'APK) e comunque non si
 *    potrebbe dire il nome;
 *  - funziona offline e non richiede download.
 *
 * La voce è scelta fra quelle ITALIANE installate sul dispositivo, preferendo i
 * nomi femminili noti (Alice, Federica, Elsa…). Il tono è alzato un po' e la
 * velocità leggermente sostenuta: il risultato è entusiasta, non robotico.
 */

/**
 * Le frasi di vittoria. `{nome}` viene sostituito con il nickname del profilo.
 *
 * Sono volutamente neutre rispetto al genere di chi gioca ("bravissimo" /
 * "bravissima" andrebbero scelti in base al profilo): l'entusiasmo lo porta il
 * tono della voce.
 */
export const VICTORY_PHRASES: readonly string[] = [
  'Complimenti {nome}, hai vinto la partita!',
  'Che partita, {nome}! Sei in cima alla classifica!',
  'Fantastico {nome}! Hai vinto, complimenti davvero!',
  'Vittoria! {nome}, hai giocato alla grande!',
  'Incredibile {nome}, hai lasciato tutti dietro di te!',
  'Complimenti {nome}, questa partita è tua!',
  'Grande {nome}! Nessuno ha trovato più parole di te!',
  'Hai vinto {nome}! Che occhio per le parole!',
  'Vittoria meravigliosa per {nome}, complimenti!',
  'Applausi per {nome}! La partita è tua!',
  'Che velocità {nome}! Hai vinto la partita!',
  'Complimenti {nome}, hai dominato la griglia!',
  '{nome} è in cima alla classifica: vittoria!',
  'Fantastico lavoro {nome}, hai vinto questa partita!',
  'E vai! {nome} porta a casa la partita!',
  'Sei un fenomeno {nome}, complimenti per la vittoria!',
  'Che bella partita {nome}! Hai vinto con stile!',
  'Complimenti {nome}, hai battuto tutti quanti!',
  'Vittoria splendida {nome}! Che soddisfazione!',
  'Grande partita {nome}, sei in vetta a questa sfida!',
  'Parole su parole {nome}, e alla fine hai vinto tu!',
  'Complimenti {nome}, la vittoria è tutta tua!',
] as const;

/** Frase a caso con il nome già inserito. */
export function pickVictoryPhrase(nickname: string, random: () => number = Math.random): string {
  const name = nickname.trim() || 'campione';
  const index = Math.min(
    VICTORY_PHRASES.length - 1,
    Math.max(0, Math.floor(random() * VICTORY_PHRASES.length)),
  );
  return VICTORY_PHRASES[index]!.replaceAll('{nome}', name);
}

/** Indizi nei nomi delle voci femminili più comuni (iOS, Android, Windows, macOS). */
const FEMALE_HINTS = [
  'alice',
  'federica',
  'elsa',
  'silvia',
  'paola',
  'isabella',
  'samantha',
  'lucia',
  'giulia',
  'serena',
  'female',
  'donna',
  'femminile',
];

/**
 * Sceglie la voce femminile italiana migliore fra quelle disponibili.
 *
 * Punteggio: +3 per un nome femminile noto, +2 per le voci "natural"/"premium"
 * (suoni decisamente più umani), +1 per qualsiasi voce italiana. Se non c'è
 * nessuna voce italiana si ritorna `null`: parlerà la voce predefinita, sempre
 * meglio che non parlare affatto.
 */
export function pickFemaleItalianVoice<T extends { name: string; lang: string }>(
  voices: readonly T[],
): T | null {
  const italian = voices.filter((v) => v.lang?.toLowerCase().startsWith('it'));
  if (italian.length === 0) return null;
  let best: T | null = null;
  let bestScore = -1;
  for (const voice of italian) {
    const name = voice.name.toLowerCase();
    let score = 1;
    if (FEMALE_HINTS.some((hint) => name.includes(hint))) score += 3;
    if (name.includes('natural') || name.includes('premium') || name.includes('enhanced')) score += 2;
    if (score > bestScore) {
      best = voice;
      bestScore = score;
    }
  }
  return best;
}

export interface SpeakOptions {
  /** Sostituibile nei test: permette di iniettare un `random` deterministico. */
  random?: () => number;
  /** Volume della voce (0…1). */
  volume?: number;
}

/**
 * Pronuncia la frase di vittoria. Ritorna `false` se il dispositivo non
 * supporta la sintesi vocale (in quel caso non c'è nulla da fare: la vittoria si
 * vede comunque nel podio).
 */
export function speakVictory(nickname: string, options: SpeakOptions = {}): boolean {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false;
  const synth = window.speechSynthesis;
  if (typeof SpeechSynthesisUtterance === 'undefined') return false;

  const text = pickVictoryPhrase(nickname, options.random);

  const speak = () => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'it-IT';
    // Tono alto e ritmo brillante: entusiasta, non da segreteria telefonica.
    utterance.rate = 1.05;
    utterance.pitch = 1.2;
    utterance.volume = options.volume ?? 0.9;
    const voice = pickFemaleItalianVoice(synth.getVoices());
    if (voice) utterance.voice = voice as SpeechSynthesisVoice;
    // Una sola frase per volta: senza `cancel` il podio poteva accodare la
    // frase due volte (doppio render in sviluppo) e parlarne due sovrapposte.
    synth.cancel();
    synth.speak(utterance);
  };

  /*
   * Su alcuni browser `getVoices()` è vuoto al primo giro e si popola dopo
   * l'evento `voiceschanged`. Si aspetta quell'evento, ma non all'infinito: se
   * non arriva entro mezzo secondo si parla comunque con la voce predefinita.
   */
  if (synth.getVoices().length === 0) {
    let done = false;
    const once = () => {
      if (done) return;
      done = true;
      synth.removeEventListener?.('voiceschanged', once);
      speak();
    };
    synth.addEventListener?.('voiceschanged', once);
    window.setTimeout(once, 500);
    return true;
  }

  speak();
  return true;
}
