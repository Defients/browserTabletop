import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyGame, assertGameIntegrity, availableActions, chooseBotAction, findCard, fixture, guarded,
  normalizeGameState, projectGame, score, seeded,
} from '../packages/intrilex/index.js';
import { act, effect, has, id, legal, passAll, zoneOf } from './helpers/game.js';
import type { GameState } from '../packages/intrilex/types.js';

const NO = ['6♣', '10♣', '4♥', '5♥', '2♠', 'Q♣'];
const NO5 = NO.slice(0, 5);

/** TEST A: a normal Jack attaches to the PR host — control moves, +1 applies, the Jack is never an ER occupant. */
test('J.attach §26/§12: the Jack registers as an attachment of the PR host, not an ER card', () => {
  let s = fixture({ hands: [['J♥', '10♦'], NO], pr: [[], ['6♥']] });
  s = passAll(effect(s, 0, 'J♥', 'attach', '6♥'));
  const host = findCard(s, '6♥')!, jack = findCard(s, 'J♥')!;
  assert.equal(zoneOf(s, '6♥'), 'pr-0', 'the Jacker controls the host in their own PR');
  assert.equal(host.owner, 1, 'the host still belongs to its original owner');
  assert.equal(zoneOf(s, 'J♥'), 'att-0');
  assert.equal(jack.hostId, host.id, 'the Jack stores its persistent host relationship');
  assert.equal(s.players[0]!.er.length, 0, 'no standalone ER occupant');
  assert.equal(s.players[1]!.er.length, 0);
  assert.equal(score(s, 0), 7, 'host 6 Points + Jack +1 modifier');
  assert.equal(score(s, 1), 0, 'the owner no longer secures the Jacked card');
  assertGameIntegrity(s);
});

/** TEST B + TEST C: an attached Jack consumes no PR slot and no ER slot. */
test('J.attach: the attachment occupies no PR or ER slot — only the host does', () => {
  let s = fixture({ hands: [['J♥', '10♦'], NO], pr: [[], ['6♥']] });
  const erBefore = JSON.stringify(s.players.map(p => p.er));
  s = passAll(effect(s, 0, 'J♥', 'attach', '6♥'));
  assert.equal(s.players[0]!.pr.length, 1, 'one occupied PR slot: the host alone');
  assert.equal(s.players[0]!.er.length, 0);
  assert.equal(s.players[0]!.attachments!.length, 1);
  assert.equal(JSON.stringify(s.players.map(p => p.er)), erBefore, 'Enduring Rows are unchanged by a PR attachment');
});

/** TEST D: J♠ attaches to an enemy ER Anchor; control moves but the host stays an ER Anchor. */
test('J♠ attach-er §26: an enemy Anchor moves under the Jacker’s control while remaining their ER host', () => {
  let s = fixture({ profile: 'intrilex-full', hands: [['J♠', '10♦'], NO], er: [[], ['K♦']] });
  assert.ok(has(s, 0, a => a.mode === 'attach-er' && a.targetId === id(s, 'K♦')), 'J♠ offers the ER-Anchor attachment');
  s = passAll(effect(s, 0, 'J♠', 'attach-er', 'K♦'));
  const host = findCard(s, 'K♦')!, jack = findCard(s, 'J♠')!;
  assert.equal(zoneOf(s, 'K♦'), 'er-0', 'the Anchor is controlled by the Jacker — it lives in their ER');
  assert.equal(host.owner, 1, 'ownership stays with the original owner');
  assert.equal(jack.hostId, host.id);
  assert.equal(zoneOf(s, 'J♠'), 'att-0', 'the Jack is still an attachment record, not an ER occupant');
  assert.equal(s.players[0]!.er.length, 1, 'the ER holds only its true Anchor');
  // Guard moves with a Jacked Queen.
  s = fixture({ profile: 'intrilex-full', hands: [['J♠', '10♦'], NO], er: [[], ['Q♦']] });
  s = passAll(effect(s, 0, 'J♠', 'attach-er', 'Q♦'));
  assert.ok(guarded(s, 0), 'the Jacked Queen Guards its new controller');
  assert.ok(!guarded(s, 1), 'the original owner loses the Guard');
  // A Jacked host is not a legal target for another Jack of either mode.
  s = fixture({ profile: 'intrilex-full', active: 1, hands: [['10♦'], ['J♥', ...NO5]], pr: [['9♠'], []], er: [[{ card: 'J♣', host: 'K♦' }, 'K♦'], []] });
  const jacks = legal(s, 1).filter(a => a.mode?.startsWith('attach'));
  assert.deepEqual(jacks.map(a => a.targetId), [id(s, '9♠')], 'the Jacked Anchor is protected from re-Jacking');
});

