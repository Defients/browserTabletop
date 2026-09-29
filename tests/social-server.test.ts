import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { parseServerMessage, type ServerMessage } from '../packages/protocol/index.js';
import { actionInput } from '../packages/intrilex/actionIdentity.js';
import { Client, cleanup, startServer, until, wait, type TestServer } from './helpers/server.js';

const servers: TestServer[] = [];
const sockets: ReturnType<Client['socket']>[] = [];
after(async () => {
  for (const socket of sockets) socket.close();
  for (const server of servers) { await server.stop().catch(() => undefined); cleanup(server.dir); }
});
async function server(options: Parameters<typeof startServer>[0] = {}) { const s = await startServer(options); servers.push(s); return s; }
function messages(socket: ReturnType<Client['socket']>) { return socket.messages.map(parseServerMessage).filter((m): m is ServerMessage => m !== null); }
async function connect(client: Client, roomId: string) {
  const socket = client.socket(roomId); sockets.push(socket); await socket.opened;
  await until(() => messages(socket).some(m => m.type === 'chat-history'));
  return socket;
}
async function result(socket: ReturnType<Client['socket']>, requestId: string) {
  await until(() => messages(socket).some(m => m.type === 'chat-result' && m.requestId === requestId));
  const m = messages(socket).find(m => m.type === 'chat-result' && m.requestId === requestId);
  assert.ok(m?.type === 'chat-result'); return m;
}
function send(socket: ReturnType<Client['socket']>, requestId: string, text: string, extra: Record<string, unknown> = {}) {
  socket.ws.send(JSON.stringify({ type: 'chat-send', requestId, parts: [{ type: 'text', text }], ...extra }));
}
function history(socket: ReturnType<Client['socket']>) { const m = messages(socket).find(m => m.type === 'chat-history'); assert.ok(m?.type === 'chat-history'); return m; }
function chat(socket: ReturnType<Client['socket']>) { return messages(socket).filter(m => m.type === 'chat-message'); }
function notices(socket: ReturnType<Client['socket']>) { return messages(socket).filter(m => m.type === 'notification').map(m => m.notification); }

