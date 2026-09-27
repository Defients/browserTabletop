import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync, statSync, createReadStream } from 'node:fs';
import { dirname, resolve, extname, sep } from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { builtInTemplates, validateTemplate } from '../../packages/templates/index.js';
import { createTable, applyTable, projectTable } from '../../packages/tabletop/index.js';
import { createGame, applyGame, projectGame } from '../../packages/intrilex/index.js';

const token = () => randomBytes(32).toString('base64url');
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const random = () => randomInt(0, 2 ** 48) / 2 ** 48;
const DAY = 86_400_000;
type Template = ReturnType<typeof validateTemplate>;
type Participant = { id: string; session: string; nickname: string; seat: number | null; removed?: boolean; banned?: boolean; readOnly?: boolean };
type Room = { id: string; title: string; revision: number; schemaVersion: 1; rulesVersion: string; template: Template; table?: ReturnType<typeof createTable>; game?: ReturnType<typeof createGame>; participants: Participant[]; host: string; invite: string; spectatorInvite: string; locked: boolean; history: string[]; savedAt: string; expires: number };
type Session = { id: string; csrf: string; expires: number };
type Options = { dbPath: string; host?: string; port?: number; origin?: string; staticDir?: string; secureCookies?: boolean; failPersist?: () => boolean; now?: () => number };
class ApiError extends Error { constructor(public status: number, public code: string) { super(code); } }
function requireThat(condition: unknown, status: number, code: string): asserts condition { if (!condition) throw new ApiError(status, code); }

