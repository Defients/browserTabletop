# Status

## Jack attachment model correction — October 1, 2026

Normal Jacks played for effect were stored in `players[p].er` with a `hostId` back-reference, so the authoritative state placed them in the Enduring Row and the board rendered a standalone ER card next to an intact enemy PR host. Replaced with a canonical attachment registry: `GameState.attachments` maps jackId → `{ hostId, controller, mode }`, `GameCard.tugBy` marks the host, and `'attached'` is now a real `CardLocation` row — attached Jacks occupy no zone. `score()`, capacity checks, targeting predicates, severing (`checkAttachments`), and `projectGame` all derive from the registry; `GameView.attachments` carries the public relation to the client. The ER special case was repaired at the same time: `J♠ → ER` (full profile `attach-er`) now moves the enemy Anchor into the Jacker's ER with the Jack attached — previously the Jack landed in the caster's ER while the host stayed in the opponent's and `checkAttachments` scrapped it immediately. `normalizeGameState` migrates legacy `hostId`-in-ER saves on every load path (applyGame input, room `validateRoomVersion`, Practice localStorage, `resumeLesson`). `GameBoard` renders the mini-card inside the host tile (`~30%` width, tucked corner) with a `Jacked +1` tag on PR hosts; both members cross-highlight on hover and the inspect panel shows base card / Jack / original owner / controller. ER no longer renders attached Jacks as slot occupants.

### Gates

| Check | Result |
|---|---|
| Lint | PASS |
| Typecheck | PASS |
| `npm run build` | PASS |
| Node tests | PASS — 220/220 (8 new `tests/intrilex.attachments.test.ts` cases A–H: PR attach state, slot/ER neutrality, `J♠` ER distinctness, sever-on-host-removal, save/reload normalization, replay determinism, simulation copy) |
| Playwright e2e | PASS — `learn.spec.ts` 2/2 Chromium (Jack-attach lesson completes through real interactions) |
| Bot smoke | PASS — `scripts/smoke-games.ts` 200 games, wins [92,108,0], maxTurns 52, maxMoves 172 |
| Visual inspection | Jacked `9♠` in P1 PR with tucked mini + `Jacked +1` tag, empty ER, Secured 13 = 3 + (9+1), at 1440×900 and 390×844 (`artifacts/shots/jack-attach-*.png`) |

No commit, push, or public deployment occurred.

## Right rail declutter + instrument-panel polish — September 30, 2026

Removed the two filler helper paragraphs from the Legal Actions panel (the Suggested Moves caption "Advice from your visible cards…" and the "Select a card to focus its choices…" hint) and tidied the right rail. The panel head is now an edge-to-edge title band with a hairline divider and a gradient (`fc-panel-head` uses negative margins matching `--hx-panel-pad`); its `h2`/`Fewer hints` link are `white-space: nowrap` so the band stays one line at narrow widths. Suggested Moves is a bordered violet inset card with an eyebrow label; "Possible Moves" and the Game Log summary share the same uppercase-eyebrow treatment, with a trailing rule on the Possible Moves heading. The Opponent Hand panel carries the violet left edge used by the opponent seat card, and suggested-action hover now glows violet instead of the generic cyan. The dead `.fc-suggestions > p` COMPACT hide-rule was removed (`.fc-panel > p.muted.small` stays — it still covers the Full Start Phase hint).

### Gates

| Check | Result |
|---|---|
| Lint | PASS |
| Typecheck | PASS |
| `npm run build` | PASS |
| Node tests | PASS — 212/212 (unchanged; no behavioral code touched) |
| Responsive spec (Chromium + Firefox) | PASS — 16/16 at 1024×576 → 2560×1440 |
| Visual inspection | Right rail at 1440×900, 1024×576 and 390×844 (`artifacts/shots/rail-*.png`) — one-line header band, suggestion card, eyebrow labels |

No commit, push, or public deployment occurred.

## Point Row card tiles — landscape rank+suit renderer — September 30, 2026

Point Row cards no longer render as miniature portrait playing cards inside oversized slots. `CardFace` gained a `variant="point-row"` (applied only by `boardRow` for `zone === 'pr'` in `GameBoard.tsx`; Enduring Row, hand, stack, Swap Bar, trays and TableBoard are untouched) that drops the duplicate corner indices and renders a single centered rank+suit composition on the normal light card surface — red suits keep `.card-red`, jokers render `RJ★`/`BJ★`, backs still show `card-back-mark`, and all state classes/ARIA labels are unchanged (selection, tap, highlight, click/double-click behavior preserved).

`.fc-pr .fc-slot` is now an inline-size query container: the tile is `width: min(88cqw, 190px)` at `aspect-ratio: 1.85/1` with rank+suit type at `clamp(.95rem, 24cqw, 2.9rem)`. In the viewport-locked desktop shell the tile additionally caps its width by the row-height container (`calc((100cqh - 8px) * 1.85)` — `cqh` resolves to `.fc-row` because `.fc-slot` only accepts inline-axis queries), so it fills the slot in short rows without overflowing. `.card-pr.is-tapped` keeps the 90° tap rotation but scales to `.44` so the wider footprint stays inside the slot.

### Gates

| Check | Result |
|---|---|
| Lint | PASS |
| Typecheck | PASS |
| `npm run build` | PASS |
| Node tests | PASS — 212/212 |
| Responsive spec (Chromium + Firefox) | PASS — 16/16 at 1024×576 → 2560×1440 |
| Visual inspection | Live First Contact room with cards in both PRs at 1440×900, 1024×576, 2560×1440 and 390×844 — rank+suit dominant and centered, `2♥`/`4♥` red (`artifacts/shots/pr-*.png`) |

No commit, push, or public deployment occurred.

## Action Families — semantic Possible Moves — September 29, 2026