test('social sockets: authoritative identity, all member roles, plain text, mentions, references, replies and no durable mutations', async () => {
  const s = await server(); const host = new Client(s), guest = new Client(s), spectator = new Client(s), readOnly = new Client(s), elsewhere = new Client(s);
  const room = await host.create('Same name', 'standard-54');
  const joined = await guest.join(room.invite, 'Same name');
  await spectator.join(room.invite, 'Observer', true); await readOnly.join(room.spectatorInvite, 'Reader');
  const otherRoom = await elsewhere.create('Other', 'blank');
  const hs = await connect(host, room.roomId), gs = await connect(guest, room.roomId), ss = await connect(spectator, room.roomId), rs = await connect(readOnly, room.roomId), os = await connect(elsewhere, otherRoom.roomId);
  const durableBefore = s.app.store.getRoom(room.roomId);
  const receiptsBefore = s.app.store.db.prepare('SELECT COUNT(*) AS n FROM receipts WHERE room=?').get(room.roomId);
  const viewBefore = (await host.view(room.roomId)).data;
  const literal = '<script>globalThis.pwned=1</script>\r\n😀\tplain';
  send(hs, 'social-identity-001', literal, { parts: [{ type: 'text', text: literal }, { type: 'mention', participantId: joined.data.view.you.id }, { type: 'rule', ruleId: 'guard' }] });
  const accepted = await result(hs, 'social-identity-001'); assert.equal(accepted.ok, true);
  await until(() => [hs, gs, ss, rs].every(socket => chat(socket).length === 1));
  const entry = chat(gs)[0]!.entry;
  assert.equal(entry.kind, 'user');
  if (entry.kind !== 'user') throw new Error('Expected authoritative user entry');
  assert.equal(entry.author.participantId, viewBefore.you.id); assert.equal(entry.author.nickname, 'Same name'); assert.equal(entry.author.seat, 0);
  const text = entry.parts.find(p => p.type === 'text'); assert.ok(text?.type === 'text'); assert.equal(text.text, literal.replace(/\r\n/g, '\n'));
  assert.ok(entry.parts.some(p => p.type === 'mention' && p.participantId === joined.data.view.you.id));
  assert.ok(entry.parts.some(p => p.type === 'rule' && p.ruleId === 'guard'));
  await until(() => notices(gs).some(m => m.kind === 'mention'));
  assert.equal(notices(hs).filter(m => m.kind === 'mention').length, 0, 'duplicate nicknames do not receive a mention meant for another ID');
  assert.equal(notices(ss).filter(m => m.kind === 'mention').length, 0); assert.equal(chat(os).length, 0);
  send(ss, 'social-reply-0001', 'ordinary spectator can speak', { replyToId: entry.id }); assert.equal((await result(ss, 'social-reply-0001')).ok, true);
  send(rs, 'social-readonly-01', 'forged spectator send'); const refused = await result(rs, 'social-readonly-01'); assert.equal(refused.ok, false);
  if (!refused.ok) assert.equal(refused.code, 'CHAT_READ_ONLY');
  await until(() => chat(rs).length === 2);
  assert.deepEqual(s.app.store.getRoom(room.roomId), durableBefore, 'chat leaves every durable room field unchanged');
  assert.deepEqual(s.app.store.db.prepare('SELECT COUNT(*) AS n FROM receipts WHERE room=?').get(room.roomId), receiptsBefore);
  const viewAfter = (await host.view(room.roomId)).data;
  for (const field of ['revision', 'savedAt', 'expiresAt', 'canUndo', 'history'] as const) assert.deepEqual(viewAfter[field], viewBefore[field], field);
  assert.ok(!s.logs.join('').includes('pwned'), 'routine logs exclude message body');
});

test('social retries: same request applies once, changed body is refused, cross-room references and identity claims cannot route data', async () => {
  const s = await server(); const host = new Client(s), other = new Client(s), guest = new Client(s);
  const room = await host.create('Host', 'blank'), foreign = await other.create('Foreign', 'blank'); const joined = await guest.join(room.invite, 'Guest');
  const hs = await connect(host, room.roomId), gs = await connect(guest, room.roomId), os = await connect(other, foreign.roomId);
  send(os, 'foreign-parent-01', 'elsewhere'); assert.equal((await result(os, 'foreign-parent-01')).ok, true);
  const foreignEntry = chat(os)[0]!.entry;
  send(hs, 'retry-same-000001', 'hello'); const first = await result(hs, 'retry-same-000001'); assert.equal(first.ok, true);
  send(hs, 'retry-same-000001', 'hello'); await until(() => messages(hs).filter(m => m.type === 'chat-result' && m.requestId === 'retry-same-000001').length === 2);
  const repeats = messages(hs).filter(m => m.type === 'chat-result' && m.requestId === 'retry-same-000001'); assert.deepEqual(repeats[1], repeats[0]); assert.equal(chat(gs).length, 1);
  send(hs, 'retry-same-000001', 'changed'); await until(() => messages(hs).some(m => m.type === 'chat-result' && m.requestId === 'retry-same-000001' && !m.ok));
  const changed = messages(hs).find(m => m.type === 'chat-result' && m.requestId === 'retry-same-000001' && !m.ok); assert.ok(changed?.type === 'chat-result' && !changed.ok); assert.equal(changed.code, 'CHAT_REQUEST_REUSED');
  for (const [id, extra] of [
    ['bad-reply-000001', { replyToId: foreignEntry.id }],
    ['bad-mention-0001', { parts: [{ type: 'mention', participantId: foreign.view.you.id }] }],
    ['bad-rule-0000001', { parts: [{ type: 'rule', ruleId: 'https://evil.example' }] }],
  ] as const) { send(hs, id, 'invalid', extra); assert.equal((await result(hs, id)).ok, false); }
  send(hs, 'bad-author-00001', 'spoof', { sender: joined.data.view.you.id, room: foreign.roomId });
  await wait(100); assert.equal(chat(gs).length, 1); assert.equal(chat(os).length, 1);
  const v = (await host.view(room.roomId)).data;
  assert.equal((await host.command(room.roomId, v.revision, { type: 'remove', participantId: joined.data.view.you.id })).status, 200);
  await until(() => gs.ws.readyState >= 2);
  send(hs, 'after-removal-01', 'only current members'); assert.equal((await result(hs, 'after-removal-01')).ok, true);
  assert.equal(chat(gs).length, 1, 'revoked socket receives no subsequent data');
  const denied = guest.socket(room.roomId); await assert.rejects(denied.opened, /403/);
});

