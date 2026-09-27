/**
 * Stable rule identifiers for First Contact (Intrilex v4.3.1, SHA-256 1CFBD837…BCF8).
 * `ref` cites the rulebook heading; `summary` is original explanatory prose, not rulebook text.
 */
export interface RuleEntry { id: string; ref: string; title: string; summary: string }

const r = (id: string, ref: string, title: string, summary: string): RuleEntry => ({ id, ref, title, summary });

export const RULES: Record<string, RuleEntry> = Object.fromEntries([
  r('FC.setup', '§27 15.4; §2', 'First Contact setup', '54 cards shuffled into DP. Player A is random, receives 5 cards and goes first; Player B receives 6. Both Goals are 15. No Swap Bar or Exile.'),
  r('FC.disabled', '§27 15.1–15.2', 'Disabled systems', 'Swap Bar, Combos, Supers, Ultras, Sudden Death, Aegis, Royal Shield, Exile, reveal markers, modules and every suit-specific ability are off. Suits still break equal-rank Scuttles. Cards that would go to Exile go to GY.'),
  r('FC.start', '§27 15.5; §4.1', 'Start Phase', 'Reset per-turn limits, begin Exhausted if DP is empty, then untap every card the active player controls.'),
  r('FC.miniturn', '§27 15.3, 15.6', 'One Action per Full Turn', 'First Contact gives exactly one Mini-Turn: Draw, Play for Points, Play for Effect, or Scuttle. Extra Mini-Turn grants are ignored.'),
  r('FC.end', '§4.5; §1', 'End Phase victory', 'Only at the end of your own completed Full Turn: if your Secured PR Points are at least your Goal, you win. Then Board Lock and Exhausted timers tick.'),
  r('action.draw', '§4.3 (1)', 'Draw', 'Draw 1 from DP; if your hand was empty when you declared Draw, draw 2.'),
  r('action.score', '§4.3 (3); §8', 'Play for Points', 'Put a hand card face-up into your Point Row for its Point value.'),
  r('action.effect', '§4.3 (4); §27 15.7', 'Play for Effect', 'Use one enabled generic rank effect. It uses the stack and can be answered.'),
  r('action.scuttle', '§19', 'Scuttle', 'Spend your Action to destroy an enemy PR card with a higher rank, or the same rank and a higher suit (♣<♦<♥<♠). Guard does not stop Scuttle; A, 5 and Jokers in PR are immune.'),
  r('exhausted.pass', '§22 10.2; §27 15.6', 'Forced Exhausted Pass', 'Only when Exhausted is active, DP is empty and no other Action is legal.'),
  r('exhausted', '§22 10.1–10.4', 'Exhausted', 'Starts at a Start Phase with an empty DP (counter 3), ticks after every completed Full Turn, ends if cards re-enter DP. At 0: most untapped Anchors, then Secured Points, else draw.'),
  r('stack', '§6', 'Stack and priority', 'Declared plays wait on the stack. Players alternate responses; when both decline in a row the newest item resolves first (last in, first out).'),
  r('decline', '§6; §38 20.3', 'Decline a response', 'Declining is not an Action and never spends your Mini-Turn.'),
  r('fizzle', '§5; §6', 'Fizzle', 'A play legal when declared but whose single target is illegal on resolution fizzles; its card still goes to GY.'),
  r('counter', '§7', 'Counters', 'A counter negates a pending play; the countered card goes to GY and nothing is refunded.'),
  r('guard', '§13', 'Guard', 'An untapped Queen in your ER protects your other OTT cards from enemy single-target Effects. It never blocks Scuttle or row-wide effects.'),
  r('attachments', '§12', 'Attachments', 'A Jack must stay attached to a legal host. If either leaves, the Jack is Scrapped and the host returns to its owner.'),
  r('tap', '§9; §27 15.3', 'Tapping', 'Tapped PR cards score 0 and have no active PR text. In First Contact every card untaps at its controller\u2019s Start.'),
  r('A.counter', '§26 ⦗A⦘ Instant — Base Counter', 'Ace counter', 'Counter a pending Effect play or counter. Not Anchor or Goal plays, Scuttle, triggers, Board Lock, or Red Joker Shuffle Reset.'),
  r('A.purge', '§26 ⦗A⦘ 🛠 Purge', 'Ace Purge', 'With no Aegis in First Contact: bounce one Vulnerable enemy Anchor from ER to its owner\u2019s hand.'),
  r('A.anchor', '§26 ⦗A⦘ ⚓ Anchor Counter', 'Anchor Ace', 'Place the Ace in ER. Later, sacrifice it to counter an opponent\u2019s play with Base Ace authority and take one countered card into hand.'),
  r('2.quick', '§26 ⦗2⦘ Quick', 'Two Quick', 'During your own turn: score this 2, then the opponent discards 1 of their choice. One resolved per turn; only one pending.'),
  r('3.base', '§26 ⦗3⦘ 🛠', 'Three', 'Choose: opponent presents up to 3 hand cards and you take 1; opponent discards up to 2; or bounce a Vulnerable OTT card to the top of DP.'),
  r('3.instant', '§26 ⦗3⦘ Instant — Bounce', 'Three Instant bounce', 'In a response window: bounce a Vulnerable OTT card to the top or bottom of DP.'),
  r('4.clear', '§26 ⦗4⦘ 🛠 Row Clear', 'Four Row Clear', 'Clear every enemy PR card, or every enemy Anchor in ER. Row-wide: Guard does not apply.'),
  r('4.natural', '§26 ⦗4⦘ Quick — Natural', 'Four Natural', 'During your own turn: look at the top 4 of DP, reorder them, then optionally draw the top card.'),
  r('4.immunity', '§26 ⦗4⦘ PR Immunity', 'Four in PR', 'A 4 scored in PR cannot be targeted by Effects but can be Scuttled and cleared.'),
  r('5.recycle', '§26 ⦗5⦘ 🛠 Recycle Line', 'Five Recycle', 'Mill up to 2 from DP, take any 1 GY card into hand, then draw the bottom (oldest) GY card. Exile branches are unavailable.'),
  r('6.dig', '§26 ⦗6⦘ 🛠 Dig', 'Six Dig', 'Draw 3; either return one drawn card to the top or bottom of DP, or keep all and discard one hand card.'),
  r('7.base', '§26 ⦗7⦘ 🛠', 'Seven Topdeck Casting', 'Reveal the top 2: take one into hand, then play the other immediately for Points or a legal effect.'),
  r('7.trigger', '§26 ⦗7⦘ Scoring Trigger', 'Seven scoring trigger', 'When a 7 is scored: reveal the top 2, take one into hand, return the other to the top of DP.'),
  r('8.counter', '§26 ⦗8⦘ Instant — Scuttle Counter', 'Eight Scuttle Counter', 'Counter a pending Scuttle. The Scuttling card goes to GY; the target stays.'),
  r('8.bonus', '§26 ⦗8⦘ Scuttle Bonus', 'Eight Scuttle bonus', 'After a successful Scuttle with an 8, draw the top or bottom card of GY.'),
  r('8.immunity', '§26 ⦗8⦘ PR Immunity', 'Eight in PR', 'An 8 scored in PR cannot be targeted by Effects but can be Scuttled and cleared.'),
  r('9.tap', '§26 ⦗9⦘ Instant — Tap', 'Nine Tap', 'In a response window: tap one opponent PR card.'),
  r('9.goal', '§26 ⦗9⦘ Instant — Goal Shift', 'Nine Goal Shift', 'In a response window: raise the opponent\u2019s Goal by 3, or by 5 and then discard 1.'),
  r('9.anchor', '§26 ⦗9⦘ ⚓ Anchor', 'Nine Anchor', 'Place the 9 in ER, reveal the opponent\u2019s hand; they discard 1. Only one Nine Anchor at a time.'),
  r('J.disrupt', '§26 ⦗J⦘ Instant — Disrupt', 'Jack Disrupt', 'Respond to an opponent\u2019s Mini-Turn Action: record that Action type as disrupted for the turn and draw 1. The Action continues.'),
  r('J.attach', '§26 ⦗J⦘ ⚓ Attachment — Jack PR', 'Jack Attachment', 'Attach to a Vulnerable enemy PR card: you control it, it scores for you with +1. Aces and Jokers in PR cannot be Jacked.'),
  r('Q.anchor', '§26 ⦗Q⦘ Queen in ER', 'Queen Anchor', 'Place the Queen in ER as an Anchor. While untapped it provides Guard.'),
  r('K.counter', '§26 ⦗K⦘ Instant — Counter Anchor or Goal', 'King counter', 'Counter a pending single-card Anchor play or Goal-Mod play.'),
  r('K.anchor', '§26 ⦗K⦘ ⚓ Anchor', 'King Anchor', 'Place the King in ER as an Anchor.'),
  r('RJ.modes', '§26 ⦗RJ⦘', 'Red Joker', 'Choose Hand Swap, Self Reset (+3), Opponent Attack (−2), or Shuffle Reset (DP+GY, draw 2; only ⭐A could counter it).'),
  r('BJ.score', '§26 ⦗BJ⦘ Scoring', 'Black Joker score', 'Scores 11. Cannot be Scuttled or Jacked in PR. Its Exile Recycle rider is disabled in First Contact.'),
  r('BJ.lock', '§26 ⦗BJ⦘ Quick — Board Lock', 'Board Lock', 'During your own turn with an empty stack: for this and two subsequent completed Full Turns, nobody may declare non-counter Effects or Scuttle. Only ⭐A (absent in First Contact) can counter it.'),
  r('immunity.scuttle', '§16.4; §26', 'Scuttle immunity', 'Untapped A, 5, Red Joker and Black Joker in PR cannot be Scuttled.'),
].map(e => [e.id, e]));

export function ruleText(id: string): string {
  const e = RULES[id];
  return e ? `${e.title} (${e.ref})` : id;
}
