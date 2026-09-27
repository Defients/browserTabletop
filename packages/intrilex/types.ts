export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'RJ' | 'BJ';
export type Suit = '♣' | '♦' | '♥' | '♠' | 'joker';
export type Random = () => number;

/**
 * `id` is an opaque, per-game handle. It is replaced whenever the card enters a hand or the Draw Pile,
 * so an identity observed earlier cannot follow the card through hidden zones.
 * `owner` is the player under whose control the card entered OTT (−1 when not OTT); used for Attachment
 * restoration and Purge (§12, §26 A Purge) because First Contact players share one deck.
 */
export interface GameCard { id: string; rank: Rank; suit: Suit; owner: number; tapped?: boolean; hostId?: string }

export type MiniTurnType = 'draw' | 'score' | 'effect' | 'scuttle';
export type ActionType = 'draw' | 'score' | 'effect' | 'scuttle' | 'counter' | 'decline' | 'end' | 'exhausted-pass' | 'choose' | 'generated-effect';

export interface GameAction { type: ActionType; cardId?: string; targetId?: string; mode?: string; label: string; ruleRef: string }

/** Counter-authority class of a pending object (§7, §36 16.1). */
export type PendingClass = 'action' | 'effect' | 'anchor' | 'goal' | 'counter' | 'scuttle' | 'trigger';
export interface StackItem { id: string; player: number; cls: PendingClass; action: GameAction; card?: GameCard; miniTurn?: MiniTurnType; drawCount?: number }

export type ChoiceKind = 'discard' | 'present' | 'raid-take' | 'recycle' | 'dig-mode' | 'seven-hand' | 'seven-single' | 'generated' | 'seven-score' | 'order' | 'natural-draw' | 'eight-reward';
export interface Choice {
  player: number; kind: ChoiceKind; prompt: string; cards: GameCard[]; count: number; public: boolean;
  /** true when `cards` are held only by this choice (revealed from DP); false when they reference hand/GY cards. */
  held: boolean; data: Record<string, string | number | string[]>;
}
/** Source of a resolving effect paused by a choice or generated child play; goes to GY when its resolution completes. */
export interface Suspended { card: GameCard; depth: number }

export interface GamePlayer { hand: GameCard[]; pr: GameCard[]; er: GameCard[]; goal: number; quick2Used: boolean; disrupted: MiniTurnType[] }

export type GameEvent =
  | { t: 'declare'; p: number; type: ActionType; mode?: string; rank?: Rank; miniTurn?: MiniTurnType }
  | { t: 'resolve'; p: number; cls: PendingClass; mode?: string; rank?: Rank }
  | { t: 'countered'; p: number; by: number; mode?: string }
  | { t: 'fizzle'; p: number; mode?: string }
  | { t: 'score'; p: number; rank: Rank }
  | { t: 'scuttle'; p: number; success: boolean; source: Rank; target?: Rank }
  | { t: 'attach'; p: number; host: Rank }
  | { t: 'choose'; p: number; kind: ChoiceKind; mode?: string }
  | { t: 'draw'; p: number; n: number }
  | { t: 'end-turn'; p: number; score: number; goal: number }
  | { t: 'win'; p: number | 'draw'; reason: 'goal' | 'exhausted' }
  | { t: 'pass'; p: number }
  | { t: 'board-lock'; p: number };

export interface GameState {
  version: 2; profile: 'intrilex-first-contact';
  players: GamePlayer[]; deck: GameCard[]; graveyard: GameCard[];
  activePlayer: number; phase: 'action' | 'finished'; miniTurns: number; turn: number;
  stack: StackItem[]; priority: number; passes: number; choice: Choice | null; suspended: Suspended[];
  boardLock: { remaining: number; activationTurn: number; player: number } | null;
  exhausted: number | null; winner: number | 'draw' | null;
  history: string[]; events: GameEvent[]; seq: number;
}

export interface PlayerView { handCount: number; pr: GameCard[]; er: GameCard[]; goal: number; score: number; guard: boolean; disrupted: MiniTurnType[]; quick2Used: boolean }
export interface GameView {
  profile: 'intrilex-first-contact'; you: number | null;
  players: PlayerView[]; hand: GameCard[]; deckCount: number; graveyard: GameCard[];
  activePlayer: number; phase: GameState['phase']; miniTurns: number; turn: number;
  pending: { id: string; player: number; label: string; ruleRef: string; cls: PendingClass; card?: GameCard }[];
  priority: number; choice: { player: number; kind: ChoiceKind; prompt: string; cards: GameCard[]; count: number } | null;
  boardLock: GameState['boardLock']; exhausted: number | null; winner: GameState['winner'];
  legalActions: GameAction[]; history: string[];
}
