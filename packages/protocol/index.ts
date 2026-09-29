import type { TableCommand, TableView } from '../tabletop/types.js';
import type { GameView } from '../intrilex/types.js';
import type { RulesProfile } from '../templates/types.js';
import { RULES } from '../intrilex/rules.js';

/** Wire contract shared by apps/server and apps/web. Only projected views ever cross it. */

export const PROTOCOL_VERSION = 2;

export interface ParticipantView { id: string; nickname: string; seat: number | null; connected: boolean; host: boolean; readOnly: boolean }
export interface RoomView {
  id: string; title: string; revision: number; profile: RulesProfile; templateId: string; rulesVersion: string; seats: number;
  table?: TableView; game?: GameView;
  you: { id: string; nickname: string; seat: number | null; host: boolean; readOnly: boolean };
  participants: ParticipantView[]; locked: boolean; history: string[]; savedAt: string; expiresAt: string;
  /** True when the caller may undo the latest accepted command (public, non-random table moves only). */
  canUndo: boolean;
}

export type GameActionInput = { type: string; cardId?: string; targetId?: string; cardIds?: string[]; targetIds?: string[]; mode?: string };
export type RoomCommand =
  | { type: 'table'; action: TableCommand }
  | { type: 'game'; action: GameActionInput }
  | { type: 'seat'; seat: number | null }
  | { type: 'leave' }
  | { type: 'rename'; nickname: string }
  | { type: 'lock'; locked: boolean }
  | { type: 'rotate-invite' }
  | { type: 'remove'; participantId: string }
  | { type: 'transfer'; participantId: string }
  | { type: 'reset'; confirm: true }
  | { type: 'undo' };
export const HOST_COMMANDS = ['lock', 'rotate-invite', 'remove', 'transfer', 'reset'] as const;

export interface CommandRequest { requestId: string; revision: number; command: RoomCommand }
export interface CommandResponse { view?: RoomView; duplicate?: boolean; left?: boolean; rebased?: boolean }
export interface ErrorResponse { error: string; view?: RoomView }
export interface CreateRoomResponse { roomId: string; invite: string; spectatorInvite: string; view: RoomView }
export interface InvitesResponse { invite: string; spectatorInvite: string }

export type Surface = 'table' | 'game';
/** Ephemeral presence. Coordinates are normalised to [0, 1] over the shared surface. Never persisted. */
export type PointerClientMessage = { type: 'presence' | 'ping'; x: number; y: number; surface: Surface };
export type PointerServerMessage = PointerClientMessage & { participantId: string };
export const SOCIAL_LIMITS = { payloadBytes: 16_384, parts: 32, codePoints: 1024, mentions: 8, rules: 4, history: 100, requests: 200, retryMs: 600_000, idleMs: 3_600_000 } as const;
export type ChatPart = { type: 'text'; text: string } | { type: 'mention'; participantId: string } | { type: 'rule'; ruleId: string };
export type DisplayChatPart = { type: 'text'; text: string } | { type: 'mention'; participantId: string; nickname: string } | { type: 'rule'; ruleId: string; title: string };
export interface ChatSendMessage { type: 'chat-send'; requestId: string; parts: ChatPart[]; replyToId?: string }
export type ChatEntry = {
  id: string; messageOrder: number; timestamp: string;
} & ({ kind: 'user'; author: { participantId: string; nickname: string; seat: number | null }; parts: DisplayChatPart[]; replyToId?: string }
  | { kind: 'system'; code: 'reset' | 'completed' });
export const CHAT_ERRORS = ['CHAT_INVALID', 'CHAT_READ_ONLY', 'CHAT_MENTION_INVALID', 'CHAT_RULE_INVALID', 'CHAT_REPLY_UNAVAILABLE', 'CHAT_REQUEST_REUSED', 'CHAT_RATE_LIMITED', 'CHAT_RETRY_EXPIRED'] as const;
export type ChatErrorCode = typeof CHAT_ERRORS[number];
export type RoomNotification = { id: string; timestamp: string; revision?: number } & (
  | { kind: 'turn' | 'response' | 'choice' }
  | { kind: 'reconnected' | 'disconnected'; participantId: string; nickname: string }
  | { kind: 'mention'; messageId: string; participantId: string }
  | { kind: 'system'; code: 'reset' | 'completed' });
