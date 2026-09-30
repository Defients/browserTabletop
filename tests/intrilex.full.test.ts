import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyGame, assertGameIntegrity, createGame, everyCard, fixture, projectGame, seeded } from '../packages/intrilex/index.js';
import { act, choose, effect, id, legal, passAll, play } from './helpers/game.js';

const profile = 'intrilex-full' as const;
const quiet = ['6♣', '5♥'];

test('Full §2 setup: 54 unique cards, two players, random A 5/B 6, Goal 21 and finite down/down/up bar', () => {
  const firsts = new Set<number>();
  for (let seed = 1; seed <= 40; seed++) {
    const s = createGame({ profile, random: seeded(seed) });
    assertGameIntegrity(s);
    firsts.add(s.activePlayer);
    assert.equal(s.version, 3);
    assert.equal(s.profile, profile);
    assert.equal(s.players.length, 2);
    assert.equal(s.players[s.activePlayer]!.hand.length, 5);
    assert.equal(s.players[1 - s.activePlayer]!.hand.length, 6);
    assert.deepEqual(s.players.map(p => p.goal), [21, 21]);
    assert.deepEqual(s.swapBar!.map(c => c.faceUp), [false, true, false]);
    assert.equal(s.deck.length, 40);
    assert.equal(s.exile!.length, 0);
    assert.equal(s.graveyard.length, 0);
    assert.equal(everyCard(s).length, 54);
    assert.equal(new Set(everyCard(s).map(c => `${c.rank}${c.suit}`)).size, 54);
  }
  assert.deepEqual([...firsts].sort(), [0, 1]);
});

test('Full §2 setup deals Swap Bar only after both hands, preserving the shuffled card sequence', () => {
  const full = createGame({ profile, firstPlayer: 0, random: seeded(702) });
  const fc = createGame({ firstPlayer: 0, random: seeded(702) });
  const names = (cards: {rank: string; suit: string}[]) => cards.map(c => `${c.rank}${c.suit}`);
  assert.deepEqual(names(full.players[0]!.hand), names(fc.players[0]!.hand));
  assert.deepEqual(names(full.players[1]!.hand), names(fc.players[1]!.hand));
  assert.deepEqual(names(full.swapBar!.map(c => c.card)), names(fc.deck.slice(0, 3)));
  assert.deepEqual(names(full.deck), names(fc.deck.slice(3)));
});

test('Full §3/§18 privacy: opponent hands, future deck and down-bar card handles never leave projections', () => {
  const s = createGame({ profile, random: seeded(71) });
  for (const viewer of [0, 1, null]) {
    const v = projectGame(s, viewer);
    const wire = JSON.stringify(v);
    for (const c of s.deck) assert.ok(!wire.includes(c.id), 'future DP handle leaked');
    for (const entry of s.swapBar!.filter(x => !x.faceUp)) assert.ok(!wire.includes(entry.card.id), 'down-bar handle leaked');
    for (let p = 0; p < 2; p++) if (p !== viewer) {
      for (const c of s.players[p]!.hand) assert.ok(!wire.includes(c.id), 'private hand handle leaked');
    }
    if (viewer === null) { assert.deepEqual(v.hand, []); assert.deepEqual(v.legalActions, []); }
    assert.equal(v.profile, profile);
  }
});

test('Full §25 Exile is public and ordered while ordinary hidden zones remain private', () => {
  const s = fixture({ profile, hands: [['5♣'], quiet], exile: ['A♣', '2♦', '3♥'], swapBar: [{ card: 'K♥', faceUp: false }] });
  for (const viewer of [0, 1, null]) {
    const v = projectGame(s, viewer);
    assert.deepEqual(v.exile!.map(c => `${c.rank}${c.suit}`), ['A♣', '2♦', '3♥']);
    assert.ok(!JSON.stringify(v).includes(id(s, 'K♥')));
  }
});

