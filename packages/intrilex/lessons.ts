import type { GameAction, GameEvent, GameState } from './types.js';
import { applyGame, assertGameIntegrity, availableActions, normalizeGameState, score } from './engine.js';
import { fixture, seeded } from './fixtures.js';

/**
 * State-driven First Contact lessons. Every lesson starts from a fixed, source-checked position, runs on the
 * real rules engine, and completes only when its predicate observes the intended transitions in game events.
 * The learner is always Player 1 (index 0). Opponent moves are scripted (not the solo bot) and are always
 * chosen from the engine's legal actions.
 */

export interface LessonTask { id: string; prompt: string }
export interface LessonDefinition {
  id: string; title: string; objective: string; explanation: string; hint: string; success: string;
  refs: string[];
  /** Explicit teaching constraint: open-hand lessons announce that the opponent's cards are shown. */
  openHand: boolean;
  start: () => GameState;
  tasks?: LessonTask[];
  allowed?: (a: GameAction) => boolean;
  rejectMessage?: string;
  complete: (s: LessonState) => boolean;
  script?: (s: GameState) => GameAction | null;
}
export interface LessonState { version: 1; id: string; game: GameState; observed: string[]; completed: boolean; feedback: string; moves: number }

const events = (s: LessonState) => s.game.events;
const has = (s: LessonState, pred: (e: GameEvent) => boolean) => events(s).some(pred);
const indexOf = (s: LessonState, pred: (e: GameEvent) => boolean) => events(s).findIndex(pred);

/** Default script: never counter, always decline, answer choices with the first legal option, draw then end. */
function passiveScript(s: GameState): GameAction | null {
  const acts = availableActions(s, 1);
  return acts.find(a => a.type === 'decline') ?? acts.find(a => a.type === 'choose') ?? acts.find(a => a.type === 'draw') ?? acts.find(a => a.type === 'end') ?? acts[0] ?? null;
}

const NO_RESPONSE_HAND = ['6♣', '10♣', '4♥', '5♥', '2♠', 'Q♣'];

