# Build a standalone browser tabletop — Intrilex as its first complete game template

You are the lead engineer, product designer, and delivery owner for a greenfield browser game. Build the working project described below, run it, inspect it in a real browser, repair defects, and deliver the complete repository with evidence. This is an implementation request. Planning is the first step of execution.

Address me as Deffy. Use Klÿz as your assistant label. If you use Shards, they are functional subagent assignments, not independent characters. Communicate with precision, imagination, and low sludge. Prioritize Safety → Accuracy → Helpfulness → Style.

## 1. Product contract

Create a standalone, general-purpose, 2D tabletop that runs in a web browser. It should combine the immediacy of joining a PlayingCards.io room with richer card manipulation, clear permissions, reliable saved tables, and a polished Intrilex learning experience.

The central journey is:

**Create table → choose template → copy invitation → friends join as guests → play together → return to the saved table.**

The first featured game is Intrilex. The platform must also support an ordinary deck on a blank table and a second, independently authored template without changing platform code.

Success means someone can actually host and join a table across separate browsers and complete a guided Intrilex First Contact game. A local visual prototype, simulated multiplayer, disconnected tutorial slideshow, or collection of placeholders does not satisfy this request.

Use `browser-tabletop` as a provisional repository slug and “Tabletop” as a configurable working display name. Branding must not block implementation.

## 2. Scope and authority

Build in a fresh project directory. Inspect the current workspace before creating files. Preserve unrelated files and existing work. This project is independent of the existing Intrilex application: no runtime imports from that checkout, shared database dependency, coupled release process, or requirement to run the old app.

You may consult user-provided Intrilex material and available source code to understand rules and established terminology. Treat the old repository as read-only reference material. Audit any candidate reuse for correctness, licensing, dependencies, and suitability; do not copy its architecture wholesale. Do not apply an open-source license to existing Intrilex code, rules, or artwork by assumption. Keep rights and provenance distinct from the new platform code, and record unresolved distribution permissions.

You are authorized to make routine implementation choices, create and edit this new project's files, install project dependencies, run local services and tests, and prepare deployment artifacts. Ask at most one focused clarification at a time when a missing answer materially blocks a decision. Continue independent work while awaiting it. Do not require approval between ordinary implementation milestones.

Prepare a deployment that someone can operate, but do not create paid resources, buy a domain, publish the repository, change an existing deployment, or expose a public service without explicit authorization. No external account or API key may be required for local development and verification.

If collaboration tools exist, explicitly use focused Shards where independent work helps: tabletop interaction and accessibility; multiplayer authority and persistence; Intrilex rules and pedagogy; verification and adversarial review. Define shared interfaces first, assign clear file ownership, and have the lead integrate and inspect the results. Use the available concurrency limit. If subagents are unavailable, execute those responsibilities yourself and report that accurately.

## 3. Meaning of “completely free”

Players must be able to create rooms, invite friends, manipulate cards, use templates, and learn Intrilex without purchasing software, subscribing, seeing advertisements, or supplying a paid AI key. Guest play is the default. Core card controls and lessons must have no paywall.

The application must be self-hostable using freely available dependencies. Local use must work without a third-party service. Public hosting has real resource costs: document them honestly. Do not promise unlimited, permanently free hosted infrastructure. Verify any named provider's current pricing and limits before presenting a concrete free-hosting claim, and date the evidence.

Teach through authored, source-backed explanations and deterministic lesson logic. An LLM service is not a dependency for gameplay, hints, narration, or lesson completion.

## 4. Finishable v1

Required release scope:

- General tabletop for 2–8 seated guests, with bounded spectator capacity and single-user local practice.
- Reusable rooms, invitation links, private hands, host controls, reconnect, persistence, and a safe activity history.
- Advanced card controls, basic tokens/counters/dice/notes, and a usable layout editor.
- Versioned, declarative template import/export with custom card faces.
- Blank table and standard 54-card deck templates.
- Intrilex Core sandbox: canonical board layout, automatic setup, manual play, markers, and searchable rule references.
- Intrilex First Contact: complete rules-assisted two-player play, guided lessons, and local solo practice against a simple legal opponent.
- Responsive, accessible UI; meaningful automated tests; browser verification; deployment instructions; and complete source delivery.