test('Full §18 Face-Down Swap: take a face-down bar card, return a hand card face-up, once per FT', () => {
  let s = fixture({ profile, active: 1, miniTurns: 0, hands: [quiet, ['5♣']], swapBar: [{ card: 'K♥', faceUp: false }, { card: '4♠', faceUp: false }, { card: '9♦', faceUp: true }] });
  s = play(s, 1, 'end');
  assert.equal(s.phase, 'start');
  const swaps = legal(s, 0).filter(a => a.type === 'swap-down');
  assert.equal(swaps.length, 4, 'each face-down slot × each hand card');
  assert.ok(swaps.every(a => a.cardId && s.players[0]!.hand.some(c => c.id === a.cardId)));
  assert.throws(() => applyGame(s, 0, { type: 'swap-down', mode: '0' }), 'a slot without a given hand card is not a legal swap');
  s = act(s, 0, a => a.type === 'swap-down' && a.mode === '0' && a.cardId === id(s, '6♣'));
  assert.deepEqual(s.swapBar!.map(x => x.faceUp), [true, false, true]);
  assert.deepEqual([s.swapBar![0]!.card.rank, s.swapBar![0]!.card.suit], ['6', '♣']);
  const taken = s.players[0]!.hand.find(c => c.rank === 'K' && c.suit === '♥')!;
  assert.ok(taken, 'the face-down card entered the hand');
  assert.equal(taken.revealed, undefined, '§18 grants no Revealed-Until-Start on a Face-Down Swap');
  assert.ok(!s.players[0]!.hand.some(c => c.rank === '6' && c.suit === '♣'));
  assert.ok(s.players[0]!.swapUsed);
  assert.ok(!legal(s, 0).some(a => a.type === 'swap-down'), 'the Swap Bar use is spent');
  assert.ok(legal(s, 0).some(a => a.type === 'start-action'), 'the swap is free; the Start Phase continues');
  const opp = projectGame(s, 1);
  assert.equal(opp.swapBar![0]!.card!.rank, '6', 'the returned card is face-up and public');
  assert.ok(!JSON.stringify(opp).includes(taken.id), 'the taken card stays hidden from the opponent');
  s = act(s, 0, a => a.type === 'start-action');
  assert.ok(!legal(s, 0).some(a => a.type === 'swap-draw'), 'Face-Up Draw shares the once-per-FT use');
});

test('Full §5 forged commands are rejected without mutating state or spending an Action', () => {
  const s = fixture({ profile, hands: [['Q♣', '10♦'], quiet] });
  const before = JSON.stringify(s);
  assert.throws(() => applyGame(s, 0, { type: 'effect', cardId: id(s, 'Q♣'), mode: 'wild-4' }));
  assert.throws(() => applyGame(s, 1, { type: 'draw' }));
  assert.throws(() => applyGame(s, 2, { type: 'draw' }));
  assert.throws(() => applyGame(s, 0, { type: 'effect', cardIds: ['forged', 'forged'], mode: 'queens-court' }));
  assert.equal(JSON.stringify(s), before);
});

test('Full §1/§4.5 normal victory occurs only after the active player completes End Phase', () => {
  let s = fixture({ profile, hands: [['6♦'], quiet], pr: [['10♥', '5♦'], []] });
  s = passAll(play(s, 0, 'score', '6♦'));
  assert.equal(s.winner, null);
  s = play(s, 0, 'end');
  assert.equal(s.winner, 0);
});

test('Full §26 Queen protected entry blocks enemy bounce and Scuttle until recorded next Start', () => {
  let s = fixture({ profile, hands: [['Q♦', '6♦'], ['3♣', 'K♥']] });
  s = effect(s, 0, 'Q♦', 'anchor-Q');
  s = passAll(s);
  assert.equal(s.players[0]!.er.length, 1);
  s = play(s, 0, 'end');
  if (s.phase === 'start') s = act(s, 1, a => a.type === 'start-action');
  assert.ok(!legal(s, 1).some(a => a.targetId === id(s, 'Q♦') && a.mode === 'bounce-top'));
});

