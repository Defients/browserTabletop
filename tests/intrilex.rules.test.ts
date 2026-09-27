import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyGame, createGame, fixture, projectGame, score, seeded } from '../packages/intrilex/index.js';
import { act, has, id, legal, passAll, play, effect, zoneOf } from './helpers/game.js';

const NO = ['6♣', '10♣', '4♥', '5♥', '2♠', 'Q♣']; // a hand with no Instant/counter responses on the other player's turn

test('FC.setup §27 15.4: 54 cards, random Player A with 5, Player B with 6, Goals 15, no Swap Bar/Exile', () => {
  const firsts = new Set<number>();
  for (let seed = 1; seed <= 40; seed++) {
    const s = createGame({ random: seeded(seed) });
    firsts.add(s.activePlayer);
    assert.equal(s.players[s.activePlayer]!.hand.length, 5);
    assert.equal(s.players[1 - s.activePlayer]!.hand.length, 6);
    assert.equal(s.deck.length, 43);
    assert.deepEqual(s.players.map(p => p.goal), [15, 15]);
    assert.equal(s.miniTurns, 1);
    assert.ok(!('swapBar' in s) && !('exile' in s));
  }
  assert.deepEqual([...firsts].sort(), [0, 1]);
});

test('FC.miniturn §27 15.3: exactly one ordinary Action; afterwards only End (and free Quicks) remain', () => {
  let s = fixture({ hands: [['6♦', '10♦', '7♣'], NO] });
  assert.ok(has(s, 0, a => a.type === 'draw') && has(s, 0, a => a.type === 'score'));
  s = play(s, 0, 'draw');
  assert.equal(s.miniTurns, 0);
  assert.deepEqual(legal(s, 0).map(a => a.type), ['end']);
  assert.ok(!legal(s, 0).some(a => (a.type as string) === 'pass'), 'no ordinary Pass (v4.1.2)');
});

test('action.draw §4.3: Draw 1, or 2 when the hand was empty at declaration', () => {
  let s = fixture({ hands: [[], NO] });
  s = play(s, 0, 'draw');
  assert.equal(s.players[0]!.hand.length, 2);
  s = fixture({ hands: [['10♦'], NO] });
  s = play(s, 0, 'draw');
  assert.equal(s.players[0]!.hand.length, 2);
});

test('FC.end §4.5/§1: reaching the Goal mid-turn is not a win; victory is checked at the active player\u2019s End Phase', () => {
  let s = fixture({ hands: [['Q♦', '10♦'], NO], pr: [['K♠', '5♣'], []] });
  s = play(s, 0, 'score', 'Q♦');
  assert.equal(score(s, 0), 15);
  assert.equal(s.winner, null, 'no win before End Phase');
  s = play(s, 0, 'end');
  assert.equal(s.winner, 0);
});

test('FC.end §38 20.3: only the active player is checked; an opponent above Goal waits for their own End Phase', () => {
  let s = fixture({ hands: [['10♦'], ['3♠']], pr: [[], ['K♠', '9♦']] });
  s = passAll(play(s, 0, 'draw'));
  s = play(s, 0, 'end');
  assert.equal(s.winner, null, 'player 2 is not declared the winner during player 1\u2019s End Phase');
  assert.equal(s.activePlayer, 1);
  s = passAll(play(s, 1, 'draw'));
  s = play(s, 1, 'end');
  assert.equal(s.winner, 1);
});

test('FC.start §27 15.5 / tap §9: every card the new active player controls untaps at Start; others stay tapped', () => {
  let s = fixture({ hands: [['10♦'], NO], pr: [['7♥*'], ['9♣*']], er: [[], ['K♦*']] });
  assert.equal(score(s, 0), 0, 'tapped PR cards contribute 0 (§8)');
  s = play(s, 0, 'draw');
  s = play(s, 0, 'end');
  assert.ok(s.players[1]!.pr.every(c => !c.tapped) && s.players[1]!.er.every(c => !c.tapped), 'player 2 untapped at their Start');
  assert.ok(s.players[0]!.pr[0]!.tapped, 'player 1 cards stay tapped until player 1\u2019s Start');
});