Defer 3D physics, a public matchmaking directory, ranked ladders, tournaments, payments, voice/video, arbitrary user scripts, a workshop marketplace, and full automated adjudication of Intrilex Core or its optional modules. Design sensible seams for later work, but do not build speculative frameworks.

All required items remain requirements. If a genuine environment or source blocker prevents completion, identify the exact remaining work and evidence. Do not silently shrink the scope or relabel an incomplete release as complete.

## 5. Source contract for Intrilex

The companion source is `INTRILEX_v4.3.1_COMPLETE_PLAYER_RULEBOOK.md`. Locate it in attachments, the supplied starter pack, or this new workspace. A known source path on Deffy's machine is:

`H:\myProjects\Intrilex_dev-current\docs\INTRILEX_v4.3.1_COMPLETE_PLAYER_RULEBOOK.md`

The copy inspected on September 27, 2026 (America/New_York) has SHA-256:

`1CFBD837F763FC436F4317B9164B802F1EA8FF57E18060FD436D8608E9F0BCF8`

This checksum identifies the supplied edition; it does not forbid a newer edition explicitly provided by Deffy. If inputs differ, record the versions and source of the discrepancy. A GitHub discovery fallback is `https://github.com/Defients/Intrilex`, but accessibility and current contents are unverified. Do not substitute an unrelated game or guessed rules if the source is unavailable.

Read the complete rulebook before certifying rules coverage. Trace the First Contact profile through its referenced generic rank rules, timing, counters, scoring, Guard, Scuttle, attachments, Board Lock, and applicable exhaustion behavior. Part VII is a profile over the larger rulebook, not a standalone enumeration of every legal effect.

Use this order of authority: explicit user corrections or supplied successor edition; the selected canonical rulebook; tested implementation derived from it; explanatory prose. Existing code and old tests are evidence to inspect, not an authority that can silently overrule the book.

Record the source edition, hash, headings, any conflicts, and resolution in `docs/INTRILEX_SOURCE_MAP.md`. Every implemented rule and lesson must point to a stable rule reference. For a real contradiction that changes outcomes, ask for a ruling and mark only the affected behavior unresolved; continue unrelated work.

If the full rulebook is inaccessible, request that one source and keep building the general platform. The following baseline supports the board and setup, but is insufficient to certify a complete rules engine:

- Deck: 52 standard cards plus Red Joker and Black Joker.
- Core is two-player by default. Randomly select Player A, deal A five cards and B six, and let A start. Both Goals start at 21.
- Core zones: private hands; each player's Point Row (PR) and Enduring Row (ER); shared face-down Draw Pile (DP), Swap Bar, Graveyard (GY), and Exile. GY and Exile are public and ordered, newest on top.
- Core Swap Bar begins with two face-down cards and one face-up card dealt from DP after the hands.
- Normal victory is checked for the active player at the end of their completed Full Turn using Secured PR Points against their current Goal. Reaching a number mid-turn is insufficient.
- First Contact has Goal 15, the same 5/6 starting hands, no Swap Bar, and no Exile zone.
- First Contact has exactly one Mini-Turn per completed Full Turn and ignores extra Mini-Turn grants. Its ordinary actions are Draw, Play for Points, an enabled generic Play for Effect, and Scuttle. Draw & Cast is disabled.
- First Contact disables Comboing, Supers, reserved advanced classes, Ultras, Sudden Death, Aegis, Royal Shield, reveal markers, optional modules, and suit-specific powers. Suits still identify cards and break equal-rank Scuttle comparisons. Guard remains.
- First Contact untaps all cards controlled by the active player during Start maintenance. Voltage Thresholds are off by default.
- First Contact redirects cards destined for Exile to GY; effects whose purpose is accessing Exile are unavailable. Do not turn Exile access into GY access.
- There is no general-purpose Pass action. Declining a response differs from spending an action. Forced Exhausted Pass has the precise conditions defined by the rulebook.
- First Contact retains enabled generic rank effects, including applicable counters, attachments, Red Joker modes, and Black Joker Board Lock; it is not just drawing and scoring.

