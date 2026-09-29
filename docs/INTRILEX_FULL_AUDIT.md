# Intrilex Full source audit

Audit date: September 29, 2026 (America/New_York). This is the implementation checklist, not a certification of completed coverage. Passing setup tests does not certify advanced effects.

## Authority and scope

The complete 4,299-line `sources/INTRILEX_v4.3.1_COMPLETE_PLAYER_RULEBOOK.md`, Parts I–X, was read for this audit. Its SHA-256 was independently checked: `1CFBD837F763FC436F4317B9164B802F1EA8FF57E18060FD436D8608E9F0BCF8`. Explicit Deffy rulings outrank the book; complete card text outranks summaries and matrices (§35).

Full means standard two-player Core. Parts I–VI apply; Part VII describes the separate First Contact profile. Part VIII modules require explicit pregame enablement and are **not enabled** in Full: BattleRealm, Traps, Multiplayer, Deffy draft, Time Bomb, and Tournament Seed. Part IX tournament clocks/match structures do not silently become normal-game mechanics. Reserved Super-Duper/Super-Dee-Duper recipes remain illegal (§21 9.3, §35 18.3).

## Rules-family checklist

Each row is required unless marked excluded. Verification must cover declaration, resolution, projection, and an actual choice path where applicable. Engine seams below refer to `packages/intrilex/engine.ts`; state lives in `types.ts`, scenarios in `fixtures.ts`, and UI in `apps/web/GameBoard.tsx`.

| Family | Canonical source | Required behavior and failure cases | Implementation / evidence seams |
|---|---|---|---|
| Setup | §2–3 | 54 unique cards; random A gets 5, B 6; A starts; Goal 21; deal bar after hands, down/down/up; DP 40; Exile empty | `createGame`, `everyCard`, `projectGame`; `tests/intrilex.full.test.ts` |
| Full Turns | §4.1–4.5 | Start reset, Exhausted check, Voltage snapshot before maintenance, reveal expiry, ordered triggers, optional down swap; 1–3 Mini-Turn hard cap; no ordinary Pass | `startTurn`, `availableActions`, `endTurn` |
| Actions | §4.3 | Empty-hand Draw 2 uses declaration state; face-up draw; score; effect; Scuttle; first-Mini-Turn Draw & Cast effect-only restrictions | `ordinaryActions`, `perform`, generated-choice enumeration |
| Priority | §5–7; §38 | Declare all sources/modes/costs/targets; illegal declaration spends nothing; later fizzle retains expenditure; LIFO; no priority mid-resolution; automatic advance only without lawful responses | `parseAction`, `applyGame`, `responseActions`, `settle`, `resolve` |
| Scoring and taps | §8–9; §26 Nine | Tapped text inactive; Nine tap persists through Start, expires when current controller scores; Hold tap has recorded Start; no universal Core untap; normal victory at active End only | `score`, `scoreCard`, `startTurn`, `endTurn` |
| Reveals | §10 | Public hand card until holder's recorded Start; leaving hand clears marker; expiry rotates hidden handle | `toHand`, hand movement, `startTurn`, `projectGame` |
| Ownership / Attachments | §11–12; §26 Jack | Played-for-Effect versus permanent Exile-Bound; immediate Jack revalidation; scrap invalid Jack and restore host unless effect overrides destination/control; ER Jack does not retrigger entry | `clean`, destination helpers, `checkAttachments`, `restoreHost` |
| Protection | §13–17 | Guard other cards; Aegis friendly/enemy hard immunity with explicit exceptions; Nines never gain Aegis; recorded expiry survives control changes; Queen-count Royal Shield declaration snapshot; two untapped ER Queens prevent opposing Super-A declaration | targeting predicates, counter enumeration, snapshots, projection |
| Swap Bar | §18; §22; §26 Six | Finite; one normal use per own FT; down swap after Start triggers takes first then returns any hand card face-up; face-up Action unavailable under Exhausted; Six effect access does not consume use | Start actions, swap choice, bar projection |
| Scuttle | §19; §26 Eight | Rank/suit order; current controller determines enemy; Guard irrelevant; A/5/RJ/BJ active immunity; Aegis blocks; 8-spade bypasses rank/suit only; Super-8 bypasses ordinary immunity; ordinary-Eight success reward only | `canScuttle`, response actions, resolution |
| Composite declarations | §20–21 | Explicit recipes only; all sources committed to one item; complete prevalidation; atomic resolution; no generic undefined Combo permission | composite enumerator, `StackItem`, integrity accounting |
| Ultras | §21 9.4 | Exact 3 black, 3 red, 2+2 recipes; once per player per FT; roles declared; no Royal Shield; Super-A authority only; recursive internal casts atomic; countered red rider after counter finishes | composite actions, internal resolution/trigger queue |
| Exhausted | §22 | Enter only at actual Start with empty DP; 3 completed FTs; legal effect access survives; active Anchor count then Points then draw; refill clears immediately | `startTurn`, `settle`, `endTurn` |
| Sudden Death | §23 | Jokers or four equal ranks; vulnerable enemy target at declaration; timer still begins if target later illegal; two later completed FTs; normal victory wins first | composite actions, resolution, timer state |
| Voltage | §24 | Snapshot contribution of untapped 3/4/5 PR incl Jack bonus before maintenance; optional ordered Start abilities; once per rank; not a play; 4 guess private before reveal; all branches and generated timing | Start queue, choices, projection |
| Exile | §25; §24 12.7 | Shared public order; newest top; access only by named effect; persistent 10 destination replacement after beginning resolution, not before; five suit ranges; BJ refill recovery | destination helpers, Exile choices, projection |
| Ace | §26 A | Base/Anchor/Spade/Super authority class restrictions; Purge Aegis bypass and fallback only when no Aegis anywhere; Anchor capture revealed; Spade sends negated sources to Exile | ordinary/counter modes, failed-play destinations |
| Two | §26 Two | Quick pending/resolved limit; same-suit 3–7 Super wild; Solo Wild same-suit Base only; two real Twos for Commandeer; Aegis blocks, Guard/rank protection bypassed; score or Hold then optional Start cast | wild enumeration, control change, Start choice |
| Three | §26 Three | Generic raid/discard/bounce; Spade presentation 2 with score/effect child; Super take up to 2 or discard down to 2; revealed hand gains | choices and generated plays |
| Four | §26 Four | Ordinary independent clear skips Aegis/Q-spade; Natural private top four order/draw; Spade hard bypass total clear; structural Super exchange then fresh Aegis, no Aegis for Nines | clear/exchange resolution, private choices |
| Five | §26 Five; ruling FULL-R1 below | Recycle mill 2, revealed rummage, bottom draw; separate Exile mode; Super mill 3 and play one actually milled card | choice provenance and Exile ranges |
| Six | §26 Six | Dig; Quick private down-bar peek ≤2, take revealed or effect-only child; Spade additional discard 1/2 then draw ≤6, keep 3/4; Super draw ≤7 keep ≤4 and distribute rest DP/GY | private choices, ordering, cost validation |
| Seven | §26 Seven | Hand assignment first; generated score/effect/Super/explicit composite; additional hand components including newly acquired cards; physical-Seven-only recursion; Super sequential children use updated state; no premature Scrap; scoring trigger distinct | suspended parents, generated enumeration, trigger queue |
| Eight | §26 Eight | Aegis Field; Scuttle counter; ordinary Scuttle reward; Spade Instant Free Scuttle; Super Absolute Scuttle; effect-target immunity exception for Super-2 | protection, Scuttle, responses |
| Nine | §26 Nine | Source-specific taps; Goal +3/+5 discard; optional Spade self −2; one active Nine Anchor, reveal and opponent discard | tap state, goal modes, Anchor entry |
| Ten | §26 Ten | One effect per player own-reset period; Foundation pre-entry score zero optional bonus score and entry Aegis; Diamond mimic permitted Supers/timing/authority with paired Two extension; Heart +2 MT draw; Spade theft retarget plus printed skips and countered theft penalty; Exile recovery | per-player limits, mimics, theft choice, skipped slots |
| Jack | §26 Jack | Disrupt Mini-Turn type without countering current Action, only restrict if another type legal; PR +1 Attachment; Spade ER Anchor Attachment; Super +2 MT | actions, attachment cleanup, grant cap |
| Queen | §26 Queen | ER protected entry; Quick one pending/one resolved Aegis grant; Spade non-total clear immunity; Court exactly two physical hand Queens, once declared per FT, no generated components, simultaneous ER entry | composite Anchor class, entry, counter enumeration |
| King | §26 King | Ordinary single Anchor/Goal counters; Spade multi-play counter exclusions; Wild single-card full Spade Base, retained identity, royal 4 discard upfront, Wild Exile at declaration even if countered; matching-suit Marriage | wild/cost enumeration, destination replacement, class counters |
| Red Joker | §26 RJ | Four independent modes; hand transitions hide reveals; Shuffle Reset only Super-A authority; no Exile shuffled | hand movement and shuffle projection |
| Black Joker | §26 BJ | 11, active Scuttle/Jack immunity; optional up-to-two ordered Exile recycle scoring trigger; Quick open-state Lock, Super-A authority only; postactivation duration; counters/non-Trap triggers remain legal | trigger choices, Board Lock legality, timers |
| Optional modules | Part VIII §28–34 | Excluded by default; never infer enablement from Full label | strict profile/config validation |
| Precedence / loops | Part IX §35–38 | Specific text before tables; prohibit undefined recipes and voluntary unchanged-state loops; tournament procedure excluded unless enabled | validation and finite-resource analysis |
| Public checklist | Part X | Every relevant marker/timer visible; declared sources public, hidden cards private | projected views and board inspection |

