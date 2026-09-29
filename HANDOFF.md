# Latest handoff: Goal +5 report resolved; Seven-family engine fixes

Updated September 29, 2026 (America/New_York). This section supersedes the earlier session snapshot below.

The reported "9♥ Goal Shift +5 added +8" was **not** a single-action defect: a lone `goal5` adds exactly +5. The +8 reproduces only when two Nine declarations resolve in one LIFO batch (e.g. `goal5` then `goal3` declared in the response window) — legal per §6/§7, and both declaration lines appear in history. No rules change for that report.

The Full-profile fuzz used to verify this exposed three real defects, all fixed in `packages/intrilex/engine.ts`:

- `deep-draw` (6♠) charged its discard cost at resolution instead of declaration; the cost card stayed spendable during the response window (even offered as a counter against its own play) and crashed `NOT_IN_HAND` when spent. `commitWild` now commits all `targetIds` cost sources at declaration (deduped against `cardIds`), and Ultra-Black inner casts can no longer name the Ultra's own components as costs.
- `seven-hand` handled only 2 revealed cards — 7♠'s third revealed card vanished from the game. Now: taken card is Revealed-Until-Start, a `seven-gen` choice picks which remaining card declares, leftovers return to DP top. `seven-single` take also marks Revealed.
- `super-7` revealed 3 through the take-one flow (canonical ⭐7: reveal 2, declare each as a generated play in chosen order). Rewritten with a suspended task that opens the second generated declaration after the first play and nested children finish. Also fixed `peek` choice `held:true` double-counting Swap Bar cards in `everyCard`.

Gates: lint, typecheck, 148/148 Node tests (4 new regressions in `tests/intrilex.full.test.ts`), 400-game FC fuzz and 400-game Full fuzz both clean. Recorded in `STATUS.md`. No commit, push, or deployment.

### Ranked next steps

1. Implement the Reveals gap below (project `revealedHand`; expire `revealed` at Start with handle rotation) — now more visible since Seven/Topdeck flows mark `revealed` correctly.
2. Continue expanding Full coverage per `docs/INTRILEX_FULL_AUDIT.md` (Voltage, BJ recycle, Sudden Death endgame).
3. Obtain rules-owner rulings for source-map D-1 and D-3.
4. Configure/deploy the separate multiplayer server only when authorized; keep the Neocities server origin blank.

---

# Previous handoff: Face-Down Swap Bar fixed

Updated September 29, 2026 (America/New_York). This section supersedes the earlier session snapshot below.

Fixed the reported bug where Face-Down Swap Bar actions always failed with "This request could not be completed." The generated `swap-down` action carried only a slot `mode`, never the `cardId` of the hand card to give, so `perform` → `takeFromHand` threw `NOT_IN_HAND`; that engine code had no `ERROR_TEXT` entry, so the client showed the generic fallback.

Changes in `packages/intrilex/engine.ts`: `availableActions` enumerates one `swap-down` per face-down slot × hand card; the `perform` case drops dead pre-overwrite slot mutation and no longer marks the taken card Revealed-Until-Start (§18 grants none — only §26 Six Peek does). `packages/protocol/index.ts` maps `INVALID_ACTION`, `ACTION_UNAVAILABLE`, `NOT_IN_HAND` to real messages. Regression test added (`tests/intrilex.full.test.ts`, 23 Full tests). Gates: lint, typecheck, 143/143 Node tests pass. Recorded in `STATUS.md`.

**Follow-up gap found while tracing (unfixed):** `PlayerView.revealedHand` is declared and rendered in `GameBoard` but `projectGame` never populates it, and §10 "hide Revealed-Until-Start at recorded Start + rotate handle" is unimplemented — no `revealed` expiry in `startTurn`. Affects Peek, Raid, Anchor-Ace capture, Face-Up Draw, Exile rummage/recovery, Stack Theft.

### Ranked next steps

1. Implement the Reveals gap above (project `revealedHand`; expire `revealed` at Start with handle rotation).
2. Continue expanding Full coverage per `docs/INTRILEX_FULL_AUDIT.md` (Voltage, BJ recycle, Sudden Death endgame).
3. Obtain rules-owner rulings for source-map D-1 and D-3.
4. Configure/deploy the separate multiplayer server only when authorized; keep the Neocities server origin blank.

---

# Previous handoff: Full-profile generated-play pipeline fixed

Updated September 29, 2026 (America/New_York). This section supersedes the earlier session snapshot below.

Fixed the reported bug where a generated card that had to be Scrapped (Draw & Cast 10♣) silently did nothing: `choiceActions` offered `generated-scrap` but `resolveChoice` had no branch for it, so `MODES['generated-scrap']` was undefined. The same log exposed a second defect — generated composite plays (`8♣ + 8♦ · Absolute Scuttle`) never committed their partner `cardIds` from hand, so the 8♣ could counter the play it was part of.

