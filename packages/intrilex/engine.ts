import type {
  ActionType, Choice, ChoiceKind, GameAction, GameCard, GameEvent, GameState, GameView, MiniTurnType, PendingClass,
  Random, Rank, StackItem, Suit,
} from './types.js';
import { RULES } from './rules.js';

/**
 * Intrilex v4.3.1 First Contact (§27, Canonical §15) traced through the generic rank rules it enables.
 * Pure and immutable at the boundary: `applyGame` never mutates its input.
 * Source map: docs/INTRILEX_SOURCE_MAP.md. Rule IDs: ./rules.ts.
 */

export const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'RJ', 'BJ'];
export const SUITS: Suit[] = ['♣', '♦', '♥', '♠'];
const POINTS: Record<Rank, number> = { A: 4, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10, J: 3, Q: 2, K: 8, RJ: 5, BJ: 11 };
export const GOAL = 15;

export class GameError extends Error { constructor(public code: string, message: string) { super(message); } }
const fail = (code: string, message: string): never => { throw new GameError(code, message); };

export const pointValue = (c: Pick<GameCard, 'rank'>) => POINTS[c.rank];
export const cardName = (c: Pick<GameCard, 'rank' | 'suit'>) => (c.rank === 'RJ' ? 'Red Joker' : c.rank === 'BJ' ? 'Black Joker' : `${c.rank}${c.suit}`);
export const opp = (p: number) => 1 - p;

export function secureRandom(): number {
  const a = new Uint32Array(2);
  globalThis.crypto.getRandomValues(a);
  return (a[0]! * 2 ** 21 + (a[1]! >>> 11)) / 2 ** 53;
}
export function shuffle<T>(a: T[], random: Random): T[] {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.min(i, Math.floor(random() * (i + 1))); [a[i], a[j]] = [a[j]!, a[i]!]; }
  return a;
}

interface G { s: GameState; random: Random }

// ---------------------------------------------------------------- card bookkeeping

/** Every physical card, wherever it currently is (including cards held on the stack or by a choice). */
export function everyCard(s: GameState): GameCard[] {
  return [
    ...s.players.flatMap(p => [...p.hand, ...p.pr, ...p.er]), ...s.deck, ...s.graveyard,
    ...s.stack.flatMap(i => (i.card ? [i.card] : [])), ...(s.choice?.held ? s.choice.cards : []), ...s.suspended.map(x => x.card),
  ];
}

function newId(g: G): string {
  const taken = new Set(everyCard(g.s).map(c => c.id));
  for (;;) {
    const id = 'k' + Math.floor(g.random() * 2 ** 30).toString(36).padStart(6, '0') + Math.floor(g.random() * 2 ** 30).toString(36).padStart(6, '0');
    if (!taken.has(id)) return id;
  }
}
const clean = (c: GameCard) => { delete c.tapped; delete c.hostId; c.owner = -1; };
function toHand(g: G, p: number, c: GameCard) { clean(c); c.id = newId(g); g.s.players[p]!.hand.push(c); }
function toDeck(g: G, c: GameCard, where: 'top' | 'bottom') { clean(c); c.id = newId(g); if (where === 'top') g.s.deck.unshift(c); else g.s.deck.push(c); }
function toGraveyard(g: G, c: GameCard) { clean(c); g.s.graveyard.push(c); }
function takeFromHand(g: G, p: number, id: string | undefined): GameCard {
  const hand = g.s.players[p]!.hand;
  const i = hand.findIndex(c => c.id === id);
  if (i < 0) fail('NOT_IN_HAND', 'That card is not in your hand.');
  return hand.splice(i, 1)[0]!;
}
function drawCards(g: G, p: number, n: number) {
  let drawn = 0;
  for (; drawn < n && g.s.deck.length; drawn++) toHand(g, p, g.s.deck.shift()!);
  if (drawn) g.s.events.push({ t: 'draw', p, n: drawn });
  return drawn;
}
function log(g: G, line: string) { g.s.history.push(line); }
function event(g: G, e: GameEvent) { g.s.events.push(e); }
const P = (p: number) => `Player ${p + 1}`;

interface Located { card: GameCard; player: number; row: 'pr' | 'er' }
function onTable(s: GameState): Located[] {
  return s.players.flatMap((pl, player) => [...pl.pr.map(card => ({ card, player, row: 'pr' as const })), ...pl.er.map(card => ({ card, player, row: 'er' as const }))]);
}
const locate = (s: GameState, id: string | undefined) => onTable(s).find(l => l.card.id === id);

// ---------------------------------------------------------------- scoring, protection, targeting

export function score(s: GameState, p: number): number {
  const pl = s.players[p]!;
  return pl.pr.reduce((n, c) => (c.tapped ? n : n + POINTS[c.rank] + (pl.er.some(j => j.rank === 'J' && j.hostId === c.id && !j.tapped) ? 1 : 0)), 0);
}
/** §13: an untapped Queen Anchor protects its controller's OTT cards other than itself. */
export function guarded(s: GameState, controller: number, card?: GameCard): boolean {
  return s.players[controller]!.er.some(q => q.rank === 'Q' && !q.tapped && !q.hostId && q.id !== card?.id);
}
const isAnchor = (c: GameCard) => !c.hostId;
const rankIndex = (r: Rank) => RANKS.indexOf(r);
const suitIndex = (s: Suit) => SUITS.indexOf(s);
/** §19 rank order A<…<K<RJ<BJ; equal standard ranks break ties ♣<♦<♥<♠. */
export function outranks(a: GameCard, b: GameCard): boolean {
  return rankIndex(a.rank) > rankIndex(b.rank) || (a.rank === b.rank && suitIndex(a.suit) > suitIndex(b.suit));
}
/**
 * Single-target Effect legality ("Vulnerable" in First Contact, where Aegis does not exist).
 * PR immunity is active PR text, so a tapped 4/8 loses it (§9).
 */
function effectTargetable(s: GameState, caster: number, l: Located): boolean {
  if (l.row === 'pr' && !l.card.tapped && (l.card.rank === '4' || l.card.rank === '8')) return false;
  if (l.player !== caster && guarded(s, l.player, l.card)) return false;
  return true;
}
const jackImmune = (c: GameCard) => !c.tapped && (c.rank === 'A' || c.rank === 'RJ' || c.rank === 'BJ');
const scuttleImmune = (c: GameCard) => !c.tapped && (c.rank === 'A' || c.rank === '5' || c.rank === 'RJ' || c.rank === 'BJ');
export function canScuttle(s: GameState, p: number, source: GameCard, l: Located | undefined): boolean {
  return !!l && l.row === 'pr' && l.player !== p && !scuttleImmune(l.card) && outranks(source, l.card);
}
const jackable = (s: GameState, p: number, l: Located | undefined) => !!l && l.row === 'pr' && l.player !== p && !jackImmune(l.card) && effectTargetable(s, p, l);
const purgeable = (s: GameState, p: number, l: Located | undefined) => !!l && l.row === 'er' && l.player !== p && isAnchor(l.card) && effectTargetable(s, p, l);
const bounceable = (s: GameState, p: number, l: Located | undefined) => !!l && effectTargetable(s, p, l);
const tappable = (s: GameState, p: number, l: Located | undefined) => !!l && l.row === 'pr' && l.player !== p && effectTargetable(s, p, l);

