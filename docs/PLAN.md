# Project Plan & Timeline — 2048 Puzzle → Play Store

**Stack:** Vanilla HTML5/CSS/JS game + Capacitor 8 Android wrapper.
**Why:** zero runtime deps → tiny APK, one codebase, instantly testable in a browser, later portable to PWA/iOS.

## Phase plan (calendar estimate for one developer)

| Phase | Scope | Effort | Status |
|---|---|---|---|
| 0 | Environment setup (Node, npm, Capacitor, verify JDK+Android SDK) | ~1 h | ✅ Done |
| 1 | Core engine (pure JS): grid, move/merge/spawn, score, win/game-over | ~3 h | ✅ Done |
| 1b | Engine unit tests (node:test) | ~1 h | ✅ Done (19 tests) |
| 2 | UI: rendering, tile animations, touch/mouse/keyboard input | ~4 h | ✅ Done |
| 3 | Features: board sizes, undo, continue-after-2048, themes, persistence | ~3 h | ✅ Done |
| 3b | PWA: manifest + service worker offline | ~1 h | ✅ Done |
| 4 | QA: tests + DOM boot smoke tests + manual browser pass | ~2 h | ✅ Done (29 tests) |
| 5 | Capacitor Android: add platform, icons, signed debug/release build | ~4 h | 🔄 In progress |
| 6 | Play Store readiness: listing assets, data-safety, Play Games Services, upload | ~6 h | ⏳ Next |

## Milestones
- **M1 (Day 1-2):** Playable game in the browser. ✅
- **M2 (Day 2-3):** Feature-complete + tested. ✅
- **M3 (Day 3-4):** Installable APK on a real device.
- **M4 (Day 4-6):** Signed AAB + Play Store listing submitted.
- **M5 (Day 7-10):** Review approval + internal test rollout + leaderboards live.

## Risks & mitigations
- **Play review times:** plan a 7-day buffer; start internal testing early.
- **Ads:** reference app is ad-supported. Add later (Phase 7) — AdMob via Capacitor plugin; keep gameplay ad-light to protect the 4.6★ UX.
- **Java toolchain on this machine:** JDK 17 is present (`~/.jdks/jbr-17.0.14`); Gradle 8.x needs 17+ — use it via `JAVA_HOME`.
- **App icon originality:** current icon is a generated 2048 tile; replace with a hand-made branded icon before the final release build.