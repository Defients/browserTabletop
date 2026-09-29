import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyGame, availableActions, fixture, seeded } from '../packages/intrilex/index.js';

test('Full Deep Draw preserves the exact selected costs and refuses omitted or reordered costs', () => {
  const s = fixture({ profile: 'intrilex-full', hands: [['6♠', '2♥', 'K♦'], ['A♥']], deckTop: ['7♥', '8♥', '9♥', '10♥'] });
  const options = availableActions(s, 0).filter(a => a.mode === 'deep-draw');
  const selected = options.find(a => a.targetIds?.length === 2)!;
  const after = applyGame(s, 0, selected, seeded(12));
  assert.deepEqual(after.stack[0]!.action.targetIds, selected.targetIds);
  assert.throws(() => applyGame(s, 0, { ...selected, targetIds: undefined }, seeded(12)), /not legal/);
  assert.throws(() => applyGame(s, 0, { ...selected, targetIds: [...selected.targetIds!].reverse() }, seeded(12)), /not legal/);
});

test('Full Ultra Black keeps score/cast/exile source roles ordered and rejects an unknown permutation', () => {
  const s = fixture({ profile: 'intrilex-full', hands: [['3♣', '4♠', '5♣'], ['A♥', 'A♦']], deckTop: ['7♥', '8♥'] });
  const selected = availableActions(s, 0).find(a => a.mode === 'ultra-black:raid')!;
  assert.ok(selected);
  const after = applyGame(s, 0, selected, seeded(15));
  assert.deepEqual(after.stack[0]!.action.cardIds, selected.cardIds);
  assert.throws(() => applyGame(s, 0, { ...selected, cardIds: undefined }, seeded(15)), /not legal/);
  assert.throws(() => applyGame(s, 0, { ...selected, cardIds: [...selected.cardIds!].reverse() }, seeded(15)), /not legal/);
});

test('engine rejects malformed, duplicate, and oversized action arrays', () => {
  const s = fixture({ hands: [['6♥'], ['5♣']] });
  for (const ids of [[], ['x', 'x'], Array.from({ length: 5 }, (_, i) => `x${i}`), [12], 'x']) {
    assert.throws(() => applyGame(s, 0, { type: 'draw', cardIds: ids }), /Malformed/);
  }
  assert.throws(() => applyGame(s, 0, { type: 'draw', targetIds: Array.from({ length: 9 }, (_, i) => `x${i}`) }), /Malformed/);
  assert.doesNotThrow(() => applyGame(s, 0, { type: 'draw' }, seeded(19)));
});

test('Full actions sharing the old scalar identity execute the selected later composite sources', () => {
  const s = fixture({ profile: 'intrilex-full', hands: [['3♣', '3♠', '4♣', '5♠'], ['A♥', 'A♦']] });
  const four = s.players[0]!.hand.find(c => c.rank === '4')!;
  const sameScalars = availableActions(s, 0).filter(a => a.mode === 'ultra-black:raid' && a.cardId === four.id);
  assert.ok(sameScalars.length > 1);
  const selected = sameScalars.at(-1)!;
  assert.notDeepEqual(selected.cardIds, sameScalars[0]!.cardIds);
  const after = applyGame(s, 0, selected, seeded(23));
  assert.deepEqual(after.stack[0]!.action.cardIds, selected.cardIds);
  assert.deepEqual([after.stack[0]!.card!.id, ...after.stack[0]!.cards!.map(c => c.id)], selected.cardIds, 'all selected ordered sources commit to the pending composite');
});