// ---------------------------------------------------------------- modes

type Timing = 'ordinary' | 'quick' | 'instant';
interface ModeInfo { rule: string; cls: PendingClass; timing: Timing; text: string }
const MODES: Record<string, ModeInfo> = {
  'purge': { rule: 'A.purge', cls: 'effect', timing: 'ordinary', text: 'Purge: bounce enemy Anchor' },
  'anchor-A': { rule: 'A.anchor', cls: 'anchor', timing: 'ordinary', text: 'Anchor Ace in ER' },
  'quick2': { rule: '2.quick', cls: 'effect', timing: 'quick', text: 'Quick: score 2, opponent discards 1' },
  'raid': { rule: '3.base', cls: 'effect', timing: 'ordinary', text: 'Opponent presents up to 3; take 1' },
  'discard2': { rule: '3.base', cls: 'effect', timing: 'ordinary', text: 'Opponent discards up to 2' },
  'bounce-top': { rule: '3.base', cls: 'effect', timing: 'ordinary', text: 'Bounce to top of DP' },
  'instant-top': { rule: '3.instant', cls: 'effect', timing: 'instant', text: 'Instant: bounce to top of DP' },
  'instant-bottom': { rule: '3.instant', cls: 'effect', timing: 'instant', text: 'Instant: bounce to bottom of DP' },
  'clear-pr': { rule: '4.clear', cls: 'effect', timing: 'ordinary', text: 'Clear every enemy PR card' },
  'clear-er': { rule: '4.clear', cls: 'effect', timing: 'ordinary', text: 'Clear every enemy Anchor' },
  'natural': { rule: '4.natural', cls: 'effect', timing: 'quick', text: 'Quick: look at top 4 of DP, reorder, may draw' },
  'recycle': { rule: '5.recycle', cls: 'effect', timing: 'ordinary', text: 'Mill 2, rummage 1 from GY, draw oldest GY card' },
  'dig': { rule: '6.dig', cls: 'effect', timing: 'ordinary', text: 'Draw 3, then return 1 or discard 1' },
  'seven': { rule: '7.base', cls: 'effect', timing: 'ordinary', text: 'Reveal top 2: take one, play the other' },
  'tap': { rule: '9.tap', cls: 'effect', timing: 'instant', text: 'Instant: tap enemy PR card' },
  'goal3': { rule: '9.goal', cls: 'goal', timing: 'instant', text: 'Instant: opponent Goal +3' },
  'goal5': { rule: '9.goal', cls: 'goal', timing: 'instant', text: 'Instant: opponent Goal +5, then you discard 1' },
  'anchor-9': { rule: '9.anchor', cls: 'anchor', timing: 'ordinary', text: 'Nine Anchor: reveal hand, opponent discards 1' },
  'disrupt': { rule: 'J.disrupt', cls: 'effect', timing: 'instant', text: 'Disrupt the pending Action, draw 1' },
  'attach': { rule: 'J.attach', cls: 'effect', timing: 'ordinary', text: 'Jack enemy PR card' },
  'anchor-Q': { rule: 'Q.anchor', cls: 'anchor', timing: 'ordinary', text: 'Queen Anchor: establish Guard' },
  'anchor-K': { rule: 'K.anchor', cls: 'anchor', timing: 'ordinary', text: 'King Anchor in ER' },
  'hand-swap': { rule: 'RJ.modes', cls: 'effect', timing: 'ordinary', text: 'Hand Swap with opponent' },
  'self-reset': { rule: 'RJ.modes', cls: 'effect', timing: 'ordinary', text: 'Self Reset: discard hand, draw that many +3' },
  'attack': { rule: 'RJ.modes', cls: 'effect', timing: 'ordinary', text: 'Opponent Attack: they discard hand, draw 2 fewer' },
  'shuffle-reset': { rule: 'RJ.modes', cls: 'effect', timing: 'ordinary', text: 'Shuffle Reset: DP + GY, then draw 2' },
  'board-lock': { rule: 'BJ.lock', cls: 'effect', timing: 'quick', text: 'Quick: Board Lock' },
};
export const modeInfo = (mode: string | undefined) => (mode ? MODES[mode] : undefined);

const act = (type: ActionType, label: string, ruleRef: string, extra: Partial<GameAction> = {}): GameAction => ({ type, label, ruleRef, ...extra });
function effect(c: GameCard, mode: string, target?: Located | StackItem, type: ActionType = 'effect'): GameAction {
  const m = MODES[mode]!;
  const tl = target ? ('card' in target && 'row' in target ? ` → ${cardName(target.card)}` : ` → ${(target as StackItem).action.label}`) : '';
  return act(type, `${cardName(c)} · ${m.text}${tl}`, m.rule, { cardId: c.id, mode, ...(target ? { targetId: 'row' in target ? target.card.id : target.id } : {}) });
}

