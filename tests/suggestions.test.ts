import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyGame, availableActions, fixture, projectGame, seeded } from '../packages/intrilex/index.js';
import type { GameAction, GameView } from '../packages/intrilex/types.js';
import { actionInput, actionKey } from '../packages/intrilex/actionIdentity.js';
import { rankSuggestedMoves } from '../packages/intrilex/suggestions.js';

const deepFreeze = (v: unknown): void => {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) { Object.freeze(v); for (const child of Object.values(v)) deepFreeze(child); }
};
const withActions = (v: GameView, actions: GameAction[]) => ({ ...v, legalActions: actions });

test('suggestions are deterministic, immutable, bounded, distinct and retain original action objects', () => {
  const v = projectGame(fixture({ hands: [['2♥', 'BJ', 'K♦'], ['5♣']] }), 0);
  deepFreeze(v);
  const before = JSON.stringify(v);
  const result = rankSuggestedMoves(v);
  assert.equal(result.length, 2);
  assert.deepEqual(rankSuggestedMoves(v), result);
  assert.equal(new Set(result.map(r => r.key)).size, result.length);
  assert.ok(result.every(r => v.legalActions.includes(r.action) && r.label === r.action.label));
  assert.equal(JSON.stringify(v), before);
});

test('victory recommendations use secured PR score and End timing, never ER Anchor value', () => {
  const winning = projectGame(fixture({ hands: [[], ['5♣']], pr: [['BJ', '4♦'], []], miniTurns: 0 }), 0);
  assert.equal(rankSuggestedMoves(winning)[0]!.score, 10000);
  assert.match(rankSuggestedMoves(winning)[0]!.explanation, /End Phase victory/);
  const anchor = projectGame(fixture({ hands: [[], ['5♣']], er: [['K♠', 'K♥'], []], miniTurns: 0 }), 0);
  assert.notEqual(rankSuggestedMoves(anchor)[0]!.score, 10000);
  const potential = projectGame(fixture({ hands: [['BJ'], ['5♣']], pr: [['4♦'], []] }), 0);
  assert.equal(rankSuggestedMoves(potential)[0]!.action.type, 'score');
  assert.match(rankSuggestedMoves(potential)[0]!.explanation, /if it resolves.*End Phase/);
});

test('empty, spectator and finished projections produce no advice; one choice preserves its exact role', () => {
  const s = fixture({ hands: [['6♥'], ['5♣']] });
  const v = projectGame(s, 0);
  assert.deepEqual(rankSuggestedMoves({ ...v, you: null }), []);
  assert.deepEqual(rankSuggestedMoves({ ...v, winner: 0 }), []);
  assert.deepEqual(rankSuggestedMoves({ ...v, legalActions: [] }), []);
  const only = rankSuggestedMoves(withActions(v, [v.legalActions[0]!]));
  assert.equal(only.length, 1); assert.equal(only[0]!.rank, 1);
});

test('Scuttle values current secured contributions including active Jack and zero tapped hosts; Guard is not immunity', () => {
  const v = projectGame(fixture({ hands: [['10♠'], ['5♥']], pr: [[], ['8♦', '9♥*']], er: [[], [{ card: 'J♣', host: '8♦' }, 'Q♦']] }), 0);
  const actions = v.legalActions.filter(a => a.type === 'scuttle');
  assert.equal(actions.length, 2);
  const ranked = rankSuggestedMoves(withActions(v, actions));
  assert.equal(ranked[0]!.action.targetId, v.players[1]!.pr[0]!.id);
  assert.match(ranked[0]!.explanation, /9 currently secured.*Guard does not block/);
  assert.match(ranked[1]!.explanation, /0 currently secured/);
});

test('response counters and decline describe public response roles and explicit source cost', () => {
  const s = fixture({ hands: [['3♥'], ['A♣']] });
  const raid = availableActions(s, 0).find(a => a.mode === 'raid')!;
  const v = projectGame(applyGame(s, 0, raid, seeded(8)), 1);
  const result = rankSuggestedMoves(v);
  assert.equal(result[0]!.action.type, 'counter');
  assert.match(result[0]!.explanation, /public pending effect/);
  assert.equal(result[1]!.action.type, 'decline');
  assert.match(result[1]!.explanation, /no Action is spent/);
});

