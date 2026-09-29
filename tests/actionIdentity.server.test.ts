import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../packages/intrilex/index.js';
import { actionInput } from '../packages/intrilex/actionIdentity.js';
import { Client, cleanup, startServer } from './helpers/server.js';

test('HTTP Full commands preserve exact Deep Draw costs; omitted, reordered and forged costs refuse without durable change', async t => {
  const s = await startServer();
  t.after(async () => { await s.stop(); cleanup(s.dir); });
  const host = new Client(s), guest = new Client(s);
  const made = await host.create('Host', 'intrilex-full');
  await guest.join(made.invite, 'Guest');
  const room = s.app.store.getRoom(made.roomId)!;
  room.game = fixture({ profile: 'intrilex-full', hands: [['6♠', '2♥', 'K♦'], ['A♥']], deckTop: ['7♥', '8♥', '9♥', '10♥'] });
  s.app.store.saveRoom(room, Date.now());
  const before = (await host.view(made.roomId)).data;
  const selected = before.game!.legalActions.find(a => a.mode === 'deep-draw' && a.targetIds?.length === 2)!;
  assert.ok(selected);
  for (const targetIds of [undefined, [...selected.targetIds!].reverse(), ['forged-cost-a', 'forged-cost-b']]) {
    const refused = await host.command(made.roomId, before.revision, { type: 'game', action: { ...actionInput(selected), targetIds } });
    assert.equal(refused.status, 422);
    assert.equal(refused.data.error, 'ACTION_UNAVAILABLE');
    assert.deepEqual(s.app.store.getRoom(made.roomId), room, 'refused identity does not change durable state');
  }
  const accepted = await host.command(made.roomId, before.revision, { type: 'game', action: actionInput(selected) }, 'identity-deep-costs-1');
  assert.equal(accepted.status, 200);
  assert.equal(accepted.data.view!.revision, before.revision + 1);
  const saved = s.app.store.getRoom(made.roomId)!;
  assert.deepEqual(saved.game!.stack[0]!.action.targetIds, selected.targetIds);
  assert.ok(selected.targetIds!.every(id => !saved.game!.players[0]!.hand.some(c => c.id === id)), 'both chosen costs leave hand at declaration');
  const duplicate = await host.command(made.roomId, before.revision, { type: 'game', action: actionInput(selected) }, 'identity-deep-costs-1');
  assert.equal(duplicate.data.duplicate, true);
  assert.deepEqual(s.app.store.getRoom(made.roomId), saved, 'an accepted retry cannot spend costs twice');
});

test('HTTP Full composite source roles remain ordered and choose the exact later enumerated Ultra', async t => {
  const s = await startServer();
  t.after(async () => { await s.stop(); cleanup(s.dir); });
  const host = new Client(s), guest = new Client(s);
  const made = await host.create('Host', 'intrilex-full');
  await guest.join(made.invite, 'Guest');
  const room = s.app.store.getRoom(made.roomId)!;
  room.game = fixture({ profile: 'intrilex-full', hands: [['3♣', '3♠', '4♣', '5♠'], ['A♥', 'A♦']] });
  s.app.store.saveRoom(room, Date.now());
  const before = (await host.view(made.roomId)).data;
  const four = before.game!.hand.find(c => c.rank === '4')!;
  const candidates = before.game!.legalActions.filter(a => a.mode === 'ultra-black:raid' && a.cardId === four.id);
  assert.ok(candidates.length > 1);
  const selected = candidates.at(-1)!;
  assert.notDeepEqual(selected.cardIds, candidates[0]!.cardIds);
  for (const cardIds of [undefined, [...selected.cardIds!].reverse(), ['forged-1', 'forged-2', 'forged-3']]) {
    const refused = await host.command(made.roomId, before.revision, { type: 'game', action: { ...actionInput(selected), cardIds } });
    assert.equal(refused.status, 422);
    assert.equal(refused.data.error, 'ACTION_UNAVAILABLE');
    assert.deepEqual(s.app.store.getRoom(made.roomId), room);
  }
  const accepted = await host.command(made.roomId, before.revision, { type: 'game', action: actionInput(selected) });
  assert.equal(accepted.status, 200);
  const saved = s.app.store.getRoom(made.roomId)!;
  assert.deepEqual(saved.game!.stack[0]!.action.cardIds, selected.cardIds);
  assert.deepEqual([saved.game!.stack[0]!.card!.id, ...saved.game!.stack[0]!.cards!.map(c => c.id)], selected.cardIds);
});