test('social limits are shared by participant tabs; pointer storms do not consume or drop chat', async () => {
  let now = Date.now(); const s = await server({ now: () => now }); const host = new Client(s); const room = await host.create('Host', 'blank');
  const a = await connect(host, room.roomId), b = await connect(host, room.roomId);
  for (let i = 0; i < 120; i++) a.ws.send(JSON.stringify({ type: 'presence', surface: 'table', x: i / 120, y: 0.5 }));
  send(a, 'after-pointer-01', 'not lossy'); assert.equal((await result(a, 'after-pointer-01')).ok, true);
  let failures = 0, successes = 1;
  for (let i = 0; i < 14; i++) { const sock = i % 2 ? a : b; const id = `tab-rate-${String(i).padStart(5, '0')}`; send(sock, id, `message ${i}`); const r = await result(sock, id); if (r.ok) successes++; else { failures++; assert.equal(r.code, 'CHAT_RATE_LIMITED'); } }
  assert.ok(failures > 0); assert.ok(successes <= 10, 'opening another socket does not double the budget');
  now += 61_000; send(b, 'rate-refill-0001', 'refilled'); assert.equal((await result(b, 'rate-refill-0001')).ok, true);
  await until(() => chat(b).length === successes + 1);
});

test('social history is bounded, idle maintenance rotates epoch, restart loses chat while durable room survives', async () => {
  let now = Date.now(); const s = await server({ now: () => now }); const host = new Client(s); const room = await host.create('Host', 'blank');
  const a = await connect(host, room.roomId); const originalEpoch = history(a).epoch;
  for (let i = 0; i < 105; i++) { now += 61_000; const id = `history-message-${i}`; send(a, id, `entry ${i}`); assert.equal((await result(a, id)).ok, true); }
  const b = await connect(host, room.roomId); const retained = history(b); assert.equal(retained.epoch, originalEpoch); assert.equal(retained.entries.length, 100);
  assert.ok(retained.entries.every((entry, i, all) => i === 0 || entry.messageOrder > all[i - 1]!.messageOrder));
  const oldParent = chat(a)[0]!.entry.id;
  send(a, 'expired-parent-01', 'reply', { replyToId: oldParent }); assert.equal((await result(a, 'expired-parent-01')).ok, false);
  now += 3_600_001; s.app.runMaintenance(); const c = await connect(host, room.roomId); assert.notEqual(history(c).epoch, originalEpoch); assert.deepEqual(history(c).entries, []);
  send(c, 'before-restart-01', 'ephemeral'); assert.equal((await result(c, 'before-restart-01')).ok, true); const epoch = history(c).epoch;
  const durable = s.app.store.getRoom(room.roomId);
  await s.stop(); const restarted = await server({ dir: s.dir, now: () => now }); host.srv = restarted;
  const d = await connect(host, room.roomId); assert.notEqual(history(d).epoch, epoch); assert.deepEqual(history(d).entries, []); assert.deepEqual(restarted.app.store.getRoom(room.roomId), durable);
});

