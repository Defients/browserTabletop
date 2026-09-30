import type { CardDefinition, RulesProfile, SetupOperation, TableTemplate } from './types.js';
import { PROFILES } from './types.js';
import type { Component, Zone } from '../tabletop/types.js';
export type * from './types.js';
export { PROFILES } from './types.js';

export const TEMPLATE_LIMITS = { bytes: 5_000_000, cards: 216, zones: 64, objects: 128, decks: 16, setup: 128, labels: 64, imageBytes: 1_000_000, imageDimension: 4096 } as const;

const SUITS = ['clubs', 'diamonds', 'hearts', 'spades'] as const;
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const;
export const standardCards: CardDefinition[] = [
  ...SUITS.flatMap(suit => RANKS.map(rank => ({ id: `${rank}-${suit}`, rank, suit }))),
  { id: 'RJ', rank: 'RJ', suit: 'red' }, { id: 'BJ', rank: 'BJ', suit: 'black' },
];

const zone = (id: string, name: string, kind: Zone['kind'], visibility: Zone['visibility'], x: number, y: number, width: number, height: number, owner?: number): Zone =>
  ({ id, name, kind, visibility, x, y, width, height, ...(owner === undefined ? {} : { owner }) });
const counter = (id: string, text: string, value: number, x: number, y: number): Component => ({ id, kind: 'counter', text, value, x, y, locked: false });
const token = (id: string, text: string, x: number, y: number): Component => ({ id, kind: 'token', text, value: 0, x, y, locked: false });
const hands = (n: number, y = 780) => Array.from({ length: n }, (_, i) => zone(`hand-${i}`, `Seat ${i + 1} hand`, 'hand', 'owner', 40 + i * 165, y, 155, 100, i));

const blank: TableTemplate = {
  schemaVersion: 1, id: 'blank', title: 'Blank table',
  description: 'A quiet surface for your own rules. Add counters, dice and notes, or import a deck.',
  author: 'Tabletop platform (original)', profile: 'free', width: 1400, height: 900, seats: 8, background: '#1d4b43',
  zones: [zone('table', 'Table', 'table', 'public', 40, 40, 1320, 700), ...hands(8)],
  cards: [], decks: [], objects: [], setup: [], labels: [], seatLayout: Array.from({ length: 8 }, (_, seat) => ({ seat, x: 110 + seat * 165, y: 760 })),
};

const standard: TableTemplate = {
  ...structuredClone(blank), id: 'standard-54', title: 'The classic deck',
  description: '52 cards and two Jokers on an open table. Up to eight seats, any house rules.',
  zones: [zone('table', 'Table', 'table', 'public', 40, 40, 1320, 700), zone('deck', 'Draw pile', 'pile', 'hidden', 80, 300, 100, 140), zone('discard', 'Discard pile', 'pile', 'public', 220, 300, 100, 140), ...hands(8)],
  cards: standardCards, decks: [{ id: 'standard', zone: 'deck', cards: standardCards.map(c => c.id) }], setup: [{ op: 'shuffle', zone: 'deck' }],
  labels: [{ text: 'Shared table', x: 600, y: 60 }],
};

/** Second, independently authored generic template: two decks, per-seat piles, counters and a die. No rules engine. */
const studio: TableTemplate = {
  ...structuredClone(blank), id: 'counter-lab', title: 'Counter & card studio', seats: 4, width: 1400, height: 900, background: '#2c3a5a',
  description: 'A two-deck table with personal piles, round and score counters, a die and a notes card. Built purely from template data.',
  author: 'Tabletop platform — schema demonstration (original)',
  zones: [
    zone('table', 'Play area', 'table', 'public', 360, 40, 1000, 640),
    zone('supply', 'Supply', 'pile', 'hidden', 60, 60, 110, 150), zone('played', 'Played cards', 'pile', 'public', 200, 60, 110, 150),
    ...[0, 1, 2, 3].map(i => zone(`stash-${i}`, `Seat ${i + 1} stash`, 'pile', 'owner', 60 + (i % 2) * 140, 260 + Math.floor(i / 2) * 190, 110, 150, i)),
    ...hands(4),
  ],
  cards: [...standardCards, ...standardCards.map(c => ({ ...c, id: `second-${c.id}` }))],
  decks: [{ id: 'double', zone: 'supply', cards: [...standardCards.map(c => c.id), ...standardCards.map(c => `second-${c.id}`)] }],
  objects: [counter('round', 'Round', 1, 400, 80), { id: 'die', kind: 'dice', text: 'D6', value: 1, sides: 6, x: 560, y: 80, locked: false },
    { id: 'notes', kind: 'note', text: 'House rules: write them here.', value: 0, x: 400, y: 200, locked: false },
    ...[0, 1, 2, 3].map(i => counter(`score-${i}`, `Seat ${i + 1} score`, 0, 720 + i * 150, 80))],
  setup: [{ op: 'shuffle', zone: 'supply' }, { op: 'initialize-counter', id: 'round', value: 1 }],
  labels: [{ text: 'Personal stashes are private to their seat', x: 60, y: 640 }],
  seatLayout: [0, 1, 2, 3].map(seat => ({ seat, x: 110 + seat * 165, y: 760 })),
};

