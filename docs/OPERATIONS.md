# Operations: deployment, persistence, backup, retention

Tabletop is **one Node process** serving the static client, the JSON API and the WebSocket endpoint from one origin, with one SQLite database file on persistent storage. Nothing here has been publicly deployed.

## Configuration

| Variable | Default | Notes |
|---|---|---|
| `HOST` / `PORT` | `127.0.0.1` / `3000` | bind address (container: `0.0.0.0`) |
| `DATA_PATH` | `data/tabletop.sqlite` | must live on persistent storage; WAL files sit beside it |
| `STATIC_DIR` | `dist/client` | built client |
| `ORIGIN` | `http://<Host header>` | **set it** to the exact public origin (`https://tables.example.org`); used for CSRF-origin and WebSocket origin checks |
| `COOKIE_SECURE` | `false` | set `true` whenever served over HTTPS |

No secrets or external accounts are needed.

## Single-service deployment

```bash
npm ci && npm run build
ORIGIN=https://tables.example.org COOKIE_SECURE=true DATA_PATH=/srv/tabletop/tabletop.sqlite npm start
```

Container (not executed in this environment — Docker was unavailable here; treat as UNVERIFIED until built):

```bash
ORIGIN=https://tables.example.org COOKIE_SECURE=true docker compose up --build -d
```

The image runs as the unprivileged `node` user, stores data in the `/data` volume, and exposes a `HEALTHCHECK` on `/ready`.

## HTTPS and WebSocket reverse proxy

Terminate TLS in a proxy and forward both HTTP and WebSocket upgrades for the same host. Requirements: preserve the `Host` header or set `ORIGIN`; pass `Upgrade`/`Connection` for `/ws`; allow idle WebSocket connections of several minutes; don't cache `/api/*`.

Caddy:
```
tables.example.org {
  reverse_proxy 127.0.0.1:3000
}
```

nginx:
```
location / { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; }
location /ws { proxy_pass http://127.0.0.1:3000; proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade"; proxy_set_header Host $host; proxy_read_timeout 1h; }
```

Rate limits key on the socket address; behind a proxy every client shares the proxy address, so keep the proxy's own rate limiting enabled.

## Health and shutdown

- `GET /health` → liveness. `GET /ready` → 200 only while accepting work and the database answers.
- SIGINT/SIGTERM: stop accepting work (`/ready` → 503), close sockets with 1001 (clients reconnect automatically), close HTTP, checkpoint WAL, exit; forced exit after 10 s.

## Persistence and recovery semantics

- Every accepted command is committed (room JSON, invite index, membership, request receipt) in one `BEGIN IMMEDIATE` transaction with `synchronous=FULL` **before** the client receives success. If the response is lost, the command may already have committed; reconnect to reconcile the projected state and retry with the same `requestId` for idempotent handling.
- The UI shows *Saving…*, *Saved*, *Disconnected — reconnecting* and *Not saved*; after reconnect a full projected snapshot restores consistency.
- A restart restores rooms, seats, hands, revisions, invitation revocations and bans (verified in `tests/server.test.ts` and the Playwright walkthrough).
- Migrations are numbered in `apps/server/store.ts` and run on start; a database newer than the build is refused.
- SQLite is a single-writer store: run exactly one instance per database file.

## Backup and restore

Backups contain **private live state and invitation tokens** — store them like credentials.

```bash
# Online backup while the server runs (consistent VACUUM INTO snapshot; integrity-checked copy):
DATA_PATH=/srv/tabletop/tabletop.sqlite npm run backup -- /secure/backups/tabletop-2026-09-28.sqlite
# In the container: node dist/server/backup.js /data/backup.sqlite

# Restore into a NEW path (existing databases are never overwritten), then point DATA_PATH at it:
DATA_PATH=/srv/tabletop/restored.sqlite npm run restore -- /secure/backups/tabletop-2026-09-28.sqlite
```

Restore verifies integrity and schema compatibility; keep the old files for rollback.

## Retention and expiry

| Data | Kept | Removed |
|---|---|---|
| Room (state, participants, invitations, receipts, recovery codes) | 30 days after its last accepted change | maintenance sweep every minute deletes expired rooms and dependent rows |
| Session | 30 days after last use (sliding; cookie refreshed on app load) | swept when expired |
| Room activity history | newest 120 entries; card/game history newest 150–200 | older entries dropped |
| Request receipts | newest 2000 per room | pruned on write |
| Presence (cursors, pings) | never stored | — |
| Room chat | latest 100 process-local entries | restart, room expiry or one hour of social inactivity |
| Chat request deduplication | at most 200 per room, ten minutes | bounded eviction, expiry or restart; no durable retry guarantee |
| Notifications | ephemeral client queue, at most five visible, 12-second expiry | dismissal, expiry, access termination, room/identity teardown |
| Server logs | stdout JSON: route templates, status, timing, error codes; never tokens, invitations or card faces | per your log collector |

## Capacity and costs

Designed for small private groups on one modest machine: up to 2000 rooms, 8 seats + 16 spectators per room, 20 room creations per session per day. Measured locally (Windows, loopback, Chromium): 8 seats with 108 total cards (60 on the table) reached first render in 81 ms and median move round-trip in 130 ms on September 29, 2026 (`artifacts/perf-*.json`); this is one machine, not a general performance claim.

Running it publicly costs real money or someone's hardware: a small always-on VM or container host, persistent disk for SQLite, a domain and TLS (TLS is free via ACME). Free tiers change frequently and many sleep idle services or lack persistent disks — check any provider's current terms before relying on them. No provider has been evaluated or used for this project.

## Neocities frontend

For Neocities, keep this service's `ORIGIN` set to its own public HTTPS origin and `COOKIE_SECURE=true`. The static site's Create/Join links navigate to this origin, where the multiplayer UI, cookies, API and WebSocket remain same-origin. Do not set server `ORIGIN` to Neocities or add wildcard CORS. See [NEOCITIES.md](NEOCITIES.md).

## Chat operation and retry limits

Chat history and rate/dedup state live in the same single Node process as the authoritative SQLite service. Backups contain durable gameplay only; they do not preserve chat. Restart/recreation supplies a new social epoch and the UI explains that earlier history is unavailable. Reset keeps current chat and publishes a safe server-authored entry after the reset saves. Chat activity does not extend durable room retention or change game save status.

Inbound WebSocket frames are capped at 16 KiB. The server shares six accepted chat messages per ten seconds across all tabs of one participant, and permits at most 40 chat/malformed attempts per ten seconds before closing the offending socket with 4008. Pointer traffic has a separate throttle. More than 2 MB queued outbound traffic also closes with 4008 instead of silently dropping accepted chat; reconnect retrieves retained history. All social delivery revalidates current stored session expiry and membership, including recovery invalidation.

The client preserves failed drafts and marks unacknowledged sends uncertain. It never automatically resends after reconnect. An explicit same-request retry is safe only while the original acceptance remains in the bounded ten-minute/200-request cache. After expiry or epoch change, the UI labels a new send as potentially duplicating an earlier message. Routine logs exclude chat bodies and notification context. Local/static practice uses suggestions without connecting to social services; shared rooms continue top-level server-origin navigation.
