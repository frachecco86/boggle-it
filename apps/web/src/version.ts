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

export const APP_VERSION = '0.31.0';

export interface ReleaseEntry {
  version: string;
  date: string;
  title: string;
  /**
   * Riassunto promozionale della versione, per chi apre la pagina Novità e vuole
   * capire in tre secondi cosa ci guadagna.
   *
   * Opzionale: le versioni più vecchie non ce l'hanno (e non è un problema — il
   * dettaglio tecnico sotto resta la fonte completa). Il testo è scritto in
   * linguaggio **non tecnico**: niente nomi di file, niente "payload", niente
   * percentuali di banda. Chi vuole i dettagli li trova nella scheda stessa.
   */
  promo?: ReleasePromo;
  /** Sezioni: tipo di modifica → elenco di voci. */
  changes: Array<{
    kind: 'feature' | 'improvement' | 'fix' | 'tech';
    items: string[];
  }>;
}

export interface ReleasePromo {
  /** Titolo breve e accattivante ("Parla con chi gioca con te"). */
  headline: string;
  /** Due o tre righe: cosa cambia per chi gioca, in parole semplici. */
  text: string;
  /** Simbolo della card; se manca si usa una stellina. */
  emoji?: string;
}

/**
 * Cronologia delle versioni, dalla più recente.
 * Le voci tecniche (tipo `tech`) spiegano le scelte di implementazione.
 */