test('Full §26 Queen Court: only K-spade directly counters composite Anchor, all Queens committed together', () => {
  let s = fixture({ profile, hands: [['Q♣', 'Q♦'], ['K♠', 'K♥', 'A♣', 'A♥', 'A♠']] });
  s = act(s, 0, a => a.mode === 'court');
  assert.equal(s.players[0]!.hand.length, 0);
  assert.equal(s.players[0]!.er.length, 0, 'pending Queens do not provide Guard');
  const court = s.stack.find(i => i.action.mode === 'court')!;
  assert.equal(court.cls, 'anchor');
  const direct = legal(s, 1).filter(a => a.type === 'counter' && a.targetId === court.id);
  assert.equal(direct.length, 1, 'no Base Ace, Spade Ace, Super Ace, or ordinary King authority');
  assert.equal(direct[0]!.cardId, id(s, 'K♠'));
  s = act(s, 1, a => a.type === 'counter' && a.targetId === court.id);
  s = passAll(s);
  assert.equal(s.players[0]!.er.length, 0);
  assert.deepEqual(s.graveyard.filter(c => c.rank === 'Q').map(c => c.suit).sort(), ['♣', '♦'].sort());
  assert.equal(s.miniTurns, 0);
});

test('Full §26 Queen Court: exactly two physical hand Queens, entry Aegis and once-declared limit', () => {
  let s = fixture({ profile, hands: [['Q♣', 'Q♦', 'Q♥', 'Q♠'], quiet], miniTurns: 3 });
  const courts = legal(s, 0).filter(a => a.mode === 'court');
  assert.equal(courts.length, 6, 'all unordered pairs, no larger recipe');
  for (const a of courts) assert.equal(a.cardIds!.length, 2);
  s = passAll(act(s, 0, a => a.mode === 'court'));
  assert.equal(s.players[0]!.er.length, 2);
  assert.ok(s.players[0]!.er.every(c => c.aegis !== undefined && !c.tapped));
  assert.ok(!legal(s, 0).some(a => a.mode === 'court'));
  const invalid = fixture({ profile, hands: [['Q♣', '2♣'], quiet], er: [['Q♦'], []] });
  assert.ok(!legal(invalid, 0).some(a => a.mode === 'court'), 'ER Queen and Two cannot substitute');
});

test('Full §26 Royal Marriage requires matching suit and preserves composite Anchor counter class', () => {
  let s = fixture({ profile, hands: [['K♦', 'Q♦', 'Q♣'], ['K♠', 'A♠', 'A♣', 'A♥', 'K♥']] });
  assert.equal(legal(s, 0).filter(a => a.mode === 'marriage').length, 1);
  s = act(s, 0, a => a.mode === 'marriage');
  const marriage = s.stack.find(i => i.action.mode === 'marriage')!;
  assert.equal(marriage.cls, 'anchor');
  const answers = legal(s, 1).filter(a => a.type === 'counter' && a.targetId === marriage.id);
  assert.equal(answers.length, 1);
  assert.equal(answers[0]!.cardId, id(s, 'K♠'));
  s = passAll(s);
  assert.deepEqual(s.players[0]!.er.map(c => c.rank).sort(), ['K', 'Q']);
  assert.ok(s.players[0]!.er.find(c => c.rank === 'Q')!.aegis !== undefined);
});

test('Full §9 Nine tap survives Start and releases only when current controller scores', () => {
  let s = fixture({ profile, active: 1, hands: [['6♦'], ['6♥']], pr: [['9♣*'], []] });
  s.players[0]!.pr[0]!.tapUntil = 'score';
  s = passAll(play(s, 1, 'score', '6♥'));
  s = play(s, 1, 'end');
  assert.equal(s.players[0]!.pr[0]!.tapped, true, 'Core does not use FC automatic Start untap');
  if (s.phase === 'start') s = act(s, 0, a => a.type === 'start-action');
  s = passAll(play(s, 0, 'score', '6♦'));
  assert.ok(!s.players[0]!.pr.find(c => c.rank === '9')!.tapped);
});

