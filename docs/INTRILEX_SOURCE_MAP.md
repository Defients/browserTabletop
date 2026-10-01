# Intrilex source map

## Edition

| Field | Value |
|---|---|
| Source | `sources/INTRILEX_v4.3.1_COMPLETE_PLAYER_RULEBOOK.md` (supplied by Deffy) |
| Edition | Complete Player Rulebook v4.3.1 (v4.0 contract + v4.1 clarifications, v4.1.1, v4.1.2, v4.2.0, v4.3.0, v4.3.1 hotfixes) |
| SHA-256 | `1CFBD837F763FC436F4317B9164B802F1EA8FF57E18060FD436D8608E9F0BCF8` — verified 2026-09-27 |
| Read | In full, Parts I–X (4 299 lines), before engine work |
| Authority order | Deffy's explicit rulings → this rulebook → tested implementation → prose summaries (`packages/intrilex/rules.ts` summaries are original wording, not rulebook text) |

Machine-readable capability matrix: [`docs/capabilities.json`](capabilities.json). Rule IDs used by the engine, UI and tests: [`packages/intrilex/rules.ts`](../packages/intrilex/rules.ts).

## Headings traced for First Contact

Part VII (§27 / Canonical §15) is a profile over the larger book. Implemented behaviour traces through:

| Heading | Used for | Code |
|---|---|---|
| §1 Objective; §4.5 End Phase | End-Phase victory for the active player only; timer order victory → Board Lock → (Sudden Death disabled) → Exhausted | `engine.ts endTurn` |
| §2 Setup; §27 15.4 | 54 cards, random Player A (5, first), Player B (6), Goal 15, no Swap Bar/Exile | `createGame` |
| §4.1 Start; §27 15.5 | reset per-turn limits, Exhausted entry, untap everything the active player controls | `startTurn` |
| §4.3 Actions; §27 15.3, 15.6 | exactly one Mini-Turn: Draw (2 if hand empty *at declaration*), Play for Points, Play for Effect, Scuttle | `ordinaryActions`, `perform` |
| §4.4 Free plays; §26 Timing Keywords | Quick = own turn; Instant = any response window | `quickModes`, `instantModes` |
| §5 Declare/fizzle; §6 Stack; §7 Counters | declaration legality via enumeration; LIFO; revalidation → fizzle; counters don't refund | `settle`, `resolve`, `fizzle` |
| §8 Secured PR; §9 Tapping | tapped cards score 0; Jack +1 | `score` |
| §12 Attachments | a Jack is an attachment-registry entry keyed by `hostId`, never an ER occupant; sever/Scrap Jack; host returns to owner. J♠ (`attach-er`) moves the ER Anchor under the Jacker's control — it stays in the Jacker's ER as the host. | `attachments`, `checkAttachments`, `restoreHost`, `attach-er` |
| §13 Guard | untapped Queen Anchor protects *other* OTT cards from enemy single-target Effects | `guarded`, `effectTargetable` |
| §17 Vulnerable | single-target legality = no rank/state immunity + Guard (Aegis absent) | `effectTargetable` |
| §19 Scuttle; §16.4 | rank order A…K<RJ<BJ, suit ties ♣<♦<♥<♠, A/5/RJ/BJ immune, own cards illegal | `canScuttle`, `outranks` |
| §22 Exhausted | entry at Start, Draw undeclarable, forced Pass condition, countdown, tiebreak, recovery | `startTurn`, `endTurn`, `settle` |
| §26 Rank codex (generic text only) | see capability matrix | `MODES`, `resolveEffect` |
| §26 BJ Board Lock (state, restrictions, duration, pending objects) | open-state Quick, ⭐A-only counter, no non-counter Effects/Scuttle, ticks from the next completed Full Turn | `quickModes`, `endTurn` |
| §27 15.1–15.2, 15.7 | disabled systems, Exile→GY, generic-only profile | throughout |
| §35 precedence; §36 matrices; §38 20.3 FAQ | counter authority, automatic priority advance, Pass vs decline | `counterActions`, `settle` |

Parts V (Combos, Ultras, Sudden Death, Voltage, Exile), VIII (modules) and suit-specific codex text were read and are **disabled** in First Contact (§27 15.1, §34 22.2).

## Interpretation decisions

