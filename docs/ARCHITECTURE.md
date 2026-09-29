# Architecture

```
apps/web        React 19 + Vite client (DOM rendering, no canvas). Hash routes; local practice needs no server.
apps/server     Node HTTP + ws service. Sessions, rooms, invitations, durable commands, projections, presence.
packages/tabletop   Generic, rules-free table engine: cards, zones, piles, components, permissions, handles, projection.
packages/templates  Declarative template schema, built-in templates, validation, import/export.
packages/intrilex   First Contact rules engine, fixtures, lessons, legal-only solo opponent, rule IDs.
packages/protocol   Shared wire types: RoomView, RoomCommand, presence messages, error texts.
```

## State ownership

- **Table state** (`TableState`) is canonical for free tables and the Core sandbox. The server holds it; clients receive `projectTable(state, seat)` only.
- **Game state** (`GameState`) is canonical for First Contact. The board renders `projectGame(state, seat)` directly, so there is no second, separately mutable card layout that could drift from the rules. One validated command updates the game atomically.
- **Room state** wraps either engine with participants, invitations, revision, history and expiry. Room administration (host) and game knowledge are separate: the host receives the same projection as any player in that seat.
- **Templates** are data. A room pins a validated copy at creation; editing a template never changes existing rooms.

The tabletop package knows nothing about Intrilex. Trusted rules adapters are code selected by a template's `profile`; imported templates cannot add behaviour.

## Command pipeline (server)

1. Session cookie → session; Origin + CSRF check for writes; rate limits.
2. Room load (expired/unknown refused) → membership check.
3. Parse the command at the trust boundary (discriminated unions; unknown shapes refused).
4. Idempotency: `(room, participant, requestId)` receipt; same ID + same fingerprint → current view, different fingerprint → `REQUEST_ID_REUSED`.
5. Authorization (host-only, seat required), then freshness: stale revisions are refused unless the command is rebase-safe (non-destructive table commands whose references are revalidated).
6. Apply on a private copy (`applyTable` / `applyGame` never mutate input; invalid commands throw and leave state unchanged).
7. Persist room + invite index + membership + receipt in one SQLite `BEGIN IMMEDIATE` transaction (`synchronous=FULL`, WAL). Only then respond and broadcast per-participant projections.

Everything from step 2 to 7 runs synchronously after the body is read, so commands for a room are serialized in a single Node process.

## Privacy model

- Card identity visible to clients is an opaque **handle**. Tabletop handles rotate when a card enters a hand or a non-public pile and when a pile or face-down selection is shuffled; First Contact handles rotate whenever a card enters a hand or the Draw Pile. Canonical IDs never leave the server.
- Hidden piles and other players' hands are counts only. Face data appears only where the viewer may see it (own hand, face-up cards, explicit reveals).
- Snapshots, HTTP responses, reconnects, errors and logs all use projections or codes. Logs never include tokens, invitations or card faces.
- Live randomness uses the OS CSPRNG (`crypto.randomBytes` on the server, `crypto.getRandomValues` in the browser). Seeded PRNGs exist only for tests, fixtures and lessons.

## Presence

Pointer and ping messages are ephemeral WebSocket traffic (normalized coordinates, throttled to 50–80 ms, never persisted) and are held in a store outside React state, so cursor movement does not re-render the board (measured: 0 board DOM mutations during a 7-cursor storm, `e2e/quality.spec.ts`).

## Undo

Only the last accepted command, by the same participant, with no later command, and only for public arrangement commands (table-to-table moves, rotate, arrange, attach, components, lock). Anything that draws, deals, shuffles, reveals, flips or crosses a hidden boundary is not undoable. First Contact has no undo.