test('Full §14 Aegis blocks friendly effects and ordinary Scuttle; Nines cannot gain it', () => {
  const s = fixture({ profile, hands: [['3♣', 'K♦'], ['6♥']], pr: [['6♦'], ['7♥']] });
  s.players[0]!.pr[0]!.aegis = 20;
  s.players[1]!.pr[0]!.aegis = 20;
  assert.ok(!legal(s, 0).some(a => a.mode === 'bounce-top' && a.targetId === id(s, '6♦')));
  assert.ok(!legal(s, 0).some(a => a.type === 'scuttle' && a.targetId === id(s, '7♥')));
});

test('Full Scrapping Generated Cards: a generated card with no legal declaration is Scrapped to GY', () => {
  let s = fixture({ profile, hands: [['5♣'], quiet], deckTop: ['10♣', '3♣', '4♣'] });
  s = play(s, 0, 'draw-cast');
  s = passAll(s);
  assert.equal(s.choice?.kind, 'generated');
  assert.deepEqual(legal(s, 0).map(a => a.mode), ['generated-scrap'], '10♣ has no legal generated declaration');
  s = choose(s, 0, 'generated-scrap', '10♣');
  assert.equal(s.choice, null);
  assert.ok(s.graveyard.some(c => c.rank === '10' && c.suit === '♣'), 'scrapped generated card reached GY');
  assert.ok(!s.players[0]!.hand.some(c => c.rank === '10'));
});

test('Full generated composite plays commit every source; counters scrap them all', () => {
  let s = fixture({ profile, hands: [['7♦', '8♣'], ['8♥', '6♠']], pr: [[], ['9♥']], deckTop: ['8♦', '3♠'] });
  s = passAll(effect(s, 0, '7♦', 'seven'));
  s = choose(s, 0, 'select', '3♠'); // take 3♠; 8♦ becomes the generated play
  const gen = legal(s, 0).find(a => a.type === 'generated-effect' && a.mode === 'super-8');
  assert.ok(gen, 'generated 8♦ may combine with the 8♣ already in hand');
  s = act(s, 0, a => a.type === 'generated-effect' && a.mode === 'super-8');
  const item = s.stack.at(-1)!;
  assert.equal(item.cls, 'scuttle');
  assert.equal(item.cards!.length, 1, 'the partner 8♣ is committed to the stack item');
  assert.ok(!s.players[0]!.hand.some(c => c.rank === '8' && c.suit === '♣'), 'committed 8♣ left the hand');
  s = act(s, 1, a => a.type === 'counter' && a.mode === 'counter');
  s = passAll(s);
  assert.ok(s.graveyard.some(c => c.rank === '8' && c.suit === '♣'), 'committed source scrapped on counter');
  assert.ok(s.graveyard.some(c => c.rank === '8' && c.suit === '♦'), 'generated source scrapped on counter');
});

test('Full ⭐8 Absolute Scuttle ignores rank, suit and ordinary Scuttle immunity; no Eight bonus', () => {
  let s = fixture({ profile, hands: [['8♣', '8♦'], quiet], pr: [[], ['A♥', '5♦']] });
  const supers = legal(s, 0).filter(a => a.type === 'effect' && a.mode === 'super-8');
  assert.equal(supers.length, 2, 'every non-Aegised enemy PR card is a legal target');
  s = act(s, 0, a => a.mode === 'super-8' && a.targetId === id(s, 'A♥'));
  s = passAll(s);
  assert.ok(s.graveyard.some(c => c.rank === 'A' && c.suit === '♥'), 'a Scuttle-immune Ace was Absolute-Scuttled');
  assert.equal(s.choice, null, 'the Eight Scuttle bonus is for ordinary Scuttles only');
  assert.deepEqual(s.graveyard.filter(c => c.rank === '8').map(c => c.suit).sort(), ['♣', '♦'].sort(), 'both Super sources were scrapped');
});

