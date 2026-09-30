import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyTable, assertInvariants, createTable, projectTable, undoable, type TableCommand, type TableState } from '../packages/tabletop/index.js';
import { builtInTemplates } from '../packages/templates/index.js';
import { seeded } from '../packages/intrilex/index.js';

const tpl = (id: string) => builtInTemplates.find(t => t.id === id)!;
const P0 = { seat: 0, host: true }, P1 = { seat: 1, host: false };
const handles = (s: TableState, seat: number | null) => projectTable(s, seat).cards.map(c => c.id);
const composition = (s: TableState) => Object.values(s.cards).map(c => `${c.rank}/${c.suit}`).sort().join(',');
const deepFrozenCopy = (s: TableState) => JSON.stringify(s);

test('setup: standard deck creates 54 unique cards in one hidden pile and passes invariants', () => {
  const s = createTable(tpl('standard-54'), seeded(1));
  assert.equal(Object.keys(s.cards).length, 54);
  assert.equal(s.order.deck!.length, 54);
  assertInvariants(s);
  const view = projectTable(s, 0);
  assert.equal(view.zones.find(z => z.id === 'deck')!.count, 54);
  assert.equal(view.cards.length, 0, 'hidden pile exposes no card entries');
});

test('setup: Core sandbox deals 5/6 by random first seat and builds Swap Bar 2 face-down + 1 face-up (§2)', () => {
  const firsts = new Set<number>();
  for (let seed = 1; seed <= 20; seed++) {
    const s = createTable(tpl('intrilex-core'), seeded(seed));
    const first = s.firstSeat!;
    firsts.add(first);
    assert.equal(s.order[`hand-${first}`]!.length, 5);
    assert.equal(s.order[`hand-${1 - first}`]!.length, 6);
    const swap = s.order.swap!.map(id => s.cards[id]!);
    assert.equal(swap.length, 3);
    assert.deepEqual(swap.map(c => c.faceUp), [false, true, false]);
    assert.equal(s.order.deck!.length, 54 - 11 - 3);
    assert.equal(s.objects.find(o => o.id === 'goal-0')!.value, 21);
    // Face-down Swap Bar cards are hidden from both players and spectators.
    for (const seat of [0, 1, null]) assert.equal(projectTable(s, seat).cards.filter(c => c.zone === 'swap' && c.rank).length, 1);
  }
  assert.deepEqual([...firsts].sort(), [0, 1], 'both seats can be chosen first');
});

test('integrity: 3000 random valid and invalid operations never duplicate, lose or orphan cards', () => {
  const random = seeded(42);
  let s = createTable(tpl('counter-lab'), random);
  const before = composition(s);
  const pick = <T>(xs: T[]) => xs[Math.floor(random() * xs.length)]!;
  let accepted = 0, rejected = 0;
  for (let i = 0; i < 3000; i++) {
    const seat = Math.floor(random() * 4);
    const view = projectTable(s, seat);
    const mine = view.cards.map(c => c.id);
    const zones = view.zones.map(z => z.id);
    const piles = view.zones.filter(z => z.kind === 'pile').map(z => z.id);
    const some = () => mine.length ? [...new Set(Array.from({ length: 1 + Math.floor(random() * 3) }, () => pick(mine)))] : ['nope'];
    const ops: (() => TableCommand)[] = [
      () => ({ type: 'move', ids: some(), zone: pick(zones), x: random() * 1400, y: random() * 900, ...(random() < 0.3 ? { position: 'bottom' } : {}) }),
      () => ({ type: 'flip', ids: some() }), () => ({ type: 'rotate', ids: some(), degrees: 90 }),
      () => ({ type: 'arrange', ids: some(), layout: pick(['align', 'stack', 'fan', 'unstack'] as const) }),
      () => ({ type: 'draw', zone: pick(piles), count: 1 + Math.floor(random() * 4) }),
      () => ({ type: 'deal', zone: pick(piles), count: 2, seats: [0, 1, 2, 3] }),
      () => ({ type: 'split', zone: pick(piles), count: 5, target: pick(piles) }), () => ({ type: 'merge', zone: pick(piles), target: pick(piles) }),
      () => ({ type: 'shuffle', zone: pick(piles) }), () => ({ type: 'shuffle-selection', ids: some() }),
      () => ({ type: 'reveal', ids: some(), to: random() < 0.5 ? 'all' : [pick([0, 1, 2, 3])] }), () => ({ type: 'hide', ids: some() }),
      () => ({ type: 'attach', ids: some(), target: pick(mine.length ? mine : ['x']) }), () => ({ type: 'detach', ids: some() }),
      () => ({ type: 'sort-hand', by: pick(['rank', 'suit'] as const) }), () => ({ type: 'lock', ids: some(), locked: random() < 0.5 }),
      () => ({ type: 'move', ids: ['forged-handle'], zone: 'table' }), () => ({ type: 'draw', zone: 'hand-1', count: 1 }),
    ];
    const cmd = pick(ops)();
    const snapshot = deepFrozenCopy(s);
    try { s = applyTable(s, { seat, host: seat === 0 }, cmd, random); accepted++; }
    catch { rejected++; assert.equal(deepFrozenCopy(s), snapshot, 'a rejected command must not change state'); }
    assertInvariants(s);
    assert.equal(composition(s), before, 'deck composition preserved');
  }
  assert.ok(accepted > 500 && rejected > 200, `exercise both paths (accepted ${accepted}, rejected ${rejected})`);
});

