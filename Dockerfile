# Immagine multi-stage per Boggle-IT.
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

# Catalogo schede: le base versionate. (Le schede aggiunte dall'admin vivono in
# SCHEDE_EXTRA_DIR, montata come volume: non fanno parte dell'immagine.)
COPY --from=builder /app/packages/shared/schede ./packages/shared/schede

# Dizionario (serve ancora al server per validare in multiplayer e per generare
# schede dall'admin). Il client non lo scarica più.
COPY --from=builder /app/packages/dictionary/data/words.txt ./packages/dictionary/data/words.txt
COPY --from=builder /app/packages/dictionary/data/words.br ./packages/dictionary/data/words.br
COPY --from=builder /app/packages/dictionary/data/60000_parole_italiane.txt ./packages/dictionary/data/60000_parole_italiane.txt
COPY --from=builder /app/packages/dictionary/data/consonant-endings.txt ./packages/dictionary/data/consonant-endings.txt

# Profili SQLite: il DB vive in DATA_DIR. Senza un volume montato qui i profili
# (foto e suoni dei giocatori) si perdono a ogni nuovo deploy.
ENV DATA_DIR=/app/data
RUN mkdir -p /app/data && chown -R node:node /app/data
VOLUME ["/app/data"]

ENV PORT=3001
# Il picco misurato è ~211 MB: 448 MB lascia margine ampio senza rischiare l'OOM.
ENV NODE_OPTIONS=--max-old-space-size=448

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

USER node

CMD ["node", "apps/server/dist/index.js"]
