import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyLogLine, parseLogEntry, tokenizeLogLine, type LogKind } from '../apps/web/logModel.js';

/** Real history lines the engine can produce (packages/intrilex/engine.ts), mapped to their semantic kind. */
const KIND_CASES: [string, LogKind][] = [
  ['Turn 7: Player 2.', 'turn'],
  ['First Contact: 54 cards, Goal 15. Player 1 is Player A (5 cards) and goes first; Player 2 has 6.', 'setup'],
  ['Intrilex Full: 54 cards, Goal 21. Player 2 is Player A (5 cards) and goes first; Player 1 has 6. Swap Bar: two face-down, one face-up.', 'setup'],
  ['Teaching position loaded (fixed deal).', 'setup'],
  ['Player 2 wins at End Phase with 16 secured Points (Goal 15).', 'win'],
  ['Exhausted counter reaches 0 — the game is drawn.', 'win'],
  ['Countered: Scuttle 5♠ with 9♥.', 'denied'],
  ['5♣ · Counter “9♥ · Quick: score 2, opponent discards 1” fizzles: its target is gone.', 'denied'],
  ['Scuttle fizzles: the target is no longer legal.', 'denied'],
  ['Player 1: 8♣ · Counter “5♥ · Instant: opponent Goal +2”', 'counter'],
  ['Player 1: A♠ · Sacrifice Anchor Ace to counter “3♦ · Instant: bounce to top of DP → 4♠”', 'counter'],
  ['Player 1 Scuttles 8♦ with 10♠.', 'scuttle'],
  ['Player 1 absolute-Scuttles 8♥.', 'scuttle'],
  ['Player 1 free-Scuttles 8♥.', 'scuttle'],
  ['Board Lock is active: no non-counter Effects or Scuttles.', 'major'],
  ['Board Lock ends.', 'major'],
  ['Player 1 activates Sudden Death.', 'major'],
  ['Red Joker: the players exchange hands.', 'major'],
  ['Red Joker: DP and GY are shuffled together (46 cards); Player 1 draws 2.', 'major'],
  ['The Draw Pile is empty at Start: Exhausted begins (counter 3).', 'major'],
  ['Cards entered the Draw Pile: Exhausted ends.', 'major'],
  ['Total Clear: 5♠, 6♥.', 'major'],
  ['5♥ was the Ultra Black score.', 'major'],
  ['4♠ is Exiled (Ultra Black).', 'major'],
  ['Player 1 commandeers Q♥ into their Point Row.', 'steal'],
  ['Player 1 exchanges Point Rows with Player 2.', 'steal'],
  ['Player 1 steals “5♠ · Instant” into hand (Stack Theft).', 'steal'],
  ['Player 1 takes the countered 5♠ into hand.', 'steal'],
  ['4♦ returns to Player 2\'s hand.', 'steal'],
  ['Player 1 rummages 7♦ from Exile.', 'exile'],
  ['Player 1 recovers 8♣ from Exile.', 'exile'],
  ['Player 1 moves 3♠ from Exile to the top of DP.', 'exile'],
  ['Player 2\'s draw is disrupted for this turn; Player 1 draws 1.', 'warn'],
  ['Player 2 takes the forced Exhausted Pass.', 'warn'],
  ['Player 1 skips the Foundation bonus.', 'warn'],
  ['Peek: no face-down Swap Bar cards.', 'warn'],
  ['Nothing could be cleared.', 'warn'],
  ['Player 1 scraps the generated 5♠: no legal declaration.', 'warn'],
  ['Player 1 has no Exile card to rummage (Mixed Ultra).', 'warn'],
  ['Player 1 begins the Action Phase.', 'phase'],
  ['Player 1: 5♠ · Instant: opponent Goal +2, then you discard 1.', 'effect'],
  ['Player 1 (generated): 9♦ · Nine Anchor: reveal hand, opponent discards 1.', 'effect'],
  ['K♠ · Draw 2, then return 1 or discard 1 resolves.', 'effect'],
  ['Player 1 casts the held 2♠ (Instant).', 'effect'],
  ['Player 1 shields their Point Row (Aegis Field).', 'effect'],
  ['Player 1 plays 5♠ for Points.', 'score'],
  ['5♠ enters Player 1\'s Point Row (16 secured).', 'score'],
  ['Player 1 scores 5♠ via Foundation.', 'score'],
  ['Player 1 scores the generated 5♠.', 'score'],
  ['Player 2\'s Goal rises to 18.', 'score'],
  ['Player 2\'s Goal rises to 21; Player 1\'s Goal falls to 15.', 'score'],
  ['Player 1 draws 2 cards.', 'draw'],
  ['Player 1 draws and reveals 4♥ (Draw & Cast).', 'draw'],
  ['Player 1 digs 3 cards.', 'draw'],
  ['Player 1 super-digs 5 cards.', 'draw'],
  ['Player 1 declares Draw.', 'draw'],
  ['Player 1 draws the bottom of GY (countered 3 Red rider).', 'draw'],
  ['Player 1 discards 2 and draws 3.', 'draw'],
  ['Player 2\'s hand is revealed: 3♠, 4♥.', 'reveal'],
  ['Seven trigger reveals 3♠ and 4♥.', 'reveal'],
  ['Player 1 presents 3♠, 4♥, 5♦.', 'reveal'],
  ['Player 1 takes a Voltage 9 snapshot.', 'reveal'],
  ['Player 1 reorders the top of the Draw Pile.', 'reveal'],
  ['Player 1 discards 4♣.', 'discard'],
  ['Player 1\'s previous Nine Anchor is Scrapped.', 'discard'],
  ['Player 1\'s Jack lost its host and is Scrapped.', 'discard'],
  ['Milled 4♠, 5♥.', 'discard'],
  ['Cleared 5♠.', 'discard'],
  ['Super Recycle mills 3♠.', 'discard'],
  ['Player 1 purges the Aegised 5♠.', 'discard'],
  ['Player 1 keeps the dug cards and discards 4♠.', 'discard'],
  ['Q♥ enters Player 1\'s Enduring Row — Guard and Aegis are active.', 'anchor'],
  ['Player 1 anchors K♠ and Q♥ via Royal Marriage — K♠ Anchor value 9.', 'anchor'],
  ['Player 1 Jacks 5♠ (+1 Point while attached).', 'anchor'],
  ['Player 1 takes 5♠.', 'action'],
  ['Player 1 takes a face-down Swap Bar card and returns 3♥ face-up.', 'action'],
  ['Player 1 declares 7♠ as a generated play; the rest return to the top of DP.', 'action'],
  ['A log line that matches nothing known.', 'system'],
];