/** Ordinary (Mini-Turn) Play-for-Effect modes: 🛠, Anchor and Attachment (§4.3, §27 15.7). */
function ordinaryModes(s: GameState, p: number, c: GameCard, type: ActionType = 'effect'): GameAction[] {
  if (s.boardLock) return [];
  const out: GameAction[] = [];
  const table = onTable(s);
  switch (c.rank) {
    case 'A': for (const l of table) if (purgeable(s, p, l)) out.push(effect(c, 'purge', l, type)); out.push(effect(c, 'anchor-A', undefined, type)); break;
    case '3': out.push(effect(c, 'raid', undefined, type), effect(c, 'discard2', undefined, type)); for (const l of table) if (bounceable(s, p, l)) out.push(effect(c, 'bounce-top', l, type)); break;
    case '4': out.push(effect(c, 'clear-pr', undefined, type), effect(c, 'clear-er', undefined, type)); break;
    case '5': out.push(effect(c, 'recycle', undefined, type)); break;
    case '6': out.push(effect(c, 'dig', undefined, type)); break;
    case '7': out.push(effect(c, 'seven', undefined, type)); break;
    case '9': out.push(effect(c, 'anchor-9', undefined, type)); break;
    case 'J': for (const l of table) if (jackable(s, p, l)) out.push(effect(c, 'attach', l, type)); break;
    case 'Q': out.push(effect(c, 'anchor-Q', undefined, type)); break;
    case 'K': out.push(effect(c, 'anchor-K', undefined, type)); break;
    case 'RJ': for (const m of ['hand-swap', 'self-reset', 'attack', 'shuffle-reset']) out.push(effect(c, m, undefined, type)); break;
    default: break; // 2 (Solo Wild needs suit matching), 8, 10 (suit effects), BJ (Quick only): no ordinary First Contact effect.
  }
  return out;
}
/** Quick plays: own Full Turn only (§4.4). Board Lock additionally needs an open state (§26 BJ). */
function quickModes(s: GameState, p: number, c: GameCard, open: boolean): GameAction[] {
  if (s.boardLock || p !== s.activePlayer) return [];
  if (c.rank === '2' && !s.players[p]!.quick2Used && !s.stack.some(i => i.player === p && i.action.mode === 'quick2')) return [effect(c, 'quick2')];
  if (c.rank === '4') return [effect(c, 'natural')];
  if (c.rank === 'BJ' && open) return [effect(c, 'board-lock')];
  return [];
}
/** Non-counter Instants usable in a response window. */
function instantModes(s: GameState, p: number, c: GameCard): GameAction[] {
  if (s.boardLock) return [];
  const out: GameAction[] = [];
  if (c.rank === '3') for (const l of onTable(s)) if (bounceable(s, p, l)) out.push(effect(c, 'instant-top', l), effect(c, 'instant-bottom', l));
  if (c.rank === '9') { for (const l of onTable(s)) if (tappable(s, p, l)) out.push(effect(c, 'tap', l)); out.push(effect(c, 'goal3'), effect(c, 'goal5')); }
  if (c.rank === 'J') for (const item of s.stack) if (item.miniTurn && item.player !== p) out.push(effect(c, 'disrupt', item));
  return out;
}
/** §7 / §36 16.1 counter authority restricted to what exists in First Contact. */
function counterActions(s: GameState, p: number): GameAction[] {
  const out: GameAction[] = [];
  const pl = s.players[p]!;
  const aceCan = (i: StackItem) => (i.cls === 'effect' || i.cls === 'counter') && i.action.mode !== 'board-lock' && i.action.mode !== 'shuffle-reset';
  const add = (c: GameCard, i: StackItem, mode: 'counter' | 'anchor-counter', rule: string) =>
    out.push(act('counter', `${cardName(c)} · ${mode === 'anchor-counter' ? 'Sacrifice Anchor Ace to counter' : 'Counter'} “${i.action.label}”`, rule, { cardId: c.id, targetId: i.id, mode }));
  for (const c of pl.hand) for (const i of s.stack) {
    if (c.rank === 'A' && aceCan(i)) add(c, i, 'counter', 'A.counter');
    if (c.rank === 'K' && (i.cls === 'anchor' || i.cls === 'goal')) add(c, i, 'counter', 'K.counter');
    if (c.rank === '8' && i.cls === 'scuttle') add(c, i, 'counter', '8.counter');
  }
  for (const c of pl.er) if (c.rank === 'A' && !c.tapped && isAnchor(c)) for (const i of s.stack) if (i.player !== p && aceCan(i)) add(c, i, 'anchor-counter', 'A.anchor');
  return out;
}
export function responseActions(s: GameState, p: number): GameAction[] {
  const hand = s.players[p]!.hand;
  return [...counterActions(s, p), ...hand.flatMap(c => instantModes(s, p, c)), ...hand.flatMap(c => quickModes(s, p, c, false))];
}

function ordinaryActions(s: GameState, p: number): GameAction[] {
  const pl = s.players[p]!;
  const out: GameAction[] = [];
  // §22 10.2: Draw is undeclarable only while Exhausted is active with an empty DP.
  if (!(s.exhausted !== null && !s.deck.length)) out.push(act('draw', pl.hand.length ? 'Draw 1' : 'Draw 2 (your hand is empty)', 'action.draw'));
  for (const c of pl.hand) {
    out.push(act('score', `Score ${cardName(c)} for ${POINTS[c.rank]} Points`, c.rank === '7' ? '7.trigger' : c.rank === 'BJ' ? 'BJ.score' : 'action.score', { cardId: c.id }));
    out.push(...ordinaryModes(s, p, c));
    if (!s.boardLock) for (const l of s.players[opp(p)]!.pr.map(card => ({ card, player: opp(p), row: 'pr' as const }))) if (canScuttle(s, p, c, l)) out.push(act('scuttle', `Scuttle ${cardName(l.card)} with ${cardName(c)}`, 'action.scuttle', { cardId: c.id, targetId: l.card.id }));
  }
  return out;
}
const miniTurnOf = (a: GameAction): MiniTurnType | undefined => (a.type === 'draw' || a.type === 'score' || a.type === 'scuttle' ? a.type : a.type === 'effect' && MODES[a.mode ?? '']?.timing === 'ordinary' ? 'effect' : undefined);

export function availableActions(s: GameState, p: number): GameAction[] {
  if ((p !== 0 && p !== 1) || s.winner !== null) return [];
  if (s.choice) return s.choice.player === p ? choiceActions(s, p) : [];
  if (s.stack.length) {
    if (s.priority !== p) return [];
    const r = responseActions(s, p);
    return r.length ? [...r, act('decline', 'Decline to respond (no Action spent)', 'decline')] : [];
  }
  if (p !== s.activePlayer) return [];
  const out = s.players[p]!.hand.flatMap(c => quickModes(s, p, c, true));
  if (s.miniTurns > 0) {
    const ordinary = ordinaryActions(s, p);
    // §26 J Disrupt: a disrupted Action type may be repeated only when no different Action is legal.
    const allowed = ordinary.filter(a => !s.players[p]!.disrupted.includes(miniTurnOf(a)!));
    out.push(...(allowed.length ? allowed : ordinary));
    if (!ordinary.length && s.exhausted !== null && !s.deck.length) out.push(act('exhausted-pass', 'Forced Exhausted Pass', 'exhausted.pass'));
  } else out.push(act('end', 'End turn · End Phase victory check', 'FC.end'));
  return out;
}

function choiceActions(s: GameState, p: number): GameAction[] {
  const q = s.choice!;
  const out: GameAction[] = [];
  const pick = (mode: string, label: string, cardId?: string, rule = 'stack') => out.push(act('choose', label, rule, { mode, ...(cardId ? { cardId } : {}) }));
  const hand = s.players[p]!.hand;
  switch (q.kind) {
    case 'discard': for (const c of q.cards) if (hand.some(h => h.id === c.id)) pick('select', `Discard ${cardName(c)}`, c.id); break;
    case 'present': for (const c of q.cards) if (hand.some(h => h.id === c.id)) pick('select', `Present ${cardName(c)}`, c.id, '3.base'); break;
    case 'raid-take': for (const c of q.cards) pick('select', `Take ${cardName(c)}`, c.id, '3.base'); break;
    case 'recycle': for (const c of q.cards) if (s.graveyard.some(x => x.id === c.id)) pick('select', `Rummage ${cardName(c)} from GY`, c.id, '5.recycle'); break;
    case 'dig-mode': {
      const drawn = q.data.drawn as string[];
      for (const c of hand) if (drawn.includes(c.id)) { pick('dig-top', `Keep the rest; return ${cardName(c)} to top of DP`, c.id, '6.dig'); pick('dig-bottom', `Keep the rest; return ${cardName(c)} to bottom of DP`, c.id, '6.dig'); }
      for (const c of hand) pick('dig-discard', `Keep all drawn; discard ${cardName(c)}`, c.id, '6.dig');
      break;
    }
    case 'seven-hand': for (const c of q.cards) pick('select', `Take ${cardName(c)} into hand; play the other`, c.id, '7.base'); break;
    case 'seven-single': pick('take', `Take ${cardName(q.cards[0]!)} into hand`, undefined, '7.base'); pick('play', `Play ${cardName(q.cards[0]!)} now`, undefined, '7.base'); break;
    case 'generated': {
      const c = q.cards[0]!;
      pick('generated-score', `Score ${cardName(c)} for ${POINTS[c.rank]} Points`, c.id, c.rank === '7' ? '7.trigger' : '7.base');
      out.push(...ordinaryModes(s, p, c, 'generated-effect'));
      break;
    }
    case 'seven-score': for (const c of q.cards) pick('select', `Take ${cardName(c)} into hand`, c.id, '7.trigger'); break;
    case 'order': for (const c of q.cards) if (!(q.data.ordered as string[]).includes(c.id)) pick('select', `Place ${cardName(c)} next from the top`, c.id, '4.natural'); break;
    case 'natural-draw': pick('draw', 'Draw the top card', undefined, '4.natural'); pick('leave', 'Leave the Draw Pile as ordered', undefined, '4.natural'); break;
    case 'eight-reward': {
      const gy = s.graveyard;
      if (gy.length) { pick('top', `Draw newest GY card (${cardName(gy.at(-1)!)})`, undefined, '8.bonus'); if (gy.length > 1) pick('bottom', `Draw oldest GY card (${cardName(gy[0]!)})`, undefined, '8.bonus'); }
      break;
    }
  }
  return out;
}

