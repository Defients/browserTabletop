import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anchorValue, fixture, projectGame, score } from '../packages/intrilex/index.js';
import { act, choose, effect, has, id, legal, passAll, play, zoneOf } from './helpers/game.js';

const NO = ['6♣', '10♣', '4♥', '5♥', '2♠', 'Q♣'];
const NO5 = NO.slice(0, 5);

test('2.quick §26 ⦗2⦘: free during own turn, scores 2, opponent discards 1; one resolved per turn; not on opponent\u2019s turn', () => {
  let s = fixture({ hands: [['2♦', '2♥', '10♦'], NO] });
  s = effect(s, 0, '2♦', 'quick2');
  s = passAll(s);
  assert.equal(s.choice?.kind, 'discard'); assert.equal(s.choice?.player, 1);
  assert.equal(projectGame(s, 0).choice!.cards.length, 0, 'the discarder\u2019s hand is not shown to the caster');
  s = choose(s, 1, 'select', '6♣');
  assert.equal(zoneOf(s, '2♦'), 'pr-0'); assert.equal(zoneOf(s, '6♣'), 'gy');
  assert.equal(s.miniTurns, 1, 'Quick costs no Mini-Turn');
  assert.ok(!legal(s, 0).some(a => a.mode === 'quick2'), 'only one resolved Two Quick per Full Turn');
  s = fixture({ active: 1, hands: [['2♦', '10♦'], NO] });
  assert.ok(!legal(s, 0).some(a => a.mode === 'quick2'));
});

test('2.quick: a countered Two Quick does not consume the per-turn limit', () => {
  let s = fixture({ hands: [['2♦', '2♥', '10♦'], ['A♥', ...NO5]] });
  s = effect(s, 0, '2♦', 'quick2');
  s = act(s, 1, a => a.type === 'counter');
  s = passAll(s);
  assert.equal(zoneOf(s, '2♦'), 'gy');
  assert.ok(has(s, 0, a => a.mode === 'quick2' && a.cardId === id(s, '2♥')));
});

test('3.base §26 ⦗3⦘: presents up to 3 of the opponent\u2019s choice; caster takes one; discard mode takes up to 2', () => {
  let s = fixture({ hands: [['3♦', '10♦'], NO] });
  s = effect(s, 0, '3♦', 'raid');
  assert.equal(s.choice?.kind, 'present'); assert.equal(s.choice?.count, 3);
  for (const c of ['6♣', '10♣', '2♠']) s = choose(s, 1, 'select', c);
  assert.equal(s.choice?.kind, 'raid-take');
  assert.equal(projectGame(s, 0).choice!.cards.length, 3, 'presented cards are shown');
  s = choose(s, 0, 'select', '10♣');
  assert.equal(zoneOf(s, '10♣'), 'hand-0'); assert.equal(s.players[1]!.hand.length, 5);
  s = fixture({ hands: [['3♦', '10♦'], ['6♣']] });
  s = effect(s, 0, '3♦', 'discard2');
  assert.equal(s.choice?.count, 1, 'fewer cards than requested: discard as many as possible');
  s = choose(s, 1, 'select', '6♣');
  assert.equal(s.players[1]!.hand.length, 0);
});

test('3.instant §26 ⦗3⦘: in a response window, bounce a Vulnerable card to the bottom of DP', () => {
  let s = fixture({ active: 1, hands: [['3♥', '10♦'], NO], pr: [[], ['9♣']] });
  s = play(s, 1, 'draw');
  s = act(s, 0, a => a.mode === 'instant-bottom' && a.targetId === id(s, '9♣'));
  s = passAll(s);
  assert.equal(zoneOf(s, '9♣'), `deck-${s.deck.length - 1}`);
  assert.equal(s.miniTurns, 0, 'player 2\u2019s own Draw still resolved');
});

test('4.natural §26 ⦗4⦘: reorder the top four privately, then optionally draw', () => {
  let s = fixture({ hands: [['4♣', '10♦'], NO], deckTop: ['7♦', '8♦', '9♦', 'J♦'] });
  s = effect(s, 0, '4♣', 'natural');
  s = passAll(s);
  assert.equal(s.choice?.kind, 'order');
  assert.equal(projectGame(s, 1).choice!.cards.length, 0, 'the opponent does not see the top cards');
  for (const c of ['J♦', '7♦', '9♦', '8♦']) s = choose(s, 0, 'select', c);
  assert.deepEqual(s.deck.slice(0, 4).map(c => c.rank), ['J', '7', '9', '8']);
  s = choose(s, 0, 'draw');
  assert.equal(zoneOf(s, 'J♦'), 'hand-0');
  assert.equal(s.miniTurns, 1, 'Natural is a Quick');
});

