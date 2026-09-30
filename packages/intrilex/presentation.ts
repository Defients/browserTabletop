import type { GameAction, GameCard, GameView } from './types.js';
import { actionKey } from './actionIdentity.js';
import { cardName, modeInfo } from './engine.js';

/**
 * Action presentation adapter: turns the rules engine's serialized legal actions into the
 * semantic decisions a player actually makes. The engine remains authoritative — every
 * variant inside a family is an already-legal `GameAction`; the composer can only resolve
 * to one of them, never to a synthesized combination.
 *
 * Families are declared by `FAMILY_SPECS`: each spec matches a class of actions, groups
 * them under one key and names the parameters that vary between its variants. Parameter
 * options are always derived from the surviving legal variants, so impossible
 * combinations cannot be offered.
 */

export type ParamKind = 'slot' | 'mode' | 'card' | 'cards' | 'target';
/** A parameter selection: scalar value, or a subset of a multi-card set. */
export type ParamValue = string | string[] | undefined;
export type Selection = Record<string, ParamValue>;

export interface ParamSpec {
  key: string;
  kind: ParamKind;
  label: string;
  /** Multi params match by set-superset: a selection is a growing subset of the variant's set. */
  multi?: boolean;
  get(a: GameAction): string | string[] | undefined;
}

export interface ActionFamily {
  id: string;
  icon: string;
  title: string;
  detail?: string;
  ruleRef?: string;
  /** Presentation order; selections are order-agnostic, this only sequences the composer. */
  params: ParamSpec[];
  /** The legal engine actions this decision comprises, in enumeration order. */
  variants: GameAction[];
  /** 'inline': single-parameter family, options expand under the row. 'composer': drill-down. */
  presentation: 'inline' | 'composer';
}

export type ActionEntry =
  | { kind: 'action'; action: GameAction; key: string }
  | { kind: 'family'; family: ActionFamily };

const INLINE_MAX_VARIANTS = 8;

// ---------------------------------------------------------------- look-ups and labels

export interface ActionLookups {
  card(id: string | undefined): GameCard | undefined;
  pending(id: string | undefined): GameView['pending'][number] | undefined;
  slotCard(slot: number): GameCard | undefined;
}

/** Every card the projected view is allowed to show, indexed by handle. */
export function actionLookups(view: GameView): ActionLookups {
  const cards = new Map<string, GameCard>();
  const track = (c: GameCard | undefined) => { if (c) cards.set(c.id, c); };
  for (const c of view.hand) track(c);
  for (const p of view.players) for (const c of [...p.pr, ...p.er, ...(p.revealedHand ?? [])]) track(c);
  for (const c of view.graveyard) track(c);
  for (const c of view.exile ?? []) track(c);
  for (const s of view.swapBar ?? []) track(s.card);
  for (const i of view.pending) { track(i.card); for (const c of i.cards ?? []) track(c); }
  for (const c of view.choice?.cards ?? []) track(c);
  const pending = new Map(view.pending.map(i => [i.id, i] as const));
  return {
    card: id => (id === undefined ? undefined : cards.get(id)),
    pending: id => (id === undefined ? undefined : pending.get(id)),
    slotCard: slot => view.swapBar?.find(s => s.slot === slot)?.card,
  };
}

/** Display text for a mode value, annotating structured prefixes (mimic:, hold:, wild-N:). */
export function modeLabel(mode: string): string {
  const segs = mode.split(':');
  const inner = segs.at(-1)!;
  const prefixes = segs.slice(0, -1).map(s =>
    s === 'mimic' ? 'Mimic' : s === 'hold' ? 'Held' : s.startsWith('wild-') ? `Wild ${s.slice(5)}` : s.startsWith('ultra-') ? 'Ultra' : s);
  return [...prefixes.map(p => `${p} · `), modeInfo(inner)?.text ?? inner].join('');
}