Fixes are in `packages/intrilex/engine.ts` (+ `tapUntil: 'hold'` in `packages/intrilex/types.ts`): explicit `generated-scrap` → GY, held-card detachment from lingering zones (hand/GY/Swap Bar), composite `cardIds` commitment onto `item.cards` with scrapping on resolve/counter/fizzle, prefixed-mode normalisation (`wild-*`, `mimic:*`, `ultra-black:*`, `hold:*`), stack `tier`/`shield` for counter authority, mode-aware Scuttle legality (ordinary/Free/Absolute, ordinary-8-only bonus), A♠ Exile Counter, countered-3-Red rider, ⭐2 Hold untap-at-Start + hold-cast, per-FT limit resets, Nine `tapUntil: 'score'`, Peek Swap Bar removal, Topdeck recursion marker propagation.

Regression tests added in `tests/intrilex.full.test.ts` (22 Full tests now). Gates: lint, typecheck and all 142 Node tests pass. `STATUS.md` has the gate table; `docs/INTRILEX_SOURCE_MAP.md` records the resolution interpretations. D-1/D-3 rulings still pending — do not silently decide. No public deployment, commit, or push.

### Ranked next steps

1. Continue expanding Full coverage per `docs/INTRILEX_FULL_AUDIT.md` (Voltage, Swap Bar journeys, BJ recycle, Sudden Death endgame).
2. Obtain rules-owner rulings for source-map D-1 and D-3.
3. Configure/deploy the separate multiplayer server only when authorized; keep the Neocities server origin blank.
4. Re-run `npm run build`/`build:neocities` and e2e before any packaging.

---

# Latest handoff: Intrilex Full-profile engine reconstructed

Updated September 29, 2026 (America/New_York). This section supersedes the earlier session snapshot below.

The Full-profile engine layer in `packages/intrilex/engine.ts` was reconstructed after an accidental `git checkout` reverted the uncommitted work. First Contact behavior is preserved; Full branches on `full(s)`. All 132 Node tests pass (including 12 Full-profile tests), lint and typecheck are clean, both `npm run build` and `npm run build:neocities` succeed, and all 24 Playwright e2e tests pass (Chromium + Firefox, including the Full table public/private zones test). See the newest `STATUS.md` section for the gate table.

### What is now implemented

- `FULL_MODES` table and `infoFor` (~30 modes), `fullOrdinary` (suit-specific 3♠/4♠/6♠/7♠/J♠, 5 exile rummage, 10♥/♠/♦, 2/K♠ wild copy), `compositeActions` (Super, Court, Marriage, Sudden, Ultra), `superModes`, `fullChoices` for `Choice.kind === 'full'`.
- `perform`: `start-action`, `swap-down`, `swap-draw`, `draw-cast`, `voltage`, composite `cardIds`/`targetIds`.
- `resolve`: `draw-cast`, `foundation`, `bj-recycle` triggers; `resolveEffect` all Full modes; `resolveChoice` `'full'` kind.
- `scoreCard` Nine release, 10♣ Foundation, BJ recycle; `startTurn` Full Start Phase; `projectGame` Full public fields (exile, swapBar, suddenDeath, voltage); `createGame` Full setup (v3, Goal 21, Exile, Swap Bar).
- Counter resolution scraps all composite sources.

### Ranked next steps

1. Expand Full test coverage: Super/Ultra/Sudden modes, Voltage, Draw & Cast, Swap Bar down/up, Black Joker recycle, Exile recovery, deep draw, peek. The 12 current tests cover setup, privacy, Exile ordering, forged-command rejection, victory timing, Queen Court, Royal Marriage, Queen Aegis, Nine tap, Aegis blocking.
2. Reconcile `docs/INTRILEX_FULL_AUDIT.md` checklist items without dedicated tests.
3. Obtain rules-owner rulings for source-map D-1 and D-3; do not silently decide.
4. Configure/deploy the separate multiplayer server only when authorized; keep the Neocities bundle's server origin blank.

### Notes

- `packages/templates/index.ts` had invalid UTF-8 (mis-encoded `·`); fixed.
- `eslint.config.js` now ignores `release/**` (generated build artifacts).
- No public deployment, commit, or push occurred. Working tree changes are uncommitted.

---

# Latest handoff: Neocities + separate multiplayer

Upload target now specified: **https://ttsbrowser.neocities.org/**. Prepared payload: `release/ttsbrowser-neocities-upload.zip`, also unpacked under `release/ttsbrowser-neocities/upload/`; instructions and hashes are in the parent folder. Its existing homepage is “Learn Jakuv - Interactive Tutorial”; root upload replaces it, while `/tabletop/` preserves it. No upload performed. Static rebuild/typecheck and both target-origin browser smoke checks passed; the separate multiplayer URL remains blank. See the newest `STATUS.md` section.

Updated September 29, 2026 (America/New_York). This section supersedes the earlier session snapshot below.

