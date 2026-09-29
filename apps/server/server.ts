import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { builtInTemplates, validateTemplate, type TableTemplate } from '../../packages/templates/index.js';
import { HOST_COMMANDS, SOCIAL_LIMITS, parseClientMessage, validRequestId, type CreateRoomResponse, type ServerMessage, type RoomNotification } from '../../packages/protocol/index.js';
import { createSocial, decisionTransition, notice, SocialError } from './social.js';
import { openStore, StoreError, type Store } from './store.js';
import {
  ApiError, DAY, MEMBERSHIP_LIMIT, ROOM_TTL, SPECTATOR_LIMIT, applyCommand, freshState, nickname, parseRoomCommand,
  requireThat, roomView, seatCount, staleTolerant, validateRoomVersion, type Participant, type Room, type Session,
} from './rooms.js';

const token = () => randomBytes(32).toString('base64url');
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
/** Live randomness is always the OS CSPRNG (48 bits per draw). */
export const secureRandom = () => randomBytes(6).readUIntBE(0, 6) / 2 ** 48;
const TOKEN_RE = /^[\w-]{43}$/;

export interface ServerOptions {
  dbPath: string; host?: string; port?: number; origin?: string; staticDir?: string; secureCookies?: boolean;
  failPersist?: () => boolean; now?: () => number; log?: (entry: Record<string, unknown>) => void;
}

interface SocketInfo { room: string; participant: string; session: string; tokenHash: string; last: number }

