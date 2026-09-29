import { randomBytes } from 'node:crypto';
import { RULES } from '../../packages/intrilex/rules.js';
import type { GameView } from '../../packages/intrilex/types.js';
import { SOCIAL_LIMITS, type ChatEntry, type ChatErrorCode, type ChatSendMessage, type DisplayChatPart, type RoomNotification } from '../../packages/protocol/index.js';
import type { Participant, Room } from './rooms.js';

const token = () => randomBytes(24).toString('base64url');
export class SocialError extends Error { constructor(public code: ChatErrorCode) { super(code); } }
interface SocialRoom {
  epoch: string; entries: ChatEntry[]; order: number; active: number;
  requests: Map<string, { fingerprint: string; messageId: string; at: number }>;
  attempts: Map<string, { at: number; count: number }>;
  accepted: Map<string, { at: number; count: number }>;
}
/** Process-local, bounded sidecar. No references to authoritative game state are retained. */
export function createSocial(now: () => number) {
  const rooms = new Map<string, SocialRoom>();
  const trimRequests = (s: SocialRoom) => {
    for (const [id, r] of s.requests) if (now() - r.at >= SOCIAL_LIMITS.retryMs) s.requests.delete(id);
    while (s.requests.size > SOCIAL_LIMITS.requests) s.requests.delete(s.requests.keys().next().value!);
  };
  const state = (id: string) => {
    let s = rooms.get(id);
    if (s && now() - s.active >= SOCIAL_LIMITS.idleMs) { rooms.delete(id); s = undefined; }
    if (!s) { s = { epoch: token(), entries: [], order: 0, active: now(), requests: new Map(), attempts: new Map(), accepted: new Map() }; rooms.set(id, s); }
    trimRequests(s); return s;
  };
  const append = (s: SocialRoom, entry: ChatEntry) => { s.entries.push(entry); s.entries = s.entries.slice(-SOCIAL_LIMITS.history); s.active = now(); };
  const tick = (map: SocialRoom['attempts'], id: string, limit: number) => {
    const r = map.get(id);
    if (!r || now() - r.at >= 10_000) { map.set(id, { at: now(), count: 1 }); return true; }
    return ++r.count <= limit;
  };
  return {
    history(roomId: string) { const s = state(roomId); s.active = now(); return { type: 'chat-history' as const, epoch: s.epoch, entries: [...s.entries] }; },
    /** Includes malformed/duplicate submissions. Shared across all tabs of a current member. */
    attempt(roomId: string, participantId: string) { return tick(state(roomId).attempts, participantId, 40); },
    accept(room: Room, p: Participant, input: ChatSendMessage) {
      if (p.readOnly) throw new SocialError('CHAT_READ_ONLY');
      const s = state(room.id);
      const parts: DisplayChatPart[] = input.parts.map(part => {
        switch (part.type) {
          case 'text': return { type: 'text', text: part.text };
          case 'mention': {
            const member = room.participants.find(m => m.id === part.participantId && !m.removed);
            if (!member) throw new SocialError('CHAT_MENTION_INVALID');
            return { type: 'mention', participantId: member.id, nickname: member.nickname };
          }
          case 'rule': {
            if (!Object.hasOwn(RULES, part.ruleId)) throw new SocialError('CHAT_RULE_INVALID');
            return { type: 'rule', ruleId: part.ruleId, title: RULES[part.ruleId]!.title };
          }
        }
      });
      const displayed = parts.map(part => part.type === 'text' ? part.text : part.type === 'mention' ? `@${part.nickname}` : part.title).join('');
      if ([...displayed].length > SOCIAL_LIMITS.codePoints) throw new SocialError('CHAT_INVALID');
      // Normalized input, not historical display names, identifies a retry after rename.
      const key = JSON.stringify([p.id, input.requestId]);
      const fingerprint = JSON.stringify([input.parts, input.replyToId ?? null]);
      const previous = s.requests.get(key);
      if (previous) {
        if (previous.fingerprint !== fingerprint) throw new SocialError('CHAT_REQUEST_REUSED');
        return { epoch: s.epoch, messageId: previous.messageId, duplicate: true as const };
      }
      if (input.replyToId && !s.entries.some(e => e.id === input.replyToId)) throw new SocialError('CHAT_REPLY_UNAVAILABLE');
      if (!tick(s.accepted, p.id, 6)) throw new SocialError('CHAT_RATE_LIMITED');
      const entry: ChatEntry = {
        kind: 'user', id: token(), messageOrder: ++s.order, timestamp: new Date(now()).toISOString(),
        author: { participantId: p.id, nickname: p.nickname, seat: p.seat }, parts,
        ...(input.replyToId ? { replyToId: input.replyToId } : {}),
      };
      append(s, entry); s.requests.set(key, { fingerprint, messageId: entry.id, at: now() }); trimRequests(s);
      return { epoch: s.epoch, messageId: entry.id, duplicate: false as const, entry };
    },
    system(roomId: string, code: 'reset' | 'completed') {
      const s = state(roomId);
      const entry: ChatEntry = { kind: 'system', code, id: token(), messageOrder: ++s.order, timestamp: new Date(now()).toISOString() };
      append(s, entry); return { type: 'chat-message' as const, epoch: s.epoch, entry };
    },
    cleanup(exists: (roomId: string) => boolean) {
      for (const [id, s] of rooms) {
        if (!exists(id) || now() - s.active >= SOCIAL_LIMITS.idleMs) rooms.delete(id);
        else {
          trimRequests(s);
          for (const map of [s.attempts, s.accepted]) for (const [p, r] of map) if (now() - r.at >= 10_000) map.delete(p);
        }
      }
    },
    clear() { rooms.clear(); },
  };
}

/** Eligibility comes only from the recipient projection; precedence choice > response > turn. */
export function decision(view: GameView | undefined): { kind: 'choice' | 'response' | 'turn'; key: string } | null {
  if (!view || view.you === null || view.winner !== null || !view.legalActions.length) return null;
  if (view.choice?.player === view.you) return { kind: 'choice', key: JSON.stringify(['choice', view.turn, view.choice.kind, view.choice.prompt, view.choice.cards.map(c => c.id), view.choice.count]) };
  if (view.pending.length && view.priority === view.you) return { kind: 'response', key: JSON.stringify(['response', view.pending.at(-1)!.id, view.you]) };
  if (!view.pending.length && view.activePlayer === view.you) return { kind: 'turn', key: JSON.stringify(['turn', view.turn, view.you, view.phase]) };
  return null;
}
export function decisionTransition(before: GameView | undefined, after: GameView | undefined): 'choice' | 'response' | 'turn' | null {
  const a = decision(after); return a && a.key !== decision(before)?.key ? a.kind : null;
}
export function notice(now: number, context: { kind: 'turn' | 'response' | 'choice'; revision?: number } | { kind: 'mention'; participantId: string; messageId: string } | { kind: 'system'; code: 'reset' | 'completed'; revision: number } | { kind: 'reconnected' | 'disconnected'; participantId: string; nickname: string }): RoomNotification {
  return { ...context, id: token(), timestamp: new Date(now).toISOString() };
}