// ---------------------------------------------------------------- setup

export interface CreateOptions { random?: Random; firstPlayer?: number }
function emptyState(): GameState {
  return {
    version: 2, profile: 'intrilex-first-contact',
    players: [0, 1].map(() => ({ hand: [], pr: [], er: [], goal: GOAL, quick2Used: false, disrupted: [] })),
    deck: [], graveyard: [], activePlayer: 0, phase: 'action', miniTurns: 1, turn: 1,
    stack: [], priority: 0, passes: 0, choice: null, suspended: [], boardLock: null, exhausted: null, winner: null,
    history: [], events: [], seq: 0,
  };
}
export function fullDeck(): { rank: Rank; suit: Suit }[] {
  return [...RANKS.filter(r => r !== 'RJ' && r !== 'BJ').flatMap(rank => SUITS.map(suit => ({ rank, suit }))), { rank: 'RJ', suit: 'joker' }, { rank: 'BJ', suit: 'joker' }];
}

/** §27 15.4: shuffle 54, random Player A gets 5 and goes first, Player B gets 6, Goals 15. */
export function createGame(options: CreateOptions = {}): GameState {
  const random = options.random ?? secureRandom;
  const g: G = { s: emptyState(), random };
  for (const c of fullDeck()) g.s.deck.push({ id: newId(g), ...c, owner: -1 });
  shuffle(g.s.deck, random);
  const first = options.firstPlayer ?? (random() < 0.5 ? 0 : 1);
  if (first !== 0 && first !== 1) fail('INVALID_SETUP', 'First player must be 0 or 1.');
  for (let i = 0; i < 5; i++) toHand(g, first, g.s.deck.shift()!);
  for (let i = 0; i < 6; i++) toHand(g, opp(first), g.s.deck.shift()!);
  g.s.activePlayer = first; g.s.priority = first;
  log(g, `First Contact: 54 cards, Goal 15. ${P(first)} is Player A (5 cards) and goes first; ${P(opp(first))} has 6.`);
  return g.s;
}

// ---------------------------------------------------------------- application

const actionKey = (a: Pick<GameAction, 'type' | 'cardId' | 'targetId' | 'mode'>) => JSON.stringify([a.type, a.cardId ?? null, a.targetId ?? null, a.mode ?? null]);

function parseAction(input: unknown): Pick<GameAction, 'type' | 'cardId' | 'targetId' | 'mode'> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return fail('INVALID_ACTION', 'A legal action is required.');
  const o = input as Record<string, unknown>;
  const opt = (v: unknown) => (v === undefined || v === null ? undefined : typeof v === 'string' && v.length <= 64 ? v : fail('INVALID_ACTION', 'Malformed action.'));
  if (typeof o.type !== 'string' || o.type.length > 32) fail('INVALID_ACTION', 'Malformed action.');
  return { type: o.type as ActionType, cardId: opt(o.cardId), targetId: opt(o.targetId), mode: opt(o.mode) };
}

export function applyGame(state: GameState, p: number, input: unknown, random: Random = secureRandom): GameState {
  const wanted = parseAction(input);
  const legal = availableActions(state, p).find(a => actionKey(a) === actionKey(wanted));
  if (!legal) fail('ACTION_UNAVAILABLE', 'That action is not legal now. Check whose decision it is, the remaining Action, Guard, immunities, Board Lock and First Contact restrictions.');
  const g: G = { s: structuredClone(state), random };
  perform(g, p, legal!);
  settle(g);
  return g.s;
}

function push(g: G, item: Omit<StackItem, 'id'>) {
  g.s.stack.push({ id: `p${++g.s.seq}`, ...item });
  g.s.priority = opp(item.player);
  g.s.passes = 0;
}

function perform(g: G, p: number, a: GameAction) {
  const s = g.s;
  switch (a.type) {
    case 'choose': case 'generated-effect': resolveChoice(g, p, a); return;
    case 'decline': s.passes++; s.priority = opp(s.priority); return;
    case 'end': endTurn(g); return;
    case 'exhausted-pass': s.miniTurns = 0; log(g, `${P(p)} takes the forced Exhausted Pass.`); event(g, { t: 'pass', p }); return;
    case 'counter': {
      let card: GameCard;
      if (a.mode === 'anchor-counter') { const pl = s.players[p]!; card = pl.er.splice(pl.er.findIndex(c => c.id === a.cardId), 1)[0]!; clean(card); }
      else card = takeFromHand(g, p, a.cardId);
      log(g, `${P(p)}: ${a.label}`);
      event(g, { t: 'declare', p, type: 'counter', mode: a.mode, rank: card.rank });
      push(g, { player: p, cls: 'counter', action: a, card });
      return;
    }
    case 'draw': {
      s.miniTurns--;
      const drawCount = s.players[p]!.hand.length ? 1 : 2; // fixed at declaration (§4.3)
      log(g, `${P(p)} declares Draw.`);
      event(g, { t: 'declare', p, type: 'draw', miniTurn: 'draw' });
      push(g, { player: p, cls: 'action', action: a, miniTurn: 'draw', drawCount });
      return;
    }
    case 'score': {
      s.miniTurns--;
      const card = takeFromHand(g, p, a.cardId);
      log(g, `${P(p)} plays ${cardName(card)} for Points.`);
      event(g, { t: 'declare', p, type: 'score', miniTurn: 'score', rank: card.rank });
      push(g, { player: p, cls: 'action', action: a, miniTurn: 'score', card });
      return;
    }
    case 'scuttle': {
      s.miniTurns--;
      const card = takeFromHand(g, p, a.cardId);
      log(g, `${P(p)}: ${a.label}.`);
      event(g, { t: 'declare', p, type: 'scuttle', miniTurn: 'scuttle', rank: card.rank });
      push(g, { player: p, cls: 'scuttle', action: a, miniTurn: 'scuttle', card });
      return;
    }
    case 'effect': {
      const info = MODES[a.mode!]!;
      const ordinary = info.timing === 'ordinary';
      if (ordinary) s.miniTurns--;
      const card = takeFromHand(g, p, a.cardId);
      log(g, `${P(p)}: ${a.label}.`);
      event(g, { t: 'declare', p, type: 'effect', mode: a.mode, rank: card.rank, ...(ordinary ? { miniTurn: 'effect' as const } : {}) });
      push(g, { player: p, cls: info.cls, action: a, card, ...(ordinary ? { miniTurn: 'effect' as const } : {}) });
      return;
    }
  }
}

