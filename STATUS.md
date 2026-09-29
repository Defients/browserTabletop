# Status

## Current state — 2026-09-28

Base: `518b4ca` (user commit of in-progress work) + uncommitted working tree described below. Nothing pushed; **not publicly deployed**.

The inherited tree (`dbc525a`) did not compile: empty `packages/tabletop/index.ts`, missing `App.tsx`/`styles.css`/`lessons.ts`, no tests, no Playwright config, mismatched pointer protocol, stable face-encoding card IDs. All closed:

- `packages/tabletop` — generic engine: discriminated `TableCommand`, permission-aware immutable application, invariants, rotating opaque handles, projections, undo policy.
- `packages/templates` — strengthened schema (zone/visibility rules, setup allow-list incl. random first seat, raster byte checks, limits, inert import).
- `packages/intrilex` — First Contact engine restructured and corrected against the full v4.3.1 book (see source map D-1…D-13), rule IDs, fixtures, 7 lessons, own-view legal-only bot.
- `packages/protocol` — one shared wire contract (fixes pointer mismatch).
- `apps/server` — store with migrations (v2), hashed invite index, membership, recovery codes, sliding sessions, authorization-before-freshness, rebase policy, JSON logs without secrets, per-participant snapshots, graceful shutdown, bundled backup/restore.
- `apps/web` — full application: home, create/join/recover, rooms with host controls and save state, free-table board (pan/zoom/drag/keyboard/menus), First Contact board, local practice, lessons, template library/editor, rules reference, presence.
- Tests: 115 Node tests, 22 Playwright tests (Chromium + Firefox). Docs, Dockerfile/compose, NOTICE.

### Environment
Windows, system Node 22.14.0 / npm 10.9.2; npm scripts run on project-local Node 24.21.0. Playwright 1.63 with Chromium 153 and Firefox 155. Docker not installed (container config unverified).

### Final release gates (isolated clean copy of the final tree)

| Run | Tree | ci | lint | typecheck | test | test:e2e | build | start/backup/restore |
|---|---|---|---|---|---|---|---|---|
| A | prior | ✓ 0 vulns | ✗ 3 → fixed | ✓ | 115/115 | 22/22 | ✓ | ✓ (Node 22.14 + 24) |
| B | prior | ✓ | ✓ | ✓ | 115/115 | 21/22 (harness race, fixed in `e2e/fc.ts`) | ✓ | — |
| targeted | after fix | — | — | — | — | walkthrough+learn ×3, both engines: 18/18 | — | — |
| **C** | **final** | **interrupted — not completed** | | | | | | |

**Final-tree gate run is still owed** — see `HANDOFF.md` §5 step 1.

### Open items
- **Rules rulings requested** (outcome-changing, implemented conservatively): D-1 enabled-effect list reading; D-3 2 Solo Wild disabled.
- **UNVERIFIED**: container build/run (no Docker here); WebKit/Safari and real mobile devices.
- **Decisions for Deffy**: platform licence; distribution rights for Intrilex material; commit/push of this working tree.

### Next action
Review, commit the working tree, and (if desired) build the container on a Docker host: `docker compose up --build`.