The Legal Actions panel no longer lists every serialized rules-engine action. A pure presentation adapter (`packages/intrilex/presentation.ts`) groups compatible legal actions into **Action Families** via declarative specs keyed on structured fields (`type`, `cardId(s)`, `targetId(s)`, `mode` prefixes) — never label text — and `apps/web/ActionPanel.tsx` renders them: single-variant entries stay one-click rows; single-parameter families (choices, face-up swap draw, ≤8-variant voltage guesses) expand inline quick options; multi-parameter families (Swap Bar, Scuttle, Counter, Ultras, Supers/composites, per-card effect modes, multi-card costs like Deep Draw) open a drill-down **Action Composer** that keeps the board visible.

Composer options are always derived from the legal variants compatible with the current picks, so impossible Cartesian combinations cannot be offered; Confirm fires only when exactly one original engine action resolves (exact-set matching disambiguates subset costs). Board clicks route into open composer parameters (hand/board cards to card params, Swap Bar slots to slot params), live picks reconcile against refreshed legal actions, and a vanished family closes the composer. In a Full start phase the previous 11-row list renders as 2 semantic rows (`Finish Start`, `⇅ Swap Bar · 10`); confirming resolves to the exact engine action (verified: `Swap face-down slot 1 · give 7♣`).

### Gates

| Check | Result |
|---|---|
| Lint | PASS |
| Typecheck | PASS |
| `npm run build` | PASS |
| Node tests | PASS — 212/212 (13 new `tests/presentation.test.ts`: grouping, param extraction, non-rectangular filtering, exact/subset cost resolution, stale-pick reconcile, family-disappearance, deterministic ids, search) |
| Playwright e2e | PASS — 58/58 across Chromium + Firefox; `e2e/fc.ts` helpers now traverse families (label matching via `data-labels`, DFS composer picks until the live preview matches); `social.spec.ts` suggestion assertion accepts family membership |
| Visual inspection | Full start phase at 1440×900: `Swap Bar 10 ›` row → composer with slot card tiles + hand-card give options, live preview, sticky Confirm, Escape/back focus restore (`artifacts/shots/panel-*.png`) |

No commit, push, or public deployment occurred.

## Action-button squash fix — September 29, 2026

Action buttons in Possible Moves were being squeezed below their natural height: `.fc-actions` is a bounded column flex scroller, and `.action-btn` declares `min-height: 0`, so `flex-shrink: 1` compressed two-line labels until text escaped the button borders. `.fc-actions > *` is now `flex: none`, so every button renders at content height (measured 76–98px) and the list scrolls. `.hx-stack > *` got the same guard for identical protection in the now-scrollable Pending Plays panel.

### Gates

| Check | Result |
|---|---|
| Lint | PASS |
| Typecheck | PASS |
| `npm run build` | PASS |
| Responsive spec (Chromium + Firefox) | PASS — 16/16 |
| Visual inspection | Two-line labels render inside button borders at 1366×768 and 1024×576; zero squashed buttons |

No commit, push, or public deployment occurred.

## Pending Plays capped + larger stack cards — September 29, 2026

The Pending Plays panel previously grew to fill all leftover left-rail height (`flex: 1 1 0%`), so even an empty "STACK CLEAR" stretched hundreds of pixels. It now sizes to content (`flex: 0 1 auto`) and caps at `max-height: min(26rem, 42dvh)` — roughly four entries — scrolling internally past that, which matches the stack's realistic 3–5-item depth. Stack cards grew from 34×46px to a `--hx-stack-card-h` token (`clamp(52px, 7.5dvh, 80px)`, DENSE floor 54px), so a pending play's card is clearly legible.

### Gates

| Check | Result |
|---|---|
| Lint | PASS |
| Typecheck | PASS |
| `npm run build` | PASS |
| Responsive spec (Chromium + Firefox) | PASS — 16/16 |
| Visual inspection | Left rail at 1920×1080 (pending item, 58×80 card) and 1024×576 (empty stack ≈74px, no rail-filling dead zone inside the panel) |

No commit, push, or public deployment occurred.

## Possible Moves bounded scroller + action-badge alignment — September 29, 2026

Follow-up to the viewport-native board: the Possible Moves list (`.fc-actions`) is now the `.fc-panel` elastic region — `flex: 1 1 auto; min-height: 6.5rem; overflow-y: auto; overscroll-behavior: contain` — claiming leftover rail height and scrolling internally with the app's styled thin scrollbar instead of growing the panel/page. Suggested Moves yields first inside the panel (`flex: 0 2 auto`, its `<ol>` is the internal scroller so the heading/advice never clip); the open Game Log yields fastest (`flex: 0 5 auto`, becomes a flex column so `.glog-scroll` tracks the shrunk `<details>` height). The whole-panel scroll remains as the final backstop.

Action buttons' number+icon badges no longer clip: both pseudo-elements are pinned from `top` inside a fixed centered 2rem gutter (icon was `bottom:`-anchored and collided with the number on short buttons), with `min-height: 2.3rem` on `.fc-actions .action-btn` guaranteeing the stack fits.

### Gates

| Check | Result |
|---|---|
| Lint | PASS |
| Typecheck | PASS |
| `npm run build` | PASS |
| Responsive spec (Chromium + Firefox) | PASS — 16/16 |
| `social.spec.ts` (Chromium + Firefox) | PASS — 16/16 |
| Visual inspection | Practice board with populated Possible Moves at 1366×768 / 1024×576 / 1920×1080 — bounded scrollable list, unclipped badges, Suggested Moves + Game Log still visible |

No commit, push, or public deployment occurred.

## Viewport-native gameboard — responsive density refactor — September 29, 2026

The HybriX board previously used fixed pixel dimensions: at ~1024×576 the hand tray and lower board fell below the fold, forcing page-level scroll; larger displays kept the same static sizing. The board is now a viewport-locked shell with height-driven density tokens — no document scrolling at any tested desktop resolution, no global `transform: scale()`, no JS resize listeners.