Maintain a machine-readable capability matrix with rule reference, profile, legal-action enumeration, resolution, UI selection, teaching coverage, and test evidence. Full First Contact is a release requirement. A deliberately smaller tutorial scenario must identify its teaching constraint and must not masquerade as complete First Contact. Core may be fully usable as a manual sandbox while its automated adjudication is explicitly unavailable.

## 6. Product modes and state ownership

Offer three coherent experiences:

1. **Free Table:** manual manipulation and house rules. Permissions and object integrity still apply.
2. **Learn Intrilex:** a sequence of small, interactive First Contact scenarios followed by a complete practice game.
3. **Play Intrilex:** rules-assisted First Contact, or a clearly labeled Core sandbox with references and manual controls.

Platform state describes objects, containers, seats, visibility, and layout. Intrilex rules state describes the legal game. Both must have clear ownership: the guided board renders the canonical game state, and layout preferences never change legal outcomes. A single validated game command must update rules state and its table projection atomically. Avoid separately mutable rules and visual card locations that can drift apart.

Room administration and game knowledge are distinct privileges. Being host does not automatically reveal opponents' hands or the future deck. Any open-hand lesson must announce that mode before joining and must not offer private-play claims.

Free Table may allow hosts to arrange shared components. Guided games permit only legal commands; arbitrary edits require a clearly announced transition to an analysis/sandbox copy. Do not silently enable cheats inside a guided game.

## 7. Rooms, invitations, and recovery

Implement working flows for creating a table, choosing its template, copying an invitation, entering a nickname, taking a seat, spectating, leaving, and returning. Use opaque, unguessable room/invitation identifiers. Keep host credentials separate from ordinary invitations. Provide a spectator invitation or explicit read-only join path, room lock, invite revocation/rotation, removal of participants, and host transfer.

Define and enforce spectator behavior, seat reservations after disconnect, expiry, host absence, and duplicate tabs. A dropped network connection must not award ownership to an arbitrary stranger or permanently strand the room. Expose a clear recovery option with the actual security tradeoff; guest users who lose their browser credentials must not be promised magical account recovery.

Use browser session credentials that survive the documented refresh/rejoin journey. Prefer a same-origin production deployment and secure, HttpOnly session cookies. Protect state-changing requests, validate WebSocket origins, and do not expose credentials in routine share links, logs, or analytics. If a deliberate one-time recovery secret is necessary, show it explicitly and handle it separately from the room invitation.

Persist accepted durable state before confirming durable success. Saving indicators must distinguish pending, saved, disconnected, and failed states. An absent owner should not require their browser to relay traffic. Server restart must restore rooms, seats, accepted state, and revocation status from durable storage.

Local practice runs without the multiplayer service and says so. It must not present a local-only URL as a working multiplayer invitation. Teach and practice use local saves; online rooms use authoritative server saves. Make that choice visible without exposing implementation jargon.

## 8. Card and tabletop controls

Make the following usable through mouse, touch, and discoverable keyboard/menu alternatives:

- Move single or multiple selected objects; pan/zoom; fit the table; inspect a readable enlarged card.
- Flip, rotate/tap, align, stack, unstack, and fan cards.
- Draw one or a chosen number; deal to seats; split and merge piles; shuffle; move to top or bottom with defined order.
- Reorder and sort one's own hand without revealing it. Reordering a hand does not alter turn history or legal game state.
- Reveal a selected card to specified permitted recipients or publicly; return it to an allowed hidden state with honest information-history behavior.
- Browse public piles and authorized hand/deck views. Generic “inspect” and deck search must obey room policy; guided Intrilex must obey its rules.
- Snap to zones, lock board objects, attach markers, move attached groups consistently, and maintain clear pile counts.
- Create/edit simple counters, tokens, dice, and plain-text notes. Dice use server randomness online.
- Reset to template, duplicate a template, and request permitted undo.