/** Resolve LIFO until a decision is needed (§6). Players with no lawful response are advanced automatically (§38 20.3). */
function settle(g: G) {
  const s = g.s;
  for (let guard = 0; ; guard++) {
    if (guard > 5000) throw new Error('Resolution safety bound exceeded.');
    finishSuspended(g);
    if (s.exhausted !== null && s.deck.length) { s.exhausted = null; log(g, 'Cards entered the Draw Pile: Exhausted ends.'); }
    if (s.winner !== null || s.choice) break;
    if (!s.stack.length) { s.priority = s.activePlayer; s.passes = 0; break; }
    if (s.passes >= 2) {
      const item = s.stack.pop()!;
      resolve(g, item);
      checkAttachments(g);
      s.priority = opp(item.player); s.passes = 0;
      continue;
    }
    if (!responseActions(s, s.priority).length) { s.passes++; s.priority = opp(s.priority); continue; }
    break;
  }
  s.history = s.history.slice(-150);
  s.events = s.events.slice(-400);
}

function suspend(g: G, card: GameCard) { g.s.suspended.push({ card, depth: g.s.stack.length }); }
/** A paused source goes to GY once its choices and any generated child play have finished (§6 Child Plays). */
function finishSuspended(g: G) {
  const s = g.s;
  while (s.suspended.length && !s.choice && s.stack.length <= s.suspended.at(-1)!.depth) toGraveyard(g, s.suspended.pop()!.card);
}

function setChoice(g: G, c: Omit<Choice, 'count'> & { count?: number }) {
  const count = Math.min(c.count ?? 1, c.cards.length || 1);
  g.s.choice = { ...c, count } as Choice;
}

function removeFromBoard(g: G, id: string): GameCard | undefined {
  const l = locate(g.s, id);
  if (!l) return undefined;
  const row = g.s.players[l.player]![l.row];
  row.splice(row.indexOf(l.card), 1);
  if (l.card.hostId) restoreHost(g, l.player, l.card.hostId);
  return l.card;
}
/** §12 step 4: the former host returns to its original owner's matching row. */
function restoreHost(g: G, controller: number, hostId: string) {
  const pr = g.s.players[controller]!.pr;
  const host = pr.find(c => c.id === hostId);
  if (host && host.owner >= 0 && host.owner !== controller) { pr.splice(pr.indexOf(host), 1); g.s.players[host.owner]!.pr.push(host); }
}
/** §12: after any change, sever Jacks whose host is no longer in their controller's PR. */
function checkAttachments(g: G) {
  for (let p = 0; p < 2; p++) {
    const pl = g.s.players[p]!;
    for (const j of [...pl.er]) if (j.hostId && !pl.pr.some(c => c.id === j.hostId)) {
      pl.er.splice(pl.er.indexOf(j), 1); toGraveyard(g, j); log(g, `${P(p)}'s Jack lost its host and is Scrapped.`);
    }
    for (const c of [...pl.pr]) if (c.owner >= 0 && c.owner !== p && !pl.er.some(j => j.hostId === c.id)) { pl.pr.splice(pl.pr.indexOf(c), 1); g.s.players[c.owner]!.pr.push(c); }
  }
}

function scoreCard(g: G, p: number, c: GameCard) {
  clean(c); c.owner = p;
  g.s.players[p]!.pr.push(c);
  event(g, { t: 'score', p, rank: c.rank });
  log(g, `${cardName(c)} enters ${P(p)}'s Point Row (${score(g.s, p)} secured).`);
  // §26 7 Scoring Trigger: uses the stack; a triggered ability, not a card play (no Ace authority).
  if (c.rank === '7') push(g, { player: p, cls: 'trigger', action: act('effect', 'Seven scoring trigger: reveal 2, take 1', '7.trigger', { mode: 'seven-trigger' }) });
}

function resolve(g: G, item: StackItem) {
  const s = g.s;
  const p = item.player, enemy = opp(p), a = item.action, c = item.card;
  event(g, { t: 'resolve', p, cls: item.cls, mode: a.mode ?? a.type, ...(c ? { rank: c.rank } : {}) });
  switch (item.cls) {
    case 'counter': {
      const i = s.stack.findIndex(x => x.id === a.targetId);
      if (i < 0) { log(g, `${a.label} fizzles: its target is gone.`); event(g, { t: 'fizzle', p, mode: 'counter' }); suspend(g, c!); return; }
      const negated = s.stack.splice(i, 1)[0]!;
      event(g, { t: 'countered', p: negated.player, by: p, mode: negated.action.mode ?? negated.action.type });
      log(g, `Countered: ${negated.action.label}.`);
      if (negated.card) { if (a.mode === 'anchor-counter') { toHand(g, p, negated.card); log(g, `${P(p)} takes the countered ${cardName(negated.card)} into hand.`); } else toGraveyard(g, negated.card); }
      suspend(g, c!);
      return;
    }
    case 'action':
      if (item.miniTurn === 'draw') { const n = drawCards(g, p, item.drawCount ?? 1); log(g, `${P(p)} draws ${n} card${n === 1 ? '' : 's'}.`); }
      else if (c) scoreCard(g, p, c);
      return;
    case 'trigger': {
      const revealed = s.deck.splice(0, 2);
      if (revealed.length) { log(g, `Seven trigger reveals ${revealed.map(cardName).join(' and ')}.`); setChoice(g, { player: p, kind: 'seven-score', prompt: 'Seven scoring trigger: take one revealed card; the other returns to the top of DP.', cards: revealed, public: true, held: true, data: {} }); }
      return;
    }
    case 'scuttle': {
      const target = locate(s, a.targetId);
      if (!canScuttle(s, p, c!, target)) {
        log(g, `Scuttle fizzles: the target is no longer legal.`); event(g, { t: 'fizzle', p, mode: 'scuttle' }); event(g, { t: 'scuttle', p, success: false, source: c!.rank });
        toGraveyard(g, c!); return;
      }
      const t = removeFromBoard(g, target!.card.id)!;
      toGraveyard(g, t); toGraveyard(g, c!);
      log(g, `${P(p)} Scuttles ${cardName(t)} with ${cardName(c!)}.`);
      event(g, { t: 'scuttle', p, success: true, source: c!.rank, target: t.rank });
      if (c!.rank === '8') setChoice(g, { player: p, kind: 'eight-reward', prompt: 'Eight Scuttle bonus: draw the top or bottom card of GY.', cards: [], public: true, held: false, data: {} });
      return;
    }
  }
  resolveEffect(g, item, p, enemy, c!);
}

function fizzle(g: G, item: StackItem, c: GameCard) {
  log(g, `${item.action.label} fizzles: its target is no longer legal.`);
  event(g, { t: 'fizzle', p: item.player, mode: item.action.mode });
  suspend(g, c);
}

