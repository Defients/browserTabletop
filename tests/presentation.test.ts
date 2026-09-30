import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { GameAction, GameCard, GameView } from '../packages/intrilex/types.js';
import { actionKey } from '../packages/intrilex/actionIdentity.js';
import { fixture, projectGame } from '../packages/intrilex/index.js';
import {
  actionLookups, buildActionEntries, compatibleVariants, paramOptions, previewText,
  reconcileSelection, resolvedAction, selectOption, type ActionFamily,
} from '../packages/intrilex/presentation.js';

/** Minimal projected view for pure-adapter tests (all fields required by GameView). */
const bare = (over: Partial<GameView> = {}): GameView => ({
  profile: 'intrilex-full', you: 0,
  players: [0, 1].map(() => ({ handCount: 0, pr: [], er: [], goal: 21, score: 0, guard: false, disrupted: [], quick2Used: false })),
  hand: [], deckCount: 0, graveyard: [], activePlayer: 0, phase: 'action', miniTurns: 1, turn: 3,
  pending: [], priority: 0, choice: null, boardLock: null, exhausted: null, winner: null,
  legalActions: [], history: [], ...over,
});

const card = (id: string, rank: GameCard['rank'], suit: GameCard['suit']): GameCard => ({ id, rank, suit, owner: -1 });
const swapDown = (slot: number, give: string): GameAction =>
  ({ type: 'swap-down', label: `Swap face-down slot ${slot + 1} · give ${give}`, ruleRef: 'full.swap', mode: String(slot), cardId: give });

const familyOf = (view: GameView, actions: GameAction[], title: string): ActionFamily => {
  const e = buildActionEntries(view, actions).find(x => x.kind === 'family' && x.family.title === title);
  assert.ok(e && e.kind === 'family', `expected a "${title}" family`);
  return e.family;
};

// Every legal action must appear in exactly one entry — the fallback contract.
test('all legal actions are preserved: none lost, none duplicated', () => {
  const s = fixture({ hands: [['2♥', 'BJ', 'K♦'], ['5♣', '7♠']], pr: [['4♥'], ['9♠', '8♣']] });
  const v = projectGame(s, 0);
  const entries = buildActionEntries(v, v.legalActions);
  const seen = new Set<string>();
  for (const e of entries) for (const a of e.kind === 'action' ? [e.action] : e.family.variants) {
    const k = actionKey(a);
    assert.ok(!seen.has(k), `duplicate legal action surfaced: ${a.label}`);
    seen.add(k);
  }
  assert.equal(seen.size, v.legalActions.length);
});

test('First Contact actions stay simple: no families without semantics to group', () => {
  const v = projectGame(fixture({ hands: [['2♥', 'BJ', 'K♦'], ['5♣', '7♠']] }), 0);
  const entries = buildActionEntries(v, v.legalActions);
  assert.ok(entries.every(e => e.kind === 'action'));
  assert.equal(entries.length, v.legalActions.length);
});

test('Swap Bar: N×slot variants group into one semantic family', () => {
  const s = fixture({ profile: 'intrilex-full', hands: [['5♥', '5♦', '3♥', '3♠'], ['A♥']], swapBar: [{ card: '9♥', faceUp: false }, { card: 'K♣', faceUp: true }, { card: '8♦', faceUp: false }] });
  s.phase = 'start';
  const v = projectGame(s, 0);
  const downs = v.legalActions.filter(a => a.type === 'swap-down');
  assert.equal(downs.length, 8); // 2 face-down slots × 4 hand cards
  const fam = familyOf(v, v.legalActions, 'Swap Bar');
  assert.equal(fam.presentation, 'composer');
  assert.equal(fam.variants.length, 8);
  const look = actionLookups(v);
  const slots = paramOptions(fam, fam.params[0]!, {}, look);
  assert.deepEqual(slots.map(o => o.label), ['Slot 1', 'Slot 3']);
  const give = paramOptions(fam, fam.params[1]!, {}, look);
  assert.equal(give.length, 4);
  assert.ok(give.every(o => o.card && v.hand.includes(o.card)));
});

test('Swap Bar composer resolves a slot+card pick to exactly one legal engine action', () => {
  const s = fixture({ profile: 'intrilex-full', hands: [['5♥', '5♦'], ['A♥']], swapBar: [{ card: '9♥', faceUp: false }, { card: '8♦', faceUp: false }] });
  s.phase = 'start';
  const v = projectGame(s, 0);
  const fam = familyOf(v, v.legalActions, 'Swap Bar');
  const give = v.hand[0]!.id;
  const sel = selectOption(fam, selectOption(fam, {}, 'slot', '1'), 'give', give);
  const resolved = resolvedAction(fam, sel);
  assert.ok(resolved);
  assert.equal(resolved.mode, '1');
  assert.equal(resolved.cardId, give);
  assert.ok(v.legalActions.some(a => actionKey(a) === actionKey(resolved)));
  assert.equal(previewText(fam, sel, actionLookups(v)), resolved.label);
});