test('recovery invalidates the old social socket before later messages, with authorization before retry lookup', async () => {
  const s = await server(); const host = new Client(s), guest = new Client(s), recovered = new Client(s); const room = await host.create('Host', 'blank'); await guest.join(room.invite, 'Guest');
  const hs = await connect(host, room.roomId), gs = await connect(guest, room.roomId);
  send(gs, 'old-session-0001', 'accepted before recovery'); assert.equal((await result(gs, 'old-session-0001')).ok, true);
  const { code } = (await guest.post<{ code: string }>(`/api/rooms/${room.roomId}/recovery`)).data;
  assert.equal((await recovered.post('/api/recover', { code })).status, 200); await until(() => gs.ws.readyState >= 2);
  const rs = await connect(recovered, room.roomId);
  send(hs, 'new-session-0001', 'current membership only'); assert.equal((await result(hs, 'new-session-0001')).ok, true); await until(() => chat(rs).length === 1);
  assert.equal(chat(gs).length, 1); assert.equal((await guest.view(room.roomId)).status, 403);
});

test('invalid chat remains isolated and oversized frames close only the offending socket', async () => {
  const s = await server(); const host = new Client(s), guest = new Client(s); const room = await host.create('Host', 'blank'); await guest.join(room.invite, 'Guest');
  const hs = await connect(host, room.roomId), gs = await connect(guest, room.roomId);
  for (const [id, parts] of [
    ['invalid-empty-01', [{ type: 'text', text: ' \n\t' }]],
    ['invalid-control1', [{ type: 'text', text: '\u0000' }]],
    ['invalid-length01', [{ type: 'text', text: '😀'.repeat(1025) }]],
    ['invalid-part-001', [{ type: 'system', code: 'reset' }]],
    ['invalid-count01', Array.from({ length: 33 }, () => ({ type: 'text', text: 'hi' }))],
  ] as const) { send(hs, id, '', { parts }); const r = await result(hs, id); assert.ok(!r.ok); assert.equal(r.code, 'CHAT_INVALID'); }
  assert.equal(chat(gs).length, 0);
  const closed = new Promise<number>(resolve => hs.ws.once('close', code => resolve(code)));
  hs.ws.send('x'.repeat(16_385)); assert.equal(await closed, 1009);
  send(gs, 'survivor-send-01', 'still working'); assert.equal((await result(gs, 'survivor-send-01')).ok, true); assert.equal(chat(gs).length, 1);
});

test('socket expiry is checked on social delivery and send without chat extending room lifetime', async () => {
  let now = Date.now(); const s = await server({ now: () => now }); const host = new Client(s), guest = new Client(s); const room = await host.create('Host', 'blank'); await guest.join(room.invite, 'Guest');
  const hs = await connect(host, room.roomId), gs = await connect(guest, room.roomId);
  const durable = s.app.store.getRoom(room.roomId)!;
  now += 29 * 86_400_000;
  await host.session(); // Only host's session stays current; neither action extends durable room expiry.
  send(hs, 'late-room-chat01', 'near expiry'); assert.equal((await result(hs, 'late-room-chat01')).ok, true);
  assert.equal(s.app.store.getRoom(room.roomId)!.expires, durable.expires);
  now += 2 * 86_400_000;
  send(hs, 'expired-room-001', 'must not be accepted'); await until(() => hs.ws.readyState >= 2);
  assert.equal(chat(gs).length, 1);
  s.app.runMaintenance(); assert.equal(s.app.store.getRoom(room.roomId), undefined);
});

