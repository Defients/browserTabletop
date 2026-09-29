import type { GameAction, GameCard, GameView } from './types.js';
import { pointValue } from './engine.js';
import { actionKey } from './actionIdentity.js';
import { RULES } from './rules.js';

export interface SuggestedMove { rank: 1 | 2; action: GameAction; key: string; label: string; explanation: string; score: number }

/** Integer policy: winning End 10000; potential Goal contribution +1000; known utility in
 * tens/low hundreds; unsupported modes 0. Equal scores retain legal enumeration order.
 * Only the projected evidence is used; this is advice, not search or hidden-state prediction. */
export function rankSuggestedMoves(view: GameView): SuggestedMove[] {
  if (view.you === null || view.winner !== null || !view.legalActions.length) return [];
  const me = view.players[view.you], enemy = view.players[1 - view.you];
  if (!me || !enemy) return [];
  const known = new Map<string, GameCard>();
  for (const c of [...view.hand, ...view.players.flatMap(p => [...p.pr, ...p.er, ...(p.revealedHand ?? [])]), ...view.graveyard, ...(view.exile ?? []),
    ...(view.swapBar ?? []).flatMap(s => s.card ? [s.card] : []), ...view.pending.flatMap(p => [...(p.card ? [p.card] : []), ...(p.cards ?? [])]), ...(view.choice?.cards ?? [])]) known.set(c.id, c);
  const value = (id?: string) => { const c = id ? known.get(id) : undefined; return c ? pointValue(c) : 0; };
  const secured = new Map<string, number>();
  for (const p of view.players) {
    const jackBonuses = new Map<string, number>();
    for (const j of p.er) if (j.rank === 'J' && j.hostId && !j.tapped) jackBonuses.set(j.hostId, 1);
    for (const c of p.pr) secured.set(c.id, c.tapped ? 0 : pointValue(c) + (jackBonuses.get(c.id) ?? 0));
  }
  const enemyPr = new Set(enemy.pr.map(c => c.id));
  const pending = new Map(view.pending.map(p => [p.id, p]));
  const visibleSwaps = new Map((view.swapBar ?? []).map(s => [String(s.slot), s.card]));
  const scored = (a: GameAction): { score: number; explanation: string } => {
    const gain = value(a.cardId);
    if (a.type === 'end') return { score: me.score >= me.goal ? 10000 : 5, explanation: me.score >= me.goal ? 'Your secured Points meet your Goal. Ending performs the End Phase victory check (§1; §4.5).' : 'Complete this Full Turn and perform its End Phase checks (§4.5).' };
    if ((a.type === 'score' || a.type === 'choose' && a.mode === 'generated-score') && a.cardId && known.has(a.cardId)) return { score: 60 + 5 * gain + (me.score + gain >= me.goal ? 1000 : 0), explanation: `Adds ${gain} known Points if it resolves${me.score + gain >= me.goal ? ', reaching the current Goal' : ''}; victory checks at End Phase (§8; §4.5).` };
    if (a.type === 'effect' && a.mode === 'quick2') return { score: 85 + (enemy.handCount ? 12 : 0) + (me.score + 2 >= me.goal ? 1000 : 0), explanation: `Adds 2 Points without spending a Mini-Turn${enemy.handCount ? '; the opponent chooses a discard' : ''}, if it resolves. It can be answered; victory checks at End (§26 Two).` };
    if (a.type === 'scuttle' && a.mode === undefined && a.cardId && known.has(a.cardId) && a.targetId && enemyPr.has(a.targetId)) {
      const removed = secured.get(a.targetId) ?? 0;
      return { score: 35 + 9 * removed - 3 * gain, explanation: `Attempts to remove ${removed} currently secured enemy Points, spending a ${gain}-point source. Guard does not block Scuttle; resolution can be answered (§19).` };
    }
    if (a.type === 'effect' && a.mode === 'attach' && a.targetId && enemyPr.has(a.targetId)) {
      const removed = secured.get(a.targetId) ?? 0, target = known.get(a.targetId);
      const added = target?.tapped ? 0 : value(a.targetId) + 1;
      return { score: 45 + 7 * removed + 4 * added - 2 * gain, explanation: `Attempts to take control of a public PR card worth ${removed} secured enemy Points; an active attached Jack adds +1. A tapped host still scores 0; the play can be answered (§12; §26 Jack).` };
    }
    if (a.type === 'effect' && a.mode === 'tap' && a.targetId && enemyPr.has(a.targetId)) {
      const removed = secured.get(a.targetId) ?? 0;
      return { score: 30 + 7 * removed + (enemy.score >= enemy.goal && removed ? 55 : 0) - 2 * gain, explanation: `Attempts to temporarily reduce enemy secured Points by ${removed} through tapping; this does not remove the card (§9; §26 Nine).` };
    }
    if (a.type === 'effect' && a.mode === 'anchor-Q') return { score: !me.guard && me.pr.length + me.er.length > 0 ? 65 : 10, explanation: 'An untapped Queen Anchor provides Guard against applicable enemy single-target Effects. Guard does not block Scuttle (§13; §26 Queen).' };
    if (a.type === 'counter' && (a.mode === 'counter' || a.mode === 'anchor-counter' || a.mode === 'exile-counter')) {
      const target = a.targetId ? pending.get(a.targetId) : undefined;
      if (target && target.player !== view.you) return { score: 45 + (target.cls === 'effect' || target.cls === 'counter' ? 20 : 5) - 3 * gain, explanation: `Attempts to negate an opponent's public pending ${target.cls}, spending its response source. No private target benefit is assumed (§7).` };
    }
    if (a.type === 'decline') return { score: 20, explanation: 'Preserve response cards and decline this response opportunity; no Action is spent (§6).' };
    if (a.type === 'choose' && a.cardId && known.has(a.cardId) && (view.choice?.kind === 'discard' || view.choice?.kind === 'present' || a.mode === 'dig-discard')) return { score: 30 - 3 * gain, explanation: `Offers a ${gain}-point card for the required choice. Lower point opportunity cost is useful evidence, not a complete measure of strategic value (§26).` };
    if (a.type === 'choose' && a.cardId && known.has(a.cardId) && ['raid-take', 'recycle', 'seven-hand', 'seven-score'].includes(view.choice?.kind ?? '') && a.mode === 'select') return { score: 30 + 3 * gain, explanation: `Take the visible ${gain}-point card into hand for future legal uses; no unseen cards are evaluated (§26).` };
    if (a.type === 'choose' && view.choice?.kind === 'eight-reward' && (a.mode === 'top' || a.mode === 'bottom')) {
      const c = a.mode === 'top' ? view.graveyard.at(-1) : view.graveyard[0];
      if (c) return { score: 30 + 3 * pointValue(c), explanation: 'Take the selected visible Graveyard card into hand as the Eight Scuttle reward (§26 Eight).' };
    }
    if (a.type === 'draw') return { score: 35 + (view.hand.length < 3 ? 20 : 0), explanation: `Draw from the ${view.deckCount}-card Draw Pile${view.hand.length === 0 ? '; an empty hand draws 2' : ''}. The hidden result is unknown (§4.3).` };
    if (a.type === 'swap-draw') {
      const offered = a.mode !== undefined ? visibleSwaps.get(a.mode) : undefined;
      return { score: 25 + (offered ? 4 * pointValue(offered) : 0), explanation: offered ? `Take the public ${pointValue(offered)}-point Swap Bar card, spending a Mini-Turn and the once-per-turn Swap use (§18).` : 'Use the listed legal Swap Bar draw. No unknown offered card is evaluated (§18).' };
    }
    if (a.type === 'swap-down' || a.type === 'draw-cast') return { score: 0, explanation: 'A legal way to access a hidden card. Its identity and benefit are unknown; the listed cost still applies (§18; §26).' };
    if (a.type === 'start-action') return { score: 5, explanation: 'Finish the Start Phase and enter the Action Phase (§4.1).' };
    if (a.type === 'exhausted-pass') return { score: 5, explanation: 'Resolve the forced Exhausted Pass; no other ordinary Action is available (§22).' };
    if (a.type === 'choose' && a.mode === 'generated-scrap') return { score: 5, explanation: 'Scrap the generated card because no legal effect is available (§26).' };
    if (a.type === 'choose' && a.mode === 'full-pass') return { score: 5, explanation: 'Continue the required rules resolution with this legal choice.' };
    return { score: 0, explanation: `A legal option for this decision; advanced effects are not evaluated${RULES[a.ruleRef] ? ` (${RULES[a.ruleRef]!.ref})` : ''}.` };
  };
  const seen = new Set<string>();
  const best: Omit<SuggestedMove, 'rank'>[] = [];
  for (const action of view.legalActions) {
    const key = actionKey(action);
    if (seen.has(key)) continue;
    seen.add(key);
    const item = { action, key, label: action.label, ...scored(action) };
    const index = best.findIndex(x => item.score > x.score);
    if (index < 0) best.push(item); else best.splice(index, 0, item);
    if (best.length > 2) best.pop();
  }
  return best.map((item, i) => ({ ...item, rank: i === 0 ? 1 : 2 }));
}