Right-click may accelerate controls but cannot be their sole entry point. Support touch cancellation, pointer loss, zoomed coordinates, selection during scrolling, focus restoration, and Escape. Block accidental action hotkeys while typing.

Every card instance must exist in exactly one valid location. Decks must not duplicate or lose cards during concurrent draw, split, merge, or reconnect. A temporary drag preview is not ownership of an object. Enforce ordering and visibility when moving cards between hands, piles, and the table.

Undo needs a defined policy. Online undo must be authorized, serialized, and aware of subsequent actions. Normal private play must reject undo across a hidden-information or randomization boundary unless the entire explicit mode permits that rewind. Never suggest a reveal can be unseen. Tutorial “try again” restores the scenario and its teaching state; it does not erase what the player learned. Resetting a live shared table requires a deliberate confirmation.

## 9. Template system and editor

Create a versioned declarative schema with template ID, title, description, author/provenance, schema version, rules profile, seat layout, board dimensions, zones, card definitions, decks, tokens, counters, labels, visibility policies, initial state, setup recipe, and optional lesson references. Keep game-specific fields inside a plugin-owned namespace.

Setup recipes must use an allowlisted vocabulary of validated operations such as create, shuffle, deal, place, and initialize-counter. No imported JavaScript, arbitrary expressions, executable URLs, or unchecked filesystem paths.

The editor must allow a user to place/resize/name zones, position seats and deck locations, adjust labels/background colors, configure starting components, preview the layout, and save a reusable template. Use forms and direct manipulation as appropriate. Editing a template should not mutate every room created from it. Existing rooms pin their template and rules versions.

Provide import/export with a documented format, schema validation, useful errors, size/object limits, and safe handling of embedded local raster card images. Choose and document a practical format; imports must be portable and cannot depend on local absolute paths or temporary URLs. Validate image content as well as names; reject active content and unsafe paths. Do not add an arbitrary remote URL fetcher.

Distinguish a shareable template from a saved live match. Default exports include the template and intended initial components, with new identifiers on import. They must exclude credentials, private hands from a live game, secret shuffle material, and private server history. Server-side room backups are a separate operator feature. Guests must not export secrets by choosing a different UI path.

Prove generality by authoring a second simple template through the same schema and editor/import path. A generic card-and-counter test table is sufficient; do not invent another game's canonical rules or write another rules engine merely for this test.

## 10. Intrilex board and learning experience

Build the actual layout from the selected rulebook. Core includes private hands, PR/ER for both players, DP, mixed-visibility Swap Bar, ordered GY/Exile, Goals, secured score, current phase, action allowance, and a readable space for pending plays and applicable markers. First Contact removes disabled zones and controls rather than rendering misleading usable controls.

Orient the player's own hand toward them, keep the shared center readable, and make zone names learnable: “Point Row” with PR as supporting shorthand. Preserve logical world coordinates across different seat views. Use high-contrast card ranks/suits, clearly distinct Jokers, and readable state indicators. Derive scoring and legal markers from rules state in guided play. Manual Core totals must be labeled and editable; do not imply that every scoring rider has been adjudicated automatically.

Create at least six short interactive lessons that build on one another:

1. Find your hand, DP, PR, ER, and GY; inspect a card and understand the board.
2. Draw, spend the single First Contact action, and advance phases.
3. Play for Points and see why normal victory waits for End Phase.
4. Use an enabled generic effect and choose a legal target.
5. Use Guard and compare legal/illegal Scuttle attempts, including an appropriate tie example.
6. Work through a legal response/counter situation and complete a short practice sequence.

Build these examples from the canonical rules. Adjust the exact scenario when needed for accuracy, and explain the choice in the source map. Every lesson has an objective, valid starting state, a small number of observed action predicates, a source reference, a concise explanation, and reset/skip/resume behavior. Completion must follow real state transitions; clicking “Next” is not evidence of understanding.

