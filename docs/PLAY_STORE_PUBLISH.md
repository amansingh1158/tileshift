# Play Store Publishing Checklist — 2048 Puzzle

Goal: publish a signed Android App Bundle (AAB) to Google Play Console.

## 0. Prerequisites (outside this repo)
- [ ] Google Play Developer account ($25 one-time): https://play.google.com/console
- [ ] Google Play Games Services (for leaderboards/achievements) — enable via Play Console → your app → Play Games Services
- [ ] Decide developer name, support email, privacy policy URL (host it, e.g. GitHub Pages / Netlify)

## 1. App identity & signing
- [ ] Pick a unique `applicationId` (currently `com.yourname.twozerofour8` in capacitor.config.json) — CANNOT be changed after first upload
- [ ] Generate a release keystore (keep it safe — it is the only way to update the app):
  ```
  keytool -genkeypair -v -keystore release.keystore -alias 2048 -keyalg RSA -keysize 2048 -validity 10000
  ```
- [ ] Configure signing in `android/app/build.gradle` (keystore path, alias, passwords) — see build.gradle `signingConfigs`
- [ ] Never commit the keystore or passwords. Store passwords in `~/.gradle/gradle.properties` or env vars.

## 2. Build the release AAB
- [ ] `npm run assets` (icons) then `npm run cap:sync`
- [ ] `cd android && gradlew.bat bundleRelease`
- [ ] Output: `android/app/build/outputs/bundle/release/app-release.aab`
- [ ] Smoke-test the debug APK on a physical device/emulator first:
  `npm run android:apk` → `android/app/build/outputs/apk/debug/app-debug.apk`

## 3. Store listing assets (Play Console → your app → Store listing)
- [ ] App name: `2048 Puzzle`
- [ ] Short description (80 chars), full description (~500 chars) — see below
- [ ] Icon: 512×512 PNG (use `app/icons/icon-512.png` or a designed one)
- [ ] Feature graphic: 1024×500 JPG/PNG (design required)
- [ ] Phone screenshots: 2–8 (min 320px, max 3840px); take from a real device at 16:9/9:16
- [ ] Category: Games → Puzzle
- [ ] Content rating questionnaire → target "Everyone" (3+)
- [ ] Target audience: 13+, no explicit sexual content, realistic violence none
- [ ] Data safety form — the app is fully offline with no collection; answer "no data collected/shared"

## 4. Release
- [ ] Use **app signing by Google Play** (recommended) — upload your own key as the upload key
- [ ] Create an internal test track, upload AAB, add testers, install and verify
- [ ] Promote to closed/alpha → open/beta → production
- [ ] Set country availability + pricing (Free)
- [ ] Play Games Services: create leaderboard(s) + achievements, add the web app's leaderboard service file to `android/app` per Google docs

## 5. Post-launch checklist
- [ ] Watch crash reports (Play Console → Android vitals)
- [ ] Update `android/app/src/main/res` launcher icon with a designed asset
- [ ] Add AdMob (Phase 7) only after core UX is validated by reviews
- [ ] Bump `versionCode`/`versionName` in `android/app/build.gradle` per release

## Suggested copy
- **Short:** "2048 Puzzle — slide & merge tiles to reach 2048. Play offline."
- **Long:** "2048 Puzzle is the classic number game. Swipe or drag to slide the tiles, merge equal tiles and reach 2048. Square boards from 3×3 to 8×8, rectangle boards up to 6×9, 4 themes, undo, and a fully offline experience with no data collection. Free, no account needed, works without internet."
- **Keywords:** 2048, puzzle, number merge, brain teaser, offline