test('immutability: applyTable never mutates its input', () => {
  const s = createTable(tpl('standard-54'), seeded(3));
  const before = JSON.stringify(s);
  applyTable(s, P0, { type: 'draw', zone: 'deck', count: 5 }, seeded(4));
  assert.equal(JSON.stringify(s), before);
});

test('permissions: spectators cannot act; players cannot touch another hand or unlock without host', () => {
  let s = createTable(tpl('standard-54'), seeded(5));
  assert.throws(() => applyTable(s, { seat: null, host: true }, { type: 'draw', zone: 'deck', count: 1 }), /seat/i);
  s = applyTable(s, P0, { type: 'deal', zone: 'deck', count: 3, seats: [0, 1] }, seeded(6));
  const p0Hand = handles(s, 0).filter(h => projectTable(s, 0).cards.find(c => c.id === h)!.zone === 'hand-0');
  assert.equal(p0Hand.length, 3);
  // Seat 1 cannot see, and therefore cannot reference, seat 0's hand cards.
  assert.throws(() => applyTable(s, P1, { type: 'move', ids: [p0Hand[0]!], zone: 'table', x: 100, y: 100 }), /not available/);
  assert.throws(() => applyTable(s, P1, { type: 'reorder-hand', ids: p0Hand }), /not available/);
  s = applyTable(s, P0, { type: 'move', ids: [p0Hand[0]!], zone: 'table', x: 200, y: 200 });
  const onTable = projectTable(s, 1).cards.find(c => c.zone === 'table')!;
  assert.throws(() => applyTable(s, P1, { type: 'lock', ids: [onTable.id], locked: true }), /host/i);
  s = applyTable(s, P0, { type: 'lock', ids: [onTable.id], locked: true });
  assert.throws(() => applyTable(s, P1, { type: 'move', ids: [onTable.id], zone: 'table', x: 5, y: 5 }), /locked/i);
});

test('privacy: hidden piles, other hands and face-down cards never expose faces to any seat or spectator', () => {
  let s = createTable(tpl('standard-54'), seeded(7));
  s = applyTable(s, P0, { type: 'deal', zone: 'deck', count: 5, seats: [0, 1, 2] }, seeded(8));
  for (const seat of [0, 1, 2, 3, null]) {
    const v = projectTable(s, seat);
    for (const c of v.cards) assert.equal(c.zone, `hand-${seat}`, 'only own hand is visible');
    assert.equal(v.zones.find(z => z.id === 'deck')!.count, 54 - 15);
    assert.equal(v.zones.find(z => z.id === 'hand-1')!.count, 5, 'other hands show counts');
  }
  const h = projectTable(s, 0).cards[0]!.id;
  s = applyTable(s, P0, { type: 'move', ids: [h], zone: 'table', x: 300, y: 300, faceUp: false });
  const seen = projectTable(s, 1).cards.find(c => c.zone === 'table')!;
  assert.equal(seen.rank, undefined); assert.equal(seen.suit, undefined); assert.equal(seen.art, undefined);
  assert.ok(!JSON.stringify(projectTable(s, null)).includes(s.cards[Object.keys(s.cards).find(k => s.cards[k]!.handle === seen.id)!]!.id), 'canonical ID never serialized');
});

