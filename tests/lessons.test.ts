import { test } from 'node:test';
import assert from 'node:assert/strict';
import { availableActions, createLesson, findCard, lessonAct, lessonComplete, lessonHint, lessonObserve, lessons, resetLesson, resumeLesson, saveLesson, type GameAction, type LessonState } from '../packages/intrilex/index.js';

const pick = (s: LessonState, pred: (a: GameAction) => boolean) => { const a = availableActions(s.game, 0).find(pred); assert.ok(a, `no action; legal: ${availableActions(s.game, 0).map(x => x.label).join(' | ')}`); return a!; };
const cid = (s: LessonState, t: string) => findCard(s.game, t)!.id;
const step = (s: LessonState, pred: (a: GameAction) => boolean) => lessonAct(s, pick(s, pred));
const declineAll = (s: LessonState) => { while (availableActions(s.game, 0).some(a => a.type === 'decline') && !s.completed) s = step(s, a => a.type === 'decline'); return s; };

/** Intended path for every lesson, expressed only through legal engine actions / observations. */
const PATHS: Record<string, (s: LessonState) => LessonState> = {
  'orientation': s => { for (const o of ['zone:hand', 'zone:dp', 'zone:pr', 'zone:er', 'zone:gy', 'inspect']) s = lessonObserve(s, o); return s; },
  'draw-action': s => { s = declineAll(step(s, a => a.type === 'draw')); return step(s, a => a.type === 'end'); },
  'score-victory': s => { s = declineAll(step(s, a => a.type === 'score' && a.cardId === cid(s, 'Q♣'))); assert.equal(s.game.winner, null, 'no win before End Phase'); assert.match(s.feedback, /End Phase/); return step(s, a => a.type === 'end'); },
  'generic-effect': s => declineAll(step(s, a => a.mode === 'attach' && a.targetId === cid(s, '9♣'))),
  'guard-scuttle': s => declineAll(step(s, a => a.type === 'scuttle' && a.cardId === cid(s, '7♠'))),
  'response-counter': s => {
    s = step(s, a => a.type === 'scuttle' && a.cardId === cid(s, '9♦'));
    assert.equal(s.game.stack.at(-1)?.cls, 'counter', 'the scripted opponent answered with its Eight');
    s = declineAll(step(s, a => a.type === 'counter' && a.cardId === cid(s, 'A♣')));
    return step(s, a => a.type === 'end');
  },
  'board-lock': s => { s = declineAll(step(s, a => a.mode === 'board-lock')); s = declineAll(step(s, a => a.type === 'score')); return step(s, a => a.type === 'end'); },
};

test('at least six lessons exist, each with ID, objective, sources, hint and a canonical start', () => {
  assert.ok(lessons.length >= 6);
  for (const l of lessons) {
    assert.ok(l.id && l.title && l.objective && l.explanation && l.hint && l.success && l.refs.length, l.id);
    assert.ok(PATHS[l.id], `intended path defined for ${l.id}`);
    assert.equal(createLesson(l.id).game.activePlayer, 0);
  }
});

for (const l of lessons) {
  test(`lesson ${l.id}: completes only through its intended state transitions`, () => {
    const start = createLesson(l.id);
    assert.equal(start.completed, false);
    assert.equal(lessonComplete(start), false, 'a fresh lesson is not complete');
    assert.ok(lessonHint(start).length > 5);
    const done = PATHS[l.id]!(start);
    assert.equal(done.completed, true, `${l.id} feedback: ${done.feedback}`);
    assert.equal(lessonComplete(done), true);
  });
  test(`lesson ${l.id}: resets and resumes from saved progress`, () => {
    const s = createLesson(l.id);
    const mid = l.tasks ? lessonObserve(s, l.tasks[0]!.id) : s;
    const resumed = resumeLesson(saveLesson(mid));
    assert.deepEqual(resumed, mid);
    const reset = resetLesson(PATHS[l.id]!(s));
    assert.equal(reset.completed, false);
    assert.deepEqual(reset.game, createLesson(l.id).game, 'reset restores the canonical fixture');
  });
}

test('false completion: orientation rejects wrong zones and "Next"-style skipping', () => {
  let s = createLesson('orientation');
  s = lessonObserve(s, 'zone:gy');
  assert.equal(s.observed.length, 0); assert.match(s.feedback, /Not quite/);
  s = lessonObserve(s, 'inspect');
  assert.equal(s.observed.length, 0);
  assert.equal(lessonAct(s, availableActions(s.game, 0)[0]!).game, s.game, 'no Actions allowed in lesson 1');
});

test('false completion: draw-action rejects scoring and cannot end before drawing', () => {
  let s = createLesson('draw-action');
  const scored = lessonAct(s, pick(s, a => a.type === 'score'));
  assert.equal(scored.game, s.game, 'a legal but off-lesson Action is refused without changing state');
  assert.match(scored.feedback, /Draw/);
  assert.ok(!availableActions(s.game, 0).some(a => a.type === 'end'), 'End is not legal before the Action');
  s = createLesson('score-victory');
  s = declineAll(step(s, a => a.type === 'score' && a.cardId === cid(s, '3♦')));
  assert.equal(s.completed, false, 'scoring alone is not completion');
});

test('false completion: response-counter fails if the learner lets the Eight resolve', () => {
  let s = createLesson('response-counter');
  s = step(s, a => a.type === 'scuttle' && a.cardId === cid(s, '9♦'));
  s = declineAll(s);
  assert.equal(findCard(s.game, '7♣') && s.game.players[1]!.pr.some(c => c.rank === '7'), true, 'the 7♣ survived');
  if (availableActions(s.game, 0).some(a => a.type === 'end')) s = step(s, a => a.type === 'end');
  assert.equal(s.completed, false);
  assert.match(s.feedback, /Reset/);
});

test('resume rejects tampered or unknown saves', () => {
  const s = createLesson('guard-scuttle');
  const tampered = JSON.parse(saveLesson(s));
  tampered.game.players[0].hand.push({ ...tampered.game.players[0].hand[0] });
  assert.throws(() => resumeLesson(JSON.stringify(tampered)));
  assert.throws(() => resumeLesson(JSON.stringify({ ...s, id: 'secret-lesson' })));
  assert.throws(() => resumeLesson('{"version":9}'));
});