test('5.recycle §26 ⦗5⦘: mill 2, rummage any GY card, then draw the oldest; the resolving 5 is not yet in GY', () => {
  let s = fixture({ hands: [['5♣', '10♦'], NO], graveyard: ['A♦', 'K♦'], deckTop: ['7♦', '8♦'] });
  s = effect(s, 0, '5♣', 'recycle');
  s = passAll(s);
  assert.equal(s.choice?.kind, 'recycle');
  assert.ok(!s.choice!.cards.some(c => c.rank === '5' && c.suit === '♣'), 'the 5 is still resolving');
  assert.deepEqual(s.graveyard.map(c => c.rank), ['A', 'K', '7', '8']);
  s = choose(s, 0, 'select', '8♦');
  assert.equal(zoneOf(s, '8♦'), 'hand-0'); assert.equal(zoneOf(s, 'A♦'), 'hand-0', 'oldest GY card drawn');
  assert.equal(zoneOf(s, '5♣'), 'gy', 'source goes to GY after resolution');
});

test('6.dig §26 ⦗6⦘: draw 3 then return one to top/bottom, or keep all and discard one', () => {
  let s = fixture({ hands: [['6♦', '10♦'], NO], deckTop: ['7♦', '8♦', '9♦'] });
  s = effect(s, 0, '6♦', 'dig');
  s = passAll(s);
  assert.equal(s.players[0]!.hand.length, 4);
  assert.ok(!legal(s, 0).some(a => a.mode === 'dig-top' && a.cardId === id(s, '10♦')), 'only drawn cards may be returned');
  s = choose(s, 0, 'dig-bottom', '9♦');
  assert.equal(zoneOf(s, '9♦'), `deck-${s.deck.length - 1}`);
  s = fixture({ hands: [['6♦', '10♦'], NO], deckTop: ['7♦', '8♦', '9♦'] });
  s = passAll(effect(s, 0, '6♦', 'dig'));
  s = choose(s, 0, 'dig-discard', '10♦');
  assert.equal(s.players[0]!.hand.length, 3);
});

test('7.base §26 ⦗7⦘: take one revealed card, play the other as a generated play (no Mini-Turn); the 7 waits for its child', () => {
  // Player 2 holds an Ace, so every Effect (including the generated child) pauses for a response.
  let s = fixture({ hands: [['7♠', '10♦'], ['A♥', ...NO5]], pr: [[], ['9♣']], deckTop: ['K♦', '3♦'] });
  s = passAll(effect(s, 0, '7♠', 'seven'));
  assert.equal(s.choice?.kind, 'seven-hand');
  assert.equal(projectGame(s, 1).choice!.cards.length, 2, 'revealed publicly');
  s = choose(s, 0, 'select', 'K♦');
  assert.equal(s.choice?.kind, 'generated');
  s = act(s, 0, a => a.type === 'generated-effect' && a.mode === 'bounce-top' && a.targetId === id(s, '9♣'));
  assert.equal(zoneOf(s, '7♠'), 'elsewhere', 'the parent Seven is suspended until the child finishes');
  s = passAll(s);
  assert.equal(zoneOf(s, '9♣'), 'deck-0');
  assert.equal(zoneOf(s, '7♠'), 'gy');
  assert.equal(zoneOf(s, 'K♦'), 'hand-0');
});

test('7.base: a generated non-Seven cannot create more Topdeck Casting; a generated Seven may', () => {
  let s = fixture({ hands: [['7♠', '10♦'], NO], deckTop: ['7♦', 'K♦'] });
  s = passAll(effect(s, 0, '7♠', 'seven'));
  s = choose(s, 0, 'select', 'K♦');
  assert.ok(has(s, 0, a => a.type === 'generated-effect' && a.mode === 'seven'), 'physical 7 may recurse');
  s = fixture({ hands: [['7♠', '10♦'], NO], deckTop: ['2♦', 'K♦'] });
  s = passAll(effect(s, 0, '7♠', 'seven'));
  s = choose(s, 0, 'select', 'K♦');
  assert.deepEqual(legal(s, 0).map(a => a.mode), ['generated-score'], 'a generated 2 has no Solo Wild copy and no Quick timing');
});

