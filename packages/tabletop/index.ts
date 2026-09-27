import type {
  CardInstance, CardView, Component, ComponentKind, Layout, Random, TableActor, TableCommand, TableDefinition,
  TableState, TableView, Zone,
} from './types.js';
export type * from './types.js';

/** Generic, rules-free tabletop domain. Knows nothing about any particular game. */

export const CARD_WIDTH = 72;
export const CARD_HEIGHT = 100;
export const LIMITS = { handleCount: 64, maxCount: 60, objects: 160, text: 500, history: 200, value: 999_999 } as const;

export class TableError extends Error {
  constructor(public code: string, message = code) { super(message); }
}
const fail = (code: string, message?: string): never => { throw new TableError(code, message); };

export function secureRandom(): number {
  const a = new Uint32Array(2);
  globalThis.crypto.getRandomValues(a);
  return (a[0]! * 2 ** 21 + (a[1]! >>> 11)) / 2 ** 53;
}

function newHandle(random: Random, taken: Set<string>): string {
  for (;;) {
    let h = 'c';
    for (let i = 0; i < 4; i++) h += Math.floor(random() * 2 ** 26).toString(36).padStart(6, '0');
    if (!taken.has(h)) { taken.add(h); return h; }
  }
}

export function shuffleInPlace<T>(items: T[], random: Random): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(random() * (i + 1)));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
}

/** Stable art keys: identical images share a key, so a key reveals no more than the face itself. */
export function artIndex(def: Pick<TableDefinition, 'cards'>): { keyFor: Record<string, string>; images: Record<string, string> } {
  const byImage = new Map<string, string>();
  const keyFor: Record<string, string> = {};
  const images: Record<string, string> = {};
  for (const card of def.cards) {
    if (!card.face) continue;
    let key = byImage.get(card.face);
    if (!key) { key = `art-${byImage.size}`; byImage.set(card.face, key); images[key] = card.face; }
    keyFor[card.id] = key;
  }
  return { keyFor, images };
}