### Root causes fixed

- `.room` inside `.app-wide` had only `min-height: 100%` — after state updates, the board's max-content contribution grew the room (and document) past the viewport. Now `height: 100%` with `overflow-y: auto`, so genuine overflow scrolls inside the room.
- `.fc-layout`/`fc-field`/`fc-row` and both rails lacked `min-height: 0`, letting intrinsic content force grid/flex tracks taller. Battlefield rows were fixed `padding`+`min-height` boxes; card status flags consumed extra vertical space below each card.
- Rail panels (`fc-panel` sticky, `hx-stack`) had document-anchored `100vh` max-heights and no internal scroll contract.

### Changes

- `apps/web/styles.css` — `--hx-*` density tokens (`clamp()`/`dvh`) for gaps, padding, row name band, hand card, trays, fans, swap cards; `@media (min-width: 861px)` viewport shell (`.app-wide` `100dvh`, `main` sole page scroller, `.room` bounded flex column); `.fc-layout` becomes `grid-template-rows: auto minmax(0,1fr)` inside the room; rails scroll internally with `.hx-stack` (Pending Plays) and `.fc-panel` (Legal Actions) as flex anchors; `.fc-row` is a `container-type: size` container whose cards size off `100cqh`; `.fc-flags` overlay; COMPACT (`max-height: 720px`) hides secondary helper copy, DENSE (`max-height: 580px`) additionally re-floors the tokens and collapses seat/swap captions. Width breakpoints ≤1100px now leave card sizes to the height-driven tokens.
- `apps/web/GameBoard.tsx` — battlefield cards wrapped in `.fc-card-wrap` with `.fc-flags` overlaying Jack/anchor/Aegis/Jacked/tapped flags; flags no longer cost row height.
- `e2e/responsive.spec.ts` (new) — 8 resolutions × both browsers: document scrollHeight/scrollWidth ≤ client + 2px, bounding boxes of `.fc-status`, `.hx-left`, `.hx-stack` (Pending Plays), `.fc-surface`, `.fc-center` (piles), `.fc-hand`, `.hx-right`, `.hx-ophand`, `.fc-panel` (Legal Actions) inside the viewport, all 4 rows > 20px, scrimmage visible, zero console errors.
- `e2e/server.ts` — `watchErrors` console filter now also matches Firefox's "can't establish a connection to the server at ws://…" wording for the socket interruptions the filter already intentionally ignores (Chromium's wording was already covered). No assertion weakened.

### Gates

| Check | Result |
|---|---|
| Lint | PASS |
| Typecheck | PASS |
| Node tests | PASS — 199/199 |
| `npm run build` | PASS |
| Responsive spec (Chromium) | PASS — 8/8 |
| Responsive spec (Firefox) | PASS — 8/8 |
| Playwright e2e (Chromium + Firefox) | PASS — 58/58 |
| Visual inspection | Full-profile room + First Contact mid-game at 1024×576 / 1366×768 / 1920×1080 / 2560×1440 — complete board in viewport, occupied rows render cards + overlay flags correctly |

No commit, push, or public deployment occurred.

## Swap Bar initial placement: face-up in Slot 2 — September 29, 2026

Per the rules owner's direction, the Swap Bar's initial three cards are now placed face-down · face-up · face-down — the single face-up card sits in the middle slot (Slot 2) in both the rules-assisted Full profile and the Core sandbox. §2/§21.3 fix the counts (2 down + 1 up for two players) but not positions; the interpretation is recorded in `docs/INTRILEX_SOURCE_MAP.md`.

Changes: `packages/intrilex/engine.ts` `createGame` deals `[down, up, down]`; `packages/templates/index.ts` splits the Core `place` ops into down → up → down; `packages/tabletop/index.ts` `transfer` offsets table placement by cards already in the target zone so sequential `place` ops lay out left-to-right instead of stacking at one x. Assertions in `tests/tabletop.test.ts` and `tests/intrilex.full.test.ts` updated to the new order.

### Gates

| Check | Result |
|---|---|
| Lint | PASS |
| Typecheck | PASS |
| Node tests | PASS — 199/199 |
| `npm run build` | PASS |

No commit, push, or public deployment occurred.

## Merged single application header + HybriX board — September 29, 2026

The two stacked header rows (app nav `Tabletop|Play|…`, then a separate `.room-bar`/`.lesson-bar`) are merged into ONE `.topbar`. `common.tsx` adds a `HeaderSlot` context + `HeaderContext` portal; `App.tsx` owns the only `<header class="topbar">` and renders a `.header-context` slot between the nav and the (now conditional) service dot. `Online.tsx`, `Practice.tsx` (both local headers) and `Learn.tsx` render their title/badge/`save-state`/`you-are`/controls into that slot, so no second navbar exists on any route. Inside a table the global "Online tables available" dot is suppressed — the room's `.save-state` chip already reports connection state. Medium widths shrink gaps/padding first; ≤520px hides only `.you-are` (secondary). Desktop height ≈56px.

The gameboard itself is now the HybriX three-column layout in `GameBoard.tsx`: left rail (P2/P1 summaries + Swap Bar + Pending Plays/Stack with `STACK CLEAR` empty state), center (status strip, four rows — P2 ER, P2 PR, Line of Scrimmage, P1 PR, P1 ER — landscape Draw/Graveyard/Exile trays, `Your Hand` tray with scroll arrows and 1–5/6–7/8–10/10+ density), right rail (Opponent Hand fan, `Legal Actions (N)`, `Game Log` with All/Actions/Effects/System tabs). Mini-Turns are read-only (`n / 3` Full). No debug +/- controls, no duplicated Swap Bar/Pending Plays, no permanent extra slots — 5th/6th slots render only when occupied. All engine wiring, projections, `[data-zone]`, `.zone-pick`, `action-*` classes, `.fc-history`, and chat behavior are unchanged.