test('decision and reset notices follow commits; duplicates, stale commands, failed saves and spectators produce no extra decision notice', async () => {
  let fail = false; const s = await server({ failPersist: () => fail }); const host = new Client(s), guest = new Client(s), spectator = new Client(s), elsewhere = new Client(s);
  const room = await host.create('Host'); await guest.join(room.invite, 'Guest'); await spectator.join(room.spectatorInvite, 'Viewer'); const foreign = await elsewhere.create('Elsewhere', 'blank');
  const hs = await connect(host, room.roomId), gs = await connect(guest, room.roomId), ss = await connect(spectator, room.roomId), os = await connect(elsewhere, foreign.roomId);
  assert.equal(notices(hs).filter(m => ['turn', 'choice', 'response'].includes(m.kind)).length, 0, 'connecting does not replay current decisions');
  let view = (await host.view(room.roomId)).data; const actor = view.you.seat === view.game!.activePlayer ? host : guest; const target = actor === host ? gs : hs; const actingSocket = actor === host ? hs : gs;
  view = (await actor.view(room.roomId)).data;
  const drawn = await actor.command(room.roomId, view.revision, { type: 'game', action: { type: 'draw' } }, 'notice-draw-0001'); assert.equal(drawn.status, 200);
  for (let i = 0; i < 5; i++) {
    const current = (await host.view(room.roomId)).data; if (!current.game!.pending.length) break;
    const responder = current.game!.priority === current.you.seat ? host : guest;
    const responseView = (await responder.view(room.roomId)).data;
    assert.equal((await responder.command(room.roomId, responseView.revision, { type: 'game', action: { type: 'decline' } }, `draw-response-${i}`)).status, 200);
  }
  const afterDraw = (await actor.view(room.roomId)).data;
  const beforeEnd = notices(target).length, actingTurns = notices(actingSocket).filter(m => m.kind === 'turn').length; fail = true;
  const refused = await actor.command(room.roomId, afterDraw.revision, { type: 'game', action: { type: 'end' } }, 'notice-end-00001'); assert.equal(refused.status, 503); await wait(80); assert.equal(notices(target).length, beforeEnd);
  fail = false; const ended = await actor.command(room.roomId, afterDraw.revision, { type: 'game', action: { type: 'end' } }, 'notice-end-00001'); assert.equal(ended.status, 200);
  await until(() => notices(target).some(m => m.kind === 'turn'));
  const turn = notices(target).find(m => m.kind === 'turn')!; assert.equal(turn.revision, ended.data.view!.revision);
  assert.equal(notices(actingSocket).filter(m => m.kind === 'turn').length, actingTurns); assert.equal(notices(ss).filter(m => ['turn', 'choice', 'response'].includes(m.kind)).length, 0); assert.equal(notices(os).length, 0);
  const count = notices(target).length;
  assert.equal((await actor.command(room.roomId, afterDraw.revision, { type: 'game', action: { type: 'end' } }, 'notice-end-00001')).data.duplicate, true);
  assert.equal((await actor.command(room.roomId, afterDraw.revision, { type: 'game', action: { type: 'end' } }, 'notice-stale-001')).status, 409);
  await wait(80); assert.equal(notices(target).length, count);
  const hv = (await host.view(room.roomId)).data;
  fail = true; const failedReset = await host.command(room.roomId, hv.revision, { type: 'reset', confirm: true }, 'notice-reset-001'); assert.equal(failedReset.status, 503, JSON.stringify(failedReset.data)); await wait(50); assert.equal(chat(ss).length, 0);
  fail = false; assert.equal((await host.command(room.roomId, hv.revision, { type: 'reset', confirm: true }, 'notice-reset-001')).status, 200);
  await until(() => chat(ss).some(m => m.entry.kind === 'system'));
  const systems = chat(ss).filter(m => m.entry.kind === 'system'); assert.equal(systems.length, 1); assert.equal(notices(os).length, 0);
});

test('connectivity notices count all tabs and debounce final disconnect with cancellation', async () => {
  const s = await server(); const host = new Client(s), guest = new Client(s); const room = await host.create('Host', 'blank'); await guest.join(room.invite, 'Guest');
  const hs = await connect(host, room.roomId), a = await connect(guest, room.roomId); await until(() => notices(hs).some(m => m.kind === 'reconnected'));
  const b = await connect(guest, room.roomId); await wait(70); assert.equal(notices(hs).filter(m => m.kind === 'reconnected').length, 1);
  a.close(); await wait(150); assert.equal(notices(hs).filter(m => m.kind === 'disconnected').length, 0);
  b.close(); await wait(100); const c = await connect(guest, room.roomId); await wait(3_150); assert.equal(notices(hs).filter(m => m.kind === 'disconnected').length, 0);
  assert.equal(notices(hs).filter(m => m.kind === 'reconnected').length, 1, 'transient flap cancels disconnect without a false reconnect');
  c.close(); await until(() => notices(hs).some(m => m.kind === 'disconnected'), 4500); assert.equal(notices(hs).filter(m => m.kind === 'disconnected').length, 1);
});