export type SocialServerMessage =
  | { type: 'chat-history'; epoch: string; entries: ChatEntry[] }
  | { type: 'chat-message'; epoch: string; entry: ChatEntry }
  | ({ type: 'chat-result'; requestId: string } & ({ ok: true; epoch: string; messageId: string } | { ok: false; code: ChatErrorCode }))
  | { type: 'notification'; notification: RoomNotification };
export type ClientMessage = PointerClientMessage | ChatSendMessage;
export type ServerMessage =
  | { type: 'snapshot'; view: RoomView }
  | PointerServerMessage | SocialServerMessage;

const unit = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
const isSurface = (v: unknown): v is Surface => v === 'table' || v === 'game';
export const validRequestId = (v: unknown): v is string => typeof v === 'string' && /^[\w-]{8,100}$/.test(v);
const identifier = (v: unknown): v is string => typeof v === 'string' && /^[\w-]{1,100}$/.test(v);
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const fields = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).every(k => keys.includes(k));
const integer = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const timestamp = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
const controls = (text: string, multiline = false) => [...text].some(ch => {
  const code = ch.codePointAt(0)!;
  return (code < 32 || code >= 127 && code <= 159) && !(multiline && (code === 9 || code === 10));
});
const displayName = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 100 && !controls(v);
export function normalizeChatText(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const text = v.replace(/\r\n?/g, '\n').normalize('NFC');
  return controls(text, true) || [...text].length > SOCIAL_LIMITS.codePoints ? null : text;
}
/** Strict input boundary: chips contain identifiers, never client-owned display text. */
export function parseChatParts(v: unknown): ChatPart[] | null {
  if (!Array.isArray(v) || !v.length || v.length > SOCIAL_LIMITS.parts) return null;
  const out: ChatPart[] = []; const mentions = new Set<string>(); let rules = 0, length = 0;
  for (const part of v) {
    if (!record(part)) return null;
    if (part.type === 'text' && fields(part, ['type', 'text'])) {
      const text = normalizeChatText(part.text); if (text === null) return null;
      length += [...text].length; out.push({ type: 'text', text });
    } else if (part.type === 'mention' && fields(part, ['type', 'participantId']) && identifier(part.participantId)) {
      mentions.add(part.participantId); out.push({ type: 'mention', participantId: part.participantId });
    } else if (part.type === 'rule' && fields(part, ['type', 'ruleId']) && typeof part.ruleId === 'string' && part.ruleId.length <= 64) {
      rules++; out.push({ type: 'rule', ruleId: part.ruleId });
    } else return null;
  }
  return length <= SOCIAL_LIMITS.codePoints && mentions.size <= SOCIAL_LIMITS.mentions && rules <= SOCIAL_LIMITS.rules && out.some(p => p.type !== 'text' || p.text.trim()) ? out : null;
}
function parseDisplayParts(v: unknown): DisplayChatPart[] | null {
  if (!Array.isArray(v) || !v.length || v.length > SOCIAL_LIMITS.parts) return null;
  const out: DisplayChatPart[] = []; const mentions = new Set<string>(); let rules = 0, length = 0;
  for (const p of v) {
    if (!record(p)) return null;
    if (p.type === 'text' && fields(p, ['type', 'text'])) {
      const text = normalizeChatText(p.text); if (text === null || text !== p.text) return null;
      length += [...text].length; out.push({ type: 'text', text });
    } else if (p.type === 'mention' && fields(p, ['type', 'participantId', 'nickname']) && identifier(p.participantId) && displayName(p.nickname)) {
      mentions.add(p.participantId); length += [...`@${p.nickname}`].length; out.push({ type: 'mention', participantId: p.participantId, nickname: p.nickname });
    } else if (p.type === 'rule' && fields(p, ['type', 'ruleId', 'title']) && typeof p.ruleId === 'string' && Object.hasOwn(RULES, p.ruleId) && p.title === RULES[p.ruleId]!.title) {
      rules++; length += [...p.title].length; out.push({ type: 'rule', ruleId: p.ruleId, title: p.title });
    } else return null;
  }
  return length <= SOCIAL_LIMITS.codePoints && mentions.size <= SOCIAL_LIMITS.mentions && rules <= SOCIAL_LIMITS.rules && out.some(p => p.type !== 'text' || p.text.trim()) ? out : null;
}
function parseEntry(v: unknown): ChatEntry | null {
  if (!record(v) || !identifier(v.id) || !integer(v.messageOrder) || v.messageOrder < 1 || !timestamp(v.timestamp)) return null;
  const base = { id: v.id, messageOrder: v.messageOrder, timestamp: v.timestamp };
  if (v.kind === 'system' && fields(v, ['id', 'messageOrder', 'timestamp', 'kind', 'code']) && (v.code === 'reset' || v.code === 'completed')) return { ...base, kind: 'system', code: v.code };
  if (v.kind !== 'user' || !fields(v, ['id', 'messageOrder', 'timestamp', 'kind', 'author', 'parts', 'replyToId']) || !record(v.author)) return null;
  const a = v.author, parts = parseDisplayParts(v.parts);
  if (!fields(a, ['participantId', 'nickname', 'seat']) || !identifier(a.participantId) || !displayName(a.nickname) || !(a.seat === null || integer(a.seat) && a.seat < 8) || !parts || v.replyToId !== undefined && !identifier(v.replyToId)) return null;
  return { ...base, kind: 'user', author: { participantId: a.participantId, nickname: a.nickname, seat: a.seat }, parts, ...(typeof v.replyToId === 'string' ? { replyToId: v.replyToId } : {}) };
}
function parseNotification(v: unknown): RoomNotification | null {
  if (!record(v) || !identifier(v.id) || !timestamp(v.timestamp) || v.revision !== undefined && !integer(v.revision)) return null;
  const base = { id: v.id, timestamp: v.timestamp, ...(integer(v.revision) ? { revision: v.revision } : {}) };
  if (['turn', 'response', 'choice'].includes(String(v.kind)) && fields(v, ['id', 'timestamp', 'revision', 'kind'])) {
    if (v.kind === 'turn' || v.kind === 'response' || v.kind === 'choice') return { ...base, kind: v.kind };
  }
  if ((v.kind === 'reconnected' || v.kind === 'disconnected') && fields(v, ['id', 'timestamp', 'revision', 'kind', 'participantId', 'nickname']) && identifier(v.participantId) && displayName(v.nickname)) return { ...base, kind: v.kind, participantId: v.participantId, nickname: v.nickname };
  if (v.kind === 'mention' && fields(v, ['id', 'timestamp', 'revision', 'kind', 'messageId', 'participantId']) && identifier(v.messageId) && identifier(v.participantId)) return { ...base, kind: 'mention', messageId: v.messageId, participantId: v.participantId };
  if (v.kind === 'system' && fields(v, ['id', 'timestamp', 'revision', 'kind', 'code']) && (v.code === 'reset' || v.code === 'completed')) return { ...base, kind: 'system', code: v.code };
  return null;
}

