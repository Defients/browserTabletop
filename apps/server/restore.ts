import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { SCHEMA_VERSION } from './store.js';

/** Restores a private backup into an unused DATA_PATH. The live database is never overwritten in place. */
const source = process.argv[2] ? resolve(process.argv[2]) : '';
const destination = resolve(process.env.DATA_PATH ?? 'data/tabletop.sqlite');
if (!source || !existsSync(source)) throw new Error('Usage: npm run restore -- path/to/private-backup.sqlite');
if (existsSync(destination) || existsSync(destination + '-wal') || existsSync(destination + '-shm')) throw new Error('Restore requires an unused DATA_PATH. Stop the server, choose a new database path, and keep the old files for rollback.');
const db = new DatabaseSync(source, { readOnly: true });
try {
  const integrity = db.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
  if (integrity.integrity_check !== 'ok') throw new Error('Backup failed its integrity check');
  const version = (db.prepare('SELECT MAX(version) AS version FROM migrations').get() as { version: number | null }).version ?? 0;
  if (version < 1 || version > SCHEMA_VERSION) throw new Error(`Unsupported backup schema ${version}; this build supports 1–${SCHEMA_VERSION} (older schemas migrate on start).`);
  mkdirSync(dirname(destination), { recursive: true });
  db.prepare('VACUUM INTO ?').run(destination);
  console.log(`Restored private database (schema ${version}) to ${destination}. Start the server with DATA_PATH set to this file.`);
} finally { db.close(); }
