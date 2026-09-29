# HANDOFF — continue Browser Tabletop from here

**For:** the next development agent (GPT-6 Astra Medium).
**From:** previous agent session, 2026-09-29.
**Read this first, then** `AGENTS.md` → `STATUS.md` → `docs/ACCEPTANCE.md` → `sources/BROWSER_TABLETOP_MASTER_PROMPT.md` (the contract).
The contract and the rulebook (`sources/INTRILEX_v4.3.1_COMPLETE_PLAYER_RULEBOOK.md`, SHA-256 `1CFBD837…BCF8`) outrank this file.

---

## 1. Where things stand (one paragraph)

The project went from "does not compile" (`dbc525a`) to a working, locally verified release candidate. All five packages/apps are implemented; 115 Node tests and 22 Playwright tests (Chromium + Firefox, real production server) exist and passed. The **last full release-gate run on the exact final tree was interrupted by the user** (see §4) — re-running it is the first job. Nothing is pushed or deployed. Git: `b21921c` on top of `518b4ca`; the user was mid-commit with most of the remaining work **staged** (check `git status` before touching anything; do not rewrite history).

## 2. Map of the code

| Path | What it is | Key entry points |
|---|---|---|
| `packages/tabletop` | Generic, rules-free table engine | `createTable`, `applyTable` (immutable, parses `TableCommand`), `projectTable`, `assertInvariants`, `rebaseSafe`, `undoable` |
| `packages/templates` | Declarative template schema + built-ins | `validateTemplate`, `validateRaster`, `importTemplate`, `exportTemplate`, `builtInTemplates` |
| `packages/intrilex` | First Contact engine, rules IDs, fixtures, lessons, bot | `engine.ts` (`createGame/availableActions/applyGame/projectGame/explainCard`), `rules.ts`, `fixtures.ts` (`fixture()` from card notation), `lessons.ts`, `bot.ts` (takes a **view**, never state) |
| `packages/protocol` | Shared wire types | `RoomView`, `RoomCommand`, `ClientMessage/ServerMessage`, `errorText` |
| `apps/server` | Node HTTP + ws + SQLite | `server.ts` (routes, WS), `rooms.ts` (room commands, views), `store.ts` (migrations v2, transactions), `backup.ts`/`restore.ts` (`VACUUM INTO`), `dev.env` |
| `apps/web` | React app | `App.tsx` (hash router), `Online.tsx` (create/join/recover/room), `TableBoard.tsx`, `GameBoard.tsx`, `Practice.tsx`, `Learn.tsx`, `TemplateEditor.tsx`, `Library.tsx`, `Presence.tsx`, `api.ts` (`useRoom`), `styles.css` |
| `tests/` | Node test runner suites | tabletop, templates, intrilex.rules, intrilex.effects, lessons, bot, server, privacy, backup; helpers in `tests/helpers/` |
| `e2e/` | Playwright | `walkthrough` (3 browsers + restart), `learn` (all lessons + full game), `templates` (editor→export→import→online), `quality` (3 viewports, axe, keyboard, reduced motion, perf) |
| `docs/` | Contract documentation | ARCHITECTURE, PROTOCOL, TEMPLATES, LESSONS, OPERATIONS, INTRILEX_SOURCE_MAP, capabilities.json, ACCEPTANCE, INTERFACES |

## 3. Non-negotiable invariants (do not regress)

1. Only projections leave the server. Host ≠ omniscient. Canonical card IDs never serialized.
2. Card handles rotate on entering a hand / non-public pile / DP and on shuffle (both engines). Privacy tests inspect **raw** HTTP/WS payloads — keep them that way.
3. Persist (single `BEGIN IMMEDIATE`) **before** acknowledging. Request IDs idempotent. **Authorization before freshness** (see `server.ts` commands route). Stale revisions refused unless `staleTolerant`.
4. Live RNG = CSPRNG. Seeded RNG only in tests/fixtures/lessons.
5. Templates are data; unknown fields dropped; setup ops are an allow-list.
6. First Contact legality comes only from `availableActions`; the bot and lessons pick from it.
7. Never weaken a test or a rule to go green. Rule interpretations go in `docs/INTRILEX_SOURCE_MAP.md` (D-1…D-13) and `docs/capabilities.json`.

## 4. Verification record (be precise about which tree)

