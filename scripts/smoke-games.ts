import { createGame, applyGame, projectGame, chooseBotAction, assertGameIntegrity, seeded } from '../packages/intrilex/index.js';

const games = Number(process.argv[2] ?? 200);
const wins = [0, 0, 0];
let maxTurns = 0, maxMoves = 0;
for (let seed = 1; seed <= games; seed++) {
  const random = seeded(seed);
  let s = createGame({ random });
  let moves = 0;
  while (s.winner === null) {
    const p = [0, 1].find(x => projectGame(s, x).legalActions.length);
    if (p === undefined) throw new Error(`Seed ${seed}: no player can act (turn ${s.turn})`);
    const legal = projectGame(s, p).legalActions;
    const a = process.argv[3] === 'random' ? legal[Math.floor(random() * legal.length)]! : chooseBotAction(projectGame(s, p))!;
    s = applyGame(s, p, a, random);
    assertGameIntegrity(s);
    if (++moves > 5000) throw new Error(`Seed ${seed}: game did not finish`);
  }
  wins[s.winner === 'draw' ? 2 : s.winner]!++;
  maxTurns = Math.max(maxTurns, s.turn); maxMoves = Math.max(maxMoves, moves);
}
console.log({ games, wins, maxTurns, maxMoves });
