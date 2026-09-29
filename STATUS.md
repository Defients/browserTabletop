# Status

## Upload preparation: ttsbrowser.neocities.org — September 29, 2026

Prepared `release/ttsbrowser-neocities-upload.zip` and `release/ttsbrowser-neocities/upload/` with four browser files, target-specific instructions, checksum and per-file manifest. Rebuilt static output/typecheck passed. Local target-origin smoke checks passed in Chromium and Firefox using the observed public CSP; no missing assets, API requests or page errors. See `artifacts/verification/ttsbrowser-upload-smoke.json` and `ttsbrowser-build.log`.

The live root currently serves “Learn Jakuv - Interactive Tutorial” (HTTP 200). Uploading at root replaces that homepage; the instructions also describe `/tabletop/` as a preservation option. **No upload occurred.** The multiplayer server URL is still missing and intentionally blank. Runtime source is unchanged from the fully tested Neocities implementation below.

## Current: Neocities frontend with separate multiplayer — September 29, 2026 (America/New_York)

User-selected deployment model: Neocities hosts the frontend and a separate server runs shared multiplayer. Implemented as top-level navigation to the multiplayer origin, preserving existing first-party session cookies, authorization, projections and SQLite persistence. Local games, lessons, rules and template editing run directly on Neocities without service requests.

### Delivered

- `npm run build:neocities`: separate static output in `dist/neocities`, relative assets and existing hash routing support root or subdirectory uploads.
- `site-config.js`: public runtime setting for the HTTPS multiplayer origin; invalid/missing settings show an honest unavailable state. No credentials are needed in the static bundle.
- Home/navigation/library links open the configured multiplayer site. Built-in template selection and copied invitation routes survive the handoff. Custom templates use explicit export/import across origins.
- `npm run preview:neocities` and `npm run test:neocities`; static tests run under a restrictive CSP with network connections disabled, no API and no SPA fallback, plus a real separate production server for the handoff.
- `docs/NEOCITIES.md`, README/AGENTS updates, fresh desktop/mobile static screenshots, refreshed ordinary browser evidence, and `release/browser-tabletop-neocities.zip` containing the four upload files.

### Final executable-tree gates

| Check | Result |
|---|---|
| Lint | PASS |
| Typecheck | PASS |
| Node tests | PASS — 116/116 |
| Existing Chromium/Firefox browser tests | PASS — 22/22 |
| Neocities Chromium/Firefox tests | PASS — 4/4 |
| Standard production build | PASS |
| Neocities build | PASS — four files, approximately 436 KB uncompressed |
| Local static preview and visual inspection | PASS — desktop/mobile home |
| Actual Neocities upload / public multiplayer deployment | UNVERIFIED — not performed |

Logs: `artifacts/verification/neocities-final-*.log`. Current input hashes: `artifacts/verification/neocities-tested-inputs.json`. This run used the working checkout; dependency versions/lockfile are unchanged from the earlier isolated clean install below. Documentation and delivery manifests were updated after testing; executable files were unchanged afterward.

**Configuration still required:** the deployed multiplayer server's real HTTPS origin. `site-config.js` intentionally ships with an empty value. The Neocities local features work immediately; online links become usable after configuring a running server. No site, paid resource, public server or upload was created. Changes are uncommitted.

Current performance reports supersede the earlier measurements below: Chromium first render 87 ms, median move 133 ms; Firefox 103 ms / 33 ms. Both recorded zero durable-board mutations during presence traffic. These are single-machine loopback results.

The earlier Docker, WebKit/real-device, rules-ruling and visual-polish boundaries remain open. See `docs/NEOCITIES.md` for upload and server configuration instructions.

---

## Earlier clean-install verification baseline — September 29, 2026

Base: `1ff9605` plus the backup-test harness fix and documentation/evidence updates described below. All runnable release gates passed in an isolated clean-install copy. Changes from this continuation are uncommitted; no push or public deployment was performed.

The application remains implemented: generic tabletop controls and private projections, durable multiplayer rooms, declarative templates/editor, Intrilex First Contact rules-assisted play, manual Core sandbox, seven interactive lessons, and a legal-only local opponent. Rule interpretations D-1 and D-3 still await the rules owner; passing tests do not resolve those questions.