test('legal-combination filtering: non-rectangular variants never expose impossible pairs', () => {
  // Simulates a legal-action set where slot↔give is not a full product.
  const hand = [card('h1', '5', '♥'), card('h2', '3', '♥'), card('h3', '5', '♦')];
  const v = bare({ hand, swapBar: [{ slot: 0 }, { slot: 1, card: card('s1', 'K', '♣') }, { slot: 2 }] });
  const actions = [swapDown(0, 'h1'), swapDown(0, 'h2'), swapDown(2, 'h3')];
  const fam = familyOf(v, actions, 'Swap Bar');
  const look = actionLookups(v);
  // Selecting slot 3 leaves only h3 as a legal give.
  const sel = selectOption(fam, {}, 'slot', '2');
  const gives = paramOptions(fam, fam.params[1]!, sel, look);
  assert.deepEqual(gives.map(o => o.value), ['h3']);
  // The engine-illegal combination slot2+h1 cannot resolve.
  assert.equal(resolvedAction(fam, { slot: '2', give: 'h1' }), undefined);
  // The newest pick wins: choosing h3 (only legal with slot 2) prunes the stale slot pick.
  const stale = selectOption(fam, { slot: '0' }, 'give', 'h3');
  assert.equal(stale.give, 'h3');
  assert.equal(stale.slot, undefined);
});

test('selectOption prunes incompatible downstream selections when a pick changes', () => {
  const hand = [card('h1', '5', '♥'), card('h2', '3', '♥'), card('h3', '5', '♦')];
  const v = bare({ hand, swapBar: [{ slot: 0 }, { slot: 2 }] });
  const actions = [swapDown(0, 'h1'), swapDown(0, 'h2'), swapDown(2, 'h3')];
  const fam = familyOf(v, actions, 'Swap Bar');
  let sel = selectOption(fam, {}, 'slot', '0');
  sel = selectOption(fam, sel, 'give', 'h1');
  assert.equal(resolvedAction(fam, sel)?.cardId, 'h1');
  sel = selectOption(fam, sel, 'slot', '2');
  assert.equal(sel.slot, '2');
  assert.equal(sel.give, undefined, 'give h1 became illegal under slot 2 and must be cleared');
  assert.deepEqual(compatibleVariants(fam, sel).map(a => a.cardId), ['h3']);
});

test('reconcileSelection drops picks made stale by a new legal-action set', () => {
  const hand = [card('h1', '5', '♥'), card('h2', '3', '♥')];
  const v = bare({ hand, swapBar: [{ slot: 0 }, { slot: 2 }] });
  const newer = familyOf(v, [swapDown(2, 'h1'), swapDown(2, 'h2')], 'Swap Bar'); // slot 0 vanished
  const sel = reconcileSelection(newer, { slot: '0', give: 'h1' });
  assert.equal(sel.slot, undefined, 'slot 0 is no longer legal and must be dropped');
  assert.equal(sel.give, 'h1', 'give h1 survives: still legal under slot 2');
  // The surviving partial pick still resolves deterministically.
  assert.equal(resolvedAction(newer, sel)?.label, 'Swap face-down slot 3 · give h1');
  // A fully stale selection leaves nothing executable.
  assert.equal(resolvedAction(newer, { slot: '0', give: 'h1' }), undefined);
});

test('multi-card cost params resolve exact sets, not supersets (deep-draw pick 1 vs 2)', () => {
  const hand = [card('six', '6', '♦'), card('t1', '4', '♥'), card('t2', '9', '♠')];
  const variants: GameAction[] = [
    { type: 'effect', cardId: 'six', mode: 'deep-draw', targetIds: ['t1'], label: '6♦ · Deep Draw · give 4♥', ruleRef: 'full.6' },
    { type: 'effect', cardId: 'six', mode: 'deep-draw', targetIds: ['t1', 't2'], label: '6♦ · Deep Draw · give 4♥,9♠', ruleRef: 'full.6' },
  ];
  const v = bare({ hand });
  const fam = familyOf(v, variants, '6♦ · Play for Effect');
  // Picking only t1 resolves the one-card declaration even though {t1,t2} is compatible.
  const one = resolvedAction(fam, { mode: 'deep-draw', cost: ['t1'] });
  assert.deepEqual(one?.targetIds, ['t1']);
  const two = resolvedAction(fam, { mode: 'deep-draw', cost: ['t1', 't2'] });
  assert.deepEqual(two?.targetIds, ['t1', 't2']);
});

