# App Android e pubblicazione

Guida pratica: come costruire l'APK/AAB di Boggle-IT con Capacitor e dove
pubblicarlo **gratis**.

---

## 1. Requisiti per compilare

| Cosa | Versione | Note |
|---|---|---|
| **JDK** | 21 | Capacitor 8 lo richiede. Android Studio lo include già |
| **Android SDK** | API 35 | Installabile da Android Studio (SDK Manager) |
| **Node** | 22+ | Per buildare il web e sincronizzare Capacitor |

### Senza Android Studio (solo riga di comando)

Verificato su Linux: bastano JDK e i command-line tools, **senza root**.

```bash
# JDK 21 (Temurin)
mkdir -p ~/android-toolchain/jdk
curl -L https://api.adoptium.net/v3/binary/latest/21/ga/linux/x64/jdk/hotspot/normal/eclipse \
  | tar xz -C ~/android-toolchain/jdk --strip-components=1

# Android command-line tools
mkdir -p ~/android-sdk/cmdline-tools
curl -L -o /tmp/cmdline.zip https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip
python3 -c "import zipfile;zipfile.ZipFile('/tmp/cmdline.zip').extractall('/tmp/clt')"
mv /tmp/clt/cmdline-tools ~/android-sdk/cmdline-tools/latest
chmod +x ~/android-sdk/cmdline-tools/latest/bin/*   # lo zip non conserva i permessi

export JAVA_HOME=~/android-toolchain/jdk
export ANDROID_HOME=~/android-sdk
yes | $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager --licenses
$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager \
  "platform-tools" "platforms;android-35" "build-tools;35.0.0"
```

Poi tutto si riduce a un comando:

```bash
./tools/build-apk.sh          # APK di debug
./tools/build-apk.sh release  # AAB per gli store
```

Lo script imposta `JAVA_HOME`/`ANDROID_HOME`, builda il web, esegue `cap sync`,
scrive `local.properties` e compila. Se preferisci Android Studio, apri
`apps/web/android` e usa `Run`.

---

## 2. Build dell'app

```bash
# URL del server per il multiplayer (una volta sola)
echo 'VITE_SERVER_URL=https://tuo-server.up.railway.app' > .env

# Compila (build web + cap sync + gradle)
./tools/build-apk.sh
```

Output:

- debug: `apps/web/android/app/build/outputs/apk/debug/app-debug.apk`
- release: `apps/web/android/app/build/outputs/bundle/release/app-release.aab`

