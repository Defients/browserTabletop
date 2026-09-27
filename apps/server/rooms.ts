import { applyTable, createTable, parseTableCommand, projectTable, rebaseSafe, undoable, TableError, type TableState } from '../../packages/tabletop/index.js';
import { applyGame, createGame, projectGame, GameError, type GameState } from '../../packages/intrilex/index.js';
import type { TableTemplate } from '../../packages/templates/index.js';
import type { RoomCommand, RoomView } from '../../packages/protocol/index.js';

export const DAY = 86_400_000;
export const ROOM_TTL = 30 * DAY;
export const SPECTATOR_LIMIT = 16;
export const MEMBERSHIP_LIMIT = 128;

export class ApiError extends Error { constructor(public status: number, public code: string) { super(code); } }
export function requireThat(condition: unknown, status: number, code: string): asserts condition { if (!condition) throw new ApiError(status, code); }

export interface Session { id: string; csrf: string; expires: number }
export interface Participant {
  id: string; session: string; nickname: string; seat: number | null;
  removed?: boolean; banned?: boolean; readOnly?: boolean;
  /** Seats whose private hand this participant has held in the current guided game. */
  heldSeats: number[]; recoveryHash?: string;
}
export interface Room {
  id: string; title: string; revision: number; schemaVersion: 2; rulesVersion: '4.3.1'; engineVersion: 2;
  template: TableTemplate; table?: TableState; game?: GameState;
  participants: Participant[]; host: string; invite: string; spectatorInvite: string; locked: boolean;
  history: string[]; savedAt: string; created: number; expires: number;
  undo?: { actor: string; revision: number; table: TableState };
}

/** Trusted rules adapters are built-in code. A template's profile only selects one; templates never carry logic. */
const guided = { 'intrilex-first-contact': { seats: 2 } } as const;
export const isGuided = (t: TableTemplate) => t.profile in guided;
export const seatCount = (room: Room) => (room.game ? 2 : room.template.seats);

export function freshState(template: TableTemplate, random: () => number): Pick<Room, 'table' | 'game'> {
  return isGuided(template) ? { game: createGame({ random }) } : { table: createTable(template, random) };
}

export function roomView(room: Room, p: Participant, connected: Set<string>): RoomView {
  return {
    id: room.id, title: room.title, revision: room.revision, profile: room.template.profile, templateId: room.template.id, rulesVersion: room.rulesVersion, seats: seatCount(room),
    ...(room.table ? { table: projectTable(room.table, p.seat) } : {}),
    ...(room.game ? { game: projectGame(room.game, p.seat) } : {}),
    you: { id: p.id, nickname: p.nickname, seat: p.seat, host: room.host === p.id, readOnly: !!p.readOnly },
    participants: room.participants.filter(x => !x.removed).map(x => ({ id: x.id, nickname: x.nickname, seat: x.seat, connected: connected.has(x.id), host: room.host === x.id, readOnly: !!x.readOnly })),
    locked: room.locked, history: room.history.slice(-60), savedAt: room.savedAt, expiresAt: new Date(room.expires).toISOString(),
    canUndo: !!room.undo && room.undo.actor === p.id && room.undo.revision === room.revision,
  };
}

// ---------------------------------------------------------------- input validation

export function nickname(v: unknown): string {
  requireThat(typeof v === 'string', 400, 'INVALID_NICKNAME');
  const s = (v as string).trim();
  // Nicknames are rendered as text, but angle brackets and control characters are refused outright.
  requireThat(s.length >= 1 && s.length <= 32 && !/[<>]/.test(s) && ![...s].some(ch => ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127), 400, 'INVALID_NICKNAME');
  return s;
}

export function parseRoomCommand(input: unknown): RoomCommand {
  requireThat(input && typeof input === 'object' && !Array.isArray(input), 400, 'INVALID_COMMAND');
  const c = input as Record<string, unknown>;
  const pid = () => { requireThat(typeof c.participantId === 'string' && c.participantId.length <= 64, 400, 'INVALID_COMMAND'); return c.participantId as string; };
  switch (c.type) {
    case 'table': try { return { type: 'table', action: parseTableCommand(c.action) }; } catch { throw new ApiError(400, 'INVALID_COMMAND'); }
    case 'game': {
      const a = c.action as Record<string, unknown> | undefined;
      requireThat(a && typeof a === 'object' && typeof a.type === 'string' && a.type.length <= 32, 400, 'INVALID_COMMAND');
      const opt = (v: unknown) => { requireThat(v === undefined || (typeof v === 'string' && v.length <= 64), 400, 'INVALID_COMMAND'); return v as string | undefined; };
      return { type: 'game', action: { type: a!.type as string, cardId: opt(a!.cardId), targetId: opt(a!.targetId), mode: opt(a!.mode) } };
    }
    case 'seat': requireThat(c.seat === null || (typeof c.seat === 'number' && Number.isInteger(c.seat) && c.seat >= 0 && c.seat < 8), 400, 'INVALID_SEAT'); return { type: 'seat', seat: c.seat as number | null };
    case 'leave': case 'rotate-invite': case 'undo': return { type: c.type };
    case 'rename': return { type: 'rename', nickname: nickname(c.nickname) };
    case 'lock': requireThat(typeof c.locked === 'boolean', 400, 'INVALID_COMMAND'); return { type: 'lock', locked: c.locked as boolean };
    case 'remove': case 'transfer': return { type: c.type, participantId: pid() };
    case 'reset': requireThat(c.confirm === true, 400, 'CONFIRM_RESET'); return { type: 'reset', confirm: true };
    default: throw new ApiError(400, 'UNKNOWN_COMMAND');
  }
}

