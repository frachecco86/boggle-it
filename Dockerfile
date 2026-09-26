# Immagine multi-stage per Sbooble.
#
# Contesto di build = root del monorepo.
#   Stage 1 (builder): installa tutto, genera il dizionario, builda server e web.
#   Stage 2 (runtime): copia solo artefatti + node_modules, esegue il server.
#
# Il web buildato è incluso: se vuoi il monolite same-origin, Express serve il frontend
# automaticamente. Se usi Netlify, l'endpoint /dictionary e Socket.IO restano comunque attivi.

# ---------- Stage 1: build ----------
FROM node:22-slim AS builder

RUN corepack enable
WORKDIR /app

# Manifest prima del codice: sfrutta la cache dei layer Docker.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
COPY packages/shared/package.json packages/shared/
COPY packages/dictionary/package.json packages/dictionary/

RUN pnpm install --frozen-lockfile

# Codice
COPY . .

# Controllo preventivo del contesto: se un .dockerignore esclude words.br (fonte
# versionata del dizionario) il build fallirebbe in modo poco chiaro. Meglio qui.
RUN node tools/check-context.mjs

# Dizionario (da words.br versionato: nessuna rete richiesta) + server + web
RUN pnpm --filter @boggle/dictionary build \
 && pnpm --filter @boggle/server build \
 && pnpm --filter @boggle/web build

# ---------- Stage 2: runtime ----------
FROM node:22-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

# node_modules del workspace: contiene express/cors/socket.io usati dal bundle.
# Copiarlo dal builder è più affidabile di un secondo `pnpm install`, perché i pacchetti
# workspace (@boggle/*) usano il protocollo `workspace:*` ed è già tutto risolto qui.
COPY --from=builder /app/node_modules ./node_modules

# Bundle del server (include @boggle/shared e @boggle/dictionary compilati)
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/server/package.json ./apps/server/package.json
COPY --from=builder /app/apps/server/node_modules ./apps/server/node_modules

# Frontend statico (opzionale: serve per il monolite same-origin)
COPY --from=builder /app/apps/web/dist ./apps/web/dist

# Catalogo schede di base (versionate). Le schede aggiunte dall'admin vivono in
# DATA_DIR/schede-extra: stesso volume dei profili, quindi un solo mount basta.
COPY --from=builder /app/packages/shared/schede ./packages/shared/schede

# Dizionario (serve ancora al server per validare in multiplayer e per generare
# schede dall'admin). Il client non lo scarica più.
COPY --from=builder /app/packages/dictionary/data/words.txt ./packages/dictionary/data/words.txt
COPY --from=builder /app/packages/dictionary/data/words.br ./packages/dictionary/data/words.br
COPY --from=builder /app/packages/dictionary/data/consonant-endings.txt ./packages/dictionary/data/consonant-endings.txt
# Fasce di frequenza (5k/20k/60k): servono all'admin per generare nuove schede.
# Senza questo file la generazione dell'admin fallisce ("fascia vuota").
COPY --from=builder /app/packages/dictionary/data/frequency-it.txt ./packages/dictionary/data/frequency-it.txt
# Indice lessicale (tag grammaticali + link Wikizionario). SENZA questo file la
# tab Dizionario del server resta VUOTA e i tag spariscono: era il bug per cui in
# produzione l'elenco del lessico non si vedeva. Il build di deploy lo genera ora
# anche nel percorso offline (`build-words.mjs`).
COPY --from=builder /app/packages/dictionary/data/word-index.br ./packages/dictionary/data/word-index.br
# Definizioni (modalità apprendimento): pannello "?" della parola trovata.
# Senza, il pannello ripiega sul link a Wikizionario (funziona comunque).
COPY --from=builder /app/packages/dictionary/data/definitions.br ./packages/dictionary/data/definitions.br
# Vocabolario comune NVdB e calibrazione "ale".
#
# NOTA: la calibrazione (`calibration.json`) è già pronta perché il catalogo
# versionato la include. Il vocabolario NVdB serve solo per RIGENERARE le schede
# ale con `pnpm gen:schede:ale`, che richiede anche `morph-it_048.txt` (escluso
# dall'immagine per dimensione): la rigenerazione delle schede ale si fa quindi
# in locale, non dentro il container. Il server non ne ha bisogno a runtime.
COPY --from=builder /app/packages/dictionary/data/ale ./packages/dictionary/data/ale

# Tool di estrazione audio da link (tab Musica dell'admin).
#
# `yt-dlp` scarica, `ffmpeg` converte in MP3. Si installano QUI e non nel builder
# perché servono a RUNTIME: il builder non li usa. Sono opzionali per il gioco —
# se mancassero, la tab Musica continuerebbe a funzionare con l'upload manuale
# (l'endpoint risponde 503 con le istruzioni).
#
# NOTA: `yt-dlp` è uno script Python, quindi serve `python3`; ffmpeg è il
# convertitore usato da yt-dlp con `--audio-format mp3`.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg python3 ca-certificates curl \
 && curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
      -o /usr/local/bin/yt-dlp \
 && chmod +x /usr/local/bin/yt-dlp \
 && apt-get purge -y curl \
 && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/*

# Dati persistenti: DB profili + schede generate dall'admin (`schede-extra/`)
# + MP3 caricati dall'admin (`music/`).
#
# UN SOLO volume basta per entrambi: i PaaS (Railway) consentono un volume per
# servizio, quindi teniamo tutto sotto /app/data.
#
# NOTA: qui NON si usa `VOLUME` — Railway non lo supporta e rifiuta il
# Dockerfile. Il volume si configura dalla piattaforma su /app/data.
#
# ATTENZIONE ai permessi: Railway monta i volumi come root, ma il container gira
# come `node`. Su Railway imposta `RAILWAY_RUN_UID=0`, altrimenti il DB non e'
# scrivibile. Vedi docs/DEPLOY.md.
ENV DATA_DIR=/app/data
RUN mkdir -p /app/data && chown -R node:node /app/data

ENV PORT=3001
#
# Il picco sale a ~370 MB quando si aprono le DEFINIZIONI (modalità
# apprendimento): `definitions.br` è caricato pigramente e resta in memoria.
# Senza apprendimento il server resta sui ~220 MB. 640 MB lascia margine per
# entrambi i casi senza esagerare (un tetto troppo alto rischia l'OOM del
# container, che di solito ne ha meno).
ENV NODE_OPTIONS=--max-old-space-size=640

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

USER node

CMD ["node", "apps/server/dist/index.js"]
