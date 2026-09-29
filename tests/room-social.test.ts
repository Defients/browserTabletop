import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoomSocial } from '../apps/web/useRoomSocial.js';
import type { ChatEntry, ChatSendMessage, RoomNotification } from '../packages/protocol/index.js';

const entry = (id: string, order: number, author = 'other'): ChatEntry => ({ id, messageOrder: order, timestamp: '2026-09-29T12:00:00.000Z', kind: 'user', author: { participantId: author, nickname: author, seat: null }, parts: [{ type: 'text', text: id }] });
test('social history merges live race, preserves same-epoch unread, and replaces old epoch', () => {
  const social = createRoomSocial('room', 'me');
  try {
    social.handle({ type: 'chat-message', epoch: 'epoch-a', entry: entry('live', 2) });
    social.handle({ type: 'chat-history', epoch: 'epoch-a', entries: [entry('history', 1)] });
    assert.deepEqual(social.getSnapshot().entries.map(e => e.id), ['history', 'live']);
    assert.equal(social.getSnapshot().unread, 1);
    social.handle({ type: 'chat-history', epoch: 'epoch-a', entries: [entry('history', 1), entry('live', 2)] });
    assert.equal(social.getSnapshot().unread, 1);
    social.handle({ type: 'chat-message', epoch: 'epoch-b', entry: entry('new-live', 2) });
    social.handle({ type: 'chat-history', epoch: 'epoch-b', entries: [entry('new-history', 1)] });
    assert.deepEqual(social.getSnapshot().entries.map(e => e.id), ['new-history', 'new-live']);
    assert.equal(social.getSnapshot().epochChanged, true);
    assert.equal(social.getSnapshot().unread, 1);
  } finally { social.destroy(); }
});
test('chat failure preserves draft; uncertain retry retains ID and acceptance does not clear edited draft', () => {
  const social = createRoomSocial('room', 'me');
  const sent: ChatSendMessage[] = [];
  const transport = (m: ChatSendMessage) => { sent.push(m); return true; };
  try {
    social.setDraft('hello'); social.send([{ type: 'text', text: 'hello' }], undefined, transport);
    const id = sent[0].requestId;
    social.disconnect(); assert.equal(social.getSnapshot().pending[0].status, 'uncertain');
    assert.equal(sent.length, 1);
    social.retry(id, transport); assert.equal(sent[1].requestId, id);
    social.handle({ type: 'chat-result', requestId: id, ok: false, code: 'CHAT_RATE_LIMITED' });
    assert.equal(social.getSnapshot().draft, 'hello');
    social.setDraft('edited while waiting');
    social.retry(id, transport);
    social.handle({ type: 'chat-result', requestId: id, ok: true, epoch: 'epoch-a', messageId: 'accepted' });
    assert.equal(social.getSnapshot().draft, 'edited while waiting');
    social.handle({ type: 'chat-history', epoch: 'epoch-a', entries: [entry('accepted', 1, 'me')] });
    assert.equal(social.getSnapshot().pending.length, 0);
  } finally { social.destroy(); }
});
test('accepted matching draft clears once; explicit new send after epoch change gets new ID', () => {
  const social = createRoomSocial('room', 'me'); const sent: ChatSendMessage[] = [];
  const transport = (m: ChatSendMessage) => { sent.push(m); return true; };
  try {
    social.handle({ type: 'chat-history', epoch: 'epoch-a', entries: [] });
    social.setDraft('hi'); social.setChips([{ type: 'mention', participantId: 'other' }]);
    social.send([{ type: 'text', text: 'hi' }, { type: 'mention', participantId: 'other' }], undefined, transport);
    social.handle({ type: 'chat-result', requestId: sent[0].requestId, ok: true, epoch: 'epoch-a', messageId: 'accepted' });
    assert.equal(social.getSnapshot().draft, ''); assert.equal(social.getSnapshot().chips.length, 0);
    social.handle({ type: 'chat-history', epoch: 'epoch-b', entries: [] });
    social.retry(sent[0].requestId, transport); assert.equal(sent.length, 1);
    social.retry(sent[0].requestId, transport, true); assert.equal(sent.length, 2);
    assert.notEqual(sent[0].requestId, sent[1].requestId);
  } finally { social.destroy(); }
});
test('local mute suppresses unread and mentions; queue deduplicates, bounds, dismisses and clears stale decisions', () => {
  const social = createRoomSocial('room', 'me');
  const notice = (notification: RoomNotification) => social.handle({ type: 'notification', notification });
  try {
    social.handle({ type: 'chat-history', epoch: 'epoch-a', entries: [] }); social.setMuted('other', true);
    social.handle({ type: 'chat-message', epoch: 'epoch-a', entry: entry('muted', 1) }); assert.equal(social.getSnapshot().unread, 0);
    notice({ id: 'mention', kind: 'mention', messageId: 'muted', participantId: 'other', timestamp: '2026-09-29T12:00:00Z' }); assert.equal(social.getSnapshot().notices.length, 0);
    for (let i = 0; i < 8; i++) notice({ id: `notice-${i}`, kind: 'turn', timestamp: '2026-09-29T12:00:00Z' });
    assert.equal(social.getSnapshot().notices.length, 5);
    notice({ id: 'notice-7', kind: 'turn', timestamp: '2026-09-29T12:00:00Z' }); assert.equal(social.getSnapshot().notices.length, 5);
    social.dismissNotice('notice-7'); assert.equal(social.getSnapshot().notices.length, 4);
    notice({ id: 'reset', kind: 'system', code: 'reset', timestamp: '2026-09-29T12:00:00Z' });
    assert.deepEqual(social.getSnapshot().notices.map(n => n.kind), ['system']);
    social.setMuted('other', false); assert.equal(social.getSnapshot().unread, 1);
    social.markRead(); assert.equal(social.getSnapshot().unread, 0);
  } finally { social.destroy(); }
});
test('effect replay reactivates a clean store without retaining revoked social data', () => {
  const social = createRoomSocial('room', 'me');
  social.handle({ type: 'chat-history', epoch: 'epoch-a', entries: [entry('old', 1)] });
  social.destroy(); social.activate();
  try {
    social.handle({ type: 'chat-history', epoch: 'epoch-a', entries: [entry('fresh', 2)] });
    assert.deepEqual(social.getSnapshot().entries.map(e => e.id), ['fresh']);
    assert.equal(social.getSnapshot().epochChanged, false);
  } finally { social.destroy(); }
});

test('late acceptance cannot clear a changed reply draft or cross a replaced social epoch', () => {
  const social = createRoomSocial('reply-room', 'me'); const sent: ChatSendMessage[] = [];
  try {
    social.handle({ type: 'chat-history', epoch: 'epoch-a', entries: [] });
    social.setDraft('reply'); social.setReply('parent-a');
    social.send([{ type: 'text', text: 'reply' }], 'parent-a', m => { sent.push(m); return true; });
    social.setReply('parent-b');
    social.handle({ type: 'chat-result', requestId: sent[0].requestId, ok: true, epoch: 'epoch-a', messageId: 'accepted-a' });
    assert.equal(social.getSnapshot().draft, 'reply'); assert.equal(social.getSnapshot().replyToId, 'parent-b');
    social.handle({ type: 'chat-history', epoch: 'epoch-b', entries: [] });
    social.handle({ type: 'chat-result', requestId: sent[0].requestId, ok: true, epoch: 'epoch-a', messageId: 'accepted-a' });
    assert.equal(social.getSnapshot().draft, 'reply'); assert.equal(social.getSnapshot().pending[0].status, 'failed');
    assert.equal(social.getSnapshot().epoch, 'epoch-b');
  } finally { social.destroy(); }
});