export function parseClientMessage(raw: string): ClientMessage | null {
  try {
    if (new TextEncoder().encode(raw).length > SOCIAL_LIMITS.payloadBytes) return null;
    const m: unknown = JSON.parse(raw);
    if (!record(m)) return null;
    if (m.type === 'chat-send' && fields(m, ['type', 'requestId', 'parts', 'replyToId']) && validRequestId(m.requestId) && (m.replyToId === undefined || identifier(m.replyToId))) {
      const parts = parseChatParts(m.parts);
      if (parts) return { type: 'chat-send', requestId: m.requestId, parts, ...(typeof m.replyToId === 'string' ? { replyToId: m.replyToId } : {}) };
    }
    if ((m.type === 'presence' || m.type === 'ping') && fields(m, ['type', 'x', 'y', 'surface']) && unit(m.x) && unit(m.y) && isSurface(m.surface)) return { type: m.type, x: m.x as number, y: m.y as number, surface: m.surface };
  } catch { /* malformed input is ignored */ }
  return null;
}

export function parseServerMessage(raw: string): ServerMessage | null {
  try {
    const m: unknown = JSON.parse(raw);
    if (!record(m)) return null;
    if (m.type === 'chat-history' && fields(m, ['type', 'epoch', 'entries']) && identifier(m.epoch) && Array.isArray(m.entries) && m.entries.length <= SOCIAL_LIMITS.history) {
      const entries = m.entries.map(parseEntry);
      if (entries.every((e): e is ChatEntry => e !== null) && new Set(entries.map(e => e.id)).size === entries.length && entries.every((e, i) => !i || e.messageOrder > entries[i - 1]!.messageOrder)) return { type: 'chat-history', epoch: m.epoch, entries };
    }
    if (m.type === 'chat-message' && fields(m, ['type', 'epoch', 'entry']) && identifier(m.epoch)) {
      const entry = parseEntry(m.entry); if (entry) return { type: 'chat-message', epoch: m.epoch, entry };
    }
    if (m.type === 'chat-result' && validRequestId(m.requestId)) {
      if (m.ok === true && fields(m, ['type', 'requestId', 'ok', 'epoch', 'messageId']) && identifier(m.epoch) && identifier(m.messageId)) return { type: 'chat-result', requestId: m.requestId, ok: true, epoch: m.epoch, messageId: m.messageId };
      if (m.ok === false && fields(m, ['type', 'requestId', 'ok', 'code']) && CHAT_ERRORS.some(c => c === m.code)) {
        const code = CHAT_ERRORS.find(c => c === m.code)!; return { type: 'chat-result', requestId: m.requestId, ok: false, code };
      }
    }
    if (m.type === 'notification' && fields(m, ['type', 'notification'])) { const notification = parseNotification(m.notification); if (notification) return { type: 'notification', notification }; }
    if (m.type === 'snapshot' && m.view && typeof m.view === 'object') return m as unknown as ServerMessage;
    if ((m.type === 'presence' || m.type === 'ping') && fields(m, ['type', 'participantId', 'x', 'y', 'surface']) && identifier(m.participantId) && unit(m.x) && unit(m.y) && isSurface(m.surface)) return { type: m.type, participantId: m.participantId, x: m.x as number, y: m.y as number, surface: m.surface };
  } catch { /* malformed input is ignored */ }
  return null;
}