test('face-up Swap evaluates visible slot card; hidden outcomes and prefixed Full modes stay conservative', () => {
  const v = projectGame(fixture({ profile: 'intrilex-full', hands: [['6♣'], ['5♥']], swapBar: [{ card: 'BJ', faceUp: true }, { card: '9♦', faceUp: false }] }), 0);
  const swaps = v.legalActions.filter(a => a.type === 'swap-draw');
  assert.match(rankSuggestedMoves(withActions(v, swaps))[0]!.explanation, /11-point/);
  const prefixed: GameAction = { type: 'effect', mode: 'ultra-black:quick2', cardId: v.hand[0]!.id, cardIds: [v.hand[0]!.id], label: 'Exact Full mode', ruleRef: 'full.ultra' };
  const fallback = rankSuggestedMoves(withActions(v, [prefixed]))[0]!;
  assert.equal(fallback.score, 0); assert.match(fallback.explanation, /advanced effects are not evaluated/);
  const hidden: GameAction = { type: 'swap-down', mode: '1', cardId: v.hand[0]!.id, label: 'Hidden swap', ruleRef: 'full.swap' };
  assert.match(rankSuggestedMoves(withActions(v, [hidden]))[0]!.explanation, /unknown/);
});

test('complete keys distinguish ordered sources/costs; stable ties and duplicate identity keep first object', () => {
  const v = projectGame(fixture({ hands: [['6♥'], ['5♣']] }), 0);
  const base: GameAction = { type: 'effect', mode: 'advanced', cardId: 'c', cardIds: ['c', 'a', 'b'], targetIds: ['x', 'y'], label: 'First', ruleRef: 'stack' };
  const reordered = { ...base, cardIds: ['c', 'b', 'a'], label: 'Second' };
  assert.notEqual(actionKey(base), actionKey(reordered));
  assert.notEqual(actionKey(base), actionKey({ ...base, targetIds: ['y', 'x'] }));
  const result = rankSuggestedMoves(withActions(v, [base, { ...base, label: 'Duplicate' }, reordered]));
  assert.equal(result[0]!.action, base); assert.equal(result[1]!.action, reordered);
  assert.deepEqual(actionInput(base), { type: 'effect', mode: 'advanced', cardId: 'c', cardIds: ['c', 'a', 'b'], targetIds: ['x', 'y'] });
  assert.notEqual(actionInput(base).cardIds, base.cardIds);
});

test('required discard prefers lower known point cost; queen and tap explanations preserve rule boundaries', () => {
  const v = projectGame(fixture({ hands: [['2♥', 'BJ', 'Q♣'], ['5♦']], pr: [['4♥'], ['9♠']] }), 0);
  const choose: GameAction[] = v.hand.slice(0, 2).map(c => ({ type: 'choose', mode: 'select', cardId: c.id, label: `Discard ${c.rank}`, ruleRef: '3.base' }));
  const discard = rankSuggestedMoves({ ...v, choice: { player: 0, kind: 'discard', prompt: 'Discard', cards: v.hand, count: 1 }, legalActions: choose });
  assert.equal(discard[0]!.action.cardId, v.hand[0]!.id);
  const queen = v.legalActions.find(a => a.mode === 'anchor-Q')!;
  assert.match(rankSuggestedMoves(withActions(v, [queen]))[0]!.explanation, /Guard does not block Scuttle/);
  const tap: GameAction = { type: 'effect', mode: 'tap', cardId: v.hand[0]!.id, targetId: v.players[1]!.pr[0]!.id, label: 'Tap', ruleRef: '9.tap' };
  assert.match(rankSuggestedMoves(withActions(v, [tap]))[0]!.explanation, /temporarily.*does not remove/);
});