const SUIT_SYMBOL: Record<string, string> = { clubs: '♣', diamonds: '♦', hearts: '♥', spades: '♠' };
export function cardLabel(card: { rank?: string; suit?: string }): string {
  if (!card.rank) return 'Face-down card';
  if (card.rank === 'RJ') return 'Red Joker';
  if (card.rank === 'BJ') return 'Black Joker';
  return `${card.rank}${SUIT_SYMBOL[card.suit ?? ''] ?? (card.suit ? ` ${card.suit}` : '')}`;
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const hiddenContainer = (zone: Zone) => zone.kind === 'hand' || (zone.kind === 'pile' && zone.visibility !== 'public');

// ---------------------------------------------------------------- setup

export function createTable(def: TableDefinition, random: Random = secureRandom): TableState {
  const { keyFor } = artIndex(def);
  const taken = new Set<string>();
  const s: TableState = {
    version: 1, width: def.width, height: def.height, seats: def.seats, background: def.background,
    zones: structuredClone(def.zones), labels: structuredClone(def.labels), seatLayout: structuredClone(def.seatLayout),
    cards: {}, order: Object.fromEntries(def.zones.map(z => [z.id, [] as string[]])),
    objects: structuredClone(def.objects), history: [], seq: 0,
  };
  const defs = new Map(def.cards.map(c => [c.id, c]));
  for (const deck of def.decks) {
    const zone = s.zones.find(z => z.id === deck.zone) ?? fail('SETUP_INVALID', `Deck zone ${deck.zone} missing`);
    for (const id of deck.cards) {
      const d = defs.get(id) ?? fail('SETUP_INVALID', `Card ${id} missing`);
      s.cards[id] = {
        id, rank: d.rank, suit: d.suit, ...(keyFor[id] ? { art: keyFor[id] } : {}), handle: newHandle(random, taken),
        zone: zone.id, x: zone.x + 8, y: zone.y + 8, rotation: 0, faceUp: zone.kind === 'pile' && zone.visibility === 'public',
        locked: false, seenBy: [], revealedToAll: false,
      };
      s.order[zone.id]!.push(id);
    }
  }
  const ctx = new Context(s, { seat: null, host: true }, random);
  for (const op of def.setup) {
    switch (op.op) {
      case 'shuffle': ctx.shufflePile(ctx.zone(op.zone)); break;
      case 'deal': ctx.transfer(ctx.zone(op.zone), ctx.zone(op.target), op.count, false); break;
      case 'place': ctx.transfer(ctx.zone(op.zone), ctx.zone(op.target), op.count, op.faceUp); break;
      case 'initialize-counter': { const o = s.objects.find(x => x.id === op.id) ?? fail('SETUP_INVALID'); o.value = op.value; break; }
      case 'choose-first-seat': s.firstSeat = Math.min(s.seats - 1, Math.floor(random() * s.seats)); s.history.push(`Seat ${s.firstSeat + 1} was randomly chosen to go first.`); break;
      case 'deal-seat': {
        const first = s.firstSeat ?? 0;
        const seat = op.seat === 'first' ? first : (first + 1) % s.seats;
        const hand = s.zones.find(z => z.kind === 'hand' && z.owner === seat) ?? fail('SETUP_INVALID', `Seat ${seat} has no hand`);
        ctx.transfer(ctx.zone(op.zone), hand, op.count, false);
        break;
      }
    }
  }
  s.history.push('Table set up from its template.');
  assertInvariants(s);
  return s;
}

// ---------------------------------------------------------------- visibility

function zoneById(s: TableState, id: string) { return s.zones.find(z => z.id === id); }

export function faceVisible(s: TableState, card: CardInstance, seat: number | null): boolean {
  const zone = zoneById(s, card.zone)!;
  const revealed = card.revealedToAll || (seat !== null && card.seenBy.includes(seat));
  if (zone.kind === 'hand') return seat === zone.owner || revealed;
  if (zone.kind === 'pile') return zone.visibility === 'public' || (zone.visibility === 'owner' && seat === zone.owner);
  return (card.faceUp && (zone.visibility === 'public' || seat === zone.owner)) || revealed;
}

export function positionVisible(s: TableState, card: CardInstance, seat: number | null): boolean {
  const zone = zoneById(s, card.zone)!;
  if (zone.kind === 'table') return true;
  if (zone.kind === 'pile') return zone.visibility === 'public' || (zone.visibility === 'owner' && seat === zone.owner);
  return seat === zone.owner || card.revealedToAll || (seat !== null && card.seenBy.includes(seat));
}

export function projectTable(s: TableState, seat: number | null): TableView {
  const cards: CardView[] = [];
  for (const zone of s.zones) {
    for (const id of s.order[zone.id]!) {
      const c = s.cards[id]!;
      if (!positionVisible(s, c, seat)) continue;
      const face = faceVisible(s, c, seat);
      const host = c.attachedTo ? s.cards[c.attachedTo] : undefined;
      cards.push({
        id: c.handle, zone: c.zone, x: c.x, y: c.y, rotation: c.rotation, faceUp: zone.kind === 'table' ? c.faceUp : face, locked: c.locked,
        ...(host ? { attachedTo: host.handle } : {}),
        ...(face ? { rank: c.rank, suit: c.suit, ...(c.art ? { art: c.art } : {}) } : {}),
        ...(face && (c.revealedToAll || (seat !== null && c.seenBy.includes(seat))) && !(zone.kind === 'table' && c.faceUp) && seat !== zone.owner ? { revealed: true } : {}),
      });
    }
  }
  const handleOf = (id: string | undefined) => (id && s.cards[id] ? s.cards[id]!.handle : undefined);
  return {
    width: s.width, height: s.height, seats: s.seats, background: s.background,
    zones: s.zones.map(z => ({ ...z, count: s.order[z.id]!.length })),
    cards,
    objects: s.objects.map(o => { const { attachedTo, ...rest } = o; const h = handleOf(attachedTo); return h ? { ...rest, attachedTo: h } : rest; }),
    labels: structuredClone(s.labels), seatLayout: structuredClone(s.seatLayout), history: s.history.slice(-60),
    ...(s.firstSeat === undefined ? {} : { firstSeat: s.firstSeat }),
  };
}

// ---------------------------------------------------------------- invariants

/** Throws when canonical state is inconsistent. Used after every application and by tests. */
export function assertInvariants(s: TableState): void {
  const seen = new Set<string>();
  const handles = new Set<string>();
  const zoneIds = new Set(s.zones.map(z => z.id));
  for (const zid of Object.keys(s.order)) if (!zoneIds.has(zid)) fail('INVARIANT', `order for unknown zone ${zid}`);
  for (const zone of s.zones) {
    const ids = s.order[zone.id];
    if (!ids) fail('INVARIANT', `zone ${zone.id} has no order`);
    for (const id of ids!) {
      const c = s.cards[id];
      if (!c) fail('INVARIANT', `dangling card ${id}`);
      if (seen.has(id)) fail('INVARIANT', `card ${id} appears twice`);
      seen.add(id);
      if (c!.zone !== zone.id) fail('INVARIANT', `card ${id} zone mismatch`);
      if (handles.has(c!.handle)) fail('INVARIANT', `duplicate handle`);
      handles.add(c!.handle);
      if (!Number.isFinite(c!.x) || !Number.isFinite(c!.y) || c!.x < 0 || c!.y < 0 || c!.x > s.width || c!.y > s.height) fail('INVARIANT', `card ${id} off table`);
      if (zone.kind === 'pile' && c!.faceUp !== (zone.visibility === 'public')) fail('INVARIANT', `pile face state ${id}`);
      if (c!.attachedTo) {
        const host = s.cards[c!.attachedTo];
        if (!host || host.id === id || host.attachedTo || host.zone !== c!.zone || zone.kind !== 'table') fail('INVARIANT', `bad attachment ${id}`);
      }
    }
  }
  if (seen.size !== Object.keys(s.cards).length) fail('INVARIANT', 'card missing from every zone');
  for (const o of s.objects) {
    if (o.attachedTo) { const host = s.cards[o.attachedTo]; if (!host || zoneById(s, host.zone)!.kind !== 'table') fail('INVARIANT', `bad component attachment ${o.id}`); }
  }
  if (new Set(s.objects.map(o => o.id)).size !== s.objects.length) fail('INVARIANT', 'duplicate component id');
}

// ---------------------------------------------------------------- command parsing (trust boundary)

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, max = 100): string => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : fail('INVALID_COMMAND'));
const text = (v: unknown, max = LIMITS.text): string => (typeof v === 'string' && v.length <= max ? v : fail('INVALID_COMMAND'));
const int = (v: unknown, min: number, max: number): number => (typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : fail('INVALID_COMMAND'));
const coord = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 10_000 ? v : fail('INVALID_COMMAND'));
const ids = (v: unknown): string[] => {
  if (!Array.isArray(v) || v.length < 1 || v.length > LIMITS.handleCount) fail('INVALID_COMMAND');
  const out = (v as unknown[]).map(x => str(x, 64));
  if (new Set(out).size !== out.length) fail('INVALID_COMMAND');
  return out;
};
const KINDS: ComponentKind[] = ['counter', 'token', 'dice', 'note', 'label'];
const LAYOUTS: Layout[] = ['align', 'stack', 'fan', 'unstack'];