export const ERROR_TEXT: Record<string, string> = {
  CHAT_INVALID: 'Use up to 1,024 characters, eight mentions and four rule references.',
  CHAT_READ_ONLY: 'Read-only spectators can read chat but cannot send.',
  CHAT_MENTION_INVALID: 'That mention is no longer a member of this table.',
  CHAT_RULE_INVALID: 'Choose a rule from the rules reference list.',
  CHAT_REPLY_UNAVAILABLE: 'That reply is outside the retained room history.',
  CHAT_REQUEST_REUSED: 'This request ID was already used for different chat content.',
  CHAT_RATE_LIMITED: 'Chat is moving too quickly. Wait a few seconds, then retry.',
  CHAT_RETRY_EXPIRED: 'The retry window ended. Send a new message explicitly.',
  SESSION_REQUIRED: 'Your browser session expired. Reload to continue.',
  ORIGIN_REJECTED: 'This request came from an unexpected origin.',
  CSRF_REJECTED: 'Security check failed. Reload the page and try again.',
  ROOM_NOT_FOUND: 'That table does not exist or has expired.',
  ROOM_EXPIRED: 'That table has expired.',
  ROOM_ACCESS_DENIED: 'You no longer have access to this table.',
  INVITE_INVALID: 'That invitation is not valid. Ask the host for a fresh link.',
  ROOM_LOCKED: 'The host has locked this table to new guests.',
  SEATS_FULL: 'Every seat is taken. You can join as a spectator.',
  SPECTATORS_FULL: 'The spectator gallery is full.',
  SEAT_OCCUPIED: 'That seat is occupied.',
  GUIDED_SEAT_FIXED: 'In a guided game you cannot switch to a seat whose hand you have not held.',
  STALE_REVISION: 'The table changed before your action arrived. It has been refreshed — try again.',
  REQUEST_ID_REUSED: 'This request was already used for a different action.',
  SAVE_FAILED: 'The table could not be saved. Your action was not applied.',
  HOST_REQUIRED: 'Only the host can do that.',
  ACTION_NOT_ALLOWED: 'That action is not allowed right now.',
  RATE_LIMITED: 'Too many requests. Wait a moment and try again.',
  INVALID_TEMPLATE: 'The template is invalid.',
  UNDO_UNAVAILABLE: 'There is nothing you can undo right now.',
  RECOVERY_INVALID: 'That recovery code is not valid.',
  SPECTATOR_INVITATION_READ_ONLY: 'You joined with a spectator invitation, which is read-only.',
  TRANSFER_HOST_FIRST: 'Transfer host to another participant before leaving.',
  INVALID_ACTION: 'That action was not understood. Reload the page and try again.',
  ACTION_UNAVAILABLE: 'That action is not legal right now. Check whose decision it is.',
  NOT_IN_HAND: 'That card is not in your hand.',
};
export const errorText = (code: string) => ERROR_TEXT[code] ?? 'This request could not be completed.';