After the lessons, provide complete First Contact with optional hints and a simple legal opponent for local solo practice. The opponent must act from its own permitted information and enumerate legal actions through the same engine. It may be strategically modest; it must never rely on hidden opponent cards. Keep scripted lesson behavior distinct from a live opponent.

Explain “Why can I do this?”, “Why can't I?”, and “What happened?” using the same rule identifiers and results that drive play. Distinguish legal choices from strategic suggestions. Let users reduce hints or reopen help, and track local progress without an account. Make open-hand teaching visibility explicit. A remote host must be able to teach using shared pointers/highlights while each participant keeps their own reading pace.

Offer a searchable rank/rule reference and an accurately labeled graduation path toward Core. Advanced systems can be demonstrated as manual examples; do not claim automated coverage outside the implemented profile.

## 11. Engineering direction

Default to React, TypeScript, Tailwind, and Vite for the browser; a Node.js TypeScript service using WebSockets for rooms; SQLite with migrations and a persistent volume for a single-instance release; and a shared, dependency-light domain package. Select current supported releases after checking official documentation and installed tooling. Commit a lockfile and specify runtime/package-manager versions. Prefer the simplest stack that meets the contract; document any justified deviation before implementing it.

A reasonable layout is `apps/web`, `apps/server`, `packages/tabletop`, `packages/protocol`, `packages/templates`, `packages/intrilex`, `tests`, and `docs`. Consolidate small modules when that is clearer. Do not create empty packages for architectural decoration.

The tabletop package must know nothing about Intrilex-specific ranks or rules. A game adapter should expose setup, available actions, validation/application, player projection, explanation, and lesson hooks. Platform storage, invitations, transport, and object presentation must remain reusable. Built-in trusted adapters are code; imported templates are data.

Use accessible DOM/SVG rendering for this initial scale unless measurement establishes a need for another renderer. If canvas is chosen, retain keyboard navigation and a semantic alternative. Use a restrained set of components and design tokens, not several competing UI libraries.

For each online room, the server owns canonical state and serializes durable commands. Each command includes a unique request ID and any relevant revision/precondition. Validate the actor, permissions, payload, object ownership, and game legality on the server. Handle retries idempotently. Reject stale destructive actions or safely rebase only where the operation's semantics permit it. Return a useful result and current revision.

Optimistic movement may improve feel, but must reconcile to accepted server state. Keep cursor/drag presence ephemeral, throttled, and separate from durable commands. Handle simultaneous grabs with a defined policy and expiring claims if used. Full snapshots after reconnect must restore consistency when incremental history is unavailable.

Use transactions for accepted state changes and durable history. Bound event retention and replay cost with snapshots/compaction while preserving recovery and the advertised history. Persist the protocol/schema/rules versions needed to load a room. Provide migrations and backup/restore instructions. SQLite v1 is a single writer deployment; do not advertise multi-instance scalability without implementing coordination.

## 12. Privacy and randomness invariants

Generate public, seated-player, and spectator views on the server. Never broadcast the full room and hide sensitive fields only with CSS or client logic. Apply the same projections to initial load, deltas, reconnect, error messages, logs, lesson hints, exported templates, and history.

Card identity can leak through stable identifiers as well as face images. Define opaque visibility-scoped handles for hidden cards and invalidate tracking when cards enter an unknown shuffled pool. Verify that a card seen before a shuffle cannot be tracked to its new secret position through IDs, events, animation payloads, asset references, or counts beyond the information the rules permit. Public action history may retain facts that were legitimately revealed; it must not reveal new secrets.

Use cryptographically secure server randomness for live shuffles, randomized setup, and dice. Keep future deck order, random seeds, and RNG state private. Deterministic replay should record accepted outcomes or keep private replay material server-side; determinism does not justify publishing a seed that reveals future draws. Fixed seeds are appropriate for explicit teaching fixtures and tests. Do not claim protection against a malicious server operator.

