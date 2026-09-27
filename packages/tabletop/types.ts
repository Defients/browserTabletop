/** Injected randomness. Live server/browser use a CSPRNG-backed source; tests and lessons may inject seeded sources. */
export type Random = () => number;

export type ZoneKind = 'table' | 'hand' | 'pile';
/**
 * public: everyone sees faces (face-down table cards still hide their face).
 * owner:  only `owner` sees faces/contents; others see counts (piles/hands) or backs (table).
 * hidden: nobody sees contents; counts only (piles).
 */
export type Visibility = 'public' | 'owner' | 'hidden';

export interface Zone { id: string; name: string; kind: ZoneKind; visibility: Visibility; owner?: number; x: number; y: number; width: number; height: number }

export type ComponentKind = 'counter' | 'token' | 'dice' | 'note' | 'label';
export interface Component { id: string; kind: ComponentKind; text: string; value: number; x: number; y: number; locked: boolean; sides?: number; color?: string; attachedTo?: string }

export interface CardDefinition { id: string; rank: string; suit: string; face?: string }
/** Deck cards are listed bottom to top. */
export interface DeckDefinition { id: string; zone: string; cards: string[] }

export type SetupOperation =
  | { op: 'shuffle'; zone: string }
  | { op: 'deal'; zone: string; target: string; count: number }
  | { op: 'place'; zone: string; target: string; count: number; faceUp: boolean }
  | { op: 'initialize-counter'; id: string; value: number }
  | { op: 'choose-first-seat' }
  | { op: 'deal-seat'; zone: string; seat: 'first' | 'second'; count: number };

export interface SeatPosition { seat: number; x: number; y: number }
export interface TableLabel { text: string; x: number; y: number }

/** The layout/component subset of a template that the generic engine needs. */
export interface TableDefinition {
  width: number; height: number; seats: number; background: string;
  zones: Zone[]; cards: CardDefinition[]; decks: DeckDefinition[]; objects: Component[];
  setup: SetupOperation[]; labels: TableLabel[]; seatLayout: SeatPosition[];
}

/**
 * Server-internal card instance. `id` is canonical and never leaves the server.
 * `handle` is the only client-observable identity; it rotates whenever the card enters a hand or a
 * non-public pile and whenever it is shuffled, so earlier observations cannot track it.
 */
export interface CardInstance {
  id: string; rank: string; suit: string; art?: string; handle: string;
  zone: string; x: number; y: number; rotation: number; faceUp: boolean; locked: boolean;
  attachedTo?: string; seenBy: number[]; revealedToAll: boolean;
}

export interface TableState {
  version: 1; width: number; height: number; seats: number; background: string;
  zones: Zone[]; labels: TableLabel[]; seatLayout: SeatPosition[];
  cards: Record<string, CardInstance>;
  /** zone id -> canonical ids; last element is the top of a pile / front-most on a table. */
  order: Record<string, string[]>;
  objects: Component[]; history: string[]; seq: number; firstSeat?: number;
}

export interface TableActor { seat: number | null; host: boolean }

export type Layout = 'align' | 'stack' | 'fan' | 'unstack';
export type TableCommand =
  | { type: 'move'; ids: string[]; zone: string; x?: number; y?: number; position?: 'top' | 'bottom'; faceUp?: boolean }
  | { type: 'flip'; ids: string[] }
  | { type: 'rotate'; ids: string[]; degrees: number }
  | { type: 'arrange'; ids: string[]; layout: Layout }
  | { type: 'draw'; zone: string; count: number }
  | { type: 'deal'; zone: string; count: number; seats: number[] }
  | { type: 'split'; zone: string; count: number; target: string }
  | { type: 'merge'; zone: string; target: string }
  | { type: 'shuffle'; zone: string }
  | { type: 'shuffle-selection'; ids: string[] }
  | { type: 'reorder-hand'; ids: string[] }
  | { type: 'sort-hand'; by: 'rank' | 'suit' }
  | { type: 'reveal'; ids: string[]; to: 'all' | number[] }
  | { type: 'hide'; ids: string[] }
  | { type: 'lock'; ids: string[]; locked: boolean }
  | { type: 'attach'; ids: string[]; target: string }
  | { type: 'detach'; ids: string[] }
  | { type: 'add-component'; kind: ComponentKind; text: string; value: number; x: number; y: number; sides?: number }
  | { type: 'update-component'; id: string; text?: string; value?: number; x?: number; y?: number }
  | { type: 'remove-component'; id: string }
  | { type: 'roll'; id: string };

/** A card as one viewer may see it. `id` is the visibility-scoped handle. */
export interface CardView {
  id: string; zone: string; x: number; y: number; rotation: number; faceUp: boolean; locked: boolean;
  attachedTo?: string; rank?: string; suit?: string; art?: string; revealed?: boolean;
}
export interface ZoneView extends Zone { count: number }
export interface TableView {
  width: number; height: number; seats: number; background: string;
  zones: ZoneView[]; cards: CardView[]; objects: Component[]; labels: TableLabel[]; seatLayout: SeatPosition[];
  history: string[]; firstSeat?: number;
}
