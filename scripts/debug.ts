import { fixture, availableActions, applyGame, seeded, type GameState } from '../packages/intrilex/index.js';
const r = seeded(1);
const doA = (s: GameState, p: number, f: (a: { type: string; mode?: string; label: string }) => boolean) => applyGame(s, p, availableActions(s, p).find(f)!, r);
let s = fixture({ hands: [['BJ', '6♦', '10♦'], ['3♦', '9♥', 'A♥', '6♣', '10♣', '4♥']], pr: [['4♠'], ['8♦', '7♣']] });
s = doA(s, 0, a => a.mode === 'board-lock');
console.log(s.turn, s.boardLock, s.stack.length, s.priority, availableActions(s, s.priority).map(a => a.label));
