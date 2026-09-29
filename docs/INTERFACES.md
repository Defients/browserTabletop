# Shared interfaces (v2 — as implemented)

Relative imports with `.js` extensions; one root npm package and tsconfig.

## packages/tabletop
- `createTable(def: TableDefinition, random?) → TableState` (runs the allow-listed setup recipe)
- `applyTable(state, actor: {seat, host}, command: unknown, random?) → TableState` — parses `TableCommand` (discriminated union in `types.ts`), validates references (handles visible to the actor), never mutates input, throws `TableError(code)`, asserts invariants.
- `projectTable(state, seat|null) → TableView` — handles only; hidden piles/other hands as counts.
- `parseTableCommand`, `rebaseSafe`, `undoable`, `assertInvariants`, `artIndex`, `cardLabel`, `secureRandom`.

## packages/templates
`builtInTemplates`, `validateTemplate(unknown)`, `validateRaster`, `exportTemplate`, `importTemplate(text, newId?)`, `TEMPLATE_LIMITS`. Format: `docs/TEMPLATES.md`.

## packages/intrilex
`createGame({random?, firstPlayer?})`, `availableActions(state, p)`, `applyGame(state, p, action, random?)`, `projectGame(state, p|null)`, `explainAction`, `explainCard(view, cardId)`, `chooseBotAction(view)`, `fixture(spec)`, `RULES`, lessons API (`lessons`, `createLesson`, `lessonAct`, `lessonObserve`, `lessonComplete`, `lessonHint`, `resetLesson`, `saveLesson`, `resumeLesson`).

## packages/protocol
`RoomView`, `RoomCommand`, `CommandRequest/Response`, `ClientMessage`, `ServerMessage`, `parseClientMessage`, `parseServerMessage`, `errorText`. HTTP/WS details: `docs/PROTOCOL.md`.
