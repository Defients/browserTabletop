# Lesson authoring

Lessons live in [`packages/intrilex/lessons.ts`](../packages/intrilex/lessons.ts) and run on the real First Contact engine. A lesson is:

```ts
{
  id: 'guard-scuttle',                 // stable; used for saved progress and templates' plugins.intrilex.lessonIds
  title, objective, explanation, hint, success,
  refs: ['§13 Guard', '§19 Scuttle'],  // rulebook headings (see docs/INTRILEX_SOURCE_MAP.md)
  openHand: false,                     // true when the lesson reveals the opponent's plan; the UI announces it
  start: () => fixture({ ... }),       // canonical starting position (all 54 cards; seeded order)
  allowed: a => a.type === 'scuttle',  // teaching constraint; other legal actions are refused without state change
  script: s => ...,                    // optional scripted opponent (must return an action from availableActions)
  complete: s => ...,                  // predicate over engine events/state — never over UI clicks
  tasks: [...]                          // optional UI observation tasks (orientation only), accepted strictly in order
}
```

Rules for authors:

1. **Build positions with `fixture()`** (`packages/intrilex/fixtures.ts`): write hands/rows in card notation (`'7♠'`, `'10♥'`, `'RJ'`, suffix `*` = tapped, `{card:'J♣', host:'9♦'}` for Jacks). It asserts every physical card exists exactly once.
2. **Keep the non-learner hand free of unintended responses** (no A/K/8/3/9/J unless the lesson is about them); otherwise the learner will face extra decline prompts.
3. **Complete on transitions**, e.g. "a `scuttle` event with `success` for player 0 exists". Declining is always permitted.
4. **Explain the rule**, cite headings, and give a hint that leads to the intended path.
5. **Add tests**: an intended path in `tests/lessons.test.ts` (`PATHS`), plus a false-completion case, and extend `e2e/learn.spec.ts` if the UI flow changes.

Progress is stored in the browser (`localStorage['tabletop.lessons']`) as `saveLesson()` JSON; `resumeLesson()` rejects unknown IDs and positions that fail `assertGameIntegrity`.
