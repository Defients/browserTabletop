import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer as netServer } from 'node:net';
import type { Page } from '@playwright/test';

const freePort = () => new Promise<number>(res => { const s = netServer().listen(0, '127.0.0.1', () => { const p = (s.address() as { port: number }).port; s.close(() => res(p)); }); });

/** A genuine production backend (`node dist/server/index.js`) with its own SQLite file. */
export class Backend {
  proc?: ChildProcess; port = 0; dir = mkdtempSync(join(tmpdir(), 'tabletop-e2e-')); logs: string[] = [];
  get url() { return `http://127.0.0.1:${this.port}`; }
  async start() {
    if (!existsSync('dist/server/index.js')) throw new Error('Run `npm run build` first (test:e2e does this).');
    if (!this.port) this.port = await freePort();
    this.proc = spawn(process.execPath, ['dist/server/index.js'], { env: { ...process.env, PORT: String(this.port), HOST: '127.0.0.1', DATA_PATH: join(this.dir, 'e2e.sqlite'), ORIGIN: this.url, STATIC_DIR: 'dist/client' }, stdio: ['ignore', 'pipe', 'pipe'] });
    this.proc.stdout!.on('data', d => this.logs.push(String(d)));
    this.proc.stderr!.on('data', d => this.logs.push(String(d)));
    for (let i = 0; i < 100; i++) { try { if ((await fetch(this.url + '/ready')).ok) return; } catch { /* starting */ } await new Promise(r => setTimeout(r, 100)); }
    throw new Error('backend did not start:\n' + this.logs.join(''));
  }
  async stop() {
    if (!this.proc) return;
    const p = this.proc; this.proc = undefined;
    const exited = new Promise(r => p.once('exit', r));
    p.kill('SIGTERM');
    await Promise.race([exited, new Promise(r => setTimeout(r, 5000))]);
    if (p.exitCode === null) p.kill('SIGKILL');
  }
  async restart() { await this.stop(); await this.start(); }
}

/** Collects console errors and page errors so tests can assert a clean run. */
export function watchErrors(page: Page) {
  const errors: string[] = [];
  // Reloads and deliberate backend restarts legitimately interrupt sockets; anything else is an app error.
  page.on('pageerror', e => { if (!/connection to ws:\/\/.* was interrupted/.test(e.message)) errors.push(e.message); });
  page.on('console', m => { if (m.type() === 'error' && !/WebSocket|ERR_CONNECTION|Failed to load resource|net::|connection to ws:\/\/.* was interrupted/.test(m.text())) errors.push(m.text()); });
  return errors;
}
