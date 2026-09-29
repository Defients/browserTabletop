import type { GameAction } from './types.js';

/** Executable identity only. Ordered arrays encode composite roles and declaration costs. */
export type GameActionInput = Pick<GameAction, 'type' | 'cardId' | 'targetId' | 'mode' | 'cardIds' | 'targetIds'>;

export function actionKey(a: GameActionInput): string {
  return JSON.stringify([a.type, a.cardId ?? null, a.targetId ?? null, a.mode ?? null, a.cardIds ?? null, a.targetIds ?? null]);
}

/** Submit no client presentation metadata; clone ordered arrays without changing their roles. */
export function actionInput(a: GameAction): GameActionInput {
  return { type: a.type, ...(a.cardId !== undefined ? { cardId: a.cardId } : {}),
    ...(a.targetId !== undefined ? { targetId: a.targetId } : {}), ...(a.mode !== undefined ? { mode: a.mode } : {}),
    ...(a.cardIds !== undefined ? { cardIds: [...a.cardIds] } : {}), ...(a.targetIds !== undefined ? { targetIds: [...a.targetIds] } : {}) };
}