test('history lines classify into their intended semantic kinds', () => {
  for (const [line, kind] of KIND_CASES) assert.equal(classifyLogLine(line), kind, line);
});

test('tokenization round-trips every history line and tags players, cards and values', () => {
  for (const [line] of KIND_CASES) {
    const tokens = tokenizeLogLine(line);
    assert.equal(tokens.map(t => t.text).join(''), line, `reconstruct ${line}`);
  }
  const scored = tokenizeLogLine('Player 1 plays 5♠ for Points.');
  assert.deepEqual(scored[0], { type: 'player', text: 'Player 1', seat: 0 });
  assert.deepEqual(scored[2], { type: 'card', text: '5♠', tone: 'black' });
  const drawn = tokenizeLogLine('Player 2 draws 2 cards.');
  assert.deepEqual(drawn[0], { type: 'player', text: 'Player 2', seat: 1 });
  assert.deepEqual(drawn[2], { type: 'value', text: '2' });
});

test('card tokens carry suit tone and multi-character ranks are not split into values', () => {
  const tokens = tokenizeLogLine('Player 1 plays 10♠ for Points.');
  const card = tokens.find(t => t.type === 'card');
  assert.deepEqual(card, { type: 'card', text: '10♠', tone: 'black' });
  assert.ok(!tokens.some(t => t.type === 'value' && t.text === '10'));
  const red = tokenizeLogLine('Player 1 plays 9♥ and Q♦.');
  assert.deepEqual(red.filter(t => t.type === 'card').map(t => t.tone), ['red', 'red']);
  const jokers = tokenizeLogLine('Red Joker and Black Joker.');
  assert.deepEqual(jokers.filter(t => t.type === 'card').map(t => t.tone), ['joker-red', 'joker-black']);
});

test('turn boundaries expose the turn number and acting seat', () => {
  const e = parseLogEntry('Turn 12: Player 1.');
  assert.equal(e.kind, 'turn');
  assert.equal(e.turn, 12);
  assert.equal(e.actor, 0);
});

test('actor reflects the leading player; unattributed and possessive-open lines behave', () => {
  assert.equal(parseLogEntry('Player 2 draws 1 card.').actor, 1);
  assert.equal(parseLogEntry('Player 2\'s hand is revealed: 3♠.').actor, 1);
  assert.equal(parseLogEntry('Nothing could be cleared.').actor, null);
});

test('unknown and empty lines degrade safely to neutral system entries', () => {
  assert.equal(classifyLogLine(''), 'system');
  const e = parseLogEntry('Entirely foreign prose with no players or cards.');
  assert.equal(e.kind, 'system');
  assert.equal(e.tokens.map(t => t.text).join(''), e.text);
  assert.equal(e.actor, null);
});
