# Browser Tabletop

Independent project. `sources/BROWSER_TABLETOP_MASTER_PROMPT.md` is the complete contract; the supplied Intrilex v4.3.1 rulebook (SHA-256 1CFBD837…BCF8) is canonical. No runtime dependency on the old Intrilex app. No publication or public deployment.

## Invariants
- Only projected views leave the server; the host is not omniscient; no future deck order or stable hidden card identities (handles rotate on hidden-zone entry and shuffle).
- Durable commands persist before acknowledgement; request IDs are idempotent; stale revisions are refused unless the command is rebase-safe; authorization is checked before freshness.
- Guided (First Contact) rules state is authoritative; imported templates are data only.
- Live randomness is CSPRNG; seeded PRNGs only in tests, fixtures and lessons.
- Do not weaken tests or rules to report success. Interpretations are recorded in `docs/INTRILEX_SOURCE_MAP.md`.

## Commands (npm scripts run under the project-local Node 24 via the `node` devDependency)
- `npm ci`, `npm run dev` (API :3000 + Vite :5173), `npm run lint`, `npm run typecheck`, `npm test`
- `npm run test:e2e` (builds, then Playwright Chromium + Firefox; first run `npx playwright install chromium firefox`)
- `npm run build`, `npm start`, `npm run backup -- <file>`, `npm run restore -- <file>`
- On Windows, a background `npm start` leaves a child node process; stop it by port (`Get-NetTCPConnection -LocalPort 3000`).
- Dev helpers: `node --import tsx scripts/smoke-games.ts 300 random` (rules fuzz), `scripts/shots.ts` (screenshots).

Record actual gate results in `STATUS.md`; keep `docs/ACCEPTANCE.md` and `docs/capabilities.json` truthful.
