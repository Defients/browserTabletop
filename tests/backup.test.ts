import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { Client, cleanup, startServer, type TestServer } from './helpers/server.js';

// Keep the in-process HTTP server responsive while exercising the real backup CLI.
const exec = promisify(execFile);
const run = async (script: string, arg: string, dataPath: string) =>
  (await exec(process.execPath, ['--import', 'tsx', script, arg], { env: { ...process.env, DATA_PATH: dataPath }, encoding: 'utf8' })).stdout;

test('backup while serving, restore into a fresh path, and serve the restored room', async t => {
  const s1 = await startServer();
  let active: TestServer | undefined = s1;
  t.after(async () => { try { await active?.stop(); } finally { cleanup(s1.dir); } });
  const host = new Client(s1);
  const room = await host.create('Ada', 'standard-54');
  let v = (await host.view(room.roomId)).data;
  v = (await host.command(room.roomId, v.revision, { type: 'table', action: { type: 'draw', zone: 'deck', count: 3 } })).data.view!;
  const backupFile = join(s1.dir, 'backups', 'b1.sqlite');
  assert.match(await run('apps/server/backup.ts', backupFile, s1.dbPath), /saved and verified/);
  await assert.rejects(() => run('apps/server/backup.ts', backupFile, s1.dbPath), 'never overwrites an existing backup');
  // A change after the backup must not appear in the restored copy.
  await host.command(room.roomId, v.revision, { type: 'table', action: { type: 'draw', zone: 'deck', count: 1 } });
  await s1.stop();
  active = undefined;

  await assert.rejects(() => run('apps/server/restore.ts', backupFile, s1.dbPath), 'refuses to overwrite a live database');
  const fresh = join(s1.dir, 'restored', 'db.sqlite');
  assert.match(await run('apps/server/restore.ts', backupFile, fresh), /Restored private database \(schema 2\)/);

  const s2 = await startServer({ dbPath: fresh, dir: s1.dir });
  active = s2;
  host.srv = s2;
  const back = (await host.view(room.roomId)).data;
  assert.equal(back.revision, v.revision, 'state as of the backup');
  assert.equal(back.table!.cards.length, 3);
  assert.equal((await new Client(s2).join(room.invite, 'Bo')).status, 200, 'invitations restored');
});
