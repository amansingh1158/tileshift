# Project Preferences

## Build workflow (IMPORTANT — developer preference)
- The Android app is built with **Android Studio + Kotlin**. Native Android code MUST be written in **Kotlin** (`.kt`), never Java.
- Prefer building via **Android Studio** when a human is doing the build; for automated/CLI builds use the Android Gradle plugin as configured.
- Always rebuild + run tests after any native or web change to confirm nothing broke.

## Android build commands (fallback for automated builds)
- Workdir: `D:\2048\android`
- `$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-21.0.12.8-hotspot"`
- `$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"`
- Debug APK: `.\gradlew.bat :app:assembleDebug`
- Release bundle: `.\gradlew.bat :app:bundleRelease`
- Cap sync must run from `D:\2048` (`npx cap sync android`).
- Kotlin plugin version: `org.jetbrains.kotlin:kotlin-gradle-plugin:2.3.0` (must be >= 2.3.0 to read AdMob's Kotlin 2.3 metadata).

## Testing
- Web tests: run from `D:\2048` with `node --test "tests\*.test.js"` (currently 55/55 pass).
- Always save release AABs as versioned copies under `D:\2048\builds\`.

## Key constraints
- Do not commit `android/keystore.properties`, `keystorepass.txt`, `release.keystore`, or `google-services.json` — these are secrets/sensitive.
- App package name: `com.tileshift.game`. Firebase project: `tile-shift-562ab`. AdMob app: `ca-app-pub-4443132965148233~8621958529`.