Fixes during verification: `.fc-actions` nested scroll reverted (clipped buttons under Playwright hit-testing); `.header-context` flex-basis and `.hx-hand-wrap` grid `minmax(0,1fr)` fixed the 390px `scrollWidth` overflow; chat dock portals to `document.body` (topbar `backdrop-filter` would otherwise contain the fixed dock); `scripts/shots.ts` selector updated `.room-bar`→`.room-head`; ad-hoc debug scripts removed.

Test-harness fix (not a rules change): `e2e/social.spec.ts` rate-limit step no longer depends on UI click speed racing the server's 10s window. The host page now tracks sockets too, and six `chat-send` fillers are fired in one `page.evaluate` over the already-authenticated room socket — the window fills in milliseconds regardless of browser pacing. Assertions unchanged: 7th send shows "Message failed.", draft is preserved, explicit retry after the window delivers it.

### Gates

| Check | Result |
|---|---|
| Lint | PASS |
| Typecheck | PASS |
| Node tests | PASS — 199/199 |
| `npm run build` | PASS |
| Playwright e2e (Chromium + Firefox) | PASS — 42/42; one transient Firefox `Browser.removeBrowserContext` protocol error during context-close teardown (post-assertion cleanup, infra flake) passed on retry |
| Responsive | `scrollWidth` = viewport at 390px; header stays one row at 1440/1366/1024 |
| Visual inspection | `artifacts/shots/` — merged header on room + lesson routes at 1440 and 390; no console errors |

No commit, push, or public deployment occurred.

## Chat retention notice compressed to info tooltip — September 29, 2026

The "Room chat is temporary…" paragraph at the top of the chat panel is replaced by a compact `ⓘ` icon button at the top-right of the chat content. The full notice now lives in a `role="tooltip"` bubble revealed on hover or focus, and toggled by click for touch (`aria-expanded`, Escape dismisses, blur resets); `aria-describedby` keeps the text in the button's accessible description. The button is labelled "Chat retention info" so it cannot collide with the `/^Room chat/` trigger lookup used by tests and the UI.

Changes: `apps/web/ChatPanel.tsx` (icon + tooltip markup, `tip` state), `.chat-retention`/`.chat-info`/`.chat-info-tip` styles in `styles.css`, `e2e/social.spec.ts` `openChat` hovers the icon before asserting the notice text.

### Gates

| Check | Result |
|---|---|
| Lint | PASS |
| Typecheck | PASS |
| `npm run build` | PASS |
| Playwright e2e `social.spec.ts` (Chromium) | 7/8 PASS incl. axe at three viewports — the 390×844 `scrollWidth` check fails identically with this change reverted: pre-existing overflow from the uncommitted HybriX board work (`fc-surface`/`hx-*` extend to ~457px), not from this edit |

No commit, push, or public deployment occurred.

## Game log ("What happened?") semantic feed — September 29, 2026

The history panel in `GameBoard` is now a `GameLog` component: chronological feed pinned to the newest entry, `Turn N: Player M.` engine lines render as compact turn dividers, and every line is classified into a semantic kind (score, scuttle, denied, counter, major rule moments, steal, exile, draw, reveal, discard, anchor, warn, phase, effect, win, setup, system) by an ordered pattern table in `apps/web/logModel.ts`. `Player N` tokens render as the seat's display name with a seat color (`--log-p0` cyan / `--log-p1` orange, CosmoTech-derived; no authoritative seat colors existed), card names carry suit tone, and counts use tabular figures. Significant kinds get a restrained left accent; wins get ★ + violet wash. A "Stylized Text" checkbox (default ON, persisted as `tabletop.logStylized` via `loadLocal`/`saveLocal`) switches to a neutral presentation that preserves the original prose verbatim. New entries fade in only if they arrive after mount; the scroll region is `role="log"`, keyboard-focusable, and scrolling up unpins with a `↓ N new events` jump control. Empty state shows "Game events will appear here."

Changes: `apps/web/logModel.ts` (classifier + tokenizer, pure), `apps/web/GameLog.tsx`, one-line swap in `GameBoard.tsx`, `.fc-history`/`.glog-*` styles in `styles.css`. Tests: `tests/gameLog.test.ts` (74 real engine lines → kinds, token round-trip, turn/actor parsing, unknown-line fallback) and `e2e/log.spec.ts` (default on, neutral off, prose preserved, reload persistence, seat-name rendering, turn dividers against the practice bot).

### Gates

| Check | Result |
|---|---|
| Lint | PASS |
| Typecheck | PASS |
| Node tests | PASS — 199/199 (6 new) |
| `npm run build` | PASS |
| Playwright e2e (Chromium + Firefox) | PASS — 42/42, incl. axe at three viewports over the new panel |
| Visual inspection | `artifacts/shots/glog-{styled,plain,mobile,jump}.png` — seat colors, suit tones, turn dividers, accents, neutral mode, jump control |

No commit, push, or public deployment occurred.

## Right-panel suit colors — September 29, 2026

Suit glyphs inside the legal-actions panel's text labels now use card-face colors: `♦`/`♥` render in `--card-red` (#c0264f) and `♣`/`♠` in a lifted slate (#7983ae) that stays legible as the "black" suit on the dark glass. Card faces themselves were already colored; this covers plain-text labels only.

Changes: `common.tsx` adds `suitSpans(text)`, which wraps suit glyphs in `.suit-red`/`.suit-black` spans; `GameBoard.tsx` applies it to action labels, suggested-move labels, the filter chip, the "What happened?" history and the "Why can / can't I?" list (all inside or spawned from `.fc-panel`). `styles.css` defines the two suit classes. Accessible names and `hasText` matching are unchanged — the spans alter color only.

