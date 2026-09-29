import { useEffect, useRef, useState, type KeyboardEvent as RKeyboardEvent, type PointerEvent as RPointerEvent } from 'react';
import { SOCIAL_LIMITS, type ChatEntry, type ChatPart, type RoomView } from '../../packages/protocol/index.js';
import { RULES } from '../../packages/intrilex/rules.js';
import { Modal } from './common.js';
import { useRoomSocial, type RoomSocialStore } from './useRoomSocial.js';

export interface ChatPanelProps { view: RoomView; social: RoomSocialStore; sendChat: (parts: ChatPart[], replyToId?: string) => void; retryChat: (requestId: string, newMessage?: boolean) => void; connected: boolean }
function summary(entry: ChatEntry) { return entry.kind === 'system' ? (entry.code === 'reset' ? 'Table reset' : 'Game completed') : entry.parts.map(p => p.type === 'text' ? p.text : p.type === 'mention' ? `@${p.nickname}` : p.title).join(' '); }

export default function ChatPanel({ view, social, sendChat, retryChat, connected }: ChatPanelProps) {
  const state = useRoomSocial(social);
  const [mobile, setMobile] = useState(() => matchMedia('(max-width: 860px)').matches);
  const [rule, setRule] = useState<string | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [visible, setVisible] = useState(() => document.visibilityState === 'visible');
  const list = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const dock = useRef<HTMLElement>(null);
  const grab = useRef({ dx: 0, dy: 0 });
  const composition = useRef(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const newest = state.entries.at(-1)?.id;
  const open = !state.collapsed;
  const clampDock = (x: number, y: number) => {
    const w = dock.current?.offsetWidth ?? 380, h = dock.current?.offsetHeight ?? 320;
    return { x: Math.min(Math.max(0, x), Math.max(0, window.innerWidth - w)), y: Math.min(Math.max(0, y), Math.max(0, window.innerHeight - h)) };
  };
  useEffect(() => {
    const clamp = () => setPos(p => (p ? clampDock(p.x, p.y) : p));
    window.addEventListener('resize', clamp); return () => window.removeEventListener('resize', clamp);
  }, []);
  const dragStart = (e: RPointerEvent<HTMLElement>) => {
    const t = e.target as HTMLElement;
    if (e.button !== 0 || (t.closest('button') && !t.closest('.chat-grip'))) return;
    const rect = dock.current?.getBoundingClientRect(); if (!rect) return;
    grab.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    setPos({ x: rect.left, y: rect.top }); setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const dragMove = (e: RPointerEvent<HTMLElement>) => { if (dragging) setPos(clampDock(e.clientX - grab.current.dx, e.clientY - grab.current.dy)); };
  const dragStop = () => setDragging(false);
  const gripKeys = (e: RKeyboardEvent<HTMLElement>) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPos(null); return; }
    const step = e.shiftKey ? 64 : 16;
    const deltas: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const d = deltas[e.key];
    if (!d || !dock.current) return;
    e.preventDefault();
    const rect = dock.current.getBoundingClientRect();
    setPos(clampDock((pos?.x ?? rect.left) + d[0], (pos?.y ?? rect.top) + d[1]));
  };
  useEffect(() => {
    const query = matchMedia('(max-width: 860px)'); const update = () => setMobile(query.matches);
    query.addEventListener('change', update); return () => query.removeEventListener('change', update);
  }, []);
  useEffect(() => { const update = () => setVisible(document.visibilityState === 'visible'); document.addEventListener('visibilitychange', update); return () => document.removeEventListener('visibilitychange', update); }, []);
  useEffect(() => {
    if (open && atBottom && visible && !rule) { if (list.current) list.current.scrollTop = list.current.scrollHeight; social.markRead(); }
  }, [newest, open, atBottom, visible, rule, social]);
  const collapse = () => { social.setCollapsed(true); trigger.current?.focus(); };
  const send = () => {
    if (!connected || view.you.readOnly || composition.current || state.pending.some(p => p.status === 'pending') || (!state.draft.trim() && !state.chips.length)) return;
    const parts: ChatPart[] = [...(state.draft.trim() ? [{ type: 'text' as const, text: state.draft }] : []), ...state.chips];
    sendChat(parts, state.replyToId);
    // Keep the draft until acceptance; failed and uncertain submissions remain editable.
  };
  const chipLabel = (p: ChatPart) => p.type === 'mention' ? `@${view.participants.find(member => member.id === p.participantId)?.nickname ?? 'Participant'}` : p.type === 'rule' ? RULES[p.ruleId]?.title ?? 'Rule' : p.text;
  const content = <div className="chat-content">
    <p className="chat-retention">Room chat is temporary: up to 100 entries, cleared after server restart or one hour of inactivity. Retry receipts last up to 10 minutes or 200 requests; a retry after eviction may duplicate a message.</p>
    {state.epochChanged && <p role="status">Earlier chat is unavailable: this room has a new chat session.</p>}
    {!connected && <p role="status">Disconnected. Your draft is kept; reconnect before sending or retrying.</p>}
    <div className="chat-messages" ref={list} aria-label="Room chat messages" onScroll={() => { const el = list.current; if (el) setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 30); }}>
      {!state.entries.length && <p className="muted">No messages yet. Say hello to the table.</p>}
      {state.entries.map(entry => <article className={`chat-entry ${entry.kind === 'system' ? 'chat-system' : ''}`} key={entry.id}>
        {entry.kind === 'system' ? <><p>{summary(entry)}</p>{!view.you.readOnly && <footer><button type="button" onClick={() => social.setReply(entry.id)}>Reply</button></footer>}</> : <>
          <header><strong>{entry.author.nickname}</strong><time dateTime={entry.timestamp}>{new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></header>
          {state.muted.includes(entry.author.participantId) ? <p className="muted">Message hidden from a locally muted participant.</p> : <>
            {entry.replyToId && <blockquote>{(() => { const parent = state.entries.find(e => e.id === entry.replyToId); return parent && !(parent.kind === 'user' && state.muted.includes(parent.author.participantId)) ? summary(parent).slice(0, 150) : 'Earlier message unavailable'; })()}</blockquote>}
            <p className="chat-body">{entry.parts.map((part, index) => part.type === 'text' ? <span key={index}>{part.text}</span> : part.type === 'mention' ? <span className="chat-mention" key={index}> @{part.nickname} </span> : <button type="button" className="chat-chip" key={index} onClick={() => { if (Object.hasOwn(RULES, part.ruleId)) setRule(part.ruleId); }}>{part.title}</button>)}</p>
          </>}
          <footer>{!view.you.readOnly && <button type="button" onClick={() => social.setReply(entry.id)}>Reply</button>}{entry.author.participantId !== view.you.id && <button type="button" onClick={() => social.setMuted(entry.author.participantId, !state.muted.includes(entry.author.participantId))}>{state.muted.includes(entry.author.participantId) ? 'Unmute' : 'Mute'}</button>}</footer>
        </>}
      </article>)}
    </div>
    {(!atBottom || state.unread > 0) && <button type="button" className="chat-jump" onClick={() => { if (list.current) list.current.scrollTop = list.current.scrollHeight; setAtBottom(true); social.markRead(); }}>Jump to latest{state.unread ? ` (${state.unread} unread)` : ''}</button>}
    {state.pending.map(p => <div className="chat-delivery" key={p.request.requestId}><span>{p.status === 'pending' ? 'Sending…' : p.status === 'sent' ? 'Sent (not in the currently displayed history).' : p.status === 'uncertain' ? 'Delivery uncertain.' : 'Message failed.'}</span><p className="chat-body">{p.request.parts.map(chipLabel).join(' ').slice(0, 160)}</p>{p.error && <p>{p.error}</p>}{['failed', 'uncertain'].includes(p.status) && <button type="button" disabled={!connected || view.you.readOnly} onClick={() => retryChat(p.request.requestId, Date.now() - p.createdAt > SOCIAL_LIMITS.retryMs)}>{Date.now() - p.createdAt > SOCIAL_LIMITS.retryMs ? 'Send as new message (may duplicate)' : 'Retry same message'}</button>}</div>)}
    {view.you.readOnly ? <p className="chat-readonly">Read-only spectator — you can read room chat.</p> : <form className="chat-composer" onSubmit={e => { e.preventDefault(); send(); }}>
      {state.replyToId && <div className="chat-replying">Replying to {(() => { const parent = state.entries.find(e => e.id === state.replyToId); return parent ? summary(parent).slice(0, 70) : 'an unavailable message'; })()}<button type="button" aria-label="Cancel reply" onClick={() => social.setReply()}>×</button></div>}
      <label htmlFor="room-chat-draft">Message the room</label><textarea id="room-chat-draft" rows={3} value={state.draft} onChange={e => social.setDraft(e.target.value)} onCompositionStart={() => { composition.current = true; }} onCompositionEnd={() => { composition.current = false; }} onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !composition.current) { e.preventDefault(); send(); } }} />
      <div className="chat-chips">{state.chips.map((p, i) => <button type="button" className="chat-chip" key={i} aria-label={`Remove ${chipLabel(p)}`} onClick={() => social.setChips(state.chips.filter((_, index) => index !== i))}>{chipLabel(p)} ×</button>)}</div>
      <div className="chat-composer-tools"><label>Mention<select aria-label="Mention participant" value="" onChange={e => { if (e.target.value && state.chips.filter(p => p.type === 'mention').length < 8 && !state.chips.some(p => p.type === 'mention' && p.participantId === e.target.value)) social.setChips([...state.chips, { type: 'mention', participantId: e.target.value }]); }}><option value="">Choose participant</option>{view.participants.map(p => <option key={p.id} value={p.id}>{p.nickname}{p.seat === null ? ' (spectating)' : ` (seat ${p.seat + 1})`}</option>)}</select></label>
        <label>Rule<select aria-label="Attach rules reference" value="" onChange={e => { if (Object.hasOwn(RULES, e.target.value) && state.chips.filter(p => p.type === 'rule').length < 4) social.setChips([...state.chips, { type: 'rule', ruleId: e.target.value }]); }}><option value="">Choose rule</option>{Object.values(RULES).map(r => <option key={r.id} value={r.id}>{r.title}</option>)}</select></label></div>
      <small>Enter sends · Shift+Enter starts a new line · Plain text only</small><button type="submit" disabled={!connected || state.pending.some(p => p.status === 'pending') || (!state.draft.trim() && !state.chips.length)}>Send message</button>
    </form>}
    {state.muted.length > 0 && <details><summary>Locally muted participants ({state.muted.length})</summary>{state.muted.map(id => <button type="button" key={id} onClick={() => social.setMuted(id, false)}>Unmute {view.participants.find(p => p.id === id)?.nickname ?? 'former participant'}</button>)}</details>}
  </div>;
  const selectedRule = rule && Object.hasOwn(RULES, rule) ? RULES[rule] : null;
  const ruleContent = selectedRule && <><p>{selectedRule.summary}</p><small>{selectedRule.ref}</small></>;
  return <>
    <button type="button" ref={trigger} className="chat-toggle" aria-expanded={open} aria-controls="room-chat" onClick={() => social.setCollapsed(!state.collapsed)}>Room chat{state.unread ? ` (${state.unread} unread)` : ''}</button>
    {open && (mobile ? <Modal title={selectedRule?.title ?? 'Room chat'} onClose={() => { if (selectedRule) setRule(null); else social.setCollapsed(true); }}>
      <div id="room-chat">{selectedRule ? <>{ruleContent}<p><button type="button" autoFocus onClick={() => setRule(null)}>Back to room chat</button></p></> : content}</div>
    </Modal> : <aside ref={dock} className={dragging ? 'chat-dock chat-dragging' : 'chat-dock'} id="room-chat" aria-label="Room chat" style={pos ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' } : undefined}>
      <header className="chat-head" title="Drag to move" onPointerDown={dragStart} onPointerMove={dragMove} onPointerUp={dragStop} onPointerCancel={dragStop} onLostPointerCapture={dragStop}>
        <span className="chat-head-title"><button type="button" className="chat-grip" aria-label="Move room chat. Drag the title bar, or use the arrow keys. Enter docks it in the corner." aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown Enter" onKeyDown={gripKeys}>⠿</button><h2>Room chat</h2></span>
        <button type="button" className="icon-btn" aria-label="Collapse room chat" onClick={collapse}>×</button>
      </header>{content}</aside>)}
    {selectedRule && !(mobile && open) && <Modal title={selectedRule.title} onClose={() => setRule(null)}>{ruleContent}</Modal>}
  </>;
}
