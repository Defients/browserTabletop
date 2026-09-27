import type { TableCommand, TableView } from '../tabletop/types.js';
import type { GameView } from '../intrilex/types.js';
import type { RulesProfile } from '../templates/types.js';

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

export type GameActionInput = { type: string; cardId?: string; targetId?: string; mode?: string };
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
export type ClientMessage = { type: 'presence' | 'ping'; x: number; y: number; surface: Surface };
export type ServerMessage =
  | { type: 'snapshot'; view: RoomView }
  | { type: 'presence' | 'ping'; participantId: string; x: number; y: number; surface: Surface };

const unit = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
const isSurface = (v: unknown): v is Surface => v === 'table' || v === 'game';

export function parseClientMessage(raw: string): ClientMessage | null {
  try {
    const m = JSON.parse(raw) as Record<string, unknown>;
    if ((m.type === 'presence' || m.type === 'ping') && unit(m.x) && unit(m.y) && isSurface(m.surface)) return { type: m.type, x: m.x as number, y: m.y as number, surface: m.surface };
  } catch { /* malformed input is ignored */ }
  return null;
}

export function parseServerMessage(raw: string): ServerMessage | null {
  try {
    const m = JSON.parse(raw) as Record<string, unknown>;
    if (m.type === 'snapshot' && m.view && typeof m.view === 'object') return m as unknown as ServerMessage;
    if ((m.type === 'presence' || m.type === 'ping') && typeof m.participantId === 'string' && unit(m.x) && unit(m.y) && isSurface(m.surface)) return m as unknown as ServerMessage;
  } catch { /* malformed input is ignored */ }
  return null;
}

export const ERROR_TEXT: Record<string, string> = {
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
};
export const errorText = (code: string) => ERROR_TEXT[code] ?? 'This request could not be completed.';
