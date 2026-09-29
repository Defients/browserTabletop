import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { Client, cleanup, startServer } from './helpers/server.js';

const run = (script: string, arg: string, dataPath: string) =>
  execFileSync(process.execPath, ['--import', 'tsx', script, arg], { env: { ...process.env, DATA_PATH: dataPath }, encoding: 'utf8', stdio: 'pipe' });

test('backup while serving, restore into a fresh path, and serve the restored room', async () => {
  const s1 = await startServer();
  const host = new Client(s1);
  const room = await host.create('Ada', 'standard-54');
  let v = (await host.view(room.roomId)).data;
  v = (await host.command(room.roomId, v.revision, { type: 'table', action: { type: 'draw', zone: 'deck', count: 3 } })).data.view!;
  const backupFile = join(s1.dir, 'backups', 'b1.sqlite');
  assert.match(run('apps/server/backup.ts', backupFile, s1.dbPath), /saved and verified/);
  assert.throws(() => run('apps/server/backup.ts', backupFile, s1.dbPath), 'never overwrites an existing backup');
  // A change after the backup must not appear in the restored copy.
  await host.command(room.roomId, v.revision, { type: 'table', action: { type: 'draw', zone: 'deck', count: 1 } });
  await s1.stop();

  assert.throws(() => run('apps/server/restore.ts', backupFile, s1.dbPath), 'refuses to overwrite a live database');
  const fresh = join(s1.dir, 'restored', 'db.sqlite');
  assert.match(run('apps/server/restore.ts', backupFile, fresh), /Restored private database \(schema 2\)/);

  const s2 = await startServer({ dbPath: fresh, dir: s1.dir });
  host.srv = s2;
  const back = (await host.view(room.roomId)).data;
  assert.equal(back.revision, v.revision, 'state as of the backup');
  assert.equal(back.table!.cards.length, 3);
  assert.equal((await new Client(s2).join(room.invite, 'Bo')).status, 200, 'invitations restored');
  await s2.stop();
  cleanup(s1.dir);
});