/** Canonical v4.3.1 two-player layout (§2–3). Core is a manual sandbox; First Contact is adjudicated by the rules engine. */
function intrilex(core: boolean): TableTemplate {
  const zones: Zone[] = [
    zone('deck', 'Draw Pile · DP', 'pile', 'hidden', 600, 380, 100, 140),
    zone('graveyard', 'Graveyard · GY', 'pile', 'public', 740, 380, 100, 140),
  ];
  for (let p = 0; p < 2; p++) {
    const top = p === 1;
    zones.push(
      zone(`hand-${p}`, `Player ${p + 1} hand`, 'hand', 'owner', 260, top ? 10 : 790, 880, 100, p),
      zone(`pr-${p}`, `Player ${p + 1} · Point Row (PR)`, 'table', 'public', 240, top ? 230 : 540, 920, 130),
      zone(`er-${p}`, `Player ${p + 1} · Enduring Row (ER)`, 'table', 'public', 240, top ? 100 : 670, 920, 110),
    );
  }
  if (core) zones.push(zone('exile', 'Exile', 'pile', 'public', 880, 380, 100, 140), zone('swap', 'Swap Bar', 'table', 'public', 240, 380, 330, 140), zone('stack', 'Pending plays', 'table', 'public', 1000, 380, 360, 140));
  const setup: SetupOperation[] = [
    { op: 'shuffle', zone: 'deck' }, { op: 'choose-first-seat' },
    { op: 'deal-seat', zone: 'deck', seat: 'first', count: 5 }, { op: 'deal-seat', zone: 'deck', seat: 'second', count: 6 },
    ...(core ? [{ op: 'place', zone: 'deck', target: 'swap', count: 1, faceUp: false }, { op: 'place', zone: 'deck', target: 'swap', count: 1, faceUp: true }, { op: 'place', zone: 'deck', target: 'swap', count: 1, faceUp: false }] as SetupOperation[] : []),
  ];
  const markers = core ? ['Tapped', 'Aegis', 'Revealed', 'Exile-Bound', 'Jacked', 'Disrupted', 'Skip'].map((t, i) => token(`marker-${i}`, t, 1200, 560 + i * 44)) : [];
  return {
    schemaVersion: 1, id: core ? 'intrilex-core' : 'intrilex-first-contact',
    title: core ? 'Intrilex · Core sandbox' : 'Intrilex · First Contact',
    description: core
      ? 'The canonical Core layout with automatic setup (random Player A, 5/6 hands, Swap Bar 2 down + 1 up, Goals 21). Play and scoring are manual; nothing here adjudicates Core rules.'
      : 'Complete rules-assisted First Contact for two players: Goal 15, one Action per turn, Guard, Scuttle, counters and generic rank effects.',
    author: 'Intrilex rules v4.3.1 supplied by Deffy (rights reserved by their owner); platform layout original',
    profile: core ? 'intrilex-core' : 'intrilex-first-contact', width: 1400, height: 900, seats: 2, background: '#16372f',
    zones, cards: standardCards, decks: [{ id: 'intrilex', zone: 'deck', cards: standardCards.map(c => c.id) }], setup,
    objects: [
      ...[0, 1].flatMap(p => [counter(`goal-${p}`, `Player ${p + 1} Goal`, core ? 21 : 15, 40, p === 1 ? 140 : 600),
        ...(core ? [counter(`score-${p}`, `Player ${p + 1} Secured PR (manual)`, 0, 40, p === 1 ? 240 : 700)] : [])]),
      ...(core ? [counter('miniturns', 'Mini-Turns left (manual)', 1, 40, 400), counter('exhaust', 'Exhaust counter (manual)', 0, 40, 480), counter('boardlock', 'Board Lock counter (manual)', 0, 1200, 480)] : []),
      ...markers,
    ],
    labels: core ? [{ text: 'Manual sandbox — totals are player-maintained', x: 600, y: 360 }] : [],
    seatLayout: [{ seat: 0, x: 700, y: 880 }, { seat: 1, x: 700, y: 20 }],
    plugins: { intrilex: { rulesVersion: '4.3.1', ...(core ? {} : { lessonIds: ['orientation', 'draw-action', 'score-victory', 'generic-effect', 'guard-scuttle', 'response-counter', 'board-lock'] }) } },
  };
}