export function createServer(options: ServerOptions) {
  const now = options.now ?? Date.now;
  const log = options.log ?? ((e: Record<string, unknown>) => console.log(JSON.stringify({ t: new Date(now()).toISOString(), ...e })));
  const store: Store = openStore(options.dbPath, options.failPersist);
  const sockets = new Map<WebSocket, SocketInfo>();
  const social = createSocial(now);
  const announcedEpochs = new Map<string, string>();
  const disconnects = new Map<string, ReturnType<typeof setTimeout>>();
  const rates = new Map<string, { start: number; count: number }>();
  let ready = true;

  const connectedIn = (roomId: string) => new Set([...sockets].filter(([ws, s]) => s.room === roomId && ws.readyState === WebSocket.OPEN).map(([, s]) => s.participant));
  const loadRoom = (id: string): Room => {
    const room = store.getRoom(id);
    requireThat(room, 404, 'ROOM_NOT_FOUND');
    requireThat(room.expires > now(), 410, 'ROOM_EXPIRED');
    validateRoomVersion(room);
    return room;
  };
  const member = (room: Room, session: Session): Participant => {
    const p = room.participants.find(x => x.session === session.id && !x.removed);
    requireThat(p, 403, 'ROOM_ACCESS_DENIED');
    return p;
  };
  const view = (room: Room, p: Participant) => roomView(room, p, connectedIn(room.id));
  const send = (ws: WebSocket, m: ServerMessage) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    if (ws.bufferedAmount > 2_000_000) { ws.close(4008, 'Reconnect required'); return; }
    ws.send(JSON.stringify(m));
  };
  /** Check current stored session and association before every delivery or submission. */
  const socketMember = (ws: WebSocket, info: SocketInfo, room: Room): Participant | undefined => {
    const session = store.getSession(info.tokenHash);
    const p = room.participants.find(x => x.id === info.participant && !x.removed && x.session === info.session);
    if (!session || session.id !== info.session || session.expires <= now() || !p) { ws.close(4003, 'Access ended'); return; }
    if (room.expires <= now()) { ws.close(4004, 'Table expired'); return; }
    return p;
  };
  const deliver = (room: Room, message: ServerMessage, recipient?: string, except?: string) => {
    for (const [ws, info] of sockets) {
      if (info.room !== room.id || ws.readyState !== WebSocket.OPEN) continue;
      if (!socketMember(ws, info, room)) continue;
      if (recipient && info.participant !== recipient || except && info.participant === except) continue;
      send(ws, message);
    }
  };
  const notify = (room: Room, notification: RoomNotification, recipient?: string, except?: string) => deliver(room, { type: 'notification', notification }, recipient, except);
  const socialHistory = (room: Room, ws?: WebSocket) => {
    const history = social.history(room.id);
    if (announcedEpochs.get(room.id) !== history.epoch) {
      announcedEpochs.set(room.id, history.epoch); deliver(room, history);
    } else if (ws) send(ws, history);
    return history;
  };
  const committedSocial = (before: Room, after: Room, reset: boolean) => {
    const code = reset ? 'reset' : before.game?.winner === null && after.game?.winner !== null && after.game?.winner !== undefined ? 'completed' : null;
    if (code) {
      socialHistory(after);
      deliver(after, social.system(after.id, code));
      notify(after, notice(now(), { kind: 'system', code, revision: after.revision }));
    }
    for (const p of after.participants) {
      if (p.removed || p.readOnly || p.seat === null) continue;
      const old = before.participants.find(x => x.id === p.id && !x.removed);
      const kind = decisionTransition(old ? view(before, old).game : undefined, view(after, p).game);
      if (kind) notify(after, notice(now(), { kind, revision: after.revision }), p.id);
    }
  };

  /** Each socket receives only its own participant's projection. */
  const broadcast = (room: Room) => {
    for (const [ws, info] of sockets) {
      if (info.room !== room.id || ws.readyState !== WebSocket.OPEN) continue;
      const p = socketMember(ws, info, room);
      if (!p) continue;
      send(ws, { type: 'snapshot', view: view(room, p) });
    }
  };
  const save = (room: Room, receipt?: { actor: string; request: string; fingerprint: string }, recovery?: { codeHash: string; participant: string }) => {
    try { store.saveRoom(room, now(), receipt, recovery); } catch (e) { if (e instanceof StoreError) throw new ApiError(503, 'SAVE_FAILED'); throw e; }
  };
  const touch = (room: Room, message?: string) => {
    room.revision++;
    room.savedAt = new Date(now()).toISOString();
    room.expires = now() + ROOM_TTL;
    if (message) room.history = [...room.history, message].slice(-120);
  };

  const allowedOrigin = (req: IncomingMessage) => options.origin ?? `http://${req.headers.host}`;
  const rawCookie = (req: IncomingMessage) => req.headers.cookie?.split(';').map(x => x.trim()).find(x => x.startsWith('tabletop_session='))?.slice(17);
  const setCookie = (res: ServerResponse, secret: string) => res.setHeader('set-cookie', `tabletop_session=${secret}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${ROOM_TTL / 1000}${options.secureCookies ? '; Secure' : ''}`);
  const sessionOf = (req: IncomingMessage): Session | undefined => {
    const raw = rawCookie(req);
    if (!raw || !TOKEN_RE.test(raw)) return undefined;
    const s = store.getSession(sha(raw));
    if (!s || s.expires <= now()) return undefined;
    // Sliding expiry: a session stays valid for 30 days after its last use (refreshed at most daily).
    if (s.expires - now() < ROOM_TTL - DAY) { s.expires = now() + ROOM_TTL; store.putSession(sha(raw), s); }
    return s;
  };
  const rate = (key: string, limit: number, period = 60_000) => {
    const r = rates.get(key);
    if (!r || now() - r.start > period) rates.set(key, { start: now(), count: 1 });
    else { r.count++; requireThat(r.count <= limit, 429, 'RATE_LIMITED'); }
  };
  const body = async (req: IncomingMessage, limit: number): Promise<Record<string, unknown>> => {
    requireThat(req.headers['content-type']?.startsWith('application/json'), 415, 'JSON_REQUIRED');
    let size = 0; const chunks: Buffer[] = [];
    for await (const c of req) { size += (c as Buffer).length; requireThat(size <= limit, 413, 'BODY_TOO_LARGE'); chunks.push(c as Buffer); }
    let parsed: unknown;
    try { parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new ApiError(400, 'INVALID_JSON'); }
    requireThat(parsed && typeof parsed === 'object' && !Array.isArray(parsed), 400, 'INVALID_JSON');
    return parsed as Record<string, unknown>;
  };
  const json = (res: ServerResponse, status: number, data: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' });
    res.end(JSON.stringify(data));
  };
  const serveStatic = (req: IncomingMessage, res: ServerResponse, path: string) => {
    requireThat(req.method === 'GET' || req.method === 'HEAD', 405, 'METHOD_NOT_ALLOWED');
    const root = resolve(options.staticDir ?? 'dist/client');
    let decoded: string;
    try { decoded = decodeURIComponent(path); } catch { throw new ApiError(400, 'BAD_PATH'); }
    const candidate = resolve(root, '.' + decoded);
    requireThat(candidate === root || candidate.startsWith(root + sep), 404, 'NOT_FOUND');
    const file = existsSync(candidate) && statSync(candidate).isFile() ? candidate : resolve(root, 'index.html');
    requireThat(existsSync(file), 404, 'NOT_FOUND');
    const mime: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.json': 'application/json' };
    res.writeHead(200, {
      'content-type': mime[extname(file)] ?? 'application/octet-stream', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer',
      'cache-control': file.includes(`${sep}assets${sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
      'content-security-policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; connect-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    });
    if (req.method === 'HEAD') res.end(); else createReadStream(file).pipe(res);
  };

  const server = http.createServer(async (req, res) => {
    const started = now();
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname;
    let route = path.startsWith('/api/') ? path.replace(/[\w-]{43}/g, ':id') : path.startsWith('/assets/') ? '/assets/*' : path;
    try {
      if (path === '/health') { json(res, 200, { status: 'ok' }); return; }
      if (path === '/ready') { requireThat(ready, 503, 'SHUTTING_DOWN'); store.ping(); json(res, 200, { status: 'ready', schema: store.schemaVersion() }); return; }
      requireThat(ready, 503, 'SHUTTING_DOWN');
      if (!path.startsWith('/api/')) { route = 'static'; serveStatic(req, res, path); return; }
      rate(`ip:${req.socket.remoteAddress}`, 900);
      let session = sessionOf(req);
      if (path === '/api/session' && req.method === 'GET') {
        if (!session) {
          rate(`session:${req.socket.remoteAddress}`, 30);
          const secret = token();
          session = { id: token(), csrf: token(), expires: now() + ROOM_TTL };
          store.putSession(sha(secret), session);
          setCookie(res, secret);
        } else setCookie(res, rawCookie(req)!); // keep the browser cookie in step with the sliding server expiry
        json(res, 200, { csrf: session.csrf }); return;
      }
      requireThat(session, 401, 'SESSION_REQUIRED');
      if (req.method !== 'GET') {
        requireThat(req.headers.origin === allowedOrigin(req), 403, 'ORIGIN_REJECTED');
        requireThat(req.headers['x-csrf-token'] === session.csrf, 403, 'CSRF_REJECTED');
        rate(`write:${session.id}`, 240);
      }

      if (path === '/api/templates' && req.method === 'GET') { json(res, 200, builtInTemplates); return; }
      if (path === '/api/rooms' && req.method === 'GET') {
        const rooms = store.roomsForSession(session.id).filter(r => r.expires > now() && r.participants.some(p => p.session === session!.id && !p.removed));
        json(res, 200, rooms.map(r => ({ id: r.id, title: r.title, profile: r.template.profile, savedAt: r.savedAt, expiresAt: new Date(r.expires).toISOString() }))); return;
      }
      if (path === '/api/rooms' && req.method === 'POST') {
        rate(`create:${session.id}`, 20, DAY);
        requireThat(store.roomCount() < 2000, 503, 'ROOM_CAPACITY_REACHED');
        const b = await body(req, 5_200_000);
        let template: TableTemplate;
        try { template = b.template !== undefined ? validateTemplate(b.template) : builtInTemplates.find(t => t.id === b.templateId) ?? (() => { throw new Error(); })(); }
        catch { throw new ApiError(400, 'INVALID_TEMPLATE'); }
        const p: Participant = { id: token(), session: session.id, nickname: nickname(b.nickname), seat: 0, heldSeats: [0] };
        const room: Room = {
          id: token(), title: template.title, revision: 0, schemaVersion: 2, rulesVersion: '4.3.1', engineVersion: template.profile === 'intrilex-full' ? 3 : 2, template,
          participants: [p], host: p.id, invite: token(), spectatorInvite: token(), locked: false,
          history: [`${p.nickname} created the table.`], savedAt: new Date(now()).toISOString(), created: now(), expires: now() + ROOM_TTL,
          ...freshState(template, secureRandom),
        };
        save(room);
        log({ event: 'room.created', profile: template.profile });
        const out: CreateRoomResponse = { roomId: room.id, invite: room.invite, spectatorInvite: room.spectatorInvite, view: view(room, p) };
        json(res, 201, out); return;
      }
      if (path === '/api/join' && req.method === 'POST') {
        const b = await body(req, 4096);
        requireThat(typeof b.invite === 'string' && TOKEN_RE.test(b.invite), 404, 'INVITE_INVALID');
        rate(`join:${session.id}`, 30);
        const found = store.roomByInvite(b.invite as string);
        requireThat(found, 404, 'INVITE_INVALID');
        const room = loadRoom(found.room);
        requireThat(!room.participants.some(x => x.session === session!.id && x.banned), 403, 'ROOM_ACCESS_DENIED');
        let p = room.participants.find(x => x.session === session!.id && !x.removed);
        if (!p) {
          requireThat(!room.locked, 403, 'ROOM_LOCKED');
          const spectator = found.role === 'spectator' || b.spectator === true;
          const seat = Array.from({ length: seatCount(room) }, (_, i) => i).find(i => !room.participants.some(x => !x.removed && x.seat === i));
          requireThat(spectator || seat !== undefined, 409, 'SEATS_FULL');
          requireThat(!spectator || room.participants.filter(x => !x.removed && x.seat === null).length < SPECTATOR_LIMIT, 409, 'SPECTATORS_FULL');
          requireThat(room.participants.length < MEMBERSHIP_LIMIT, 409, 'ROOM_MEMBERSHIP_LIMIT');
          const seatNow = spectator ? null : seat!;
          p = { id: token(), session: session.id, nickname: nickname(b.nickname), seat: seatNow, heldSeats: seatNow === null ? [] : [seatNow], ...(found.role === 'spectator' ? { readOnly: true } : {}) };
          room.participants.push(p);
          touch(room, `${p.nickname} joined ${seatNow === null ? 'as a spectator' : `in seat ${seatNow + 1}`}.`);
          save(room); broadcast(room);
        }
        json(res, 200, { roomId: room.id, view: view(room, p) }); return;
      }
      if (path === '/api/recover' && req.method === 'POST') {
        const b = await body(req, 4096);
        rate(`recover:${session.id}`, 10);
        requireThat(typeof b.code === 'string' && TOKEN_RE.test(b.code), 404, 'RECOVERY_INVALID');
        const hit = store.recoveryLookup(sha(b.code as string));
        requireThat(hit, 404, 'RECOVERY_INVALID');
        const room = loadRoom(hit.room);
        const p = room.participants.find(x => x.id === hit.participant && !x.removed && x.recoveryHash === sha(b.code as string));
        requireThat(p, 404, 'RECOVERY_INVALID');
        requireThat(!room.participants.some(x => x.session === session!.id && !x.removed && x.id !== p.id), 409, 'ALREADY_MEMBER');
        p.session = session.id; delete p.recoveryHash;
        touch(room, `${p.nickname} reconnected from another browser using a recovery code.`);
        save(room); store.consumeRecovery(sha(b.code as string)); broadcast(room);
        json(res, 200, { roomId: room.id, view: view(room, p) }); return;
      }

      const match = /^\/api\/rooms\/([\w-]{43})(?:\/(commands|invites|template|recovery))?$/.exec(path);
      requireThat(match, 404, 'NOT_FOUND');
      let room = loadRoom(match[1]!);
      let p = member(room, session);
      const sub = match[2];
      if (req.method === 'GET' && !sub) { json(res, 200, view(room, p)); return; }
      // The pinned template is shareable data: layout and initial components only, never live state.
      if (req.method === 'GET' && sub === 'template') { json(res, 200, room.template); return; }
      if (req.method === 'GET' && sub === 'invites') { requireThat(room.host === p.id, 403, 'HOST_REQUIRED'); json(res, 200, { invite: room.invite, spectatorInvite: room.spectatorInvite }); return; }
      if (req.method === 'POST' && sub === 'recovery') {
        await body(req, 256);
        room = loadRoom(match[1]!); p = member(room, session);
        const code = token();
        p.recoveryHash = sha(code);
        room.savedAt = new Date(now()).toISOString();
        save(room, undefined, { codeHash: sha(code), participant: p.id });
        json(res, 200, { code }); return;
      }
      requireThat(req.method === 'POST' && sub === 'commands', 405, 'METHOD_NOT_ALLOWED');
      const b = await body(req, 64_000);
      // Reading the body yields to the event loop: reload, then validate/apply/persist synchronously.
      room = loadRoom(match[1]!); p = member(room, session);
      requireThat(typeof b.requestId === 'string' && /^[\w-]{8,100}$/.test(b.requestId), 400, 'INVALID_REQUEST_ID');
      requireThat(typeof b.revision === 'number' && Number.isInteger(b.revision), 400, 'INVALID_REVISION');
      const command = parseRoomCommand(b.command);
      const fingerprint = sha(JSON.stringify(command));
      const receipt = store.receipt(room.id, p.id, b.requestId as string);
      if (receipt) { requireThat(receipt.fingerprint === fingerprint, 409, 'REQUEST_ID_REUSED'); json(res, 200, { view: view(room, p), duplicate: true }); return; }
      // Authorization is decided before freshness, so refusals never depend on timing.
      if ((HOST_COMMANDS as readonly string[]).includes(command.type)) requireThat(room.host === p.id, 403, 'HOST_REQUIRED');
      if (command.type === 'table' || command.type === 'game') requireThat(p.seat !== null, 403, 'SEAT_REQUIRED');
      const stale = b.revision !== room.revision;
      if (stale && !staleTolerant(command)) { json(res, 409, { error: 'STALE_REVISION', view: view(room, p) }); return; }
      requireThat(room.revision < 100_000, 409, 'ROOM_COMMAND_LIMIT');
      const next = structuredClone(room);
      const actor = next.participants.find(x => x.id === p.id)!;
      const message = applyCommand(next, actor, command, { random: secureRandom, token });
      touch(next, message);
      save(next, { actor: p.id, request: b.requestId as string, fingerprint });
      broadcast(next);
      committedSocial(room, next, command.type === 'reset');
      if (command.type === 'rotate-invite' || command.type === 'remove' || command.type === 'reset') log({ event: `room.${command.type}` });
      json(res, 200, actor.removed ? { left: true } : { view: view(next, actor), ...(stale ? { rebased: true } : {}) });
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 500;
      if (!(e instanceof ApiError)) log({ event: 'error', route, message: e instanceof Error ? e.message.slice(0, 200) : 'unknown' });
      if (!res.headersSent) json(res, status, { error: e instanceof ApiError ? e.code : 'INTERNAL_ERROR' }); else res.end();
    } finally {
      if (route !== 'static' && route !== '/assets/*' && route !== '/health') log({ event: 'http', method: req.method, route, status: res.statusCode, ms: now() - started });
    }
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;

  const wss = new WebSocketServer({ noServer: true, maxPayload: SOCIAL_LIMITS.payloadBytes, perMessageDeflate: false });
  server.on('upgrade', (req, socket, head) => {
    try {
      requireThat(ready && req.headers.origin === allowedOrigin(req), 403, 'ORIGIN_REJECTED');
      const u = new URL(req.url ?? '/', 'http://localhost');
      requireThat(u.pathname === '/ws', 404, 'NOT_FOUND');
      const session = sessionOf(req);
      requireThat(session, 401, 'SESSION_REQUIRED');
      rate(`ws:${session.id}`, 60);
      const room = loadRoom(u.searchParams.get('room') ?? '');
      const p = member(room, session);
      requireThat([...sockets.values()].filter(s => s.participant === p.id).length < 4, 429, 'TAB_LIMIT');
      wss.handleUpgrade(req, socket, head, ws => {
        const wasConnected = connectedIn(room.id).has(p.id);
        const connectionKey = `${room.id}:${p.id}`;
        const recovering = disconnects.has(connectionKey);
        clearTimeout(disconnects.get(connectionKey)); disconnects.delete(connectionKey);
        const info: SocketInfo = { room: room.id, participant: p.id, session: session.id, tokenHash: sha(rawCookie(req)!), last: 0 };
        sockets.set(ws, info);
        ws.on('error', () => ws.close());
        ws.on('message', data => {
          let current: Room;
          try { current = loadRoom(info.room); } catch { ws.close(4004, 'Table closed'); return; }
          const actor = socketMember(ws, info, current); if (!actor) return;
          const msg = parseClientMessage(data.toString());
          // Valid pointers have their own lossy throttle and cannot consume chat's attempt budget.
          if ((!msg || msg.type === 'chat-send') && !social.attempt(info.room, info.participant)) { ws.close(4008, 'Message limit; reconnect required'); return; }
          if (!msg) {
            try {
              const invalid: unknown = JSON.parse(data.toString());
              if (invalid && typeof invalid === 'object' && 'type' in invalid && invalid.type === 'chat-send' && 'requestId' in invalid && validRequestId(invalid.requestId)) send(ws, { type: 'chat-result', requestId: invalid.requestId, ok: false, code: 'CHAT_INVALID' });
            } catch { /* malformed frames are bounded, never relayed */ }
            return;
          }
          if (msg.type === 'chat-send') {
            try {
              socialHistory(current);
              const accepted = social.accept(current, actor, msg);
              if (!accepted.duplicate) {
                deliver(current, { type: 'chat-message', epoch: accepted.epoch, entry: accepted.entry });
                if (accepted.entry.kind === 'user') for (const id of new Set(accepted.entry.parts.flatMap(part => part.type === 'mention' ? [part.participantId] : []))) {
                  if (id !== actor.id) notify(current, notice(now(), { kind: 'mention', participantId: actor.id, messageId: accepted.messageId }), id);
                }
              }
              send(ws, { type: 'chat-result', requestId: msg.requestId, ok: true, epoch: accepted.epoch, messageId: accepted.messageId });
            } catch (e) {
              send(ws, { type: 'chat-result', requestId: msg.requestId, ok: false, code: e instanceof SocialError ? e.code : 'CHAT_INVALID' });
            }
            return;
          }
          if (now() - info.last < 50) return;
          info.last = now();
          const out = JSON.stringify({ type: msg.type, participantId: info.participant, x: msg.x, y: msg.y, surface: msg.surface } satisfies ServerMessage);
          for (const [other, peer] of sockets) if (other !== ws && peer.room === info.room && other.readyState === WebSocket.OPEN && socketMember(other, peer, current) && other.bufferedAmount < 64_000) other.send(out);
        });
        ws.on('close', () => {
          sockets.delete(ws);
          if (!ready || connectedIn(info.room).has(info.participant) || disconnects.has(connectionKey)) return;
          const timer = setTimeout(() => {
            disconnects.delete(connectionKey);
            if (!ready || connectedIn(info.room).has(info.participant)) return;
            try {
              const current = loadRoom(info.room);
              const participant = current.participants.find(x => x.id === info.participant && !x.removed);
              broadcast(current);
              if (participant) notify(current, notice(now(), { kind: 'disconnected', participantId: participant.id, nickname: participant.nickname }), undefined, participant.id);
            } catch { /* room expired or removed */ }
          }, 3000);
          timer.unref(); disconnects.set(connectionKey, timer);
        });
        // Handlers are registered before initial delivery, including an early chat-send.
        const current = loadRoom(room.id);
        broadcast(current);
        if (socketMember(ws, info, current)) socialHistory(current, ws);
        if (!wasConnected && !recovering) notify(current, notice(now(), { kind: 'reconnected', participantId: p.id, nickname: p.nickname }), undefined, p.id);
      });
    } catch (e) {
      const code = e instanceof ApiError ? e.status : 500;
      socket.write(`HTTP/1.1 ${code === 401 ? '401 Unauthorized' : code === 404 ? '404 Not Found' : code === 429 ? '429 Too Many Requests' : '403 Forbidden'}\r\nConnection: close\r\n\r\n`);
      socket.destroy();
    }
  });

  const runMaintenance = () => {
    for (const [key, r] of rates) if (now() - r.start > DAY) rates.delete(key);
    try {
      const expired = store.expire(now());
      for (const id of expired) for (const [ws, s] of sockets) if (s.room === id) ws.close(4004, 'Table expired');
      social.cleanup(id => { const r = store.getRoom(id); return !!r && r.expires > now(); });
      for (const id of expired) announcedEpochs.delete(id);
      for (const [key, timer] of disconnects) if (expired.some(id => key.startsWith(`${id}:`))) { clearTimeout(timer); disconnects.delete(key); }
      for (const [ws, info] of sockets) {
        const room = store.getRoom(info.room);
        if (!room) ws.close(4004, 'Table expired'); else socketMember(ws, info, room);
      }
      if (expired.length) log({ event: 'rooms.expired', count: expired.length });
      return expired;
    } catch (e) { log({ event: 'error', route: 'maintenance', message: e instanceof Error ? e.message.slice(0, 200) : 'unknown' }); }
    return [];
  };
  const maintenance = setInterval(runMaintenance, 60_000);
  maintenance.unref();

  return {
    store, server,
    runMaintenance,
    listen: () => new Promise<number>((done, reject) => {
      server.once('error', reject);
      server.listen(options.port ?? 3000, options.host ?? '127.0.0.1', () => { const a = server.address(); done(typeof a === 'object' && a ? a.port : 0); });
    }),
    close: async () => {
      ready = false;
      clearInterval(maintenance);
      for (const timer of disconnects.values()) clearTimeout(timer);
      disconnects.clear(); social.clear(); announcedEpochs.clear();
      for (const ws of sockets.keys()) ws.close(1001, 'Server restarting');
      await new Promise<void>(done => wss.close(() => done()));
      server.closeAllConnections?.();
      await new Promise<void>(done => server.close(() => done()));
      store.close();
    },
  };
}
