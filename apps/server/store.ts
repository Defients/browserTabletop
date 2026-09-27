import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Room, Session } from './rooms.js';

export const SCHEMA_VERSION = 2;

/**
 * Single-writer SQLite store. Every accepted room change, its invite index, membership index and request
 * receipt are written in one IMMEDIATE transaction before the client receives success.
 */
const MIGRATIONS: Record<number, string> = {
  1: `CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS rooms(id TEXT PRIMARY KEY, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS receipts(room TEXT NOT NULL, actor TEXT NOT NULL, request TEXT NOT NULL, fingerprint TEXT NOT NULL, PRIMARY KEY(room,actor,request), FOREIGN KEY(room) REFERENCES rooms(id) ON DELETE CASCADE);`,
  2: `ALTER TABLE rooms ADD COLUMN expires INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE receipts ADD COLUMN created INTEGER NOT NULL DEFAULT 0;
      CREATE TABLE IF NOT EXISTS invites(token TEXT PRIMARY KEY, room TEXT NOT NULL, role TEXT NOT NULL, FOREIGN KEY(room) REFERENCES rooms(id) ON DELETE CASCADE);
      CREATE TABLE IF NOT EXISTS members(session TEXT NOT NULL, room TEXT NOT NULL, PRIMARY KEY(session, room), FOREIGN KEY(room) REFERENCES rooms(id) ON DELETE CASCADE);
      CREATE TABLE IF NOT EXISTS recovery(code_hash TEXT PRIMARY KEY, room TEXT NOT NULL, participant TEXT NOT NULL, FOREIGN KEY(room) REFERENCES rooms(id) ON DELETE CASCADE);
      CREATE INDEX IF NOT EXISTS rooms_expires ON rooms(expires);
      CREATE INDEX IF NOT EXISTS receipts_created ON receipts(room, created);`,
};

export class StoreError extends Error {}
/** Invite tokens are indexed by hash so the lookup table never holds usable credentials. */
const sha = (v: string) => createHash('sha256').update(v).digest('hex');