test('action.scuttle §19: rank order, suit ties, immunities, Guard irrelevance and own-card restriction', () => {
  const s = fixture({ hands: [['7♠', '7♦', '6♦', 'K♥', 'RJ', 'BJ'], NO.slice(0, 5)], pr: [['9♠'], ['7♥', '5♠', 'A♦', '4♣', '8♥', '10♦']], er: [[], ['Q♥']] });
  const scuttles = legal(s, 0).filter(a => a.type === 'scuttle').map(a => a.label);
  const can = (src: string, tgt: string) => scuttles.some(l => l === `Scuttle ${tgt} with ${src}`);
  assert.ok(can('7♠', '7♥'), 'same rank, higher suit (♥ < ♠)');
  assert.ok(!can('7♦', '7♥'), 'same rank, lower suit is illegal');
  assert.ok(!can('6♦', '7♥'), 'lower rank is illegal');
  assert.ok(can('K♥', '10♦') && can('Red Joker', '10♦') && can('Black Joker', 'Red Joker') === false);
  assert.ok(!scuttles.some(l => l.startsWith('Scuttle 5♠') || l.startsWith('Scuttle A♦')), '5 and A in PR are Scuttle-immune (§16.4)');
  assert.ok(can('7♠', '4♣') && can('K♥', '8♥'), '4 and 8 immunity is Effect-targeting only');
  assert.ok(can('7♠', '7♥'), 'Guard (Q♥ in ER) does not block Scuttle (§13)');
  assert.ok(!scuttles.some(l => l.includes('9♠')), 'cannot Scuttle your own PR card');
});

test('action.scuttle §19: Jokers — RJ and BJ in PR are immune; BJ outranks RJ as a source', () => {
  const s = fixture({ hands: [['BJ', 'K♠'], NO], pr: [[], ['RJ', 'Q♠']] });
  const labels = legal(s, 0).filter(a => a.type === 'scuttle').map(a => a.label);
  assert.ok(!labels.some(l => l.startsWith('Scuttle Red Joker')));
  assert.ok(labels.includes('Scuttle Q♠ with K♠') && labels.includes('Scuttle Q♠ with Black Joker'));
});

test('action.scuttle §19 Result: success sends target and source to GY; the Action is spent', () => {
  let s = fixture({ hands: [['9♦', '10♦'], NO], pr: [[], ['7♣']] });
  s = act(s, 0, a => a.type === 'scuttle' && a.cardId === id(s, '9♦'));
  s = passAll(s);
  assert.equal(zoneOf(s, '7♣'), 'gy');
  assert.equal(zoneOf(s, '9♦'), 'gy');
  assert.equal(s.miniTurns, 0);
});

test('8.counter §26 ⦗8⦘: an Eight counters a pending Scuttle; source to GY, target stays', () => {
  let s = fixture({ hands: [['9♦', '10♦'], ['8♥', ...NO.slice(0, 5)]], pr: [[], ['7♣']] });
  s = act(s, 0, a => a.type === 'scuttle');
  assert.equal(s.priority, 1);
  s = act(s, 1, a => a.type === 'counter' && a.cardId === id(s, '8♥'));
  s = passAll(s);
  assert.equal(zoneOf(s, '7♣'), 'pr-1');
  assert.equal(zoneOf(s, '9♦'), 'gy');
  assert.equal(zoneOf(s, '8♥'), 'gy');
  assert.equal(s.miniTurns, 0, 'countering does not refund the Action (§7)');
});

test('8.bonus §26 ⦗8⦘: a successful Scuttle with an 8 draws the top or bottom GY card', () => {
  let s = fixture({ hands: [['8♠', '10♦'], NO], pr: [[], ['7♣']], graveyard: ['2♦', '3♦'] });
  s = act(s, 0, a => a.type === 'scuttle' && a.cardId === id(s, '8♠'));
  s = passAll(s);
  assert.equal(s.choice?.kind, 'eight-reward');
  s = act(s, 0, a => a.type === 'choose' && a.mode === 'bottom');
  assert.equal(zoneOf(s, '2♦'), 'hand-0', 'bottom = oldest GY card');
});

