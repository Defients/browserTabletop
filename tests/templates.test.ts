import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { builtInTemplates, exportTemplate, importTemplate, validateRaster, validateTemplate, TEMPLATE_LIMITS } from '../packages/templates/index.js';
import { applyTable, artIndex, assertInvariants, createTable, projectTable } from '../packages/tabletop/index.js';
import { seeded } from '../packages/intrilex/index.js';

const garden = readFileSync(new URL('./fixtures/garden-table.tabletop.json', import.meta.url), 'utf8');
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

test('every built-in template validates and round-trips through export/import unchanged except its ID', () => {
  for (const t of builtInTemplates) {
    assert.deepEqual(validateTemplate(t), t, `${t.id} is canonical`);
    const back = importTemplate(exportTemplate(t), () => 'fixed');
    assert.equal(back.id, 'custom-fixed');
    assert.deepEqual({ ...back, id: t.id }, t);
    assertInvariants(createTable(t, seeded(1)));
  }
});

test('generality: an independently authored template imports and plays with no platform changes', () => {
  const t = importTemplate(garden);
  assert.equal(t.profile, 'free');
  let s = createTable(t, seeded(2));
  assert.equal(s.order.market!.length, 3);
  assert.equal(s.order['hand-0']!.length, 2);
  const art = artIndex(t);
  assert.equal(Object.keys(art.images).length, 1, 'identical faces share one art key');
  s = applyTable(s, { seat: 1, host: false }, { type: 'draw', zone: 'seeds', count: 2 }, seeded(3));
  const mine = projectTable(s, 1).cards.filter(c => c.zone === 'hand-1');
  s = applyTable(s, { seat: 1, host: false }, { type: 'move', ids: [mine[0]!.id], zone: 'plot', x: 400, y: 400 });
  s = applyTable(s, { seat: 2, host: false }, { type: 'roll', id: 'water' }, seeded(4));
  assert.ok(s.objects.find(o => o.id === 'water')!.value <= 4);
  assert.throws(() => applyTable(s, { seat: 2, host: false }, { type: 'update-component', id: 'rules', text: 'x' }), /locked/);
  assertInvariants(s);
});

test('custom raster faces round-trip byte-for-byte', () => {
  const t = importTemplate(garden);
  const again = importTemplate(exportTemplate(t));
  assert.equal(again.cards[0]!.face, PNG);
});

test('raster validation rejects active content, links, paths and spoofed bytes', () => {
  assert.equal(validateRaster(PNG), PNG);
  const svg = 'data:image/svg+xml;base64,' + btoa('<svg onload="alert(1)"/>');
  const bad = [svg, 'https://example.com/card.png', 'file:///C:/cards/a.png', '../cards/a.png', 'javascript:alert(1)',
    'data:image/png;base64,' + btoa('GIF89a' + 'x'.repeat(40)), 'data:image/jpeg;base64,' + btoa('\x89PNG\r\n\x1a\n' + 'x'.repeat(40)), 'data:image/png;base64,!!!!'];
  for (const b of bad) assert.throws(() => validateRaster(b), Error, b.slice(0, 40));
  const huge = 'data:image/png;base64,' + btoa('\x89PNG\r\n\x1a\n\0\0\0\rIHDR\0\0\x20\0\0\0\x20\0' + 'x'.repeat(40));
  assert.throws(() => validateRaster(huge), /4096/);
});

test('malformed or hostile templates fail with useful messages', () => {
  const base = JSON.parse(garden);
  const cases: [string, (t: Record<string, unknown>) => void, RegExp][] = [
    ['schema', t => { t.schemaVersion = 2; }, /schemaVersion/],
    ['profile', t => { t.profile = 'chess-engine'; }, /profile/],
    ['script op', t => { t.setup = [{ op: 'eval', code: 'process.exit()' }]; }, /unsupported operation/],
    ['duplicate ids', t => { (t.zones as { id: string }[])[1]!.id = 'market'; }, /duplicate zone/],
    ['orphan card', t => { (t.decks as { cards: string[] }[])[0]!.cards.pop(); }, /exactly one starting deck/],
    ['missing deck card', t => { (t.decks as { cards: string[] }[])[0]!.cards.push('ghost'); }, /missing card/],
    ['hidden hand', t => { (t.zones as { visibility: string }[])[4]!.visibility = 'public'; }, /private to its owner/],
    ['bad owner', t => { (t.zones as { owner: number }[])[4]!.owner = 7; }, /owner/],
    ['bad id chars', t => { t.id = '../../etc/passwd'; }, /letters, digits/],
    ['control chars', t => { t.title = 'Hi\u0007'; }, /control characters/],
    ['remote face', t => { (t.cards as { face?: string }[])[3]!.face = 'http://evil.example/x.png'; }, /embedded PNG/],
    ['intrilex seats', t => { t.profile = 'intrilex-core'; }, /two seats/],
    ['too many cards', t => { t.cards = Array.from({ length: TEMPLATE_LIMITS.cards + 1 }, (_, i) => ({ id: `c${i}`, rank: 'X', suit: '' })); }, /at most 216/],
    ['NaN coordinate', t => { (t.zones as { x: unknown }[])[0]!.x = 'NaN'; }, /zone x/],
  ];
  for (const [name, mutate, message] of cases) {
    const t = structuredClone(base);
    mutate(t);
    assert.throws(() => validateTemplate(t), message, name);
  }
  assert.throws(() => importTemplate('{not json'), /not valid JSON/);
  assert.throws(() => importTemplate('x'.repeat(TEMPLATE_LIMITS.bytes + 1)), /5 MB/);
});

test('validation strips unknown fields: imported templates are inert data', () => {
  const t = JSON.parse(garden);
  Object.assign(t, { onLoad: 'fetch("/api")', script: '<script>', __proto__polluted: true, credentials: 'secret' });
  t.zones[0].onClick = 'alert(1)';
  const v = validateTemplate(t) as unknown as Record<string, unknown>;
  for (const k of ['onLoad', 'script', '__proto__polluted', 'credentials']) assert.equal(k in v, false);
  assert.equal('onClick' in (v.zones as object[])[0]!, false);
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
});

test('export of a template never contains live state: it is built only from the template definition', () => {
  const t = builtInTemplates.find(x => x.id === 'standard-54')!;
  const json = exportTemplate(t);
  for (const k of ['handle', 'seenBy', 'order', 'history', 'invite', 'session', 'csrf']) assert.ok(!json.includes(`"${k}"`), k);
});