test('privacy: a remembered handle cannot track a card after it is shuffled into a hidden pile', () => {
  let s = createTable(tpl('standard-54'), seeded(9));
  s = applyTable(s, P0, { type: 'draw', zone: 'deck', count: 1 }, seeded(10));
  const h = projectTable(s, 0).cards[0]!.id;
  s = applyTable(s, P0, { type: 'move', ids: [h], zone: 'table', x: 400, y: 300, faceUp: true });
  const watched = projectTable(s, 1).cards.find(c => c.zone === 'table')!;
  assert.ok(watched.rank, 'the card was publicly visible');
  s = applyTable(s, P0, { type: 'move', ids: [watched.id], zone: 'deck' }, seeded(11));
  s = applyTable(s, P0, { type: 'shuffle', zone: 'deck' }, seeded(12));
  for (const seat of [0, 1, null]) assert.ok(!JSON.stringify(projectTable(s, seat)).includes(watched.id), 'old handle is gone from every projection');
  assert.throws(() => applyTable(s, P1, { type: 'move', ids: [watched.id], zone: 'table', x: 1, y: 1 }), /not available/);
  // Deal every card face-down to the table: none carries the old handle.
  s = applyTable(s, P0, { type: 'deal', zone: 'deck', count: 13, seats: [0, 1, 2, 3] }, seeded(13));
  const all = [0, 1, 2, 3, null].flatMap(seat => handles(s, seat));
  assert.ok(!all.includes(watched.id));
});

test('privacy: handles also rotate when a card enters a hand, so a later face-down play is untrackable', () => {
  let s = createTable(tpl('standard-54'), seeded(14));
  s = applyTable(s, P0, { type: 'draw', zone: 'deck', count: 2 }, seeded(15));
  const [a] = projectTable(s, 0).cards.map(c => c.id);
  s = applyTable(s, P0, { type: 'move', ids: [a!], zone: 'table', x: 100, y: 100, faceUp: true });
  const seenByP1 = projectTable(s, 1).cards.find(c => c.zone === 'table')!.id;
  s = applyTable(s, P0, { type: 'move', ids: [seenByP1], zone: 'hand-0' }, seeded(16));
  const hand = projectTable(s, 0).cards.filter(c => c.zone === 'hand-0').map(c => c.id);
  assert.ok(!hand.includes(seenByP1));
  s = applyTable(s, P0, { type: 'move', ids: [hand[0]!], zone: 'table', x: 50, y: 50, faceUp: false });
  assert.ok(!handles(s, 1).includes(seenByP1));
});

test('reveal/hide: targeted reveal shows only the recipient; hide keeps honest history', () => {
  let s = createTable(tpl('standard-54'), seeded(17));
  s = applyTable(s, P0, { type: 'draw', zone: 'deck', count: 1 }, seeded(18));
  const h = projectTable(s, 0).cards[0]!.id;
  s = applyTable(s, P0, { type: 'reveal', ids: [h], to: [1] });
  assert.ok(projectTable(s, 1).cards.find(c => c.id === h)?.rank, 'recipient sees it');
  assert.equal(projectTable(s, 2).cards.find(c => c.id === h), undefined, 'others do not');
  assert.ok(!s.history.at(-1)!.includes(projectTable(s, 0).cards[0]!.rank!), 'targeted reveal does not name the card publicly');
  s = applyTable(s, P0, { type: 'hide', ids: [h] });
  assert.equal(projectTable(s, 1).cards.find(c => c.id === h), undefined);
  assert.match(s.history.at(-1)!, /may still remember/);
  assert.throws(() => applyTable(s, P1, { type: 'reveal', ids: [h], to: 'all' }), /not available/);
});

test('attachments move with their host and detach when the host leaves the table', () => {
  let s = createTable(tpl('standard-54'), seeded(19));
  s = applyTable(s, P0, { type: 'draw', zone: 'deck', count: 2 }, seeded(20));
  const [a, b] = projectTable(s, 0).cards.map(c => c.id);
  s = applyTable(s, P0, { type: 'move', ids: [a!, b!], zone: 'table', x: 300, y: 300 });
  s = applyTable(s, P0, { type: 'attach', ids: [b!], target: a! });
  s = applyTable(s, P0, { type: 'add-component', kind: 'token', text: 'Marker', value: 0, x: 10, y: 10 });
  const token = s.objects.at(-1)!;
  s = applyTable(s, P0, { type: 'attach', ids: [token.id], target: a! });
  const hostBefore = projectTable(s, 0).cards.find(c => c.id === a)!;
  const attBefore = projectTable(s, 0).cards.find(c => c.id === b)!;
  s = applyTable(s, P0, { type: 'move', ids: [a!], zone: 'table', x: hostBefore.x + 100, y: hostBefore.y + 50 });
  const attAfter = projectTable(s, 0).cards.find(c => c.id === b)!;
  assert.equal(attAfter.x - attBefore.x, 100); assert.equal(attAfter.y - attBefore.y, 50);
  assert.equal(attAfter.attachedTo, a);
  s = applyTable(s, P0, { type: 'move', ids: [a!], zone: 'discard' });
  assertInvariants(s);
  assert.equal(projectTable(s, 0).cards.find(c => c.zone === 'table')!.attachedTo, undefined);
  assert.equal(s.objects.find(o => o.id === token.id)!.attachedTo, undefined);
  assert.throws(() => applyTable(s, P0, { type: 'attach', ids: [projectTable(s, 0).cards.find(c => c.zone === 'table')!.id], target: projectTable(s, 0).cards.find(c => c.zone === 'table')!.id }), /itself/);
});