Misurato: **14.6 MB** l'APK debug, build in ~3 minuti. Contiene web, 480 schede,
6 tracce musicali, font e icone (l'AI scarica i modelli al primo uso, vedi §3).

### Firma della release

Senza firma l'AAB non è pubblicabile. Crea una keystore **una volta** e
conservala con cura (se la perdi non puoi più aggiornare l'app):

```bash
keytool -genkey -v -keystore boggle-release.jks \
  -keyalg RSA -keysize 2048 -validity 10000 -alias boggle
```

Poi in `apps/web/android/app/build.gradle`:

```gradle
android {
  signingConfigs {
    release {
      storeFile file("../../boggle-release.jks")
      storePassword System.getenv("BOGGLE_STORE_PASSWORD")
      keyAlias "boggle"
      keyPassword System.getenv("BOGGLE_KEY_PASSWORD")
    }
  }
  buildTypes {
    release {
      signingConfig signingConfigs.release
    }
  }
}
```

> **Non committare** la keystore né le password: il `.gitignore` di Android già
> esclude `*.jks` e `*.keystore`.

---

## 3. Cosa funziona offline

L'APK include l'interfaccia, le **480 schede** e le **6 tracce musicali**:

| Funzione | Offline | Online |
|---|---|---|
| Single player | ✅ | ✅ |
| Foto profilo (filtri canvas) | ✅ | ✅ |
| Registrazione suoni parole | ✅ (salvati in locale) | ✅ (sincronizzati) |
| Musica di sottofondo | ✅ | ✅ |
| Catalogo schede / pagina scheda | ✅ (bundle) | ✅ (server, sempre aggiornato) |
| **Multiplayer** | ❌ | ✅ |
| **Profili su più dispositivi** | ❌ | ✅ |

Il server si configura con `VITE_SERVER_URL` **prima** di `cap:sync`.

---

## 4. Dove pubblicare gratis

Il codice è già pubblico su GitHub, quindi valgono tutte le opzioni.

### 4.1 GitHub Releases + Obtainium — **consigliato per iniziare**

Costo: **0**, nessuna burocrazia, pubblicazione immediata.

```bash
# Crea un tag e allega l'APK firmato
git tag v1.0.0 && git push origin v1.0.0
# Su GitHub: Releases -> Draft a new release -> allega app-release.apk
```

Gli utenti installano l'APK direttamente, oppure con
**[Obtainium](https://github.com/ImranR98/Obtainium)**, che lo aggiorna
automaticamente a ogni nuova release. È lo standard de-facto per le app
open source fuori da Play Store.

### 4.2 IzzyOnDroid — **repo F-Droid, gratis**

Un repository di app open source che si aggiunge a F-Droid. Ottimo per la
scoperta: gli utenti di F-Droid lo hanno già configurato.

1. Apri una *issue* di richiesta su <https://gitlab.com/IzzyOnDroid/repo>
2. Servono: repo GitHub pubblico, **tag con release** contenente un APK firmato,
   licenza chiara, e un `fastlane/metadata/android/` con descrizione e screenshot.
3. Se approvi, l'aggiornamento è automatico a ogni tag.

### 4.3 F-Droid principale

Costo 0, ma processo di revisione più lungo e regole stringenti:

- build riproducibile dai sorgenti, niente binari proprietari;
- niente servizi traccianti (Google Play Services, Firebase, Crashlytics);
- il testo dell'app deve evitare "Google Play", "Play Store".

Invia una *Request For Packaging* su <https://gitlab.com/fdroid/rfp>.

> Con Capacitor il build è già riproducibile, ma il file
> `capacitor.config.json` e le dipendenze npm vanno fissate con lockfile
> (già presente: `pnpm-lock.yaml`).

### 4.4 Amazon Appstore

Costo: **0** (nessuna quota di iscrizione). Accetta app anche closed source.
Processo di revisione semplice, marketplace piccolo ma reale.
<https://developer.amazon.com/apps-and-games>

### 4.5 Samsung Galaxy Store

Costo: **0**. Richiede un account Samsung e la revisione. Utile per chi ha
dispositivi Samsung (fetta ampia del mercato Android in Italia).
<https://seller.samsungapps.com>

### 4.6 Huawei AppGallery

Costo: **0**. Alternativa per dispositivi Huawei senza Google Play.
<https://developer.huawei.com/consumer/en/appgallery/>

### 4.7 Altri store gratuiti

| Store | Costo | Note |
|---|---|---|
| **APKPure** | 0 | publisher account gratuito, self-service |
| **Aptoide** | 0 | upload diretto, policy permissive |
| **Uptodown** | 0 | previa richiesta di pubblicazione |

---

## 5. Confronto rapido

| Store | Costo | Open source richiesto? | Tempi | Aggiornamenti automatici |
|---|---|---|---|---|
| **GitHub Releases** | 0 | no | immediato | no (serve Obtainium) |
| **IzzyOnDroid** | 0 | **sì** | giorni | sì (a ogni tag) |
| **F-Droid** | 0 | **sì, rigido** | settimane | sì |
| **Amazon** | 0 | no | giorni | manuale |
| **Samsung** | 0 | no | giorni | manuale |
| **Huawei** | 0 | no | giorni | manuale |
| **Google Play** | 25 $ una tantum | no | giorni | automatico |

**Percorso consigliato**: GitHub Releases → IzzyOnDroid → Amazon/Samsung.
Google Play resta l'unico con costo (25 $ una tantum, non ricorrente) e lo
aggiungi solo se vuoi la massima visibilità.

---

## 6. Note tecniche

- **Microfono**: Android richiede il permesso a runtime. Capacitor lo chiede
  automaticamente al primo `getUserMedia`; il manifest dichiara `RECORD_AUDIO`.
- **Foto**: l'input `<input type="file" accept="image/*">` apre il selettore di
  sistema. Nessun permesso di storage è necessario (photo picker).
- **Musica**: le tracce sono nel bundle, quindi partono subito. In Android
  l'autoplay è bloccato finché non c'è un gesto: l'app sblocca l'audio al primo
  tocco (come sul web).
- **Dimensioni**: APK ~14 MB (12 MB di asset: 480 schede + 6 tracce).
