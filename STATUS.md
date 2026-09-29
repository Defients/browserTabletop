# Status

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
