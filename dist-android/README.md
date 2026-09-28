# APK pubblicati

Questa cartella contiene gli **APK versionati** di Sbooble, pronti da distribuire
senza ricompilare. Sono gli stessi binari allegati alle GitHub Releases:
chi clona il repo li trova già.

## File

| File | Versione | Note |
|---|---|---|
| `sbooble-0.38.0-debug.apk` | 0.38.0 | `versionCode 18` — chat vocale (permesso `MODIFY_AUDIO_SETTINGS`), musica caricata dall'admin, griglia dritta su tablet, voce per tutti, invito non piu' localhost, home compatta, invito che entra subito, tasto apprendimento, sfoglia come tab, schede gia' giocate |
| `sbooble-0.37.1-debug.apk` | 0.37.1 | `versionCode 17` — la stanza usa le schede dell'admin |
| `sbooble-0.37.0-debug.apk` | 0.37.0 | `versionCode 16` — regole e punteggi in una finestra a sé |
| `sbooble-0.36.2-debug.apk` | 0.36.2 | `versionCode 15` — le schede Ale valgono su tutte le griglie |
| `sbooble-0.36.0-debug.apk` | 0.36.0 | `versionCode 14` — schede Ale 4×4/5×5/6×6 e apprendimento |
| `sbooble-0.12.1-debug.apk` | 0.12.1 | storico — `versionCode 13` |
| `sbooble-0.6.0-debug.apk` | 0.6.0 | storico — cablato **senza** server (multiplayer non funzionante, `.env` ignorato da Vite: corretto in 0.12.1) |

> L'APK 0.36.0 ha il multiplayer e la Classifica rotti per una configurazione CORS
> del server, **non** per un difetto del binario: il fix è lato server e vale anche
> per quel binario. Vedi `apps/server/src/corsOrigin.ts`.

Verifica integrità:

```bash
sha256sum dist-android/*.apk
# 59bcd60130c0e16617bc5d55878745ef7724d7ae4cf197d57b63b1faf6652f29  sbooble-0.38.0-debug.apk
# b6ac7bb4a2078da9d88f3a431bc6062c6ab2d6f980a8706ef58ad1d8bbe46df9  sbooble-0.37.1-debug.apk
# 71b477efe939828d779f1421e1d3c468f1428293448f7e88253bb57327ecd595  sbooble-0.37.0-debug.apk
# edc7435a18793e48a9b828587ae9c6764701d4694f6d5421fcaeba073340a4eb  sbooble-0.36.2-debug.apk
# 54c1a3693009bd43b1c5379396939322fa85032084d9d54def1b353f9a4bf4cc  sbooble-0.36.0-debug.apk
# 96599dd4eb592e0a730a58e5db060a645e7c87f51bb2c2b5f381bf07933f27ba  sbooble-0.12.1-debug.apk
# 58f60210395e5b2c9530ef2f4a84ef60dcae88bce66541c678e837af967203ba  sbooble-0.6.0-debug.apk
```

Installazione sul telefono:

```bash
adb install -r dist-android/sbooble-0.38.0-debug.apk
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
