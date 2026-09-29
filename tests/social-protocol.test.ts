import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseClientMessage, parseServerMessage, type ServerMessage, type ChatEntry } from '../packages/protocol/index.js';

const parseClient = (value: unknown) => parseClientMessage(JSON.stringify(value));
const parseServer = (value: unknown) => parseServerMessage(JSON.stringify(value));
const timestamp = '2026-09-29T12:00:00.000Z';
const user = { id: 'entry-0001', messageOrder: 1, timestamp, kind: 'user', author: { participantId: 'person-1', nickname: '<Ada>', seat: 0 }, parts: [{ type: 'text', text: '<script>plain text</script>\n😀' }, { type: 'mention', participantId: 'person-2', nickname: 'Same name' }, { type: 'rule', ruleId: 'guard', title: 'Guard' }] } satisfies ChatEntry;

test('social client parser normalizes Unicode/newlines, accepts ID chips and preserves pointer shape', () => {
  const message = parseClient({ type: 'chat-send', requestId: 'unicode-chat-01', parts: [{ type: 'text', text: 'Cafe\u0301\r\n😀\rline\ttext' }, { type: 'mention', participantId: 'person-2' }, { type: 'rule', ruleId: 'FC.end' }], replyToId: 'parent-1' });
  assert.deepEqual(message, { type: 'chat-send', requestId: 'unicode-chat-01', parts: [{ type: 'text', text: 'Café\n😀\nline\ttext' }, { type: 'mention', participantId: 'person-2' }, { type: 'rule', ruleId: 'FC.end' }], replyToId: 'parent-1' });
  for (const type of ['presence', 'ping']) assert.deepEqual(parseClient({ type, surface: 'game', x: 0, y: 1 }), { type, surface: 'game', x: 0, y: 1 });
  assert.ok(parseClient({ type: 'chat-send', requestId: 'max-codepoints1', parts: [{ type: 'text', text: '😀'.repeat(1024) }] }), 'Unicode length counts points, not UTF-16 units');
  assert.ok(parseClient({ type: 'chat-send', requestId: 'chip-only-0001', parts: [{ type: 'mention', participantId: 'person-2' }] }));
});

test('social client parser refuses forged identity, malformed unions, scalar arrays, invalid IDs, controls and all content bounds', () => {
  const base = { type: 'chat-send', requestId: 'valid-request-01', parts: [{ type: 'text', text: 'hello' }] };
  const invalid = [null, [], 4, true, 'chat-send', {}, { ...base, room: 'other' }, { ...base, author: 'other' }, { ...base, timestamp }, { ...base, recipients: ['other'] }, { ...base, requestId: 'x' }, { ...base, requestId: 'a'.repeat(101) }, { ...base, replyToId: '../other-room' }, { ...base, parts: null }, { ...base, parts: 'text' }, { ...base, parts: [] }, { ...base, parts: [null] }, { ...base, parts: [{ type: 'system', code: 'reset' }] }, { ...base, parts: [{ type: 'text', text: ' \n\t' }] }, { ...base, parts: [{ type: 'text', text: '\u0000' }] }, { ...base, parts: [{ type: 'text', text: 'hello', html: true }] }, { ...base, parts: [{ type: 'mention', participantId: 'person-2', nickname: 'Forged' }] }, { ...base, parts: [{ type: 'rule', ruleId: 'guard', title: 'Forged' }] }, { ...base, parts: [{ type: 'text', text: '😀'.repeat(1025) }] }, { ...base, parts: [{ type: 'text', text: 'a'.repeat(600) }, { type: 'text', text: 'b'.repeat(425) }] }, { ...base, parts: Array.from({ length: 33 }, () => ({ type: 'text', text: 'a' })) }, { ...base, parts: Array.from({ length: 9 }, (_, i) => ({ type: 'mention', participantId: `person-${i}` })) }, { ...base, parts: Array.from({ length: 5 }, () => ({ type: 'rule', ruleId: 'guard' })) }];
  for (const value of invalid) assert.equal(parseClient(value), null, JSON.stringify(value).slice(0, 150));
  assert.equal(parseClientMessage('{broken'), null);
  assert.equal(parseClientMessage(' '.repeat(16_385)), null);
  for (const pointer of [{ type: 'presence', x: -1, y: 0.5, surface: 'game' }, { type: 'ping', x: 0.5, y: 0.5, surface: 'other' }, { type: 'ping', x: 0.5, y: 0.5, surface: 'game', participantId: 'forged' }]) assert.equal(parseClient(pointer), null);
});

