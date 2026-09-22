/**
 * Versioni dell'app e note di rilascio.
 *
 * Ogni release ha un numero (`0.x.y`) e le funzionalità introdotte, descritte in
 * linguaggio tecnico ma leggibile dall'utente: cosa è cambiato e perché.
 *
 * Convenzione (SemVer adattato):
 *  - **major** `1.x`: stabile per il pubblico.
 *  - **minor** `x.N`: nuove funzionalità retro-compatibili.
 *  - **patch** `x.y.N`: correzioni e rifiniture.
 */

export const APP_VERSION = '0.17.0';

export interface ReleaseEntry {
  version: string;
  date: string;
  title: string;
  /** Sezioni: tipo di modifica → elenco di voci. */
  changes: Array<{
    kind: 'feature' | 'improvement' | 'fix' | 'tech';
    items: string[];
  }>;
}

/**
 * Cronologia delle versioni, dalla più recente.
 * Le voci tecniche (tipo `tech`) spiegano le scelte di implementazione.
 */
export const RELEASES: ReleaseEntry[] = [
  {
    version: '0.17.0',
    date: '2026-09-22',
    title: 'Riepilogo arcade, classifica separata e countdown a ogni round',
    changes: [
      {
        kind: 'feature',
        items: [
          '**Riepilogo di fine round in stile arcade.** In multiplayer, a fine round i concorrenti compaiono in basso con avatar e foto, e le parole indovinate si **accendono una alla volta** seguendo la timeline **reale** di quando sono state trovate, come se la partita venisse ripercorsa a velocità sostenuta. Il punteggio di ognuno si **accumula** fino al totale del round, con un suono a ogni scoperta e un accordo finale. Si può **saltare** con un tasto e passare al riepilogo completo. Le parole trovate da un solo giocatore restano marcate **×2**.',
          '**Classifica separata fra single player e multiplayer.** In alto nella pagina Classifica ci sono tre tab — *Da solo*, *Con altri*, *Tutte* — e cambiano il senso di tutti i numeri sottostanti. La classifica **Totali** ora è disponibile anche per il multiplayer (prima sommava solo le partite in solitaria).',
        ],
      },
      {
        kind: 'improvement',
        items: [
          '**Countdown 3-2-1 a ogni round**, non solo al primo: è parte del ritmo del gioco, come nel Boggle originale. Vale sia in single player sia in multiplayer; il timer del round parte solo alla fine del conto alla rovescia, quindi i secondi di gioco non si consumano.',
          "**Swipe più stabile: le lettere non si accendono più 'sfiorando il pixel'.** La soglia per attivare una cella era *sotto* il confine geometrico fra due caselle, quindi la cella vicina si accendeva prima che il dito uscisse da quella corrente. Ora si deve superare il confine con un margine, l'annullamento dell'ultimo passo richiede un movimento indietro più deciso (isteresi vera: accendere è facile, spegnere no) e i **micro-movimenti del dito vengono accumulati** invece di essere valutati uno per uno. Risultato: niente accensioni né spegnimenti improvvisi mentre si striscia sul bordo, e i tremolii non fanno più 'sfarfallare' le lettere.",
        ],
      },
      {
        kind: 'fix',
        items: [
          "**Il suono degli ultimi secondi ora si sente davvero.** Prima era una sinusoide debolissima (~0,03 di volume effettivo): impercettibile su un telefono o sotto la musica. Ora è un **campanello** con due parziali e un attacco netto, chiaramente udibile ma sotto le esultanze delle parole, così non le copre. Rispetta sempre il muto.",
        ],
      },
      {
        kind: 'tech',
        items: [
          'La timeline del round viene **ricostruita sul server** come offset dall\'inizio del round (non timestamp assoluti): il client non deve conoscere l\'orologio del server né compensare la latenza.',
          'La pianificazione del replay è **logica pura e testata** (`game/replay.ts`): rispetta l\'ordine cronologico reale, comprime la timeline in una finestra breve, impone una spaziatura minima fra le parole e ha tetti di sicurezza (mai oltre ~18 s) per non bloccare il round successivo.',
          'Lo swipe ha ora un\'**isteresi garantita a livello di configurazione**: il tracker corregge da sé una combinazione di parametri che renderebbe lo spegnimento facile quanto l\'accensione, quindi il difetto non può rientrare da una futura messa a punto.',
          'La timeline è **retro-compatibile**: i round senza timeline (o le partite registrate prima di questa versione) mostrano direttamente il riepilogo classico, senza animazione.',
        ],
      },
    ],
  },

  {
    version: '0.16.1',
    date: '2026-09-22',
    title: 'Più parole valide, tag corretti e feedback negli ultimi 10 secondi',
    changes: [
      {
        kind: 'fix',
        items: [
          "**Parole come `cerva`, `cerve`, `abache`, `abachi` ora sono valide.** Erano forme regolari di una voce attestata (`cervo`), ma non avevano una voce propria su Wikizionario: il filtro le scartava. Recuperate **13.895 parole** collegate al lemma di origine. Il lessico passa da 354.318 a **368.213** voci.",
          '**Rimosse 717 voci che non sono parole italiane**: nomi propri e sigle come `pli`, `abi`, `zenga`, `agca`. Restano invece i nomi con uso reale (`roma`, `carlo`, `cina`), perché la regola esclude solo chi non è attestato da nessuna fonte.',
          "**Tag più chiari**: `imi` non è più mostrato come `n.pr agg` ma come **`agg n.pr`** (la categoria grammaticale prima del nome proprio). Vale per tutte le 7.746 parole con tag multiplo.",
        ],
      },
      {
        kind: 'improvement',
        items: [
          '**I tag grammaticali restano affidabili** (99,5% di copertura) anche per le 14k parole recuperate: ereditano la categoria del lemma da cui derivano.',
        ],
      },
      {
        kind: 'feature',
        items: [
          '**Feedback sonoro negli ultimi 10 secondi del round**: un tick leggero per ogni secondo, con tono e volume crescenti. È discreto — un promemoria, non un allarme — e si sente senza coprire la musica né le parole trovate. Vale sia in single player sia in multiplayer, e rispetta il muto.',
        ],
      },
      {
        kind: 'tech',
        items: [
          'Il file di Wikizionario ora include anche le **forme dei paradigmi** (`cervo` → `cervi`, `cerva`, `cerve`), non solo le voci autonome: è ciò che rende riconoscibili le flessioni che il dump non elenca come voci.',
          'Le forme di paradigma entrano nell\'indice con la categoria del loro lemma, così la copertura dei tag non cala.',
        ],
      },
    ],
  },

  {
    version: '0.16.0',
    date: '2026-09-22',
    title: 'Una sola lista di parole, 3 livelli, difficoltà misurata in parole',
    changes: [
      {
        kind: 'fix',
        items: [
          '**`tua` (e `per`, `sul`, `del`, `nel`, `non`) ora si possono trovare.** Erano nel dizionario ma **escluse da ogni scheda** da una lista separata di "parole funzionali": il gioco le rifiutava sempre. Ora il dizionario e le schede usano **una sola lista** di parole giocabili.',
          '**Rimosse 48.376 parole che il gioco non accettava mai**: erano troncamenti delle fonti (`andar`, `alzar`, `maggior`, `normalit`) e abbreviazioni. Il lessico scende da 403.393 a 355.027 voci, ma ora **ogni voce è davvero giocabile** (verificato: 0 incoerenze).',
          '**Il Dizionario non è più vuoto in produzione.** L\'indice dei tag e dei link (`word-index.br`) non veniva generato né copiato nel build di deploy: la vista Dizionario mostrava 0 parole. Ora il build lo produce anche offline.',
          '**I tag grammaticali ora sono corretti in produzione**: prima ogni parola risultava `n.c.` (non classificata) perché il build di deploy rigenerava l\'indice senza Morph-it. L\'indice con i tag pieni è ora versionato e il build offline non lo sovrascrive più.',
          '**Rimosse 732 voci che non sono parole italiane** (nomi propri e sigle come `pli`, `abi`, `zenga`, `agca`): venivano da Morph-it, che le marca come nomi propri. Restano i nomi con uso reale e voce di dizionario (`adamo`, `cina`, `carlo`), perché la regola esclude solo chi non è attestato da nessuna fonte.',
        ],
      },
      {
        kind: 'feature',
        items: [
          '**La difficoltà ora è il numero di parole trovabili**, come richiesto: non più "quante vocali". I 5 livelli diventano **3** (Facile / Normale / Difficile) con bande di parole e punteggio misurate. Su 4×4: circa **126 / 59 / 28** parole di media.',
          '**Schede molto più ricche dove serve**: il livello Facile passa da ~27 a ~126 parole su 4×4. Le griglie facili non sono più simili a quelle difficili (prima 27 vs 32: indistinguibili).',
          '**20 schede per categoria** (180 in tutto: 3 dimensioni × 3 livelli). Rigenerabili con `pnpm gen:schede`.',
        ],
      },
      {
        kind: 'tech',
        items: [
          'I criteri di qualità sono ora **densità di parole + punteggio massimo**, con verifica automatica (`pnpm --filter @boggle/server verify:schede`): tutte le 180 schede passano, nessuna violazione.',
          'Il verificatore segnala anche le schede fuori banda prodotte dal criterio di ripiego del generatore, così un catalogo incoerente non passa inosservato.',
        ],
      },
    ],
  },

  {
    version: '0.15.0',
    date: '2026-09-22',
    title: 'Dizionario verificato, schede equilibrate, pagina Parole a due viste',
    changes: [
      {
        kind: 'feature',
        items: [
          "**Pagina Parole a due viste**: *Nelle schede* mostra le parole che si possono davvero comporre nel gioco (con in quante schede compaiono), *Dizionario* mostra tutto il lessico accettato. Ogni parola ha il **tag grammaticale** (`sost`, `verb`, `agg`, …) e un **link alla voce di Wikizionario** che ne ha una (45.227 parole).",
          "**Sfoglia le schede** ora è un elenco filtrabile: per griglia, difficoltà e taglia del punteggio, con ordinamento per **punteggio massimo**, parola più lunga o numero di parole. L'elenco mostra subito punteggio, parole e taglia, e si apre la scheda che interessa.",
          'Un **box informativo** (icona `?`) spiega come nascono le schede (i cinque criteri) e come leggere i tag delle parole, senza lasciare la pagina.',
        ],
      },
      {
        kind: 'improvement',
        items: [
          '**Punteggio massimo ora prevedibile entro la stessa difficoltà**: la variabilità scende dal 34–59% al **5–19%** di scarto. Su 4×4 facile ora si va da 40 a 74 punti, prima da 117 a 870 (7 volte tanto).',
          "**I livelli facili usano davvero parole facili**: *molto facile* e *facile* accettano solo il lessico di uso comune, quindi il 100% delle parole è comune (prima ~42%: capitava `contumace` in mezzo a `casa`).",
          '**Rigenerate tutte le 750 schede** (50 per ognuna delle 15 combinazioni) con i nuovi criteri.',
        ],
      },
      {
        kind: 'fix',
        items: [
          '**Rimosse 96.436 parole inesistenti** dal dizionario: voci come `ato`, `acta`, `agfa`, `baili` entravano da una lista senza analisi grammaticale. Ora ogni parola è una voce attestata di dizionario, e `broccolo`, `anta`, `alce`, `tris` restano tutte giocabili.',
          "**L'esultanza degli avversari in multiplayer ora suona la LORO registrazione**, non quella di chi ascolta: era il bug per cui si sentiva sempre la propria clip. Volume a metà.",
        ],
      },
      {
        kind: 'tech',
        items: [
          'Nuovo comando **`pnpm --filter @boggle/server verify:schede`** che controlla le schede contro i criteri dichiarati (con `--measure` per rigenerare griglie di prova, `--verbose` per il dettaglio). Esce con codice 1 se trova violazioni, quindi è utilizzabile in CI.',
          'I criteri vivono in un solo posto (`schedaGen.ts`) e vengono letti sia dal generatore sia dal verificatore, così non possono disallinearsi. È stato proprio il verificatore a scoprire due difetti reali: soglie di lunghezza irrealistiche e un lessico "comune" calcolato in modo diverso fra le due parti.',
          'I tag grammaticali arrivano da **Morph-it!** (Università di Bologna) e **Wikizionario** (dump kaikki.org), coprendo il **99%** delle parole. Il dato sta in un indice compresso (~800 KB) caricato dal server.',
        ],
      },
    ],
  },

  {
    version: '0.14.1',
    date: '2026-09-21',
    title: 'In multiplayer si sente il suono personale dell\'avversario',
    changes: [
      {
        kind: 'fix',
        items: [
          '**Corretto**: quando un avversario trovava una parola si sentiva sempre la registrazione del profilo **loggato su quel dispositivo**, mai la sua. Ora si sente la **clip audio dell\'avversario**, a **metà volume**: la sua voce personale resta riconoscibile e distinta dalla tua.',
        ],
      },
      {
        kind: 'feature',
        items: [
          '**Le clip audio personali viaggiano con la partita**: entrando in una stanza il dispositivo scarica le registrazioni degli altri giocatori (una volta sola, ~12 KB per fascia) e le tiene pronte. Chi non ha registrato nulla continua a far sentire il suono sintetizzato.',
        ],
      },
      {
        kind: 'tech',
        items: [
          'Le registrazioni restano **private**: il server le espone solo a chi condivide la stanza con il proprietario, non a chi conosce l\'id del profilo. In `PlayerPublic` viaggia solo l\'elenco delle fasce registrate (`sfxSlots`), non il contenuto.',
          'Il motore audio tiene due banche separate, le clip del profilo attivo e quelle degli avversari: il fallback — quando l\'avversario non ha registrato quella fascia — usa il motivo sintetizzato e **mai** la clip di chi ascolta.',
        ],
      },
    ],
  },

  {
    version: '0.14.0',
    date: '2026-09-21',
    title: 'Vocabolario molto più ampio e notifiche degli avversari',
    changes: [
      {
        kind: 'feature',
        items: [
          '**Notifiche degli avversari**: quando un altro giocatore trova una parola compare in basso una scheda con la sua **foto (o avatar)**, il nome, la lunghezza della parola e i punti, che **sfuma dopo pochi secondi**. Insieme al suono, rende immediato capire chi sta segnando senza guardare la classifica.',
        ],
      },
      {
        kind: 'improvement',
        items: [
          '**Il vocabolario passa da 389.000 a 500.000 parole** (+110.000). Mancavano **sostantivi comunissimi** come `anta`, `broccoli`, `spinaci`, `aspirapolvere`, `abaco`: non erano componibili nelle griglie. La causa era la fonte principale, Morph-it, che è un **analizzatore morfologico** (391.000 forme verbali ma solo 35.000 sostantivi): copriva benissimo i verbi e male i nomi concreti. Aggiunta una terza lista di parole. Nelle schede le parole distinte crescono del **30%** (24.020 → 31.252).',
          '**Rimosse le volgarità** dal dizionario: erano 85, ora **0**. Il gioco è per famiglie e una parola in griglia la vedono tutti. La lista di esclusione (`blocked-words.txt`) è versionata e modificabile.',
          '**L\'esultanza degli avversari ora si sente davvero**: era a volume 0.35×, che moltiplicato per il volume degli effetti (~0.6) scendeva a ~0.04 — impercettibile su un telefono. Portata a 0.7×: distinta ma udibile.',
          '**L\'anteprima della parola ha altezza fissa** (64px): prima cresceva quando si iniziava a comporre e, con le parole lunghe, andava a capo su due righe, spostando la griglia verso il basso proprio mentre si gioca. Ora il carattere si rimpicciolisce per le parole lunghe e la griglia non si muove mai (verificato: posizione invariata con 7 lettere).',
        ],
      },
      {
        kind: 'fix',
        items: [
          'Corretto un difetto introdotto nella versione precedente: la vibrazione del telefono era dentro il ramo della clip audio personale, quindi **non scattava** per chi non aveva registrato suoni propri.',
        ],
      },
      {
        kind: 'tech',
        items: [
          'Il filtro delle volgarità agisce in fase di **build**, non a runtime: una parola bloccata non entra proprio nel dizionario né nelle schede. Nessun costo a giocare.',
          'Le schede sono state **rigenerate** con il nuovo dizionario. Verificato che tutte le 360 siano valide: griglia coerente con la dimensione, parole di almeno 3 lettere, parola più lunga corretta, 0 volgarità.',
          'La lista estesa (3 MB) non è versionata: serve solo a rigenerare il dizionario con `pnpm fetch` + `build:full`, mentre le sue parole sono già dentro `words.br`, che è versionato e rende i deploy riproducibili offline.',
        ],
      },
    ],
  },

  {
    version: '0.13.0',
    date: '2026-09-21',
    title: 'Swipe più tollerante, frecce stile Boggle e classifica multiplayer',
    changes: [
      {
        kind: 'improvement',
        items: [
          '**Lo swipe è molto più tollerante**: prima bastava **sfiorare** una cella di pochi pixel per attivarla e, muovendosi in diagonale, il dito scivolava spesso sulla cella ortogonale. Ora la soglia per cambiare cella è quasi **metà cella** (era un quarto) e i settori diagonali sono più larghi (±25° invece di ±20°): il gesto diagonale resta diagonale anche se non è perfetto.',
          '**L\'accensione delle lettere è più morbida**: la cella si accende in ~0.3s con una dissolvenza, invece dello scatto immediato di prima. Rimosso anche l\'effetto "pop" che faceva sobbalzare la lettera.',
          '**I collegamenti sono frecce**, come nel Boggle originale: piccoli segmenti tra una lettera e la successiva, con una punta proporzionata. Prima era un\'unica linea luminosa che passava sopra le lettere.',
          '**La parola in composizione appare sopra la griglia** mentre la scrivi, come nel Boggle: vedi in tempo reale cosa stai per inviare.',
          'I **messaggi delle parole durano di più** (~2.6s) e compaiono con uno **slide up/down** invece di un pop istantaneo.',
          '**Niente più movimenti della pagina durante il gioco**: l\'elenco delle parole trovate è stato sostituito da un **contatore ad altezza fissa**. Prima la card cresceva a ogni parola trovata, allungando la pagina e facendo comparire/sparire la barra di scorrimento proprio mentre si gioca.',
        ],
      },
      {
        kind: 'feature',
        items: [
          '**Le partite multiplayer entrano in classifica**: prima solo il single player veniva registrato, quindi giocare con gli amici non produceva né partite né statistiche. Ora a fine partita il server salva una riga per ogni giocatore con profilo.',
          '**Tasto Home in ogni schermata**, in alto a sinistra. Durante una partita o in una stanza chiede conferma prima di uscire, per non perdere i progressi.',
          '**Tre icone audio in basso a sinistra**, sempre disponibili: effetti sonori on/off, musica on/off e **traccia successiva** (se la musica era spenta, la riattiva).',
          '**L\'admin può caricare MP3** dal pannello: le tracce vanno sul server e compaiono nella playlist di **tutti** i giocatori, insieme a quelle incluse.',
          '**Le statistiche personali sono complete**: l\'elenco di **tutte le parole trovate** raggruppate per lunghezza, i numeri **separati fra single player e multiplayer** (una partita in otto dipende dagli avversari: mescolarla con quella in solitaria rende i numeri poco leggibili) e lo **storico delle partite recenti**.',
          '**Le esultanze degli altri giocatori si sentono** in multiplayer, a **volume ridotto**: quando un avversario trova una parola senti il suo motivo — più lungo per le parole lunghe. Così capisci come sta andando la partita a colpo d\'orecchio, senza guardare la classifica.',
        ],
      },
      {
        kind: 'fix',
        items: [
          '**Le registrazioni audio ora si sovrascrivono davvero**: una riregistrazione poteva lasciare attiva la clip vecchia. La causa era una combinazione di blob URL non revocati e risposte in cache; ora il vecchio blob viene liberato e la nuova clip ha un URL versionato. In più, al salvataggio compare una conferma "✓ salvato" e, se qualcosa va storto, il motivo reale.',
          '**Non si vedono più le parole trovate mentre si gioca**: l\'elenco rivelava le soluzioni (e in multiplayer le esponeva). Durante il round si vede solo il **numero** di parole trovate; l\'elenco completo arriva nel riepilogo di fine round.',
          '**Il salvataggio della partita non fallisce più in silenzio**: a fine partita il riepilogo dice se la partita è entrata in classifica, se serve un profilo o se il server non ha risposto.',
          '**Foto profilo semplificata**: rimossi gli stili AI e i filtri. Si scegli un\'immagine e viene ritagliata al centro a 256×256. Erano opzioni che non servivano al gioco e pesavano **8 MB** di modello scaricato dal dispositivo.',
        ],
      },
      {
        kind: 'tech',
        items: [
          'Il riconoscimento delle celle ora valuta l\'annullamento dell\'ultimo passo **solo sull\'ultimo campione** del segmento: i campioni interpolati potevano far aggiungere e togliere più volte la stessa cella nello stesso movimento.',
          'Il catalogo musicale è diventato **dinamico**: le tracce dell\'admin hanno id `up-…` e sono servite da `/music/:id/file` (gli id non sono più un elenco chiuso nel codice).',
          'La leaderboard "totali" continua a contare **solo il single player**: i punteggi multiplayer non sono confrontabili perché dipendono dagli avversari.',
          'Nuovo `POST /admin/games/reset` per azzerare la classifica senza toccare profili e schede.',
          'Rimosso `onnxruntime-web`: il bundle JavaScript passa da **754 KB a 335 KB** e non si scarica più nessun modello AI. Eliminati anche i file `.wasm` e il plugin di build che li scartava.',
          '**Le parole trovate ora vengono salvate** in una tabella dedicata (`game_words`): prima il database registrava solo il NUMERO di parole, quindi le statistiche non potevano elencarle. La migrazione è automatica e non tocca i dati esistenti; per le partite già registrate la parola più lunga continua a leggersi dalla colonna `longest`.',
        ],
      },
    ],
  },

  {
    version: '0.12.1',
    date: '2026-09-20',
    title: 'Recuperate parole valide che finivano in vocale accentata',
    changes: [
      {
        kind: 'fix',
        items: [
          'Parole come **fruirà**, **città**, **verità**, **società** e tutti i futuri in -erà/-irà non erano riconosciute. La causa era un **errore di codifica**: il dizionario di partenza è in formato Latin-1, ma veniva letto come UTF-8, quindi gli accenti si corrompevano e le forme accentate andavano perse. Recuperate **2.433 parole**.',
          'Un secondo filtro scartava per errore le parole che **finiscono in vocale accentata**, per un\'ipotesi sbagliata sul funzionamento della normalizzazione: scartava futuri e nomi propri. Rimosso.',
          'Le schede sono state rigenerate: le parole totali passano da 73.006 a **77.416**.',
        ],
      },
      {
        kind: 'tech',
        items: [
          'Aggiunto un commento esplicito sull\'encoding nel punto critico: è la seconda volta che questo file causa un problema per la codifica.',
        ],
      },
    ],
  },

  {
    version: '0.12.0',
    date: '2026-09-20',
    title: 'Punteggio salvato correttamente, elenco completo delle parole, tema scuro',
    changes: [
      {
        kind: 'fix',
        items: [
          '**Il punteggio ora entra in classifica e nel profilo**: prima non ci arrivava per tre difetti combinati. Il **totale contava due volte l\'ultimo round** (con 2 round da 50 e 30 punti dava 110 invece di 80), il punteggio dell\'ultimo round **non veniva salvato** quando la partita finiva, e la registrazione poteva partire con i dati **ancora incompleti**.',
        ],
      },
      {
        kind: 'feature',
        items: [
          'A fine round e a fine partita vedi **tutte le parole della scheda**: quelle trovate con una spunta verde, quelle mancate in tono attenuato. Puoi filtrare per lunghezza (con il conteggio "trovate su totali") e nascondere le mancate. Vedi anche la percentuale di completamento.',
          '**Tema scuro**, attivabile dall\'interruttore in alto a sinistra (🌙/☀️). La scelta viene ricordata; al primo avvio si segue la preferenza del sistema operativo.',
        ],
      },
    ],
  },

  {
    version: '0.11.0',
    date: '2026-09-20',
    title: 'Punteggi premiati per le parole lunghe, countdown e trail allineato',
    changes: [
      {
        kind: 'fix',
        items: [
          '**Punteggio corretto**: le parole lunghe valgono finalmente quanto meritano. Prima la formula era piatta (1 punto ogni 3 lettere) e una parola da 9 lettere valeva **3 punti**, come tre parole da 3. Ora si usa la regola classica del Boggle, **lunghezza − 2**: 3→1, 5→3, 7→5, **9→7**, 10→8. Su una scheda 5×5 il punteggio massimo passa da 155 a **328 punti**.',
          '**Trail dello swipe allineato**: la scia luminosa era spostata di ~13px rispetto alle lettere. L\'errore si notava sulle diagonali verso **sinistra**, dove lo scostamento è perpendicolare alla linea, e quasi per niente su quelle verso destra, dove corre lungo la linea. Ora il disegno usa lo stesso sistema di coordinate delle celle.',
        ],
      },
      {
        kind: 'feature',
        items: [
          '**Countdown di inizio round** con animazione e suoni: ogni numero compare con uno scatto, un anello si riempie e un tick sonoro accompagna 3-2-1, poi un accordo ascendente per **VIA!**. C\'è anche in single player, dove prima si partiva subito.',
          '**Pannello Regole e punteggi** prima della partita: spiega come si gioca e mostra le fasce di punteggio reali, derivate dal codice (non scritte a mano, così non possono divergere). In multiplayer include la regola del **raddoppio** per le parole trovate da un solo giocatore.',
        ],
      },
      {
        kind: 'tech',
        items: [
          'La formula del punteggio è ora **centralizzata**: una copia hardcoded in un endpoint è stata eliminata. Era lo stesso tipo di problema già visto con la validazione delle difficoltà: due copie che possono divergere.',
          'Le regole nel pannello sono generate da `scoreForWord`, quindi se la formula cambia, il testo si aggiorna da solo.',
        ],
      },
    ],
  },

  {
    version: '0.10.1',
    date: '2026-09-20',
    title: 'L\'anteprima non rivela più la parola più lunga',
    changes: [
      {
        kind: 'fix',
        items: [
          'Nell\'anteprima della scheda la **parola più lunga** non viene più mostrata: sapere che la soluzione è `BOSCAIOLI` la regalava. Ora si vede solo il **numero di lettere** ("parola più lunga: 9 lettere"), così sai cosa aspettarti senza ricevere la risposta.',
          'La correzione è anche **lato server**: la parola non è più nella risposta dell\'API. Mostrarla solo meno nella UI non bastava — chiunque può leggere la risposta dalla console del browser.',
        ],
      },
    ],
  },

  {
    version: '0.10.0',
    date: '2026-09-20',
    title: 'Anteprima della scheda con statistiche, record e filtro parole',
    changes: [
      {
        kind: 'feature',
        items: [
          '**Anteprima della scheda** prima di giocare: vedi la griglia reale e cosa aspettarti — quante parole, quante per ogni lunghezza (con barre), il **punteggio massimo** realizzabile e il **record** su quella scheda con chi lo detiene.',
          'Pulsante **"🎲 Cambia scheda"**: se una scheda non ti convince, ne peschi un\'altra prima di iniziare.',
          'L\'anteprima funziona anche in **multiplayer**: l\'host sceglie la scheda in lobby, tutti la vedono (griglia e statistiche) e si gioca quella. Nessuno è sorpreso.',
          'Nel catalogo **Parole** c\'è ora il filtro **"Solo le parole della scheda in corso"**: sai subito se una parola vale nella partita che stai giocando.',
        ],
      },
      {
        kind: 'fix',
        items: [
          'Corretto un problema per cui le schede generate dall\'admin potevano **sparire al riavvio**: venivano aggiunte in memoria PRIMA di essere scritte su disco, quindi se la scrittura falliva la scheda restava solo in memoria. Ora si scrive prima su disco.',
          'Corretto l\'errore poco chiaro quando la scrittura fallisce: ora dice esplicitamente se è un problema di permessi e cosa controllare.',
          'La generazione di più schede scriveva il file **60 volte tanto** (49 MB invece di 0,8 MB per 100 schede): ora scrive in blocco.',
        ],
      },
      {
        kind: 'tech',
        items: [
          'Chiarita la confusione sul numero accanto alle parole: indica **in quante schede** appare la parola, non se vale in quella in corso. Il filtro risolve il dubbio.',
          'Nuovo endpoint `GET /schede/:id/stats` con statistiche, punteggio massimo e record. Il record usa `scheda_id`, già salvato nel database.',
        ],
      },
    ],
  },

  {
    version: '0.9.1',
    date: '2026-09-20',
    title: 'Admin con utente e password, generazione schede dall\'app',
    changes: [
      {
        kind: 'feature',
        items: [
          'Il pannello **Admin** ora si apre con **utente e password** invece di un token. Da lì si generano nuove schede (dimensione, difficoltà, quante) senza toccare il codice: finiscono subito nel catalogo, per tutti.',
        ],
      },
      {
        kind: 'tech',
        items: [
          'Le credenziali stanno in **variabili d\'ambiente** (`ADMIN_USER`, `ADMIN_PASSWORD`), non nel codice: il repository è pubblico e una password scritta nel sorgente sarebbe leggibile da chiunque.',
          'La password viaggia **una volta sola**: il login restituisce un token di sessione valido 12 ore, che viene usato per le richieste successive. Il confronto è a **tempo costante**, per non rivelare la password dai tempi di risposta.',
          'Le schede generate vengono salvate nella cartella `data/schede-extra/` (sul volume): **sopravvivono ai riavvii** e si sommano a quelle incluse nel repo.',
          'Se `ADMIN_USER`/`ADMIN_PASSWORD` non sono impostati, le rotte admin rispondono **503**: meglio un admin disabilitato che uno aperto per dimenticanza. Il vecchio `ADMIN_TOKEN` resta accettato.',
        ],
      },
    ],
  },

  {
    version: '0.9.0',
    date: '2026-09-20',
    title: 'Estremo, 5 livelli, punteggio rinnovato e sfida a 2',
    changes: [
      {
        kind: 'feature',
        items: [
          'Nuovo livello **Estremo**: pochissime vocali e molte consonanti rare, per chi vuole il massimo. Cinque livelli in tutto: molto facile, facile, normale, difficile, estremo.',
          '**Sfida a 2**: in lobby l\'host sceglie il numero massimo di giocatori (2, 4 o 8). Con 2 il terzo giocatore viene rifiutato con "stanza piena".',
          'Ogni scheda ora contiene **una parola per ogni lunghezza**: 4×4 → 5-7 lettere, 5×5 → 5-9, 6×6 → 5-10. Le schede 6×6 arrivano a 12 lettere.',
        ],
      },
      {
        kind: 'improvement',
        items: [
          '**Punteggio**: 1 punto ogni 3 lettere (prima era lunghezza − 2). 3-5 lettere = 1 punto, 6-8 = 2, 9-11 = 3, 12+ = 4.',
          'Le schede usano il **dizionario completo** (387k forme) invece del lessico comune: parole comunissime come `vota`, `votare`, `cliccare`, `condividere` non erano componibili perché mancavano dal lessico ridotto.',
          'Escluse le **parole funzionali** (articoli, preposizioni, congiunzioni): non ha senso trovare `il` o `nel` in una griglia.',
        ],
      },
      {
        kind: 'fix',
        items: [
          'Corretto un bug per cui il livello **Estremo** veniva rifiutato e la partita partiva come "normale": il server aveva una copia locale della validazione con l\'elenco hardcoded, che non era stata aggiornata. Ora usa la funzione condivisa.',
          'Corretto un bug per cui le parole funzionali nella lista bianca (`con`, `col`) entravano comunque nelle schede: la lista veniva aggiunta dopo il filtro.',
        ],
      },
      {
        kind: 'tech',
        items: [
          'Schede: 360 totali (24 per ognuna delle 15 combinazioni dimensione × difficoltà).',
          'Filtro dei troncamenti verificato: 0 parole funzionali residue su 73.000 parole, 0 schede fuori dai requisiti di lunghezza.',
        ],
      },
    ],
  },

  {
    version: '0.8.0',
    date: '2026-09-20',
    title: 'Catalogo delle parole e filtro dei troncamenti corretto',
    changes: [
      {
        kind: 'feature',
        items: [
          'Nuova voce **Parole** nella barra in alto: tutte le parole componibili, con quante volte compaiono nelle schede. Ordinabili per **occorrenze**, **lunghezza** o **alfabetico**, con ricerca e filtri per dimensione e difficoltà.',
          'Grafico della **distribuzione per lunghezza**: cliccando una barra si filtra per quella lunghezza.',
        ],
      },
      {
        kind: 'fix',
        items: [
          'Corretto il filtro che scartava parole valide: `tic`, `con`, `far`, `mar`, `sol`, `bar`, `film`, `gol` non erano più accettate perché finiscono in consonante. Ora la lista delle finali ammesse è **1068 voci** invece di 171, generata dal **lemma** di Morph-it (criterio linguistico) invece che da una lista a mano.',
          'Escluse le **parole funzionali** (`il`, `in`, `del`, `nel`, `non`): non ha senso "trovare" un articolo in una griglia.',
          'Esclusi versi (`ahhh`), sigle (`btp`, `ccd`), interiezioni (`boh`) e composti giornalistici (`antibush`, `anticlinton`).',
        ],
      },
      {
        kind: 'tech',
        items: [
          'Le schede scendono da 1200 a **300** (25 per ognuna delle 12 combinazioni): file da 2,6 MB a 752 KB.',
          'Il filtro usa il **lemma di Morph-it** per distinguere un troncamento (`andar` → `andare`) da una parola autonoma (`tic` → `tic`). Morph-it è in **ISO-8859-1**, non UTF-8: letto male, `normalità` sembrava un troncamento.',
          'Le parole della lista bianca ora entrano anche nel **lessico comune**: prima `tic` o `bar`, assenti dal file dei 60k, restavano non componibili anche dopo la correzione.',
          'Corretto `SchedaCatalog.list()`: filtrava solo con dimensione E difficoltà insieme, quindi un filtro singolo veniva ignorato.',
        ],
      },
    ],
  },

  {
    version: '0.7.0',
    date: '2026-09-20',
    title: 'Classifica e statistiche dei giocatori',
    changes: [
      {
        kind: 'feature',
        items: [
          '**Classifica** raggiungibile dalla barra in alto (🏆): tre classifiche per **miglior punteggio**, **punteggio totale** e **parola più lunga**. Filtri per dimensione della griglia, difficoltà e periodo (sempre, 30 giorni, 7 giorni).',
          'Le **tue statistiche** in cima alla classifica: miglior punteggio, partite giocate, media punti, posizione globale e la tua parola più lunga. La tua riga in classifica è evidenziata.',
          'Ogni partita conclusa entra in classifica automaticamente, con il profilo attivo.',
        ],
      },
      {
        kind: 'tech',
        items: [
          'Le partite vengono salvate in una tabella **games** nel database SQLite già esistente, con **snapshot** di nome e avatar: se un profilo cambia nome, la classifica resta leggibile.',
          'Classifica **pubblica** (si vede anche senza profilo), registrazione della partita **autenticata**: il profilo lo decide il server dal token, mai il client.',
          'Il punteggio arriva dal client (in single player il server non conosce la griglia giocata), quindi vengono applicati limiti di plausibilità e salvati i dati per la verifica a posteriori.',
          'Registrazione **best effort**: se il server non è raggiungibile la partita si gioca normalmente, semplicemente non entra in classifica.',
        ],
      },
    ],
  },

  {
    version: '0.6.0',
    date: '2026-09-20',
    title: 'Foto profilo con veri effetti AI (cartoon anime)',
    changes: [
      {
        kind: 'feature',
        items: [
          'Effetti AI per la foto profilo con **AnimeGANv2**, una vera rete neurale di style transfer eseguita nel browser (onnxruntime-web + WebAssembly): tre stili, Hayao (ispirato a Miyazaki), Shinkai e Paprika. Ridisegna il volto in stile anime invece di scurire i contorni come facevano i filtri grafici.',
          'I filtri rapidi in canvas restano disponibili accanto agli stili AI, per chi vuole un effetto immediato senza scaricare nulla.',
        ],
      },
      {
        kind: 'improvement',
        items: [
          'Niente API cloud: la foto non lascia il dispositivo, non c\'è costo per immagine e la funzione lavora offline dopo il primo uso (utile nell\'app Android).',
          'I pesi (8.25 MB per stile) e il runtime WASM si scaricano al primo uso e restano in cache: l\'app resta leggera (bundle iniziale +295 KB) e le volte successive sono offline.',
          'Avanzamento visibile durante il download del modello e durante l\'elaborazione.',
        ],
      },
      {
        kind: 'tech',
        items: [
          'Il runtime WASM è servito da CDN con `wasmPaths`: onnxruntime-web espone più varianti (base/JSEP/asyncify/JSPI) e Vite le copiava TUTTE (~80 MB). Un plugin di build le rimuove: nel bundle non resta nessun `.wasm`.',
          'Modello ONNX con input NHWC `[1,H,W,3]` in [-1,1] e output tanh: ~250 ms a 256×256 su CPU (3.4 s su telefono).',
          'La firma "un gioco di Margherita Checco" compare sotto il titolo in home.',
        ],
      },
    ],
  },
  {
    version: '0.5.3',
    date: '2026-09-20',
    title: 'Profili al sicuro: chiusura pulita del database',
    changes: [
      {
        kind: 'fix',
        items: [
          'SQLite gira in modalità WAL: le scritture recenti restano in `boggle.db-wal` finché non avviene un checkpoint. Il server non chiudeva mai il database, quindi `boggle.db` poteva restare QUASI VUOTO (4 KB, senza nemmeno la tabella) e un backup del solo file principale perdeva tutti i profili.',
          'Ora il server intercetta `SIGTERM`/`SIGINT` (come fa un redeploy) ed esegue `PRAGMA wal_checkpoint(TRUNCATE)` prima di chiudere: `boggle.db` resta autosufficiente.',
        ],
      },
      {
        kind: 'feature',
        items: [
          'Diagnostica e backup del database per l\'admin: `GET /admin/db` mostra profili e byte di `.db`/`-wal`; `POST /admin/db/checkpoint` forza il consolidamento prima di copiare il volume.',
        ],
      },
      {
        kind: 'tech',
        items: [
          'Il profilo è persistito su SQLite lato server (tabella `profiles`): la persistenza tra dispositivi e redeploy è già garantita da volume + database.',
          'Test di persistenza: riapertura del solo file `.db`, assenza del `-wal` dopo la chiusura, più cicli di scrittura/riapertura, risorse (foto e clip) conservate.',
        ],
      },
    ],
  },
  {
    version: '0.5.2',
    date: '2026-09-20',
    title: 'Le clip audio si sentono e sopravvivono al reload',
    changes: [
      {
        kind: 'fix',
        items: [
          'Il pulsante ▶ non produceva audio: l\'endpoint delle clip è privato e un tag `<audio>` NON invia l\'header `Authorization`, quindi il server rispondeva 401 in silenzio. Le clip ora sono scaricate come blob autenticati (fetch + `URL.createObjectURL`).',
          'Le clip sparivano ricaricando la pagina: il profilo attivo non veniva idratato all\'avvio, quindi `sfxUrls` restava vuoto e il motore audio non riceveva le clip. Ora l\'app le ricarica automaticamente al boot.',
          'Cambiando profilo le clip del precedente restavano attive: ora vengono revocate (blob) e rimosse dal motore audio.',
        ],
      },
      {
        kind: 'tech',
        items: [
          'Con la rete assente l\'idratazione fallisce senza rompere nulla: resta il suono sintetizzato e la riga compare come "predefinito".',
          'Verificato decodificando il blob con `decodeAudioData`: clip valida a 0.66 s / 44.1 kHz, riproduzione confermata (currentTime avanzato).',
        ],
      },
    ],
  },
  {
    version: '0.5.1',
    date: '2026-09-20',
    title: 'Registrazione audio funzionante, volume unico, Docker su Railway',
    changes: [
      {
        kind: 'fix',
        items: [
          'Registrazione audio: `MediaRecorder` produce data URL come `data:audio/webm;codecs=opus;base64,...`, ma il server accettava solo `data:<mime>;base64,` e RIFIUTAVA ogni clip. Ora i parametri opzionali sono ammessi e i messaggi d\'errore mostrano la causa reale invece del generico "registrazione non riuscita".',
          '`Dockerfile`: rimosso `VOLUME`, che Railway rifiuta ("docker VOLUME is not supported"). Il volume si configura dalla piattaforma.',
        ],
      },
      {
        kind: 'improvement',
        items: [
          'Le schede generate dall\'admin vivono in `DATA_DIR/schede-extra`: un solo volume copre profili e schede, perché i PaaS consentono un volume per servizio.',
          'Le schede del bundle offline vivono in `/bundled-schede`: con lo stesso nome dell\'API `/schede` la rotta JSON veniva catturata da un redirect 301.',
          'Mount statico e fallback SPA spostati dopo TUTTE le rotte API.',
        ],
      },
      {
        kind: 'tech',
        items: [
          'Su Railway serve `RAILWAY_RUN_UID=0`: i volumi sono montati come root mentre il container gira come `node`, quindi il database non sarebbe scrivibile.',
          'I volumi non sono in Settings: si creano con `Ctrl+K` → Volume, oppure col tasto destro sul canvas.',
        ],
      },
    ],
  },
  {
    version: '0.5.0',
    date: '2026-09-20',
    title: 'Sbooble: profili, audio personale e app Android',
    changes: [
      {
        kind: 'feature',
        items: [
          'Profili persistenti su SQLite (`node:sqlite`, nessuna dipendenza nativa): registrazione e accesso con nickname + password, hash `scrypt` con salt per utente e confronto `timingSafeEqual`.',
          'Più profili per dispositivo con switch rapido: si conserva il token di sessione, non la password. I token stanno in `localStorage` (per-origine).',
          'Foto profilo con 6 filtri applicati in canvas (posterize + Sobel per i contorni): cartoon, fumetto, poster, schizzo, seppia. L\'originale non viene mai caricato: si invia solo il JPEG 256×256 (~20 KB).',
          'Suoni personali per 5 fasce di lunghezza parola (3/4/5/6/7+): registrazione con `MediaRecorder` (Opus/WebM), ~12 KB per clip. Le clip sono private: ognuno sente le proprie.',
          'Musica di sottofondo reale e royalty-free: 6 tracce CC0 (OpenGameArt) incluse nel bundle. L\'host scegle la traccia per tutta la stanza (`room:config.musicId`).',
          'App Android con Capacitor 8: web e schede inclusi nell\'APK, quindi single player, foto e audio funzionano offline. Multiplayer e sincronizzazione profili quando c\'è rete.',
          'Rebranding: nome Sbooble, logo margherita (icone Android adaptive generate con encoder PNG in Node, senza librerie native) e font Baloo 2 + Fredoka self-hostati.',
        ],
      },
      {
        kind: 'tech',
        items: [
          'Foto e clip audio sono BLOB nel database: backup con un solo file, nessun object storage.',
          '`node:sqlite` caricato via `createRequire` per non rompere la risoluzione di Vite/Vitest.',
          'Embed PNG scritto a mano con `zlib`: le icone si rigenerano con `node tools/gen-icon.mjs` senza dipendenze.',
        ],
      },
    ],
  },
  {
    version: '0.4.0',
    date: '2026-09-20',
    title: 'Schede pre-calcolate, punteggio Boggle e admin',
    changes: [
      {
        kind: 'feature',
        items: [
          '480 schede pre-generate (40 per ognuna delle 12 combinazioni 4×4/5×5/6×6 × 4 difficoltà), versionate in `packages/shared/schede/`. Ogni scheda contiene la griglia e TUTTE le parole trovabili.',
          'Filtro di qualità in generazione: almeno una parola lunga (≥ 7), numero minimo di parole, e risoluzione contro il lessico comune per i livelli facili.',
          'Punteggio Boggle lineare: `lunghezza − 2` (3 lettere = 1, 10 = 8). Niente tetto a 8 lettere.',
          'Raddoppio in multiplayer per una parola trovata da un solo giocatore, calcolato a fine round.',
          'Pannello admin con token (`ADMIN_TOKEN`) per generare e persistere nuove schede in `schede-extra/`.',
          'Pagina scheda pubblica: griglia + tutte le parole per lunghezza e punti.',
        ],
      },
      {
        kind: 'fix',
        items: [
          'Swipe riscritto: settori angolari + deadzone + isteresi al posto del "centro più vicino", che in diagonale selezionava le celle ortogonali.',
          'Rimosse ~50.000 forme troncate delle fonti (`abbacchier`, `nauseer`, `raitv`) con una regola sui finali in consonante + lista curata.',
          'Il client non scarica più 4 MB di dizionario: valida contro le parole della scheda.',
        ],
      },
      {
        kind: 'tech',
        items: [
          'Il server non costruisce più il trie da 142 MB: le parole arrivano dalle schede (RSS ~170 MB).',
          'Il generatore di schede gira offline con `pnpm gen:schede` e anche dall\'admin a runtime.',
        ],
      },
    ],
  },
  {
    version: '0.3.0',
    date: '2026-09-20',
    title: 'Swipe preciso, 4 difficoltà e anteprima parole',
    changes: [
      {
        kind: 'feature',
        items: [
          'Quattro difficoltà (molto facile / facile / normale / difficile) con tema visivo dedicato.',
          'Anteprima: il server genera una griglia di esempio e mostra quante parole si possono trovare.',
          'Avatar: 32 emoji selezionabili, visibili in classifica e nelle notifiche.',
          'Tema chiaro: superfici bianche su sfondi pastello, un tema per difficoltà.',
        ],
      },
      {
        kind: 'improvement',
        items: [
          'Hit-test sul centro più vicino invece del rettangolo: elimina le zone morte tra le celle.',
          'Interpolazione dei movimenti veloci: gli swipe rapidi non saltano le celle intermedie.',
        ],
      },
    ],
  },
  {
    version: '0.2.0',
    date: '2026-09-20',
    title: 'Audio, durate e privacy multiplayer',
    changes: [
      {
        kind: 'feature',
        items: [
          'Effetti audio sintetizzati con Web Audio (nessun asset): motivi per lunghezza parola.',
          'Durata del round selezionabile: 90, 120 o 180 secondi.',
          'Lettere più grandi e leggibili.',
        ],
      },
      {
        kind: 'improvement',
        items: [
          'Privacy multiplayer: agli avversari non viene rivelata la parola trovata, solo un badge "+N" e la lunghezza.',
        ],
      },
    ],
  },
  {
    version: '0.1.0',
    date: '2026-09-20',
    title: 'Prima versione giocabile',
    changes: [
      {
        kind: 'feature',
        items: [
          'Single player con round, timer e riepilogo.',
          'Multiplayer con codice stanza a 6 caratteri, griglia e timer sincronizzati.',
          'Dizionario italiano ampio (Morph-it!, UniBO): ~387.000 forme, incluse le coniugazioni.',
          'Swipe su celle adiacenti (8 direzioni) con annullamento tornando indietro.',
          'Griglie 4×4, 5×5 e 6×6.',
        ],
      },
    ],
  },
];

/** Etichette leggibili per i tipi di modifica. */
export const CHANGE_LABELS: Record<ReleaseEntry['changes'][number]['kind'], string> = {
  feature: 'Novità',
  improvement: 'Migliorie',
  fix: 'Correzioni',
  tech: 'Dettagli tecnici',
};