test('7.trigger §26 ⦗7⦘: scoring a Seven reveals two, takes one, returns the other to the top of DP', () => {
  let s = fixture({ hands: [['7♦', '10♦'], NO], deckTop: ['K♦', '3♦'] });
  s = passAll(play(s, 0, 'score', '7♦'));
  assert.equal(s.choice?.kind, 'seven-score');
  s = choose(s, 0, 'select', '3♦');
  assert.equal(zoneOf(s, '3♦'), 'hand-0'); assert.equal(zoneOf(s, 'K♦'), 'deck-0');
  assert.equal(score(s, 0), 7);
});

test('9.tap §26 ⦗9⦘: tapped PR card scores 0 until its controller\u2019s Start (First Contact untap)', () => {
  let s = fixture({ active: 1, hands: [['9♥', '10♦'], NO], pr: [[], ['K♣', '7♦']] });
  s = play(s, 1, 'draw');
  s = act(s, 0, a => a.mode === 'tap' && a.targetId === id(s, 'K♣'));
  s = passAll(s);
  assert.equal(score(s, 1), 7);
  s = play(s, 1, 'end');
  assert.equal(s.activePlayer, 0);
  s = passAll(play(s, 0, 'draw'));
  s = play(s, 0, 'end');
  assert.equal(score(s, 1), 15, 'untapped at player 2\u2019s Start');
});

test('9.goal §26 ⦗9⦘: Goal +3, or +5 and discard 1 (Goal-Mod Play)', () => {
  let s = fixture({ active: 1, hands: [['9♥', '10♦', '3♦'], NO] });
  s = play(s, 1, 'draw');
  s = act(s, 0, a => a.mode === 'goal5');
  s = passAll(s);
  assert.equal(s.players[1]!.goal, 20);
  assert.equal(s.choice?.kind, 'discard'); assert.equal(s.choice?.player, 0);
  s = choose(s, 0, 'select', '3♦');
  assert.equal(zoneOf(s, '3♦'), 'gy');
});

test('9.anchor §26 ⦗9⦘: reveals the opponent\u2019s hand; they discard 1; a new Nine Anchor Scraps the old', () => {
  let s = fixture({ hands: [['9♦', '10♦'], NO], er: [['9♠'], []] });
  s = passAll(effect(s, 0, '9♦', 'anchor-9'));
  assert.equal(zoneOf(s, '9♠'), 'gy');
  assert.equal(zoneOf(s, '9♦'), 'er-0');
  assert.equal(projectGame(s, 0).choice!.cards.length, 6, 'the hand is revealed');
  s = choose(s, 1, 'select', 'Q♣');
  assert.equal(zoneOf(s, 'Q♣'), 'gy');
});

test('J.disrupt §26 ⦗J⦘: answers an opponent\u2019s Mini-Turn Action, records it, draws 1; the Action continues', () => {
  let s = fixture({ active: 1, hands: [['J♥', '10♦'], NO] });
  s = play(s, 1, 'draw');
  assert.ok(has(s, 0, a => a.mode === 'disrupt'));
  s = act(s, 0, a => a.mode === 'disrupt');
  s = passAll(s);
  assert.deepEqual(s.players[1]!.disrupted, ['draw']);
  assert.equal(s.players[0]!.hand.length, 2, 'Jack drawn 1 after spending the J');
  assert.equal(s.players[1]!.hand.length, 7, 'the Draw was not countered');
  s = fixture({ active: 1, hands: [['J♥', '10♦'], ['2♦', ...NO5]] });
  s = effect(s, 1, '2♦', 'quick2');
  assert.ok(!has(s, 0, a => a.mode === 'disrupt'), 'Free plays are not Mini-Turn Actions');
});