test('every server social variant round-trips through strict runtime validation', () => {
  const examples: ServerMessage[] = [
    { type: 'chat-history', epoch: 'epoch-1', entries: [user] },
    { type: 'chat-message', epoch: 'epoch-1', entry: user },
    { type: 'chat-message', epoch: 'epoch-1', entry: { kind: 'system', id: 'entry-0002', messageOrder: 2, timestamp, code: 'reset' } },
    { type: 'chat-result', requestId: 'valid-request-01', ok: true, epoch: 'epoch-1', messageId: 'entry-0001' },
    { type: 'chat-result', requestId: 'valid-request-01', ok: false, code: 'CHAT_READ_ONLY' },
    ...(['choice', 'response', 'turn'] as const).map(kind => ({ type: 'notification' as const, notification: { id: `notice-${kind}`, kind, timestamp, revision: 5 } })),
    ...(['reconnected', 'disconnected'] as const).map(kind => ({ type: 'notification' as const, notification: { id: `notice-${kind}`, kind, timestamp, participantId: 'person-2', nickname: '<Bo>' } })),
    { type: 'notification', notification: { id: 'notice-mention', kind: 'mention', timestamp, participantId: 'person-1', messageId: 'entry-0001' } },
    { type: 'notification', notification: { id: 'notice-system', kind: 'system', timestamp, revision: 6, code: 'completed' } },
    { type: 'presence', participantId: 'person-2', x: 0.25, y: 0.75, surface: 'game' },
    { type: 'ping', participantId: 'person-2', x: 0.25, y: 0.75, surface: 'table' },
  ];
  for (const example of examples) assert.deepEqual(parseServer(example), example);
});

test('server parser refuses unsafe contexts, future/private fields, invalid stamps, ordering and counterfeit rules labels', () => {
  const base = { type: 'chat-message', epoch: 'epoch-1', entry: user };
  const invalid = [null, [], 5, 'message', {}, { ...base, privateState: {} }, { ...base, epoch: '../wrong' }, { ...base, entry: { ...user, messageOrder: -1 } }, { ...base, entry: { ...user, messageOrder: 0 } }, { ...base, entry: { ...user, messageOrder: 1.5 } }, { ...base, entry: { ...user, messageOrder: Number.MAX_SAFE_INTEGER + 1 } }, { ...base, entry: { ...user, timestamp: 'yesterday' } }, { ...base, entry: { ...user, timestamp: '2026-09-29' } }, { ...base, entry: { ...user, author: { ...user.author, seat: 8 } } }, { ...base, entry: { ...user, author: { ...user.author, session: 'secret' } } }, { ...base, entry: { ...user, parts: [{ type: 'rule', ruleId: 'https://evil.example', title: 'Click' }] } }, { ...base, entry: { ...user, parts: [{ type: 'rule', ruleId: 'guard', title: 'Forged summary' }] } }, { ...base, entry: { ...user, parts: [{ type: 'mention', participantId: 'person-2', nickname: 'Bo\nspoof' }] } }, { ...base, entry: { kind: 'system', id: 'entry-2', messageOrder: 2, timestamp, code: 'arbitrary', text: 'forged' } }, { type: 'chat-result', requestId: 'valid-request-01', ok: false, code: 'SECRET_ERROR' }, { type: 'notification', notification: { id: 'notice-1', timestamp, kind: 'choice', revision: 1, cardIds: ['hidden'] } }, { type: 'notification', notification: { id: 'notice-1', timestamp, kind: 'turn', revision: -1 } }, { type: 'notification', notification: { id: 'notice-1', timestamp, kind: 'mention', messageId: 'entry-1' } }, { type: 'chat-history', epoch: 'epoch-1', entries: [user, user] }, { type: 'chat-history', epoch: 'epoch-1', entries: [{ ...user, messageOrder: 2 }, { ...user, id: 'entry-2', messageOrder: 1 }] }, { type: 'chat-history', epoch: 'epoch-1', entries: Array.from({ length: 101 }, (_, i) => ({ ...user, id: `entry-${i}`, messageOrder: i + 1 })) }];
  for (const value of invalid) assert.equal(parseServer(value), null, JSON.stringify(value).slice(0, 160));
});