function optionLabel(kind: ParamKind, value: string, look: ActionLookups): { label: string; card?: GameCard; pending?: GameView['pending'][number] } {
  switch (kind) {
    case 'slot': return { label: `Slot ${Number(value) + 1}`, card: look.slotCard(Number(value)) };
    case 'mode': return { label: modeLabel(value) };
    case 'card':
    case 'cards': { const c = look.card(value); return { label: c ? cardName(c) : 'Face-down card', card: c }; }
    case 'target': {
      const c = look.card(value);
      if (c) return { label: cardName(c), card: c };
      const i = look.pending(value);
      return { label: i ? i.label : 'Pending play', pending: i };
    }
  }
}

// ---------------------------------------------------------------- choose-family titles

const SELECT_TITLES: Record<string, string> = {
  discard: 'Discard a card', present: 'Present a card', 'raid-take': 'Take a presented card',
  recycle: 'Rummage a card from the Graveyard', 'seven-hand': 'Take a revealed card',
  'seven-score': 'Take a revealed card', order: 'Place the next card from the top',
};
const CHOOSE_MODE_TITLES: Record<string, string> = {
  'dig-top': 'Return a drawn card to the top of DP', 'dig-bottom': 'Return a drawn card to the bottom of DP',
  'dig-discard': 'Keep the drawn cards; discard one', 'generated-score': 'Score the generated card',
  'foundation-score': 'Score a card via Foundation', 'bj-take': 'Move an Exile card to the top of DP',
  'peek-take': 'Take a face-down Swap Bar card', 'exile-take': 'Rummage an Exile card',
  'super-5-play': 'Play a milled card', 'seven-gen': 'Declare a generated play',
  'super-7-first': 'Declare a generated play first',
};
function chooseTitle(a: GameAction, view: GameView): string {
  if (a.mode === 'select') return SELECT_TITLES[view.choice?.kind ?? ''] ?? view.choice?.prompt ?? 'Choose a card';
  return CHOOSE_MODE_TITLES[a.mode ?? ''] ?? view.choice?.prompt ?? 'Choose';
}

// ---------------------------------------------------------------- family specifications

interface FamilySpec {
  id: string;
  match(a: GameAction): boolean;
  key(a: GameAction, view: GameView): string;
  icon: string;
  title(a: GameAction, view: GameView, look: ActionLookups): string;
  detail?(a: GameAction, view: GameView, look: ActionLookups): string | undefined;
  params: ParamSpec[];
}

const slot = (label: string): ParamSpec => ({ key: 'slot', kind: 'slot', label, get: a => a.mode });
const cardP = (key: string, kind: ParamKind, label: string, get: ParamSpec['get'], multi = false): ParamSpec => ({ key, kind, label, get, ...(multi ? { multi: true } : {}) });
const slice = (i: number, j?: number) => (a: GameAction) => a.cardIds?.slice(i, j);
const named = (a: GameAction, look: ActionLookups) => { const c = look.card(a.cardId); return c ? cardName(c) : 'Card'; };

