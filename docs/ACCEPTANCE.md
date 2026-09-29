# Acceptance matrix

Statuses: **VERIFIED** (automated and/or browser evidence on the final tree) · **UNVERIFIED** · **BLOCKED** · **OUT_OF_SCOPE**.
Test names refer to `tests/*.test.ts` (Node test runner) and `e2e/*.spec.ts` (Playwright, Chromium + Firefox, genuine production server). Final gate results: [`STATUS.md`](../STATUS.md).

| # | Requirement (master prompt) | Implementation | Automated evidence | Browser evidence | Status |
|---|---|---|---|---|---|
| 1 | Create table → template → invitation → guest joins → play → return | `apps/server/server.ts`, `apps/web/Online.tsx` | server.test: invites, seats | walkthrough.spec (3 contexts) | VERIFIED |
| 2 | 2–8 seats, bounded spectators, spectator invitation | `rooms.ts` SPECTATOR_LIMIT, seatCount | server.test: seats and spectators | walkthrough.spec (spectator), quality.spec perf (8 seats) | VERIFIED |
| 3 | Opaque room/invite IDs; host credentials separate | 256-bit tokens, `/invites` host-only, hashed invite index | server.test: invites | walkthrough.spec (guest 403) | VERIFIED |
| 4 | Lock, invite rotation, removal, host transfer, reset with confirmation | `applyCommand` | server.test: host controls | Online.tsx menus (manual inspection) | VERIFIED |
| 5 | Sessions: HttpOnly/SameSite cookie, CSRF, Origin, WS origin | `server.ts` | server.test: sessions; websocket | walkthrough.spec | VERIFIED |
| 6 | Persist before acknowledge; save-state indicator pending/saved/disconnected/failed | `store.saveRoom`, `api.ts useRoom` | server.test: persistence (injected failure) | walkthrough.spec (Disconnected → Saved) | VERIFIED |
| 7 | Idempotent request IDs, stale revisions, safe rebase | `server.ts`, `staleTolerant`, `rebaseSafe` | server.test: idempotency; concurrency | walkthrough.spec (stale refused) | VERIFIED |
| 8 | Refresh/reconnect/restart restores rooms, seats, revocations | SQLite WAL, migrations | server.test: restart | walkthrough.spec (backend restart) | VERIFIED |
| 9 | Recovery option with honest trade-off | one-time recovery codes | server.test: recovery code | RecoverRoom screen | VERIFIED |
| 10 | Expiry/retention; host absence; duplicate tabs | 30-day room/session TTL, maintenance, 4 sockets/participant | server.test: expiry and isolation | — | VERIFIED |
| 11 | Cross-room isolation, removed participant | `member()`, socket close 4003 | server.test; privacy.test: removed participant | — | VERIFIED |
| 12 | Server projections only; host not omniscient | `projectTable`, `projectGame`, `roomView` | privacy.test: First Contact payloads | walkthrough.spec (roles) | VERIFIED |
| 13 | Visibility-scoped handles; untrackable after shuffle/hand, reconnect, spectator join, export | `packages/tabletop` handle rotation; `engine.ts` toHand/toDeck | tabletop.test privacy ×3; intrilex.rules privacy; privacy.test Free table | — | VERIFIED |
| 14 | CSPRNG live randomness; seeds private | `secureRandom` (server/browser), seeded only in tests/lessons | privacy.test (no RNG material) | — | VERIFIED |
| 15 | Logs/errors without secrets | JSON logs with route templates | server.test: logs; privacy.test: error responses | walkthrough.spec (logs) | VERIFIED |
| 16 | Malformed input, HTML nicknames, floods, size limits | parsers at trust boundary, rate limits | server.test: robustness; tabletop.test: commands | — | VERIFIED |
| 17 | Object integrity under random operations; invalid commands leave state unchanged | `assertInvariants`, immutable `applyTable` | tabletop.test: integrity (3000 ops) | — | VERIFIED |
| 18 | Card controls: move/multi-select/flip/rotate/align/stack/unstack/fan/draw/deal/split/merge/shuffle/top-bottom/hand sort/reorder/reveal/hide/attach/detach/lock | `packages/tabletop`, `TableBoard.tsx` | tabletop.test (piles, reveal, attachments, hand) | templates.spec (drag, keyboard flip, concurrent draw) | VERIFIED |
| 19 | Counters, tokens, dice (server random), notes | components | tabletop.test: components | templates.spec (studio data) | VERIFIED |
| 20 | Undo policy | `undoable`, room.undo | tabletop.test: undo policy | — | VERIFIED |
| 21 | Pan, zoom, fit, touch cancellation, Escape, hotkeys blocked while typing, right-click optional | `TableBoard.tsx` | — | templates.spec (keyboard, typing guard), quality.spec (keyboard) | VERIFIED |
| 22 | Remote pointers/highlights; cursors don't re-render board | `Presence.tsx`, external store | server.test: websocket presence | walkthrough.spec; quality.spec perf (0 board mutations) | VERIFIED |
| 23 | Template schema, validation, limits, inert data, raster faces | `packages/templates` | templates.test (7 tests) | templates.spec (SVG refused, malformed/oversized) | VERIFIED |
| 24 | Editor: name, size, background, seats, zones place/resize/name/visibility, decks, labels, components, faces, setup, preview, import/export | `TemplateEditor.tsx`, `Library.tsx` | — | templates.spec (author → export → import → play) | VERIFIED |
| 25 | Second independently authored template without platform changes | `tests/fixtures/garden-table.tabletop.json`, built-in counter-lab | templates.test: generality | templates.spec (custom template online) | VERIFIED |
| 26 | Export excludes live state/credentials | `/template` returns pinned template | templates.test; privacy.test | templates.spec (live export) | VERIFIED |
| 27 | Blank table and standard 54-card templates | `builtInTemplates` | templates.test: built-ins | quality.spec (classic deck) | VERIFIED |
| 28 | Intrilex Core sandbox: canonical layout, auto setup, manual play, markers, references | Core template, `Reference.tsx` | tabletop.test: Core setup §2 | Home/practice links | VERIFIED |
| 29 | First Contact complete rules-assisted play | `packages/intrilex/engine.ts` | intrilex.rules (30), intrilex.effects (22), bot.test fuzz | walkthrough.spec, learn.spec | VERIFIED (see `capabilities.json`; D-1/D-3 await ruling) |
| 30 | Source map and machine-readable capability matrix | `docs/INTRILEX_SOURCE_MAP.md`, `docs/capabilities.json` | — | — | VERIFIED |
| 31 | ≥ 6 state-driven lessons with reset/skip/resume and false-completion rejection | `lessons.ts`, `Learn.tsx` | lessons.test (19) | learn.spec (all 7 via UI) | VERIFIED |
| 32 | Local solo opponent, legal-only, own-view only | `bot.ts`, `Practice.tsx` | bot.test (4) | learn.spec (complete game) | VERIFIED |
| 33 | Local practice without server; no fake invitations | `Practice.tsx`, `Learn.tsx` | — | learn.spec | VERIFIED |
| 34 | Why can / can't I / What happened | `explainCard`, `explainAction`, history panel | — | learn.spec (Why can't I tie) | VERIFIED |
| 35 | Responsive layouts 1440×900, 1024×768, 390×844 | `styles.css` | — | quality.spec screenshots in `artifacts/screens/` | VERIFIED |
| 36 | Accessibility: axe WCAG A/AA (serious/critical), keyboard flows, focus restore, reduced motion, hidden-card labels | `common.tsx`, `App.tsx` | — | quality.spec (axe, keyboard, reduced motion); walkthrough (spectator labels) | VERIFIED |
| 37 | Performance measurement: 8 seats, ≥108 cards | — | — | quality.spec perf → `artifacts/perf-*.json` | VERIFIED (single machine) |
| 38 | Two browser engines | Playwright projects | — | Chromium 153 + Firefox 155 | VERIFIED |
| 39 | Real devices / WebKit | — | — | not available on this Windows host | UNVERIFIED |
| 40 | Backup and restore into fresh destination | `backup.ts`, `restore.ts` | backup.test | — | VERIFIED |
| 41 | Health/readiness, graceful shutdown | `/health`, `/ready`, signal handler | server.test: robustness (/health) | walkthrough (restart) | VERIFIED |
| 42 | Container / deployment configuration | `Dockerfile`, `compose.yaml`, OPERATIONS.md | — | Docker not installed here | UNVERIFIED |
| 43 | Documentation set | README, docs/*, NOTICE.md | — | — | VERIFIED |
| 44 | Clean-checkout install and gates | — | isolated copy run (STATUS.md) | — | VERIFIED |
| 45 | Public deployment | — | — | — | OUT_OF_SCOPE (not authorised) |
| 46 | Full Core / optional-module adjudication | — | — | — | OUT_OF_SCOPE (contract defers it) |
