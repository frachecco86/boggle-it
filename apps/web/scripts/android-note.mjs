// Ricorda all'utente cosa serve per la build Android e dove trovare i risultati.
console.log(`
┌─ App Android (Capacitor) ──────────────────────────────────────────────┐
│ Web sincronizzato in apps/web/android/app/src/main/assets/public       │
│                                                                        │
│ Per compilare servono JDK 21 + Android SDK (Android Studio):           │
│   cd apps/web/android && ./gradlew assembleDebug                       │
│   → android/app/build/outputs/apk/debug/app-debug.apk                  │
│                                                                        │
│ Release firmata (AAB per gli store):                                   │
│   ./gradlew bundleRelease                                              │
│   → android/app/build/outputs/bundle/release/app-release.aab           │
│                                                                        │
│ Imposta VITE_SERVER_URL in .env prima di cap:sync per il multiplayer.  │
└────────────────────────────────────────────────────────────────────────┘`);
