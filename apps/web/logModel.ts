/**
 * Presentation model for the "What happened?" game log.
 *
 * The rules engine records `history` as prose strings (see `log()` in packages/intrilex/engine.ts);
 * the structured `events` stream covers only a subset of those lines, so presentation is derived from
 * the text. Classification uses an ordered pattern table — first match wins — so embedding quotes such
 * as `Countered: Scuttle 5♠ with 9♥.` keep the semantics of the outermost event. Unknown lines degrade
 * to `system` and render unchanged.
 */

export type LogKind =
  | 'turn'      // "Turn N: Player M." — rendered as a divider, not a sentence
  | 'setup'     // game creation / fixture notices
  | 'win'       // victory, draw, tiebreak conclusion
  | 'denied'    // countered or fizzled plays
  | 'counter'   // counter declarations ("… · Counter “…”", Anchor Ace sacrifices)
  | 'scuttle'   // Scuttle attacks (ordinary, free, absolute)
  | 'major'     // rare rule moments: Board Lock, Sudden Death, Red Joker, Ultra, Exhausted, Total Clear
  | 'steal'     // commandeer / stack theft / row exchanges / returns to hand
  | 'score'     // Point Row entries, scoring, Goal changes
  | 'exile'     // Exile zone movement
  | 'warn'      // disruption, skips, forced pass, nothing-happened notices
  | 'phase'     // phase transitions inside a turn
  | 'effect'    // declared effects and resolution notices
  | 'draw'      // draws, digs, GY recovery draws
  | 'reveal'    // reveals, presents, peeks, reordering the Draw Pile
  | 'discard'   // discards, scraps, mills, clears
  | 'anchor'    // Enduring Row entries, Jacks, anchors
  | 'action'    // any other player-attributed line
  | 'system';   // unattributed / unrecognised line

/** Ordered — the first matching rule assigns the kind. */
const KIND_RULES: readonly (readonly [RegExp, LogKind])[] = [
  [/^Turn \d+: /, 'turn'],
  [/^(?:First Contact|Intrilex Full):|^Teaching position loaded|^Table set up/, 'setup'],
  [/\bwins\b|game is drawn/, 'win'],
  [/^Countered:|fizzles?\b/, 'denied'],
  [/· Counter “|to counter|Sacrifice Anchor Ace/, 'counter'],
  [/is disrupted|skips |forced|Nothing could be cleared|no legal|has no Exile|no face-down|could not/, 'warn'],
  [/Board Lock|Sudden Death|Red Joker|Total Clear|Ultra|exchange hands|Exhausted (?:begins|ends|counter)/, 'major'],
  [/[Ss]cuttle/, 'scuttle'],
  [/steals|commandeers|exchanges|takes the countered|returns to .+'s hand/, 'steal'],
  [/Exile|Exiled/, 'exile'],
  [/begins the \w+ Phase/, 'phase'],
  [/casts|shields|is tapped|is bounced|resolves\.|^Player \d+ \(generated\):|^Player \d+:/, 'effect'],
  [/for Points|Point Row \(|enters .*Point Row|\bscores\b|secured|Goal (?:rises|falls)/, 'score'],
  [/\bdraws?\b|\bdigs\b|declares Draw/, 'draw'],
  [/reveals?|revealed|presents|Peek|snapshot|reorders/, 'reveal'],
  [/discards?|Scrapped|scraps|Milled|milled|mills\b|Cleared|purges?/, 'discard'],
  [/Enduring Row|anchors |Jacks |Anchor/, 'anchor'],
  [/^Player \d/, 'action'],
];

export type LogToken =
  | { type: 'text'; text: string }
  | { type: 'player'; text: string; seat: number }
  | { type: 'card'; text: string; tone: 'red' | 'black' | 'joker-red' | 'joker-black' }
  | { type: 'value'; text: string };

/** Ordered alternation: players before numbers, cards before numbers; first match at each index wins. */
const TOKEN_RE = /Player [12]\b|Red Joker|Black Joker|(?:A|[2-9]|10|J|Q|K)[♣♦♥♠]|\d+/g;
const TURN_RE = /^Turn (\d+): Player (\d+)\.$/;

export function classifyLogLine(text: string): LogKind {
  for (const [re, kind] of KIND_RULES) if (re.test(text)) return kind;
  return 'system';
}

function tokenFor(match: string): LogToken {
  const pm = /^Player ([12])/.exec(match);
  if (pm) return { type: 'player', text: match, seat: Number(pm[1]) - 1 };
  if (match === 'Red Joker') return { type: 'card', text: match, tone: 'joker-red' };
  if (match === 'Black Joker') return { type: 'card', text: match, tone: 'joker-black' };
  if (/^\d+$/.test(match)) return { type: 'value', text: match };
  const suit = match.at(-1)!;
  return { type: 'card', text: match, tone: suit === '♥' || suit === '♦' ? 'red' : 'black' };
}

/** Splits a history line into text/player/card/value spans. Concatenating token text reproduces the input. */
export function tokenizeLogLine(text: string): LogToken[] {
  const tokens: LogToken[] = [];
  let cursor = 0;
  for (const m of text.matchAll(TOKEN_RE)) {
    const i = m.index;
    if (i > cursor) tokens.push({ type: 'text', text: text.slice(cursor, i) });
    tokens.push(tokenFor(m[0]));
    cursor = i + m[0].length;
  }
  if (cursor < text.length || !tokens.length) tokens.push({ type: 'text', text: text.slice(cursor) });
  return tokens;
}

export interface ParsedLogEntry {
  text: string; kind: LogKind; tokens: LogToken[];
  /** 0-based seat of the leading `Player N` token, when the line opens with one. */
  actor: number | null;
  /** Turn number when kind === 'turn'. */
  turn: number | null;
}

export function parseLogEntry(text: string): ParsedLogEntry {
  const kind = classifyLogLine(text);
  const turn = kind === 'turn' ? TURN_RE.exec(text) : null;
  const tokens = tokenizeLogLine(text);
  const lead = /^Player ([12])/.exec(text);
  return { text, kind, tokens, actor: turn ? Number(turn[2]) - 1 : lead ? Number(lead[1]) - 1 : null, turn: turn ? Number(turn[1]) : null };
}

export const LOG_STYLIZED_KEY = 'tabletop.logStylized';