The user explicitly chose a Neocities frontend plus a separate multiplayer server. The implementation keeps local play/lessons/templates on Neocities and opens shared multiplayer on the configured server's own origin. This preserves first-party guest cookies and the existing server privacy/persistence model; it does not issue cross-origin API requests from Neocities.

Read `docs/NEOCITIES.md` and the current section of `STATUS.md`. Build with `npm run build:neocities`; output is `dist/neocities`. Edit its `site-config.js` with the actual server HTTPS origin, then upload the contents to Neocities. `release/browser-tabletop-neocities.zip` contains those four files with an intentionally blank server setting. Do not mistake the example URL in the guide for a deployed server.

Final gates passed: lint, typecheck, 116 Node tests, 22 ordinary browser tests, 4 static/handoff browser tests, both builds. Logs and input hashes are in `artifacts/verification/neocities-*`. Source and upload archives were refreshed. No public deployment, commit or push occurred.

Next work: deploy/configure the separate server only when authorised and a target is known, set its HTTPS origin in the static configuration, then verify a real Neocities upload and shared-room creation/join/reload. Docker and real-device/WebKit checks and rules rulings remain open. Preserve the previous backup-test fix and all current working-tree changes.

---

# HANDOFF — continue Browser Tabletop from here

Updated September 29, 2026 (America/New_York).

Read `AGENTS.md` → `STATUS.md` → `docs/ACCEPTANCE.md` → `sources/BROWSER_TABLETOP_MASTER_PROMPT.md`. The contract and canonical rulebook outrank this file.

## Current state

The clean working tree at session start was `1ff9605`, not the staged tree described by the previous handoff. This continuation leaves a small uncommitted backup-test fix plus refreshed documentation and evidence. Inspect `git status` before editing; preserve these changes. No push or public deployment was performed.

**The previously owed final gate run is complete.** A clean-install isolated copy passed `npm ci` (0 reported vulnerabilities), lint, typecheck, 115/115 Node tests, 22/22 Chromium/Firefox tests, and production build. Production start, bundled online backup/fresh-path restore, recovered session/revision/cards, and dev/Vite proxy room creation also passed. See `STATUS.md` and `artifacts/verification/` for actual evidence and input hashes.

The initial run exposed a backup-test harness issue: synchronous CLI children blocked the in-process HTTP server and a failure left it running. `tests/backup.test.ts` now awaits asynchronous CLI execution and registers cleanup. All original assertions remain. All gates were rerun after that fix. Runtime application code was unchanged.

`release/browser-tabletop-src.tar.gz` was regenerated from the delivered source, docs and fresh evidence. Its sibling `.sha256` file and `source-manifest.json` support integrity checking. Private smoke databases and dependencies are excluded. The release directory is intentionally gitignored; regenerate after any later source change.

## Ranked next steps

1. Validate Docker on a capable host: `docker compose up --build`, readiness, play a room, restart and confirm persistence. Docker is absent here; acceptance row 42 stays UNVERIFIED.
2. Obtain rules-owner rulings for source-map D-1 (enabled-effect list) and D-3 (2 Solo Wild). Do not silently decide either. Update rules, source-named tests and capabilities together if a ruling changes behavior.
3. Verify WebKit/Safari and real mobile touch behavior. Current browser evidence covers Chromium/Firefox and emulated viewport sizes only.
4. Polish the mobile First Contact action panel (46vh) and overlapping counter labels in the editor preview. Fresh screenshots reproduce both issues. Keep rule legality and private projections unchanged.
5. Review the local changes and decide licensing/distribution/publication separately. No public deployment is authorised.

## Code map

- `packages/tabletop`: generic immutable commands, permissions, invariants, handle rotation, projections, undo policy.
- `packages/templates`: validated declarative schema, setup allow-list, raster validation and built-ins.
- `packages/intrilex`: authoritative First Contact engine, rule IDs, fixtures, lessons, own-view bot.
- `packages/protocol`: shared room and wire types.
- `apps/server`: HTTP/WebSocket routing, room authority, SQLite transactions/migrations, backup/restore.
- `apps/web`: React navigation, online rooms, boards, practice, lessons, template editor, presence and styles.
- `tests`, `e2e`: rules, privacy, persistence, templates, browser journeys, accessibility and performance.

## Invariants and environment

Only projections leave the server; host is not omniscient. Rotate hidden handles on hidden-zone entry/shuffle. Persist before acknowledgement; idempotent request IDs; authorization before freshness. Live RNG is CSPRNG. Imported templates are data only. Guided legality comes from `availableActions`. Do not weaken tests or rules.

Windows system Node is 22.14; npm scripts use project-local Node 24.21. Run scripts through npm/PowerShell; Git Bash shims may hit a blank `node` file. Background npm can leave child processes: identify only the process owned by your verification server before stopping it. Dev uses `apps/server/dev.env` and Vite's `/ready` proxy; retain both.

Verification copy: `D:\CodexProjects\browser-tabletop-verification-20260929-091300`. It contains private synthetic smoke databases, so do not archive that directory wholesale. Use the source archive and manifest for portable delivery.
