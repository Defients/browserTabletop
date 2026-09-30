import { useEffect, useMemo, useRef, useState } from 'react';
import { loadLocal, saveLocal } from './common.js';
import { LOG_STYLIZED_KEY, parseLogEntry, type LogKind, type LogToken, type ParsedLogEntry } from './logModel.js';

export interface GameLogProps {
  /** Projected `GameView.history` lines (append-only, newest last). */
  history: string[];
  /** Mirrors the previous `open={hints}` behaviour of the panel. */
  open?: boolean;
  /** Seat (0-based) → display name, matching the board's own labelling. */
  nameOf: (seat: number) => string;
}

const Tokens = ({ tokens, nameOf }: { tokens: LogToken[]; nameOf: (seat: number) => string }) => (
  <>
    {tokens.map((t, i) => {
      switch (t.type) {
        case 'player': return <span key={i} className={`glog-p glog-p${t.seat}`}>{nameOf(t.seat)}</span>;
        case 'card': return <span key={i} className={`glog-card glog-card-${t.tone}`}>{t.text}</span>;
        case 'value': return <span key={i} className="glog-num">{t.text}</span>;
        default: return <span key={i}>{t.text}</span>;
      }
    })}
  </>
);

function Entry({ entry, nameOf }: { entry: ParsedLogEntry; nameOf: (seat: number) => string }) {
  if (entry.kind === 'turn') {
    return (
      <div className="glog-turn">
        <span className="glog-turn-label">Turn {entry.turn ?? '?'}</span>
        {entry.actor !== null && <span className={`glog-p glog-p${entry.actor}`}>{nameOf(entry.actor)}</span>}
      </div>
    );
  }
  return <span className="glog-text"><Tokens tokens={entry.tokens} nameOf={nameOf} /></span>;
}

/** HybriX "Game Log" tabs. Turn dividers and wins always render so the feed keeps its frame. */
type LogTab = 'all' | 'actions' | 'effects' | 'system';
const LOG_TABS: readonly { id: LogTab; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'actions', label: 'Actions' }, { id: 'effects', label: 'Effects' }, { id: 'system', label: 'System' },
];
const TAB_KINDS: Record<Exclude<LogTab, 'all'>, ReadonlySet<LogKind>> = {
  actions: new Set<LogKind>(['action', 'score', 'scuttle', 'draw', 'anchor', 'steal', 'exile', 'discard', 'counter']),
  effects: new Set<LogKind>(['effect', 'reveal', 'phase', 'warn', 'denied', 'major']),
  system: new Set<LogKind>(['setup', 'system']),
};
const ALWAYS: ReadonlySet<LogKind> = new Set<LogKind>(['turn', 'win']);

/**
 * The "Game Log" event feed. Chronological, pinned to the newest entry while the user stays at
 * the bottom; scrolling up releases the pin and a jump control offers the way back.
 */
export default function GameLog({ history, open = true, nameOf }: GameLogProps) {
  const [stylized, setStylized] = useState(() => loadLocal<boolean>(LOG_STYLIZED_KEY, true));
  const [tab, setTab] = useState<LogTab>('all');
  const [pinned, setPinned] = useState(true);
  const [unread, setUnread] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const prevCount = useRef(history.length);
  // Entries already present at mount render without the entrance treatment; only later arrivals animate.
  const baseline = useRef<number | null>(null);
  if (baseline.current === null) baseline.current = history.length;
  const baselineCount = baseline.current;

  const entries = useMemo(() => history.map(parseLogEntry), [history]);
  const shown = useMemo(() => (tab === 'all' ? entries : entries.filter(e => ALWAYS.has(e.kind) || TAB_KINDS[tab].has(e.kind))), [entries, tab]);

  const scrollToEnd = () => { const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight; };

  useEffect(() => { scrollToEnd(); }, []);
  useEffect(() => {
    const added = history.length - prevCount.current;
    prevCount.current = history.length;
    if (added === 0) return;
    if (added < 0) { pinnedRef.current = true; setPinned(true); setUnread(0); scrollToEnd(); return; }
    if (pinnedRef.current) scrollToEnd();
    else setUnread(u => u + added);
  }, [history.length]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    if (atBottom !== pinnedRef.current) { pinnedRef.current = atBottom; setPinned(atBottom); }
    if (atBottom && unread) setUnread(0);
  };

  const jump = () => { pinnedRef.current = true; setPinned(true); setUnread(0); scrollToEnd(); };
  const toggle = (v: boolean) => { setStylized(v); saveLocal(LOG_STYLIZED_KEY, v); };

  return (
    <details className={`fc-history glog ${stylized ? '' : 'is-plain'}`} open={open}
      onToggle={e => { if ((e.target as HTMLDetailsElement).open) scrollToEnd(); }}>
      <summary>Game Log{history.length > 0 && <span className="glog-count" aria-label={`${history.length} events`}>{history.length}</span>}</summary>
      <div className="glog-toolbar">
        <div className="glog-tabs" role="group" aria-label="Filter game log">
          {LOG_TABS.map(t => <button type="button" key={t.id} className={`glog-tab ${tab === t.id ? 'is-active' : ''}`} aria-pressed={tab === t.id} onClick={() => setTab(t.id)}>{t.label}</button>)}
        </div>
        <label className="glog-toggle" title="Use colors and emphasis to make game events easier to scan.">
          <input type="checkbox" checked={stylized} onChange={e => toggle(e.target.checked)} />
          Stylized Text
        </label>
      </div>
      <div className="glog-wrap">
        <div className="glog-scroll" role="log" aria-label="Game events" tabIndex={0} ref={scrollRef} onScroll={onScroll}>
          {shown.length ? (
            <ol className="glog-list">
              {shown.map((entry, i) => (
                <li key={i} className={`glog-item glog-k-${entry.kind}${stylized && i >= baselineCount ? ' is-new' : ''}`}>
                  {stylized ? <Entry entry={entry} nameOf={nameOf} /> : entry.kind === 'turn'
                    ? <div className="glog-turn"><span className="glog-turn-label">{entry.text}</span></div>
                    : entry.text}
                </li>
              ))}
            </ol>
          ) : <p className="glog-empty">Game events will appear here.</p>}
        </div>
        {!pinned && (
          <button type="button" className="glog-jump" onClick={jump}>
            {unread ? `↓ ${unread} new event${unread === 1 ? '' : 's'}` : '↓ Latest events'}
          </button>
        )}
      </div>
    </details>
  );
}
