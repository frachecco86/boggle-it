#!/usr/bin/env bash
# Compila l'APK di Sbooble da riga di comando, senza Android Studio.
#
# Perché uno script: la toolchain (JDK 21 + Android SDK) non è nel PATH di
# default e la sequenza ha qualche trappola (permessi di Gradle, sdk.dir,
# sincronizzazione del web). Qui è tutto in un posto.
#
# Prerequisiti (una volta sola):
#   1. JDK 21            → ~/android-toolchain/jdk
#   2. Android SDK (cmdline-tools) → ~/android-sdk
#   3. sdkmanager "platform-tools" "platforms;android-35" "build-tools;35.0.0"
#
# Uso:
#   ./tools/build-apk.sh            # APK di debug
#   ./tools/build-apk.sh release    # AAB per gli store (richiede firma, vedi docs/ANDROID.md)
set -euo pipefail

MODE="${1:-debug}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
JDK="$HOME/android-toolchain/jdk"
SDK="$HOME/android-sdk"

if [ ! -x "$JDK/bin/java" ]; then
  echo "✗ JDK 21 non trovato in $JDK"
  echo "  Scarica Temurin 21 e estrai in $JDK (vedi docs/ANDROID.md)"
  exit 1
fi
if [ ! -d "$SDK/platforms/android-35" ]; then
  echo "✗ Android SDK non trovato in $SDK (manca platforms/android-35)"
  echo "  Vedi docs/ANDROID.md per installarlo con sdkmanager"
  exit 1
fi

export JAVA_HOME="$JDK"
export ANDROID_HOME="$SDK"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"

echo "→ Build del web (schede incluse)…"
pnpm --filter @boggle/web build

echo "→ Sincronizzazione Capacitor…"
pnpm --filter @boggle/web exec cap sync android

# Gradle vuole sapere dov'è l'SDK: local.properties non è versionato.
echo "sdk.dir=$SDK" > "$ROOT/apps/web/android/local.properties"

cd "$ROOT/apps/web/android"
if [ "$MODE" = "release" ]; then
  echo "→ Compilazione AAB release…"
  ./gradlew bundleRelease --no-daemon
  OUT="app/build/outputs/bundle/release/app-release.aab"
else
  echo "→ Compilazione APK debug…"
  ./gradlew assembleDebug --no-daemon
  OUT="app/build/outputs/apk/debug/app-debug.apk"
fi

APK_ABS="$ROOT/apps/web/android/$OUT"
echo
echo "✓ Build completata: $APK_ABS"
ls -la "$APK_ABS" | awk '{printf "  dimensione: %.1f MB\n", $5/1048576}'
if [ "$MODE" != "release" ]; then
  echo "  installa con: adb install -r \"$APK_ABS\""
fi