test('private response then discard choice notifications follow recipient projections, with choice taking precedence', async () => {
  const s = await server(); const host = new Client(s), guest = new Client(s), spectator = new Client(s); const room = await host.create('Host'); await guest.join(room.invite, 'Guest'); await spectator.join(room.spectatorInvite, 'Reader');
  const saved = s.app.store.getRoom(room.roomId)!; const game = saved.game!;
  const cards = [...game.deck, ...game.players.flatMap(p => p.hand)]; const quick = cards.find(c => c.rank === '2' && c.suit === '♣')!;
  const hostAce = cards.find(c => c.rank === 'A' && c.suit === '♣')!, guestAce = cards.find(c => c.rank === 'A' && c.suit === '♦')!;
  const rest = cards.filter(c => ![quick.id, hostAce.id, guestAce.id].includes(c.id)); game.players[0]!.hand = [quick, hostAce]; game.players[1]!.hand = [guestAce, ...rest.splice(0, 4)]; game.deck = rest;
  game.activePlayer = 0; game.priority = 0; game.phase = 'action';
  s.app.store.saveRoom(saved, Date.now());
  const hs = await connect(host, room.roomId), gs = await connect(guest, room.roomId), ss = await connect(spectator, room.roomId);
  const hv = (await host.view(room.roomId)).data; const legal = hv.game!.legalActions.find(a => a.mode === 'quick2'); assert.ok(legal);
  const declared = await host.command(room.roomId, hv.revision, { type: 'game', action: actionInput(legal) }, 'quick-choice-001'); assert.equal(declared.status, 200);
  await until(() => notices(gs).some(n => n.kind === 'response')); assert.equal(notices(hs).filter(n => ['turn', 'response', 'choice'].includes(n.kind)).length, 0); assert.equal(notices(ss).filter(n => ['turn', 'response', 'choice'].includes(n.kind)).length, 0);
  let gv = (await guest.view(room.roomId)).data; assert.equal((await guest.command(room.roomId, gv.revision, { type: 'game', action: { type: 'decline' } }, 'quick-decline-01')).status, 200);
  await until(() => notices(hs).some(n => n.kind === 'response'));
  const fresh = (await host.view(room.roomId)).data; const resolved = await host.command(room.roomId, fresh.revision, { type: 'game', action: { type: 'decline' } }, 'quick-decline-02'); assert.equal(resolved.status, 200);
  await until(() => notices(gs).some(n => n.kind === 'choice')); const choice = notices(gs).find(n => n.kind === 'choice')!;
  gv = (await guest.view(room.roomId)).data; assert.equal(gv.game!.choice?.player, gv.you.seat); assert.ok(gv.game!.legalActions.every(a => a.type === 'choose'));
  assert.equal(choice.revision, gv.revision); assert.deepEqual(Object.keys(choice).sort(), ['id', 'kind', 'revision', 'timestamp']);
  assert.equal(notices(gs).filter(n => n.kind === 'choice').length, 1); assert.equal(notices(ss).filter(n => ['turn', 'response', 'choice'].includes(n.kind)).length, 0); assert.equal(notices(hs).filter(n => n.kind === 'choice').length, 0);
  const reconnect = await connect(guest, room.roomId); assert.equal(notices(reconnect).length, 0, 'choice initialization does not replay historical notice');
});