### Gates

| Check | Result |
|---|---|
| Lint | PASS |
| Typecheck | PASS |
| `npm run build` | PASS |
| Playwright e2e (Chromium + Firefox) | PASS — 40/40; one transient firefox trace-write ENOENT flake (documented infrastructure issue) passed on retry |
| Visual inspection | `artifacts/shots/suit-colors.png` — red ♦/♥ and slate ♣/♠ confirmed in the practice action panel |

No commit, push, or public deployment occurred.

## Room chat dock — auto-open bottom-right, draggable — September 29, 2026

Room chat now opens by itself on wide viewports, docked to the bottom-right corner; an explicit collapse is still remembered per room/participant. Narrow viewports keep the collapsed default, where the open panel would otherwise become a full-screen modal over the board. The dock's title bar is a drag handle (grab cursor, ⠿ grip, "Drag to move" tooltip) using pointer capture with viewport clamping; the grip button also accepts arrow-key moves (Shift = larger steps) and Enter re-docks to the corner.

Changes: `useRoomSocial.ts` defaults `collapsed` from the `(max-width: 860px)` query only when no stored preference exists; `ChatPanel.tsx` adds pointer/keyboard move handling; `styles.css` re-anchors `.chat-dock` bottom-right with drag affordances. e2e: new `social.spec.ts` test covers default-open position, header drag and persisted collapse; `fc.ts` exports `collapseChat`; room-entry helpers collapse the dock where it would cover board controls (walkthrough, social `join`).

### Gates

| Check | Result |
|---|---|
| Lint | PASS |
| Typecheck | PASS |
| Node tests | PASS — 193/193 |
| `npm run build` | PASS |
| Playwright e2e (Chromium + Firefox) | PASS — 36/36 across social, walkthrough, quality, templates and full specs, incl. the new drag/auto-open test |

Note: one transient flake — the chromium social journey timed out waiting for the 'Invite people' modal during room creation (before any chat interaction); it passed on retry. No commit, push, or public deployment occurred.

## CosmoTech™ visual system — September 29, 2026

Replaced the felt-green presentation with a complete CosmoTech™ skin: void-first environment, smoked-glass surfaces, violet/cyan signal energy. All styling lives in `apps/web/styles.css` (rewritten as `--ct-*` design tokens with legacy variable aliases); `apps/web/App.tsx` adds the `aria-hidden` `.ct-env` ambient layer (drifting star field, two rotating orbital ring systems, all CSS); `apps/web/index.html` theme-color updated to `#04060d`. Every existing class hook was preserved — no JSX class names, routes, state or logic changed.

Details: instrument buttons with hover energy traces and luminous violet primary; console inputs with cyan focus acquisition; custom range-slider track/thumb; glass topbar with bottom energy hairline and rotating brand-mark arc; status node on `.service-dot` (teal pulse); concentric orbital loader replaces the spinner dot; card backs became indigo constellation marks; First Contact surface is now a nebular void deck with edge-masked technical grid; action buttons keep left-edge semantics remapped to the energy spectrum; modals/notices/chat dock are elevated glass with atmospheric backdrop; room-notice left edge is kind-coded; thin dark scrollbars; `prefers-reduced-motion` still collapses all animation.

### Gates

| Check | Result |
|---|---|
| Lint | PASS |
| Typecheck | PASS |
| Node tests | PASS — 193/193 |
| `npm run build` | PASS |
| `npm run build:neocities` | PASS |
| Playwright e2e (Chromium + Firefox) | PASS — 38/38, incl. axe WCAG2A/AA at 1440/1024/390, keyboard-only journey, reduced-motion, perf |
| Visual inspection | `scripts/shots.ts` at 1440×900 and 390×844 + e2e `artifacts/screens/*` — no console errors, no legacy-theme remnants |

Note: two transient infrastructure flakes occurred on the first e2e run (Playwright trace-write ENOENT on context close; screenshot write to `artifacts/screens/` blocked while the IDE had the folder open). Both passed on retry. No public deployment or push occurred; the working tree was committed externally during the session under the repo owner's identity.

## Goal +5 report investigation; Seven-family and cost-commit fixes — September 29, 2026

Investigated the user-reported "9♥ Goal Shift +5 raised the opponent Goal by 8" claim. A lone `goal5` adds exactly +5 (verified by test and direct fixture); the observed +8 was reproduced only by two separate Nine declarations (`goal5` then `goal3` in the same response window) resolving LIFO — legal per §6/§7, and both declarations appear in history. A Full-profile rules fuzz then exposed three real defects, all fixed:

### Fixed

- `deep-draw` (6♠) charged its discard cost at *resolution*, leaving the cost card spendable during the response window (double-spend, then `NOT_IN_HAND` crash that poisoned the `applyGame`). `commitWild` now commits every `targetIds` cost source from hand at declaration — the source-map requirement "cost sources are committed from hand at declaration" — deduped against already-committed `cardIds`. The resolution tail suspends them to GY with the source.
- `compositeActions` Ultra-Black internal casts could offer the Ultra's own committed components as Deep Draw / Wild-4 cost sources; those offers are now excluded at enumeration.
- `seven-hand` resolution only handled two revealed cards: 7♠ Topdeck (reveal 3) silently dropped the third card out of the game. The taken card is now marked Revealed-Until-Start (canonical §26 7🛠/7♠), a `seven-gen` follow-up choice selects which remaining card is declared as the generated play, and leftovers return to the top of DP. `seven-single` take also marks Revealed.
- `super-7` (⭐7) was structurally wrong — it revealed 3 cards through the take-one flow, leaking a card every time. Rewritten to canonical Sequential Topdeck Casting: reveal up to 2, choose resolution order, declare each as a generated Topdeck Play one at a time; the second declaration is delivered through a suspended task that fires only after the first play and its nested children finish.
- `peek` choice was `held: true` while its cards still lived in the Swap Bar, double-counting them in `everyCard` (+1/+2 per pending peek).