function resolveEffect(g: G, item: StackItem, p: number, enemy: number, c: GameCard) {
  const s = g.s, m = item.action.mode!, target = locate(s, item.action.targetId);
  switch (m) {
    case 'purge':
      if (!purgeable(s, p, target)) return fizzle(g, item, c);
      { const owner = target!.card.owner >= 0 ? target!.card.owner : target!.player; const t = removeFromBoard(g, target!.card.id)!; toHand(g, owner, t); log(g, `${cardName(t)} returns to ${P(owner)}'s hand.`); }
      break;
    case 'bounce-top': case 'instant-top': case 'instant-bottom':
      if (!bounceable(s, p, target)) return fizzle(g, item, c);
      { const t = removeFromBoard(g, target!.card.id)!; const where = m === 'instant-bottom' ? 'bottom' : 'top'; log(g, `${cardName(t)} is bounced to the ${where} of the Draw Pile.`); toDeck(g, t, where); }
      break;
    case 'tap':
      if (!tappable(s, p, target)) return fizzle(g, item, c);
      target!.card.tapped = true; log(g, `${cardName(target!.card)} is tapped.`);
      break;
    case 'attach': {
      if (!jackable(s, p, target)) return fizzle(g, item, c);
      const host = target!.card;
      const from = s.players[target!.player]!;
      from.pr.splice(from.pr.indexOf(host), 1);
      // A previous Jack on this host loses its relationship and is severed by checkAttachments.
      s.players[p]!.pr.push(host);
      clean(c); c.owner = p; c.hostId = host.id;
      s.players[p]!.er.push(c);
      log(g, `${P(p)} Jacks ${cardName(host)} (+1 Point while attached).`);
      event(g, { t: 'attach', p, host: host.rank });
      return;
    }
    case 'anchor-A': case 'anchor-Q': case 'anchor-K': case 'anchor-9': {
      if (m === 'anchor-9') for (const n of [...s.players[p]!.er]) if (n.rank === '9' && isAnchor(n)) { removeFromBoard(g, n.id); toGraveyard(g, n); log(g, `${P(p)}'s previous Nine Anchor is Scrapped.`); }
      clean(c); c.owner = p; s.players[p]!.er.push(c);
      log(g, `${cardName(c)} enters ${P(p)}'s Enduring Row${m === 'anchor-Q' ? ' — Guard is active' : ''}.`);
      if (m === 'anchor-9' && s.players[enemy]!.hand.length) {
        log(g, `${P(enemy)}'s hand is revealed: ${s.players[enemy]!.hand.map(cardName).join(', ')}.`);
        setChoice(g, { player: enemy, kind: 'discard', prompt: 'Nine Anchor revealed your hand: discard one card of your choice.', cards: s.players[enemy]!.hand.slice(), public: true, held: false, data: {} });
      }
      return;
    }
    case 'quick2':
      s.players[p]!.quick2Used = true;
      scoreCard(g, p, c);
      if (s.players[enemy]!.hand.length) setChoice(g, { player: enemy, kind: 'discard', prompt: 'Two Quick: discard one card of your choice.', cards: s.players[enemy]!.hand.slice(), public: false, held: false, data: {} });
      return;
    case 'raid':
      if (s.players[enemy]!.hand.length) setChoice(g, { player: enemy, kind: 'present', prompt: 'Present cards from your hand; your opponent will take one.', cards: s.players[enemy]!.hand.slice(), count: 3, public: false, held: false, data: { caster: p, presented: [] } });
      break;
    case 'discard2':
      if (s.players[enemy]!.hand.length) setChoice(g, { player: enemy, kind: 'discard', prompt: 'Discard cards of your choice.', cards: s.players[enemy]!.hand.slice(), count: 2, public: false, held: false, data: {} });
      break;
    case 'clear-pr': case 'clear-er': {
      const row = m === 'clear-pr' ? 'pr' : 'er';
      const victims = s.players[enemy]![row].filter(x => row === 'pr' || isAnchor(x));
      for (const v of victims) { removeFromBoard(g, v.id); toGraveyard(g, v); }
      log(g, victims.length ? `Cleared ${victims.map(cardName).join(', ')}.` : 'Nothing could be cleared.');
      break;
    }
    case 'natural': {
      const top = s.deck.splice(0, 4);
      if (top.length) setChoice(g, { player: p, kind: 'order', prompt: 'Choose the new order: your first choice becomes the top card.', cards: top, count: top.length, public: false, held: true, data: { ordered: [] } });
      break;
    }
    case 'recycle': {
      const milled = s.deck.splice(0, 2);
      for (const x of milled) toGraveyard(g, x);
      if (milled.length) log(g, `Milled ${milled.map(cardName).join(', ')}.`);
      if (s.graveyard.length) setChoice(g, { player: p, kind: 'recycle', prompt: 'Rummage one GY card into your hand; then you draw the oldest remaining GY card.', cards: s.graveyard.slice(), public: true, held: false, data: {} });
      break;
    }
    case 'dig': {
      const before = new Set(s.players[p]!.hand.map(x => x.id));
      drawCards(g, p, 3);
      const drawn = s.players[p]!.hand.filter(x => !before.has(x.id)).map(x => x.id);
      log(g, `${P(p)} digs ${drawn.length} card${drawn.length === 1 ? '' : 's'}.`);
      if (drawn.length) setChoice(g, { player: p, kind: 'dig-mode', prompt: 'Return one drawn card to the top or bottom of DP, or keep all and discard one card.', cards: [], public: false, held: false, data: { drawn } });
      break;
    }
    case 'seven': {
      const revealed = s.deck.splice(0, 2);
      if (revealed.length) log(g, `Seven reveals ${revealed.map(cardName).join(' and ')}.`);
      if (revealed.length === 2) setChoice(g, { player: p, kind: 'seven-hand', prompt: 'Take one revealed card into hand; the other becomes a generated play.', cards: revealed, public: true, held: true, data: {} });
      else if (revealed.length === 1) setChoice(g, { player: p, kind: 'seven-single', prompt: 'One card revealed: take it, or play it now.', cards: revealed, public: true, held: true, data: {} });
      break;
    }
    case 'goal3': case 'goal5':
      s.players[enemy]!.goal += m === 'goal3' ? 3 : 5;
      log(g, `${P(enemy)}'s Goal rises to ${s.players[enemy]!.goal}.`);
      if (m === 'goal5' && s.players[p]!.hand.length) setChoice(g, { player: p, kind: 'discard', prompt: 'Goal Shift +5: discard one card.', cards: s.players[p]!.hand.slice(), public: false, held: false, data: {} });
      break;
    case 'disrupt': {
      const targetItem = s.stack.find(x => x.id === item.action.targetId);
      const kind = targetItem?.miniTurn ?? (s.events.slice().reverse().find(e => e.t === 'declare' && e.p === enemy && e.miniTurn) as { miniTurn?: MiniTurnType } | undefined)?.miniTurn;
      if (kind && !s.players[enemy]!.disrupted.includes(kind)) s.players[enemy]!.disrupted.push(kind);
      drawCards(g, p, 1);
      log(g, `${P(enemy)}'s ${kind ?? 'Action'} is disrupted for this turn; ${P(p)} draws 1.`);
      break;
    }
    case 'hand-swap': {
      const a = s.players[p]!.hand, b = s.players[enemy]!.hand;
      s.players[p]!.hand = []; s.players[enemy]!.hand = [];
      for (const x of b) toHand(g, p, x);
      for (const x of a) toHand(g, enemy, x);
      log(g, 'Red Joker: the players exchange hands.');
      break;
    }
    case 'self-reset': case 'attack': {
      const who = m === 'self-reset' ? p : enemy;
      const hand = s.players[who]!.hand; s.players[who]!.hand = [];
      for (const x of hand) toGraveyard(g, x);
      const n = drawCards(g, who, Math.max(0, hand.length + (m === 'self-reset' ? 3 : -2)));
      log(g, `${P(who)} discards ${hand.length} and draws ${n}.`);
      break;
    }
    case 'shuffle-reset': {
      const cards = [...s.deck, ...s.graveyard]; s.deck = []; s.graveyard = [];
      shuffle(cards, g.random);
      for (const x of cards) toDeck(g, x, 'top');
      drawCards(g, p, 2);
      log(g, `Red Joker: DP and GY are shuffled together (${s.deck.length + 2} cards); ${P(p)} draws 2.`);
      break;
    }
    case 'board-lock':
      s.boardLock = { remaining: 2, activationTurn: s.turn, player: p };
      log(g, 'Board Lock is active: no non-counter Effects or Scuttles.');
      event(g, { t: 'board-lock', p });
      break;
  }
  suspend(g, c);
}