test('fizzle §5/§6: a Scuttle whose target leaves in response fizzles; the source still goes to GY', () => {
  let s = fixture({ hands: [['9♦', '10♦'], ['3♣', ...NO.slice(0, 5)]], pr: [[], ['7♣']] });
  s = act(s, 0, a => a.type === 'scuttle');
  s = act(s, 1, a => a.mode === 'instant-bottom' && a.targetId === id(s, '7♣'), 'player 2 bounces their own 7 away');
  s = passAll(s);
  assert.equal(zoneOf(s, '7♣'), `deck-${s.deck.length - 1}`);
  assert.equal(zoneOf(s, '9♦'), 'gy');
  assert.ok(s.events.some(e => e.t === 'fizzle' && e.mode === 'scuttle'));
});

test('guard §13: Queen in ER stops enemy single-target Effects on other cards but not on itself; friendly effects ignore it', () => {
  const s = fixture({ hands: [['3♣', 'J♦', '10♦'], NO], pr: [['6♠'], ['7♥', '9♣']], er: [[], ['Q♥']] });
  const bounceTargets = legal(s, 0).filter(a => a.mode === 'bounce-top').map(a => a.targetId);
  assert.ok(!bounceTargets.includes(id(s, '7♥')) && !bounceTargets.includes(id(s, '9♣')), 'guarded PR cards are not targets');
  assert.ok(bounceTargets.includes(id(s, 'Q♥')), 'the Queen providing Guard is not protected by itself');
  assert.ok(bounceTargets.includes(id(s, '6♠')), 'friendly target unaffected by enemy Guard');
  assert.ok(!legal(s, 0).some(a => a.mode === 'attach'), 'Jack cannot target guarded PR cards');
});

test('guard §16 / Queen\u2019s Court semantics: two Queens protect each other', () => {
  const s = fixture({ hands: [['3♣', '10♦'], NO], er: [[], ['Q♥', 'Q♠']] });
  assert.ok(!legal(s, 0).some(a => a.mode === 'bounce-top' && [id(s, 'Q♥'), id(s, 'Q♠')].includes(a.targetId!)));
});

test('4.clear §26 ⦗4⦘: row-wide clear ignores Guard and immunities to targeting; Anchor clear leaves Jack Attachments', () => {
  let s = fixture({ hands: [['4♠', '10♦'], NO], pr: [[], ['8♥', '4♦', 'A♣', '5♠']], er: [[], ['Q♥', 'K♦']] });
  s = effect(s, 0, '4♠', 'clear-pr');
  s = passAll(s);
  assert.equal(s.players[1]!.pr.length, 0, 'every enemy PR card is cleared, Guard notwithstanding');
  assert.equal(zoneOf(s, 'Q♥'), 'er-1');
});

test('4.clear §26 ⦗4⦘: clearing enemy Anchors leaves Attachments and all PR cards', () => {
  let s = fixture({ hands: [['4♠', '10♦'], NO], pr: [[], ['9♣']], er: [[], [{ card: 'J♥', host: '9♣' }, 'K♦', 'Q♥']] });
  s = effect(s, 0, '4♠', 'clear-er');
  s = passAll(s);
  assert.deepEqual(s.players[1]!.er.map(c => c.rank), ['J']);
  assert.equal(zoneOf(s, '9♣'), 'pr-1');
});

test('4.immunity / 8.immunity §26: untapped 4 and 8 in PR cannot be targeted by Effects — even friendly ones', () => {
  const s = fixture({ hands: [['3♣', '10♦'], NO], pr: [['4♠', '8♦'], ['4♦', '8♣', '6♥']] });
  const targets = legal(s, 0).filter(a => a.mode === 'bounce-top').map(a => a.targetId);
  for (const c of ['4♠', '8♦', '4♦', '8♣']) assert.ok(!targets.includes(id(s, c)), c);
  assert.ok(targets.includes(id(s, '6♥')));
});

test('counter §7 / A.counter: Ace counters an Effect; the countered card goes to GY and the Action stays spent', () => {
  let s = fixture({ hands: [['6♠', '10♦'], ['A♥', ...NO.slice(0, 5)]] });
  s = effect(s, 0, '6♠', 'dig');
  s = act(s, 1, a => a.type === 'counter' && a.cardId === id(s, 'A♥'));
  s = passAll(s);
  assert.equal(zoneOf(s, '6♠'), 'gy');
  assert.equal(zoneOf(s, 'A♥'), 'gy');
  assert.equal(s.players[0]!.hand.length, 1, 'no Dig happened');
  assert.equal(s.miniTurns, 0);
});