test('slow-consumer policy closes rather than silently dropping an accepted social entry; history recovers it', async () => {
  const s = await server(); const host = new Client(s), guest = new Client(s); const room = await host.create('Host', 'blank'); await guest.join(room.invite, 'Guest');
  const hs = await connect(host, room.roomId), gs = await connect(guest, room.roomId);
  const descriptor = Object.getOwnPropertyDescriptor(WebSocket.prototype, 'bufferedAmount'); assert.ok(descriptor);
  const closed = new Promise<number>(resolve => gs.ws.once('close', code => resolve(code)));
  try {
    // Actual authorized server sockets exercise the send branch; override only the measured
    // backpressure because kernel buffer sizes vary by OS and would make paused-TCP tests flaky.
    Object.defineProperty(WebSocket.prototype, 'bufferedAmount', { configurable: true, get: () => 2_000_001 });
    send(hs, 'slow-consumer-01', 'accepted before backpressure close'); assert.equal(await closed, 4008);
  } finally { Object.defineProperty(WebSocket.prototype, 'bufferedAmount', descriptor); }
  const recovered = await connect(guest, room.roomId); const entries = history(recovered).entries;
  assert.equal(entries.length, 1); assert.ok(entries[0]?.kind === 'user');
  if (entries[0]?.kind === 'user') assert.equal(entries[0].parts[0]?.type === 'text' ? entries[0].parts[0].text : '', 'accepted before backpressure close');
});

test('malformed attempt budget is shared across tabs and closes abusive socket without affecting other participants', async () => {
  const s = await server(); const host = new Client(s), guest = new Client(s); const room = await host.create('Host', 'blank'); await guest.join(room.invite, 'Guest');
  const a = await connect(host, room.roomId), b = await connect(host, room.roomId), gs = await connect(guest, room.roomId);
  const closed = new Promise<number>(resolve => b.ws.once('close', code => resolve(code)));
  for (let i = 0; i < 40; i++) {
    const socket = i < 20 ? a : b, id = `attempt-budget-${i}`;
    send(socket, id, '', { parts: [] }); assert.equal((await result(socket, id)).ok, false);
  }
  send(b, 'attempt-budget41', '', { parts: [] }); assert.equal(await closed, 4008);
  send(gs, 'nonabusive-00001', 'still authorized'); assert.equal((await result(gs, 'nonabusive-00001')).ok, true); assert.equal(chat(gs).length, 1);
});

test('expired session is revoked on social delivery while refreshed host and durable room remain usable', async () => {
  let now = Date.now(); const s = await server({ now: () => now }); const host = new Client(s), guest = new Client(s); const room = await host.create('Host', 'blank'); await guest.join(room.invite, 'Guest');
  const hs = await connect(host, room.roomId), gs = await connect(guest, room.roomId);
  now += 29 * 86_400_000; const v = (await host.view(room.roomId)).data;
  assert.equal((await host.command(room.roomId, v.revision, { type: 'rename', nickname: 'Host refreshed' }, 'refresh-room-001')).status, 200);
  now += 2 * 86_400_000;
  send(hs, 'expired-peer-001', 'only fresh sessions receive'); assert.equal((await result(hs, 'expired-peer-001')).ok, true);
  await until(() => gs.ws.readyState >= 2); assert.equal(chat(gs).length, 0); assert.equal(s.app.store.getRoom(room.roomId)!.revision, v.revision + 1);
});