test('piles: split, merge, top/bottom placement keep defined order', () => {
  let s = createTable(tpl('standard-54'), seeded(21));
  const deckTop = s.order.deck!.slice(-5);
  s = applyTable(s, P0, { type: 'split', zone: 'deck', count: 5, target: 'discard' });
  assert.deepEqual(s.order.discard, deckTop, 'split keeps relative order');
  const top = projectTable(s, 0).cards.filter(c => c.zone === 'discard').at(-1)!;
  s = applyTable(s, P0, { type: 'move', ids: [top.id], zone: 'discard', position: 'bottom' });
  assert.equal(s.order.discard![0], deckTop.at(-1));
  s = applyTable(s, P0, { type: 'merge', zone: 'discard', target: 'deck' });
  assert.equal(s.order.discard!.length, 0);
  assert.equal(s.order.deck!.length, 54);
  assertInvariants(s);
});

test('hand reorder and sort are private: no shared history line', () => {
  let s = createTable(tpl('standard-54'), seeded(22));
  s = applyTable(s, P0, { type: 'draw', zone: 'deck', count: 4 }, seeded(23));
  const n = s.history.length;
  const ids = projectTable(s, 0).cards.map(c => c.id).reverse();
  s = applyTable(s, P0, { type: 'reorder-hand', ids });
  assert.deepEqual(projectTable(s, 0).cards.map(c => c.id), ids);
  s = applyTable(s, P0, { type: 'sort-hand', by: 'suit' });
  assert.equal(s.history.length, n);
  assert.throws(() => applyTable(s, P0, { type: 'reorder-hand', ids: ids.slice(1) }), /every card/);
});

test('components: counters, notes and dice; dice change only through randomness', () => {
  let s = createTable(tpl('counter-lab'), seeded(24));
  s = applyTable(s, P1, { type: 'update-component', id: 'round', value: 5 });
  assert.equal(s.objects.find(o => o.id === 'round')!.value, 5);
  assert.throws(() => applyTable(s, P1, { type: 'update-component', id: 'die', value: 6 }), /rolling/);
  const rolls = new Set<number>();
  for (let i = 0; i < 60; i++) { s = applyTable(s, P1, { type: 'roll', id: 'die' }, seeded(100 + i)); rolls.add(s.objects.find(o => o.id === 'die')!.value); }
  assert.ok([...rolls].every(v => v >= 1 && v <= 6) && rolls.size === 6);
  s = applyTable(s, P1, { type: 'add-component', kind: 'note', text: '<script>alert(1)</script>', value: 0, x: 10, y: 10 });
  assert.equal(s.objects.at(-1)!.text, '<script>alert(1)</script>', 'stored as inert text; React renders it escaped');
  assert.throws(() => applyTable(s, P1, { type: 'add-component', kind: 'note', text: 'x'.repeat(501), value: 0, x: 1, y: 1 }));
});

test('commands: malformed and unknown commands are rejected at the trust boundary', () => {
  const s = createTable(tpl('standard-54'), seeded(25));
  for (const bad of [null, 5, [], { type: 'explode' }, { type: 'draw', zone: 'deck', count: 0 }, { type: 'draw', zone: 'deck', count: 1.5 }, { type: 'move', ids: [], zone: 'table' }, { type: 'move', ids: ['a', 'a'], zone: 'table' }, { type: 'move', ids: ['a'], zone: 'table', x: Infinity }])
    assert.throws(() => applyTable(s, P0, bad));
});

test('undo policy: only public arrangement commands are undoable', () => {
  let s = createTable(tpl('standard-54'), seeded(26));
  assert.equal(undoable(s, { type: 'draw', zone: 'deck', count: 1 }), false);
  assert.equal(undoable(s, { type: 'shuffle', zone: 'deck' }), false);
  s = applyTable(s, P0, { type: 'draw', zone: 'deck', count: 1 }, seeded(27));
  const h = projectTable(s, 0).cards[0]!.id;
  assert.equal(undoable(s, { type: 'move', ids: [h], zone: 'table', x: 1, y: 1 }), false, 'leaving a hand crosses a hidden boundary');
  s = applyTable(s, P0, { type: 'move', ids: [h], zone: 'table', x: 100, y: 100 });
  assert.equal(undoable(s, { type: 'move', ids: [h], zone: 'table', x: 150, y: 150 }), true);
  assert.equal(undoable(s, { type: 'flip', ids: [h] }), false, 'a flip can reveal; reveals cannot be unseen');
});