/** Full shares the canonical board layout with Core; authority comes exclusively from its trusted adapter. */
const full: TableTemplate = {
  ...intrilex(true), id: 'intrilex-full', title: 'Intrilex · Full', profile: 'intrilex-full',
  description: 'Two-player Intrilex with authoritative setup, legal actions, responses, scoring, Swap Bar and advanced rules.',
  objects: [0, 1].map(p => counter(`goal-${p}`, `Player ${p + 1} Goal`, 21, 40, p === 1 ? 140 : 600)),
  labels: [], plugins: { intrilex: { rulesVersion: '4.3.1' } },
};

export const builtInTemplates: TableTemplate[] = [intrilex(false), full, standard, intrilex(true), studio, blank];

// ---------------------------------------------------------------- validation (client and server trust boundary)

export class TemplateError extends Error {}
const fail = (message: string): never => { throw new TemplateError(`Template: ${message}`); };
const record = (v: unknown, what: string): Record<string, unknown> => (v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : fail(`${what} must be an object`));
const str = (v: unknown, what: string, max = 160, min = 0): string => (typeof v === 'string' && v.length <= max && v.trim().length >= min ? v : fail(`${what} must be text of at most ${max} characters`));
const num = (v: unknown, what: string, min: number, max: number, integer = false): number =>
  (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max && (!integer || Number.isInteger(v)) ? v : fail(`${what} must be ${integer ? 'a whole number' : 'a number'} between ${min} and ${max}`));
const arr = (v: unknown, what: string, max: number): unknown[] => (Array.isArray(v) && v.length <= max ? v : fail(`${what} must be a list of at most ${max} items`));
const id = (v: unknown, what: string): string => { const s = str(v, what, 80, 1); return /^[a-zA-Z0-9_-]+$/.test(s) ? s : fail(`${what} may only contain letters, digits, underscore or hyphen`); };
// Control characters (other than tab/newline) are never meaningful in template text.
const hasControl = (s: string) => [...s].some(ch => { const c = ch.charCodeAt(0); return (c < 32 && c !== 9 && c !== 10 && c !== 13) || c === 127; });
const safeText = (v: unknown, what: string, max = 160, min = 0) => { const s = str(v, what, max, min); return hasControl(s) ? fail(`${what} contains control characters`) : s; };