test('J.attach §26 ⦗J⦘ / attachments §12: control +1; host leaving Scraps the Jack; Jack leaving returns the host', () => {
  let s = fixture({ hands: [['J♣', '10♦'], NO], pr: [[], ['9♦', 'A♠', 'RJ', '4♣']] });
  const targets = legal(s, 0).filter(a => a.mode === 'attach').map(a => a.targetId);
  assert.deepEqual(targets, [id(s, '9♦')], 'Ace/Joker cannot be Jacked; 4 is Effect-immune');
  s = passAll(effect(s, 0, 'J♣', 'attach', '9♦'));
  assert.equal(zoneOf(s, '9♦'), 'pr-0'); assert.equal(score(s, 0), 10);
  // Player 2 Scuttles the Jacked 9 (a card player 1 now controls).
  s = play(s, 0, 'end');
  s = fixture({ active: 1, hands: [['10♦'], ['K♣', ...NO5]], pr: [['9♦'], []], er: [[{ card: 'J♣', host: '9♦' }], []] });
  s = passAll(act(s, 1, a => a.type === 'scuttle' && a.targetId === id(s, '9♦')));
  assert.equal(zoneOf(s, '9♦'), 'gy'); assert.equal(zoneOf(s, 'J♣'), 'gy', 'severed Jack is Scrapped (§12)');
  s = fixture({ active: 1, hands: [['10♦'], ['3♥', ...NO5]], pr: [['9♦'], []], er: [[{ card: 'J♣', host: '9♦' }], []] });
  s = passAll(effect(s, 1, '3♥', 'bounce-top', 'J♣'));
  assert.equal(zoneOf(s, '9♦'), 'pr-1', 'host returns to its original owner\u2019s PR');
  assert.equal(zoneOf(s, 'J♣'), 'deck-0');
});

test('J.attach fizzle §6: a target that becomes Guarded before resolution makes the Jack fizzle', () => {
  let s = fixture({ hands: [['J♣', '10♦'], ['3♥', ...NO5]], pr: [[], ['9♦']] });
  s = effect(s, 0, 'J♣', 'attach', '9♦');
  s = act(s, 1, a => a.mode === 'instant-top' && a.targetId === id(s, '9♦'));
  s = passAll(s);
  assert.equal(zoneOf(s, 'J♣'), 'gy');
  assert.ok(s.events.some(e => e.t === 'fizzle' && e.mode === 'attach'));
});

test('A.purge §26 ⦗A⦘ (mode 2, no Aegis in First Contact): bounce a Vulnerable enemy Anchor to its owner\u2019s hand; Guard protects other Anchors', () => {
  let s = fixture({ hands: [['A♦', '10♦'], NO], er: [[], ['K♣', 'Q♥']] });
  const targets = legal(s, 0).filter(a => a.mode === 'purge').map(a => a.targetId);
  assert.deepEqual(targets, [id(s, 'Q♥')], 'the Guarded King is protected; the Queen is not protected by itself');
  s = passAll(effect(s, 0, 'A♦', 'purge', 'Q♥'));
  assert.equal(zoneOf(s, 'Q♥'), 'hand-1');
  assert.equal(zoneOf(s, 'A♦'), 'gy');
  s = fixture({ hands: [['A♦', '10♦'], NO], pr: [[], ['9♣']], er: [[], [{ card: 'J♠', host: '9♣' }]] });
  assert.ok(!legal(s, 0).some(a => a.mode === 'purge'), 'Attachments are not Anchors');
});

test('K.anchor / Q.anchor §26: Anchors enter ER; Queen establishes Guard', () => {
  let s = fixture({ hands: [['Q♦', '10♦'], NO] });
  s = passAll(effect(s, 0, 'Q♦', 'anchor-Q'));
  assert.ok(projectGame(s, 1).players[0]!.guard);
  s = fixture({ hands: [['K♦', '10♦'], NO] });
  s = passAll(effect(s, 0, 'K♦', 'anchor-K'));
  assert.equal(zoneOf(s, 'K♦'), 'er-0');
  assert.equal(score(s, 0), 0, 'ER contributes no Points (§8)');
});

test('K.anchor §26 ⦗K⦘: ER Anchor value is 7 for an ordinary King and 9 for K♠; tapped Anchors contribute 0 (§9)', () => {
  let s = fixture({ hands: [['K♦', '10♦'], NO] });
  s = passAll(effect(s, 0, 'K♦', 'anchor-K'));
  const kd = s.players[0]!.er.find(c => c.rank === 'K')!;
  assert.equal(anchorValue(kd), 7);
  assert.equal(score(s, 0), 0, 'Anchor value does not add to Secured PR Points (§8)');
  kd.tapped = true;
  assert.equal(anchorValue(kd), 0);
  s = fixture({ hands: [['K♠', '10♦'], NO] });
  s = passAll(effect(s, 0, 'K♠', 'anchor-K'));
  assert.equal(anchorValue(s.players[0]!.er[0]!), 9);
  s = fixture({ hands: [['Q♦', '10♦'], NO] });
  s = passAll(effect(s, 0, 'Q♦', 'anchor-Q'));
  assert.equal(anchorValue(s.players[0]!.er[0]!), 0, 'Queen Anchor value is 0');
});