const FAMILY_SPECS: FamilySpec[] = [
  {
    id: 'swap-down', match: a => a.type === 'swap-down', key: () => 'swap', icon: '⇅',
    title: () => 'Swap Bar',
    detail: () => 'Take a face-down Swap Bar card; return a hand card face-up',
    params: [slot('Face-down slot'), cardP('give', 'card', 'Give from your hand', a => a.cardId)],
  },
  {
    id: 'swap-draw', match: a => a.type === 'swap-draw', key: () => 'swap-draw', icon: '⇄',
    title: () => 'Take from the Swap Bar',
    detail: () => 'Take a face-up Swap Bar card into hand',
    params: [slot('Face-up slot')],
  },
  {
    id: 'ultra-red', match: a => a.mode === 'ultra-red', key: () => 'ultra-red', icon: '❖',
    title: () => 'Ultra — Three Red',
    detail: () => 'Super Counter a pending play, then draw the oldest GY card',
    params: [cardP('reds', 'cards', 'Three red cards', a => a.cardIds, true), cardP('target', 'target', 'Counter which play', a => a.targetId)],
  },
  {
    id: 'ultra-black', match: a => !!a.mode?.startsWith('ultra-black:'), key: () => 'ultra-black', icon: '❖',
    title: () => 'Ultra — Three Black',
    detail: () => 'Score one black card, cast one, Exile the third',
    params: [
      cardP('score', 'card', 'Score', a => a.cardId), cardP('cast', 'card', 'Cast', a => a.cardIds?.[1]),
      cardP('third', 'card', 'Exile (third card)', a => a.cardIds?.[2]),
      cardP('mode', 'mode', 'Cast as', a => a.mode?.slice('ultra-black:'.length)), cardP('target', 'target', 'Target', a => a.targetId),
    ],
  },
  {
    id: 'ultra-mixed', match: a => !!a.mode?.startsWith('ultra-mixed-'), key: () => 'ultra-mixed', icon: '❖',
    title: () => 'Ultra — Mixed',
    detail: () => 'Two black and two red cards declared as a Mixed Ultra',
    params: [
      cardP('mode', 'mode', 'Effect', a => a.mode), cardP('black', 'cards', 'Two black cards', slice(0, 2), true),
      cardP('red', 'cards', 'Two red cards', slice(2, 4), true), cardP('target', 'target', 'Rummage from Exile', a => a.targetId),
    ],
  },
  {
    // Supers (incl. 10♦ Mimic and K♠ Sovereignty plays), Court, Marriage, Sudden Death and ⭐A counters.
    id: 'combo', match: a => !!a.cardIds?.length, key: () => 'combo', icon: '⧉',
    title: () => 'Multi-card plays',
    detail: () => 'Supers, pairs and Sudden Death declarations',
    params: [cardP('cards', 'cards', 'Cards', a => a.cardIds, true), cardP('mode', 'mode', 'Play', a => a.mode), cardP('target', 'target', 'Target', a => a.targetId)],
  },
  {
    id: 'counter', match: a => a.type === 'counter', key: () => 'counter', icon: '✕',
    title: () => 'Counter',
    detail: () => 'Counter a pending play',
    params: [cardP('card', 'card', 'Counter with', a => a.cardId), cardP('target', 'target', 'Counter which play', a => a.targetId)],
  },
  {
    id: 'scuttle', match: a => a.type === 'scuttle', key: () => 'scuttle', icon: '⚔',
    title: () => 'Scuttle',
    detail: () => 'Destroy an enemy Point Row card',
    params: [cardP('source', 'card', 'Scuttle with', a => a.cardId), cardP('target', 'target', 'Target', a => a.targetId)],
  },
  {
    id: 'card-effect', match: a => (a.type === 'effect' || a.type === 'generated-effect') && !!a.cardId,
    key: a => `${a.type}:${a.cardId}`, icon: '✦',
    title: (a, _v, look) => `${named(a, look)} · ${a.type === 'generated-effect' ? 'generated play' : 'Play for Effect'}`,
    detail: a => (a.mode?.startsWith('hold:') ? 'Held cast — a commandeered card casts a free effect' : undefined),
    params: [cardP('mode', 'mode', 'Effect', a => a.mode), cardP('target', 'target', 'Target', a => a.targetId), cardP('cost', 'cards', 'Discard cost', a => a.targetIds, true)],
  },
  {
    id: 'choose', match: a => a.type === 'choose' && !!a.cardId, key: a => `choose:${a.mode}`, icon: '◈',
    title: chooseTitle,
    params: [cardP('card', 'card', 'Card', a => a.cardId)],
  },
  {
    id: 'voltage', match: a => a.type === 'voltage', key: () => 'voltage', icon: '⚡',
    title: () => 'Voltage', detail: () => 'Declare a Voltage guess once per Start',
    params: [cardP('rank', 'mode', 'Rank', a => a.mode)],
  },
];

// ---------------------------------------------------------------- grouping