export const lessons: LessonDefinition[] = [
  {
    id: 'orientation', title: '1 · Find your way around the table',
    objective: 'Point to each area when asked, then inspect one of your cards.',
    explanation: 'Your hand is private. The Draw Pile (DP) is face-down and shared. Your Point Row (PR) holds cards that score; your Enduring Row (ER) holds Anchors such as a Queen. The Graveyard (GY) is public and ordered, newest on top.',
    hint: 'Follow the highlighted prompt and select the matching area on the board.',
    success: 'You can now read the board: hand, DP, PR, ER and GY.',
    refs: ['§3 The Table', '§27 15.4'], openHand: false,
    start: () => fixture({ seed: 11, hands: [['7♥', '3♣', 'Q♦', '9♠', 'A♥'], ['2♣', '4♦', '6♠', '8♣', '10♥', 'J♦']], pr: [['5♦'], ['8♠']], er: [['K♣'], ['Q♥']], graveyard: ['2♦', '6♦'] }),
    tasks: [
      { id: 'zone:hand', prompt: 'Select your hand (private cards only you can see).' },
      { id: 'zone:dp', prompt: 'Select the Draw Pile (DP).' },
      { id: 'zone:pr', prompt: 'Select your Point Row (PR).' },
      { id: 'zone:er', prompt: 'Select your Enduring Row (ER).' },
      { id: 'zone:gy', prompt: 'Select the Graveyard (GY).' },
      { id: 'inspect', prompt: 'Inspect any card in your hand to read it up close.' },
    ],
    allowed: () => false, rejectMessage: 'This lesson is about reading the board — no Actions yet.',
    complete: s => s.observed.length === 6,
  },
  {
    id: 'draw-action', title: '2 · One Action, then end your turn',
    objective: 'Spend your single First Contact Action on Draw, then end your turn.',
    explanation: 'In First Contact you get exactly one Mini-Turn Action each Full Turn: Draw, Play for Points, Play for Effect, or Scuttle. After it, only free Quick plays or ending the turn remain.',
    hint: 'Choose “Draw 1”. When the draw resolves, choose “End turn”.',
    success: 'Your Action was spent on Draw, and ending the turn passed play to your opponent.',
    refs: ['§27 15.3', '§27 15.6', '§4.3 (1)'], openHand: false,
    start: () => fixture({ seed: 22, hands: [['4♣', '10♦', '6♥'], NO_RESPONSE_HAND], pr: [['3♦'], ['7♠']] }),
    allowed: a => a.type === 'draw' || a.type === 'end', rejectMessage: 'For this lesson, spend your Action on Draw.',
    complete: s => { const d = indexOf(s, e => e.t === 'resolve' && e.p === 0 && e.mode === 'draw'); return d >= 0 && events(s).slice(d).some(e => e.t === 'end-turn' && e.p === 0); },
  },
  {
    id: 'score-victory', title: '3 · Score, then win at End Phase',
    objective: 'Play for Points to reach your Goal of 15, then end your turn to claim the win.',
    explanation: 'Victory is checked only at the end of your own completed Full Turn. Reaching 15 mid-turn is not a win yet — your turn must reach End Phase with Secured PR Points at least your Goal.',
    hint: 'You have 13 secured. Score the Queen (2 Points), notice you have not won yet, then end your turn.',
    success: 'You won in End Phase — exactly when the rulebook checks victory.',
    refs: ['§1', '§4.5', '§8'], openHand: false,
    start: () => fixture({ seed: 33, hands: [['Q♣', '3♦', '10♠'], ['4♥', '6♣', '7♦', '10♣', '5♥', '2♠']], pr: [['K♠', '5♣'], ['6♦']] }),
    allowed: a => a.type === 'score' || a.type === 'end', rejectMessage: 'Use Play for Points in this lesson.',
    complete: s => { const sc = indexOf(s, e => e.t === 'score' && e.p === 0); return sc >= 0 && events(s).slice(sc).some(e => e.t === 'win' && e.p === 0 && e.reason === 'goal'); },
  },
  {
    id: 'generic-effect', title: '4 · Use an effect on a legal target',
    objective: 'Play your Jack for effect and attach it to the only legal enemy Point card.',
    explanation: 'Jack Attachment takes control of a Vulnerable enemy PR card and adds +1. An untapped 4 in PR cannot be targeted by Effects, and an untapped Ace cannot be Jacked — so only the 9 is a legal target.',
    hint: 'Choose the Jack action that targets 9♣.',
    success: 'You now control the 9♣, worth 10 to you while your Jack stays attached.',
    refs: ['§26 ⦗J⦘ Jack PR', '§26 ⦗4⦘ PR Immunity', '§26 ⦗A⦘ PR Immunity', '§17'], openHand: false,
    start: () => fixture({ seed: 44, hands: [['J♠', '6♦', '10♥'], NO_RESPONSE_HAND], pr: [['3♥'], ['4♦', 'A♥', '9♣']] }),
    allowed: a => a.type === 'effect' && a.mode === 'attach', rejectMessage: 'This lesson practises the Jack Attachment effect.',
    complete: s => has(s, e => e.t === 'attach' && e.p === 0 && e.host === '9') && s.game.players[0]!.pr.some(c => c.rank === '9' && c.suit === '♣'),
  },
  {
    id: 'guard-scuttle', title: '5 · Guard, Scuttle and ties',
    objective: 'Your opponent has Guard. Scuttle their 7♥ with the card that wins the tie.',
    explanation: 'Guard (an untapped Queen in ER) stops enemy single-target Effects, so your 3 cannot bounce their PR cards — but Guard never stops Scuttle, which is an Action. Scuttle needs a higher rank, or the same rank with a higher suit (♣ < ♦ < ♥ < ♠). 7♦ loses the tie to 7♥; 7♠ wins it. 5s are Scuttle-immune in PR.',
    hint: 'Only one Scuttle is legal. Use “Why can’t I?” on 7♦ to see the tie rule.',
    success: 'Your 7♠ beat the 7♥ on suit, straight through Guard.',
    refs: ['§13 Guard', '§19 Scuttle', '§16.4'], openHand: false,
    start: () => fixture({ seed: 55, hands: [['7♠', '7♦', '3♣', '2♥'], NO_RESPONSE_HAND], pr: [['6♠'], ['7♥', '5♠', '10♦']], er: [[], ['Q♥']] }),
    allowed: a => a.type === 'scuttle', rejectMessage: 'Try a Scuttle for this lesson.',
    complete: s => has(s, e => e.t === 'scuttle' && e.p === 0 && e.success && e.source === '7' && e.target === '7'),
  },
  {
    id: 'response-counter', title: '6 · Respond, counter, resolve last-in first-out',
    objective: 'Scuttle the 7♣. When your opponent counters with an 8, counter that 8 with your Ace. Then end your turn.',
    explanation: 'Scuttle uses the stack. An 8 can counter a Scuttle; an Ace can counter a counter. The newest item resolves first: your Ace cancels their 8, then your Scuttle resolves.',
    hint: 'Scuttle 7♣ with 9♦. When the 8♥ counter appears, choose the A♣ counter targeting it. Finally, end your turn.',
    success: 'Last in, first out: Ace beat Eight, then your Scuttle destroyed the 7♣.',
    refs: ['§6 Stack', '§7 Counters', '§26 ⦗8⦘ Scuttle Counter', '§26 ⦗A⦘ Base Counter'], openHand: true,
    start: () => fixture({ seed: 66, hands: [['9♦', 'A♣', '4♣'], ['8♥', '6♣', '10♣', '4♥', '5♥', '2♠']], pr: [['3♠'], ['7♣']] }),
    allowed: a => ['scuttle', 'counter', 'decline', 'end'].includes(a.type), rejectMessage: 'Follow the Scuttle-and-counter sequence for this lesson.',
    script: s => { const acts = availableActions(s, 1); return acts.find(a => a.type === 'counter' && s.stack.find(i => i.id === a.targetId)?.cls === 'scuttle') ?? passiveScript(s); },
    complete: s => {
      const c = indexOf(s, e => e.t === 'countered' && e.by === 0 && e.mode === 'counter');
      const sc = indexOf(s, e => e.t === 'scuttle' && e.p === 0 && e.success);
      return c >= 0 && sc > c && events(s).slice(sc).some(e => e.t === 'end-turn' && e.p === 0);
    },
  },
  {
    id: 'board-lock', title: '7 · Board Lock and what still works',
    objective: 'Activate Board Lock with your Black Joker, then still Play for Points and end your turn.',
    explanation: 'Board Lock is a Quick play costing no Action. While it lasts, nobody may declare non-counter Effects or Scuttle — but Draw, scoring and counters still work. It lasts through this turn and the next two completed Full Turns.',
    hint: 'Choose Board Lock first (it is free), then score the 6♠, then end your turn.',
    success: 'Board Lock resolved without spending your Action, and you still scored.',
    refs: ['§26 ⦗BJ⦘ Board Lock', '§26 BOARD LOCK STATE', '§26 BOARD LOCK DURATION'], openHand: false,
    start: () => fixture({ seed: 77, hands: [['BJ', '6♠'], ['3♦', '9♥', '10♣', '4♥', '5♥', '2♠']], pr: [['4♠'], ['8♦']] }),
    allowed: a => (a.type === 'effect' && a.mode === 'board-lock') || a.type === 'score' || a.type === 'end', rejectMessage: 'Use Board Lock, score, and end your turn in this lesson.',
    complete: s => { const b = indexOf(s, e => e.t === 'board-lock' && e.p === 0); return b >= 0 && events(s).slice(b).some(e => e.t === 'score' && e.p === 0) && events(s).slice(b).some(e => e.t === 'end-turn' && e.p === 0); },
  },
];

