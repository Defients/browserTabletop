import type { GameAction, GameCard, GameView } from './types.js';
import { pointValue } from './engine.js';

/**
 * Modest solo opponent. It receives only its own projected view (never the full state), so it cannot
 * see the human's hand or the Draw Pile order, and it only ever returns one of `view.legalActions`.
 */
export function chooseBotAction(view: GameView): GameAction | null {
  const actions = view.legalActions;
  if (!actions.length || view.you === null) return null;
  const me = view.you;
  const known = new Map<string, GameCard>();
  for (const c of [...view.hand, ...view.graveyard, ...(view.choice?.cards ?? []), ...view.players.flatMap(p => [...p.pr, ...p.er])]) known.set(c.id, c);
  const value = (id?: string) => { const c = id ? known.get(id) : undefined; return c ? pointValue(c) : 0; };
  const byValue = (list: GameAction[], dir: 1 | -1) => list.slice().sort((a, b) => dir * (value(a.cardId) - value(b.cardId)))[0];
  const first = (type: GameAction['type'], mode?: string) => actions.find(a => a.type === type && (mode === undefined || a.mode === mode));

  if (view.choice && view.choice.player === me) {
    const k = view.choice.kind;
    if (k === 'discard' || k === 'present') return byValue(actions, 1)!;
    if (k === 'generated') return first('choose', 'generated-score') ?? actions[0]!;
    if (k === 'dig-mode') return byValue(actions.filter(a => a.mode === 'dig-bottom'), 1) ?? byValue(actions, 1)!;
    if (k === 'natural-draw') return first('choose', 'draw') ?? actions[0]!;
    if (k === 'seven-single') return first('choose', 'take') ?? actions[0]!;
    if (k === 'eight-reward') return actions[0]!;
    return byValue(actions, -1)!;
  }
  if (view.pending.length) {
    const enemyTop = [...view.pending].reverse().find(i => i.player !== me);
    const counter = enemyTop && actions.find(a => a.type === 'counter' && a.targetId === enemyTop.id);
    if (counter && enemyTop && enemyTop.cls !== 'action') return counter;
    return first('decline') ?? actions[0]!;
  }
  const mine = view.players[me]!;
  const goal = mine.goal;
  const scores = actions.filter(a => a.type === 'score');
  const winning = scores.find(a => mine.score + value(a.cardId) >= goal);
  if (winning) return winning;
  const quick2 = first('effect', 'quick2');
  if (quick2 && view.miniTurns > 0) return quick2;
  const scuttles = actions.filter(a => a.type === 'scuttle' && value(a.targetId) >= value(a.cardId));
  if (scuttles.length) return scuttles.sort((a, b) => value(b.targetId) - value(a.targetId))[0]!;
  const attach = actions.find(a => a.mode === 'attach');
  if (attach && value(attach.targetId) >= 6) return attach;
  const queen = actions.find(a => a.mode === 'anchor-Q') ;
  if (queen && !mine.guard && view.players[1 - me]!.pr.length) return queen;
  if (scores.length && (view.hand.length > 2 || view.deckCount === 0)) return byValue(scores, -1)!;
  return first('draw') ?? (scores.length ? byValue(scores, -1)! : undefined) ?? first('end') ?? first('exhausted-pass') ?? actions.find(a => a.type !== 'effect' || a.mode !== 'board-lock') ?? actions[0]!;
}
