import assert from 'node:assert/strict';
import { applyGame, assertGameIntegrity, availableActions, findCard, seeded, type GameAction, type GameState } from '../../packages/intrilex/index.js';

export const rng = seeded(777);
export const id = (s: GameState, card: string) => { const c = findCard(s, card); assert.ok(c, `card ${card} not found`); return c!.id; };
export const legal = (s: GameState, p: number) => availableActions(s, p);
export const has = (s: GameState, p: number, pred: (a: GameAction) => boolean) => legal(s, p).some(pred);

/** Apply the unique legal action matching `pred` (fails loudly if none). */
export function act(s: GameState, p: number, pred: (a: GameAction) => boolean, why = 'expected legal action'): GameState {
  const a = legal(s, p).find(pred);
  assert.ok(a, `${why}; legal were:\n  ${legal(s, p).map(x => x.label).join('\n  ') || '(none)'}`);
  const next = applyGame(s, p, a!, rng);
  assertGameIntegrity(next);
  return next;
}
export const play = (s: GameState, p: number, type: GameAction['type'], card?: string, extra: Partial<GameAction> = {}) =>
  act(s, p, a => a.type === type && (card === undefined || a.cardId === id(s, card)) && Object.entries(extra).every(([k, v]) => a[k as keyof GameAction] === v), `${type} ${card ?? ''} ${JSON.stringify(extra)}`);
export const effect = (s: GameState, p: number, card: string, mode: string, target?: string) =>
  act(s, p, a => a.type === 'effect' && a.cardId === id(s, card) && a.mode === mode && (target === undefined || a.targetId === id(s, target)), `effect ${card} ${mode} ${target ?? ''}`);
export const choose = (s: GameState, p: number, mode: string, card?: string) =>
  act(s, p, a => a.type === 'choose' && a.mode === mode && (card === undefined || a.cardId === id(s, card)), `choose ${mode} ${card ?? ''}`);

/** Decline for whoever holds priority until the stack empties or a choice is needed. */
export function passAll(s: GameState): GameState {
  for (let i = 0; i < 50 && s.stack.length && !s.choice && s.winner === null; i++) s = act(s, s.priority, a => a.type === 'decline', 'decline');
  return s;
}
export const zoneOf = (s: GameState, card: string): string => {
  const c = findCard(s, card)!;
  for (let p = 0; p < 2; p++) for (const z of ['hand', 'pr', 'er'] as const) if (s.players[p]![z].includes(c)) return `${z}-${p}`;
  if (s.deck.includes(c)) return `deck-${s.deck.indexOf(c)}`;
  if (s.graveyard.includes(c)) return 'gy';
  return 'elsewhere';
};