const byId = (id: string) => lessons.find(l => l.id === id) ?? (() => { throw new Error(`Unknown lesson ${id}`); })();

export function createLesson(id: string): LessonState {
  const def = byId(id);
  return { version: 1, id, game: def.start(), observed: [], completed: false, feedback: def.objective, moves: 0 };
}

export function lessonComplete(s: LessonState): boolean { return byId(s.id).complete(s); }

export function lessonHint(s: LessonState): string {
  const def = byId(s.id);
  if (def.tasks) return def.tasks[s.observed.length]?.prompt ?? def.hint;
  if (s.game.winner !== null && !s.completed) return 'This attempt ended without meeting the objective. Reset the lesson to try again.';
  return def.hint;
}

/** Records a UI observation (e.g. selecting a zone). Only the next expected task counts. */
export function lessonObserve(s: LessonState, observation: string): LessonState {
  const def = byId(s.id);
  const next = def.tasks?.[s.observed.length];
  if (!next || s.completed) return s;
  if (observation !== next.id) return { ...s, feedback: `Not quite — ${next.prompt}` };
  const out: LessonState = { ...s, observed: [...s.observed, observation] };
  out.completed = def.complete(out);
  out.feedback = out.completed ? def.success : def.tasks![out.observed.length]!.prompt;
  return out;
}

/** Applies the learner's action through the real engine, then plays scripted opponent decisions. */
export function lessonAct(s: LessonState, action: GameAction, random = seeded(9001 + s.moves)): LessonState {
  const def = byId(s.id);
  if (s.completed) return { ...s, feedback: 'Lesson complete. Reset to practise it again.' };
  // Declining a response is never harmful and never spends an Action, so it is always permitted.
  if (def.allowed && action.type !== 'decline' && !def.allowed(action)) return { ...s, feedback: def.rejectMessage ?? 'That is legal, but not part of this lesson.' };
  let game = applyGame(s.game, 0, action, random);
  const script = def.script ?? passiveScript;
  for (let i = 0; i < 60 && game.winner === null && availableActions(game, 1).length && !availableActions(game, 0).length; i++) {
    const next = script(game);
    if (!next) break;
    game = applyGame(game, 1, next, random);
  }
  const out: LessonState = { ...s, game, moves: s.moves + 1 };
  out.completed = def.complete(out);
  out.feedback = out.completed ? def.success
    : game.winner !== null || game.events.some(e => e.t === 'end-turn' && e.p === 0) ? 'That line did not meet the objective. Reset and try the hinted sequence.'
    : game.players[0]!.pr.length && score(game, 0) >= game.players[0]!.goal && game.winner === null ? `You have ${score(game, 0)} secured, but victory waits for your End Phase.`
    : def.objective;
  return out;
}

export function resetLesson(s: LessonState): LessonState { return createLesson(s.id); }

export function saveLesson(s: LessonState): string { return JSON.stringify(s); }

/** Restores saved progress; rejects unknown lessons and structurally corrupted positions. */
export function resumeLesson(text: string): LessonState {
  const v = JSON.parse(text) as LessonState;
  if (!v || v.version !== 1 || typeof v.id !== 'string' || !Array.isArray(v.observed) || typeof v.moves !== 'number') throw new Error('Saved lesson is unreadable.');
  byId(v.id);
  normalizeGameState(v.game);
  assertGameIntegrity(v.game);
  return { ...v, completed: byId(v.id).complete(v) };
}