### Changes in this continuation

- Fixed the backup test harness to run CLI subprocesses asynchronously, keeping its in-process HTTP server responsive. Added failure-safe server/database cleanup; retained all backup, overwrite-refusal, restore, revision, card-count, and invitation assertions.
- Corrected the operations guide: a lost acknowledgement can follow a successful commit. Reconcile projected state and retry with the same request ID.
- Refreshed 30 browser screenshots and both performance reports; recorded gate logs and SHA-256 hashes of tested inputs in `artifacts/verification/`.
- Updated acceptance and handoff records; regenerated `release/browser-tabletop-src.tar.gz` with source, documentation and evidence, excluding dependencies and private runtime databases.

### Environment and provenance

Windows x64; system Node 22.14.0 / npm 10.9.2; npm scripts use pinned project-local Node 24.21.0. Playwright 1.63.0, Chromium and Firefox. Isolated copy: `D:\CodexProjects\browser-tabletop-verification-20260929-091300`.

The supplied rulebook SHA-256 was rechecked and matches `1CFBD837F763FC436F4317B9164B802F1EA8FF57E18060FD436D8608E9F0BCF8`. This continuation verified the existing suites; it did not independently recertify the entire rulebook interpretation.

`artifacts/verification/tested-inputs.json` identifies the exact tested runtime, tests, configuration, lockfile and canonical rulebook by hash. Only documentation/evidence and archive assembly followed the successful gate run; executable inputs were compared byte-for-byte against the isolated copy before packaging.

### Final release gates

| Gate | Result on final executable tree |
|---|---|
| `npm ci` | PASS — 166 packages added, 167 audited, 0 reported vulnerabilities |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm test` | PASS — 115/115, no skipped/cancelled tests |
| `npm run test:e2e` | PASS — 22/22, Chromium + Firefox, genuine production backend, 2.1 minutes |
| `npm run build` | PASS — browser client and server/backup/restore bundles |
| `npm start` smoke | PASS — readiness, static client, session, room creation and durable three-card draw |
| Bundled backup/restore | PASS — online backup, fresh-path restore, restart, same session/revision/cards recovered |
| `npm run dev` smoke | PASS — Vite client, readiness proxy, session and CSRF-protected room creation |
| Docker/container | UNVERIFIED — Docker unavailable on this host |
| WebKit / real devices | UNVERIFIED — not exercised |

Logs: `artifacts/verification/gate-*.log`. The initial run is preserved as `gate-test-initial-failure.log`: 114/115, backup test `ECONNRESET`, with the leaked test worker stopped to release the stalled runner. The backup CLI was synchronous while its HTTP server shared the same event loop. After the asynchronous harness/cleanup fix, **all gates were rerun**, including `npm ci`.

Previous handoff runs A/B and targeted retries applied to earlier trees; run C was interrupted during installation. The September 29 run above supersedes that incomplete verification record.

### Performance and direct visual inspection

Single-machine Windows loopback measurements, 8 seats / 108 total cards / 60 table cards rendered:

| Browser | First render | Median move round-trip | Maximum move round-trip | Board mutations during cursor traffic |
|---|---|---|---|---|
| Chromium | 81 ms | 130 ms | 141 ms | 0 |
| Firefox | 90 ms | 136 ms | 149 ms | 0 |

These are local measurements, not universal latency guarantees. Automated layouts/accessibility ran at 1440×900, 1024×768 and 390×844. Direct inspection of the fresh mobile First Contact and desktop editor screenshots confirmed two existing polish items: the mobile action panel occupies much of the viewport, and counter labels overlap in the editor preview.

### Remaining work

- Container build/start/restart/persistence validation on a Docker-capable host.
- WebKit/Safari and real-device touch verification.
- Rules-owner rulings for D-1 (enabled-effect list) and D-3 (2 Solo Wild).
- Mobile action-panel and editor-preview polish.
- Platform licence, Intrilex distribution rights, and any publication remain decisions for Deffy. Nothing was publicly deployed.
