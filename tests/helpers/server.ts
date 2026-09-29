import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { createServer, type ServerOptions } from '../../apps/server/server.js';
import type { RoomView } from '../../packages/protocol/index.js';

export interface TestServer { base: string; origin: string; dir: string; dbPath: string; logs: string[]; stop: () => Promise<void>; app: ReturnType<typeof createServer> }

export async function startServer(opts: Partial<ServerOptions> & { dir?: string } = {}): Promise<TestServer> {
  const dir = opts.dir ?? mkdtempSync(join(tmpdir(), 'tabletop-test-'));
  const dbPath = join(dir, 'db.sqlite');
  const logs: string[] = [];
  const app = createServer({ dbPath, port: 0, staticDir: join(dir, 'static'), log: e => logs.push(JSON.stringify(e)), ...opts });
  const port = await app.listen();
  const base = `http://127.0.0.1:${port}`;
  return { base, origin: base, dir, dbPath, logs, app, stop: () => app.close() };
}
export const cleanup = (dir: string) => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* Windows may hold WAL briefly */ } };

/** A browser-like client: cookie jar, CSRF header, same-origin Origin header. Records every raw response body. */
export class Client {
  cookie = ''; csrf = ''; raw: string[] = [];
  constructor(public srv: TestServer, public originOverride?: string) {}
  async session() {
    const r = await fetch(this.srv.base + '/api/session', { headers: this.cookie ? { cookie: this.cookie } : {} });
    const set = r.headers.get('set-cookie');
    if (set) this.cookie = set.split(';')[0]!;
    this.csrf = ((await r.json()) as { csrf: string }).csrf;
    return set;
  }
  async req<T = Record<string, unknown>>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<{ status: number; data: T }> {
    if (!this.csrf) await this.session();
    const r = await fetch(this.srv.base + path, {
      method, body: body === undefined ? undefined : JSON.stringify(body),
      headers: { cookie: this.cookie, origin: this.originOverride ?? this.srv.origin, 'x-csrf-token': this.csrf, ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
    });
    const text = await r.text();
    this.raw.push(text);
    return { status: r.status, data: (text ? JSON.parse(text) : {}) as T };
  }
  get = <T = Record<string, unknown>>(p: string) => this.req<T>('GET', p);
  post = <T = Record<string, unknown>>(p: string, b: unknown = {}) => this.req<T>('POST', p, b);
  async create(nickname = 'Host', templateId = 'intrilex-first-contact') {
    const r = await this.post<{ roomId: string; invite: string; spectatorInvite: string; view: RoomView }>('/api/rooms', { nickname, templateId });
    if (r.status !== 201) throw new Error(`create failed ${r.status} ${JSON.stringify(r.data)}`);
    return r.data;
  }
  join = (invite: string, nickname = 'Guest', spectator = false) => this.post<{ roomId: string; view: RoomView; error?: string }>('/api/join', { invite, nickname, spectator });
  view = (roomId: string) => this.get<RoomView & { error?: string }>(`/api/rooms/${roomId}`);
  command(roomId: string, revision: number, command: unknown, requestId = `r-${Math.random().toString(36).slice(2)}-${Date.now()}`) {
    return this.post<{ view?: RoomView; error?: string; duplicate?: boolean; rebased?: boolean }>(`/api/rooms/${roomId}/commands`, { requestId, revision, command });
  }
  socket(roomId: string, origin = this.srv.origin) {
    const ws = new WebSocket(`${this.srv.base.replace('http', 'ws')}/ws?room=${roomId}`, { headers: { cookie: this.cookie, origin } });
    const messages: string[] = [];
    ws.on('message', d => { messages.push(d.toString()); this.raw.push(d.toString()); });
    const opened = new Promise<void>((res, rej) => { ws.once('open', () => res()); ws.once('error', rej); ws.once('unexpected-response', (_q, r) => rej(new Error(`HTTP ${r.statusCode}`))); });
    return { ws, messages, opened, close: () => ws.close() };
  }
}
export const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
export async function until(pred: () => boolean, ms = 3000) { const t = Date.now(); while (!pred()) { if (Date.now() - t > ms) throw new Error('timed out'); await wait(20); } }
