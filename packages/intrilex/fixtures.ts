import type { GameCard, GameState, Random, Rank, Suit } from './types.js';
import { GOAL, fullDeck, shuffle, assertGameIntegrity } from './engine.js';

/** Deterministic PRNG for tests, fixtures and lessons only. Never used for live play. */
export function seeded(seed: number): Random {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function parseCard(text: string): { rank: Rank; suit: Suit; tapped: boolean } {
  const tapped = text.endsWith('*');
  const t = tapped ? text.slice(0, -1) : text;
  if (t === 'RJ' || t === 'BJ') return { rank: t, suit: 'joker', tapped };
  const m = /^(A|[2-9]|10|J|Q|K)([♣♦♥♠])$/.exec(t);
  if (!m) throw new Error(`Unknown card notation: ${text}`);
  return { rank: m[1] as Rank, suit: m[2] as Suit, tapped };
}

export type ErSpec = string | { card: string; host: string };
export interface FixtureSpec {
  /** Active player (lessons use 0 for the learner). */
  active?: 0 | 1; turn?: number; miniTurns?: number;
  hands: [string[], string[]]; pr?: [string[], string[]]; er?: [ErSpec[], ErSpec[]];
  graveyard?: string[]; deckTop?: string[]; goals?: [number, number]; seed?: number;
  boardLock?: { remaining: number; activationTurn: number; player: number }; exhausted?: number | null;
  /** Put every unlisted card in the graveyard instead of the Draw Pile (for Exhausted scenarios). */
  restToGraveyard?: boolean;
}

/**
 * Builds a canonical First Contact state from a written position. All 54 cards are always present:
 * unlisted cards go to DP (below `deckTop`, seeded order) or to GY with `restToGraveyard`.
 */
export function fixture(spec: FixtureSpec): GameState {
  const random = seeded(spec.seed ?? 1);
  const pool = new Map(fullDeck().map(c => [`${c.rank}${c.suit === 'joker' ? '' : c.suit}`, c]));
  const used = new Set<string>();
  let n = 0;
  const make = (text: string, owner = -1): GameCard => {
    const { rank, suit, tapped } = parseCard(text);
    const key = `${rank}${suit === 'joker' ? '' : suit}`;
    if (!pool.has(key) || used.has(key)) throw new Error(`Card ${key} is missing or used twice in fixture`);
    used.add(key);
    return { id: `f${++n}x${Math.floor(random() * 1e9).toString(36)}`, rank, suit, owner, ...(tapped ? { tapped: true } : {}) };
  };
  const active = spec.active ?? 0;
  const players = [0, 1].map(p => ({ hand: spec.hands[p]!.map(t => make(t)), pr: (spec.pr?.[p] ?? []).map(t => make(t, p)), er: [] as GameCard[], goal: spec.goals?.[p] ?? GOAL, quick2Used: false, disrupted: [] as never[] }));
  for (let p = 0; p < 2; p++) for (const e of spec.er?.[p] ?? []) {
    if (typeof e === 'string') { players[p]!.er.push(make(e, p)); continue; }
    const want = parseCard(e.host);
    const host = players[p]!.pr.find(c => c.rank === want.rank && c.suit === want.suit);
    if (!host) throw new Error(`Jack host ${e.host} must be listed in the same player's PR`);
    host.owner = 1 - p;
    players[p]!.er.push({ ...make(e.card, p), hostId: host.id });
  }
  const graveyard = (spec.graveyard ?? []).map(t => make(t));
  const deckTop = (spec.deckTop ?? []).map(t => make(t));
  const rest = shuffle([...pool.entries()].filter(([k]) => !used.has(k)).map(([, c]) => ({ id: `f${++n}x${Math.floor(random() * 1e9).toString(36)}`, ...c, owner: -1 })), random);
  const s: GameState = {
    version: 2, profile: 'intrilex-first-contact', players,
    deck: spec.restToGraveyard ? deckTop : [...deckTop, ...rest], graveyard: spec.restToGraveyard ? [...graveyard, ...rest] : graveyard,
    activePlayer: active, phase: 'action', miniTurns: spec.miniTurns ?? 1, turn: spec.turn ?? 3,
    stack: [], priority: active, passes: 0, choice: null, suspended: [],
    boardLock: spec.boardLock ?? null, exhausted: spec.exhausted ?? null, winner: null,
    history: ['Teaching position loaded (fixed deal).'], events: [], seq: 0,
  };
  assertGameIntegrity(s);
  return s;
}

/** Find a card by notation anywhere in the state (tests and lessons). */
export function findCard(s: GameState, text: string): GameCard | undefined {
  const { rank, suit } = parseCard(text);
  const all = [...s.players.flatMap(p => [...p.hand, ...p.pr, ...p.er]), ...s.deck, ...s.graveyard, ...s.stack.flatMap(i => (i.card ? [i.card] : [])), ...(s.choice?.held ? s.choice.cards : [])];
  return all.find(c => c.rank === rank && c.suit === suit);
}
