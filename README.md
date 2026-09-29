# Tabletop

Private browser card tables for friends — with **Intrilex** as the first fully supported game.

**Create a table → choose a template → send the invitation → friends join as guests → play → come back later.**
No accounts, no ads, no paid services. Hands stay private on the server; the table saves every accepted move.

> Status: implemented and verified locally (see [`docs/ACCEPTANCE.md`](docs/ACCEPTANCE.md) and [`STATUS.md`](STATUS.md)). **Not publicly deployed.**

## Create, join, play, learn

- **Create table** — pick a template (Intrilex First Contact, the classic 54-card deck, Intrilex Core sandbox, the counter & card studio, a blank table, or your own), enter a nickname, and copy the player or read-only spectator link from the *Invite* dialog.
- **Join table** — open the link (or paste it) and pick a nickname. Take a free seat or spectate. Refreshing and returning later just works in the same browser.
- **Play** — *First Contact* is rules-assisted: only legal actions are offered, with rule references and “Why can / can’t I?”. Free tables give you drag-and-drop cards (mouse, touch or keyboard), piles, dealing, shuffling, reveals, attachments, counters, dice and notes.
- **Learn Intrilex** — seven short interactive lessons on the real rules engine, then a complete game against a simple legal opponent. Works offline.
- **Host controls** — lock the table, replace invitations, remove or promote people, reset with confirmation. Being host never reveals anyone’s hand.
- **Lost your browser?** — create a one-time *recovery code* from the table menu *before* you need it. There is no other account recovery.

## Run it locally

Requirements: Node ≥ 22.14 and npm 10 (the project pins a project-local Node 24.21 runtime for npm scripts through the `node` dev dependency).

```bash
npm ci
npm run dev          # API on :3000 + Vite on http://127.0.0.1:5173
```

Production build and start (serves client and API from one origin):

```bash
npm run build
npm start            # http://127.0.0.1:3000
```

| Command | Purpose |
|---|---|
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm test` | 115+ unit, rules, server and network-privacy tests (Node test runner) |
| `npm run test:e2e` | builds, then Playwright on Chromium + Firefox against the real production server (`npx playwright install chromium firefox` once) |
| `npm run backup -- path/to/backup.sqlite` | online, verified SQLite backup |
| `npm run restore -- path/to/backup.sqlite` | restore into an **unused** `DATA_PATH` |

Configuration: copy [`.env.example`](.env.example). Container: `docker compose up --build` (see [`docs/OPERATIONS.md`](docs/OPERATIONS.md)).

## Documentation

For **Neocities**, run `npm run build:neocities` and upload the contents of `dist/neocities/`. Local play, lessons, rules and template editing work there; shared multiplayer opens the separately hosted server configured in `site-config.js`. See [the Neocities guide](docs/NEOCITIES.md) for upload instructions and save boundaries. No public deployment has been performed.

| Topic | File |
|---|---|
| Architecture and state ownership | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| Protocol, permissions, privacy | [`docs/PROTOCOL.md`](docs/PROTOCOL.md) |
| Template format | [`docs/TEMPLATES.md`](docs/TEMPLATES.md) |
| Intrilex source map & capability matrix | [`docs/INTRILEX_SOURCE_MAP.md`](docs/INTRILEX_SOURCE_MAP.md), [`docs/capabilities.json`](docs/capabilities.json) |
| Lesson authoring | [`docs/LESSONS.md`](docs/LESSONS.md) |
| Deployment, persistence, backup/restore, retention, costs | [`docs/OPERATIONS.md`](docs/OPERATIONS.md) |
| Acceptance matrix | [`docs/ACCEPTANCE.md`](docs/ACCEPTANCE.md) |
| Dependencies, provenance, rights | [`NOTICE.md`](NOTICE.md) |

## Limitations

- Intrilex **Core** is a manual sandbox (automatic setup, player-maintained play); only **First Contact** is adjudicated.
- Single SQLite instance: one server process; no horizontal scaling.
- Guest identity is a browser cookie. Clearing it without a recovery code loses that seat.
- The server operator can read stored games; the design protects players from each other, not from the operator.
- Two First Contact rules interpretations await confirmation from the rules owner (source map D-1, D-3).
