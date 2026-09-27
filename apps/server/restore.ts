import { DatabaseSync, backup } from 'node:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
const source = process.argv[2] ? resolve(process.argv[2]) : '';
const destination = resolve(process.env.DATA_PATH ?? 'data/tabletop.sqlite');
if (!source || !existsSync(source)) throw new Error('Usage: npm run restore -- path/to/private-backup.sqlite');
if (existsSync(destination) || existsSync(destination + '-wal') || existsSync(destination + '-shm')) throw new Error('Restore requires an unused DATA_PATH. Stop server and choose a new database path; retain old files for rollback.');
const db = new DatabaseSync(source, { readOnly: true });
try {
  const integrity = db.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
  if (integrity.integrity_check !== 'ok') throw new Error('Backup failed integrity check');
  const version = db.prepare('SELECT MAX(version) AS version FROM migrations').get() as { version: number };
  if (version.version !== 1) throw new Error('Unsupported backup schema');
  mkdirSync(dirname(destination), { recursive: true }); await backup(db, destination);
  console.log(`Restored private database to ${destination}. Start with this DATA_PATH.`);
} finally { db.close(); }