export function parseTableCommand(input: unknown): TableCommand {
  if (!isObj(input)) return fail('INVALID_COMMAND');
  const c = input;
  switch (c.type) {
    case 'move': return {
      type: 'move', ids: ids(c.ids), zone: str(c.zone),
      ...(c.x === undefined ? {} : { x: coord(c.x) }), ...(c.y === undefined ? {} : { y: coord(c.y) }),
      ...(c.position === undefined ? {} : { position: c.position === 'bottom' ? 'bottom' : c.position === 'top' ? 'top' : fail('INVALID_COMMAND') }),
      ...(c.faceUp === undefined ? {} : { faceUp: typeof c.faceUp === 'boolean' ? c.faceUp : fail('INVALID_COMMAND') }),
    };
    case 'flip': case 'hide': case 'detach': case 'shuffle-selection': case 'reorder-hand': return { type: c.type, ids: ids(c.ids) } as TableCommand;
    case 'rotate': return { type: 'rotate', ids: ids(c.ids), degrees: int(c.degrees, -360, 360) };
    case 'arrange': return { type: 'arrange', ids: ids(c.ids), layout: LAYOUTS.includes(c.layout as Layout) ? c.layout as Layout : fail('INVALID_COMMAND') };
    case 'draw': return { type: 'draw', zone: str(c.zone), count: int(c.count, 1, LIMITS.maxCount) };
    case 'deal': {
      if (!Array.isArray(c.seats) || c.seats.length < 1 || c.seats.length > 8) fail('INVALID_COMMAND');
      const seats = (c.seats as unknown[]).map(x => int(x, 0, 7));
      if (new Set(seats).size !== seats.length) fail('INVALID_COMMAND');
      return { type: 'deal', zone: str(c.zone), count: int(c.count, 1, 30), seats };
    }
    case 'split': return { type: 'split', zone: str(c.zone), count: int(c.count, 1, 300), target: str(c.target) };
    case 'merge': return { type: 'merge', zone: str(c.zone), target: str(c.target) };
    case 'shuffle': return { type: 'shuffle', zone: str(c.zone) };
    case 'sort-hand': return { type: 'sort-hand', by: c.by === 'suit' ? 'suit' : c.by === 'rank' ? 'rank' : fail('INVALID_COMMAND') };
    case 'reveal': {
      let to: 'all' | number[];
      if (c.to === 'all') to = 'all';
      else if (Array.isArray(c.to) && c.to.length >= 1 && c.to.length <= 8) to = [...new Set((c.to as unknown[]).map(x => int(x, 0, 7)))];
      else return fail('INVALID_COMMAND');
      return { type: 'reveal', ids: ids(c.ids), to };
    }
    case 'lock': return { type: 'lock', ids: ids(c.ids), locked: typeof c.locked === 'boolean' ? c.locked : fail('INVALID_COMMAND') };
    case 'attach': return { type: 'attach', ids: ids(c.ids), target: str(c.target, 64) };
    case 'add-component': return {
      type: 'add-component', kind: KINDS.includes(c.kind as ComponentKind) ? c.kind as ComponentKind : fail('INVALID_COMMAND'),
      text: text(c.text), value: int(c.value ?? 0, -LIMITS.value, LIMITS.value), x: coord(c.x), y: coord(c.y),
      ...(c.sides === undefined ? {} : { sides: int(c.sides, 2, 100) }),
    };
    case 'update-component': return {
      type: 'update-component', id: str(c.id, 64),
      ...(c.text === undefined ? {} : { text: text(c.text) }), ...(c.value === undefined ? {} : { value: int(c.value, -LIMITS.value, LIMITS.value) }),
      ...(c.x === undefined ? {} : { x: coord(c.x) }), ...(c.y === undefined ? {} : { y: coord(c.y) }),
    };
    case 'remove-component': case 'roll': return { type: c.type, id: str(c.id, 64) };
    default: return fail('UNKNOWN_COMMAND');
  }
}