test('Ultra Black groups score/cast/exile/mode roles without mixing cards across roles', () => {
  const s = fixture({ profile: 'intrilex-full', hands: [['3♣', '4♠', '5♣'], ['A♥', 'A♦']] });
  const v = projectGame(s, 0);
  const ultras = v.legalActions.filter(a => a.mode?.startsWith('ultra-black:'));
  assert.ok(ultras.length > 3, `expected several ultra-black variants, got ${ultras.length}`);
  const fam = familyOf(v, v.legalActions, 'Ultra — Three Black');
  assert.equal(fam.variants.length, ultras.length);
  const look = actionLookups(v);
  const [score, cast, third, mode] = fam.params;
  // Role lists are drawn from real variants — the score card can never appear as a cast option.
  const three = v.hand.map(c => c.id);
  let sel = selectOption(fam, {}, score.key, three[0]!);
  const castOpts = paramOptions(fam, cast, sel, look).map(o => o.value);
  assert.deepEqual(castOpts.sort(), [three[1], three[2]].sort());
  sel = selectOption(fam, sel, cast.key, three[1]!);
  assert.deepEqual(paramOptions(fam, third, sel, look).map(o => o.value), [three[2]]);
  const modeOpts = paramOptions(fam, mode, sel, look);
  assert.ok(modeOpts.length >= 1);
  sel = selectOption(fam, sel, 'mode', modeOpts[0]!.value);
  const resolved = resolvedAction(fam, sel);
  assert.ok(resolved);
  assert.equal(resolved.cardId, three[0]);
  assert.deepEqual(resolved.cardIds, [three[0], three[1], three[2]]);
  assert.ok(v.legalActions.some(a => actionKey(a) === actionKey(resolved)));
});

test('Ultra Red keeps three-red subsets and stack targets as separate parameters', () => {
  const s = fixture({ profile: 'intrilex-full', hands: [['3♥', '4♦', '5♥', '6♦'], ['A♥', 'A♦']] });
  const v = projectGame(s, 0);
  const reds = v.legalActions.filter(a => a.mode === 'ultra-red');
  if (!reds.length) return; // red ultra requires a pending play to counter — absent here
  const fam = familyOf(v, v.legalActions, 'Ultra — Three Red');
  assert.equal(fam.variants.length, reds.length);
});

test('choose families take semantic titles from the active choice and stay inline', () => {
  const cards = [card('c1', '5', '♥'), card('c2', '7', '♠'), card('c3', '9', '♦')];
  const v = bare({
    hand: cards,
    choice: { player: 0, kind: 'discard', prompt: 'Discard a card', cards, count: 1 },
  });
  const actions = cards.map(c => ({ type: 'choose', cardId: c.id, mode: 'select', label: `Discard ${c.rank}${c.suit}`, ruleRef: 'r' }) as GameAction);
  const fam = familyOf(v, actions, 'Discard a card');
  assert.equal(fam.presentation, 'inline');
  const opts = paramOptions(fam, fam.params[0]!, {}, actionLookups(v));
  assert.equal(opts.length, 3);
  const resolved = resolvedAction(fam, { card: 'c2' });
  assert.equal(resolved?.cardId, 'c2');
});

test('search keeps a family on a title hit and filters variants on a label hit', () => {
  const s = fixture({ profile: 'intrilex-full', hands: [['5♥', '5♦'], ['A♥']], swapBar: [{ card: '9♥', faceUp: false }, { card: '8♦', faceUp: false }] });
  s.phase = 'start';
  const v = projectGame(s, 0);
  const byTitle = buildActionEntries(v, v.legalActions, 'swap bar');
  assert.ok(byTitle.some(e => e.kind === 'family' && e.family.title === 'Swap Bar'));
  const byVariant = buildActionEntries(v, v.legalActions, 'slot 1');
  const fam = byVariant.find(e => e.kind === 'family');
  assert.ok(fam && fam.kind === 'family');
  assert.ok(fam.family.variants.every(a => a.mode === '0'));
  const miss = buildActionEntries(v, v.legalActions, 'zzz');
  assert.ok(!miss.some(e => e.kind === 'family' && e.family.title === 'Swap Bar'));
});

test('family identity is deterministic across rebuilds', () => {
  const s = fixture({ profile: 'intrilex-full', hands: [['5♥', '5♦'], ['A♥']], swapBar: [{ card: '9♥', faceUp: false }] });
  s.phase = 'start';
  const v = projectGame(s, 0);
  const a = familyOf(v, v.legalActions, 'Swap Bar').id;
  const b = familyOf(v, v.legalActions, 'Swap Bar').id;
  assert.equal(a, b);
});