test('RJ.modes §26 ⦗RJ⦘: Hand Swap, Self Reset (+3), Opponent Attack (−2), Shuffle Reset (DP+GY, draw 2)', () => {
  let s = fixture({ hands: [['RJ', '10♦'], NO] });
  s = passAll(effect(s, 0, 'RJ', 'hand-swap'));
  assert.equal(s.players[0]!.hand.length, 6); assert.equal(zoneOf(s, '10♦'), 'hand-1');
  s = fixture({ hands: [['RJ', '10♦', '3♦'], NO] });
  s = passAll(effect(s, 0, 'RJ', 'self-reset'));
  assert.equal(s.players[0]!.hand.length, 5); assert.equal(zoneOf(s, '10♦'), 'gy');
  s = fixture({ hands: [['RJ', '10♦'], NO] });
  s = passAll(effect(s, 0, 'RJ', 'attack'));
  assert.equal(s.players[1]!.hand.length, 4);
  s = fixture({ hands: [['RJ', '10♦'], NO], graveyard: ['2♦', '3♦'] });
  const total = s.deck.length + s.graveyard.length;
  s = passAll(effect(s, 0, 'RJ', 'shuffle-reset'));
  assert.equal(s.deck.length, total - 2); assert.equal(s.graveyard.map(c => c.rank).join(), 'RJ');
});

test('BJ.lock §26 ⦗BJ⦘: free Quick in an open state; forbids non-counter Effects and Scuttle; counters, Draw and scoring remain', () => {
  let s = fixture({ hands: [['BJ', '6♦', '10♦'], ['3♦', '9♥', 'A♥', ...NO.slice(0, 3)]], pr: [['4♠'], ['8♦', '3♣']] });
  s = effect(s, 0, 'BJ', 'board-lock');
  s = passAll(s);
  assert.ok(s.boardLock); assert.equal(s.miniTurns, 1, 'no Mini-Turn spent');
  assert.ok(!legal(s, 0).some(a => a.type === 'effect' || a.type === 'scuttle'), 'no Effects or Scuttle');
  s = play(s, 0, 'score', '6♦');
  assert.ok(!has(s, 1, a => a.mode === 'tap' || a.mode === 'goal3'), 'Instant Effects also locked');
  s = play(s, 0, 'end');
  assert.equal(s.boardLock?.remaining, 2, 'not reduced at the end of the activation Full Turn');
  s = passAll(play(s, 1, 'draw'));
  s = play(s, 1, 'end');
  assert.equal(s.boardLock?.remaining, 1);
  s = passAll(play(s, 0, 'draw'));
  s = play(s, 0, 'end');
  assert.equal(s.boardLock, null, 'ends after the second following completed Full Turn');
});

test('BJ.lock: cannot be declared with a pending stack, during the opponent\u2019s turn, or while already active', () => {
  let s = fixture({ active: 1, hands: [['BJ', '10♦'], NO] });
  s = play(s, 1, 'draw');
  assert.ok(!legal(s, 0).some(a => a.mode === 'board-lock'));
  s = fixture({ hands: [['BJ', '3♥', '10♦'], NO], pr: [['6♦'], []] });
  s = play(s, 0, 'draw');
  assert.ok(legal(s, 0).some(a => a.type === 'decline') && !legal(s, 0).some(a => a.mode === 'board-lock'), 'not while the Draw is pending');
  s = fixture({ hands: [['BJ', '10♦'], NO], boardLock: { remaining: 1, activationTurn: 1, player: 1 } });
  assert.ok(!legal(s, 0).some(a => a.mode === 'board-lock'));
});

test('BJ.score §26: scores 11 and is Scuttle/Jack-immune; its Exile Recycle rider is disabled in First Contact', () => {
  let s = fixture({ hands: [['BJ', '10♦'], NO] });
  s = passAll(play(s, 0, 'score', 'BJ'));
  assert.equal(score(s, 0), 11);
  assert.equal(s.choice, null, 'no Exile Recycle trigger');
});