test('Full 8♠ Free Scuttle ignores rank and suit but still respects immunity', () => {
  let s = fixture({ profile, hands: [['6♥'], ['8♠', '3♦']], pr: [['K♣', 'A♣'], []] });
  s = play(s, 0, 'score', '6♥');
  const frees = legal(s, 1).filter(a => a.mode === 'free-scuttle');
  assert.deepEqual(frees.map(a => a.targetId), [id(s, 'K♣')], 'K♣ outranks 8♠ yet is legal; the immune A♣ is not');
  s = act(s, 1, a => a.mode === 'free-scuttle');
  s = passAll(s);
  assert.ok(s.graveyard.some(c => c.rank === 'K' && c.suit === '♣'), 'higher-rank K♣ was Free-Scuttled');
  assert.ok(s.players[0]!.pr.some(c => c.rank === 'A'), 'the immune Ace stayed');
  assert.equal(s.choice, null, 'no Eight bonus on a Free Scuttle');
});

test('Full Solo Wild resolves the copied Base effect; K♠ Wild Sovereignty pays its cost and Exiles', () => {
  let s = fixture({ profile, hands: [['2♥'], quiet] });
  assert.ok(legal(s, 0).some(a => a.mode === 'wild-6:dig'), '2♥ may copy the 6♥ Base effect');
  s = effect(s, 0, '2♥', 'wild-6:dig');
  s = passAll(s);
  assert.equal(s.choice?.kind, 'dig-mode', 'the copied Dig resolved');
  s = act(s, 0, a => a.mode === 'dig-discard');
  assert.ok(s.graveyard.some(c => c.rank === '2' && c.suit === '♥'), 'the Wild copy card proceeded to GY');

  s = fixture({ profile, hands: [['K♠', '9♦'], quiet], pr: [[], ['7♣']] });
  const wild = legal(s, 0).find(a => a.mode === 'wild-4:total-clear');
  assert.equal(wild!.targetIds!.length, 1, 'the 4♠ copy declares a discard cost');
  s = act(s, 0, a => a.mode === 'wild-4:total-clear');
  assert.equal(s.players[0]!.hand.length, 0, 'the cost card is paid at declaration');
  s = passAll(s);
  assert.equal(s.players[1]!.pr.length, 0, 'Total Clear resolved');
  assert.ok(s.exile!.some(c => c.rank === 'K' && c.suit === '♠'), 'Wild-Exile-Bound K♠ went to Exile');
  assert.ok(s.graveyard.some(c => c.rank === '9' && c.suit === '♦'), 'the discard cost is never refunded');
});

test('Full 10♦ Mimic resolves the copied Super, consumes the Rank-10 play and Exiles the 10', () => {
  let s = fixture({ profile, hands: [['10♦', '2♣'], quiet] });
  assert.ok(legal(s, 0).some(a => a.mode === 'mimic:super-6'), '10♦ + 2 may mimic a Super');
  s = act(s, 0, a => a.mode === 'mimic:super-6');
  s = passAll(s);
  assert.ok(s.players[0]!.tenUsed, 'Mimic consumes the per-FT Rank-10 limit');
  assert.ok(s.exile!.some(c => c.rank === '10' && c.suit === '♦'), 'the resolved Rank-10 effect play is Exile-Bound');
  assert.ok(s.graveyard.some(c => c.rank === '2' && c.suit === '♣'), 'the paired 2 went to GY');
  assert.equal(s.players[0]!.hand.length, 4, 'Super Dig kept four');
});

test('Full Ultras consume the per-FT limit at declaration and resist everything but ⭐A', () => {
  let s = fixture({ profile, hands: [['3♣', '4♠', '6♣'], ['A♣', 'A♦', 'A♥', 'K♠']], deckTop: ['2♥', '9♣', 'J♦', 'Q♣', '5♠', '8♥', '10♠'] });
  s = act(s, 0, a => a.mode === 'ultra-black:dig');
  const ultra = s.stack.at(-1)!;
  assert.equal(ultra.tier, 'ultra');
  assert.ok(s.players[0]!.ultraUsed, 'the Ultra limit is consumed on declaration');
  const answers = legal(s, 1).filter(a => a.type === 'counter' && a.targetId === ultra.id);
  assert.equal(answers.length, 3, 'only ⭐A may answer an Ultra');
  assert.ok(answers.every(a => a.mode === 'super-A'));
  s = passAll(s);
  assert.equal(s.players[0]!.pr.length, 1, 'the score role landed');
  assert.equal(s.exile!.length, 1, 'the exile role landed');
  assert.equal(s.choice?.kind, 'dig-mode', 'the cast role resolved as an internal sub-effect');
  s = act(s, 0, a => a.mode === 'dig-discard');
  assert.ok(s.graveyard.some(c => c.rank === '6' && c.suit === '♣'), 'the cast card reached GY after its sub-effect');
});

