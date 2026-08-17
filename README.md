# 2048 Puzzle

A complete, offline-first 2048 puzzle game (HTML5 + CSS + JS, no frameworks)
wrapped for Android with Capacitor. Modeled on the classic 2048 experience.

## Features
- Classic slide-and-merge 2048 gameplay with smooth tile animations
- Multiple board sizes: square 3×3 → 8×8 and rectangle 3×5 → 6×9
- Continue playing after reaching 2048
- Undo last move
- 4 color themes (Classic, Dark, Ocean, Candy)
- Score + persistent best score (localStorage)
- Swipe, mouse-drag, keyboard and on-screen D-pad input
- Offline support via Service Worker + PWA manifest
- Purely client-side — no accounts, no data collection

## Project structure
```
app/               Web game (Capacitor webDir)
  css/style.css    Styling + themes
  js/engine.js     Pure game logic (no DOM) — unit tested
  js/ui.js         Board view: rendering + animations
  js/storage.js    localStorage persistence
  js/main.js       Wiring: input, controls, boot
  manifest.webmanifest, sw.js
scripts/           Icon generator (pure Node PNG encoder)
tests/             Node test-runner suites (engine, UI smoke, full boot)
android/           Capacitor-generated Android project
docs/              Plans + Play Store publishing guide
```

## Commands
```bash
npm test          # run all test suites
npm run serve     # local web server on :8080
npm run assets    # regenerate PNG icons
npm run cap:sync  # sync web -> android
npm run android:apk  # debug APK
npm run android:aab  # release AAB (needs signing config)
```

## Publishing
See `docs/PLAY_STORE_PUBLISH.md` for the step-by-step Play Store checklist.