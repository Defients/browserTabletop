import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { Client, cleanup, startServer, until, wait, type TestServer } from './helpers/server.js';
import type { RoomView } from '../packages/protocol/index.js';

const servers: TestServer[] = [];
after(async () => { for (const s of servers) { await s.stop().catch(() => undefined); cleanup(s.dir); } });
const srv = async () => { const s = await startServer(); servers.push(s); return s; };

test('First Contact: raw HTTP and WebSocket payloads never carry the opponent hand, DP handles or other credentials', async () => {
  const s = await srv();
  const a = new Client(s), b = new Client(s), spec = new Client(s), other = new Client(s);
  const room = await a.create('Ada');
  await b.join(room.invite, 'Bo');
  await spec.join(room.spectatorInvite, 'Cy');
  const otherRoom = await other.create('Di');
  const sockets = [a, b, spec].map(c => c.socket(room.roomId));
  await Promise.all(sockets.map(x => x.opened));
  // Play a few legal actions from whichever seat is active to generate traffic.
  for (let i = 0; i < 6; i++) {
    const va = (await a.view(room.roomId)).data, vb = (await b.view(room.roomId)).data;
    const [c, v] = va.game!.legalActions.length ? [a, va] : [b, vb];
    const act = v.game!.legalActions.find(x => x.type === 'draw' || x.type === 'end' || x.type === 'decline' || x.type === 'choose') ?? v.game!.legalActions[0]!;
    await c.command(room.roomId, v.revision, { type: 'game', action: act });
  }
  await wait(150);
  const internal = s.app.store.getRoom(room.roomId)!.game!;
  const hand = (p: number) => internal.players[p]!.hand.map(x => x.id);
  const deck = internal.deck.map(x => x.id);
  const aSeat = s.app.store.getRoom(room.roomId)!.participants.find(p => p.nickname === 'Ada')!.seat!;
  const bSeat = 1 - aSeat;
  const text = (c: Client) => c.raw.join('\n');
  for (const id of deck) for (const c of [a, b, spec]) assert.ok(!text(c).includes(id), 'no Draw Pile handle reaches any client');
  for (const id of hand(bSeat)) { assert.ok(!text(a).includes(id), 'host is not omniscient'); assert.ok(!text(spec).includes(id)); }
  for (const id of hand(aSeat)) { assert.ok(!text(b).includes(id)); assert.ok(!text(spec).includes(id)); }
  for (const c of [b, spec]) for (const secret of [room.invite, room.spectatorInvite, a.csrf, a.cookie.split('=')[1]!]) assert.ok(!text(c).includes(secret));
  assert.ok(!text(other).includes(room.roomId) && !text(a).includes(otherRoom.roomId), 'cross-room isolation');
  assert.ok(!/"seq"|"random"|"seed"/.test(text(a) + text(b) + text(spec)), 'no RNG or internal sequencing material');
  const specView = JSON.parse(spec.raw.filter(r => r.includes('"snapshot"')).at(-1)!).view as RoomView;
  assert.deepEqual(specView.game!.hand, []); assert.deepEqual(specView.game!.legalActions, []);
  sockets.forEach(x => x.close());
});

test('Free table: a remembered handle cannot be tracked after shuffle, reconnect, spectator join or export', async () => {
  const s = await srv();
  const a = new Client(s), b = new Client(s);
  const room = await a.create('Ada', 'standard-54');
  await b.join(room.invite, 'Bo');
  let v = (await a.view(room.roomId)).data;
  v = (await a.command(room.roomId, v.revision, { type: 'table', action: { type: 'draw', zone: 'deck', count: 1 } })).data.view!;
  const mine = v.table!.cards[0]!;
  v = (await a.command(room.roomId, v.revision, { type: 'table', action: { type: 'move', ids: [mine.id], zone: 'table', x: 400, y: 300, faceUp: true } })).data.view!;
  const watched = (await b.view(room.roomId)).data.table!.cards.find(c => c.zone === 'table')!;
  assert.ok(watched.rank, 'Bo saw the card face-up and remembers its handle');
  v = (await a.command(room.roomId, v.revision, { type: 'table', action: { type: 'move', ids: [watched.id], zone: 'deck' } })).data.view!;
  assert.equal((await a.command(room.roomId, v.revision, { type: 'table', action: { type: 'shuffle', zone: 'deck' } })).status, 200);
  const mark = b.raw.length;
  // Reconnect, new spectator, deal everything out face-down, export the template.
  const sock = b.socket(room.roomId); await sock.opened; await until(() => sock.messages.length > 0);
  const spec = new Client(s); await spec.join(room.spectatorInvite, 'Cy');
  v = (await a.view(room.roomId)).data;
  assert.equal((await a.command(room.roomId, v.revision, { type: 'table', action: { type: 'split', zone: 'deck', count: 54, target: 'discard' } })).status, 200);
  await b.view(room.roomId); await spec.view(room.roomId);
  const exported = await b.get(`/api/rooms/${room.roomId}/template`);
  await wait(100);
  const later = b.raw.slice(mark).join('\n') + spec.raw.join('\n') + a.raw.slice(-2).join('\n');
  assert.ok(!later.includes(watched.id), 'the old handle never reappears anywhere');
  const internal = s.app.store.getRoom(room.roomId)!.table!;
  const canonical = Object.keys(internal.cards);
  // Room views (HTTP and WebSocket) all carry a revision; the exported template is public definition data.
  const projections = [...b.raw, ...spec.raw, ...a.raw].filter(r => r.includes('"revision"')).join('\n');
  assert.ok(projections.length > 1000);
  for (const id of canonical) assert.ok(!projections.includes(`"id":"${id}"`), `canonical card ID ${id} never serialized in views: …${projections.slice(Math.max(0, projections.indexOf(`"id":"${id}"`) - 200), projections.indexOf(`"id":"${id}"`) + 60)}…`);
  const ex = JSON.stringify(exported.data);
  for (const k of ['"handle"', '"seenBy"', '"order"', room.invite, 'history']) assert.ok(!ex.includes(k), `export excludes ${k}`);
  sock.close();
});

test('removed participant: socket closed and no further projections delivered', async () => {
  const s = await srv();
  const a = new Client(s), b = new Client(s);
  const room = await a.create('Ada', 'standard-54');
  const j = await b.join(room.invite, 'Bo');
  const sock = b.socket(room.roomId); await sock.opened;
  let closedWith = 0;
  sock.ws.on('close', code => { closedWith = code; });
  let v = (await a.view(room.roomId)).data;
  v = (await a.command(room.roomId, v.revision, { type: 'remove', participantId: j.data.view.you.id })).data.view!;
  await until(() => closedWith !== 0);
  assert.equal(closedWith, 4003);
  const count = b.raw.length;
  await a.command(room.roomId, v.revision, { type: 'table', action: { type: 'draw', zone: 'deck', count: 3 } });
  await wait(100);
  assert.equal(b.raw.length, count, 'nothing further was sent');
  assert.equal((await b.view(room.roomId)).data.error, 'ROOM_ACCESS_DENIED');
  await assert.rejects(b.socket(room.roomId).opened, /403/);
});

test('error responses reveal only codes, never state or stack traces', async () => {
  const s = await srv();
  const a = new Client(s);
  const room = await a.create('Ada', 'standard-54');
  const r = await a.command(room.roomId, 0, { type: 'table', action: { type: 'move', ids: ['guess-handle'], zone: 'table' } });
  assert.deepEqual(Object.keys(r.data), ['error']);
  assert.match(r.data.error!, /^[A-Z_]+$/);
});
