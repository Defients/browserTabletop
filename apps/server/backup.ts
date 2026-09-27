import { DatabaseSync, backup } from 'node:sqlite';
import { mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
const source = resolve(process.env.DATA_PATH ?? 'data/tabletop.sqlite');
const destination = resolve(process.argv[2] ?? `backups/tabletop-${new Date().toISOString().replaceAll(':', '-')}.sqlite`);
if (!existsSync(source)) throw new Error('Database does not exist');
if (source === destination || existsSync(destination)) throw new Error('Choose a new backup path');
mkdirSync(dirname(destination), { recursive: true });
const db = new DatabaseSync(source, { readOnly: true });
try { await backup(db, destination); console.log(`Private database backup saved: ${destination}`); } finally { db.close(); }