test('hidden backing-state changes cannot affect the same projected-view advice', () => {
  const s = fixture({ profile: 'intrilex-full', hands: [['BJ', '2♥'], ['3♣', '4♦']], swapBar: [{ card: '9♥', faceUp: false }, { card: 'K♣', faceUp: true }] });
  const changed = structuredClone(s);
  [changed.players[1]!.hand[0], changed.deck[0]] = [changed.deck[0]!, changed.players[1]!.hand[0]!];
  changed.deck.reverse();
  const a = projectGame(s, 0), b = projectGame(changed, 0);
  assert.deepEqual(a, b);
  assert.deepEqual(rankSuggestedMoves(a), rankSuggestedMoves(b));
});

test('missing projected card identity remains unknown rather than a claimed zero-point benefit', () => {
  const v = projectGame(fixture({ hands: [['6♥'], ['5♣']] }), 0);
  const action: GameAction = { type: 'score', cardId: 'unavailable', label: 'Authorized score', ruleRef: 'action.score' };
  const result = rankSuggestedMoves(withActions(v, [action]))[0]!;
  assert.equal(result.score, 0);
  assert.match(result.explanation, /not evaluated/);
});

test('missing source or target evidence keeps discard, take, reward and Scuttle advice conservative', () => {
  const v = projectGame(fixture({ hands: [['6♥'], ['5♣']] }), 0);
  const unknown: GameAction = { type: 'choose', cardId: 'unavailable', mode: 'select', label: 'Legal choice', ruleRef: 'stack' };
  for (const kind of ['discard', 'present', 'raid-take', 'recycle', 'seven-hand', 'seven-score'] as const) {
    const result = rankSuggestedMoves({ ...v, legalActions: [unknown], choice: { player: 0, kind, prompt: 'Choose', cards: [], count: 1 } })[0]!;
    assert.equal(result.score, 0);
    assert.match(result.explanation, /not evaluated/);
    assert.doesNotMatch(result.explanation, /0-point|visible.*card/);
  }
  const dig = rankSuggestedMoves(withActions(v, [{ ...unknown, mode: 'dig-discard' }]))[0]!;
  assert.equal(dig.score, 0); assert.match(dig.explanation, /not evaluated/);
  const reward = rankSuggestedMoves({ ...v, graveyard: [], legalActions: [{ ...unknown, cardId: undefined, mode: 'top' }], choice: { player: 0, kind: 'eight-reward', prompt: 'Reward', cards: [], count: 1 } })[0]!;
  assert.equal(reward.score, 0); assert.match(reward.explanation, /not evaluated/);
  const scuttle = rankSuggestedMoves(withActions(v, [{ type: 'scuttle', cardId: v.hand[0]!.id, targetId: 'unavailable', label: 'Scuttle', ruleRef: 'action.scuttle' }]))[0]!;
  assert.equal(scuttle.score, 0); assert.match(scuttle.explanation, /not evaluated/);
});

test('recommendations include exact composite identities and can execute through the existing engine', () => {
  const s = fixture({ profile: 'intrilex-full', hands: [['6♠', '2♥', 'K♦'], ['A♥']] });
  const v = projectGame(s, 0);
  const costs = v.legalActions.filter(a => a.mode === 'deep-draw');
  const result = rankSuggestedMoves(withActions(v, costs));
  assert.equal(result.length, 2);
  assert.notEqual(result[0]!.key, result[1]!.key);
  for (const item of result) {
    const after = applyGame(s, 0, actionInput(item.action), seeded(44));
    assert.deepEqual(after.stack[0]!.action.targetIds, item.action.targetIds);
  }
});

test('10,000 projected legal actions remain immutable and stable while selecting only the best two', () => {
  const v = projectGame(fixture({ hands: [['6♥'], ['5♣']] }), 0);
  const actions: GameAction[] = Array.from({ length: 10_000 }, (_, i) => ({ type: 'effect', mode: 'unscored-full-mode', cardId: `opaque-${i}`, label: `Legal action ${i}`, ruleRef: 'stack' }));
  const large = withActions(v, actions);
  deepFreeze(large);
  const result = rankSuggestedMoves(large);
  assert.equal(result.length, 2);
  assert.equal(result[0]!.action, actions[0]);
  assert.equal(result[1]!.action, actions[1]);
  assert.deepEqual(rankSuggestedMoves(large), result);
  assert.equal(large.legalActions.length, 10_000);
  assert.ok(Object.isFrozen(large.legalActions));
});
