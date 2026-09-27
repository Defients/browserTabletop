import type { TableDefinition } from '../tabletop/types.js';
export type { CardDefinition, DeckDefinition, SetupOperation, TableLabel, SeatPosition } from '../tabletop/types.js';

export type RulesProfile = 'free' | 'intrilex-core' | 'intrilex-first-contact';
export const PROFILES: RulesProfile[] = ['free', 'intrilex-core', 'intrilex-first-contact'];

/**
 * Versioned, declarative, data-only template. Game-specific data lives under `plugins`.
 * Imported templates never carry code, remote URLs, paths, credentials or live match state.
 */
export interface TableTemplate extends TableDefinition {
  schemaVersion: 1; id: string; title: string; description: string; author: string; profile: RulesProfile;
  plugins?: { intrilex?: { rulesVersion: '4.3.1'; lessonIds?: string[] } };
}