/** Commands that remain meaningful if other accepted commands happened first (all references are revalidated). */
export function rebaseSafe(command: TableCommand): boolean {
  return !['shuffle', 'shuffle-selection', 'deal', 'split', 'merge'].includes(command.type);
}

/**
 * Undo is offered only for purely public, non-random arrangement commands. Anything that draws, deals,
 * shuffles, reveals, flips, or moves cards into/out of hidden containers crosses an information boundary.
 */
export function undoable(s: TableState, command: TableCommand): boolean {
  if (['rotate', 'arrange', 'attach', 'detach', 'add-component', 'update-component', 'remove-component', 'lock'].includes(command.type)) return true;
  if (command.type !== 'move') return false;
  const dest = zoneById(s, command.zone);
  if (!dest || dest.kind !== 'table' || command.faceUp !== undefined) return false;
  return command.ids.every(h => { const c = Object.values(s.cards).find(x => x.handle === h); return !!c && zoneById(s, c.zone)!.kind === 'table'; });
}

// ---------------------------------------------------------------- application

class Context {
  handles: Set<string>;
  constructor(public s: TableState, public actor: TableActor, public random: Random) {
    this.handles = new Set(Object.values(s.cards).map(c => c.handle));
  }
  get seat(): number { return this.actor.seat ?? fail('SEAT_REQUIRED'); }
  zone(id: string): Zone { return zoneById(this.s, id) ?? fail('ZONE_NOT_FOUND'); }
  log(message: string) { this.s.history = [...this.s.history, message].slice(-LIMITS.history); }
  who() { return this.actor.seat === null ? 'Setup' : `Seat ${this.actor.seat + 1}`; }

  /** Resolve a client handle, but only if this actor can currently see that card's position. */
  card(handle: string): CardInstance {
    const c = Object.values(this.s.cards).find(x => x.handle === handle);
    if (!c || !positionVisible(this.s, c, this.actor.seat)) fail('CARD_NOT_AVAILABLE', 'That card is not available to you.');
    return c!;
  }
  canTouch(c: CardInstance): void {
    const zone = this.zone(c.zone);
    if (c.locked) fail('LOCKED', 'That card is locked.');
    if (zone.kind === 'hand' && zone.owner !== this.seat) fail('NOT_YOUR_HAND', 'Cards in another player\u2019s hand cannot be moved.');
    if (zone.visibility === 'owner' && zone.owner !== this.seat) fail('ZONE_PRIVATE', 'That area belongs to another seat.');
  }
  canPlaceInto(zone: Zone): void {
    if (zone.kind !== 'hand' && zone.visibility === 'owner' && zone.owner !== this.seat) fail('ZONE_PRIVATE', 'That area belongs to another seat.');
  }
  rotateHandle(c: CardInstance) { this.handles.delete(c.handle); c.handle = newHandle(this.random, this.handles); }

  detachFrom(hostId: string) {
    for (const c of Object.values(this.s.cards)) if (c.attachedTo === hostId) delete c.attachedTo;
    for (const o of this.s.objects) if (o.attachedTo === hostId) delete o.attachedTo;
  }

