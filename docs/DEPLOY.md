# Deploy di Sbooble

Due opzioni. Scegli in base a quanto vuoi spendere e quanto vuoi semplificare.

| | Opzione A — Netlify + Railway | Opzione B — Monolite su Railway |
|---|---|---|
| Costo iniziale | **€0** (piani free) | **$5/mese** (Hobby, include $5 di credito) |
| Frontend | Netlify CDN (globale) | Express (same-origin) |
| Dizionario | Netlify CDN (autom. Brotli, 630 KB) | Express (Brotli) |
| Server | Railway Free (512 MB) | Railway Hobby (512 MB → 1 GB) |
| CORS / env | Da configurare (2 variabili) | Nessuna configurazione |
| Parti mobili | 2 piattaforme | 1 piattaforma |
| Rischio | OOM limite su 512 MB | Nessuno rilevante |

**Memoria misurata del server** (build di produzione, `node dist/index.js`):

| Stato | RSS |
|---|---|
| All'avvio (dizionario + catalogo schede) | **~170 MB** |
| Generazione schede dall'admin (pool trie) | picco ~350 MB |

Le parole valide arrivano dalle **schede pre-calcolate**: il server non costruisce più
il trie da solver, quindi il picco è molto più basso di prima (~211 MB).
`TRIE_MAX_WORD_LENGTH` non è più usato a runtime.

### Volume unico (profili + schede admin)

Il server scrive in `DATA_DIR` (default `/app/data`) tutto ciò che deve sopravvivere
ai deploy:

| Percorso | Contenuto |
|---|---|
| `/app/data/boggle.db` | profili: utente, foto, clip audio |
| `/app/data/schede-extra/` | schede generate dall'admin |

**Serve UN SOLO volume**, perché le schede dell'admin stanno dentro `DATA_DIR`.
I PaaS (Railway) consentono un volume per servizio: così non ne servono due.

#### Creare il volume su Railway

I volumi **non sono in Settings**. Si crea così:

1. **Command Palette**: `Ctrl+K` (o `⌘K`) → cerca `Volume`
2. oppure **tasto destro sul canvas vuoto** del progetto → voce del menu

Poi scegli il servizio e imposta il **mount path**:

```
/app/data
```

Se la voce non compare: il servizio deve avere **1 replica** (i volumi non
supportano più repliche) e il piano deve consentirlo (Free: 1 volume per progetto).

#### Permessi: `RAILWAY_RUN_UID=0` (importante)

Railway monta i volumi come **root**, ma il container gira come utente `node`
(`USER node` nel Dockerfile). Senza correzione il database **non è scrivibile** e
la registrazione fallisce. Aggiungi nelle Variables:

| Variabile | Valore |
|---|---|
| `RAILWAY_RUN_UID` | `0` |

Il `Dockerfile` **non dichiara `VOLUME`** (Railway rifiuta il Dockerfile in quel
caso): il volume si configura dalla piattaforma.

Senza volume i profili e le schede admin si perdono a ogni deploy; le schede di
base sono versionate nell'immagine e restano.

#### WAL e backup: attenzione al file singolo

SQLite è in modalità **WAL**: le scritture recenti restano in `boggle.db-wal`
finché non avviene un checkpoint. Un backup del **solo** `boggle.db` senza i file
`-wal`/`-shm` perderebbe i profili appena creati (verificato: il file principale
può contenere 4 KB, senza nemmeno la tabella, mentre il WAL ne ha 60+ KB).

Il server consolida automaticamente alla chiusura: su `SIGTERM`/`SIGINT` esegue
`PRAGMA wal_checkpoint(TRUNCATE)` e chiude, quindi `boggle.db` resta
autosufficiente anche da solo.

Per controllare o forzare il consolidamento (utile prima di copiare il volume):

| Rotta | Cosa fa |
|---|---|
| `GET /admin/db` | profili, byte del `.db` e del `-wal` |
| `POST /admin/db/checkpoint` | consolida il WAL nel file principale |

Entrambe richiedono il token admin (`Authorization: Bearer $ADMIN_TOKEN`).
Un `walBytes` maggiore di zero significa scritture non ancora consolidate.

---

## Opzione A — Netlify (frontend) + Railway (server)

### A1. Server su Railway

