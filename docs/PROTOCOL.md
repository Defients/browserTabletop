# Protocol and permissions

Types: [`packages/protocol/index.ts`](../packages/protocol/index.ts). All JSON; all errors are `{ "error": "CODE" }` (plus `view` for `STALE_REVISION`).

## HTTP

| Method | Path | Who | Result |
|---|---|---|---|
| GET | `/health` | anyone | liveness |
| GET | `/ready` | anyone | 200 when accepting work and the database answers; 503 while shutting down |
| GET | `/api/session` | anyone | sets/refreshes `tabletop_session` (HttpOnly, SameSite=Strict, Secure when configured; 30-day sliding) and returns `{csrf}` |
| GET | `/api/templates` | session | built-in templates |
| GET | `/api/rooms` | session | tables this browser belongs to |
| POST | `/api/rooms` | session | `{nickname, templateId}` or `{nickname, template}` → `{roomId, invite, spectatorInvite, view}` |
| POST | `/api/join` | session | `{invite, nickname, spectator?}` → `{roomId, view}` |
| POST | `/api/recover` | session | `{code}` → moves the participant bound to that one-time code to this session |
| GET | `/api/rooms/:id` | member | projected `RoomView` |
| GET | `/api/rooms/:id/template` | member | pinned template (shareable data, no live state) |
| GET | `/api/rooms/:id/invites` | host | current invitations |
| POST | `/api/rooms/:id/recovery` | member | new one-time recovery code for the caller (replaces the previous one) |
| POST | `/api/rooms/:id/commands` | member | `{requestId, revision, command}` → `{view}` / `{duplicate}` / `{rebased}` / `{left}` |

Every non-GET API call requires `Origin` equal to `ORIGIN` (or `http://<Host>` when unset) and `x-csrf-token` equal to the session's CSRF token. Bodies must be `application/json` and are size-limited (5.2 MB for room creation with a template, 64 kB for commands).

## Commands (`RoomCommand`)

| type | Permission | Stale revision |
|---|---|---|
| `table` (`TableCommand`) | seated, not read-only | allowed if rebase-safe (not shuffle/deal/split/merge) |
| `game` (`{type, cardId?, targetId?, mode?}`) | seated; must equal a currently legal action | refused |
| `seat` | not a spectator-invite participant; guided games: only seats whose hand you have held | allowed |
| `leave`, `rename` | member (host must transfer first) | allowed |
| `lock`, `rotate-invite`, `remove`, `transfer` | host | allowed |
| `reset` (`confirm: true`) | host | refused |
| `undo` | the author of the latest undoable command | refused |

Removed participants are banned from rejoining through any invitation; their sockets close with code 4003.

## WebSocket `/ws?room=<id>`

Same-origin `Origin` and a member session are required at upgrade; max 4 sockets per participant.

Server → client: `{type:'snapshot', view}` after every accepted change and on (re)connect; `{type:'presence'|'ping', participantId, x, y, surface}`.
Client → server: `{type:'presence'|'ping', x, y, surface}` with `x, y ∈ [0,1]`, `surface ∈ {'table','game'}`. Invalid messages are dropped. This single shape replaces the inherited mismatched `participantId`/`id` pointer messages.

Close codes: 4003 access ended, 4004 table expired, 4008 slow consumer (reconnect), 1001 server restarting.

## Role and visibility summary

| | Own hand | Other hands | Hidden piles | Face-down table cards | Invitations | Admin |
|---|---|---|---|---|---|---|
| Seated player | faces | counts | counts | backs (unless revealed to you) | – | – |
| Host (seated) | faces | counts | counts | backs | yes | yes |
| Spectator | – | counts | counts | backs | – | – |
| Removed / other room | nothing | nothing | nothing | nothing | – | – |
