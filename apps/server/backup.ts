import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

/**
 * Online backup via `VACUUM INTO`: a consistent, compacted snapshot taken inside one read transaction, safe
 * while the server runs (WAL) and available on every supported Node release. The file contains private room
 * state, hands, deck order and invitation tokens — store it like a credential.
 */
const source = resolve(process.env.DATA_PATH ?? 'data/tabletop.sqlite');
const destination = resolve(process.argv[2] ?? `backups/tabletop-${new Date().toISOString().replaceAll(':', '-')}.sqlite`);
if (!existsSync(source)) throw new Error(`Database does not exist: ${source}`);
if (source === destination || existsSync(destination)) throw new Error('Choose a new backup path; existing files are never overwritten.');
mkdirSync(dirname(destination), { recursive: true });
const db = new DatabaseSync(source, { readOnly: true });
try {
  db.prepare('VACUUM INTO ?').run(destination);
  const check = new DatabaseSync(destination, { readOnly: true });
  try {
    const ok = (check.prepare('PRAGMA integrity_check').get() as { integrity_check: string }).integrity_check;
    if (ok !== 'ok') throw new Error('Backup copy failed its integrity check');
    const rooms = (check.prepare('SELECT COUNT(*) AS n FROM rooms').get() as { n: number }).n;
    console.log(`Private database backup saved and verified (${rooms} rooms): ${destination}`);
  } finally { check.close(); }
} finally { db.close(); }
