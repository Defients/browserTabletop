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
| `game` (`{type, cardId?, targetId?, cardIds?, targetIds?, mode?}`) | seated; must equal a currently legal action, including ordered source/cost arrays | refused |
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

Close codes: 4003 access ended, 4004 table expired, 4008 slow consumer or attempted-message ceiling (reconnect), 1001 server restarting, 1009 frame exceeds 16 KiB.

## Player assistance and social additions — September 29, 2026

The same socket carries additive social variants. `snapshot`, `presence`, coordinate `ping`, HTTP commands and `PROTOCOL_VERSION = 2` remain compatible; that constant is not a negotiated handshake. Older clients ignore unknown variants. New clients dispatch each variant explicitly. Pointer callbacks accept the dedicated `PointerClientMessage`, never chat.

| Direction | Variant | Fields |
|---|---|---|
| Client → server | `chat-send` | `requestId`, `parts`, optional `replyToId` |
| Server → client | `chat-history` | opaque `epoch`, ordered `entries` (at most 100) |
| Server → client | `chat-message` | `epoch`, one accepted `entry` |
| Server → client | `chat-result` | `requestId`, `ok`; success: `epoch`, `messageId`; failure: allowlisted `code` |
| Server → client | `notification` | `notification`: opaque `id`, ISO `timestamp`, typed `kind` context, optional committed `revision` |

`ChatPart` is `{type:'text', text}`, `{type:'mention', participantId}`, or `{type:'rule', ruleId}`. The server resolves current mention nicknames and allowlisted `RULES` titles; accepted chip parts include those plain-text display snapshots. Client identity, room, recipient, timestamp and display-label claims are rejected. User entries contain `id`, independent `messageOrder`, ISO `timestamp`, `kind:'user'`, `author:{participantId,nickname,seat}`, `parts` and optional `replyToId`. Server-owned entries use `kind:'system'`, fixed `code:'reset'|'completed'`, and the same ordering/stamp fields.

Limits: 16,384 bytes per inbound frame; 32 parts; 1,024 Unicode code points across canonical displayed content; eight distinct mentions; four rule chips. Text uses NFC and LF normalization; tabs/newlines are allowed, other C0/C1 controls rejected. Request IDs match `[\w-]{8,100}`. At least one non-whitespace text part or valid chip is required. Unknown fields/unions, unsafe stamps/orders, nonexistent rules, foreign mentions and missing/nonretained/foreign reply parents are refused. Historical author/chip names remain snapshots after rename. A reply whose parent later ages out renders an unavailable-parent fallback.

Current seated members and ordinary spectators may send; `readOnly` spectators read only. Every submission and every delivery checks the current room, stored session expiry and participant/session association. Revocation and recovery take effect before retry disclosure. Authorization comes before deduplication. Accepted normalized requests are scoped to room + participant + request ID: an identical retained retry returns the original message ID without another broadcast/mention; changed content returns `CHAT_REQUEST_REUSED`. Deduplication keeps at most 200 requests per room for ten minutes. A bounded cache can evict a receipt earlier in a busy room; outside retention, a new acceptance is possible. The client never automatically resends and distinguishes an explicit same-ID retry from a new send after uncertainty/epoch change.

Each participant shares six accepted messages per ten seconds across tabs and a 40-attempt ceiling per ten seconds for chat/malformed frames. Valid pointer traffic has its own lossy throttle and cannot consume that budget or drop accepted chat. A socket with more than 2,000,000 queued outbound bytes closes with 4008; accepted entries remain available in bounded history after reconnect.

Notifications: private `choice → response → turn` precedence derives from before/after recipient projections and legal availability after a durable commit. `mention` goes only to explicitly mentioned current members except the sender. Connectivity notices use all sockets, three-second final-disconnect debounce and reconnect cancellation. `system` exposes only reset/completion codes. Initial/reconnect snapshots, duplicate durable receipts, stale/refused requests and failed persistence do not replay decisions or fabricate accepted system events. Notification payloads never contain legal actions, private choice cards or suggested moves.

Social data is process-local and ephemeral. Restart, room expiry or one hour of social inactivity discards it and creates a new opaque epoch on recreation; game state and receipts remain durable. Chat does not change revision, `savedAt`, room expiry, undo or command history. Reset retains chat and adds one system entry after commit. Use one Node process per database; no distributed history is implied.

## Role and visibility summary

| | Own hand | Other hands | Hidden piles | Face-down table cards | Invitations | Admin |
|---|---|---|---|---|---|---|
| Seated player | faces | counts | counts | backs (unless revealed to you) | – | – |
| Host (seated) | faces | counts | counts | backs | yes | yes |
| Spectator | – | counts | counts | backs | – | – |
| Removed / other room | nothing | nothing | nothing | nothing | – | – |
