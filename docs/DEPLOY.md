# Deploy di Boggle-IT

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
| All'avvio (dizionario in `Set`, senza trie) | **168 MB** |
| Dopo il primo fine round (trie lazy, max 10 lettere) | **211 MB** |

Il trie del solver è **lazy**: viene costruito alla prima fine round, in ~150 ms.
Se la partita non arriva a fine round, quei ~45 MB non vengono mai allocati.
Il tetto è configurabile con `TRIE_MAX_WORD_LENGTH` (8 → ~24 MB, 10 → ~66 MB, illimitato → ~142 MB).

---

## Opzione A — Netlify (frontend) + Railway (server)

### A1. Server su Railway

1. Crea un nuovo progetto su [railway.com](https://railway.com) → **Deploy from GitHub repo**.
2. Seleziona il repository. Railway rileva il `Dockerfile` alla root automaticamente.
3. In **Variables** aggiungi:

   | Variabile | Valore |
   |---|---|
   | `CLIENT_ORIGIN` | `https://TUO-SITO.netlify.app,http://localhost:5173` |
   | `TRIE_MAX_WORD_LENGTH` | `10` |
   | `NODE_OPTIONS` | `--max-old-space-size=448` |

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
   | `VITE_DICTIONARY_URL` | `/dictionary` |

   `VITE_DICTIONARY_URL=/dictionary` fa caricare il dizionario dalla CDN Netlify
   (build già copiata in `public/dictionary/words.txt`), alleggerendo il server.

   > **Perché solo `words.txt` e non `words.br`**: Netlify comprime automaticamente i file
   > testuali (Brotli) in transito, quindi spedisce ~630 KB comunque. Un `.br` precompresso
   > **non** funzionerebbe: `DecompressionStream` nei browser supporta solo `gzip`/`deflate`,
   > non brotli, quindi il client non saprebbe decomprimerlo.

4. Deploy. L'URL sarà tipo `https://boggle-it.netlify.app`.

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
  docker build -t boggle-it .
  docker run -p 3001:3001 -e CLIENT_ORIGIN='*' boggle-it
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