### UI: tapped-state tag (user report "effect with no way to clear it")

Tapped OTT cards rendered only a rotated face — no explanation of the residual Nine Tap / ⭐2 Hold state or its release condition. `GameBoard` now shows a `Tapped` tag naming the clear condition: `Nine Tap · 0 pts until {controller} scores` (Full, `tapUntil: 'score'`), `Held · 0 pts until {controller}’s Start` (⭐2 hold), `Tapped · 0 pts until {controller}’s Start` (First Contact §9). Pending composite plays also render the primary source card alongside committed partners (previously only `item.cards` rendered).

### Gates

| Check | Result |
|---|---|
| Lint | PASS |
| Typecheck | PASS |
| Node tests | PASS — 148/148 (4 new Full regression tests) |
| First Contact fuzz (`smoke-games.ts`) | PASS — 400 games |
| Full-profile rules fuzz | PASS — 400/400 games, zero integrity violations (was 254/400 crashing before) |

No new interpretation was needed — every change follows explicit canonical §26 text. No public deployment, commit, or push occurred.

## ER Anchor value surfaced — September 29, 2026

Fixed the user-reported bug that a King anchored in the Enduring Row did not register its Anchor value (ordinary K = 7, K♠ = 9 per §26 ⦗K⦘).

### Fixed

- `engine.ts` now exports `anchorValue(c)`: untapped Kings carry 7 (K♠ 9), all other Anchors 0; tapped ER cards contribute 0 (§9). ER Anchor value is not Secured PR Points — §8 keeps ER at 0 unless a rule explicitly adds Points.
- Anchored Kings (single `anchor-K`, Royal Marriage) log their Anchor value on ER entry; the `anchor-K` mode text and `K.anchor` rule summary state 7/9.
- `GameBoard` renders a `⚓ {value}` tag on every ER Anchor (Attachments excluded) so the value is visible on the board.

### Gates

| Check | Result |
|---|---|
| Lint | PASS |
| Typecheck | PASS |
| Node tests | PASS — 144/144 (new Anchor-value assertions in `intrilex.effects`) |

## Face-Down Swap Bar fix — September 29, 2026

Fixed the user-reported bug where Face-Down Swap Bar actions failed with "This request could not be completed." `availableActions` emitted `swap-down` with only a slot `mode` and no `cardId`, so `perform` → `takeFromHand` always threw `NOT_IN_HAND`, an engine code absent from `ERROR_TEXT` that fell back to the generic message.

### Fixed

- `availableActions` now enumerates one `swap-down` per face-down slot × hand card (`cardId` set), matching §18 "give 1 card from your hand" and the declared-action revalidation contract.
- `perform` `swap-down`: removed dead code that cloned/re-handled the taken card before the slot was overwritten; the taken card now enters hand hidden — §18 grants no Revealed-Until-Start (contrast §26 Six Peek, which does).
- `ERROR_TEXT` gained `INVALID_ACTION`, `ACTION_UNAVAILABLE`, `NOT_IN_HAND` so engine legality failures produce real messages instead of the generic fallback.
- Known adjacent gap (not fixed here): `PlayerView.revealedHand` is declared and rendered but `projectGame` never populates it, and `revealed` markers are never expired at Start (§10; audit Reveals row).

### Gates

| Check | Result |
|---|---|
| Lint | PASS |
| Typecheck | PASS |
| Node tests | PASS — 143/143 (Full suite now 23 tests, including Face-Down Swap regression) |

## Full-profile generated-play pipeline fixes — September 29, 2026

Fixed the user-reported bug where a generated card that "had to be scrapped" (e.g. a Draw & Cast 10♣) did nothing, and the related generated/composite defects exposed by the same log (a generated `8♣ + 8♦ · Absolute Scuttle` left 8♣ in hand, letting it counter its own play).

### Fixed

- `resolveChoice` now handles `generated-scrap`: the held card is detached from its lingering zone (hand after Draw & Cast, GY mill after Super-5, Swap Bar after Peek) and Scrapped to GY. `MODES['generated-scrap']` no longer throws.
- Generated/composite `cardIds` extras are committed from hand at declaration and stored on the stack item (`item.cards`); all composite sources are Scrapped to GY on resolve, counter or fizzle.
- Prefixed modes resolve through `infoFor`'s normalisation: `wild-*` (inner Base effect; Wild-4 cost committed; K♠ marked Wild-Exile-Bound), `mimic:*` (consumes Rank-10 usage; resolves the copied Super), `ultra-black:*` (score one source, cast one as an internal sub-effect, Exile the third; consumes the Ultra limit at declaration), `hold:*` (⭐2-held cards cast from the Start Phase as generated child plays).
- Stack items now stamp `tier` (`super`/`ultra`/`sudden`) and Royal-Shield `shield`, so Ace/King counter authority matches §9.4/§16.1.
- Scuttle resolution is mode-aware: ⭐8 Absolute ignores rank/suit/ordinary immunity, 8♠ Free ignores rank/suit, ordinary Scuttle unchanged; the GY bonus is ordinary-8-only.
- A♠ Exile Counter sends countered sources to Exile; the countered 3 Red Ultra returns the bottom GY card to hand.
- `startTurn` resets the per-Full-Turn limits (Ultra, Quick Queen, Court, Rank-10) and untaps ⭐2-held cards at their controller's Start; Nine Tap sets `tapUntil: 'score'`.
- Peek removes taken/played cards from the Swap Bar; generated choices propagate the Topdeck recursion marker.

### Gates

| Check | Result |
|---|---|
| Lint | PASS |
| Typecheck | PASS |
| Node tests | PASS — 142/142 (Full-profile suite now 22 tests, including generated-scrap, composite-commit/counter, Absolute/Free Scuttle, Wild/Mimic, Ultra tier, ⭐2 Hold, Exile Counter, Nine Tap) |
| Production build | PASS |

