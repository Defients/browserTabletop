import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyGame, assertGameIntegrity, availableActions, chooseBotAction, createGame, projectGame, seeded, type GameState } from '../packages/intrilex/index.js';

function playOut(seed: number, policy: 'bot' | 'random') {
  const random = seeded(seed);
  let s: GameState = createGame({ random });
  let moves = 0;
  while (s.winner === null) {
    const actors = [0, 1].filter(p => availableActions(s, p).length);
    assert.equal(actors.length, 1, 'exactly one player has a decision at any time');
    const p = actors[0]!;
    const view = projectGame(s, p);
    const a = policy === 'bot' ? chooseBotAction(view)! : view.legalActions[Math.floor(random() * view.legalActions.length)]!;
    assert.ok(view.legalActions.includes(a), 'the opponent only returns listed legal actions');
    s = applyGame(s, p, a, random);
    assertGameIntegrity(s);
    assert.ok(++moves < 3000, `seed ${seed} terminates`);
  }
  return { s, moves };
}

test('solo opponent: 150 bot-vs-bot games finish using only legal actions', () => {
  const winners = [0, 0, 0];
  for (let seed = 1; seed <= 150; seed++) { const { s } = playOut(seed, 'bot'); winners[s.winner === 'draw' ? 2 : s.winner as number]!++; }
  assert.ok(winners[0]! > 20 && winners[1]! > 20, `both seats win sometimes: ${winners}`);
});

test('rules fuzz: 250 games of uniformly random legal actions keep all invariants and terminate', () => {
  for (let seed = 1000; seed < 1250; seed++) playOut(seed, 'random');
});

test('solo opponent sees only its own projection: opponent hand and DP order are absent from its input', () => {
  const s = createGame({ random: seeded(9) });
  const view = projectGame(s, 1);
  const text = JSON.stringify(view);
  for (const c of [...s.players[0]!.hand, ...s.deck]) assert.ok(!text.includes(c.id));
  // Same public information, different hidden human hand: the bot's choice cannot depend on it.
  const other = structuredClone(s);
  [other.players[0]!.hand, other.deck] = [other.deck.slice(0, 5), [...other.players[0]!.hand, ...other.deck.slice(5)]];
  assert.deepEqual(chooseBotAction(projectGame(other, 1)), chooseBotAction(view));
});

test('solo opponent handles response windows and choices', () => {
  let seen = { decline: 0, counter: 0, choose: 0 };
  for (let seed = 1; seed <= 60; seed++) {
    const random = seeded(seed);
    let s = createGame({ random });
    while (s.winner === null) {
      const p = [0, 1].find(x => availableActions(s, x).length)!;
      const a = chooseBotAction(projectGame(s, p))!;
      if (a.type in seen) seen = { ...seen, [a.type]: seen[a.type as keyof typeof seen] + 1 };
      s = applyGame(s, p, a, random);
    }
  }
  assert.ok(seen.decline > 0 && seen.choose > 0, JSON.stringify(seen));
});
