import { createServer } from './server.js';
const app = createServer({ dbPath: process.env.DATA_PATH ?? 'data/tabletop.sqlite', host: process.env.HOST ?? '127.0.0.1', port: Number(process.env.PORT ?? 3000), origin: process.env.ORIGIN, secureCookies: process.env.COOKIE_SECURE === 'true', staticDir: process.env.STATIC_DIR ?? 'dist/client' });
await app.listen();
console.log(`Tabletop listening on ${process.env.HOST ?? '127.0.0.1'}:${process.env.PORT ?? 3000}`);
let closing = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { if (closing) return; closing = true; void app.close().then(() => process.exit(0)); });