Each decision is the safest reading that keeps outcomes faithful; items marked **ruling requested** change outcomes and await Deffy.

| ID | Question | Decision | Reason |
|---|---|---|---|
| D-1 | §15.3 table says "only generic rank effects explicitly enabled below", but §15.7 introduces its list with "Examples:" and states the general rule "generic rank text remains legal only when it does not depend on a disabled system". | Apply the general rule. Enabled: Ace counter/Purge(mode 2)/Anchor, 2 Quick, 3 (all generic), 4 Clear + Natural, 5 Recycle, 6 Dig, 7 + trigger, 8 counter + bonus, 9 Tap/Goal/Anchor, J Disrupt/Attach, Q Anchor, K counter/Anchor, RJ modes, BJ score/Board Lock. **Ruling requested.** | Matches Deffy's continuation brief (9 Anchor, King Anchor, "applicable counters"). |
| D-2 | A♠ and K♠ have suit-specific replacement text; suit abilities are disabled. | A♠ and K♠ use the generic Ace/King text. | The replacement is itself suit-specific and disabled; generic rank text does not depend on a disabled system. Same reading as 3♠/4♠/6♠/7♠ using generic text. |
| D-3 | 2 Solo Wild copies a *same-suit* rank 3–7 Base effect. | Disabled. **Ruling requested.** | §27 15.1: suits exist only "for identity and equal-rank Scuttle comparison"; the wild family's primary use (Supers) is disabled. |
| D-4 | "Play for Points normally does not use the stack", yet J Disrupt responds to *any* Mini-Turn Action declaration. | Draw and Play-for-Points declarations wait in a response window as an uncounterable `action` object (no counter has authority over it). | Required for J Disrupt; no counter or effect gains power from it. |
| D-5 | Tapped PR cards "have no active PR text" (§9). | Tapped A/5/RJ/BJ lose Scuttle/Jack immunity; tapped 4/8 lose Effect-target immunity. | Literal §9; tap only lasts until the controller's Start in First Contact. |
| D-6 | "Original owner" (Attachment restoration, Purge) with one shared deck. | The player under whose control the card entered OTT. | Only meaningful owner in a shared-deck game. |
| D-7 | Draw with an empty DP while Exhausted is *not* active (DP emptied mid-turn). | Draw remains declarable and draws nothing. | §22 10.2 forbids Draw only while Exhausted is active; otherwise the player could have no legal Action. |
| D-8 | 3 Raid "presents up to 3" / discard "up to 2" with "as many as possible". | Opponent presents/discards min(requested, hand size), choosing which. | The "as many as possible" sentence fixes the count. |
| D-9 | 8 Scuttle Bonus timing and GY order. | Part of the Scuttle resolution; target then source enter GY in that order, then the player takes top (the 8) or bottom. | §19 Result lists target → GY, source → GY. |
| D-10 | Generated Topdeck plays in First Contact. | Score, or an ordinary (🛠/Anchor/Attachment) mode of that card; only a physical 7 may recurse; Quick/Instant timings are not generated. Parent 7 goes to GY only after the child play and its triggers finish. | §26 Generated/Recursive Topdeck Plays; Supers/Combos disabled; Board Lock open-state rule. |
| D-11 | Revealed-Until-Start is disabled. | Cards taken into hand (Raid, Anchor Ace, Seven) enter hidden; public history keeps the legitimately revealed fact. | §27 15.3. |
| D-12 | Automatic priority advance (§38 20.3) reveals that a waiting player holds a response. | Implemented as written. | Canonical v4.1.2 behaviour; noted as a rules-mandated information signal. |
| D-13 | Jack Attachment counter class. | An Effect play (Ace-counterable); not an Anchor Play (King cannot counter). | Glossary: Anchor Play places a card "as an Anchor"; Attachments are distinct (§26 J♠ "Attachments … ineligible" as Anchors). |

No outcome-changing contradiction blocks play; D-1 and D-3 are flagged for confirmation.

## Lessons (canonical scenarios)

| Lesson | Rule refs | Teaching constraint |
|---|---|---|
| orientation | §3, §27 15.4 | observation tasks only; no Actions |
| draw-action | §27 15.3/15.6, §4.3 | learner's Action limited to Draw |
| score-victory | §1, §4.5, §8 | Play for Points only |
| generic-effect | §26 J, §26 4/A PR immunity, §17 | Jack Attachment only; immune targets never offered |
| guard-scuttle | §13, §19, §16.4 | Scuttle only |
| response-counter | §6, §7, §26 8/A | scripted opponent Eight; **teaching foreknowledge** announced |
| board-lock | §26 BJ | Board Lock, score, end |