/** Converts a filtered legal-action list into player-facing entries (simple rows + families). */
export function buildActionEntries(view: GameView, actions: GameAction[], search = ''): ActionEntry[] {
  const look = actionLookups(view);
  const term = search.trim().toLocaleLowerCase();
  interface Bucket { spec: FamilySpec; first: GameAction; variants: GameAction[] }
  const buckets = new Map<string, Bucket>();
  const order: ({ kind: 'action'; action: GameAction } | { kind: 'bucket'; bucket: Bucket })[] = [];
  for (const a of actions) {
    const spec = FAMILY_SPECS.find(s => s.match(a));
    if (!spec) { order.push({ kind: 'action', action: a }); continue; }
    const id = `${spec.id}:${spec.key(a, view)}`;
    let b = buckets.get(id);
    if (!b) { b = { spec, first: a, variants: [] }; buckets.set(id, b); order.push({ kind: 'bucket', bucket: b }); }
    b.variants.push(a);
  }
  const entries: ActionEntry[] = [];
  const matches = (a: GameAction) => a.label.toLocaleLowerCase().includes(term);
  for (const item of order) {
    if (item.kind === 'action') { if (!term || matches(item.action)) entries.push({ kind: 'action', action: item.action, key: actionKey(item.action) }); continue; }
    const { spec, first, variants } = item.bucket;
    const title = spec.title(first, view, look);
    const titleHit = !!term && title.toLocaleLowerCase().includes(term);
    const kept = !term ? variants : titleHit ? variants : variants.filter(matches);
    if (!kept.length) continue;
    if (kept.length === 1) { entries.push({ kind: 'action', action: kept[0]!, key: actionKey(kept[0]!) }); continue; }
    const effective = spec.params.filter(p => new Set(kept.map(v => serialize(p.get(v)))).size > 1);
    entries.push({
      kind: 'family',
      family: {
        id: `${spec.id}:${spec.key(first, view)}`, icon: spec.icon, title,
        ...(spec.detail?.(first, view, look) ? { detail: spec.detail(first, view, look)! } : {}),
        ...(first.ruleRef ? { ruleRef: first.ruleRef } : {}),
        params: spec.params, variants: kept,
        presentation: effective.length === 1 && kept.length <= INLINE_MAX_VARIANTS ? 'inline' : 'composer',
      },
    });
  }
  return entries;
}

function serialize(v: string | string[] | undefined): string {
  return Array.isArray(v) ? [...v].sort().join('') : v ?? '';
}

// ---------------------------------------------------------------- selection mechanics

function paramMatches(p: ParamSpec, value: string | string[] | undefined, s: ParamValue): boolean {
  if (s === undefined) return true;
  if (p.multi) return (s as string[]).every(x => (value as string[] | undefined)?.includes(x));
  return value === s;
}

/** Variants consistent with the current selections (optionally ignoring one parameter). */
export function compatibleVariants(family: ActionFamily, sel: Selection, exceptKey?: string): GameAction[] {
  return family.variants.filter(v => family.params.every(p => p.key === exceptKey || paramMatches(p, p.get(v), sel[p.key])));
}

const asSet = (v: ParamValue | string[] | undefined) => new Set(Array.isArray(v) ? v : v === undefined ? [] : [v]);
const setEq = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every(x => b.has(x));

/** First variant per complete parameter tuple — presentationally identical variants collapse. */
const firstByTuple = (family: ActionFamily, vs: GameAction[]) => {
  const seen = new Map<string, GameAction>();
  for (const v of vs) { const t = family.params.map(p => serialize(p.get(v))).join(''); if (!seen.has(t)) seen.set(t, v); }
  return seen;
};

/**
 * The engine action a selection resolves to: exactly one compatible parameter tuple, or exactly
 * one variant whose every multi-set is fully picked (an exact set match wins over its supersets —
 * that is how a "give one OR two cards" cost resolves to the one-card declaration).
 */
export function resolvedAction(family: ActionFamily, sel: Selection): GameAction | undefined {
  const tuples = firstByTuple(family, compatibleVariants(family, sel));
  if (tuples.size === 1) return [...tuples.values()][0]!;
  const exact = firstByTuple(family, compatibleVariants(family, sel).filter(v => family.params.every(p => !p.multi || setEq(asSet(p.get(v)), asSet(sel[p.key])))));
  return exact.size === 1 ? [...exact.values()][0] : undefined;
}

/** Drops selections that no longer leave any legal variant (live-state reconciliation). */
export function reconcileSelection(family: ActionFamily, sel: Selection): Selection {
  const out: Selection = {};
  for (const p of family.params) {
    const s = sel[p.key];
    if (s === undefined) continue;
    if (p.multi) {
      const kept: string[] = [];
      for (const x of s as string[]) {
        if (compatibleVariants(family, { ...out, [p.key]: [...kept, x] }).length) kept.push(x);
      }
      if (kept.length) out[p.key] = kept;
    } else if (compatibleVariants(family, { ...out, [p.key]: s }).length) out[p.key] = s;
  }
  return out;
}