Interpretations are recorded in `docs/INTRILEX_SOURCE_MAP.md` (Generated/composite resolution semantics). No public deployment, commit, or push occurred.

---

## Intrilex Full-profile engine implementation — September 29, 2026

Reconstructed the Full-profile engine layer in `packages/intrilex/engine.ts` after an accidental `git checkout` had reverted the uncommitted work. The First Contact baseline is preserved; Full behavior branches on `full(s)`.

### Re-applied / newly implemented

- `FULL_MODES` table (~30 modes: purge-aegis, total-clear, raid-spade, seven-spade, deep-draw, exile-rummage, peek, aegis-field, queen-aegis, free-scuttle, goal5-spade, attach-er, tempo, exile-recovery, theft, court, marriage, super-2-score/hold, super-3-raid/discard, super-4-pr/er, super-5/6/7/8/J/A, ultra-red/black/mixed-draw/mixed-exile, sudden).
- `fullOrdinary` (suit-specific 3♠/4♠/6♠/7♠/J♠, 5 exile rummage, 10♥/♠/♦, 2/K♠ wild copy), `compositeActions` (Super, Court, Marriage, Sudden, Ultra), `superModes`, `fullChoices` dispatcher for `Choice.kind === 'full'`.
- `perform` cases for `start-action`, `swap-down`, `swap-draw`, `draw-cast`, `voltage`, and composite `cardIds`/`targetIds` sources.
- `resolve` handles `draw-cast`, `foundation`, `bj-recycle` triggers; `resolveEffect` handles all Full modes; `resolveChoice` handles the `'full'` choice kind (foundation, bj-recycle, peek, exile-rummage, super-5, voltage, theft).
- `scoreCard` Nine `tapUntil === 'score'` release, 10♣ Foundation Aegis + optional trigger, BJ Exile Recycle trigger.
- `startTurn` Full Start Phase (`phase: 'start'`, swap/ten/ultra/court/quickQ flags reset, no auto-untap).
- `projectGame` exposes public `exile`, `swapBar` (face-up only), `suddenDeath`, `miniTurnsGranted`, `voltage`; face-down Swap Bar slots omit card identities.
- `createGame` Full setup: version 3, Goal 21, Exile, Swap Bar (2 face-down + 1 face-up).
- Counter resolution scraps all composite sources (`negated.cards`, `item.cards`).
- Fixed invalid UTF-8 in `packages/templates/index.ts` (mis-encoded `·` middle dot).
- Added `release/**` to eslint ignores (generated build artifacts).

### Final executable-tree gates

| Check | Result |
|---|---|
| Lint | PASS |
| Typecheck | PASS |
| Node tests | PASS — 132/132 (includes 12 Full-profile tests) |
| Standard production build | PASS |
| Neocities build | PASS — four files, ~436 KB uncompressed |
| E2E (Playwright) | PASS — 24/24 (Chromium + Firefox), including Full table public/private zones |

### Notes

- The Full-profile engine is a large surface; the 12 Full tests cover setup, privacy projection, Exile ordering, forged-command rejection, normal-victory timing, Queen Court (counter + once-declared), Royal Marriage, Queen entry Aegis, Nine tap/release, and Aegis blocking. Broader fuzz/coverage of every Super/Ultra mode is future work.
- No public deployment or upload was performed. The Neocities bundle still ships with a blank multiplayer server origin.
- `docs/INTRILEX_FULL_AUDIT.md` remains the checklist; not every audit item has a dedicated test yet.

---



Prepared `release/ttsbrowser-neocities-upload.zip` and `release/ttsbrowser-neocities/upload/` with four browser files, target-specific instructions, checksum and per-file manifest. Rebuilt static output/typecheck passed. Local target-origin smoke checks passed in Chromium and Firefox using the observed public CSP; no missing assets, API requests or page errors. See `artifacts/verification/ttsbrowser-upload-smoke.json` and `ttsbrowser-build.log`.

The live root currently serves “Learn Jakuv - Interactive Tutorial” (HTTP 200). Uploading at root replaces that homepage; the instructions also describe `/tabletop/` as a preservation option. **No upload occurred.** The multiplayer server URL is still missing and intentionally blank. Runtime source is unchanged from the fully tested Neocities implementation below.

## Current: Neocities frontend with separate multiplayer — September 29, 2026 (America/New_York)

User-selected deployment model: Neocities hosts the frontend and a separate server runs shared multiplayer. Implemented as top-level navigation to the multiplayer origin, preserving existing first-party session cookies, authorization, projections and SQLite persistence. Local games, lessons, rules and template editing run directly on Neocities without service requests.

### Delivered

- `npm run build:neocities`: separate static output in `dist/neocities`, relative assets and existing hash routing support root or subdirectory uploads.
- `site-config.js`: public runtime setting for the HTTPS multiplayer origin; invalid/missing settings show an honest unavailable state. No credentials are needed in the static bundle.
- Home/navigation/library links open the configured multiplayer site. Built-in template selection and copied invitation routes survive the handoff. Custom templates use explicit export/import across origins.
- `npm run preview:neocities` and `npm run test:neocities`; static tests run under a restrictive CSP with network connections disabled, no API and no SPA fallback, plus a real separate production server for the handoff.
- `docs/NEOCITIES.md`, README/AGENTS updates, fresh desktop/mobile static screenshots, refreshed ordinary browser evidence, and `release/browser-tabletop-neocities.zip` containing the four upload files.

### Final executable-tree gates

