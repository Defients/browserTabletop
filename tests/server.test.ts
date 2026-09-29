import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { Client, cleanup, startServer, until, wait, type TestServer } from './helpers/server.js';
import type { RoomView } from '../packages/protocol/index.js';

const servers: TestServer[] = [];
const srv = async (o = {}) => { const s = await startServer(o); servers.push(s); return s; };
after(async () => { for (const s of servers) { await s.stop().catch(() => undefined); cleanup(s.dir); } });

test('sessions: HttpOnly SameSite=Strict cookie with 256-bit token; CSRF and Origin enforced on writes', async () => {
  const s = await srv();
  const c = new Client(s);
  const cookie = await c.session();
  assert.match(cookie!, /^tabletop_session=[\w-]{43}; HttpOnly; SameSite=Strict; Path=\//);
  assert.equal((await c.req('POST', '/api/rooms', { nickname: 'x', templateId: 'blank' }, { 'x-csrf-token': 'nope' })).data.error, 'CSRF_REJECTED');
  const evil = new Client(s, 'https://evil.example'); evil.cookie = c.cookie; evil.csrf = c.csrf;
  assert.equal((await evil.post('/api/rooms', { nickname: 'x', templateId: 'blank' })).data.error, 'ORIGIN_REJECTED');
  const anon = await fetch(s.base + '/api/rooms');
  assert.equal(anon.status, 401);
  assert.equal((await c.req('POST', '/api/rooms', 'not json', { 'content-type': 'text/plain' })).status, 415);
});

test('invites: opaque 256-bit tokens; guest joins; host credentials never appear in ordinary views', async () => {
  const s = await srv();
  const host = new Client(s), guest = new Client(s);
  const room = await host.create('Ada');
  for (const t of [room.roomId, room.invite, room.spectatorInvite]) assert.match(t, /^[\w-]{43}$/);
  assert.notEqual(room.invite, room.spectatorInvite);
  const j = await guest.join(room.invite, 'Bo');
  assert.equal(j.status, 200); assert.equal(j.data.view.you.seat, 1);
  const g = await guest.view(room.roomId);
  const text = JSON.stringify(g.data);
  assert.ok(!text.includes(room.invite) && !text.includes(room.spectatorInvite), 'guest view has no invitations');
  assert.equal((await guest.get(`/api/rooms/${room.roomId}/invites`)).data.error, 'HOST_REQUIRED');
  assert.equal((await host.get(`/api/rooms/${room.roomId}/invites`)).data.invite, room.invite);
  assert.equal((await new Client(s).join('x'.repeat(43))).data.error, 'INVITE_INVALID');
});

test('seats and spectators: full seats refused, spectator join, seat collision, read-only spectator invite', async () => {
  const s = await srv();
  const host = new Client(s);
  const room = await host.create('Ada');
  await new Client(s).join(room.invite, 'Bo');
  const third = new Client(s);
  assert.equal((await third.join(room.invite, 'Cy')).data.error, 'SEATS_FULL');
  const spec = await third.join(room.invite, 'Cy', true);
  assert.equal(spec.data.view.you.seat, null);
  assert.equal((await third.command(room.roomId, spec.data.view.revision, { type: 'seat', seat: 1 })).data.error, 'SEAT_OCCUPIED');
  const ro = new Client(s);
  const r = await ro.join(room.spectatorInvite, 'Di');
  assert.equal(r.data.view.you.readOnly, true);
  assert.equal((await ro.command(room.roomId, r.data.view.revision, { type: 'seat', seat: 0 })).data.error, 'SPECTATOR_INVITATION_READ_ONLY');
  assert.equal((await ro.command(room.roomId, r.data.view.revision, { type: 'game', action: { type: 'draw' } })).data.error, 'SEAT_REQUIRED');
});

test('host controls: lock, invite rotation, removal (banned), transfer; non-hosts refused', async () => {
  const s = await srv();
  const host = new Client(s), guest = new Client(s), late = new Client(s);
  const room = await host.create('Ada', 'standard-54');
  const g = await guest.join(room.invite, 'Bo');
  let v = (await host.view(room.roomId)).data;
  assert.equal((await guest.command(room.roomId, v.revision, { type: 'lock', locked: true })).data.error, 'HOST_REQUIRED');
  v = (await host.command(room.roomId, v.revision, { type: 'lock', locked: true })).data.view!;
  assert.equal((await late.join(room.invite, 'Cy')).data.error, 'ROOM_LOCKED');
  v = (await host.command(room.roomId, v.revision, { type: 'lock', locked: false })).data.view!;
  v = (await host.command(room.roomId, v.revision, { type: 'rotate-invite' })).data.view!;
  assert.equal((await late.join(room.invite, 'Cy')).data.error, 'INVITE_INVALID', 'old invite revoked');
  const fresh = (await host.get<{ invite: string }>(`/api/rooms/${room.roomId}/invites`)).data.invite;
  assert.equal((await late.join(fresh, 'Cy')).status, 200);
  v = (await host.command(room.roomId, v.revision + 1, { type: 'remove', participantId: g.data.view.you.id })).data.view!;
  assert.equal((await guest.view(room.roomId)).data.error ?? (await guest.view(room.roomId)).status, 'ROOM_ACCESS_DENIED');
  assert.equal((await guest.join(fresh, 'Bo again')).data.error, 'ROOM_ACCESS_DENIED', 'removed guests stay banned');
  const lateId = v.participants.find(p => p.nickname === 'Cy')!.id;
  v = (await host.command(room.roomId, v.revision, { type: 'transfer', participantId: lateId })).data.view!;
  assert.equal(v.you.host, false);
  assert.equal((await host.command(room.roomId, v.revision, { type: 'lock', locked: true })).data.error, 'HOST_REQUIRED');
  assert.equal((await late.get(`/api/rooms/${room.roomId}/invites`)).status, 200, 'new host holds the invite controls');
});

test('idempotency and revisions: duplicate request IDs apply once; reused ID with new content refused; stale guided actions refused', async () => {
  const s = await srv();
  const host = new Client(s), guest = new Client(s);
  const room = await host.create('Ada');
  await guest.join(room.invite, 'Bo');
  let v = (await host.view(room.roomId)).data;
  const me = v.you.seat!, active = v.game!.activePlayer;
  const actor = me === active ? host : guest;
  v = (await actor.view(room.roomId)).data;
  const draw = { type: 'game', action: { type: 'draw' } };
  const a = await actor.command(room.roomId, v.revision, draw, 'dup-request-0001');
  const b = await actor.command(room.roomId, v.revision, draw, 'dup-request-0001');
  assert.equal(a.status, 200); assert.equal(b.data.duplicate, true);
  assert.equal(b.data.view!.revision, a.data.view!.revision, 'applied exactly once');
  assert.equal((await actor.command(room.roomId, v.revision, { type: 'game', action: { type: 'end' } }, 'dup-request-0001')).data.error, 'REQUEST_ID_REUSED');
  const stale = await actor.command(room.roomId, v.revision, { type: 'game', action: { type: 'end' } });
  assert.equal(stale.status, 409); assert.equal(stale.data.error, 'STALE_REVISION'); assert.ok(stale.data.view, 'fresh view returned');
});

test('concurrency: simultaneous draws from one pile never clone cards; each accepted once', async () => {
  const s = await srv();
  const host = new Client(s), guest = new Client(s);
  const room = await host.create('Ada', 'standard-54');
  await guest.join(room.invite, 'Bo');
  const v = (await host.view(room.roomId)).data;
  const draws = await Promise.all(Array.from({ length: 10 }, (_, i) => (i % 2 ? guest : host).command(room.roomId, v.revision, { type: 'table', action: { type: 'draw', zone: 'deck', count: 3 } })));
  assert.ok(draws.every(d => d.status === 200), 'draw is rebase-safe');
  const hv = (await host.view(room.roomId)).data.table!, gv = (await guest.view(room.roomId)).data.table!;
  const deck = hv.zones.find(z => z.id === 'deck')!.count;
  assert.equal(deck, 54 - 30);
  assert.equal(hv.zones.find(z => z.id === 'hand-0')!.count + hv.zones.find(z => z.id === 'hand-1')!.count, 30);
  const ids = [...hv.cards, ...gv.cards].map(c => c.id);
  assert.equal(new Set(ids).size, ids.length, 'no duplicate handles across both hands');
  // Destructive pile operations are not rebased.
  const shuffle = await host.command(room.roomId, v.revision, { type: 'table', action: { type: 'shuffle', zone: 'deck' } });
  assert.equal(shuffle.data.error, 'STALE_REVISION');
});

test('persistence: injected storage failure acknowledges nothing and changes nothing', async () => {
  let fail = false;
  const s = await srv({ failPersist: () => fail });
  const host = new Client(s);
  const room = await host.create('Ada', 'standard-54');
  const before = (await host.view(room.roomId)).data;
  fail = true;
  const r = await host.command(room.roomId, before.revision, { type: 'table', action: { type: 'draw', zone: 'deck', count: 5 } });
  assert.equal(r.status, 503); assert.equal(r.data.error, 'SAVE_FAILED');
  fail = false;
  const after = (await host.view(room.roomId)).data;
  assert.equal(after.revision, before.revision);
  assert.equal(after.table!.zones.find(z => z.id === 'deck')!.count, 54);
  const retry = await host.command(room.roomId, before.revision, { type: 'table', action: { type: 'draw', zone: 'deck', count: 5 } });
  assert.equal(retry.status, 200);
});

test('restart: accepted rooms, seats, hands and revocations survive a server restart', async () => {
  const s1 = await startServer();
  const host = new Client(s1), guest = new Client(s1);
  const room = await host.create('Ada', 'standard-54');
  await guest.join(room.invite, 'Bo');
  let v = (await host.view(room.roomId)).data;
  v = (await host.command(room.roomId, v.revision, { type: 'table', action: { type: 'draw', zone: 'deck', count: 4 } })).data.view!;
  v = (await host.command(room.roomId, v.revision, { type: 'rotate-invite' })).data.view!;
  const myHand = v.table!.cards.map(c => `${c.rank}${c.suit}`).sort();
  await s1.stop();
  const s2 = await startServer({ dir: s1.dir }); servers.push(s2);
  host.srv = s2; guest.srv = s2;
  const back = (await host.view(room.roomId)).data;
  assert.equal(back.revision, v.revision);
  assert.deepEqual(back.table!.cards.map(c => `${c.rank}${c.suit}`).sort(), myHand);
  assert.equal((await guest.view(room.roomId)).data.you.seat, 1);
  assert.equal((await new Client(s2).join(room.invite, 'Cy')).data.error, 'INVITE_INVALID', 'revocation persisted');
});

test('expiry and cross-room isolation', async () => {
  let t = Date.now();
  const s = await srv({ now: () => t });
  const a = new Client(s), b = new Client(s);
  const r1 = await a.create('Ada', 'blank');
  const r2 = await b.create('Bo', 'blank');
  assert.equal((await a.view(r2.roomId)).data.error, 'ROOM_ACCESS_DENIED');
  assert.equal((await a.command(r2.roomId, 0, { type: 'lock', locked: true })).data.error, 'ROOM_ACCESS_DENIED');
  const sock = a.socket(r2.roomId);
  await assert.rejects(sock.opened, /403/);
  t += 20 * 86_400_000;
  assert.equal((await a.view(r1.roomId)).status, 200, 'reading refreshes the session but not the room');
  t += 11 * 86_400_000;
  assert.equal((await a.view(r1.roomId)).data.error, 'ROOM_EXPIRED', 'rooms expire 30 days after their last accepted change');
  s.app.runMaintenance();
  assert.equal((await a.view(r1.roomId)).data.error, 'ROOM_NOT_FOUND', 'maintenance deletes expired rooms');
  t += 31 * 86_400_000;
  assert.equal((await a.view(r1.roomId)).status, 401, 'unused sessions expire after 30 days');
});

test('recovery code moves a participant to a new browser once; the old browser loses access', async () => {
  const s = await srv();
  const host = new Client(s), guest = new Client(s), newBrowser = new Client(s);
  const room = await host.create('Ada', 'standard-54');
  const g = await guest.join(room.invite, 'Bo');
  const { code } = (await guest.post<{ code: string }>(`/api/rooms/${room.roomId}/recovery`)).data;
  assert.match(code, /^[\w-]{43}$/);
  assert.ok(!JSON.stringify((await host.view(room.roomId)).data).includes(code));
  const r = await newBrowser.post<{ view: RoomView }>('/api/recover', { code });
  assert.equal(r.data.view.you.id, g.data.view.you.id);
  assert.equal((await guest.view(room.roomId)).data.error, 'ROOM_ACCESS_DENIED');
  assert.equal((await new Client(s).post('/api/recover', { code })).data.error, 'RECOVERY_INVALID', 'single use');
});

test('websocket: origin checked; snapshots per participant; presence relayed with the shared message shape', async () => {
  const s = await srv();
  const host = new Client(s), guest = new Client(s);
  const room = await host.create('Ada');
  await guest.join(room.invite, 'Bo');
  await assert.rejects(host.socket(room.roomId, 'https://evil.example').opened, /403/);
  const hs = host.socket(room.roomId), gs = guest.socket(room.roomId);
  await Promise.all([hs.opened, gs.opened]);
  await until(() => hs.messages.some(m => m.includes('"snapshot"')) && gs.messages.some(m => m.includes('"snapshot"')));
  hs.ws.send(JSON.stringify({ type: 'presence', x: 0.25, y: 0.75, surface: 'game' }));
  hs.ws.send('{"type":"presence","x":5,"y":0,"surface":"game"}'); // invalid: ignored
  await until(() => gs.messages.some(m => m.includes('"presence"')));
  const p = JSON.parse(gs.messages.find(m => m.includes('"presence"'))!);
  const hostId = (await host.view(room.roomId)).data.you.id;
  assert.deepEqual(p, { type: 'presence', participantId: hostId, x: 0.25, y: 0.75, surface: 'game' });
  const snapshots = gs.messages.filter(m => m.includes('"snapshot"')).map(m => JSON.parse(m).view as RoomView);
  assert.ok(snapshots.every(v => v.you.seat === 1), 'the guest socket only ever receives the guest projection');
  hs.close(); gs.close();
  await wait(50);
});

test('robustness: malformed commands, HTML nicknames, floods and oversized bodies fail safely', async () => {
  const s = await srv();
  const c = new Client(s);
  assert.equal((await c.post('/api/rooms', { nickname: '<img src=x>', templateId: 'blank' })).data.error, 'INVALID_NICKNAME');
  assert.equal((await c.post('/api/rooms', { nickname: 'Ada', template: { schemaVersion: 1, evil: true } })).data.error, 'INVALID_TEMPLATE');
  const room = await c.create('Ada', 'standard-54');
  for (const bad of [{}, { type: 'explode' }, { type: 'table', action: { type: 'draw', zone: 'deck', count: 1e9 } }, { type: 'game', action: { type: 'draw' } }, { type: 'seat', seat: -1 }])
    assert.ok([400, 403, 409, 422].includes((await c.command(room.roomId, 0, bad)).status), JSON.stringify(bad));
  const big = await c.req('POST', `/api/rooms/${room.roomId}/commands`, { requestId: 'big-request', revision: 0, command: { type: 'table', action: { type: 'add-component', kind: 'note', text: 'x'.repeat(70_000), value: 0, x: 1, y: 1 } } });
  assert.equal(big.status, 413);
  assert.equal((await c.view(room.roomId)).data.revision, 0, 'nothing applied');
  const health = await fetch(s.base + '/health');
  assert.equal(health.status, 200);
});

test('logs never contain credentials, invitations, CSRF tokens or card faces', async () => {
  const s = await srv();
  const host = new Client(s), guest = new Client(s);
  const room = await host.create('Ada', 'standard-54');
  await guest.join(room.invite, 'Bo');
  const v = (await host.view(room.roomId)).data;
  await host.command(room.roomId, v.revision, { type: 'table', action: { type: 'draw', zone: 'deck', count: 5 } });
  const { code } = (await guest.post<{ code: string }>(`/api/rooms/${room.roomId}/recovery`)).data;
  const logs = s.logs.join('\n');
  for (const secret of [room.invite, room.spectatorInvite, room.roomId, host.cookie.split('=')[1]!, host.csrf, guest.csrf, code]) assert.ok(!logs.includes(secret));
  assert.ok(!/"rank"|♠|♥/.test(logs));
});
