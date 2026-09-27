import { createServer } from './server.js';

const host = process.env.HOST ?? '127.0.0.1';
const port = Number(process.env.PORT ?? 3000);
const app = createServer({
  dbPath: process.env.DATA_PATH ?? 'data/tabletop.sqlite', host, port, origin: process.env.ORIGIN || undefined,
  secureCookies: process.env.COOKIE_SECURE === 'true', staticDir: process.env.STATIC_DIR ?? 'dist/client',
});
const bound = await app.listen();
console.log(JSON.stringify({ t: new Date().toISOString(), event: 'listening', host, port: bound }));

let closing = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    if (closing) return;
    closing = true;
    console.log(JSON.stringify({ t: new Date().toISOString(), event: 'shutdown', signal }));
    const force = setTimeout(() => process.exit(1), 10_000);
    force.unref();
    void app.close().then(() => process.exit(0));
  });
}