  /** Move one card between containers, enforcing face state, reveal reset, attachment and handle rules. */
  place(c: CardInstance, dest: Zone, position: 'top' | 'bottom' = 'top', faceUp?: boolean) {
    const from = this.zone(c.zone);
    this.s.order[from.id] = this.s.order[from.id]!.filter(id => id !== c.id);
    if (position === 'bottom') this.s.order[dest.id]!.unshift(c.id); else this.s.order[dest.id]!.push(c.id);
    const changedZone = from.id !== dest.id;
    c.zone = dest.id;
    if (dest.kind !== 'table') { this.detachFrom(c.id); delete c.attachedTo; c.rotation = 0; }
    if (changedZone) { c.seenBy = []; c.revealedToAll = false; }
    if (dest.kind === 'pile') c.faceUp = dest.visibility === 'public';
    else if (dest.kind === 'hand') c.faceUp = false;
    else if (faceUp !== undefined) c.faceUp = faceUp;
    else if (from.kind !== 'table') c.faceUp = from.kind === 'hand' || from.visibility === 'public';
    if (changedZone && hiddenContainer(dest)) this.rotateHandle(c);
    if (dest.kind !== 'table') { c.x = clamp(dest.x + 8, 0, this.s.width); c.y = clamp(dest.y + 8, 0, this.s.height); }
  }

  transfer(from: Zone, to: Zone, count: number, faceUp: boolean) {
    if (from.id === to.id) fail('INVALID_TARGET');
    for (let i = 0; i < count; i++) {
      const id = this.s.order[from.id]!.at(-1);
      if (!id) break;
      const c = this.s.cards[id]!;
      this.place(c, to, 'top', faceUp);
      if (to.kind === 'table') { c.x = clamp(to.x + 10 + i * (CARD_WIDTH + 10), 0, this.s.width - CARD_WIDTH); c.y = clamp(to.y + 20, 0, this.s.height - CARD_HEIGHT); }
    }
  }

  shufflePile(zone: Zone) {
    if (zone.kind !== 'pile') fail('INVALID_TARGET', 'Only piles can be shuffled.');
    shuffleInPlace(this.s.order[zone.id]!, this.random);
    // Knowledge of any card's identity or position in this pile is destroyed.
    for (const id of this.s.order[zone.id]!) { const c = this.s.cards[id]!; c.seenBy = []; c.revealedToAll = false; this.rotateHandle(c); }
  }

  pile(id: string): Zone {
    const z = this.zone(id);
    if (z.kind !== 'pile') fail('INVALID_TARGET', 'Choose a pile.');
    if (z.visibility === 'owner' && z.owner !== this.seat) fail('ZONE_PRIVATE', 'That pile belongs to another seat.');
    return z;
  }
  hand(seat: number): Zone { return this.s.zones.find(z => z.kind === 'hand' && z.owner === seat) ?? fail('NO_HAND', `Seat ${seat + 1} has no hand zone.`); }
  tableCards(handles: string[]) {
    return handles.map(h => { const c = this.card(h); if (this.zone(c.zone).kind !== 'table') fail('NOT_ON_TABLE', 'That control works on table cards.'); this.canTouch(c); return c; });
  }
  component(id: string): Component { return this.s.objects.find(o => o.id === id) ?? fail('COMPONENT_NOT_FOUND'); }
  editable(o: Component) { if (o.locked && !this.actor.host) fail('LOCKED', 'That component is locked.'); }
  nextId(prefix: string) { this.s.seq++; return `${prefix}${this.s.seq}`; }
}

const RANK_ORDER = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'RJ', 'BJ'];
const rankIndex = (r: string) => { const i = RANK_ORDER.indexOf(r); return i < 0 ? 100 + r.charCodeAt(0) : i; };