/** Commands that may be applied after other accepted commands without the client seeing them first. */
export function staleTolerant(command: RoomCommand): boolean {
  if (command.type === 'table') return rebaseSafe(command.action);
  return ['seat', 'leave', 'rename', 'lock', 'rotate-invite', 'remove', 'transfer'].includes(command.type);
}

// ---------------------------------------------------------------- application

export interface ApplyContext { random: () => number; token: () => string }
/** Mutates `room` (already a private copy) and returns a public history line. Throws ApiError on refusal. */
export function applyCommand(room: Room, p: Participant, command: RoomCommand, ctx: ApplyContext): string {
  const host = room.host === p.id;
  const name = p.nickname;
  const before = room.revision;
  if (command.type !== 'undo') delete room.undo;
  switch (command.type) {
    case 'table': {
      requireThat(room.table, 409, 'TABLE_ACTION_UNAVAILABLE');
      requireThat(p.seat !== null, 403, 'SEAT_REQUIRED');
      const previous = room.table;
      const canUndo = undoable(previous, command.action);
      try { room.table = applyTable(previous, { seat: p.seat, host }, command.action, ctx.random); }
      catch (e) { throw new ApiError(422, e instanceof TableError ? e.code : 'ACTION_NOT_ALLOWED'); }
      if (canUndo) room.undo = { actor: p.id, revision: before + 1, table: previous };
      return '';
    }
    case 'game': {
      requireThat(room.game, 409, 'GAME_ACTION_UNAVAILABLE');
      requireThat(p.seat !== null, 403, 'SEAT_REQUIRED');
      try { room.game = applyGame(room.game, p.seat, command.action, ctx.random); }
      catch (e) { throw new ApiError(422, e instanceof GameError ? e.code : 'ACTION_NOT_ALLOWED'); }
      return '';
    }
    case 'undo': {
      requireThat(room.undo && room.undo.actor === p.id && room.undo.revision === room.revision && room.table, 409, 'UNDO_UNAVAILABLE');
      room.table = room.undo.table;
      delete room.undo;
      return `${name} undid their last arrangement.`;
    }
    case 'seat': {
      requireThat(!p.readOnly, 403, 'SPECTATOR_INVITATION_READ_ONLY');
      const seat = command.seat;
      requireThat(seat === null || seat < seatCount(room), 400, 'INVALID_SEAT');
      requireThat(seat === null || !room.participants.some(o => !o.removed && o.id !== p.id && o.seat === seat), 409, 'SEAT_OCCUPIED');
      requireThat(seat !== null || p.seat === null || room.participants.filter(o => !o.removed && o.seat === null).length < SPECTATOR_LIMIT, 409, 'SPECTATORS_FULL');
      // A guided seat owns hidden information: never let one participant hold both hands of a game.
      if (room.game && seat !== null) requireThat(p.heldSeats.every(s => s === seat), 409, 'GUIDED_SEAT_FIXED');
      p.seat = seat;
      if (seat !== null && !p.heldSeats.includes(seat)) p.heldSeats.push(seat);
      return seat === null ? `${name} is now spectating.` : `${name} took seat ${seat + 1}.`;
    }
    case 'leave':
      requireThat(!host, 409, 'TRANSFER_HOST_FIRST');
      p.removed = true; p.seat = null; delete p.recoveryHash;
      return `${name} left the table.`;
    case 'rename': {
      const old = p.nickname; p.nickname = command.nickname;
      return `${old} is now called ${p.nickname}.`;
    }
    case 'lock':
      room.locked = command.locked;
      return room.locked ? 'The host locked the table to new guests.' : 'The host reopened the table to new guests.';
    case 'rotate-invite':
      room.invite = ctx.token(); room.spectatorInvite = ctx.token();
      return 'The host replaced the invitations. Old links no longer work.';
    case 'remove': {
      const target = room.participants.find(x => x.id === command.participantId && !x.removed);
      requireThat(target && target.id !== room.host, 400, 'INVALID_PARTICIPANT');
      target!.removed = true; target!.banned = true; target!.seat = null; delete target!.recoveryHash;
      return `The host removed ${target!.nickname}.`;
    }
    case 'transfer': {
      const target = room.participants.find(x => x.id === command.participantId && !x.removed);
      requireThat(target && target.id !== p.id && !target.readOnly, 400, 'INVALID_PARTICIPANT');
      room.host = target!.id;
      return `${name} made ${target!.nickname} the host.`;
    }
    case 'reset': {
      Object.assign(room, { table: undefined, game: undefined }, freshState(room.template, ctx.random));
      if (!room.table) delete room.table;
      if (!room.game) delete room.game;
      for (const x of room.participants) x.heldSeats = x.seat === null ? [] : [x.seat];
      return 'The host reset the table to its template (new shuffle).';
    }
  }
}
