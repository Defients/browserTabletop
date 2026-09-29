import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyGame, assertGameIntegrity, createGame, everyCard, fixture, projectGame, seeded } from '../packages/intrilex/index.js';
import { act, effect, id, legal, passAll, play } from './helpers/game.js';

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
    assert.deepEqual(s.swapBar!.map(c => c.faceUp), [false, false, true]);
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