/**
 * Applies one pick (scalar select/toggle, or multi toggle) and then prunes the OTHER
 * parameters back to selections that still admit a legal variant — the newest pick wins.
 */
export function selectOption(family: ActionFamily, sel: Selection, key: string, value: string): Selection {
  const p = family.params.find(x => x.key === key);
  if (!p) return sel;
  const next: Selection = { ...sel };
  if (p.multi) {
    const cur = new Set(sel[key] as string[] | undefined ?? []);
    if (cur.has(value)) cur.delete(value); else cur.add(value);
    if (cur.size) next[key] = [...cur]; else delete next[key];
  } else {
    if (sel[key] === value) delete next[key]; else next[key] = value;
  }
  const out: Selection = {};
  if (next[key] !== undefined) out[key] = next[key];
  for (const q of family.params) {
    if (q.key === key) continue;
    const s = next[q.key];
    if (s === undefined) continue;
    if (compatibleVariants(family, { ...out, [q.key]: s }).length) out[q.key] = s;
  }
  return out;
}

// ---------------------------------------------------------------- options and preview

export interface ParamOption {
  value: string;
  label: string;
  card?: GameCard;
  pending?: GameView['pending'][number];
  selected: boolean;
}

/**
 * The values a parameter can still take, derived only from variants compatible with the
 * OTHER selections — so every offered option belongs to at least one completable legal play.
 */
export function paramOptions(family: ActionFamily, param: ParamSpec, sel: Selection, look: ActionLookups): ParamOption[] {
  const others: Selection = { ...sel };
  delete others[param.key];
  let cands = compatibleVariants(family, others);
  if (param.multi && (sel[param.key] as string[] | undefined)?.length) {
    const picked = sel[param.key] as string[];
    cands = cands.filter(v => picked.every(x => (param.get(v) as string[] | undefined)?.includes(x)));
  }
  const chosen = new Set(asSet(sel[param.key]));
  const seen: string[] = [];
  for (const v of cands) for (const x of asSet(param.get(v) as string[] | undefined)) if (!seen.includes(x)) seen.push(x);
  return seen.map(x => ({ ...optionLabel(param.kind, x, look), value: x, selected: chosen.has(x) }));
}

/** The first unset parameter (in declared order) that still offers options — where a pick goes next. */
export function nextParam(family: ActionFamily, sel: Selection, look: ActionLookups): ParamSpec | undefined {
  return family.params.find(p => sel[p.key] === undefined && paramOptions(family, p, sel, look).some(o => !o.selected));
}

/** A single-parameter family auto-resolves params that admit exactly one remaining value. */
export function effectiveSelection(family: ActionFamily, sel: Selection): Selection {
  const out = { ...sel };
  for (const p of family.params) {
    if (out[p.key] !== undefined) continue;
    if (p.multi) {
      const cands = compatibleVariants(family, out, p.key).map(v => asSet(p.get(v) as string[] | undefined));
      if (cands.length && cands.every(s => setEq(s, cands[0]!))) out[p.key] = [...cands[0]!];
    } else {
      const vals = new Set(compatibleVariants(family, out, p.key).map(v => p.get(v)).filter((x): x is string => x !== undefined));
      if (vals.size === 1) out[p.key] = [...vals][0]!;
    }
  }
  return out;
}

/** Natural-language preview: the resolved engine label, else a progress line. */
export function previewText(family: ActionFamily, sel: Selection, look: ActionLookups): string {
  const resolved = resolvedAction(family, sel);
  if (resolved) return resolved.label;
  const cands = compatibleVariants(family, sel);
  const missing = family.params.filter(p => sel[p.key] === undefined && paramOptions(family, p, sel, look).some(o => !o.selected)).map(p => p.label);
  const progress = missing.length ? `Choose ${missing.join(' and ').toLowerCase()}` : 'Keep choosing';
  return `${progress} — ${cands.length} legal ${cands.length === 1 ? 'play matches' : 'plays match'}`;
}