function resolveChoice(g: G, p: number, a: GameAction) {
  const s = g.s, q = s.choice!;
  event(g, { t: 'choose', p, kind: q.kind, mode: a.mode });
  const remove = (id: string | undefined) => { q.cards = q.cards.filter(x => x.id !== id); };
  const done = () => { s.choice = null; };
  switch (q.kind) {
    case 'discard': {
      const c = takeFromHand(g, p, a.cardId);
      toGraveyard(g, c); log(g, `${P(p)} discards ${cardName(c)}.`);
      remove(a.cardId); q.count--;
      if (q.count <= 0 || !q.cards.length) done();
      return;
    }
    case 'present': {
      (q.data.presented as string[]).push(a.cardId!); remove(a.cardId); q.count--;
      if (q.count > 0 && q.cards.length) return;
      const presented = s.players[p]!.hand.filter(x => (q.data.presented as string[]).includes(x.id));
      log(g, `${P(p)} presents ${presented.map(cardName).join(', ')}.`);
      setChoice(g, { player: Number(q.data.caster), kind: 'raid-take', prompt: 'Take one presented card into your hand.', cards: presented, public: true, held: false, data: { victim: p } });
      return;
    }
    case 'raid-take': {
      const c = takeFromHand(g, Number(q.data.victim), a.cardId);
      log(g, `${P(p)} takes ${cardName(c)}.`);
      toHand(g, p, c); done();
      return;
    }
    case 'recycle': {
      const i = s.graveyard.findIndex(x => x.id === a.cardId);
      const c = s.graveyard.splice(i, 1)[0]!;
      log(g, `${P(p)} rummages ${cardName(c)}${s.graveyard.length ? ` and draws ${cardName(s.graveyard[0]!)}` : ''} from GY.`);
      toHand(g, p, c);
      const oldest = s.graveyard.shift();
      if (oldest) toHand(g, p, oldest);
      done();
      return;
    }
    case 'dig-mode': {
      const c = takeFromHand(g, p, a.cardId);
      if (a.mode === 'dig-discard') { toGraveyard(g, c); log(g, `${P(p)} keeps the dug cards and discards ${cardName(c)}.`); }
      else { toDeck(g, c, a.mode === 'dig-top' ? 'top' : 'bottom'); log(g, `${P(p)} returns a card to the ${a.mode === 'dig-top' ? 'top' : 'bottom'} of DP.`); }
      done();
      return;
    }
    case 'seven-hand': {
      const taken = q.cards.find(x => x.id === a.cardId)!;
      const other = q.cards.find(x => x.id !== a.cardId)!;
      q.cards = [];
      log(g, `${P(p)} takes ${cardName(taken)}; ${cardName(other)} becomes a generated play.`);
      toHand(g, p, taken);
      setChoice(g, { player: p, kind: 'generated', prompt: `Declare ${cardName(other)}: score it or use a legal effect.`, cards: [other], public: true, held: true, data: {} });
      return;
    }
    case 'seven-single': {
      const c = q.cards[0]!;
      if (a.mode === 'take') { q.cards = []; toHand(g, p, c); log(g, `${P(p)} takes ${cardName(c)}.`); done(); }
      else setChoice(g, { player: p, kind: 'generated', prompt: `Declare ${cardName(c)}: score it or use a legal effect.`, cards: [c], public: true, held: true, data: {} });
      return;
    }
    case 'generated': {
      const c = q.cards[0]!;
      q.cards = []; done();
      if (a.mode === 'generated-score') { log(g, `${P(p)} scores the generated ${cardName(c)}.`); scoreCard(g, p, c); return; }
      const info = MODES[a.mode!]!;
      const declared = { ...a, type: 'effect' as const };
      log(g, `${P(p)} (generated): ${a.label}.`);
      event(g, { t: 'declare', p, type: 'generated-effect', mode: a.mode, rank: c.rank });
      push(g, { player: p, cls: info.cls, action: declared, card: c });
      return;
    }
    case 'seven-score': {
      const taken = q.cards.find(x => x.id === a.cardId)!;
      const rest = q.cards.filter(x => x.id !== a.cardId);
      q.cards = [];
      toHand(g, p, taken);
      for (const x of rest.reverse()) toDeck(g, x, 'top');
      log(g, `${P(p)} takes ${cardName(taken)}${rest.length ? '; the other returns to the top of DP' : ''}.`);
      done();
      return;
    }
    case 'order': {
      const ordered = q.data.ordered as string[];
      ordered.push(a.cardId!);
      if (ordered.length < q.cards.length) return;
      const cards = ordered.map(id => q.cards.find(x => x.id === id)!);
      q.cards = [];
      for (const x of cards.reverse()) toDeck(g, x, 'top');
      log(g, `${P(p)} reorders the top of the Draw Pile.`);
      setChoice(g, { player: p, kind: 'natural-draw', prompt: 'Draw the new top card?', cards: [], public: false, held: false, data: {} });
      return;
    }
    case 'natural-draw':
      done();
      if (a.mode === 'draw') { drawCards(g, p, 1); log(g, `${P(p)} draws the top card.`); }
      return;
    case 'eight-reward': {
      const c = a.mode === 'top' ? s.graveyard.pop() : s.graveyard.shift();
      done();
      if (c) { log(g, `${P(p)} draws ${cardName(c)} from the ${a.mode === 'top' ? 'top' : 'bottom'} of GY.`); toHand(g, p, c); }
      return;
    }
  }
}