function decodeBase64(data: string): Uint8Array {
  try { return Uint8Array.from(atob(data), ch => ch.charCodeAt(0)); } catch { return fail('card face has invalid base64 data'); }
}
/** Accepts only embedded PNG/JPEG/WebP whose bytes match the declared type. No SVG, no URLs, no paths. */
export function validateRaster(v: unknown): string {
  const s = str(v, 'card face', Math.ceil(TEMPLATE_LIMITS.imageBytes * 4 / 3) + 40);
  const m = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(s);
  if (!m) fail('card faces must be embedded PNG, JPEG or WebP data (no links, files or SVG)');
  const b = decodeBase64(m![2]!);
  if (b.length > TEMPLATE_LIMITS.imageBytes || b.length < 24) fail('card face image size is invalid');
  const ascii = (o: number, n: number) => String.fromCharCode(...b.slice(o, o + n));
  const u32 = (o: number) => ((b[o]! << 24) >>> 0) + (b[o + 1]! << 16) + (b[o + 2]! << 8) + b[o + 3]!;
  if (m![1] === 'png') {
    if (!(b[0] === 0x89 && ascii(1, 3) === 'PNG' && ascii(12, 4) === 'IHDR')) fail('card face is not a valid PNG');
    const w = u32(16), h = u32(20);
    if (w < 1 || h < 1 || w > TEMPLATE_LIMITS.imageDimension || h > TEMPLATE_LIMITS.imageDimension) fail('card face dimensions exceed 4096 pixels');
  }
  if (m![1] === 'jpeg' && !(b[0] === 0xff && b[1] === 0xd8 && b[b.length - 2] === 0xff && b[b.length - 1] === 0xd9)) fail('card face is not a valid JPEG');
  if (m![1] === 'webp' && !(ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP')) fail('card face is not a valid WebP');
  return s;
}

export function validateTemplate(input: unknown): TableTemplate {
  let size: number;
  try { size = JSON.stringify(input)?.length ?? 0; } catch { return fail('must be plain JSON data'); }
  if (size > TEMPLATE_LIMITS.bytes) fail('maximum file size is 5 MB');
  const v = record(input, 'template');
  if (v.schemaVersion !== 1) fail('unsupported schemaVersion; expected 1');
  const profile = v.profile as RulesProfile;
  if (!PROFILES.includes(profile)) fail('unknown rules profile');
  const seats = num(v.seats, 'seat count', 2, 8, true);
  const width = num(v.width, 'board width', 600, 4000), height = num(v.height, 'board height', 400, 4000);
  const zones = arr(v.zones, 'zones', TEMPLATE_LIMITS.zones).map((z, i) => {
    const o = record(z, `zone ${i + 1}`);
    const kind = o.kind as Zone['kind'], visibility = o.visibility as Zone['visibility'];
    if (!['table', 'hand', 'pile'].includes(kind) || !['public', 'owner', 'hidden'].includes(visibility)) fail(`zone ${i + 1} has an invalid kind or visibility`);
    const owner = o.owner === undefined ? undefined : num(o.owner, `zone ${i + 1} owner`, 0, seats - 1, true);
    if (visibility === 'owner' && owner === undefined) fail(`private zone ${i + 1} needs an owner seat`);
    if (kind === 'hand' && visibility !== 'owner') fail(`hand zone ${i + 1} must be private to its owner`);
    if (kind === 'table' && visibility === 'hidden') fail(`table zone ${i + 1} cannot be hidden; use a pile`);
    const x = num(o.x, 'zone x', 0, width), y = num(o.y, 'zone y', 0, height);
    return { id: id(o.id, 'zone id'), name: safeText(o.name, 'zone name', 80, 1), kind, visibility, ...(owner === undefined ? {} : { owner }), x, y, width: num(o.width, 'zone width', 30, width), height: num(o.height, 'zone height', 30, height) } as Zone;
  });
  const handOwners = zones.filter(z => z.kind === 'hand').map(z => z.owner);
  if (new Set(handOwners).size !== handOwners.length) fail('each seat may have at most one hand zone');
  const cards = arr(v.cards, 'cards', TEMPLATE_LIMITS.cards).map((c, i) => {
    const o = record(c, `card ${i + 1}`);
    return { id: id(o.id, 'card id'), rank: safeText(o.rank, 'card rank', 20, 1), suit: safeText(o.suit, 'card suit', 20), ...(o.face === undefined ? {} : { face: validateRaster(o.face) }) };
  });
  const unique = (xs: string[], what: string) => { if (new Set(xs).size !== xs.length) fail(`duplicate ${what} IDs`); };
  unique(zones.map(z => z.id), 'zone'); unique(cards.map(c => c.id), 'card');
  const zoneIds = new Set(zones.map(z => z.id)), cardIds = new Set(cards.map(c => c.id));
  const decks = arr(v.decks, 'decks', TEMPLATE_LIMITS.decks).map((d, i) => {
    const o = record(d, `deck ${i + 1}`);
    const z = zones.find(x => x.id === o.zone);
    if (!z || z.kind === 'hand') fail(`deck ${i + 1} must start in an existing pile or table zone`);
    const refs = arr(o.cards, 'deck cards', TEMPLATE_LIMITS.cards).map(x => id(x, 'deck card'));
    if (refs.some(c => !cardIds.has(c))) fail(`deck ${i + 1} references a missing card`);
    return { id: id(o.id, 'deck id'), zone: z!.id, cards: refs };
  });
  unique(decks.flatMap(d => d.cards), 'deck card');
  if (decks.reduce((n, d) => n + d.cards.length, 0) !== cards.length) fail('every card must belong to exactly one starting deck');
  const objects = arr(v.objects, 'components', TEMPLATE_LIMITS.objects).map((c, i) => {
    const o = record(c, `component ${i + 1}`);
    const kind = o.kind as Component['kind'];
    if (!['counter', 'token', 'dice', 'note', 'label'].includes(kind)) fail(`component ${i + 1} has an invalid kind`);
    const sides = kind === 'dice' ? num(o.sides ?? 6, 'dice sides', 2, 100, true) : undefined;
    return { id: id(o.id, 'component id'), kind, text: safeText(o.text, 'component text', 2000), value: num(o.value, 'component value', -999_999, 999_999, true), x: num(o.x, 'component x', 0, width), y: num(o.y, 'component y', 0, height), locked: o.locked === true, ...(sides === undefined ? {} : { sides }) } as Component;
  });
  unique(objects.map(o => o.id), 'component');
  const setup = arr(v.setup, 'setup recipe', TEMPLATE_LIMITS.setup).map((c, i): SetupOperation => {
    const o = record(c, `setup step ${i + 1}`);
    const zoneRef = (x: unknown, what: string) => { const z = id(x, what); return zoneIds.has(z) ? z : fail(`setup step ${i + 1} references a missing zone`); };
    const count = () => num(o.count, 'setup count', 0, TEMPLATE_LIMITS.cards, true);
    switch (o.op) {
      case 'shuffle': { const z = zoneRef(o.zone, 'zone'); if (zones.find(x => x.id === z)!.kind !== 'pile') fail(`setup step ${i + 1} can only shuffle a pile`); return { op: 'shuffle', zone: z }; }
      case 'deal': return { op: 'deal', zone: zoneRef(o.zone, 'zone'), target: zoneRef(o.target, 'target'), count: count() };
      case 'place': return { op: 'place', zone: zoneRef(o.zone, 'zone'), target: zoneRef(o.target, 'target'), count: count(), faceUp: o.faceUp === true };
      case 'initialize-counter': { const ref = id(o.id, 'counter id'); if (!objects.some(x => x.id === ref)) fail(`setup step ${i + 1} references a missing counter`); return { op: 'initialize-counter', id: ref, value: num(o.value, 'counter value', -999_999, 999_999, true) }; }
      case 'choose-first-seat': return { op: 'choose-first-seat' };
      case 'deal-seat': {
        if (o.seat !== 'first' && o.seat !== 'second') fail(`setup step ${i + 1} seat must be "first" or "second"`);
        return { op: 'deal-seat', zone: zoneRef(o.zone, 'zone'), seat: o.seat as 'first' | 'second', count: count() };
      }
      default: return fail(`setup step ${i + 1} uses an unsupported operation (allowed: shuffle, deal, place, initialize-counter, choose-first-seat, deal-seat)`);
    }
  });
  const background = str(v.background ?? '#1d4b43', 'background', 7);
  if (!/^#[\da-fA-F]{6}$/.test(background)) fail('background must be a six-digit hex color');
  const result: TableTemplate = {
    schemaVersion: 1, id: id(v.id, 'template id'), title: safeText(v.title, 'title', 80, 1), description: safeText(v.description ?? '', 'description', 2000),
    author: safeText(v.author ?? '', 'author', 500), profile, width, height, seats, zones, cards, decks, objects, setup, background,
    labels: arr(v.labels ?? [], 'labels', TEMPLATE_LIMITS.labels).map((l, i) => { const o = record(l, `label ${i + 1}`); return { text: safeText(o.text, 'label text', 160, 1), x: num(o.x, 'label x', 0, width), y: num(o.y, 'label y', 0, height) }; }),
    seatLayout: arr(v.seatLayout ?? [], 'seat layout', 8).map(l => { const o = record(l, 'seat position'); return { seat: num(o.seat, 'seat', 0, seats - 1, true), x: num(o.x, 'seat x', 0, width), y: num(o.y, 'seat y', 0, height) }; }),
  };
  if (profile !== 'free') {
    if (seats !== 2) fail('Intrilex profiles require exactly two seats');
    const lessonIds = record(record(v.plugins ?? {}, 'plugins').intrilex ?? {}, 'intrilex plugin').lessonIds;
    result.plugins = { intrilex: { rulesVersion: '4.3.1', ...(Array.isArray(lessonIds) ? { lessonIds: arr(lessonIds, 'lesson IDs', 32).map(x => id(x, 'lesson id')) } : {}) } };
  }
  return result;
}

export function exportTemplate(template: TableTemplate): string { return JSON.stringify(validateTemplate(template), null, 2); }

export function importTemplate(text: string, newId: () => string = () => globalThis.crypto.randomUUID()): TableTemplate {
  if (text.length > TEMPLATE_LIMITS.bytes) fail('maximum file size is 5 MB');
  let v: unknown;
  try { v = JSON.parse(text); } catch { return fail('the file is not valid JSON'); }
  return { ...validateTemplate(v), id: `custom-${newId()}` };
}