| Check | Result |
|---|---|
| Lint | PASS |
| Typecheck | PASS |
| Node tests | PASS — 116/116 |
| Existing Chromium/Firefox browser tests | PASS — 22/22 |
| Neocities Chromium/Firefox tests | PASS — 4/4 |
| Standard production build | PASS |
| Neocities build | PASS — four files, approximately 436 KB uncompressed |
| Local static preview and visual inspection | PASS — desktop/mobile home |
| Actual Neocities upload / public multiplayer deployment | UNVERIFIED — not performed |

Logs: `artifacts/verification/neocities-final-*.log`. Current input hashes: `artifacts/verification/neocities-tested-inputs.json`. This run used the working checkout; dependency versions/lockfile are unchanged from the earlier isolated clean install below. Documentation and delivery manifests were updated after testing; executable files were unchanged afterward.

**Configuration still required:** the deployed multiplayer server's real HTTPS origin. `site-config.js` intentionally ships with an empty value. The Neocities local features work immediately; online links become usable after configuring a running server. No site, paid resource, public server or upload was created. Changes are uncommitted.

Current performance reports supersede the earlier measurements below: Chromium first render 87 ms, median move 133 ms; Firefox 103 ms / 33 ms. Both recorded zero durable-board mutations during presence traffic. These are single-machine loopback results.

The earlier Docker, WebKit/real-device, rules-ruling and visual-polish boundaries remain open. See `docs/NEOCITIES.md` for upload and server configuration instructions.

---

## Earlier clean-install verification baseline — September 29, 2026

Base: `1ff9605` plus the backup-test harness fix and documentation/evidence updates described below. All runnable release gates passed in an isolated clean-install copy. Changes from this continuation are uncommitted; no push or public deployment was performed.

The application remains implemented: generic tabletop controls and private projections, durable multiplayer rooms, declarative templates/editor, Intrilex First Contact rules-assisted play, manual Core sandbox, seven interactive lessons, and a legal-only local opponent. Rule interpretations D-1 and D-3 still await the rules owner; passing tests do not resolve those questions.

### Changes in this continuation

- Fixed the backup test harness to run CLI subprocesses asynchronously, keeping its in-process HTTP server responsive. Added failure-safe server/database cleanup; retained all backup, overwrite-refusal, restore, revision, card-count, and invitation assertions.
- Corrected the operations guide: a lost acknowledgement can follow a successful commit. Reconcile projected state and retry with the same request ID.
- Refreshed 30 browser screenshots and both performance reports; recorded gate logs and SHA-256 hashes of tested inputs in `artifacts/verification/`.
- Updated acceptance and handoff records; regenerated `release/browser-tabletop-src.tar.gz` with source, documentation and evidence, excluding dependencies and private runtime databases.

### Environment and provenance

Windows x64; system Node 22.14.0 / npm 10.9.2; npm scripts use pinned project-local Node 24.21.0. Playwright 1.63.0, Chromium and Firefox. Isolated copy: `D:\CodexProjects\browser-tabletop-verification-20260929-091300`.

The supplied rulebook SHA-256 was rechecked and matches `1CFBD837F763FC436F4317B9164B802F1EA8FF57E18060FD436D8608E9F0BCF8`. This continuation verified the existing suites; it did not independently recertify the entire rulebook interpretation.

`artifacts/verification/tested-inputs.json` identifies the exact tested runtime, tests, configuration, lockfile and canonical rulebook by hash. Only documentation/evidence and archive assembly followed the successful gate run; executable inputs were compared byte-for-byte against the isolated copy before packaging.

### Final release gates

| Gate | Result on final executable tree |
|---|---|
| `npm ci` | PASS — 166 packages added, 167 audited, 0 reported vulnerabilities |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm test` | PASS — 115/115, no skipped/cancelled tests |
| `npm run test:e2e` | PASS — 22/22, Chromium + Firefox, genuine production backend, 2.1 minutes |
| `npm run build` | PASS — browser client and server/backup/restore bundles |
| `npm start` smoke | PASS — readiness, static client, session, room creation and durable three-card draw |
| Bundled backup/restore | PASS — online backup, fresh-path restore, restart, same session/revision/cards recovered |
| `npm run dev` smoke | PASS — Vite client, readiness proxy, session and CSRF-protected room creation |
| Docker/container | UNVERIFIED — Docker unavailable on this host |
| WebKit / real devices | UNVERIFIED — not exercised |

Logs: `artifacts/verification/gate-*.log`. The initial run is preserved as `gate-test-initial-failure.log`: 114/115, backup test `ECONNRESET`, with the leaked test worker stopped to release the stalled runner. The backup CLI was synchronous while its HTTP server shared the same event loop. After the asynchronous harness/cleanup fix, **all gates were rerun**, including `npm ci`.

Previous handoff runs A/B and targeted retries applied to earlier trees; run C was interrupted during installation. The September 29 run above supersedes that incomplete verification record.

### Performance and direct visual inspection

Single-machine Windows loopback measurements, 8 seats / 108 total cards / 60 table cards rendered:

| Browser | First render | Median move round-trip | Maximum move round-trip | Board mutations during cursor traffic |
|---|---|---|---|---|
| Chromium | 81 ms | 130 ms | 141 ms | 0 |
| Firefox | 90 ms | 136 ms | 149 ms | 0 |

These are local measurements, not universal latency guarantees. Automated layouts/accessibility ran at 1440×900, 1024×768 and 390×844. Direct inspection of the fresh mobile First Contact and desktop editor screenshots confirmed two existing polish items: the mobile action panel occupies much of the viewport, and counter labels overlap in the editor preview.

### Remaining work

- Container build/start/restart/persistence validation on a Docker-capable host.
- WebKit/Safari and real-device touch verification.
- Rules-owner rulings for D-1 (enabled-effect list) and D-3 (2 Solo Wild).
- Mobile action-panel and editor-preview polish.
- Platform licence, Intrilex distribution rights, and any publication remain decisions for Deffy. Nothing was publicly deployed.
