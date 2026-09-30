import { createContext, useContext, useEffect, useRef, type ReactNode, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';

export const HeaderSlot = createContext<HTMLDivElement | null>(null);
/** Renders the current table/lesson context into the single app topbar instead of a second header row. */
export function HeaderContext({ children }: { children: ReactNode }) {
  const slot = useContext(HeaderSlot);
  return slot ? createPortal(children, slot) : null;
}

export function Modal({ title, children, onClose, wide = false, describedBy }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean; describedBy?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const d = ref.current!;
    if (!d.open) d.showModal();
    return () => { if (d.open) d.close(); previous?.focus?.(); };
  }, []);
  return (
    <dialog ref={ref} className={wide ? 'modal wide' : 'modal'} aria-labelledby="modal-title" aria-describedby={describedBy}
      onCancel={e => { e.preventDefault(); close.current(); }} onClick={e => { if (e.target === ref.current) close.current(); }}>
      <div className="modal-head"><h2 id="modal-title">{title}</h2><button type="button" className="icon-btn" onClick={() => close.current()} aria-label="Close dialog">×</button></div>
      <div className="modal-body">{children}</div>
    </dialog>
  );
}

const SUIT: Record<string, string> = { clubs: '♣', diamonds: '♦', hearts: '♥', spades: '♠', '♣': '♣', '♦': '♦', '♥': '♥', '♠': '♠' };
export const suitSymbol = (s?: string) => (s ? SUIT[s] ?? '' : '');
export const isRed = (rank?: string, suit?: string) => rank === 'RJ' || ['♥', '♦'].includes(suitSymbol(suit)) || suit === 'red';
export function cardName(c: { rank?: string; suit?: string }): string {
  if (!c.rank) return 'Face-down card';
  if (c.rank === 'RJ') return 'Red Joker';
  if (c.rank === 'BJ') return 'Black Joker';
  const sym = suitSymbol(c.suit);
  return sym ? `${c.rank}${sym}` : `${c.rank}${c.suit ? ` of ${c.suit}` : ''}`;
}

const SUIT_GLYPH = /([♣♦♥♠])/g;
export function suitSpans(text: string) {
  return text.split(SUIT_GLYPH).map((part, i) => (i % 2 ? <span key={i} className={part === '♥' || part === '♦' ? 'suit-red' : 'suit-black'}>{part}</span> : part));
}

export interface FaceProps {
  rank?: string; suit?: string; image?: string; tapped?: boolean; locked?: boolean; attached?: boolean; revealed?: boolean;
  selected?: boolean; size?: 'sm' | 'md' | 'lg'; extraLabel?: string; variant?: 'point-row';
  onClick?: () => void; onDoubleClick?: () => void; onKeyDown?: (e: ReactKeyboardEvent) => void; tabIndex?: number; highlight?: boolean;
}
/** A card face or back. Accessible names never include a face the viewer cannot see. */
export function CardFace({ rank, suit, image, tapped, locked, attached, revealed, selected, size = 'md', extraLabel, variant, onClick, onDoubleClick, onKeyDown, tabIndex, highlight }: FaceProps) {
  const hidden = !rank;
  const joker = rank === 'RJ' || rank === 'BJ';
  const label = [cardName({ rank, suit }), tapped && 'tapped', locked && 'locked', attached && 'attached', revealed && 'revealed to you', extraLabel].filter(Boolean).join(', ');
  const cls = ['card', `card-${size}`, variant === 'point-row' ? 'card-pr' : '', hidden ? 'card-back' : '', isRed(rank, suit) ? 'card-red' : '', joker ? 'card-joker' : '', selected ? 'is-selected' : '', tapped ? 'is-tapped' : '', highlight ? 'is-highlight' : ''].filter(Boolean).join(' ');
  const glyph = joker ? '★' : suitSymbol(suit) || (suit ? suit.slice(0, 1).toUpperCase() : '');
  const inner = hidden ? <span className="card-back-mark" aria-hidden="true" /> : image ? <img src={image} alt="" draggable={false} /> : variant === 'point-row' ? (
    <span className="card-pr-face" aria-hidden="true"><span className="card-pr-rank">{rank}</span><span className="card-pr-suit">{glyph}</span></span>
  ) : (
    <>
      <span className="card-corner" aria-hidden="true">{joker ? (rank === 'RJ' ? 'R' : 'B') : rank}<small>{glyph}</small></span>
      <span className="card-center" aria-hidden="true">{joker ? <span className="joker-word">{rank === 'RJ' ? 'RED' : 'BLACK'}<br />JOKER</span> : glyph}</span>
      <span className="card-corner card-corner-br" aria-hidden="true">{joker ? (rank === 'RJ' ? 'R' : 'B') : rank}<small>{glyph}</small></span>
    </>
  );
  const badges = <>{locked && <span className="card-badge" aria-hidden="true">🔒</span>}{revealed && <span className="card-badge card-badge-left" aria-hidden="true">👁</span>}</>;
  if (!onClick && !onDoubleClick) return <span className={cls} role="img" aria-label={label}>{inner}{badges}</span>;
  return <button type="button" className={cls} aria-label={label} aria-pressed={selected} onClick={onClick} onDoubleClick={onDoubleClick} onKeyDown={onKeyDown} tabIndex={tabIndex}>{inner}{badges}</button>;
}

export function download(filename: string, content: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function loadLocal<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) as T : fallback; } catch { return fallback; }
}
export function saveLocal(key: string, value: unknown): boolean {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
/** True when a keyboard event targets a text-entry control: board hotkeys must not fire. */
export function typingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
}
export function navigate(hash: string) { if (location.hash !== hash) location.hash = hash; }
export function Spinner({ label = 'Loading' }: { label?: string }) { return <div className="spinner" role="status"><span className="spinner-dot" aria-hidden="true" />{label}…</div>; }