export function createServer(options: Options) {
  const now = options.now ?? Date.now;
  if (options.dbPath !== ':memory:') mkdirSync(dirname(resolve(options.dbPath)), { recursive: true });
  const db = new DatabaseSync(options.dbPath);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL;');
  // Migration 1: private canonical snapshots plus bounded durable request receipts.
  db.exec(`CREATE TABLE IF NOT EXISTS migrations(version INTEGER PRIMARY KEY); CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS rooms(id TEXT PRIMARY KEY, json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS receipts(room TEXT NOT NULL, actor TEXT NOT NULL, request TEXT NOT NULL, fingerprint TEXT NOT NULL, PRIMARY KEY(room,actor,request), FOREIGN KEY(room) REFERENCES rooms(id) ON DELETE CASCADE); INSERT OR IGNORE INTO migrations VALUES(1);`);
  const sockets = new Map<WebSocket, { room: string; participant: string; last: number }>();
  const rates = new Map<string, { start: number; count: number }>();
  let ready = true;
  const roomById = (id: string): Room => {
    const row = db.prepare('SELECT json FROM rooms WHERE id=?').get(id) as { json: string } | undefined;
    requireThat(row, 404, 'ROOM_NOT_FOUND');
    const room = JSON.parse(row.json) as Room;
    requireThat(room.expires > now(), 410, 'ROOM_EXPIRED');
    requireThat(room.schemaVersion === 1 && room.rulesVersion === '4.3.1', 409, 'ROOM_VERSION_UNSUPPORTED');
    return room;
  };
  const member = (room: Room, session: Session) => {
    const p = room.participants.find(p => p.session === session.id && !p.removed);
    requireThat(p, 403, 'ROOM_ACCESS_DENIED'); return p;
  };
  const view = (room: Room, p: Participant) => ({
    id: room.id, title: room.title, revision: room.revision, profile: room.template.profile, template: room.template,
    ...(room.table ? { table: projectTable(room.table, p.seat) } : {}),
    ...(room.game ? { game: projectGame(room.game, p.seat) } : {}),
    you: { id: p.id, seat: p.seat, host: room.host === p.id },
    participants: room.participants.filter(p => !p.removed).map(p => ({ id: p.id, nickname: p.nickname, seat: p.seat, connected: [...sockets.values()].some(s => s.room === room.id && s.participant === p.id) })),
    locked: room.locked, history: room.history, savedAt: room.savedAt,
  });
  const broadcast = (room: Room) => {
    for (const [ws, info] of sockets) {
      if (info.room !== room.id || ws.readyState !== WebSocket.OPEN) continue;
      const p = room.participants.find(p => p.id === info.participant && !p.removed);
      if (!p) { ws.close(4003, 'Access ended'); continue; }
      if (ws.bufferedAmount > 1_000_000) { ws.close(4008, 'Reconnect required'); continue; }
      ws.send(JSON.stringify({ type: 'snapshot', view: view(room, p) }));
    }
  };
  const persist = (room: Room, receipt?: { actor: string; request: string; fingerprint: string }) => {
    db.exec('BEGIN IMMEDIATE');
    try {
      if (options.failPersist?.()) throw new Error('Injected storage failure');
      db.prepare('INSERT INTO rooms(id,json) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json').run(room.id, JSON.stringify(room));
      if (receipt) db.prepare('INSERT INTO receipts(room,actor,request,fingerprint) VALUES(?,?,?,?)').run(room.id, receipt.actor, receipt.request, receipt.fingerprint);
      db.exec('COMMIT');
    } catch { db.exec('ROLLBACK'); throw new ApiError(503, 'SAVE_FAILED'); }
  };
  const allowedOrigin = (req: IncomingMessage) => options.origin ?? `http://${req.headers.host}`;
  const sessionOf = (req: IncomingMessage): Session | undefined => {
    const cookie = req.headers.cookie?.split(';').map(x => x.trim()).find(x => x.startsWith('tabletop_session='))?.slice(17);
    if (!cookie || !/^[\w-]{43}$/.test(cookie)) return;
    const row = db.prepare('SELECT json FROM sessions WHERE token_hash=?').get(hash(cookie)) as { json: string } | undefined;
    if (!row) return;
    const s = JSON.parse(row.json) as Session; return s.expires > now() ? s : undefined;
  };
  const rate = (key: string, limit: number, period = 60_000) => {
    const r = rates.get(key);
    if (!r || now() - r.start > period) rates.set(key, { start: now(), count: 1 });
    else { r.count++; requireThat(r.count <= limit, 429, 'RATE_LIMITED'); }
  };
  const body = async (req: IncomingMessage): Promise<Record<string, unknown>> => {
    requireThat(req.headers['content-type']?.startsWith('application/json'), 415, 'JSON_REQUIRED');
    let size = 0; const chunks: Buffer[] = [];
    for await (const c of req) { size += c.length; requireThat(size <= 5_100_000, 413, 'BODY_TOO_LARGE'); chunks.push(c); }
    try { const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString()); requireThat(parsed && typeof parsed === 'object' && !Array.isArray(parsed), 400, 'INVALID_JSON'); return parsed as Record<string, unknown>; }
    catch { throw new ApiError(400, 'INVALID_JSON'); }
  };
  const nickname = (v: unknown) => { requireThat(typeof v === 'string' && v.trim().length >= 1 && v.trim().length <= 32 && !/[<>\x00-\x1f]/.test(v), 400, 'INVALID_NICKNAME'); return v.trim(); };
  const json = (res: ServerResponse, status: number, data: unknown) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); res.end(JSON.stringify(data)); };
  const server = http.createServer(async (req, res) => {
    try {
      requireThat(ready, 503, 'SHUTTING_DOWN');
      const url = new URL(req.url ?? '/', 'http://localhost'); const path = url.pathname;
      if (path === '/health' || path === '/ready') { db.prepare('SELECT 1').get(); json(res, 200, { status: 'ok' }); return; }
      if (!path.startsWith('/api/')) {
        requireThat(req.method === 'GET' || req.method === 'HEAD', 405, 'METHOD_NOT_ALLOWED');
        const root = resolve(options.staticDir ?? 'dist/client');
        const candidate = resolve(root, '.' + decodeURIComponent(path));
        requireThat(candidate === root || candidate.startsWith(root + sep), 404, 'NOT_FOUND');
        const file = existsSync(candidate) && statSync(candidate).isFile() ? candidate : resolve(root, 'index.html');
        requireThat(existsSync(file), 404, 'NOT_FOUND');
        const mime: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
        res.writeHead(200, { 'content-type': mime[extname(file)] ?? 'application/octet-stream', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'content-security-policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss:; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" });
        if (req.method === 'HEAD') res.end(); else createReadStream(file).pipe(res); return;
      }
      rate(`ip:${req.socket.remoteAddress}`, 600);
      let session = sessionOf(req);
      if (path === '/api/session' && req.method === 'GET') {
        if (!session) {
          rate(`session:${req.socket.remoteAddress}`, 30);
          const secret = token(); session = { id: token(), csrf: token(), expires: now() + 30 * DAY };
          db.prepare('INSERT INTO sessions(token_hash,json) VALUES(?,?)').run(hash(secret), JSON.stringify(session));
          res.setHeader('set-cookie', `tabletop_session=${secret}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000${options.secureCookies ? '; Secure' : ''}`);
        }
        json(res, 200, { csrf: session.csrf }); return;
      }
      requireThat(session, 401, 'SESSION_REQUIRED');
      if (req.method !== 'GET') {
        requireThat(req.headers.origin === allowedOrigin(req), 403, 'ORIGIN_REJECTED');
        requireThat(req.headers['x-csrf-token'] === session.csrf, 403, 'CSRF_REJECTED');
        rate(`write:${session.id}`, 180);
      }
      if (path === '/api/templates' && req.method === 'GET') { json(res, 200, builtInTemplates); return; }
      if (path === '/api/rooms' && req.method === 'GET') {
        const rooms = (db.prepare('SELECT json FROM rooms').all() as { json: string }[]).map(r => JSON.parse(r.json) as Room).filter(r => r.expires > now() && r.participants.some(p => p.session === session.id && !p.removed));
        json(res, 200, rooms.map(r => ({ id: r.id, title: r.title, savedAt: r.savedAt }))); return;
      }
      if (path === '/api/rooms' && req.method === 'POST') {
        rate(`create:${session.id}`, 10, DAY);
        requireThat((db.prepare('SELECT COUNT(*) AS n FROM rooms').get() as { n: number }).n < 1000, 503, 'ROOM_CAPACITY_REACHED');
        const b = await body(req);
        let template: Template;
        try { template = b.template ? validateTemplate(b.template) : builtInTemplates.find(t => t.id === b.templateId) ?? builtInTemplates[0]!; }
        catch { throw new ApiError(400, 'INVALID_TEMPLATE'); }
        const p: Participant = { id: token(), session: session.id, nickname: nickname(b.nickname), seat: 0 };
        const room: Room = { id: token(), title: template.title, revision: 0, schemaVersion: 1, rulesVersion: '4.3.1', template, participants: [p], host: p.id, invite: token(), spectatorInvite: token(), locked: false, history: ['Table created.'], savedAt: new Date(now()).toISOString(), expires: now() + 30 * DAY,
          ...(template.profile === 'intrilex-first-contact' ? { game: createGame({ random }) } : { table: createTable(template, random) }) };
        persist(room); json(res, 201, { roomId: room.id, invite: room.invite, spectatorInvite: room.spectatorInvite, view: view(room, p) }); return;
      }
      if (path === '/api/join' && req.method === 'POST') {
        const b = await body(req); requireThat(typeof b.invite === 'string' && /^[\w-]{43}$/.test(b.invite), 404, 'INVITE_INVALID');
        const room = (db.prepare('SELECT json FROM rooms').all() as { json: string }[]).map(r => JSON.parse(r.json) as Room).find(r => r.expires > now() && (r.invite === b.invite || r.spectatorInvite === b.invite));
        requireThat(room, 404, 'INVITE_INVALID');
        requireThat(!room.participants.some(p => p.session === session.id && p.banned), 403, 'ROOM_ACCESS_DENIED');
        let p = room.participants.find(p => p.session === session.id && !p.removed);
        if (!p) {
          requireThat(!room.locked, 403, 'ROOM_LOCKED');
          const spectator = b.spectator === true || room.spectatorInvite === b.invite;
          const seatCount = room.game ? 2 : room.template.seats;
          const seat = Array.from({ length: seatCount }, (_, i) => i).find(i => !room.participants.some(p => !p.removed && p.seat === i));
          requireThat(spectator || seat !== undefined, 409, 'SEATS_FULL');
          requireThat(!spectator || room.participants.filter(p => !p.removed && p.seat === null).length < 16, 409, 'SPECTATORS_FULL');
          requireThat(room.participants.length < 128, 409, 'ROOM_MEMBERSHIP_LIMIT');
          p = { id: token(), session: session.id, nickname: nickname(b.nickname), seat: spectator ? null : seat!, readOnly: room.spectatorInvite === b.invite };
          room.participants.push(p); room.revision++; room.history = [...room.history, 'A guest joined.'].slice(-100); room.savedAt = new Date(now()).toISOString(); room.expires = now() + 30 * DAY; persist(room); broadcast(room);
        }
        json(res, 200, { roomId: room.id, view: view(room, p) }); return;
      }
      const match = /^\/api\/rooms\/([\w-]{43})(?:\/(commands|invites))?$/.exec(path);
      requireThat(match, 404, 'NOT_FOUND');
      let room = roomById(match[1]!); let p = member(room, session);
      if (req.method === 'GET' && !match[2]) { json(res, 200, view(room, p)); return; }
      if (req.method === 'GET' && match[2] === 'invites') { requireThat(room.host === p.id, 403, 'HOST_REQUIRED'); json(res, 200, { invite: room.invite, spectatorInvite: room.spectatorInvite }); return; }
      requireThat(req.method === 'POST' && match[2] === 'commands', 405, 'METHOD_NOT_ALLOWED');
      const b = await body(req);
      // Reading the body yields: reload after it, then validate/apply/persist synchronously.
      room = roomById(match[1]!); p = member(room, session);
      requireThat(typeof b.requestId === 'string' && /^[\w-]{8,100}$/.test(b.requestId), 400, 'INVALID_REQUEST_ID');
      requireThat(b.command && typeof b.command === 'object' && !Array.isArray(b.command), 400, 'INVALID_COMMAND');
      const command = b.command as Record<string, unknown>; const fingerprint = hash(JSON.stringify(command));
      const receipt = db.prepare('SELECT fingerprint FROM receipts WHERE room=? AND actor=? AND request=?').get(room.id, p.id, b.requestId) as { fingerprint: string } | undefined;
      if (receipt) { requireThat(receipt.fingerprint === fingerprint, 409, 'REQUEST_ID_REUSED'); json(res, 200, { view: view(room, p), duplicate: true }); return; }
      if (b.revision !== room.revision) { json(res, 409, { error: 'STALE_REVISION', view: view(room, p) }); return; }
      requireThat(room.revision < 20_000, 409, 'ROOM_COMMAND_LIMIT');
      const host = room.host === p.id;
      if (['lock', 'rotate-invite', 'remove', 'transfer', 'reset'].includes(String(command.type))) requireThat(host, 403, 'HOST_REQUIRED');
      let message = 'Table updated.';
      try {
        switch (command.type) {
          case 'table': requireThat(room.table && p.seat !== null, 403, 'TABLE_ACTION_UNAVAILABLE'); room.table = applyTable(room.table, { seat: p.seat, host }, command.action as Parameters<typeof applyTable>[2], random); break;
          case 'game': requireThat(room.game && p.seat !== null, 403, 'GAME_ACTION_UNAVAILABLE'); room.game = applyGame(room.game, p.seat, command.action as Parameters<typeof applyGame>[2], random); message = 'Game action resolved.'; break;
          case 'seat': {
            requireThat(!p.readOnly, 403, 'SPECTATOR_INVITATION_READ_ONLY');
            const seat = command.seat; requireThat(seat === null || (typeof seat === 'number' && Number.isInteger(seat) && seat >= 0 && seat < (room.game ? 2 : room.template.seats)), 400, 'INVALID_SEAT');
            requireThat(seat === null || !room.participants.some(other => !other.removed && other.id !== p.id && other.seat === seat), 409, 'SEAT_OCCUPIED');
            requireThat(seat !== null || p.seat === null || room.participants.filter(other => !other.removed && other.seat === null).length < 16, 409, 'SPECTATORS_FULL');
            // A seat owns private information: spectators cannot take a vacated seat in a running game.
            requireThat(!room.game || p.seat === seat, 409, 'GUIDED_SEAT_FIXED'); p.seat = seat; message = 'Seat changed.'; break;
          }
          case 'leave': requireThat(!host, 409, 'TRANSFER_HOST_FIRST'); p.removed = true; p.seat = null; message = 'A guest left.'; break;
          case 'lock': requireThat(typeof command.locked === 'boolean', 400, 'INVALID_COMMAND'); room.locked = command.locked; message = room.locked ? 'Table locked.' : 'Table unlocked.'; break;
          case 'rotate-invite': room.invite = token(); room.spectatorInvite = token(); message = 'Invitations replaced.'; break;
          case 'remove': { const target = room.participants.find(x => x.id === command.participantId && !x.removed); requireThat(target && target.id !== room.host, 400, 'INVALID_PARTICIPANT'); target.removed = true; target.banned = true; target.seat = null; message = 'A guest was removed.'; break; }
          case 'transfer': { const target = room.participants.find(x => x.id === command.participantId && !x.removed); requireThat(target && target.seat !== null, 400, 'INVALID_PARTICIPANT'); room.host = target.id; message = 'Host transferred.'; break; }
          case 'reset': requireThat(command.confirm === true, 400, 'CONFIRM_RESET'); if (room.game) room.game = createGame({ random }); else room.table = createTable(room.template, random); message = 'Host reset the table.'; break;
          default: throw new ApiError(400, 'UNKNOWN_COMMAND');
        }
      } catch (e) { if (e instanceof ApiError) throw e; throw new ApiError(422, 'ACTION_NOT_ALLOWED'); }
      room.revision++; room.savedAt = new Date(now()).toISOString(); room.expires = now() + 30 * DAY; room.history = [...room.history, message].slice(-100);
      persist(room, { actor: p.id, request: b.requestId, fingerprint }); broadcast(room);
      json(res, 200, p.removed ? { left: true } : { view: view(room, p) });
    } catch (e) { if (!res.headersSent) json(res, e instanceof ApiError ? e.status : 500, { error: e instanceof ApiError ? e.code : 'INTERNAL_ERROR' }); else res.end(); }
  });
  server.requestTimeout = 15_000; server.headersTimeout = 10_000;
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024, perMessageDeflate: false });
  server.on('upgrade', (req, socket, head) => {
    try {
      requireThat(ready && req.headers.origin === allowedOrigin(req), 403, 'ORIGIN_REJECTED');
      const u = new URL(req.url ?? '/', 'http://localhost'); requireThat(u.pathname === '/ws', 404, 'NOT_FOUND');
      const session = sessionOf(req); requireThat(session, 401, 'SESSION_REQUIRED');
      const room = roomById(u.searchParams.get('room') ?? ''); const p = member(room, session);
      requireThat([...sockets.values()].filter(s => s.participant === p.id).length < 4, 429, 'TAB_LIMIT');
      rate(`ws:${session.id}`, 60);
      wss.handleUpgrade(req, socket, head, ws => {
        const info = { room: room.id, participant: p.id, last: 0 }; sockets.set(ws, info); broadcast(room);
        ws.on('error', () => ws.close());
        ws.on('message', data => {
          if (now() - info.last < 80) return; info.last = now();
          try {
            const r = roomById(room.id); const actor = member(r, session);
            const payload = JSON.parse(data.toString()) as { type?: string; x?: number; y?: number };
            if (payload.type !== 'pointer' || typeof payload.x !== 'number' || typeof payload.y !== 'number' || !Number.isFinite(payload.x) || !Number.isFinite(payload.y)) return;
            const event = JSON.stringify({ type: 'pointer', participantId: actor.id, x: Math.max(0, Math.min(r.template.width, payload.x)), y: Math.max(0, Math.min(r.template.height, payload.y)) });
            for (const [other, peer] of sockets) if (other !== ws && peer.room === room.id && other.readyState === WebSocket.OPEN && other.bufferedAmount < 64_000) other.send(event);
          } catch { ws.close(4003, 'Access ended'); }
        });
        ws.on('close', () => { sockets.delete(ws); try { broadcast(roomById(room.id)); } catch { /* expired or closed */ } });
      });
    } catch { socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); socket.destroy(); }
  });
  const maintenance = setInterval(() => {
    for (const [key, r] of rates) if (now() - r.start > DAY) rates.delete(key);
    const oldRooms = (db.prepare('SELECT id,json FROM rooms').all() as { id: string; json: string }[]).filter(row => (JSON.parse(row.json) as Room).expires <= now());
    for (const row of oldRooms) { for (const [ws, s] of sockets) if (s.room === row.id) ws.close(4004, 'Table expired'); db.prepare('DELETE FROM rooms WHERE id=?').run(row.id); }
    for (const row of db.prepare('SELECT token_hash,json FROM sessions').all() as { token_hash: string; json: string }[]) if ((JSON.parse(row.json) as Session).expires <= now()) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(row.token_hash);
  }, 60_000); maintenance.unref();
  return {
    db, server,
    address: () => server.address(),
    listen: () => new Promise<number>((resolveListen, reject) => { server.once('error', reject); server.listen(options.port ?? 3000, options.host ?? '127.0.0.1', () => { const address = server.address(); resolveListen(typeof address === 'object' && address ? address.port : 0); }); }),
    close: async () => { ready = false; clearInterval(maintenance); for (const ws of sockets.keys()) ws.terminate(); await new Promise<void>(done => wss.close(() => done())); await new Promise<void>(done => server.close(() => done())); db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); db.close(); },
  };
}
