export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'RJ' | 'BJ';
export type Suit = '♣' | '♦' | '♥' | '♠' | 'joker';
export type Random = () => number;

/**
 * `id` is an opaque, per-game handle. It is replaced whenever the card enters a hand or the Draw Pile,
 * so an identity observed earlier cannot follow the card through hidden zones.
 * `owner` is the player under whose control the card entered OTT (−1 when not OTT); used for Attachment
 * restoration and Purge (§12, §26 A Purge) because First Contact players share one deck.
 */
export interface GameCard { id: string; rank: Rank; suit: Suit; owner: number; tapped?: boolean; hostId?: string; aegis?: number; tapUntil?: number | 'score' | 'hold'; revealed?: number; exileBound?: boolean; wildBound?: boolean; playedForEffect?: boolean; holdCast?: number }

export type MiniTurnType = 'draw' | 'score' | 'effect' | 'scuttle' | 'swap-draw' | 'draw-cast';
export type ActionType = MiniTurnType | 'counter' | 'decline' | 'end' | 'exhausted-pass' | 'choose' | 'generated-effect' | 'start-action' | 'swap-down' | 'voltage';

export interface GameAction { type: ActionType; cardId?: string; targetId?: string; cardIds?: string[]; targetIds?: string[]; mode?: string; label: string; ruleRef: string }

/** Counter-authority class of a pending object (§7, §36 16.1). */
export type PendingClass = 'action' | 'effect' | 'anchor' | 'goal' | 'counter' | 'scuttle' | 'trigger';
export interface StackItem { id: string; player: number; cls: PendingClass; action: GameAction; card?: GameCard; cards?: GameCard[]; miniTurn?: MiniTurnType; drawCount?: number; shield?: boolean; tier?: 'super' | 'ultra' | 'sudden'; theft?: [number, number] }

export type ChoiceKind = 'discard' | 'present' | 'raid-take' | 'recycle' | 'dig-mode' | 'seven-hand' | 'seven-single' | 'generated' | 'seven-score' | 'order' | 'natural-draw' | 'eight-reward' | 'full';
export interface Choice {
  player: number; kind: ChoiceKind; prompt: string; cards: GameCard[]; count: number; public: boolean;
  /** true when `cards` are held only by this choice (revealed from DP); false when they reference hand/GY cards. */
  held: boolean; data: Record<string, string | number | string[]>;
}
/** Source of a resolving effect paused by a choice or generated child play; goes to GY when its resolution completes. */
export interface Suspended { card?: GameCard; depth: number; task?: Choice; theft?: [number, number] }

export interface GamePlayer { hand: GameCard[]; pr: GameCard[]; er: GameCard[]; goal: number; quick2Used: boolean; disrupted: MiniTurnType[]; swapUsed?: boolean; quickQUsed?: boolean; courtUsed?: boolean; tenUsed?: boolean; ultraUsed?: boolean; skips?: number; starts?: number }

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
  | { t: 'win'; p: number | 'draw'; reason: 'goal' | 'exhausted' | 'sudden' }
  | { t: 'pass'; p: number }
  | { t: 'board-lock'; p: number };

export interface GameState {
  version: 2 | 3; profile: 'intrilex-first-contact' | 'intrilex-full';
  players: GamePlayer[]; deck: GameCard[]; graveyard: GameCard[];
  activePlayer: number; phase: 'start' | 'action' | 'finished'; miniTurns: number; turn: number;
  exile?: GameCard[]; swapBar?: {card: GameCard; faceUp: boolean}[]; miniTurnsGranted?: number; miniTurnsUsed?: number; voltage?: number[];
  suddenDeath?: { remaining: number; activationTurn: number; player: number } | null;
  stack: StackItem[]; priority: number; passes: number; choice: Choice | null; suspended: Suspended[];
  boardLock: { remaining: number; activationTurn: number; player: number } | null;
  exhausted: number | null; winner: number | 'draw' | null;
  history: string[]; events: GameEvent[]; seq: number;
}

export interface PlayerView { handCount: number; pr: GameCard[]; er: GameCard[]; goal: number; score: number; guard: boolean; disrupted: MiniTurnType[]; quick2Used: boolean; revealedHand?: GameCard[]; swapUsed?: boolean; skips?: number }
export interface GameView {
  profile: GameState['profile']; you: number | null;
  players: PlayerView[]; hand: GameCard[]; deckCount: number; graveyard: GameCard[];
  activePlayer: number; phase: GameState['phase']; miniTurns: number; turn: number;
  pending: { id: string; player: number; label: string; ruleRef: string; cls: PendingClass; card?: GameCard; cards?: GameCard[] }[];
  exile?: GameCard[]; swapBar?: {slot: number; card?: GameCard}[]; suddenDeath?: GameState['suddenDeath']; miniTurnsGranted?: number; voltage?: number[];
  priority: number; choice: { player: number; kind: ChoiceKind; prompt: string; cards: GameCard[]; count: number } | null;
  boardLock: GameState['boardLock']; exhausted: number | null; winner: GameState['winner'];
  legalActions: GameAction[]; history: string[];
}