function endTurn(g: G) {
  const s = g.s, p = s.activePlayer, secured = score(s, p), goal = s.players[p]!.goal;
  event(g, { t: 'end-turn', p, score: secured, goal });
  s.players[p]!.disrupted = [];
  // §4.5 order: victory, Board Lock, (Sudden Death disabled), Exhausted.
  if (secured >= goal) { s.winner = p; s.phase = 'finished'; log(g, `${P(p)} wins at End Phase with ${secured} secured Points (Goal ${goal}).`); event(g, { t: 'win', p, reason: 'goal' }); return; }
  if (s.boardLock && s.boardLock.activationTurn !== s.turn && --s.boardLock.remaining <= 0) { s.boardLock = null; log(g, 'Board Lock ends.'); }
  if (s.exhausted !== null && --s.exhausted <= 0) {
    const anchors = (x: number) => s.players[x]!.er.filter(c => !c.tapped && isAnchor(c)).length;
    const delta = anchors(0) - anchors(1) || score(s, 0) - score(s, 1);
    s.winner = delta > 0 ? 0 : delta < 0 ? 1 : 'draw';
    s.phase = 'finished'; s.exhausted = 0;
    log(g, `Exhausted counter reaches 0 — ${s.winner === 'draw' ? 'the game is drawn' : `${P(s.winner)} wins the tiebreak`}.`);
    event(g, { t: 'win', p: s.winner, reason: 'exhausted' });
    return;
  }
  startTurn(g, opp(p));
}

/** §27 15.5 Start Phase (with §22 10.1 Exhausted entry). */
function startTurn(g: G, p: number) {
  const s = g.s;
  s.activePlayer = p; s.priority = p; s.passes = 0; s.turn++; s.miniTurns = 1;
  s.players[p]!.quick2Used = false; s.players[p]!.disrupted = [];
  if (!s.deck.length && s.exhausted === null) { s.exhausted = 3; log(g, 'The Draw Pile is empty at Start: Exhausted begins (counter 3).'); }
  for (const c of [...s.players[p]!.pr, ...s.players[p]!.er]) delete c.tapped;
  log(g, `Turn ${s.turn}: ${P(p)}.`);
}

// ---------------------------------------------------------------- projection and explanation

export function projectGame(s: GameState, you: number | null): GameView {
  const seat = you === 0 || you === 1 ? you : null;
  const q = s.choice;
  return {
    profile: s.profile, you: seat,
    players: s.players.map((pl, i) => ({ handCount: pl.hand.length, pr: structuredClone(pl.pr), er: structuredClone(pl.er), goal: pl.goal, score: score(s, i), guard: guarded(s, i), disrupted: [...pl.disrupted], quick2Used: pl.quick2Used })),
    hand: seat === null ? [] : structuredClone(s.players[seat]!.hand),
    deckCount: s.deck.length, graveyard: structuredClone(s.graveyard),
    activePlayer: s.activePlayer, phase: s.phase, miniTurns: s.miniTurns, turn: s.turn,
    pending: s.stack.map(i => ({ id: i.id, player: i.player, label: i.action.label, ruleRef: i.action.ruleRef, cls: i.cls, ...(i.card ? { card: structuredClone(i.card) } : {}) })),
    priority: s.priority,
    choice: q ? { player: q.player, kind: q.kind, prompt: q.prompt, count: q.count, cards: q.public || q.player === seat ? structuredClone(q.cards) : [] } : null,
    boardLock: s.boardLock ? { ...s.boardLock } : null, exhausted: s.exhausted, winner: s.winner,
    legalActions: seat === null ? [] : availableActions(s, seat),
    history: s.history.slice(-80),
  };
}

export function explainAction(a: GameAction): string {
  const rule = RULES[a.ruleRef];
  return rule ? `${a.label}. ${rule.summary} (${rule.title}, ${rule.ref})` : a.label;
}

/**
 * "Why can't I?" — reasons a hand card has no legal use right now, in rule terms. Works purely from the
 * caller's projected view, so online clients can use it without any hidden state.
 */
export function explainCard(v: GameView, cardId: string): string[] {
  const p = v.you;
  const c = v.hand.find(x => x.id === cardId);
  if (p === null || !c) return ['That card is not in your hand.'];
  const reasons: string[] = [];
  const legal = v.legalActions.filter(a => a.cardId === cardId);
  if (legal.length) return legal.map(a => `Legal: ${a.label} (${RULES[a.ruleRef]?.ref ?? a.ruleRef}).`);
  if (v.winner !== null) return ['The game is over.'];
  if (v.choice) return [`Waiting for ${v.choice.player === p ? 'your' : 'your opponent\u2019s'} choice: ${v.choice.prompt}`];
  if (v.pending.length && v.priority !== p) reasons.push('A play is pending and your opponent has priority (§6).');
  if (!v.pending.length && v.activePlayer !== p) reasons.push('It is your opponent\u2019s Full Turn. You may only respond to plays with Instants and counters (§4.4).');
  if (v.activePlayer === p && !v.pending.length && v.miniTurns === 0) reasons.push('You have spent your one First Contact Action this turn (§27 15.3). End the turn.');
  if (v.boardLock) reasons.push('Board Lock forbids non-counter Effects and Scuttle (§26 BJ Board Lock State).');
  if (c.rank === '10') reasons.push('All Rank-10 effects are suit-specific and disabled in First Contact (§27 15.7). A 10 can still score 10 or Scuttle.');
  if (c.rank === '2') reasons.push('Two Quick is once per turn during your own turn; the Solo Wild copy is disabled here because it depends on suit matching (source map).');
  if (['3', '9', 'J'].includes(c.rank)) reasons.push(`${cardName(c)} Instant effects need a response window: something must be pending on the stack.`);
  if (['A', 'K', '8'].includes(c.rank)) reasons.push(`${cardName(c)} counters need an eligible pending play: Ace → Effects/counters, King → Anchor/Goal plays, 8 → Scuttle.`);
  if (c.rank === 'J' && !v.boardLock) reasons.push('Jack Attachment needs an enemy PR card that is not an untapped Ace/Joker, not an untapped 4/8, and not protected by Guard.');
  if (c.rank === '8') reasons.push('Aegis Field is disabled in First Contact (§27 15.7).');
  if (c.rank === 'BJ' && v.pending.length) reasons.push('Board Lock can only be declared while the stack is empty (§26 BJ Open-State Declaration).');
  const enemyPR = v.players[opp(p)]!.pr;
  if (enemyPR.length && !enemyPR.some(t => !scuttleImmune(t) && outranks(c, t))) reasons.push('No Scuttle: every enemy PR card outranks this card, ties on a higher suit, or is Scuttle-immune (untapped A, 5, Jokers).');
  return reasons.length ? reasons : ['No legal use at this moment.'];
}

/** Test/lesson helper: confirms all 54 cards exist exactly once with unique handles. */
export function assertGameIntegrity(s: GameState): void {
  const cards = everyCard(s);
  if (cards.length !== 54) throw new Error(`Expected 54 cards, found ${cards.length}`);
  if (new Set(cards.map(c => c.id)).size !== 54) throw new Error('Duplicate card handles');
  if (new Set(cards.map(c => `${c.rank}${c.suit}`)).size !== 54) throw new Error('Duplicate or missing physical cards');
  for (let p = 0; p < 2; p++) for (const j of s.players[p]!.er) if (j.hostId && !s.players[p]!.pr.some(c => c.id === j.hostId)) throw new Error('Dangling Jack');
}

export type { ChoiceKind };