test('Full ⭐2 Hold keeps the card OTT tapped; it untaps at its controller\u2019s Start and casts for free', () => {
  let s = fixture({ profile, active: 1, hands: [quiet, ['2♣', '2♦']], pr: [['6♥'], []] });
  s = act(s, 1, a => a.mode === 'super-2-hold');
  s = passAll(s);
  const held = s.players[1]!.pr.find(c => c.rank === '6' && c.suit === '♥')!;
  assert.ok(held.tapped && held.holdCast === 1 && held.tapUntil === 'hold', 'held OTT under the new controller, tapped until next Start');
  s = play(s, 1, 'end');
  s = act(s, 0, a => a.type === 'start-action');
  s = passAll(play(s, 0, 'draw'));
  s = play(s, 0, 'end');
  assert.equal(s.activePlayer, 1);
  assert.ok(!s.players[1]!.pr[0]!.tapped, 'the held card untapped at its controller\u2019s Start');
  assert.ok(legal(s, 1).some(a => a.mode === 'hold:dig'), 'the held card may cast as a Start child play');
  s = act(s, 1, a => a.mode === 'hold:dig');
  s = passAll(s);
  assert.equal(s.choice?.kind, 'dig-mode');
  s = act(s, 1, a => a.mode === 'dig-discard');
  assert.ok(!s.players[1]!.pr.some(c => c.holdCast === 1), 'the held card left OTT to resolve its effect');
  assert.ok(s.graveyard.some(c => c.rank === '6' && c.suit === '♥'), 'then proceeded to its normal effect destination');
});

test('Full A♠ Exile Counter sends countered sources to Exile instead of GY', () => {
  let s = fixture({ profile, hands: [['6♦'], ['A♠', '6♣']] });
  s = effect(s, 0, '6♦', 'dig');
  s = act(s, 1, a => a.type === 'counter' && a.mode === 'exile-counter');
  s = passAll(s);
  assert.ok(s.exile!.some(c => c.rank === '6' && c.suit === '♦'), 'countered source went to Exile');
  assert.ok(!s.graveyard.some(c => c.rank === '6' && c.suit === '♦'));
});

test('Full Nine Tap sets the score-release condition', () => {
  let s = fixture({ profile, hands: [['6♦'], ['9♣', '3♥']], pr: [['7♦'], []] });
  s = effect(s, 0, '6♦', 'dig');
  s = act(s, 1, a => a.mode === 'tap' && a.targetId === id(s, '7♦'));
  s = passAll(s);
  const tapped = s.players[0]!.pr.find(c => c.rank === '7')!;
  assert.ok(tapped.tapped);
  assert.equal(tapped.tapUntil, 'score');
});

test('Full §26 Six Deep Draw: the discard cost commits at declaration and cannot be re-spent', () => {
  let s = fixture({ profile, active: 1, hands: [quiet, ['6♠', '9♥', '4♠']], deckTop: ['10♦', 'J♣', 'Q♥', '2♦', '7♦', '3♠', '8♦', 'K♦'] });
  const cost = id(s, '9♥');
  s = act(s, 1, a => a.mode === 'deep-draw' && a.targetIds?.length === 1 && a.targetIds.includes(cost), 'deep-draw paying 9♥');
  assert.ok(!s.players[1]!.hand.some(c => c.id === cost), 'the cost card leaves the hand at declaration');
  for (const p of [0, 1]) assert.ok(!legal(s, p).some(a => a.cardId === cost || a.cardIds?.includes(cost) || a.targetIds?.includes(cost)), 'a committed cost is not re-offered while pending');
  s = passAll(s);
  assert.ok(s.graveyard.some(c => c.id === cost), 'the committed cost is Scrapped on resolve');
  assert.equal(s.players[1]!.hand.length, 7, 'only the remaining card plus the six drawn');
});

