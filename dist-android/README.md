# APK pubblicati

Questa cartella contiene gli **APK versionati** di Sbooble, pronti da distribuire
senza ricompilare. Sono gli stessi binari allegati alle GitHub Releases:
chi clona il repo li trova già.

## File

| File | Versione | Note |
|---|---|---|
| `sbooble-0.12.1-debug.apk` | 0.12.1 | `versionCode 13` — server `boggle-it-production.up.railway.app` |
| `sbooble-0.6.0-debug.apk` | 0.6.0 | storico — cablato **senza** server (multiplayer non funzionante, `.env` ignorato da Vite: corretto in 0.12.1) |

Verifica integrità:

```bash
sha256sum dist-android/*.apk
```

Installazione sul telefono:

```bash
adb install -r dist-android/sbooble-0.12.1-debug.apk
```

Oppure copia l'APK sul dispositivo e aprilo (richiede "Installa app da fonti
sconosciute").

## Cosa contiene l'APK

È un guscio **Capacitor**: il WebView carica i file statici di `apps/web/dist`,
cotti al momento del build. Dentro ci sono:

- interfaccia, logica single player, font e icone;
- **480 schede** del bundle offline (`bundled-schede/`, ~1.4 MB);
- **6 tracce musicali** + audio (~11 MB).

Il **multiplayer, i profili, la classifica e le schede nuove** arrivano dal
server, il cui URL è **inlinato a build-time** da `VITE_SERVER_URL` (vedi
`apps/web/vite.config.ts`, che legge il `.env` nella root del monorepo).

## Rigenerare un APK

```bash
echo 'VITE_SERVER_URL=https://tuo-server' > .env   # root del monorepo
./tools/build-apk.sh                                # debug
./tools/build-apk.sh release                        # AAB per gli store
```

Poi copia l'output qui con nome versionato:

```bash
cp apps/web/android/app/build/outputs/apk/debug/app-debug.apk \
   dist-android/sbooble-<versione>-debug.apk
```

> **Incrementa `versionCode`** in `apps/web/android/app/build.gradle` a ogni
> release: con un versionCode uguale o inferiore Android rifiuta l'aggiornamento
> sopra l'app già installata (`INSTALL_FAILED_VERSION_DOWNGRADE`).

## Cosa richiede un nuovo APK e cosa no

Utile per decidere se serve ricompilare o basta un deploy del server.

| Aggiornamento | Serve nuovo APK? |
|---|---|
| Schede, parole, regole multiplayer, classifica, profili | **No** — solo server (`apps/server`) |
| Testi, layout, colori, animazioni, logica single player | **Sì** — UI compilata nel WebView |
| Bundle schede offline, musica, font, icone, avatar | **Sì** — asset nel bundle |
| URL del server | **Sì** — inlinato a build-time |
| Nome app, appId, permessi, versionCode | **Sì** — metadati nativi |

Guida completa (toolchain, firma, store gratuiti): [`../docs/ANDROID.md`](../docs/ANDROID.md).