1. Crea un nuovo progetto su [railway.com](https://railway.com) → **Deploy from GitHub repo**.
2. Seleziona il repository. Railway rileva il `Dockerfile` alla root automaticamente.
3. In **Variables** aggiungi:

   | Variabile | Valore |
   |---|---|
   | `CLIENT_ORIGIN` | `https://TUO-SITO.netlify.app,http://localhost:5173` |
   | `ADMIN_TOKEN` | token lungo e casuale (`openssl rand -hex 24`) |
   | `NODE_OPTIONS` | `--max-old-space-size=448` |
   | `RAILWAY_RUN_UID` | `0` — necessario col volume (permessi) |
   | `DATA_DIR` | `/app/data` (default; è il mount del volume) |

   `PORT` viene iniettata da Railway: non serve impostarla.

4. In **Settings → Networking** genera il dominio pubblico. Otterrai qualcosa come
   `https://boggle-api-production.up.railway.app`.
5. Verifica: `curl https://TUO-DOMINIO.up.railway.app/health` deve rispondere
   `{"ok":true,...,"rssMb":...}`.

> **Piano Free**: 512 MB di RAM e $1 di credito/mese. Con 211 MB di picco una partita
> ci sta, ma tieni il trie costruito (`TRIE_MAX_WORD_LENGTH=10`) e monitora `rssMb`
> dall'endpoint `/health`. Se si avvicina a 450 MB, fai upgrade a Hobby ($5/mese).

### A2. Frontend su Netlify

1. Su [netlify.com](https://netlify.com) → **Add new site → Import an existing project**.
2. Collega il repository. Netlify legge il `netlify.toml` alla root:
   - build command: installa, genera il dizionario, builda il web
   - publish directory: `apps/web/dist`
3. In **Site configuration → Environment variables** aggiungi:

   | Variabile | Valore |
   |---|---|
   | `VITE_SERVER_URL` | `https://TUO-DOMINIO.up.railway.app` |

   `VITE_DICTIONARY_URL` non serve più: il client non scarica il dizionario, le
   parole arrivano dalle schede (incluso il bundle offline per l'app Android).

   `VITE_DICTIONARY_URL=/dictionary` fa caricare il dizionario dalla CDN Netlify
   (build già copiata in `public/dictionary/words.txt`), alleggerendo il server.

   > **Perché solo `words.txt` e non `words.br`**: Netlify comprime automaticamente i file
   > testuali (Brotli) in transito, quindi spedisce ~630 KB comunque. Un `.br` precompresso
   > **non** funzionerebbe: `DecompressionStream` nei browser supporta solo `gzip`/`deflate`,
   > non brotli, quindi il client non saprebbe decomprimerlo.

4. Deploy. L'URL sarà tipo `https://sbooble.netlify.app`.

> **Attenzione all'ordine**: `VITE_SERVER_URL` è una variabile **build-time**.
> Se la cambi, serve un nuovo deploy (non basta il restart).

### A3. Verifica finale

1. Apri il sito Netlify → la home deve caricare e il dizionario deve inizializzare.
2. Crea una partita → copia il codice → aprila in un'altra finestra → devono vedersi.
3. Controlla che il round parta con il countdown 3-2-1.

Se il multiplayer non si connette, apri la console del browser: se vedi errori CORS su
`/socket.io`, la variabile `CLIENT_ORIGIN` su Railway non corrisponde esattamente
all'URL Netlify (schema `https://` incluso, senza slash finale).

---

## Opzione B — Monolite su Railway

Più semplice: un solo servizio, niente CORS, `io()` si connette alla stessa origine.

1. Railway → **Deploy from GitHub repo** (rileva il `Dockerfile`).
2. **Nessuna variabile obbligatoria.** Il `Dockerfile` fa buildare anche il frontend e il
   server lo serve da `apps/web/dist` (rilevato automaticamente).
3. Genera il dominio pubblico e apri il sito.

Il `Dockerfile` cerca `apps/web/dist/index.html`: se esiste, Express serve il frontend
e aggiunge il fallback SPA; altrimenti resta solo API + Socket.IO.

---

### ⚠️ Il dizionario e il contesto di build

Il build usa **`words.br` versionato** (616 KB) come fonte: `ensure-words.mjs` lo
decomprime per ricreare `words.txt` senza toccare la rete.

**Non escludere `words.br` dal `.dockerignore`.** Se lo escludi, il build fallisce con:

```
✗ Né words.txt né words.br sono presenti in packages/dictionary/data/.
```

Per non ripetere l'errore, un controllo preventivo è integrato nel `Dockerfile` e nel
`netlify.toml` (gira prima della catena di build), ed è eseguibile a mano:

```bash
pnpm check:context
```

---

## Sviluppo locale

```bash
pnpm install
pnpm build:dict   # una volta sola: scarica e genera il dizionario
pnpm dev          # client :5173 (proxy Vite) + server :3001
```

Con il proxy Vite non serve configurare nulla: `VITE_SERVER_URL` vuoto → same-origin.

Test rapidi (round da pochi secondi):

```bash
ROUND_DURATION_MS=5000 COUNTDOWN_MS=700 ROUND_END_PAUSE_MS=1500 pnpm dev:server
pnpm test:e2e
```

---

## Note

- **Docker**: per buildare e provare l'immagine localmente:
  ```bash
  docker build -t sbooble .
  docker run -p 3001:3001 -e CLIENT_ORIGIN='*' sbooble
  ```
- **Dizionario**: le fonti grezze (19 MB) sono gitignored, ma **`words.br` È versionato**
  (616 KB). I deploy sono quindi **riproducibili e offline**: `pnpm --filter @boggle/dictionary build`
  ricrea `words.txt` da `words.br` senza toccare la rete (il sito UniBO risponde a volte 402).
  Per rigenerare da zero dalle fonti: `pnpm build:dict`.
- **Licenze**: i dati del dizionario derivano da Morph-it! → **CC BY-SA 2.0**.
  L'attribuzione è già mostrata nella home dell'app.
- **Fly.io**: alternativa equivalente a Railway se preferisci il pay-per-second
  (~$3,2/mese per 512 MB). Il `Dockerfile` funziona senza modifiche; serve solo un `fly.toml`
  con `internal_port = 3001` e `[http_service]`.