All lessons run on the real engine from fixed positions (`packages/intrilex/lessons.ts`), are complete-by-predicate over engine events, and are covered by `tests/lessons.test.ts` and `e2e/learn.spec.ts`.

## Core sandbox

The Core template reproduces §2–3: random Player A (5 cards) and B (6), Swap Bar 2 face-down + 1 face-up after the hands, Goals 21, PR/ER per player, DP, GY, Exile, plus manual counters (Secured PR, Mini-Turns, Exhaust, Board Lock) and markers (Tapped, Aegis, Revealed, Exile-Bound, Jacked, Disrupted, Skip). Everything after setup is manual; the UI states this on every Core view.

The rulebook fixes the Swap Bar's initial counts (§2, §21.3) but not their positions; the rules owner directs the face-up card to sit in the middle slot, flanked by the two face-down cards (Slot 1 down · Slot 2 up · Slot 3 down). Engine setup and the Core template both use this arrangement.

## Full rules-assisted audit — September 29, 2026

The separate `intrilex-full` profile targets standard two-player Core (§2, Parts I–VI), with optional modules disabled (Part VIII introduction). The full source-family checklist, declaration/resolution/projection seams, and verification boundary are in [INTRILEX_FULL_AUDIT.md](INTRILEX_FULL_AUDIT.md). That checklist is a requirements audit; it does not certify implementation coverage. See the latest `STATUS.md` for actual executed gates.

**FULL-R1 (explicit Deffy ruling, September 29, 2026):** Each Five has a separate optional Exile-rummage mode costing one Mini-Turn, taking exactly one card from its suit-permitted Exile range (§25 14.3, §26 Five) into hand as Revealed-Until-Start. This supplies the activation grant omitted by the book's conditional phrasing and leaves normal Recycle available. Diamonds requires at least five Exile cards; an empty access range has no fallback. This ruling supersedes the missing-grant ambiguity only; the canonical source file remains unchanged.

Full coverage must preserve the codex's explicit counter classes: Court and Marriage are multi-card **Anchor** plays, directly counterable by K♠; Ace-family multi-card authority applies to eligible **Effect** plays. Full Solo Wild is explicitly enabled by §26 Two; the existing D-3 question concerns First Contact only.

**Generated/composite resolution semantics (implemented September 29, 2026):**

- A generated card with no legal declaration is Scrapped to GY (§26 "Scrapping Generated Cards"); a Draw & Cast card may only declare a generated *effect* mode — no scoring, no composite declaration costs.
- Composite and cost sources (`cardIds`/`targetIds`, including Wild-4's discard) are committed from hand at declaration, ride on the stack item, and are all Scrapped to GY on resolve, counter or fizzle. A generated card is detached from its lingering zone (hand after Draw & Cast, GY after Super-5 mill, Swap Bar after Peek) while held by its choice, so no card is ever in two zones.
- ⭐8 Absolute Scuttle ignores rank, suit and ordinary Scuttle immunity; 8♠ Free Scuttle ignores rank and suit only; both still respect Aegis (§26). The Eight Scuttle GY bonus applies only to a successful *ordinary* 8 Scuttle (§26 "8 Scuttle Bonus").
- Stack items carry `tier` (`super`/`ultra`/`sudden`) and Royal-Shield `shield`, so Ace/King counter authority matches §9.4/§16.1: only ⭐A answers an Ultra. The one-Ultra-per-FT limit is consumed at declaration even when countered (§9.4); A♠ Exile Counter sends countered sources to Exile (§26 A♠); a countered 3 Red Ultra returns the bottom GY card to hand (§9.4).
- ⭐2 Hold keeps the taken card OTT under its new controller, tapped (`tapUntil: 'hold'`) until that controller's next Start Phase, where it untaps and may cast one legal effect for free as a generated child play. K♠ Wild Sovereignty is Wild-Exile-Bound; 10♦ Mimic consumes the Rank-10 play and resolves the copied Super with the 10 Exile-Bound.