test('Full §26 ⭐7 Sequential Topdeck: reveals two, declares each as a generated play in chosen order', () => {
  let s = fixture({ profile, hands: [['7♣', '7♦', '6♦'], quiet], deckTop: ['3♥', '8♣', '5♣', 'J♦'] });
  s = act(s, 0, a => a.mode === 'super-7');
  s = passAll(s);
  assert.equal(s.choice?.kind, 'full');
  assert.equal(s.choice?.data.mode, 'super-7-order');
  assert.equal(s.choice?.cards.length, 2, '⭐7 reveals exactly two cards');
  s = act(s, 0, a => a.mode === 'super-7-first' && a.cardId === id(s, '8♣'));
  assert.equal(s.choice?.kind, 'generated');
  assert.equal(s.choice?.cards[0]!.rank, '8');
  s = act(s, 0, a => a.mode === 'generated-score');
  assert.equal(s.choice?.kind, 'generated', 'the second revealed card waits for its own declaration');
  assert.equal(s.choice?.cards[0]!.rank, '3');
  s = act(s, 0, a => a.mode === 'generated-score');
  assert.deepEqual(s.players[0]!.pr.map(c => `${c.rank}${c.suit}`).sort(), ['3♥', '8♣'], 'both revealed cards were declared and scored');
  assert.ok(s.players[0]!.hand.every(c => c.id === id(s, '6♦')), 'no revealed card entered the hand');
});

test('Full §26 7♠ Topdeck: take one revealed, declare one generated, return the rest to the top of DP', () => {
  let s = fixture({ profile, hands: [['7♠', '6♦'], quiet], deckTop: ['4♥', '9♦', 'K♥', '2♠'] });
  s = act(s, 0, a => a.mode === 'seven-spade');
  s = passAll(s);
  assert.equal(s.choice?.kind, 'seven-hand');
  assert.equal(s.choice?.cards.length, 3);
  s = act(s, 0, a => a.type === 'choose' && a.mode === 'select' && a.cardId === id(s, '4♥'));
  const taken = s.players[0]!.hand.find(c => c.rank === '4' && c.suit === '♥');
  assert.ok(taken?.revealed === 0, 'the taken card is Revealed-Until-Start');
  assert.equal(s.choice?.kind, 'full');
  assert.equal(s.choice?.cards.length, 2, 'one of the remaining cards is declared generated');
  s = act(s, 0, a => a.mode === 'seven-gen' && a.cardId === id(s, '9♦'));
  assert.equal(s.choice?.kind, 'generated');
  assert.ok(s.deck[0]!.rank === 'K' && s.deck[0]!.suit === '♥', 'the leftover card returned to the top of DP');
  s = act(s, 0, a => a.mode === 'generated-score');
  assert.ok(s.players[0]!.pr.some(c => c.rank === '9' && c.suit === '♦'), 'the generated card resolved');
});

test('Full §9.4 Ultra Black: internal casts cannot spend the Ultra’s committed components as costs', () => {
  let s = fixture({ profile, active: 0, hands: [['6♠', 'K♠', '3♣', '5♦'], quiet], deckTop: ['2♥', '4♥', '7♥', '8♦', '9♦', 'J♥', 'Q♦'] });
  const offers = legal(s, 0).filter(a => a.mode === 'ultra-black:deep-draw');
  assert.ok(offers.length, 'Deep Draw is offered as an internal Ultra cast');
  for (const a of offers) for (const t of a.targetIds ?? []) assert.ok(!a.cardIds!.includes(t), 'cost sources must come from outside the Ultra');
  s = act(s, 0, a => a.mode === 'ultra-black:deep-draw');
  s = passAll(s);
  assert.ok(s.graveyard.some(c => c.id === id(s, '5♦')), 'the paid cost is Scrapped');
  assert.equal(s.players[0]!.hand.length, 6, 'the internal Deep Draw drew six');
});