## Explicit ruling

**FULL-R1 — Deffy, September 29, 2026:** Each Five has a separate optional Exile-rummage mode costing one Mini-Turn. It retrieves exactly one card from that Five's suit-permitted range in §26, into hand as Revealed-Until-Start. This supplies the otherwise missing activation grant in “When a 5 effect explicitly permits Exile rummage.” It does not replace ordinary Recycle. Clubs: newest two; Diamonds: middle excluding newest/oldest two, minimum five; Hearts: oldest two; Spades: any. Empty access has no fallback. This ruling is supplied by the task's lead from the user's live reply; it must not be attributed to the unmodified book.

## Resolved source traps, not new rulings

- The §7 summary suggesting legal Aces answer Anchors is superseded by explicit Ace/King/Court/Marriage codex restrictions and §36's detailed taxonomy.
- BJ's explicit PR immunity controls over the abbreviated Scuttle table omitting BJ.
- The generic “no mid-resolution interruptions” rule yields to Seven's explicit suspended-parent child plays, while Ultra recursively keeps internal casts atomic.
- Court's explicit hand-only and no-generated-component requirements override Seven's general composite permission.
- Board Lock allows Voltage and scoring triggers but prohibits non-counter generated Effect declarations; its restrictions never cancel previously declared objects.
- First Contact disputes D-1/D-3 remain scoped to that profile; they do not disable Full Solo Wild.

## Evidence boundary

The family checklist above is source-derived. Mark a family implemented only after its actual legality, resolution, serialized state, projected privacy, user choice path, and tests have been checked. The final gate record belongs in `STATUS.md`; no deployment or publication is authorized. At audit creation, the shared engine was still the First Contact baseline and Full implementation was in progress.