export function applyTable(state: TableState, actor: TableActor, input: unknown, random: Random = secureRandom): TableState {
  const command = parseTableCommand(input);
  if (actor.seat === null) fail('SEAT_REQUIRED', 'Take a seat to change the table.');
  const s = structuredClone(state);
  const x = new Context(s, actor, random);
  const who = x.who();

  switch (command.type) {
    case 'move': {
      const dest = x.zone(command.zone);
      x.canPlaceInto(dest);
      const cards = command.ids.map(h => { const c = x.card(h); x.canTouch(c); return c; });
      const moving = new Set(cards.map(c => c.id));
      const anchor = cards[0]!;
      const fromTable = x.zone(anchor.zone).kind === 'table';
      const tx = command.x ?? dest.x + 12, ty = command.y ?? dest.y + 12;
      const dx = fromTable ? tx - anchor.x : 0, dy = fromTable ? ty - anchor.y : 0;
      const seenFaces = cards.map(c => faceVisible(s, c, null) ? cardLabel(c) : null);
      cards.forEach((c, i) => {
        const wasTable = x.zone(c.zone).kind === 'table';
        if (c.attachedTo && !moving.has(c.attachedTo)) delete c.attachedTo;
        const ox = c.x, oy = c.y;
        x.place(c, dest, command.position ?? 'top', command.faceUp);
        if (dest.kind === 'table') {
          c.x = clamp(wasTable && fromTable ? ox + dx : tx + i * 18, 0, s.width - CARD_WIDTH);
          c.y = clamp(wasTable && fromTable ? oy + dy : ty, 0, s.height - CARD_HEIGHT);
          const mx = c.x - ox, my = c.y - oy;
          for (const a of Object.values(s.cards)) if (a.attachedTo === c.id && !moving.has(a.id)) {
            x.place(a, dest, 'top');
            a.x = clamp(a.x + mx, 0, s.width - CARD_WIDTH); a.y = clamp(a.y + my, 0, s.height - CARD_HEIGHT);
          }
          for (const o of s.objects) if (o.attachedTo === c.id) { o.x = clamp(o.x + mx, 0, s.width); o.y = clamp(o.y + my, 0, s.height); }
        }
      });
      const named = dest.kind === 'table' && cards.every((c, i) => seenFaces[i] && faceVisible(s, c, null));
      x.log(`${who} moved ${named ? seenFaces.join(', ') : `${cards.length} card${cards.length === 1 ? '' : 's'}`} to ${dest.name}${command.position === 'bottom' ? ' (bottom)' : ''}.`);
      break;
    }
    case 'flip': {
      const cards = x.tableCards(command.ids);
      for (const c of cards) { c.faceUp = !c.faceUp; if (!c.faceUp) { c.seenBy = []; c.revealedToAll = false; } }
      const up = cards.filter(c => c.faceUp && faceVisible(s, c, null)).map(cardLabel);
      x.log(`${who} flipped ${cards.length} card${cards.length === 1 ? '' : 's'}${up.length ? ` (revealing ${up.join(', ')})` : ''}.`);
      break;
    }
    case 'rotate': {
      for (const c of x.tableCards(command.ids)) c.rotation = (((c.rotation + command.degrees) % 360) + 360) % 360;
      x.log(`${who} rotated ${command.ids.length} card${command.ids.length === 1 ? '' : 's'}.`);
      break;
    }
    case 'arrange': {
      const cards = x.tableCards(command.ids);
      const zone = cards[0]!.zone;
      if (cards.some(c => c.zone !== zone)) fail('MIXED_ZONES', 'Arrange cards within one area at a time.');
      const ox = cards[0]!.x, oy = cards[0]!.y;
      const step = command.layout === 'fan' ? 20 : command.layout === 'align' || command.layout === 'unstack' ? CARD_WIDTH + 10 : 0;
      cards.forEach((c, i) => {
        delete c.attachedTo;
        c.x = clamp(ox + i * step, 0, s.width - CARD_WIDTH);
        c.y = clamp(command.layout === 'unstack' ? oy + Math.floor(i / 10) * (CARD_HEIGHT + 10) : oy, 0, s.height - CARD_HEIGHT);
        if (command.layout === 'unstack') c.x = clamp(ox + (i % 10) * step, 0, s.width - CARD_WIDTH);
        // Later cards in the selection sit above earlier ones.
        s.order[zone] = [...s.order[zone]!.filter(id => id !== c.id), c.id];
      });
      x.log(`${who} arranged ${cards.length} cards (${command.layout}).`);
      break;
    }
    case 'draw': {
      const pile = x.pile(command.zone);
      const before = s.order[pile.id]!.length;
      if (!before) fail('EMPTY_PILE', 'That pile is empty.');
      x.transfer(pile, x.hand(x.seat), command.count, false);
      const n = before - s.order[pile.id]!.length;
      x.log(`${who} drew ${n} card${n === 1 ? '' : 's'} from ${pile.name}.`);
      break;
    }
    case 'deal': {
      const pile = x.pile(command.zone);
      if (!s.order[pile.id]!.length) fail('EMPTY_PILE', 'That pile is empty.');
      const hands = command.seats.map(seat => { if (seat >= s.seats) fail('INVALID_SEAT'); return x.hand(seat); });
      let dealt = 0;
      for (let round = 0; round < command.count; round++) for (const hand of hands) {
        if (!s.order[pile.id]!.length) break;
        x.transfer(pile, hand, 1, false); dealt++;
      }
      x.log(`${who} dealt ${dealt} card${dealt === 1 ? '' : 's'} from ${pile.name} to ${command.seats.map(n => `Seat ${n + 1}`).join(', ')}.`);
      break;
    }
    case 'split': {
      const from = x.pile(command.zone), to = x.pile(command.target);
      if (from.id === to.id) fail('INVALID_TARGET');
      const moving = s.order[from.id]!.slice(-command.count);
      if (!moving.length) fail('EMPTY_PILE', 'That pile is empty.');
      for (const id of moving) x.place(s.cards[id]!, to, 'top');
      x.log(`${who} split ${moving.length} card${moving.length === 1 ? '' : 's'} from ${from.name} onto ${to.name}.`);
      break;
    }
    case 'merge': {
      const from = x.pile(command.zone), to = x.pile(command.target);
      if (from.id === to.id) fail('INVALID_TARGET');
      const moving = s.order[from.id]!.slice();
      if (!moving.length) fail('EMPTY_PILE', 'That pile is empty.');
      for (const id of moving) x.place(s.cards[id]!, to, 'top');
      x.log(`${who} merged ${from.name} onto ${to.name}.`);
      break;
    }
    case 'shuffle': {
      const pile = x.pile(command.zone);
      x.shufflePile(pile);
      x.log(`${who} shuffled ${pile.name}.`);
      break;
    }
    case 'shuffle-selection': {
      const cards = x.tableCards(command.ids);
      if (cards.some(c => c.faceUp)) fail('FACE_UP', 'Only face-down cards can be shuffled on the table.');
      if (cards.some(c => c.zone !== cards[0]!.zone)) fail('MIXED_ZONES', 'Shuffle cards within one area at a time.');
      const slots = cards.map(c => ({ x: c.x, y: c.y, rotation: c.rotation }));
      shuffleInPlace(slots, random);
      const zone = cards[0]!.zone;
      const others = s.order[zone]!.filter(id => !cards.some(c => c.id === id));
      const shuffled = shuffleInPlace(cards.slice(), random);
      shuffled.forEach((c, i) => { Object.assign(c, slots[i]); delete c.attachedTo; c.seenBy = []; c.revealedToAll = false; x.rotateHandle(c); x.detachFrom(c.id); });
      s.order[zone] = [...others, ...shuffled.map(c => c.id)];
      x.log(`${who} shuffled ${cards.length} face-down cards.`);
      break;
    }
    case 'reorder-hand': {
      const hand = x.hand(x.seat);
      const current = s.order[hand.id]!;
      const next = command.ids.map(h => { const c = x.card(h); if (c.zone !== hand.id) fail('NOT_YOUR_HAND'); return c.id; });
      if (next.length !== current.length) fail('INCOMPLETE_ORDER', 'Include every card in your hand.');
      s.order[hand.id] = next;
      break; // private and not part of shared history
    }
    case 'sort-hand': {
      const hand = x.hand(x.seat);
      const key = (id: string) => { const c = s.cards[id]!; return command.by === 'rank' ? [rankIndex(c.rank), c.suit] as const : [c.suit, rankIndex(c.rank)] as const; };
      s.order[hand.id] = s.order[hand.id]!.slice().sort((a, b) => { const ka = key(a), kb = key(b); return ka[0] < kb[0] ? -1 : ka[0] > kb[0] ? 1 : ka[1] < kb[1] ? -1 : ka[1] > kb[1] ? 1 : 0; });
      break;
    }
    case 'reveal': {
      const cards = command.ids.map(h => x.card(h));
      for (const c of cards) {
        const zone = x.zone(c.zone);
        if (zone.kind === 'pile') fail('NOT_REVEALABLE', 'Reveal cards from your hand or the table.');
        if (!faceVisible(s, c, x.seat)) fail('FACE_UNKNOWN', 'You can only reveal a card you can see.');
        if (zone.kind === 'hand' && zone.owner !== x.seat) fail('NOT_YOUR_HAND');
        if (command.to === 'all') c.revealedToAll = true;
        else for (const seat of command.to) { if (seat >= s.seats) fail('INVALID_SEAT'); if (!c.seenBy.includes(seat)) c.seenBy.push(seat); }
      }
      if (command.to === 'all') x.log(`${who} revealed ${cards.map(cardLabel).join(', ')} to everyone.`);
      else x.log(`${who} revealed ${cards.length} card${cards.length === 1 ? '' : 's'} to ${command.to.map(n => `Seat ${n + 1}`).join(', ')}.`);
      break;
    }
    case 'hide': {
      const cards = command.ids.map(h => x.card(h));
      for (const c of cards) {
        const zone = x.zone(c.zone);
        if (zone.kind === 'hand' && zone.owner !== x.seat) fail('NOT_YOUR_HAND');
        if (zone.kind === 'pile') fail('NOT_REVEALABLE');
        c.seenBy = []; c.revealedToAll = false;
      }
      x.log(`${who} hid ${cards.length} revealed card${cards.length === 1 ? '' : 's'} again. Anyone who saw ${cards.length === 1 ? 'it' : 'them'} may still remember.`);
      break;
    }
    case 'lock': {
      if (!actor.host) fail('HOST_REQUIRED', 'Only the host can lock or unlock objects.');
      for (const h of command.ids) {
        const o = s.objects.find(v => v.id === h);
        if (o) { o.locked = command.locked; continue; }
        const c = x.card(h);
        if (x.zone(c.zone).kind !== 'table') fail('NOT_ON_TABLE');
        c.locked = command.locked;
      }
      x.log(`${who} ${command.locked ? 'locked' : 'unlocked'} ${command.ids.length} object${command.ids.length === 1 ? '' : 's'}.`);
      break;
    }
    case 'attach': {
      const host = x.card(command.target);
      if (x.zone(host.zone).kind !== 'table') fail('NOT_ON_TABLE');
      if (host.attachedTo) fail('INVALID_ATTACHMENT', 'Attach to a card that is not itself attached.');
      for (const h of command.ids) {
        const o = s.objects.find(v => v.id === h);
        if (o) { x.editable(o); o.attachedTo = host.id; o.x = clamp(host.x + 8, 0, s.width); o.y = clamp(host.y + CARD_HEIGHT - 20, 0, s.height); continue; }
        const c = x.card(h);
        x.canTouch(c);
        if (c.id === host.id) fail('INVALID_ATTACHMENT', 'A card cannot attach to itself.');
        if (x.zone(c.zone).kind !== 'table') fail('NOT_ON_TABLE');
        if (Object.values(s.cards).some(a => a.attachedTo === c.id)) fail('INVALID_ATTACHMENT', 'That card already carries attachments.');
        if (c.zone !== host.zone) x.place(c, x.zone(host.zone), 'top');
        c.attachedTo = host.id;
        c.x = clamp(host.x + 14, 0, s.width - CARD_WIDTH); c.y = clamp(host.y + 18, 0, s.height - CARD_HEIGHT);
        s.order[c.zone] = [...s.order[c.zone]!.filter(id => id !== c.id && id !== host.id), host.id, c.id];
      }
      x.log(`${who} attached ${command.ids.length} object${command.ids.length === 1 ? '' : 's'} to a card.`);
      break;
    }
    case 'detach': {
      for (const h of command.ids) {
        const o = s.objects.find(v => v.id === h);
        if (o) { x.editable(o); delete o.attachedTo; continue; }
        const c = x.card(h); x.canTouch(c); delete c.attachedTo;
      }
      x.log(`${who} detached ${command.ids.length} object${command.ids.length === 1 ? '' : 's'}.`);
      break;
    }
    case 'add-component': {
      if (s.objects.length >= LIMITS.objects) fail('COMPONENT_LIMIT', 'This table has reached its component limit.');
      const o: Component = {
        id: x.nextId('o'), kind: command.kind, text: command.text, value: command.value,
        x: clamp(command.x, 0, s.width), y: clamp(command.y, 0, s.height), locked: false,
        ...(command.kind === 'dice' ? { sides: command.sides ?? 6, value: clamp(command.value || 1, 1, command.sides ?? 6) } : {}),
      };
      s.objects.push(o);
      x.log(`${who} added a ${o.kind}.`);
      break;
    }
    case 'update-component': {
      const o = x.component(command.id); x.editable(o);
      if (command.text !== undefined) o.text = command.text;
      if (command.value !== undefined) { if (o.kind === 'dice') fail('USE_ROLL', 'Dice change only by rolling.'); o.value = command.value; }
      if (command.x !== undefined) { o.x = clamp(command.x, 0, s.width); delete o.attachedTo; }
      if (command.y !== undefined) { o.y = clamp(command.y, 0, s.height); delete o.attachedTo; }
      x.log(`${who} updated ${o.kind} “${o.text.slice(0, 40)}”${command.value !== undefined ? ` to ${o.value}` : ''}.`);
      break;
    }
    case 'remove-component': {
      const o = x.component(command.id); x.editable(o);
      s.objects = s.objects.filter(v => v.id !== o.id);
      x.log(`${who} removed a ${o.kind}.`);
      break;
    }
    case 'roll': {
      const o = x.component(command.id); x.editable(o);
      if (o.kind !== 'dice') fail('NOT_DICE');
      const sides = o.sides ?? 6;
      o.value = 1 + Math.min(sides - 1, Math.floor(random() * sides));
      x.log(`${who} rolled ${o.text || `d${sides}`}: ${o.value}.`);
      break;
    }
  }
  s.seq++;
  assertInvariants(s);
  return s;
}