| Run | Tree | Result |
|---|---|---|
| Isolated copy A | prior tree | ci ✓ (0 vulns), lint ✗→fixed (3 unused-var errors in tests/e2e), typecheck ✓, test 115/115, e2e 22/22, build ✓, `npm start` + `/ready` + room create ✓, backup/restore ✓ on Node 22.14 and 24 (after switching to `VACUUM INTO`) |
| Isolated copy B | prior tree | ci ✓, lint ✓, typecheck ✓, test 115/115, **e2e 21/22** (Firefox walkthrough: test-harness race clicking a stale disabled *Decline* button), build ✓ |
| Targeted | after harness fix (`e2e/fc.ts`: enabled-only buttons + wait for *Saved*) | walkthrough + learn `--repeat-each=3`, both engines: **18/18** |
| Isolated copy C | **final tree** | **interrupted during `npm ci` — NOT COMPLETED** |

## 5. Do this next (ranked by ROI)

1. **Re-run the release gates on the final tree** in an isolated copy (Git Bash):
   ```bash
   rm -rf /tmp/bt-final && mkdir -p /tmp/bt-final
   git ls-files -co --exclude-standard | grep -v '^artifacts/' > /tmp/filelist.txt
   tar -cf - -T /tmp/filelist.txt | tar -xf - -C /tmp/bt-final && cd /tmp/bt-final
   npm ci && npm run lint && npm run typecheck && npm test && npm run test:e2e && npm run build
   ```
   Then `npm start` (set `PORT`, `DATA_PATH`, `ORIGIN`), check `/ready`, create a room, run `node dist/server/backup.js` / `restore.js`. Replace `RESULTS_PLACEHOLDER` in `STATUS.md` with the real table. If anything fails: root-cause, fix, and rerun **all** gates.
2. **Regenerate `release/browser-tabletop-src.tar.gz`** from the same file list (+ `artifacts/screens`, `artifacts/perf-*.json`) after step 1 — the existing archive predates the `e2e/fc.ts` and docs edits.
3. **Container**: Docker was unavailable. On a Docker host: `docker compose up --build`, hit `/ready`, play a room, `docker compose restart`, confirm persistence. Flip rows 42 in `docs/ACCEPTANCE.md` only with evidence. Watch the `node` devDependency (project-local Node 24 binary package) in `npm ci` on Linux.
4. **Rules rulings from Deffy** (outcome-changing, implemented conservatively): D-1 (whether the §15.7 list is exhaustive) and D-3 (2 Solo Wild disabled). If rulings arrive, change `engine.ts`, add rule-named tests, update source map + capabilities.
5. **WebKit / real mobile**: add a `webkit` Playwright project if the host supports it; test touch drag on a real device. Currently UNVERIFIED.
6. Polish candidates (only after 1–3): mobile bottom sheet covers much of the board at 390 px (`.fc-panel` 46 vh); counter-lab counters overlap in the editor preview; consider `eslint-plugin-react-hooks`.

## 6. Environment gotchas (Windows host)

- npm scripts run under **project-local Node 24.21** (`node` devDependency; npm uses cmd.exe). In Git Bash, `node_modules/.bin/*` shims can hit a blank `node` file — use `cmd //c "node_modules\.bin\<tool> ..."` or `node node_modules/<pkg>/bin/...`. System Node is 22.14.
- Killing a backgrounded `npm start` leaves the child node alive; stop by port in PowerShell: `Get-NetTCPConnection -LocalPort 3000 -State Listen | % { Stop-Process -Id $_.OwningProcess -Force }`.
- Dev (`npm run dev`) needs `apps/server/dev.env` (`ORIGIN=http://127.0.0.1:5173`) because Vite's proxy rewrites Host. The user added `/ready` to the Vite proxy — keep it.
- Playwright browsers live in `%LOCALAPPDATA%\ms-playwright` (Chromium 153, Firefox 155 installed).
- Firefox logs "connection to ws://… was interrupted" on reload; `e2e/server.ts` filters exactly that message and nothing broader.

## 7. Known open decisions (not yours to make)

Platform licence; distribution rights for Intrilex material (see `NOTICE.md`); pushing/publishing; any public deployment (explicitly **not** authorised).

## 8. Definition of done for your session

All gates green on the final tree with results recorded in `STATUS.md`; archive regenerated; `docs/ACCEPTANCE.md` statuses truthful (only VERIFIED / UNVERIFIED / BLOCKED / OUT_OF_SCOPE); final report distinguishes implemented / locally verified / publicly deployed (the last remains **false**).
