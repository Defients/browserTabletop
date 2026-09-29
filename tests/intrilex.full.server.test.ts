import { test } from 'node:test';
import assert from 'node:assert/strict';
import { builtInTemplates, validateTemplate } from '../packages/templates/index.js';
import { parseRoomCommand } from '../apps/server/rooms.js';
import { Client, cleanup, startServer } from './helpers/server.js';

const full = builtInTemplates.find(t => t.id === 'intrilex-full')!;

test('Full template is distinct, exactly two seats, data-only; Core remains manual', () => {
  assert.equal(validateTemplate(full).profile, 'intrilex-full');
  assert.equal(full.seats, 2);
  assert.equal(full.plugins?.intrilex?.rulesVersion, '4.3.1');
  assert.throws(() => validateTemplate({ ...full, seats: 3 }), /exactly two seats/);
  assert.equal(builtInTemplates.find(t => t.id === 'intrilex-core')!.profile, 'intrilex-core');
});

test('composite game action boundary preserves order and refuses oversized, duplicate or executable fields', () => {
  const action = { type: 'effect', cardIds: ['b', 'a'], targetIds: ['y', 'x'], mode: 'combo' };
  const parsed = parseRoomCommand({ type: 'game', action });
  assert.equal(parsed.type, 'game');
  if (parsed.type !== 'game') throw new Error('wrong command');
  assert.deepEqual(parsed.action.cardIds, ['b', 'a']);
  assert.deepEqual(parsed.action.targetIds, ['y', 'x']);
  for (const bad of [
    { cardIds: ['a', 'a'] }, { cardIds: [] }, { cardIds: ['a', 'b', 'c', 'd', 'e'] },
    { targetIds: Array.from({ length: 9 }, (_, i) => String(i)) }, { targetIds: [''] },
    { cardIds: [{}] }, { cardIds: ['x'.repeat(65)] }, { code: 'execute()' },
  ]) assert.throws(() => parseRoomCommand({ type: 'game', action: { type: 'effect', ...bad } }), /INVALID_COMMAND/);
});

test('Full online rooms preserve profile, authority, privacy, fixed seats, reset and persisted identity', async t => {
  const s = await startServer();
  t.after(async () => { await s.stop(); cleanup(s.dir); });
  const host = new Client(s), guest = new Client(s), spectator = new Client(s);
  const made = await host.create('Host', 'intrilex-full');
  await guest.join(made.invite, 'Guest');
  const spec = await spectator.join(made.spectatorInvite, 'Observer');
  let hv = (await host.view(made.roomId)).data;
  const gv = (await guest.view(made.roomId)).data;
  assert.equal(hv.profile, 'intrilex-full');
  assert.equal(hv.game!.profile, 'intrilex-full');
  assert.equal(hv.seats, 2);
  assert.equal(hv.table, undefined);
  assert.deepEqual(hv.game!.players.map(p => p.goal), [21, 21]);
  assert.deepEqual([hv.game!.hand.length, gv.game!.hand.length].sort(), [5, 6]);
  assert.equal(spec.data.view.game!.hand.length, 0);
  for (const card of gv.game!.hand) assert.ok(!JSON.stringify(hv).includes(card.id));
  for (const card of [...hv.game!.hand, ...gv.game!.hand]) assert.ok(!JSON.stringify(spec.data.view).includes(card.id));
  assert.equal((await new Client(s).join(made.invite, 'Third')).data.error, 'SEATS_FULL');
  assert.equal((await spectator.command(made.roomId, hv.revision, { type: 'game', action: { type: 'draw' } })).data.error, 'SEAT_REQUIRED');
  assert.equal((await host.command(made.roomId, hv.revision, { type: 'game', action: { type: 'effect', cardIds: ['forged-a', 'forged-b'] } })).status, 422);
  hv = (await host.command(made.roomId, hv.revision, { type: 'seat', seat: null })).data.view!;
  hv = (await guest.command(made.roomId, hv.revision, { type: 'seat', seat: null })).data.view!;
  assert.equal((await host.command(made.roomId, hv.revision, { type: 'seat', seat: 1 })).data.error, 'GUIDED_SEAT_FIXED');
  hv = (await host.command(made.roomId, hv.revision, { type: 'seat', seat: 0 })).data.view!;
  const oldHand = hv.game!.hand.map(c => c.id);
  hv = (await host.command(made.roomId, hv.revision, { type: 'reset', confirm: true })).data.view!;
  assert.equal(hv.game!.profile, 'intrilex-full');
  assert.deepEqual(hv.game!.players.map(p => p.goal), [21, 21]);
  assert.notDeepEqual(hv.game!.hand.map(c => c.id), oldHand);
  const saved = s.app.store.getRoom(made.roomId)!;
  assert.equal(saved.engineVersion, 3);
  assert.equal(saved.game!.version, 3);
  assert.equal(saved.game!.profile, 'intrilex-full');
  // A second store-backed read reconstructs the same revision and private seat.
  assert.deepEqual((await host.view(made.roomId)).data.game, hv.game);
  s.app.store.db.prepare('UPDATE rooms SET json=? WHERE id=?').run(JSON.stringify({ ...saved, engineVersion: 2 }), made.roomId);
  assert.equal((await host.view(made.roomId)).data.error, 'ROOM_VERSION_UNSUPPORTED');
});

test('Full survives process restart and recovery without granting the other private seat', async t => {
  let s = await startServer();
  const dir = s.dir;
  t.after(async () => { await s.stop(); cleanup(dir); });
  const host = new Client(s), guest = new Client(s);
  const room = await host.create('Host', 'intrilex-full');
  await guest.join(room.invite, 'Guest');
  const before = (await guest.view(room.roomId)).data;
  const { code } = (await guest.post<{ code: string }>(`/api/rooms/${room.roomId}/recovery`)).data;
  await s.stop();
  s = await startServer({ dir });
  guest.srv = s;
  const restored = (await guest.view(room.roomId)).data;
  assert.equal(restored.profile, 'intrilex-full');
  assert.deepEqual(restored.game, before.game);
  assert.equal(restored.you.id, before.you.id);
  const freshBrowser = new Client(s);
  const recovered = await freshBrowser.post<{ view: typeof restored }>('/api/recover', { code });
  assert.equal(recovered.status, 200);
  assert.equal(recovered.data.view.you.id, before.you.id);
  assert.deepEqual(recovered.data.view.game, before.game);
  assert.equal((await guest.view(room.roomId)).status, 403);
  const v = recovered.data.view;
  const spec = (await freshBrowser.command(room.roomId, v.revision, { type: 'seat', seat: null })).data.view!;
  // Free the other seat through its preserved host session before attempting the knowledge switch.
  host.srv = s;
  const freed = (await host.command(room.roomId, spec.revision, { type: 'seat', seat: null })).data.view!;
  assert.equal((await freshBrowser.command(room.roomId, freed.revision, { type: 'seat', seat: 0 })).data.error, 'GUIDED_SEAT_FIXED');
});