test('victorious End emits one completed system entry; reset retains chat and duplicates replay neither entry nor notice', async () => {
  const s = await server(); const host = new Client(s), guest = new Client(s); const room = await host.create('Host'); await guest.join(room.invite, 'Guest');
  const saved = s.app.store.getRoom(room.roomId)!; const game = saved.game!; const cards = [...game.deck, ...game.players.flatMap(p => p.hand)];
  const points = [cards.find(c => c.rank === '10')!, cards.find(c => c.rank === '5')!]; const rest = cards.filter(c => !points.some(p => p.id === c.id));
  game.players[0]!.pr = points.map(card => ({ ...card, owner: 0 })); game.players[0]!.hand = rest.splice(0, 4); game.players[1]!.hand = rest.splice(0, 5); game.deck = rest; game.activePlayer = 0; game.priority = 0; game.miniTurns = 0;
  s.app.store.saveRoom(saved, Date.now()); const hs = await connect(host, room.roomId), gs = await connect(guest, room.roomId);
  send(hs, 'finish-chat-0001', 'retained through finish and reset'); assert.equal((await result(hs, 'finish-chat-0001')).ok, true);
  const v = (await host.view(room.roomId)).data; const ended = await host.command(room.roomId, v.revision, { type: 'game', action: { type: 'end' } }, 'winning-end-001'); assert.equal(ended.status, 200); assert.equal(ended.data.view!.game!.winner, 0);
  await until(() => chat(gs).some(m => m.entry.kind === 'system' && m.entry.code === 'completed'));
  assert.equal((await host.command(room.roomId, v.revision, { type: 'game', action: { type: 'end' } }, 'winning-end-001')).data.duplicate, true);
  const reset = await host.command(room.roomId, ended.data.view!.revision, { type: 'reset', confirm: true }, 'winning-reset01'); assert.equal(reset.status, 200);
  assert.equal((await host.command(room.roomId, ended.data.view!.revision, { type: 'reset', confirm: true }, 'winning-reset01')).data.duplicate, true);
  await until(() => chat(gs).length === 3); assert.deepEqual(chat(gs).map(m => m.entry.kind === 'system' ? m.entry.code : 'user'), ['user', 'completed', 'reset']);
  assert.deepEqual(notices(gs).filter(n => n.kind === 'system').map(n => n.code), ['completed', 'reset']);
});

test('the same authorized chat path works in every online rules profile', async () => {
  const s = await server();
  for (const template of ['blank', 'intrilex-core', 'intrilex-first-contact', 'intrilex-full']) {
    const host = new Client(s), guest = new Client(s);
    const room = await host.create('Host', template); await guest.join(room.invite, 'Guest');
    const hs = await connect(host, room.roomId), gs = await connect(guest, room.roomId);
    const before = s.app.store.getRoom(room.roomId);
    send(hs, `profile-message-${template}`, `hello ${template}`);
    assert.equal((await result(hs, `profile-message-${template}`)).ok, true);
    await until(() => chat(gs).length === 1);
    assert.deepEqual(s.app.store.getRoom(room.roomId), before);
  }
});

test('bounded chat receipts can evict before ten minutes; retained retries remain idempotent', async () => {
  let now = Date.now(); const s = await server({ now: () => now }); const host = new Client(s);
  const room = await host.create('Host', 'blank'), hs = await connect(host, room.roomId);
  for (let i = 0; i < 201; i++) {
    if (i && i % 6 === 0) now += 10_001;
    const id = `cache-bound-${i}`; send(hs, id, `entry ${i}`); assert.equal((await result(hs, id)).ok, true);
  }
  const first = chat(hs)[0]!.entry.id, retained = chat(hs).at(-1)!.entry.id;
  send(hs, 'cache-bound-200', 'entry 200');
  await until(() => messages(hs).filter(m => m.type === 'chat-result' && m.requestId === 'cache-bound-200').length === 2);
  const retry = messages(hs).filter(m => m.type === 'chat-result' && m.requestId === 'cache-bound-200').at(-1)!;
  assert.ok(retry.type === 'chat-result' && retry.ok); assert.equal(retry.messageId, retained); assert.equal(chat(hs).length, 201);
  send(hs, 'cache-bound-0', 'entry 0');
  await until(() => messages(hs).filter(m => m.type === 'chat-result' && m.requestId === 'cache-bound-0').length === 2);
  const evicted = messages(hs).filter(m => m.type === 'chat-result' && m.requestId === 'cache-bound-0').at(-1)!;
  assert.ok(evicted.type === 'chat-result' && evicted.ok); assert.notEqual(evicted.messageId, first);
  assert.ok(now - Date.now() < 600_000, 'this scenario demonstrates count eviction within the time window');
});