/** TEST E: host leaves PR → sever, modifier and control resolved, no orphan. */
test('§12 severing: a leaving host scraps the Jack; a purged ER host scraps the J♠', () => {
  let s = fixture({ active: 1, hands: [['10♦'], ['K♣', ...NO5]], pr: [['9♦'], []], er: [[{ card: 'J♣', host: '9♦' }], []] });
  assert.equal(score(s, 0), 10);
  s = passAll(act(s, 1, a => a.type === 'scuttle' && a.targetId === id(s, '9♦')));
  assert.equal(zoneOf(s, '9♦'), 'gy');
  assert.equal(zoneOf(s, 'J♣'), 'gy', 'a severed Jack is Scrapped — never an inactive ER occupant');
  assert.equal(s.players[0]!.attachments!.length, 0);
  assert.equal(s.players[0]!.er.length, 0, 'no phantom attachment remains');
  assert.equal(score(s, 0), 0, 'the +1 modifier is gone with the host');
  // Removing the Jack itself returns the host to its owner.
  s = fixture({ active: 1, hands: [['10♦'], ['3♥', ...NO5]], pr: [['9♦'], []], er: [[{ card: 'J♣', host: '9♦' }], []] });
  s = passAll(effect(s, 1, '3♥', 'bounce-top', 'J♣'));
  assert.equal(zoneOf(s, '9♦'), 'pr-1', 'the host returns to its original owner');
  assert.equal(zoneOf(s, 'J♣'), 'deck-0');
  assert.equal(s.players[0]!.attachments!.length, 0);
  // Purge a J♠ host: the Anchor leaves ER and the Jack severs.
  s = fixture({ profile: 'intrilex-full', active: 1, hands: [['10♦'], ['A♦', ...NO5]], er: [[{ card: 'J♠', host: 'K♦' }, 'K♦'], []] });
  s = passAll(effect(s, 1, 'A♦', 'purge', 'K♦'));
  assert.equal(zoneOf(s, 'K♦'), 'hand-1');
  assert.equal(zoneOf(s, 'J♠'), 'gy', 'the J♠ is severed and Scrapped');
  assert.equal(s.players[0]!.attachments!.length, 0);
  assert.equal(s.players[0]!.er.length, 0);
});

/** TEST F: serialization round-trips the relationship; legacy er-carried Jacks migrate. */
test('save/load: the attachment registry survives JSON and pre-registry payloads migrate', () => {
  let s = fixture({ hands: [['J♥', '10♦'], NO], pr: [[], ['6♥']] });
  s = passAll(effect(s, 0, 'J♥', 'attach', '6♥'));
  const hostId = s.players[0]!.attachments![0]!.hostId!;
  const restored = normalizeGameState(JSON.parse(JSON.stringify(s)) as GameState);
  assertGameIntegrity(restored);
  assert.equal(restored.players[0]!.attachments![0]!.hostId, hostId);
  assert.equal(score(restored, 0), 7);
  // A pre-registry payload still carries the Jack inside `er`.
  const legacy = JSON.parse(JSON.stringify(s)) as GameState;
  legacy.players[0]!.er.push(...legacy.players[0]!.attachments!);
  delete legacy.players[0]!.attachments;
  normalizeGameState(legacy);
  assertGameIntegrity(legacy);
  assert.equal(legacy.players[0]!.er.length, 0, 'the migrated Jack leaves ER');
  assert.equal(legacy.players[0]!.attachments![0]!.hostId, hostId, 'the relationship survives migration');
  assert.equal(score(legacy, 0), 7, 'the +1 survives migration');
});

/** TEST G: applying the action is pure and deterministic — identical replays, untouched input. */
test('attach resolution is deterministic: replaying reproduces zones, control and score exactly', () => {
  const s0 = fixture({ hands: [['J♥', '10♦'], NO], pr: [[], ['6♥']] });
  const attach = legal(s0, 0).find(a => a.mode === 'attach')!;
  const a = passAll(applyGame(s0, 0, attach, seeded(5)));
  const b = passAll(applyGame(s0, 0, attach, seeded(5)));
  assert.deepEqual(a, b);
  assert.equal(zoneOf(s0, '6♥'), 'pr-1', 'applyGame never mutates its input');
  assert.equal(s0.players[0]!.attachments!.length, 0);
  assert.equal(s0.players[0]!.er.length, 0);
});

/** TEST H: projections and AI-style consumers see the attachment, never an ER phantom. */
test('projected views and simulations carry attachments without ER occupancy', () => {
  let s = fixture({ hands: [['J♥', '10♦'], NO], pr: [[], ['6♥']] });
  s = passAll(effect(s, 0, 'J♥', 'attach', '6♥'));
  const jackId = s.players[0]!.attachments![0]!.id;
  for (const seat of [0, 1, null] as const) {
    const v = projectGame(s, seat);
    assert.equal(v.players[0]!.er.length, 0, `no ER phantom for seat ${seat}`);
    assert.deepEqual(v.players[0]!.attachments.map(c => c.id), [jackId]);
    assert.equal(v.players[0]!.score, 7);
  }
  // Simulation-style copies preserve the registry and pass integrity.
  const sim = structuredClone(s);
  assertGameIntegrity(sim);
  assert.equal(sim.players[0]!.attachments![0]!.hostId, s.players[0]!.pr[0]!.id);
  // The solo bot works off the projected view; attachments are visible to its evaluation.
  const botView = projectGame(s, 1);
  const pick = chooseBotAction(botView);
  assert.ok(!pick || botView.legalActions.includes(pick));
});

/** Invariants: every attachment has exactly one host inside the controller's own rows. */
test('assertGameIntegrity rejects ER-carried Jacks and orphaned attachments', () => {
  let s = fixture({ hands: [['J♥', '10♦'], NO], pr: [[], ['6♥']] });
  s = passAll(effect(s, 0, 'J♥', 'attach', '6♥'));
  const dirty = JSON.parse(JSON.stringify(s)) as GameState;
  dirty.players[0]!.er.push(...dirty.players[0]!.attachments!);
  delete dirty.players[0]!.attachments;
  assert.throws(() => assertGameIntegrity(dirty), /ER|occupies/i, 'a Jack in ER violates the invariant');
  const orphan = JSON.parse(JSON.stringify(s)) as GameState;
  orphan.players[0]!.attachments![0]!.hostId = 'missing';
  assert.throws(() => assertGameIntegrity(orphan), /Dangling Jack/);
  // availableActions is also safe on un-migrated payloads (tolerant reads).
  const legalOnLegacy = availableActions(structuredClone(dirty), 0);
  assert.ok(Array.isArray(legalOnLegacy));
});