export function openStore(path: string, failPersist?: () => boolean) {
  if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL;');
  db.exec('CREATE TABLE IF NOT EXISTS migrations(version INTEGER PRIMARY KEY)');
  const current = (db.prepare('SELECT MAX(version) AS v FROM migrations').get() as { v: number | null }).v ?? 0;
  if (current > SCHEMA_VERSION) throw new StoreError(`Database schema ${current} is newer than this build (${SCHEMA_VERSION}).`);
  for (let v = current + 1; v <= SCHEMA_VERSION; v++) {
    db.exec('BEGIN IMMEDIATE');
    try { db.exec(MIGRATIONS[v]!); db.prepare('INSERT INTO migrations(version) VALUES(?)').run(v); db.exec('COMMIT'); }
    catch (e) { db.exec('ROLLBACK'); throw e; }
  }

  const tx = <T>(fn: () => T): T => {
    db.exec('BEGIN IMMEDIATE');
    try { const out = fn(); db.exec('COMMIT'); return out; } catch (e) { db.exec('ROLLBACK'); throw e; }
  };

  return {
    db,
    schemaVersion: () => (db.prepare('SELECT MAX(version) AS v FROM migrations').get() as { v: number }).v,
    ping: () => db.prepare('SELECT 1').get(),
    getSession: (tokenHash: string) => { const r = db.prepare('SELECT json FROM sessions WHERE token_hash=?').get(tokenHash) as { json: string } | undefined; return r ? JSON.parse(r.json) as Session : undefined; },
    putSession: (tokenHash: string, s: Session) => db.prepare('INSERT OR REPLACE INTO sessions(token_hash,json) VALUES(?,?)').run(tokenHash, JSON.stringify(s)),
    getRoom: (id: string) => { const r = db.prepare('SELECT json FROM rooms WHERE id=?').get(id) as { json: string } | undefined; return r ? JSON.parse(r.json) as Room : undefined; },
    roomByInvite: (token: string) => db.prepare('SELECT room, role FROM invites WHERE token=?').get(sha(token)) as { room: string; role: 'player' | 'spectator' } | undefined,
    roomsForSession: (session: string) => (db.prepare('SELECT r.json FROM members m JOIN rooms r ON r.id=m.room WHERE m.session=?').all(session) as { json: string }[]).map(r => JSON.parse(r.json) as Room),
    roomCount: () => (db.prepare('SELECT COUNT(*) AS n FROM rooms').get() as { n: number }).n,
    receipt: (room: string, actor: string, request: string) => db.prepare('SELECT fingerprint FROM receipts WHERE room=? AND actor=? AND request=?').get(room, actor, request) as { fingerprint: string } | undefined,
    recoveryLookup: (codeHash: string) => db.prepare('SELECT room, participant FROM recovery WHERE code_hash=?').get(codeHash) as { room: string; participant: string } | undefined,

    /** Durable write of the whole accepted change. Throws StoreError('SAVE_FAILED') and leaves the database untouched on failure. */
    saveRoom(room: Room, now: number, receipt?: { actor: string; request: string; fingerprint: string }, recovery?: { codeHash: string; participant: string }) {
      try {
        tx(() => {
          if (failPersist?.()) throw new Error('Injected storage failure');
          db.prepare('INSERT INTO rooms(id,json,expires) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json, expires=excluded.expires').run(room.id, JSON.stringify(room), room.expires);
          db.prepare('DELETE FROM invites WHERE room=?').run(room.id);
          db.prepare('INSERT INTO invites(token,room,role) VALUES(?,?,?)').run(sha(room.invite), room.id, 'player');
          db.prepare('INSERT INTO invites(token,room,role) VALUES(?,?,?)').run(sha(room.spectatorInvite), room.id, 'spectator');
          db.prepare('DELETE FROM members WHERE room=?').run(room.id);
          for (const p of room.participants) if (!p.removed) db.prepare('INSERT OR IGNORE INTO members(session,room) VALUES(?,?)').run(p.session, room.id);
          for (const p of room.participants) if (p.removed || p.recoveryHash === undefined) db.prepare('DELETE FROM recovery WHERE room=? AND participant=?').run(room.id, p.id);
          if (recovery) { db.prepare('DELETE FROM recovery WHERE room=? AND participant=?').run(room.id, recovery.participant); db.prepare('INSERT INTO recovery(code_hash,room,participant) VALUES(?,?,?)').run(recovery.codeHash, room.id, recovery.participant); }
          if (receipt) {
            db.prepare('INSERT INTO receipts(room,actor,request,fingerprint,created) VALUES(?,?,?,?,?)').run(room.id, receipt.actor, receipt.request, receipt.fingerprint, now);
            // Bounded retention: keep the newest 2000 receipts per room.
            db.prepare('DELETE FROM receipts WHERE room=? AND rowid NOT IN (SELECT rowid FROM receipts WHERE room=? ORDER BY created DESC, rowid DESC LIMIT 2000)').run(room.id, room.id);
          }
        });
      } catch { throw new StoreError('SAVE_FAILED'); }
    },
    consumeRecovery(codeHash: string) { db.prepare('DELETE FROM recovery WHERE code_hash=?').run(codeHash); },

    /** Retention: remove expired rooms (cascade removes invites, receipts, members, recovery) and sessions. */
    expire(now: number): string[] {
      const ids = (db.prepare('SELECT id FROM rooms WHERE expires<=?').all(now) as { id: string }[]).map(r => r.id);
      tx(() => {
        db.prepare('DELETE FROM rooms WHERE expires<=?').run(now);
        for (const row of db.prepare('SELECT token_hash,json FROM sessions').all() as { token_hash: string; json: string }[]) if ((JSON.parse(row.json) as Session).expires <= now) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(row.token_hash);
      });
      return ids;
    },
    close() { try { db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); } finally { db.close(); } },
  };
}
export type Store = ReturnType<typeof openStore>;
