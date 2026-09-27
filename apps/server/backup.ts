import { DatabaseSync, backup } from 'node:sqlite';
import { mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

/**
 * Online backup via SQLite's backup API: safe while the server is running (WAL). The file contains private
 * room state, hands, deck order and invitation tokens — store it like a credential.
 */
const source = resolve(process.env.DATA_PATH ?? 'data/tabletop.sqlite');
const destination = resolve(process.argv[2] ?? `backups/tabletop-${new Date().toISOString().replaceAll(':', '-')}.sqlite`);
if (!existsSync(source)) throw new Error(`Database does not exist: ${source}`);
if (source === destination || existsSync(destination)) throw new Error('Choose a new backup path; existing files are never overwritten.');
mkdirSync(dirname(destination), { recursive: true });
const db = new DatabaseSync(source, { readOnly: true });
try {
  const pages = await backup(db, destination);
  const check = new DatabaseSync(destination, { readOnly: true });
  try {
    const ok = (check.prepare('PRAGMA integrity_check').get() as { integrity_check: string }).integrity_check;
    if (ok !== 'ok') throw new Error('Backup copy failed its integrity check');
  } finally { check.close(); }
  console.log(`Private database backup saved and verified (${pages} pages): ${destination}`);
} finally { db.close(); }
