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
