# Status

## Continuation baseline — 2026-09-27

Checkout HEAD: `dbc525a5f53d45dbe82c75ad723829fd8f9aa417` ("Initial commit"), clean tree. Matches the audited SHA.

Environment: system Node v22.14.0, npm 10.9.2. npm scripts run under the project-local Node v24.21.0 supplied by the `node` devDependency (npm uses cmd.exe on Windows, so `node_modules/.bin/node.cmd` resolves first).

Rulebook `sources/INTRILEX_v4.3.1_COMPLETE_PLAYER_RULEBOOK.md` SHA-256 `1CFBD837F763FC436F4317B9164B802F1EA8FF57E18060FD436D8608E9F0BCF8` — verified exact. Read in full (Parts I–X, 4299 lines) before engine work.

### Baseline gate results (unmodified inherited tree)

| Command | Result |
|---|---|
| `npm ci` | OK — 166 packages, 0 vulnerabilities |
| `npm run typecheck` | FAIL — `apps/web/TableBoard.tsx(10,820) TS1005` parse error (masks missing-module errors) |
| `npm run lint` | FAIL — 3 errors (TableBoard parse error, `no-control-regex` in server, `prefer-const` in intrilex) |
| `npm test` | Runs 0 tests — `tests/` empty |
| `npm run build` | FAIL — typecheck step fails |
| `npm run test:e2e` | Not runnable — no `playwright.config.ts` |

### Verified forensic findings

- `packages/tabletop/index.ts` is 0 bytes; server imports `createTable/applyTable/projectTable` from it.
- `apps/web/App.tsx`, `apps/web/styles.css` missing; `main.tsx` imports both.
- `packages/intrilex/lessons.ts` missing; `index.ts` re-exports six symbols from it.
- `tests/`, `playwright.config.ts`, `packages/protocol/`, `scripts/`, `apps/web/src/` exist only as empty directories.
- Pointer protocol mismatch confirmed: server sends `participantId`, client reads `data.id`.
- Intrilex game cards use face-encoding stable IDs (`c-A-♣`); table cards use canonical template IDs in projections.

Work in progress below is updated at each milestone.