export const RELEASES: ReleaseEntry[] = [
  {
    "version": "0.31.0",
    "date": "2026-09-26",
    "title": "Modalità apprendimento: suggerimento animato e definizioni",
    "promo": {
      "emoji": "💡",
      "headline": "Impara le parole, non solo trovarle",
      "text": "Una nuova modalità senza tempo: un tasto mostra una parola possibile animandola sulla griglia, e il \"?\" accanto alla parola appena trovata apre la sua definizione dal dizionario italiano."
    },
    "changes": [
      {
        "kind": "feature",
        "items": [
          "**Modalità apprendimento** (nelle impostazioni partita, solo single player): **tempo infinito** — nessun conto alla rovescia, si esce dal round solo quando si vuole — più due aiuti.",
          "**Tasto suggerimento 💡**: anima una parola possibile sulla griglia, accendendo le celle in sequenza. Preferisce le parole più lunghe, che sono le più difficili da vedere. Non ripropone parole già trovate.",
          "**Definizione della parola**: il pulsante \"?\" accanto alla parola appena trovata (o suggerita) apre la definizione, estratta dal dizionario italiano di Wikizionario. Se una parola non ha una definizione, il pannello offre il link alla voce online."
        ]
      },
      {
        "kind": "fix",
        "items": [
          "**Le schede \"Ale\" ora si possono scegliere** dalle impostazioni partita. Prima il pulsante era disabilitato fuori dalla griglia 5×5 (dove le Ale esistono) senza spiegare come arrivarci. Ora sceglierle imposta automaticamente la griglia a 5×5, con una nota che lo spiega; e scegliere un'altra griglia mentre Ale è attivo riporta a Standard (evita una configurazione senza schede). Vale anche in lobby: il server rifiuta comunque l'incoerenza."
        ]
      },
      {
        "kind": "tech",
        "items": [
          "`definitions.br` (1,6 MB, ~67.000 parole): definizioni estratte dal dump di Wikizionario con `pnpm --filter @boggle/dictionary build:definitions`. Le flessioni (`form-of`, es. \"prima persona di amare\") sono escluse: il significato sta nel lemma. Licenza CC BY-SA 4.0.",
          "Rotta `GET /words/:word/definition`, con normalizzazione degli accenti (`città` → `citta`) e cache di un giorno.",
          "`findWordPath(grid, word)` in `@boggle/shared`: trova il tracciato di una parola sulla griglia (DFS, 8 direzioni, `q` = \"qu\"). Serve ad animare il suggerimento: la stessa parola si può comporre in più modi."
        ]
      }
    ]
  },
  {
    "version": "0.30.0",
    "date": "2026-09-26",
    "title": "Pannello admin a tab, schede Ale, voce più pulita e ricerca a prefisso",
    "promo": {
      "emoji": "🎛️",
      "headline": "Amministrazione in ordine, meno rumore",
      "text": "Il pannello admin ha tre tab (Schede, Musica, Profili), si possono cancellare i profili e togliere le tracce musicali. La ricerca nel dizionario non restituisce più migliaia di verbi, la voce in stanza non gracchia e i fondi non si ripetono più scorrendo."
    },
    "changes": [
      {
        "kind": "feature",
        "items": [
          "**Pannello admin a TRE tab**: Schede, Musica e Profili. Prima erano tre sezioni una sotto l’altra in un’unica pagina lunga, e per arrivare ai profili si scorreva oltre tutte le schede. Ogni tab carica i suoi dati solo quando si apre.",
          "**Tab Profili**: elenco dei profili col numero di partite e cancellazione. La cancellazione è irreversibile (porta via account, foto, clip audio e partite in classifica), quindi richiede di **digitare il nickname** per conferma; c’è anche “Azzera classifica”, che cancella le partite e lascia i profili.",
          "**Importa musica da un link** (YouTube e affini): il server scarica l’audio e lo converte in MP3 con `yt-dlp` + `ffmpeg`, leggendo titolo e autore dai metatags. Serve il pacchetto nell’immagine Docker; dove manca, il campo resta ma risponde con le istruzioni e l’upload manuale continua a funzionare.",
          "**Novità: schede “Ale”** — una terza variante, dal documento *algoritmo schede “ale”*. 45 schede su griglia 5×5 (15 per difficoltà), selezionabili in partita come le altre."
        ]
      },
      {
        "kind": "fix",
        "items": [
          "**La ricerca nel dizionario ora è per PREFISSO.** Cercando `amo` uscivano **12.782** risultati, quasi tutti verbi in `-iamo` (`abbacchiamo`), perché la ricerca era una sottostringa pura. Ora `amo` trova **82** parole che iniziano così (`amo`, `amore`, `amorale`…).",
          "**La voce in stanza non gracchia più.** La riduzione dell’audio usava una media a blocchi (a 44,1 kHz la finestra cambiava di lunghezza) e i blocchi venivano giuntati senza dissolvenza, quindi si sentivano dei click. Ora c’è un filtro anti-aliasing (passa-basso del 4° ordine) con decimazione a fase continua, una dissolvenza di 4 ms fra i blocchi e un buffer anti-strappo più generoso (220 ms). Il prezzo è un po’ più di latenza, come richiesto.",
          "**Lo sfondo non si ripete più** nelle pagine lunghe (dizionario, elenco schede). Il gradiente stava su `body` con `background-attachment: fixed`, che su mobile viene spesso ignorato: il fondo copriva una sola viewport e si ripeteva. Ora vive su un layer fisso, quindi resta continuo su qualsiasi browser.",
          "**Il risultato della parola resta visibile** nel riquadro di composizione finché non si tocca una nuova lettera. Prima spariva dopo un secondo, quindi il punteggio si leggeva con la coda dell’occhio. Vale in single player e in multiplayer.",
          "**Le tracce musicali INCLUSE si possono togliere dall’elenco** (spariscono da admin e playlist; il file resta nel client perché è versionato). Le tracce caricate si cancellano come prima.",
          "**Il pannello informativo “?” è centrato su mobile**: prima era ancorato al pulsante accanto al titolo e finiva per sbordare dallo schermo."
        ]
      },
      {
        "kind": "improvement",
        "items": [
          "**Nelle schede “Ale” una parola è comune se lo è la sua radice**: `amo` è comune perché lo è `amare`, anche se `amo` non compare nel vocabolario di base. La difficoltà delle fasce scende da 0,80/0,85/0,89 a 0,51/0,57/0,64: prima era gonfiata dalla morfologia (le forme flesse contate come rare).",
          "**Il campo di ricerca dice “Cerca una parola (dall’inizio)”**, così è chiaro che si cerca per prefisso."
        ]
      },
      {
        "kind": "tech",
        "items": [
          "`schedaAle.ts`: pipeline completa e deterministica — pre-processing, frequenza dei token (`QU` = un token), `Common` da NVdB, radici dei lemmi da Morph-it, guard rails, calibrazione (Tukey + k-means a 3 fasce) e generazione per fascia.",
          "`mediaTool.ts`: estrazione audio da link con `yt-dlp`/`ffmpeg`, con validazione dell’URL (solo http/https: `file:` e `pipe:` sono rifiutati) e messaggio esplicito se i binari mancano.",
          "Le schede Ale non si generano dall’admin: richiedono calibrazione e NVdB, quindi si producono offline con `pnpm gen:schede:ale`."
        ]
      }
    ]
  },
  {
    version: '0.29.0',
    date: '2026-09-26',
    title: 'Via le abbreviazioni dalle parole valide, e solo lettere italiane in griglia',
    promo: {
      emoji: '🧹',
      headline: 'Solo parole che riconosci',
      text: 'Tra le parole trovabili compariva `idr`: era un\'etichetta da dizionario, non una parola. Abbiamo tolto tutte le abbreviazioni e le sigle di classificazione, e le lettere straniere (`k` `w` `x` `y` `j`) non entrano più nelle griglie.',
    },
    changes: [
      {
        kind: 'fix',
        items: [
          '**Rimosse 113 voci che non sono parole italiane**: abbreviazioni e sigle da dizionario (`dott`, `avv`) ed etichette di materia o grammatica usate per classificare i lemmi (`idr` = idraulica, `geogr`, `chim`, `fis`, `sost`, `prep`). Con l\'etichetta "abbreviazione" sfuggivano al filtro dei troncamenti: `idr` compariva tra le parole trovabili pur non essendo una parola. Il lessico passa da 368.213 a **368.100** voci.',
          '**Le lettere non italiane non entrano più nelle griglie**: `k`, `w`, `x`, `y`, `j` restano nel dizionario (le parole straniere già formate restano valide) ma non vengono più pescate come celle. Erano quasi solo prestiti (`wagon`, `yacht`, `jackpot`) e nella pratica erano **celle morte**: non formano parole di 3+ lettere. Le griglie contengono ora solo lettere italiane, con la `z` come unica lettera rara.',
          '**La lettera rara obbligatoria nelle griglie difficili è una `z`**, non una lettera qualunque: prima il criterio poteva forzare una `j`, che non serve a comporre nulla.',
        ],
      },
      {
        kind: 'improvement',
        items: [
          '**Tetto alle lettere rare abbassato dal 22% al 12%** anche nel catalogo standard (era già 12% nei criteri completi): prima uscivano griglie con 8 lettere rare su 36, un quinto della griglia bloccato.',
          '**Catalogo rigenerato**: 135 schede (10 standard + 5 full per ognuna delle 9 combinazioni), verificate senza violazioni. Nessuna delle voci rimosse compare più tra le parole trovabili.',
        ],
      },
      {
        kind: 'tech',
        items: [
          '`RARE_LETTERS` è separato in `RARE_ITALIAN = ["z"]` e `FOREIGN_LETTERS = ["k","w","x","y","j"]`: la composizione della griglia ha un tetto per ciascuno (`rareMax`, `foreignMax`) e `rareMin` si applica solo alle rare italiane.',
          '`gridStructureIssues()` segnala come difetto ogni lettera non italiana in griglia: se in futuro `foreignMax` tornasse maggiore di zero, la verifica delle schede se ne accorgerebbe.',
          '`abbreviations.txt` è stato eliminato e l\'opzione `abbreviations` rimossa da `createSchedaPool`, dagli script di generazione e da `build-words.mjs`. La regola di giocabilità ora è una sola: lunghezza 3–16, non bloccata, e se termina in consonante deve essere una parola autonoma attestata (`consonant-endings.txt`).',
        ],
      },
    ],
  },
  {
    version: '0.28.1',
    date: '2026-09-26',
    title: 'Schede "full criteria" più uniformi, e senza angoli morti',
    promo: {
      emoji: '📐',
      headline: 'Stessa categoria, stessa difficoltà',
      text: 'Nelle schede con i criteri completi la stessa categoria aveva troppa disparità: 15–42 parole e 27–76 punti su 4×4 difficile\u2014cioè partite molto diverse fra loro. Ora ogni categoria ha un intervallo chiuso e stretto, e le griglie difficili non hanno più colonne di consonanti inutilizzabili.',
    },
    changes: [
      {
        kind: 'fix',
        items: [
          '**Bande chiuse su entrambi i lati**: i criteri danno un solo limite ("numero minimo di parole" per il facile, "< N parole" per il difficile), e con un limite solo la banda è larga quanto la distribuzione naturale. Il lato mancante è ora **misurato**: 4×4 difficile 25–44 parole, 4×4 facile 121–170, 5×5 difficile 38–79, 6×6 difficile 75–129. La disparità del catalogo `full` scende da 1,7–2,8× a **1,1–1,6×** (parole e punti).',
          '**Niente più zone morte**: ogni consonante deve avere una vocale entro 2 celle, al massimo una riga o colonna senza vocali, nessuna `h` senza `c`/`g` accanto (un `h` isolato non forma nessuna parola di 3+ lettere). Prima 13 schede difficili su 15 avevano almeno una riga o colonna senza vocali e 5 avevano una `h` inutile: le griglie con più zone morte trovabili avevano 15–28 parole contro le 42–46 di quelle ben distribuite, nella stessa categoria.',
          '**Lettere rare ridotte**: il tetto per il difficile scende dal 22% al **12%** (prima uscivano griglie con 8 lettere rare su 36, un quinto della griglia bloccato).',
          '**Nessuna banda sul punteggio**, ed è una scelta misurata: `r(parole, punti) = 0,99`, cioè il 98% della varianza dei punti è spiegata dal numero di parole (i punti per parola variano solo ±10-15%). Stringere le parole stringe i punti; un criterio in più sarebbe stato quasi ridondante.',
        ],
      },
      {
        kind: 'tech',
        items: [
          '`gridStructureIssues()` misura le zone morte di una griglia ed è usata sia dal generatore (scarta le griglie prima del solve, costa quasi nulla) sia da `verify:schede`, che ora controlla anche la struttura.',
          '`measure:schede` riporta punteggio, correlazione parole↔punti, punti per parola e la quota di griglie che passa ciascuna regola: le tre regole di struttura sono tarate su quelle misure (la versione "vocale entro 1 cella" avrebbe scartato il 98% delle griglie difficili).',
          '`gen:schede --replace` rigenera solo le schede di una variante e tiene le altre, ripartendo dagli stessi id: è così che le 45 schede `full` sono state rifatte senza toccare le 90 standard.',
        ],
      },
    ],
  },
  {
    version: '0.28.0',
    date: '2026-09-26',
    title: 'Un secondo catalogo di schede, con i criteri completi (e si può scegliere)',
    promo: {
      emoji: '🧪',
      headline: 'Schede "full criteria": scegli tu come giocare',
      text: 'Oltre alle schede di sempre c\u2019è un catalogo costruito con i criteri completi: rapporto vocali/consonanti per livello, lettere ad alta frequenza nel facile e lettere rare nel difficile, numero di parole e parole ancora. Nelle impostazioni partita scegli quale catalogo usare, e nella pagina delle schede quelle nuove si riconoscono dall\u2019etichetta FULL.',
    },
    changes: [
      {
        kind: 'feature',
        items: [
          '**Catalogo "full criteria"**: 5 schede nuove per ciascuna delle 9 combinazioni dimensione × difficoltà (45 in tutto), generate con i criteri completi: rapporto vocali/consonanti **40–45% / 30–35% / <30%**, frequenza delle lettere controllata dal pool di consonanti (alta frequenza nel facile, consonanti medie nel normale, lettere rare — almeno una obbligatoria — nel difficile), numero di parole richiesto dai criteri (**>120 / 60–100 / <45** su 4×4, **>200 / 100–160 / <80** su 5×5, **>350 / 180–280 / <130** su 6×6), più parole ancora lunghe e lunghezza media in banda.',
          '**Etichetta FULL**: le schede con i criteri completi hanno `variant: "full"` e si riconoscono nella pagina "Sfoglia le schede" (badge e filtro "Criteri"), oltre che nel file JSON.',
          '**Selezione in partita**: un\u2019opzione nel foglio "Impostazioni partita" (vale sia per il single player sia per la stanza creata) e la stessa scelta in lobby per l\u2019host. Ogni stanza ricorda i criteri scelti: tutti giocano le stesse schede.',
        ],
      },
      {
        kind: 'improvement',
        items: [
          'Anche il pannello admin può generare schede `full`, e le statistiche delle schede (parole, punteggio massimo) usano l\u2019insieme accettato.',
          'Nell\u2019app senza rete la pagina "Sfoglia le schede" ora ha i metadati anche offline: prima l\u2019ordinamento per punteggio e i filtri mostravano zeri.',
        ],
      },
      {
        kind: 'tech',
        items: [
          '`Scheda` è al formato 3: `variant` (`standard` / `full`). Le schede di formato ≤ 2 valgono `standard` (`schedaVariantOf`), quindi il catalogo esistente resta valido senza rigenerarlo.',
          'Criteri in due insiemi espliciti (`SPECS.standard` / `SPECS.full` in `schedaGen.ts`), con la composizione in `grid.ts` (`COMPOSITION` e `FULL_COMPOSITION`). `densityBandFor`/`anchorFor` prendono la variante, e `verify:schede` controlla ogni scheda con i criteri della SUA variante.',
          '`measure:schede --variant full` misura le griglie dei criteri completi per tarare le bande: le\u2019bande di lunghezza media sono il risultato di quella misura (l\u2019ordine reale è facile 4,4 · normale 4,1 · difficile 3,8 su 4×4, invertito rispetto ai criteri, che chiedono 7+ per il difficile: su una griglia reale le parole corte dominano).',
          'Morfologia/desinenze e geometria dei percorsi NON sono implementate: servirebbe un\u2019analisi morfologica delle parole e il tracciato di ogni parola trovata. Il resto dei criteri della pagina è implementato e verificato.',
          '`AudioEngine.test.ts` scalda il modulo in `beforeAll`: il primo import costa ~2s e con i test dei quattro pacchetti in parallelo faceva scadere il timeout del primo test (era un falso rosso, non un difetto del motore).',
        ],
      },
    ],
  },
  {
    version: '0.27.0',
    date: '2026-09-26',
    title: 'Le schede si generano per fasce di frequenza (e le parole rare ora valgono)',
    promo: {
      emoji: '🎚️',
      headline: 'Difficoltà più chiara, parole rare accettate',
      text: 'Le schede si generano partendo dalle parole più usate dell\u2019italiano, divise in tre fasce: le griglie facili sono piene di vocali e lettere comuni, quelle difficili di consonanti rare. E se trovi una parola rara che non era prevista, ora vale lo stesso: prima veniva rifiutata.',
    },
    changes: [
      {
        kind: 'feature',
        items: [
          '**Tre fasce di frequenza**: le schede si generano con tre dizionari costruiti sulle 5.000 / 20.000 / 60.000 parole italiane più frequenti (fonte FrequencyWords, OpenSubtitles 2018). Da lì vengono le parole "attese" di ogni difficoltà, quelle del riepilogo "parole che esistevano".',
          '**Le parole rare ora valgono**: ogni scheda porta l\u2019elenco COMPLETO delle parole componibili sulla griglia secondo il dizionario intero. Se trovi una parola fuori fascia viene accettata e vale come le altre (prima il gioco rispondeva "non una parola di questa scheda").',
          '**Filtro di qualità a due condizioni**: numero di parole trovabili nella banda della difficoltà e almeno una parola lunga. Via le soglie di punteggio e la scala di lunghezze multiple: erano tre criteri in più da tarare.',
          '**Nuovi strumenti**: `measure:schede` misura le griglie per tarare le bande, `build:frequency` ritaglia le fasce dalla lista di frequenza, `verify:schede` controlla il catalogo (densità, parola lunga, coerenza fra parole attese e accettate).',
        ],
      },
      {
        kind: 'fix',
        items: [
          '**La difficoltà era solo apparente** (la prima versione dell\u2019algoritmo, misurata): campionando le lettere dalla fascia di frequenza, le tre difficoltà producevano la STESSA griglia — le statistiche di lettera dell\u2019italiano non cambiano con la frequenza (vocali 45,6% nel top 5k, 45,0% nel 20k–60k). La composizione della griglia (vocali e rare) resta quindi controllata e misurata: facile 44% vocali e 0% rare, normale 32% e 6%, difficile 22% e 12%.',
          '**Il conteggio delle parole si invertiva**: un dizionario da 60k parole trova più parole di uno da 5k, quindi "facile" risultava più povero di "difficile". La densità si misura ora sulle parole che il giocatore può davvero trovare: misurate 85 / 49 / 26 su 4×4, 187 / 156 / 71 su 5×5, 336 / 226 / 156 su 6×6 (facile / normale / difficile).',
        ],
      },
      {
        kind: 'tech',
        items: [
          '`Scheda` è al formato 2: `words` (parole attese della fascia) + `allWords` (insieme accettato). Le schede di formato 1 restano leggibili e ripiegano sulle sole `words` (vedi `acceptedWords()`).',
          'Nuova fonte `packages/dictionary/data/frequency-it.txt` (60k parole giocabili ordinate per frequenza, 568 KB): è versionata, così la generazione delle schede non dipende dalla rete. La lista grezza (9,7 MB) si scarica con `pnpm --filter @boggle/dictionary fetch`.',
          'Il catalogo è di **90 schede** (10 per combinazione): 328 KB con l\u2019insieme accettato incluso. Rigenerabile con `pnpm gen:schede`.',
          'Le statistiche del server (`/schede`, `/schede/:id/stats`, catalogo Parole) e il conteggio inviato a fine partita usano le parole accettate: è il numero che descrive la scheda.',
        ],
      },
    ],
  },
  {
    version: '0.26.0',
    date: '2026-09-26',
    title: 'La griglia prende tutto lo spazio, il punteggio arriva dove guardi',
    promo: {
      emoji: '🔠',
      headline: 'Più griglia, meno contorno',
      text: 'La griglia delle lettere ora riempie lo spazio disponibile: niente più riquadro con il bordo intorno e niente scorrimento durante la partita. Il punteggio della parola trovata compare nel rettangolo «Componi una parola», colorato in base a quanto era lunga, e in multiplayer gli avatar in fondo mostrano chi segna e quanto.',
    },
    changes: [
      {
        kind: 'feature',
        items: [
          '**La griglia riempie lo spazio**: il lato delle celle si calcola su larghezza E altezza disponibili e si prende il minore, quindi la griglia è la più grande possibile in ogni formato — telefono in verticale, tablet, desktop, finestra bassa. Prima c\'era una formula fissa sul viewport, con ~230 px di spazio riservato "a stima".',
          '**Via il riquadro**: il contenitore della griglia non ha più bordo, sfondo, ombra, angoli e 12 px di padding. Restano solo i quadrati delle lettere, con 4 px fra le celle e 4 px dal bordo dello schermo.',
          '**Punteggio nel rettangolo «Componi una parola»**: quando la parola è valida, al posto delle lettere compare `PAROLA +2` per un secondo. Il colore dipende dalla lunghezza (3 lettere giallo, 4 verde, 5 azzurro, 6 viola, 7+ rosa) e l\'effetto d\'ingresso cambia con la difficoltà (sale, salta, lampo). Anche «già trovata» e «non valida» si leggono lì: la nuvoletta in fondo allo schermo è stata eliminata.',
          '**Barra dei giocatori in multiplayer**: in fondo compaiono gli avatar tondi di tutti, con il punteggio sotto e il "+N" che si sovrappone all\'avatar di chi ha appena segnato (stesso colore per lunghezza del single player). Sostituisce l\'elenco «Classifica» che scorreva fuori schermo e le notifiche in basso: si vede a colpo d\'occhio chi sta andando forte.',
          '**Home con interruttore Solo/Multiplayer**: due pulsanti con icona scelgono la modalità, poi c\'è il tasto che serve (`Gioca da solo` oppure `Crea la stanza`, con codice e invito solo in multiplayer). Le impostazioni della partita valgono per entrambe e si vedono in una riga sotto il tasto.',
          '**Volumi subito in home**: effetti, musica e chat vocale hanno il loro cursore, sempre visibili e senza etichette (icona + cursore), con un tasto on/off per effetti e musica. In partita un tasto tondo in basso a sinistra apre lo stesso mixer con uno slide verso l\'alto.',
          '**Voce di vittoria**: alla fine della partita, se hai vinto, una voce femminile italiana annuncia la vittoria con una frase presa a caso fra 22 ("Complimenti {nome}, hai vinto la partita!"), con tono entusiasta. Rispetta il muto degli effetti.',
          '**Temi più colorati**: ogni difficoltà ha ora il suo fondo anche in tema scuro (notte blu, viola, prugna con aloni del colore del livello) e le superfici si tingono del colore della difficoltà. Prima il tema scuro era un\'unica sovrapposizione nera: lo stesso fondo piatto per tutti i livelli.',
        ],
      },
      {
        kind: 'improvement',
        items: [
          '**Niente scorrimento in partita**: la schermata di gioco è alta esattamente quanto il viewport (con `svh`, così le barre del browser non tagliano l\'ultima riga). I due riquadri sotto la griglia (punti e parole trovate) sono spariti: gli stessi numeri stanno nella barra in alto, piccoli, con un\'icona al posto dell\'etichetta e allineati a destra alla stessa altezza del timer.',
          '**Countdown centrato dal primo istante**: l\'animazione di ingresso della schermata usava una traslazione, che rende il contenitore il riferimento dei discendenti `fixed`. Il countdown compariva quindi in alto per un attimo e saltava al centro a fine animazione: ora l\'ingresso è in sola opacità.',
          '**Fine dello scorrimento orizzontale nel foglio delle impostazioni**: la riga delle difficoltà usava tre colonne non comprimibili e poteva superare la larghezza del pannello di qualche pixel. Le colonne ora possono restringersi (`minmax(0, 1fr)`), su schermi stretti l\'etichetta va sopra le scelte, e il pannello non scorre mai in orizzontale.',
          '**Esultanze dimezzate**: il suono della propria parola suona a metà volume e quello degli avversari a un quarto del valore originale (resta il rapporto 1:2 fra i due, così si distinguono).',
        ],
      },
      {
        kind: 'tech',
        items: [
          'La griglia usa `container-type: size` sul proprio contenitore e calcola il lato di cella in `min(100cqw, 100cqh)` con il numero di celle e lo spazio fra loro: le lettere sono una frazione esatta della cella (`--tile-ratio`), quindi la stessa proporzione su ogni schermo. Il ripiego per i browser senza unità di container resta una formula sul viewport.',
          '`GameStats`, `AvatarScoreBar`, `VolumeSliders` e `lengthBucket` sono nuovi; `FoundCounter` e `OpponentFeed` sono stati **rimossi** insieme alle loro regole CSS e al toast: il codice che non serve più non va mantenuto.',
          'La voce di vittoria (`audio/victorySpeech.ts`) usa la sintesi vocale del browser e sceglie la voce italiana femminile migliore fra quelle installate, con un ripiego sulla voce predefinita se non ce ne sono. Le frasi stanno in un elenco esportato e `victorySpeech.test.ts` verifica che siano almeno 20, tutte con il segnaposto del nome e senza duplicati.',
          '`AudioSettings` ha un terzo volume, `voiceVolume`, applicato al guadagno dedicato delle voci di stanza. Le preferenze salvate da versioni precedenti non ce l\'hanno: la fusione dello stato persistito e la sanificazione dei numeri nel motore audio evitano che un valore mancante porti il guadagno a `NaN` (audio muto).',
        ],
      },
    ],
  },
  {
    version: '0.25.2',
    date: '2026-09-25',
    title: 'La build passa anche con TypeScript 5.9',
    promo: {
      emoji: '🧩',
      headline: 'Build riparata (davvero)',
      text: 'Il controllo dei tipi con la versione di TypeScript usata sui server segnalava un tipo di buffer troppo generico nella voce di squadra. Sono dettagli tecnici, ma erano l\'ultimo ostacolo al rilascio: ora la build arriva in fondo.',
    },
    changes: [
      {
        kind: 'fix',
        items: [
          '**Typecheck con TypeScript 5.9**: `data.buffer` di un `Int16Array` ha tipo `ArrayBufferLike`, che comprende anche `SharedArrayBuffer`, mentre il protocollo della voce accetta solo `ArrayBuffer`. Ora il buffer si restringe con un controllo a runtime (`instanceof ArrayBuffer`) **senza copiarlo**: se per qualche motivo arrivasse un buffer condiviso, il blocco viene semplicemente ignorato invece di essere inviato.',
        ],
      },
      {
        kind: 'tech',
        items: [
          'TypeScript 5.7 ha reso generici i tipi degli array binari (`Int16Array<ArrayBufferLike>`), quindi codice che prima compilava ha smesso di compilare con 5.9: il file di lock installa **5.9.3**, mentre in sviluppo ne era in uso una 5.6.3 — ed è per questo che l\'errore si è visto solo in build. Le verifiche locali ora usano la stessa versione del file di lock.',
        ],
      },
    ],
  },
  {
    version: '0.25.1',
    date: '2026-09-25',
    title: 'La build riparte (e le icone non dipendono più da nessuno)',
    promo: {
      emoji: '🔧',
      headline: 'Build riparata',
      text: 'La 0.25.0 non riusciva a installarsi sui server: mancava un aggiornamento del file di lock delle dipendenze. Ora le poche icone dell\'interfaccia sono disegnate dentro l\'app, quindi il file di lock resta valido e la build passa.',
    },
    changes: [
      {
        kind: 'fix',
        items: [
          '**Build bloccata**: l\'installazione si fermava con un errore perché `apps/web/package.json` chiedeva una libreria di icone che non era stata registrata nel file di lock (`pnpm-lock.yaml`). Il server di build installa con `--frozen-lockfile`, quindi si rifiuta di procedere quando i due file non combaciano — ed è giusto così: meglio un errore chiaro in build che un\'app con dipendenze diverse da quelle previste.',
        ],
      },
      {
        kind: 'tech',
        items: [
          'Le quattro icone dell\'interfaccia (casa, microfono, microfono spento, condividi) sono ora **SVG in linea** in `components/icons.tsx`, con gli stessi tratti della libreria: quattro icone non valgono una dipendenza in più da tenere allineata. Il bundle web cala di ~5 kB e l\'app resta senza dipendenze esterne per le icone.',
          '`icons.test.tsx` verifica i tratti disegnando i componenti in HTML statico, **senza browser**: se qualcuno modifica un\'icona, il test lo dice.',
        ],
      },
    ],
  },
  {
    version: '0.25.0',
    date: '2026-09-25',
    title: 'Si gioca subito: impostazioni in un foglio, scheda mai in anticipo',
    promo: {
      emoji: '🎛️',
      headline: 'Una schermata, un tocco, si gioca',
      text: 'Le impostazioni della partita (griglia, difficoltà, durata, round) ora stanno tutte in una schermata sola: niente più scorrimento per arrivare al pulsante. E per giocare da soli basta un tocco: prima servivano due schermate e si vedeva in anticipo la scheda della partita — un vantaggio bello grosso.',
    },
    changes: [
      {
        kind: 'feature',
        items: [
          '**Impostazioni in un foglio**: griglia, difficoltà, durata e round stanno tutte in un pannello sovrapposto che si apre dalla home — quattro righe compatte, il pulsante sempre in vista.',
          '**Un solo menù per due modalità**: le stesse scelte valgono sia per la partita singola sia per la stanza multiplayer. Prima il single player chiedeva le stesse cose una seconda volta.',
          '**Regole e punteggi** si aprono dal foglio delle impostazioni: chi ha già giocato non se li ritrova in mezzo ai piedi, chi è nuovo li trova dove sceglie la partita.',
        ],
      },
      {
        kind: 'improvement',
        items: [
          '**Si gioca da solo con un tocco**: il pulsante «Gioca da solo» in home sorteggia la scheda e fa partire il conto alla rovescia. Sparira la schermata intermedia con il pulsante «Pronto?».',
          '**La scheda non si vede prima**: né in home, né nella stanza d\'attesa. Si scoprono la griglia e le parole **solo quando il round comincia**, così nessuno parte avvantaggiato. Nella stanza d\'attesa si legge soltanto che la scheda è pronta (e l\'host può cambiarla).',
          '**Nella sala d\'attesa** la griglia d\'anteprima è stata sostituita da una riga di stato: «la scheda si scopre quando parte il round».',
        ],
      },
      {
        kind: 'fix',
        items: [
          '**Podio con due giocatori**: il vincitore resta **al centro**, come nella partita a tre (prima scivolava a destra: 2° a sinistra, 1° a destra, e la corona cambiava posto a ogni partita).',
          '**Podio con più di tre giocatori**: i primi tre salgono sul podio e gli altri (dal quarto in poi) compaiono subito sotto, in una riga compatta con posizione e punti. Prima dal podio sparivano, e sembrava che la partita fosse finita in tre.',
        ],
      },
      {
        kind: 'tech',
        items: [
          'Le impostazioni vivono in `MatchSettings.tsx` (un pannello solo); la schermata `SoloSetupScreen` e le anteprime (`GridPreview`, `SchedaPreview`, `useGridPreview`) sono state **rimosse**: il codice che non serve più non va mantenuto.',
          '`useSoloGame` non ha più la fase `idle` né una scheda prescelta: al via si sorteggia la scheda e si comincia. Meno stato da tenere allineato, meno modi di sbagliare.',
          'Il podio è più robusto: il posto vuoto del terzo (con due giocatori) viene disegnato esplicitamente, gli altri giocatori sono elencati nel podio stesso. Il caso a un giocatore resta senza podio: un podio con una persona sola non è un podio.',
        ],
      },
    ],
  },
  {
    version: '0.24.0',
    date: '2026-09-25',
    title: 'La griglia riempie le celle (e i quadrati sono più netti)',
    promo: {
      emoji: '🔠',
      headline: 'Lettere grandi come il quadrato',
      text: 'Le lettere ora riempiono davvero le caselle, su ogni schermo e in ogni formato (4×4, 5×5, 6×6) — e su desktop la griglia non esce più dallo schermo. I quadrati hanno angoli più netti, come nel Boggle.',
    },
    changes: [
      {
        kind: 'fix',
        items: [
          '**Le lettere riempiono le caselle.** La dimensione del carattere veniva da una formula sul **viewport**, che non sapeva quanto fosse grande la cella: su un tablet o un computer le lettere occupavano il **36-44%** della casella (quadrati grandi e mezzi vuoti) e su telefono il **51%**; e in 6×6 il rapporto era diverso da quello in 4×4. Ora la lettera è una **frazione esatta della cella** (64% in 4×4, 66% in 5×5, 68% in 6×6), quindi la griglia si riempie allo stesso modo su ogni schermo e in ogni formato.',
          '**Su schermi larghi la griglia non esce più dallo schermo.** La griglia è quadrata (caselle 1fr + `aspect-ratio: 1`) e veniva dimensionata solo sulla larghezza della colonna: su desktop era alta più dello schermo e l\'**ultima riga restava sotto il bordo** — da raggiungere scorrendo, proprio mentre si gioca. Ora prende il minore fra lo spazio in larghezza e quello in altezza: resta interamente visibile.',
        ],
      },
      {
        kind: 'improvement',
        items: [
          '**Quadrati meno smussati**: gli angoli passano da **18px fissi** a una smussatura proporzionale al lato (`clamp(9px, 9%, 18px)`). Su un telefono sono **9px** invece di 18 — caselle più nette, come nel Boggle — e su caselle grandi non diventano mai esagerate. Stessa proporzione (4px invece di 5px) per le caselle piccole dell\'anteprima.',
        ],
      },
      {
        kind: 'tech',
        items: [
          'Il riquadro della griglia è ora un **container di query** (`container-type: inline-size`): le misure sono in `cqw`, cioè in percentuale della larghezza reale della griglia. È quello che rende la formula "frazione della cella" possibile in CSS puro, senza misurare nulla in JavaScript.',
          'Resta un **ripiego** per i browser senza container queries: la vecchia formula sul viewport, che viene sostituita dove `cqw` è supportato.',
          'Verificato sul browser reale (headless, DevTools Protocol) su **telefono 390×745, tablet 820×1100 e desktop 1280×900**, per 4×4, 5×5 e 6×6: rapporto lettera/cella **64/66/68%** in tutti e nove i casi (prima 51/56/61% su telefono, 36/39/42% su tablet, 41/44/47% su desktop).',
          'Le regole per formato ora sono **una variabile** (`--tile-ratio`) invece di tre copie della stessa formula: prima un formato nuovo o un cambio di gap richiedeva di aggiornare tre punti dello stile, ed era il tipo di duplicazione che fa divergere le griglie fra loro.',
        ],
      },
    ],
  },

  {
    version: '0.23.0',
    date: '2026-09-25',
    title: 'Il tasto Home entra nella barra in alto',
    promo: {
      emoji: '🏠',
      headline: 'Torna indietro con un tocco',
      text: 'Un tasto tondo con la casetta, in alto a sinistra accanto all\'interruttore del tema: c\'è in ogni pagina, è alto come le altre icone e non ruba più la prima riga della schermata.',
    },
    changes: [
      {
        kind: 'improvement',
        items: [
          '**Il tasto Home è nella barra in alto e non occupa più la prima riga.** Prima ogni schermata apriva con un pulsante **“← Home”** grande (~60px) che spostava il titolo verso il basso: ogni pagina perdeva una fascia intera solo per il ritorno. Ora è un tasto **tondo e minimale** (solo l\'icona della casa) subito dopo l\'interruttore del tema, **alto come tutti gli altri comandi della barra** e allineato con loro.',
          '**Ogni schermata guadagna ~45px di contenuto**: titoli, elenchi e griglie cominciano più in alto, senza il pulsante di ritorno in mezzo.',
          '**Il tasto c\'è in tutte le pagine, senza doppioni.** Il pannello **Admin** era l\'unico senza (aveva un suo pulsante “Home” nella riga del titolo, e un “Torna alla home” nella schermata di accesso): ora usa lo stesso tasto della barra, come le altre.',
        ],
      },
      {
        kind: 'fix',
        items: [
          '**Niente più contenuti sotto la barra.** Togliendo il pulsante dal flusso della pagina, il primo elemento di ogni schermata sarebbe finito **dietro** alla barra fissa (interruttore, Home, Classifica/Parole/versione): il margine superiore delle pagine è stato ricalcolato, con `safe-area-inset-top` per i telefoni con notch in modalità app.',
          '**Rimossa una regola duplicata** che teneva il margine superiore a 30px in un punto e a 22px in un altro (a seconda di quale vinceva nel foglio di stile): due valori per la stessa cosa sono esattamente ciò che fa riapparire i difetti dopo una modifica.',
        ],
      },
      {
        kind: 'tech',
        items: [
          'Verificato sul browser reale su **11 schermate** (home, classifica, novità, parole, scheda, profili, profilo, impostazioni single player, admin, sala d\'attesa, partita): il tasto è sempre a **72px da sinistra, 8px dall\'alto, 28×28px**, stessa altezza e stessa riga dell\'interruttore del tema, con **41px di spazio** prima di “Classifica”; il primo contenuto di ogni pagina comincia a **44px** o più, quindi mai sotto la barra.',
          'Verificato anche il comportamento: il tasto **chiede conferma** durante una partita o in una stanza (con “no” si resta in partita, con “sì” si esce e si torna alla home) e **notifica il server** quando si lascia una stanza, come prima.',
        ],
      },
    ],
  },

  {
    version: '0.22.0',
    date: '2026-09-25',
    title: 'In classifica si vede prima la classifica',
    promo: {
      emoji: '🥇',
      headline: 'Prima chi è davanti a te',
      text: 'Aprendo la Classifica vedi subito la graduatoria dei giocatori. Le tue statistiche (partite, parole, storico) sono scese sotto: ci sono sempre, ma non ti nascondono più la classifica.',
    },
    changes: [
      {
        kind: 'improvement',
        items: [
          '**La classifica dei giocatori è la prima cosa che si vede.** Prima, in cima alla pagina, c\'era il riquadro **“Le tue statistiche”** — un blocco lungo (numeri personali, parole per lunghezza, storico partite) che spingeva la **graduatoria sotto la piega**: su un telefono bisognava scorrere per vedere chi era in testa, che è il motivo per cui si apre quella pagina. Ora l\'ordine è: filtri → **classifica** → statistiche personali.',
          '**Le statistiche restano complete e in evidenza**, sotto la classifica, separate da una riga: niente è stato tolto né nascosto in un pannello.',
        ],
      },
      {
        kind: 'tech',
        items: [
          'Verificato sul browser reale (non a occhio): l\'ordine dei blocchi nel DOM è `… tabs → filters → leaderboard__list → note → leaderboard__stats` e la posizione verticale delle statistiche (561px) è sotto quella della classifica (397px) a 390×745.',
        ],
      },
    ],
  },

  {
    version: '0.21.0',
    date: '2026-09-25',
    title: 'Le novità si leggono a colpo d\'occhio',
    promo: {
      emoji: '✨',
      headline: 'Cosa c\'è di nuovo, in tre righe',
      text: 'Nella pagina Novità ogni versione si apre con un riassunto chiaro: cosa cambia per chi gioca, senza termini tecnici. Se poi vuoi i dettagli, sono lì sotto.',
    },
    changes: [
      {
        kind: 'improvement',
        items: [
          '**Ogni versione ha una card di riassunto** in cima: un titolo e due-tre righe in **linguaggio non tecnico** che dicono cosa ci guadagni a giocare (es. «Parla con chi gioca con te», «La partita non si perde più»). Prima bisognava leggere l\'elenco puntato — spesso pieno di dettagli per sviluppatori — per capire se la versione valeva la pena.',
          '**I dettagli tecnici restano dove sono**: la card riassume, l\'elenco sotto documenta. Niente è stato tolto.',
        ],
      },
      {
        kind: 'fix',
        items: [
          '**I grassetti e i corsivi ora si vedono davvero.** Le note di rilascio sono scritte con grassetti, corsivi e frammenti di codice fin dall\'inizio, ma la pagina li mostrava **così com\'erano, con gli asterischi e i backtick in vista**: 251 grassetti, 21 corsivi e 201 frammenti di codice finivano a schermo come simboli. Ora sono formattati come si deve.',
        ],
      },
      {
        kind: 'tech',
        items: [
          'Il campo `promo` è **opzionale**: le versioni più vecchie non ce l\'hanno e la pagina le mostra come prima (nessuna card vuota, nessun segnaposto inventato).',
          'Il testo promozionale vive **accanto** alle note di rilascio (`version.ts`), non in un file separato: due elenchi paralleli finirebbero per disallinearsi, ed è esattamente il tipo di divergenza che questa pagina dovrebbe evitare.',
        ],
      },
    ],
  },

  {
    version: '0.20.0',
    date: '2026-09-25',
    title: 'Invita con un link (e la home sta in una schermata)',
    promo: {
      emoji: '🔗',
      headline: 'Invita chi vuoi con un link',
      text: 'Mandi il link della stanza in chat e chi lo apre trova il codice già pronto: un tocco ed è in partita con te. E la schermata iniziale non si scorre più: c\'è tutto sotto il pollice.',
    },
    changes: [
      {
        kind: 'feature',
        items: [
          '**Invita gli amici con un link, non solo con un codice.** In sala d\'attesa c\'è il tasto **Condividi l\'invito**: si apre il foglio di condivisione del telefono (WhatsApp, Telegram, mail…) con già scritti il messaggio e il **link della stanza**. Chi lo riceve apre il gioco e trova il **codice già nel campo “Entra”**, con una riga che spiega cosa fare: un tocco e sei dentro.',
          '**Se la condivisione non c\'è, il link si copia.** Sui browser desktop (e nella WebView dell\'app Android) il foglio di condivisione può non esistere: in quel caso il link finisce negli **appunti** con l\'avviso “Link copiato! Incollalo dove vuoi”. C\'è anche un tasto **Copia il link** separato, per chi preferisce gli appunti alla condivisione. Se persino gli appunti sono negati, il link viene **mostrato a schermo** invece di sparire in silenzio.',
        ],
      },
      {
        kind: 'improvement',
        items: [
          '**La home entra in una schermata sola.** Prima servivano ~980px: su un telefono moderno (~750px utili sotto le barre del browser) il codice stanza e le voci in fondo restavano **fuori schermo**, e per giocare in due bisognava scorrere. Ora la home è ~700px: l\'icona della **margherita passa da 86px a 40-48px**, il titolo e i testi si stringono, i due pulsanti principali scendono da 54px a 44px e i crediti vanno su righe più piccole. **Niente più scorrimento** su iPhone 15 / Pixel 8 e nell\'app.',
          '**Sui telefoni bassi (iPhone SE, barre del browser invadenti) si stringe ancora**, con due soglie di altezza: sotto 740px sparisce il motto (decorativo) e sotto 620px anche il conteggio delle schede, che si trova comunque nella pagina delle schede. I comandi restano tutti.',
        ],
      },
      {
        kind: 'tech',
        items: [
          'Il link è `?stanza=CODICE` sull\'indirizzo da cui si gioca, **non** su quello del server delle stanze: chi apre il link carica l\'app (che sa già a quale server parlare) e poi entra nella stanza. Funziona sia col frontend e il server sullo stesso dominio, sia con il frontend su CDN e il server altrove.',
          'Il parametro viene **tolto dall\'indirizzo appena letto**: un invito si consuma una volta sola, altrimenti tornando alla home dopo una partita ricomparirebbe il codice della stanza precedente nel campo “Entra”, come se l\'invito fosse appena arrivato.',
          'Costruzione e lettura del link sono **logica pura e testata** (`net/roomLink.ts`, 10 test): codice normalizzato (4-6 caratteri, niente simboli), invito precedente sostituito invece che accumulato, frammento rimosso, indirizzi manomessi che non fanno esplodere nulla.',
          'Nessun plugin nativo aggiunto per la condivisione: si usa `navigator.share` quando c\'è e la clipboard come ripiego. Un `@capacitor/share` darebbe il foglio di sistema anche nella WebView dell\'app, ma richiede una ricompilazione nativa: se serve, è il passo successivo.',
        ],
      },
    ],
  },

  {
    version: '0.19.0',
    date: '2026-09-25',
    title: 'Parla con la stanza: tieni premuto il microfono',
    promo: {
      emoji: '🎤',
      headline: 'Parla con chi gioca con te',
      text: 'Tieni premuto il microfono e parla: ti sentono tutti, come al telefono. Vedi chi sta parlando, puoi zittirti quando vuoi. Nessuna registrazione: la voce vive solo mentre la dici.',
    },
    changes: [
      {
        kind: 'feature',
        items: [
          '**La voce arriva in multiplayer.** In basso a destra c\'è un tasto con il **microfono**: si **tiene premuto** e si parla, e gli altri della stanza sentono la voce **mentre si parla** — circa **0,2 secondi** di ritardo, quindi è una conversazione, non un messaggio vocale da ascoltare dopo. Funziona in lobby (per accordarsi prima di partire), durante la partita e a fine partita.',
          '**Si vede chi sta parlando**: accanto al nome, in classifica e in lobby, compaiono **tre barrette animate**. Con più giocatori è l\'unico modo per sapere chi ha la voce, e non serve guardare il tasto.',
          '**Tasto per silenziarsi** (sopra al microfono): spegne il proprio microfono per la sessione, per quando in casa c\'è rumore. Il silenziamento **non viene ricordato** alla sessione successiva: ritrovarsi col microfono chiuso da ieri sarebbe una sorpresa sgradevole.',
          '**Niente registrazioni e niente archivio.** L\'audio esiste solo mentre viene pronunciato: il server lo **inoltra e basta**, non lo salva da nessuna parte, e chi non è nella stanza non riceve nulla.',
        ],
      },
      {
        kind: 'improvement',
        items: [
          '**Il tasto non ha etichetta**: durante una partita lo spazio è poco e l\'icona del microfono dice già tutto. Si **illumina e pulsa** mentre trasmette, così si capisce che il microfono è aperto anche senza guardare l\'indicatore del sistema.',
          '**Il rilascio viene intercettato su tutta la finestra**, non solo sul tasto: se il dito scivola fuori dal pulsante, se arriva una telefonata o se l\'app va in background, la voce si ferma comunque. Un microfono che resta aperto perché il dito è uscito dal pulsante sarebbe il difetto peggiore di questa funzione.',
          '**Il microfono si chiude da solo dopo un minuto** di silenzio (e uscendo dalla stanza), per non tenere la traccia audio aperta per una partita intera se non si parla mai.',
        ],
      },
      {
        kind: 'tech',
        items: [
          '**Audio in PCM a 16 kHz mono, pacchetti da 64 ms** (~32 KB/s per voce). Niente WebRTC: per un “tieni premuto” dentro una partita non servono signaling, STUN e TURN, e la differenza di ritardo (0,2 s contro 0,05 s) non vale la complicazione. L\'audio esce da un **AudioWorklet** che decima e impacchetta i campioni mentre si parla, quindi il ritardo è quello di un pacchetto, non quello di una clip registrata.',
          'Chi ascolta accoda i pacchetti con un **buffer di 120 ms** (`net/voiceChat.ts`): assorbe i ritardi della rete senza rendere la voce “lontana”. Se la coda supera i 600 ms (rete bloccata, pagina in background) ci si riallinea, perché meglio un taglio che una voce in ritardo di due secondi.',
          '**La voce di chi parla non torna mai indietro** (il server usa `socket.to` invece di `io.to`): con le casse accese sarebbe un eco sulla propria voce a ogni frase.',
          'I limiti stanno tutti in `VoiceRelay` (`apps/server/src/voice.ts`), logica **pura** rispetto al tempo e quindi testata senza socket e senza timer: al massimo **4 voci insieme** (ogni voce aperta costa banda a tutti gli ascoltatori, non solo a chi parla), massimo **40 pacchetti al secondo** per giocatore e pacchetti di dimensione valida. Il posto di chi parla si libera al rilascio del tasto o dopo 3 secondi di silenzio, così un client che sparisce non blocca il canale.',
          'Verifica **end-to-end** (`tests/e2e/voice.mjs`): pacchetti ricevuti da tutti tranne chi parla, nessun audio da chi non ha aperto il canale, pacchetti malformati scartati, tetto alle voci, posto liberato da rilascio e da disconnessione. Il test ha scoperto un difetto **serio e preesistente**: un client che emetteva un evento **senza callback** faceva cadere l\'intero server (`ack is not a function`, bastava un `emit`). Tutti i gestori con ack usano ora un ack sicuro.',
          'Il worklet è un **file a parte** con hash nel nome (`vite.config.ts`, `assetsInlineLimit`): sotto la soglia di default Vite lo avrebbe incorporato come `data:` URL, che dipende dal CSP della pagina e dalle regole della WebView nell\'app Android.',
          'Il worklet non può importare le costanti condivise (vive in un contesto a sé), quindi le ricopia: un test (`voiceCapture.test.ts`) verifica che frequenza e dimensione dei pacchetti **non divergano** da quelle del server, altrimenti la voce smetterebbe di funzionare in partita.',
        ],
      },
    ],
  },

  {
    version: '0.18.0',
    date: '2026-09-25',
    title: 'Podio di fine partita e barra in alto allineata',
    promo: {
      emoji: '🏆',
      headline: 'La premiazione sul podio',
      text: 'A fine partita i primi tre salgono sul podio con i loro avatar: corona al vincitore, alone che pulsa e coriandoli. Il podio sale a scaglioni, dal terzo al primo.',
    },
    changes: [
      {
        kind: 'feature',
        items: [
          '**Podio di fine partita in multiplayer.** Alla fine della partita i primi tre compaiono su un podio, con **avatar o foto**, nome e punti: il vincitore è al centro, sulla pedana più alta, con la **corona** e un alone che pulsa. Le pedane **salgono** una dopo l\'altra (dal terzo al primo) e qualche coriandolo cade sulla scena. Il podio **non sostituisce** la classifica: sotto resta l\'elenco completo con tutte le parole di ognuno.',
        ],
      },
      {
        kind: 'improvement',
        items: [
          '**Barra in alto allineata.** L\'icona del tema era un cerchio da 38px, più alto di Classifica, Parole e versione (28px): si vedeva subito che le icone non erano alla stessa altezza. Ora c\'è **una sola misura** per tutti i comandi della barra (`--topbar-h`), quindi i due gruppi — a sinistra e a destra — sono allineati e nessuna icona sporge.',
          '**Il tema ora è un vero interruttore.** Prima era un pulsante che scambiava l\'icona 🌙/☀️; ora la **pallina scorre** da un lato all\'altro e porta l\'icona del tema attivo, con un rimbalzo morbido al cambio. Lo stato si legge a colpo d\'occhio, senza dover interpretare quale delle due icone sia quella corrente.',
        ],
      },
      {
        kind: 'tech',
        items: [
          'L\'interruttore del tema è un elemento con `role="switch"` e `aria-checked`: i lettori di schermo lo annunciano come interruttore (acceso/spento), non come pulsante generico.',
          'Le animazioni del podio (entrata a scaglioni, alone, coriandoli) usano **solo CSS** e ricadono nel blocco globale `prefers-reduced-motion`, che le disattiva per chi lo richiede.',
          'Il podio è un componente a sé (`components/Podium.tsx`): la schermata di riepilogo resta dedicata a classifica e parole.',
        ],
      },
    ],
  },

  {
    version: '0.17.1',
    date: '2026-09-22',
    title: 'Rientro automatico in partita quando la rete si riconnette',
    promo: {
      emoji: '📶',
      headline: 'La partita non si perde più',
      text: 'Se la rete fa i capricci o il telefono va in background, il gioco rientra da solo nella stanza: riprendi a giocare con i tuoi punti, senza rifare nulla.',
    },
    changes: [
      {
        kind: 'fix',
        items: [
          "**Niente più \"Non in una stanza\" quando la rete fa i capricci.** Se il collegamento cade e torna da solo (rete instabile, telefono in background), il gioco ora **rientra nella partita** e riprende a inviare le parole. Prima poteva comparire l'avviso rosso a ogni parola composta, pur essendo ancora in partita con la griglia davanti: il server aveva perso il legame con quel collegamento e lo trattava come se non fosse in una stanza.",
        ],
      },
      {
        kind: 'tech',
        items: [
          'Il rientro dopo una riconnessione usa un evento dedicato (`room:rejoin`): il legame stanza ↔ socket è ricostruito **senza** far ripartire la partita né duplicare il giocatore. Il client rientra appena il socket torna connesso e, come rete di sicurezza, ritenta una volta l\'invio se il server risponde ancora \'non in stanza\'.',
        ],
      },
    ],
  },

  {
    version: '0.17.0',
    date: '2026-09-22',
    title: 'Riepilogo arcade, classifica separata e countdown a ogni round',
    promo: {
      emoji: '🎬',
      headline: 'Il riepilogo diventa uno show',
      text: 'A fine round la partita si rivede come in TV: i concorrenti in basso e le parole che si accendono una alla volta, col punteggio che sale. E il 3-2-1 c\'è a ogni round.',
    },
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
    promo: {
      emoji: '⏱️',
      headline: 'Più parole, meno sorprese',
      text: 'Quasi 14.000 parole in più che prima il gioco rifiutava senza spiegazione, e un promemoria sonoro negli ultimi dieci secondi: sai sempre quanto tempo ti resta.',
    },
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
    promo: {
      emoji: '🎯',
      headline: 'Tre livelli, tutti onesti',
      text: 'Facile vuol dire davvero facile: ogni schermata ha il numero di parole dichiarato (~126, ~59 o ~28) e il punteggio massimo non balla più da una partita all\'altra.',
    },
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
    promo: {
      emoji: '📖',
      headline: 'Schede equilibrate, dizionario affidabile',
      text: 'Stessa difficoltà, stessa sfida: il punteggio massimo di una scheda non fa più salti enormi. E nella pagina Parole vedi cosa si può comporre e cosa esiste nel dizionario.',
    },
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