Enforce session identity, role permissions, cross-room isolation, room creation limits, message/upload limits, and bounded processing. Handle unknown commands, malformed imports, HTML in nicknames/notes, invalid object references, unauthorized private-card moves, and floods without corrupting a room or crashing the service. Never log credentials or full private state. These controls need behavior tests, not only documentation.

## 13. Visual and interaction standard

Give the table a coherent, tactile identity: a calm table surface, crisp cards, readable typography, deliberate shadows, and subtle movement. Use original assets or appropriately licensed assets with provenance. Intrilex is a featured template, so its visual identity can be richer without becoming the global platform's hardcoded identity.

Keep the board central. Put room/invite controls in a compact header, common actions near the current selection, and rules/lessons/history in panels that open when useful. The initial screen should offer Create table, Join table, and Learn Intrilex with a short path to each. Avoid a wall of settings before someone can touch a card.

Support keyboard play, visible focus, screen-reader labels for visible cards and permitted actions, reduced motion, adequate contrast, and non-color-only state. Never leak hidden card names through accessibility labels. On narrow screens, prioritize the hand and action selection; use drawers, inspection views, and pan/zoom instead of shrinking all text into unreadability.

Include purposeful loading, empty, disconnected, expired-room, occupied-seat, invalid-import, save-failed, and unavailable-action states. No dead controls, placeholder statistics, fictional people, or fake network indicators. Use small motion cues for deals, flips, legal drops, and resolution; do not block play with decorative animation.

## 14. Verification contract

Create tests for consequential behavior and invariants. Do not pad the count with tests that merely repeat implementation constants. Maintain an acceptance matrix mapping each required journey to code, evidence, and status: VERIFIED, UNVERIFIED, or BLOCKED. Use explicit manual versus automated coverage for game rules.

Required verification includes:

- **Object integrity:** randomized valid operation sequences preserve unique card instances, total deck composition, container ordering, attachment integrity, and valid ownership. Invalid operations leave state unchanged.
- **Concurrency:** simultaneous draws/moves and duplicate requests cannot clone cards, double-spend actions, steal seats, or apply the same command twice.
- **Information boundaries:** inspect actual HTTP/WebSocket responses and serialized history for player A, player B, spectator, removed guest, and another room. Test face data, handles, deck order, credentials, and stale reveal state before/after shuffle, reconnect, and export.
- **Persistence:** refresh, disconnect/reconnect, controlled service restart, save failure, migration, and backup restoration. Prove accepted durable state survives restart; distinguish unacknowledged input.
- **Template generality:** create/import/export the second template without an Intrilex branch in platform code. Verify custom images round-trip and malformed/oversized inputs fail safely.
- **Intrilex fidelity:** source-derived fixtures cover setup, phases, scoring/win timing, legal action enumeration, enabled rank effects, response/counter resolution, Guard, Scuttle, relevant markers, Board Lock, exhaustion, and explicitly disabled First Contact systems. Test both legal and illegal paths plus representative multi-step interactions. Human verification is not replaced by “the engine agrees with itself.”
- **Teaching:** every lesson loads, advances from the intended action, rejects a false completion, explains the result, resets, and resumes. Complete a First Contact practice game using only legal actions.
- **Accessibility and UI:** keyboard-only essential flows, focus after menus/dialogs, hidden-card labels, reduced motion, touch input, and practical desktop/tablet/mobile layouts. Combine automated checks with direct inspection.
- **Performance:** measure a representative room with eight simulated seats and at least 108 cards, plus an Intrilex learning session. Throttle presence updates, avoid rendering the entire board for every cursor tick, and report measured environment and results. Do not make universal speed claims from one machine.

Use browser automation with isolated browser contexts and a real running backend for at least two players and a spectator. Capture evidence at approximately 1440×900, 1024×768, and 390×844. Test at least Chromium and one other engine when available. If an engine or real device is unavailable, label that boundary accurately and continue the runnable checks. Screenshots prove layout; they do not prove network/privacy behavior.

Mandatory end-to-end walkthrough:

1. Create a room from an Intrilex template and copy a genuine invitation.
2. Join in a separate browser context; add a spectator in a third.
3. Confirm visibility and roles, then perform card actions from both players.
4. Exercise a concurrent action and a rejected unauthorized action.
5. Refresh/reconnect, then restart the service and recover accepted room state.
6. Complete the lessons and a legal First Contact game.
7. Create a custom general table, export/import it, and play on it.
8. Verify that logs and portable exports contain no unintended secrets.

Run the project's lint, typecheck, relevant unit/integration/browser suites, and production build. Exercise the production server/start command as well as the dev server. Repair failures and rerun affected checks. After the final changes, run the release gates once on the final tree. Do not hide failures by deleting assertions, weakening the rulebook, disabling checks, or substituting mocks for the required network tests.

## 15. Execution plan and continuity

Create `SPEC.md` from this contract, `PLAN.md` with milestones and acceptance checks, and `STATUS.md` with current progress, key decisions, source availability, commands/results, remaining work, and the next concrete action. Keep these concise enough to use. Add a project `AGENTS.md` documenting the important invariants and commands.

Build in this dependency order:

1. Inspect the environment, select the Intrilex source edition, establish package/tooling setup, and agree on domain/protocol/plugin interfaces.
2. Deliver a local interactive table with real object operations, zone rules, visibility projections, and the first browser checks.
3. Connect real multiplayer with invitations, sessions, permissions, retries, persistence, and restart recovery. Verify with separate browser contexts.
4. Complete template editing/import/export and prove a second template works.
5. Implement the source-mapped First Contact engine, canonical Core sandbox, lessons, and local practice opponent.
6. Polish the full user journey, inspect responsive behavior, perform adversarial tests, and fix defects.
7. Package the complete repository, operator instructions, deployment artifacts, screenshots, and final evidence report.

Milestones are checkpoints, not stopping points. Continue until the release contract is satisfied or a concrete dependency outside your control blocks progress. Do not finish after a plan, scaffolding, attractive home page, or first playable slice. During long work, send brief updates about completed behavior, discovered issues, and what the next check will resolve.

When context is compacted or work resumes, read the project status and inspect the actual files. Inventory incomplete modules, interfaces, tests, and documentation before adding more features. Preserve working progress and user edits. Do not restart architecture or weaken acceptance criteria because the conversation became long.

## 16. Delivery requirements

Deliver the complete runnable repository with every referenced module, asset, config, migration, and script present. Include:

- README focused on create/join/play/learn, then local setup and limitations.
- Exact install, dev, test, production build, production start, backup, and restore commands; a lockfile; runtime versions; and an `.env.example` with no credentials.
- A sensible container/deployment configuration for a single service with persistent storage, health/readiness endpoints, graceful shutdown, and documented HTTPS/WebSocket proxy requirements.
- Documentation for architecture, protocol/permissions, template schema, Intrilex sources/capabilities, lesson authoring, operation/costs, retention, and recovery.
- Original or licensed visual assets; notices identifying third-party dependencies and separating Intrilex material from platform licensing decisions.
- Source-derived rules fixtures, functional tests, real browser evidence, and a final acceptance report tied to the tested revision or identified working tree.
- An archive or equivalent portable handoff of source when the environment supports it, excluding dependencies, secrets, live guest data, and unnecessary generated debris.

Test the documented setup from a clean checkout or equivalent isolated copy. If packaging or a clean install cannot be tested, say why. Do not claim public deployment, unlimited hosting, complete Core automation, or release readiness beyond the evidence.

Your final response should begin with a brief TL;DR, provide the project location and verified run/preview instructions, explain the delivered experience, summarize all major and minor changes, report verification, and name remaining limitations or blocked requirements. Distinguish implemented, tested locally, and publicly deployed. Include concrete next steps only where work genuinely remains.

Start now: inspect the fresh workspace and available rules source, establish the implementation plan, and proceed directly into building the first verified slice. Carry the work through the complete contract.