test('A.counter §26 / §36 16.1: Ace authority excludes Scuttle, Anchor and Goal-Mod plays, triggers, Board Lock and Shuffle Reset', () => {
  // With no authority, the Ace holder is never given a decision: the play resolves straight through (§38 20.3).
  let s = fixture({ hands: [['9♦', '10♦'], ['A♥', ...NO.slice(0, 5)]], pr: [[], ['7♣']] });
  s = act(s, 0, a => a.type === 'scuttle');
  assert.ok(!s.stack.length && zoneOf(s, '7♣') === 'gy', 'Scuttle is an Action');
  s = fixture({ hands: [['Q♦', '10♦'], ['A♥', ...NO.slice(0, 5)]] });
  s = effect(s, 0, 'Q♦', 'anchor-Q');
  assert.ok(!s.stack.length && zoneOf(s, 'Q♦') === 'er-0', 'Anchor Play');
  s = fixture({ hands: [['RJ', '10♦'], ['A♥', ...NO.slice(0, 5)]] });
  s = effect(s, 0, 'RJ', 'shuffle-reset');
  assert.ok(!s.stack.length && zoneOf(s, 'RJ') === 'gy', 'Shuffle Reset: only ⭐A');
  s = fixture({ hands: [['BJ', '10♦'], ['A♥', ...NO.slice(0, 5)]] });
  s = effect(s, 0, 'BJ', 'board-lock');
  assert.ok(!s.stack.length && s.boardLock, 'Board Lock: only ⭐A');
  s = fixture({ hands: [['6♠', '10♦'], ['A♥', ...NO.slice(0, 5)]] });
  s = effect(s, 0, '6♠', 'dig');
  assert.ok(has(s, 1, a => a.type === 'counter'), 'control: the same Ace does answer an ordinary Effect');
  s = fixture({ hands: [['7♦', '10♦'], ['A♥', ...NO.slice(0, 5)]] });
  s = play(s, 0, 'score', '7♦');
  s = passAll(s);
  assert.equal(s.choice?.kind, 'seven-score', 'the Seven trigger resolved: no Ace could answer it');
});

test('K.counter §26 ⦗K⦘: King counters single-card Anchor and Goal-Mod plays but not Effects', () => {
  let s = fixture({ hands: [['9♦', '10♦'], ['K♥', ...NO.slice(0, 5)]] });
  s = effect(s, 0, '9♦', 'anchor-9');
  assert.ok(has(s, 1, a => a.type === 'counter' && a.cardId === id(s, 'K♥')));
  s = act(s, 1, a => a.type === 'counter');
  s = passAll(s);
  assert.equal(zoneOf(s, '9♦'), 'gy');
  s = fixture({ hands: [['6♠', '10♦'], ['K♥', ...NO.slice(0, 5)]] });
  s = effect(s, 0, '6♠', 'dig');
  assert.equal(s.choice?.kind, 'dig-mode', 'Kings cannot counter Effects: the Dig resolved with no stop');
  s = fixture({ active: 1, hands: [['9♣', '10♦'], ['K♥', ...NO.slice(0, 5)]] });
  s = play(s, 1, 'draw');
  s = act(s, 0, a => a.mode === 'goal3');
  assert.ok(has(s, 1, a => a.type === 'counter' && a.cardId === id(s, 'K♥')), 'Goal Shift is a Goal-Mod Play');
});

test('stack §6 / §7: a counter can be countered; the original play then resolves (LIFO)', () => {
  let s = fixture({ hands: [['9♦', 'A♣', '10♦'], ['8♥', ...NO.slice(0, 5)]], pr: [[], ['7♣']] });
  s = act(s, 0, a => a.type === 'scuttle' && a.cardId === id(s, '9♦'));
  s = act(s, 1, a => a.type === 'counter');
  s = act(s, 0, a => a.type === 'counter' && a.cardId === id(s, 'A♣'));
  s = passAll(s);
  const order = s.events.filter(e => e.t === 'resolve').map(e => (e as { cls: string }).cls);
  assert.deepEqual(order, ['counter', 'scuttle'], 'newest first: the Ace resolved, the negated Eight never did, then the Scuttle');
  assert.equal(zoneOf(s, '7♣'), 'gy', 'the Scuttle resolved after the Ace negated the Eight');
  assert.equal(zoneOf(s, '8♥'), 'gy');
});

test('A.anchor §26 ⦗A⦘: an Anchor Ace sacrifices to counter an opponent\u2019s Effect and takes the countered card', () => {
  let s = fixture({ active: 1, hands: [['10♦'], ['6♠', ...NO.slice(0, 5)]], er: [['A♠'], []] });
  s = effect(s, 1, '6♠', 'dig');
  s = act(s, 0, a => a.type === 'counter' && a.mode === 'anchor-counter');
  s = passAll(s);
  assert.equal(zoneOf(s, '6♠'), 'hand-0', 'the countered 6 is taken into hand (hidden: reveal markers are disabled)');
  assert.equal(zoneOf(s, 'A♠'), 'gy');
});

test('decline §6 / §38 20.3: declining spends nothing; players without responses are advanced automatically', () => {
  let s = fixture({ hands: [['6♠', '3♣', '10♦'], NO], pr: [['6♦'], []] });
  s = effect(s, 0, '6♠', 'dig');
  assert.equal(s.priority, 0, 'player 2 had no lawful response and was advanced automatically');
  assert.ok(has(s, 0, a => a.type === 'decline'), 'player 1 holds an Instant 3 and may decline');
  s = act(s, 0, a => a.type === 'decline');
  assert.equal(s.choice?.kind, 'dig-mode');
});

test('exhausted §22 10.1–10.4: begins at Start with empty DP; Draw undeclarable; forced Pass only with no other Action; tiebreak', () => {
  let s = fixture({ hands: [['2♦'], []], pr: [['3♦'], ['8♦']], er: [['K♣'], []], restToGraveyard: true });
  assert.equal(s.deck.length, 0);
  assert.ok(has(s, 0, a => a.type === 'draw'), 'Exhausted is not yet active: Draw remains declarable with an empty DP');
  s = play(s, 0, 'score', '2♦');
  s = play(s, 0, 'end');
  assert.equal(s.exhausted, 3, 'Exhausted begins at the next Start Phase');
  assert.deepEqual(legal(s, 1).map(a => a.type), ['exhausted-pass'], 'empty hand, empty DP: only the forced Pass');
  s = play(s, 1, 'exhausted-pass');
  s = play(s, 1, 'end');
  assert.equal(s.exhausted, 2, 'the Full Turn whose Start began Exhausted counts when it ends');
  assert.deepEqual(legal(s, 0).map(a => a.type), ['exhausted-pass'], 'Draw undeclarable while Exhausted with an empty DP');
  s = fixture({ hands: [['7♦'], []], restToGraveyard: true, exhausted: 3 });
  assert.ok(!has(s, 0, a => a.type === 'exhausted-pass'), 'the Pass is illegal whenever any other Action (here: scoring) exists');
  assert.ok(has(s, 0, a => a.type === 'score'));
});

test('exhausted §22 10.3: countdown after completed Full Turns, then Anchors → Points → draw', () => {
  let s = fixture({ hands: [[], []], pr: [['9♣'], ['K♦']], er: [['K♣'], []], restToGraveyard: true, exhausted: 1 });
  s = play(s, 0, 'exhausted-pass');
  s = play(s, 0, 'end');
  assert.equal(s.winner, 0, 'player 1 has more untapped Anchors despite fewer Points');
  s = fixture({ hands: [[], []], pr: [['9♣'], ['K♦']], restToGraveyard: true, exhausted: 1 });
  s = play(s, 0, 'exhausted-pass'); s = play(s, 0, 'end');
  assert.equal(s.winner, 0, 'equal Anchors: higher Secured Points (9 vs 8)');
  s = fixture({ hands: [[], []], pr: [['8♣'], ['8♦']], restToGraveyard: true, exhausted: 1 });
  s = play(s, 0, 'exhausted-pass'); s = play(s, 0, 'end');
  assert.equal(s.winner, 'draw');
});

test('exhausted §22 10.4: cards entering the empty DP end Exhausted immediately', () => {
  let s = fixture({ hands: [['3♣'], []], pr: [['6♦'], ['9♥']], restToGraveyard: true, exhausted: 2 });
  s = effect(s, 0, '3♣', 'bounce-top', '9♥');
  s = passAll(s);
  assert.equal(s.deck.length, 1);
  assert.equal(s.exhausted, null);
});

test('FC.disabled §27 15.1 / 15.7: no Swap Bar, Draw & Cast, Aegis, Rank-10 or suit abilities; 2 has no Solo Wild', () => {
  const s = fixture({ hands: [['10♠', '10♦', '8♠', '2♥', 'K♠', 'A♠'], NO], pr: [['5♦'], ['9♣']] });
  const types = new Set(legal(s, 0).map(a => a.type));
  for (const t of ['swap', 'draw-cast', 'combo', 'super', 'ultra']) assert.ok(!types.has(t as never));
  const modes = legal(s, 0).filter(a => a.type === 'effect').map(a => a.mode);
  assert.ok(!legal(s, 0).some(a => a.type === 'effect' && (a.cardId === id(s, '10♠') || a.cardId === id(s, '10♦'))), 'Rank-10 effects are suit-specific');
  assert.ok(!legal(s, 0).some(a => a.type === 'effect' && a.cardId === id(s, '8♠')), 'Aegis Field disabled; 8♠ Free Scuttle disabled');
  assert.deepEqual(legal(s, 0).filter(a => a.type === 'effect' && a.cardId === id(s, '2♥')).map(a => a.mode), ['quick2'], '2 only has its generic Quick');
  assert.deepEqual(legal(s, 0).filter(a => a.type === 'effect' && a.cardId === id(s, 'K♠')).map(a => a.mode), ['anchor-K'], 'K♠ Wild Sovereignty disabled; generic King Anchor remains');
  assert.ok(modes.includes('anchor-A'), 'A♠ keeps generic Ace text');
  assert.ok(!('exile' in s));
});

test('projection: a player sees their own hand and public zones only; spectators see no hand; RNG never projected', () => {
  const s = createGame({ random: seeded(5) });
  const v0 = projectGame(s, 0), v1 = projectGame(s, 1), vs = projectGame(s, null);
  assert.equal(v0.hand.length, s.players[0]!.hand.length);
  assert.equal(vs.hand.length, 0);
  assert.equal(vs.legalActions.length, 0);
  const deckIds = s.deck.map(c => c.id);
  for (const v of [v0, v1, vs]) for (const d of deckIds) assert.ok(!JSON.stringify(v).includes(d), 'no DP card handle appears in any projection');
  for (const c of s.players[1]!.hand) assert.ok(!JSON.stringify(v0).includes(c.id), 'opponent hand handles never reach player 1');
});

test('privacy: card handles rotate on entering a hand or DP, so a played card cannot be linked to its draw', () => {
  let s = fixture({ hands: [['3♣', '10♦'], NO], pr: [[], ['9♥']] });
  const seen = id(s, '9♥');
  s = effect(s, 0, '3♣', 'bounce-top', '9♥');
  s = passAll(s);
  const inDeck = s.deck[0]!;
  assert.equal(inDeck.rank, '9'); assert.notEqual(inDeck.id, seen, 'new handle in DP');
  s = play(s, 0, 'end');
  s = passAll(play(s, 1, 'draw'));
  const drawn = s.players[1]!.hand.find(c => c.rank === '9' && c.suit === '♥')!;
  assert.notEqual(drawn.id, inDeck.id, 'new handle in hand');
  assert.ok(!JSON.stringify(projectGame(s, 0)).includes(drawn.id));
});

test('applyGame is immutable and rejects forged or stale actions', () => {
  const s = fixture({ hands: [['6♠', '10♦'], NO] });
  const before = JSON.stringify(s);
  assert.throws(() => applyGame(s, 0, { type: 'effect', cardId: 'forged', mode: 'dig', label: '', ruleRef: '' }));
  assert.throws(() => applyGame(s, 1, { type: 'draw', label: '', ruleRef: '' }), /not legal/);
  assert.throws(() => applyGame(s, 0, { type: 'effect', cardId: id(s, '10♦'), mode: 'seven', label: '', ruleRef: '' }));
  assert.throws(() => applyGame(s, 0, null));
  applyGame(s, 0, legal(s, 0)[0]!);
  assert.equal(JSON.stringify(s), before);
});
