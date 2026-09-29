import { memo, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent, type KeyboardEvent as RKeyboardEvent } from 'react';
import type { CardView, Component, TableCommand, TableView, ZoneView } from '../../packages/tabletop/types.js';
import { CARD_HEIGHT, CARD_WIDTH } from '../../packages/tabletop/index.js';
import type { PointerClientMessage, ParticipantView } from '../../packages/protocol/index.js';
import { CardFace, Modal, cardName, typingTarget } from './common.js';
import { PresenceLayer } from './Presence.js';

export interface TableBoardProps {
  view: TableView; seat: number | null; host: boolean; art: Record<string, string>;
  onCommand: (c: TableCommand) => unknown; participants?: ParticipantView[];
  presence?: (m: PointerClientMessage) => void; canUndo?: boolean; onUndo?: () => void; readOnly?: boolean;
}

type Drag = { kind: 'cards'; ids: string[]; sx: number; sy: number; moved: boolean; pointer: number } | { kind: 'pan'; sx: number; sy: number; px: number; py: number; pointer: number } | { kind: 'object'; id: string; sx: number; sy: number; ox: number; oy: number; moved: boolean; pointer: number };

export default function TableBoard({ view, seat, host, art, onCommand, participants = [], presence, canUndo, onUndo, readOnly }: TableBoardProps) {
  const [selection, setSelection] = useState<string[]>([]);
  const [zoom, setZoom] = useState(0.7);
  const [pan, setPan] = useState({ x: 12, y: 12 });
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  const [objDrag, setObjDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const [multi, setMulti] = useState(false);
  const [pile, setPile] = useState(() => view.zones.find(z => z.kind === 'pile')?.id ?? '');
  const [count, setCount] = useState(1);
  const [inspect, setInspect] = useState<CardView | null>(null);
  const [browse, setBrowse] = useState<string | null>(null);
  const [dialog, setDialog] = useState<null | 'move' | 'reveal' | 'deal' | 'split' | 'component' | { edit: Component }>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const handTray = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);

  const cards = view.cards;
  const zoneById = useMemo(() => new Map(view.zones.map(z => [z.id, z])), [view.zones]);
  const myHand = view.zones.find(z => z.kind === 'hand' && z.owner === seat);
  const tableCards = cards.filter(c => zoneById.get(c.zone)?.kind === 'table');
  const handCards = myHand ? cards.filter(c => c.zone === myHand.id) : [];
  const selected = cards.filter(c => selection.includes(c.id));
  const canAct = seat !== null && !readOnly;

  // Handles rotate when cards enter hidden containers: drop selections that no longer exist.
  useEffect(() => { setSelection(s => s.filter(id => cards.some(c => c.id === id))); }, [cards]);
  useEffect(() => { if (!view.zones.some(z => z.id === pile)) setPile(view.zones.find(z => z.kind === 'pile')?.id ?? ''); }, [view.zones, pile]);

  const fit = () => {
    const el = viewport.current; if (!el) return;
    const z = Math.max(0.25, Math.min(1.4, Math.min(el.clientWidth / view.width, el.clientHeight / view.height)));
    setZoom(z); setPan({ x: (el.clientWidth - view.width * z) / 2, y: (el.clientHeight - view.height * z) / 2 });
  };
  // Fit once on mount; later fits are user-initiated.
  const fitted = useRef(false);
  useEffect(() => { if (!fitted.current) { fitted.current = true; fit(); } });
  useEffect(() => {
    const el = viewport.current; if (!el) return;
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey && Math.abs(e.deltaY) < 40 && e.deltaMode === 0 && !e.altKey) { setPan(p => ({ x: p.x - e.deltaX, y: p.y - e.deltaY })); e.preventDefault(); return; }
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      setZoom(z => {
        const nz = Math.max(0.25, Math.min(2, z * (e.deltaY < 0 ? 1.1 : 0.9)));
        setPan(p => ({ x: mx - ((mx - p.x) / z) * nz, y: my - ((my - p.y) / z) * nz }));
        return nz;
      });
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, []);

  const toWorld = (clientX: number, clientY: number) => {
    const rect = viewport.current!.getBoundingClientRect();
    return { x: (clientX - rect.left - pan.x) / zoom, y: (clientY - rect.top - pan.y) / zoom };
  };
  const send = (c: TableCommand) => { if (canAct) onCommand(c); };
  const zoneAt = (x: number, y: number): ZoneView | undefined => {
    const hits = view.zones.filter(z => z.kind !== 'hand' && x >= z.x && x <= z.x + z.width && y >= z.y && y <= z.y + z.height && !(z.visibility === 'owner' && z.owner !== seat));
    return hits.sort((a, b) => a.width * a.height - b.width * b.height)[0];
  };
  const toggle = (id: string, additive: boolean) => setSelection(s => (additive || multi ? (s.includes(id) ? s.filter(x => x !== id) : [...s, id]) : [id]));

  function cardDown(e: RPointerEvent, card: CardView) {
    if (e.button !== 0 || !canAct) return;
    e.stopPropagation();
    const additive = e.shiftKey || e.ctrlKey || e.metaKey || multi;
    const ids = selection.includes(card.id) && !additive ? selection : additive ? [...new Set([...selection, card.id])] : [card.id];
    setSelection(ids);
    if (card.locked) return;
    dragRef.current = { kind: 'cards', ids, sx: e.clientX, sy: e.clientY, moved: false, pointer: e.pointerId };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function objectDown(e: RPointerEvent, o: Component) {
    if (e.button !== 0 || !canAct || (o.locked && !host)) return;
    e.stopPropagation();
    dragRef.current = { kind: 'object', id: o.id, sx: e.clientX, sy: e.clientY, ox: o.x, oy: o.y, moved: false, pointer: e.pointerId };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function backgroundDown(e: RPointerEvent) {
    if (e.button !== 0) return;
    setMenu(null);
    dragRef.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y, pointer: e.pointerId };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function pointerMove(e: RPointerEvent) {
    if (presence && viewport.current) { const w = toWorld(e.clientX, e.clientY); if (w.x >= 0 && w.y >= 0 && w.x <= view.width && w.y <= view.height) presence({ type: 'presence', x: w.x / view.width, y: w.y / view.height, surface: 'table' }); }
    const d = dragRef.current;
    if (!d || d.pointer !== e.pointerId) return;
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    if (d.kind === 'pan') { setPan({ x: d.px + dx, y: d.py + dy }); return; }
    if (!d.moved && Math.hypot(dx, dy) < 5) return;
    d.moved = true;
    if (d.kind === 'cards') setDrag({ dx: dx / zoom, dy: dy / zoom });
    else setObjDrag({ id: d.id, x: d.ox + dx / zoom, y: d.oy + dy / zoom });
  }
  function cancelDrag() { dragRef.current = null; setDrag(null); setObjDrag(null); }
  function pointerUp(e: RPointerEvent) {
    const d = dragRef.current;
    if (!d || d.pointer !== e.pointerId) return;
    dragRef.current = null;
    if (d.kind === 'object') {
      setObjDrag(null);
      if (d.moved) send({ type: 'update-component', id: d.id, x: Math.round(d.ox + (e.clientX - d.sx) / zoom), y: Math.round(d.oy + (e.clientY - d.sy) / zoom) });
      return;
    }
    if (d.kind !== 'cards') return;
    setDrag(null);
    if (!d.moved) return;
    const tray = handTray.current?.getBoundingClientRect();
    if (myHand && tray && e.clientX >= tray.left && e.clientX <= tray.right && e.clientY >= tray.top && e.clientY <= tray.bottom) { send({ type: 'move', ids: d.ids, zone: myHand.id }); return; }
    const lead = cards.find(c => c.id === d.ids[0]);
    if (!lead) return;
    const fromTable = zoneById.get(lead.zone)?.kind === 'table';
    const drop = toWorld(e.clientX, e.clientY);
    const x = fromTable ? lead.x + (e.clientX - d.sx) / zoom : drop.x - CARD_WIDTH / 2;
    const y = fromTable ? lead.y + (e.clientY - d.sy) / zoom : drop.y - CARD_HEIGHT / 2;
    const target = zoneAt(drop.x, drop.y) ?? zoneById.get(lead.zone);
    if (!target) return;
    send({ type: 'move', ids: d.ids, zone: target.id, ...(target.kind === 'table' ? { x: Math.round(x), y: Math.round(y) } : {}) });
  }

  function keys(e: RKeyboardEvent) {
    if (typingTarget(e.target) || !canAct) return;
    const k = e.key.toLowerCase();
    if (k === 'escape') { setSelection([]); cancelDrag(); setMenu(null); return; }
    if (!selected.length) return;
    const onTable = selected.filter(c => zoneById.get(c.zone)?.kind === 'table').map(c => c.id);
    if (k === 'f' && onTable.length) { e.preventDefault(); send({ type: 'flip', ids: onTable }); }
    else if (k === 'r' && onTable.length) { e.preventDefault(); send({ type: 'rotate', ids: onTable, degrees: 90 }); }
    else if (k === 'i') { e.preventDefault(); setInspect(selected[0]!); }
    else if (k === 'm') { e.preventDefault(); setDialog('move'); }
    else if (e.key.startsWith('Arrow') && onTable.length) {
      e.preventDefault();
      const lead = selected.find(c => onTable.includes(c.id))!;
      const step = e.shiftKey ? 60 : 20;
      send({ type: 'move', ids: onTable, zone: lead.zone, x: lead.x + (e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0), y: lead.y + (e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0) });
    }
  }

  const tableSel = selected.filter(c => zoneById.get(c.zone)?.kind === 'table').map(c => c.id);
  const selIds = selected.map(c => c.id);
  const piles = view.zones.filter(z => z.kind === 'pile' && !(z.visibility === 'owner' && z.owner !== seat));
  const activePile = zoneById.get(pile);
  const seatName = (s: number) => participants.find(p => p.seat === s)?.nickname ?? `Seat ${s + 1}`;

  return (
    <div className="table-shell" onKeyDown={keys}>
      <div className="board-toolbar" role="toolbar" aria-label="View controls">
        <button type="button" onClick={() => setZoom(z => Math.max(0.25, z / 1.15))} aria-label="Zoom out">−</button>
        <span className="zoom-readout" aria-live="polite">{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => setZoom(z => Math.min(2, z * 1.15))} aria-label="Zoom in">+</button>
        <button type="button" onClick={fit}>Fit table</button>
        <button type="button" aria-pressed={multi} onClick={() => setMulti(m => !m)} title="Tap cards to add them to the selection">Multi-select</button>
        {canUndo && onUndo && <button type="button" onClick={onUndo}>Undo my last move</button>}
        {presence && <button type="button" onClick={() => presence({ type: 'ping', x: 0.5, y: 0.5, surface: 'table' })} title="Double-click the table to ping a spot">Ping centre</button>}
        <span className="toolbar-hint">Drag to move · Shift/Multi-select · F flip · R rotate · I inspect · M move · arrows nudge · Esc clears</span>
      </div>
      <div className="viewport" ref={viewport} style={{ background: view.background }} onPointerDown={backgroundDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={cancelDrag} onLostPointerCapture={cancelDrag}
        onDoubleClick={e => { if (presence && e.target === viewport.current) { const w = toWorld(e.clientX, e.clientY); presence({ type: 'ping', x: Math.min(1, Math.max(0, w.x / view.width)), y: Math.min(1, Math.max(0, w.y / view.height)), surface: 'table' }); } }}
        aria-label="Table surface">
        <div className="world" style={{ width: view.width, height: view.height, transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
          {view.labels.map((l, i) => <span key={i} className="table-label" style={{ left: l.x, top: l.y }}>{l.text}</span>)}
          {view.zones.filter(z => z.kind !== 'hand').map(z => <ZoneBox key={z.id} zone={z} active={z.id === pile} top={z.kind === 'pile' ? cards.filter(c => c.zone === z.id).at(-1) : undefined} art={art}
            onSelect={() => { if (z.kind === 'pile') setPile(z.id); if (z.kind === 'pile' && (z.visibility === 'public' || z.owner === seat)) setBrowse(z.id); }} />)}
          {view.seatLayout.map(s => { const hz = view.zones.find(z => z.kind === 'hand' && z.owner === s.seat); return hz && s.seat !== seat ? <div key={s.seat} className="seat-badge" style={{ left: s.x, top: s.y }}><strong>{seatName(s.seat)}</strong><span>{hz.count} in hand</span></div> : null; })}
          {tableCards.map(c => {
            const moving = drag && selection.includes(c.id);
            return (
              <div key={c.id} className={`placed ${moving ? 'is-dragging' : ''}`} style={{ left: c.x + (moving ? drag.dx : 0), top: c.y + (moving ? drag.dy : 0), transform: `rotate(${c.rotation}deg)`, zIndex: moving ? 1000 : undefined }}
                onPointerDown={e => cardDown(e, c)} onContextMenu={e => { e.preventDefault(); setSelection(s => (s.includes(c.id) ? s : [c.id])); const r = viewport.current!.getBoundingClientRect(); setMenu({ x: e.clientX - r.left, y: e.clientY - r.top }); }}>
                <CardFace rank={c.faceUp || c.revealed ? c.rank : undefined} suit={c.suit} image={c.art ? art[c.art] : undefined} locked={c.locked} attached={!!c.attachedTo} revealed={c.revealed}
                  selected={selection.includes(c.id)} onClick={() => undefined} onDoubleClick={() => setInspect(c)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(c.id, e.shiftKey); } }} />
              </div>
            );
          })}
          {view.objects.map(o => <TableObject key={o.id} o={objDrag?.id === o.id ? { ...o, x: objDrag.x, y: objDrag.y } : o} canAct={canAct} host={host} onDown={e => objectDown(e, o)} send={send} onEdit={() => setDialog({ edit: o })} />)}
        </div>
        {presence && <PresenceLayer surface="table" participants={participants} transform={{ pan, zoom, width: view.width, height: view.height }} />}
        {menu && selected.length > 0 && (
          <div className="context-menu" role="menu" style={{ left: menu.x, top: menu.y }} onPointerDown={e => e.stopPropagation()}>
            {tableSel.length > 0 && <button role="menuitem" onClick={() => { send({ type: 'flip', ids: tableSel }); setMenu(null); }}>Flip</button>}
            {tableSel.length > 0 && <button role="menuitem" onClick={() => { send({ type: 'rotate', ids: tableSel, degrees: 90 }); setMenu(null); }}>Rotate 90°</button>}
            <button role="menuitem" onClick={() => { setInspect(selected[0]!); setMenu(null); }}>Inspect</button>
            <button role="menuitem" onClick={() => { setDialog('move'); setMenu(null); }}>Move to…</button>
            {myHand && <button role="menuitem" onClick={() => { send({ type: 'move', ids: selIds, zone: myHand.id }); setMenu(null); }}>Take into hand</button>}
          </div>
        )}
      </div>

      {canAct && (
        <div className="selection-bar" role="toolbar" aria-label="Card controls">
          <div className="control-group">
            <strong>{selected.length ? `${selected.length} selected` : 'Select cards to act'}</strong>
            <button type="button" disabled={!tableSel.length} onClick={() => send({ type: 'flip', ids: tableSel })}>Flip</button>
            <button type="button" disabled={!tableSel.length} onClick={() => send({ type: 'rotate', ids: tableSel, degrees: 90 })}>Rotate / tap</button>
            <button type="button" disabled={!selected.length} onClick={() => setInspect(selected[0]!)}>Inspect</button>
            <button type="button" disabled={!selected.length} onClick={() => setDialog('move')}>Move to…</button>
            <select aria-label="Arrange selected cards" value="" disabled={tableSel.length < 2} onChange={e => { if (e.target.value) send({ type: 'arrange', ids: tableSel, layout: e.target.value as 'align' }); }}>
              <option value="">Arrange…</option><option value="align">Align in a row</option><option value="stack">Stack</option><option value="fan">Fan</option><option value="unstack">Spread out</option>
            </select>
            <button type="button" disabled={!selected.length} onClick={() => setDialog('reveal')}>Reveal…</button>
            <button type="button" disabled={!selected.length} onClick={() => send({ type: 'hide', ids: selIds })}>Hide again</button>
            <button type="button" disabled={tableSel.length < 2} onClick={() => send({ type: 'attach', ids: tableSel.slice(1), target: tableSel[0]! })} title="Attach the other selected cards to the first one you selected">Attach to first</button>
            <button type="button" disabled={!tableSel.length} onClick={() => send({ type: 'detach', ids: tableSel })}>Detach</button>
            <button type="button" disabled={tableSel.length < 2} onClick={() => send({ type: 'shuffle-selection', ids: tableSel })}>Shuffle face-down</button>
            {host && <button type="button" disabled={!tableSel.length} onClick={() => send({ type: 'lock', ids: tableSel, locked: !selected.every(c => c.locked) })}>{selected.length && selected.every(c => c.locked) ? 'Unlock' : 'Lock'}</button>}
          </div>
          <div className="control-group">
            <label className="inline-field">Pile<select value={pile} onChange={e => setPile(e.target.value)}>{piles.map(z => <option key={z.id} value={z.id}>{z.name} ({z.count})</option>)}</select></label>
            <label className="inline-field">Count<input type="number" min={1} max={60} value={count} onChange={e => setCount(Math.max(1, Math.min(60, Number(e.target.value) || 1)))} /></label>
            <button type="button" disabled={!activePile?.count || !myHand} onClick={() => send({ type: 'draw', zone: pile, count })}>Draw</button>
            <button type="button" disabled={!activePile?.count} onClick={() => setDialog('deal')}>Deal…</button>
            <button type="button" disabled={!activePile || activePile.count < 2} onClick={() => send({ type: 'shuffle', zone: pile })}>Shuffle</button>
            <button type="button" disabled={!activePile?.count || piles.length < 2} onClick={() => setDialog('split')}>Split / merge…</button>
            <button type="button" onClick={() => setDialog('component')}>Add counter, die or note</button>
          </div>
        </div>
      )}

      {myHand && (
        <section className="hand-tray" ref={handTray} aria-label="Your private hand">
          <div className="hand-head">
            <strong>Your hand</strong><span>{handCards.length} card{handCards.length === 1 ? '' : 's'} · only you see these faces</span>
            <button type="button" className="link-btn" onClick={() => send({ type: 'sort-hand', by: 'rank' })}>Sort by rank</button>
            <button type="button" className="link-btn" onClick={() => send({ type: 'sort-hand', by: 'suit' })}>Sort by suit</button>
            <button type="button" className="link-btn" disabled={!handCards.some(c => selection.includes(c.id))} onClick={() => send({ type: 'reorder-hand', ids: [...handCards.filter(c => selection.includes(c.id)), ...handCards.filter(c => !selection.includes(c.id))].map(c => c.id) })}>Selected to front</button>
          </div>
          <div className="hand-cards">
            {handCards.map(c => (
              <div key={c.id} className="hand-slot" onPointerDown={e => cardDown(e, c)} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={cancelDrag}
                style={drag && selection.includes(c.id) ? { transform: `translate(${drag.dx * zoom}px, ${drag.dy * zoom}px)`, zIndex: 5 } : undefined}>
                <CardFace rank={c.rank} suit={c.suit} image={c.art ? art[c.art] : undefined} revealed={c.revealed} selected={selection.includes(c.id)} onClick={() => undefined} onDoubleClick={() => setInspect(c)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(c.id, e.shiftKey); } }} />
              </div>
            ))}
            {!handCards.length && <p className="empty-note">Draw from a pile or drag a card here.</p>}
          </div>
        </section>
      )}
      {seat === null && <p className="spectator-note">You are spectating. Hands and hidden piles stay private; take a free seat from the people panel to play.</p>}

      {inspect && <Modal title={cardName({ rank: inspect.faceUp || inspect.revealed || zoneById.get(inspect.zone)?.kind !== 'table' ? inspect.rank : undefined, suit: inspect.suit })} onClose={() => setInspect(null)}>
        <div className="inspect-card"><CardFace size="lg" rank={inspect.faceUp || inspect.revealed || zoneById.get(inspect.zone)?.kind !== 'table' ? inspect.rank : undefined} suit={inspect.suit} image={inspect.art ? art[inspect.art] : undefined} /></div>
        <p>{inspect.rank ? `Location: ${zoneById.get(inspect.zone)?.name}.` : 'This card is face-down. Inspecting never reveals a hidden face.'}{inspect.locked ? ' Locked by the host.' : ''}{inspect.attachedTo ? ' Attached to another card.' : ''}</p>
      </Modal>}
      {browse && (() => { const z = zoneById.get(browse)!; const inPile = cards.filter(c => c.zone === browse); return (
        <Modal title={`${z.name} · ${z.count} cards`} onClose={() => setBrowse(null)} wide>
          {inPile.length ? <><p className="muted">Top card last. Select cards to act on them with the card controls.</p><div className="browse-grid">{inPile.map(c => <CardFace key={c.id} rank={c.rank} suit={c.suit} image={c.art ? art[c.art] : undefined} size="sm" selected={selection.includes(c.id)} onClick={() => toggle(c.id, true)} />)}</div></>
            : <p>This pile holds {z.count} cards. Its faces and order are private.</p>}
        </Modal>
      ); })()}
      {dialog === 'move' && <MoveDialog zones={view.zones.filter(z => !(z.kind !== 'hand' && z.visibility === 'owner' && z.owner !== seat))} seatName={seatName} onClose={() => setDialog(null)}
        onMove={(zone, position, faceUp) => { const z = zoneById.get(zone)!; send({ type: 'move', ids: selIds, zone, ...(z.kind === 'table' ? { x: z.x + 20, y: z.y + 20 } : { position }), ...(faceUp === undefined ? {} : { faceUp }) }); setDialog(null); }} />}
      {dialog === 'reveal' && <Modal title="Reveal selected cards" onClose={() => setDialog(null)}>
        <p className="muted">Revealed cards stay where they are. “Hide again” removes the reveal, but anyone who saw them may remember.</p>
        <div className="button-column"><button type="button" onClick={() => { send({ type: 'reveal', ids: selIds, to: 'all' }); setDialog(null); }}>Reveal to everyone</button>
          {Array.from({ length: view.seats }, (_, s) => s).filter(s => s !== seat).map(s => <button type="button" key={s} onClick={() => { send({ type: 'reveal', ids: selIds, to: [s] }); setDialog(null); }}>Reveal only to {seatName(s)}</button>)}</div>
      </Modal>}
      {dialog === 'deal' && <Modal title={`Deal from ${activePile?.name}`} onClose={() => setDialog(null)}>
        <DealForm seats={view.zones.filter(z => z.kind === 'hand').map(z => z.owner!)} seatName={seatName} onDeal={(n, seats) => { send({ type: 'deal', zone: pile, count: n, seats }); setDialog(null); }} />
      </Modal>}
      {dialog === 'split' && <Modal title={`Split or merge ${activePile?.name}`} onClose={() => setDialog(null)}>
        <SplitForm piles={piles.filter(z => z.id !== pile)} onSplit={(n, target) => { send({ type: 'split', zone: pile, count: n, target }); setDialog(null); }} onMerge={target => { send({ type: 'merge', zone: pile, target }); setDialog(null); }} />
      </Modal>}
      {dialog === 'component' && <ComponentForm onClose={() => setDialog(null)} onSave={(kind, text, value, sides) => { send({ type: 'add-component', kind, text, value, x: Math.round(view.width / 2 - pan.x / zoom / 4), y: Math.round(view.height / 3), ...(kind === 'dice' ? { sides } : {}) }); setDialog(null); }} />}
      {dialog && typeof dialog === 'object' && <ComponentForm edit={dialog.edit} onClose={() => setDialog(null)} onRemove={() => { send({ type: 'remove-component', id: dialog.edit.id }); setDialog(null); }}
        onSave={(_k, text, value) => { send({ type: 'update-component', id: dialog.edit.id, text, ...(dialog.edit.kind === 'dice' ? {} : { value }) }); setDialog(null); }} />}
    </div>
  );
}

const ZoneBox = memo(function ZoneBox({ zone, active, top, art, onSelect }: { zone: ZoneView; active: boolean; top?: CardView; art: Record<string, string>; onSelect: () => void }) {
  const pileLike = zone.kind === 'pile';
  return (
    <div className={`zone zone-${zone.kind} ${active ? 'is-active' : ''}`} style={{ left: zone.x, top: zone.y, width: zone.width, height: zone.height }}>
      <button type="button" className="zone-title" onPointerDown={e => e.stopPropagation()} onClick={onSelect} aria-label={`${zone.name}, ${zone.count} cards${zone.visibility === 'public' ? '' : ', private contents'}`}>
        {zone.name}<small>{zone.count}{zone.visibility === 'hidden' ? ' · hidden' : zone.visibility === 'owner' ? ' · private' : ''}</small>
      </button>
      {pileLike && zone.count > 0 && (
        <div className="pile-stack" aria-hidden="true" style={{ ['--depth' as string]: Math.min(6, zone.count) }}>
          {top && top.rank ? <CardFace rank={top.rank} suit={top.suit} image={top.art ? art[top.art] : undefined} size="sm" /> : <CardFace size="sm" />}
        </div>
      )}
    </div>
  );
});

function TableObject({ o, canAct, host, onDown, send, onEdit }: { o: Component; canAct: boolean; host: boolean; onDown: (e: RPointerEvent) => void; send: (c: TableCommand) => void; onEdit: () => void }) {
  const editable = canAct && (!o.locked || host);
  return (
    <div className={`tobj tobj-${o.kind}`} style={{ left: o.x, top: o.y }} onPointerDown={onDown}>
      <span className="tobj-text">{o.text}</span>
      {(o.kind === 'counter' || o.kind === 'dice') && <strong className="tobj-value" aria-live="polite">{o.value}</strong>}
      {o.kind === 'counter' && editable && <span className="tobj-controls" onPointerDown={e => e.stopPropagation()}>
        <button type="button" aria-label={`Decrease ${o.text}`} onClick={() => send({ type: 'update-component', id: o.id, value: o.value - 1 })}>−</button>
        <button type="button" aria-label={`Increase ${o.text}`} onClick={() => send({ type: 'update-component', id: o.id, value: o.value + 1 })}>+</button>
      </span>}
      {o.kind === 'dice' && editable && <button type="button" onPointerDown={e => e.stopPropagation()} onClick={() => send({ type: 'roll', id: o.id })}>Roll d{o.sides ?? 6}</button>}
      {editable && <button type="button" className="tobj-edit" aria-label={`Edit ${o.kind} ${o.text}`} onPointerDown={e => e.stopPropagation()} onClick={onEdit}>✎</button>}
      {o.locked && <span className="sr-only">locked</span>}
    </div>
  );
}

function MoveDialog({ zones, seatName, onMove, onClose }: { zones: ZoneView[]; seatName: (s: number) => string; onMove: (zone: string, position: 'top' | 'bottom', faceUp?: boolean) => void; onClose: () => void }) {
  const [zone, setZone] = useState(zones[0]?.id ?? '');
  const [position, setPosition] = useState<'top' | 'bottom'>('top');
  const [face, setFace] = useState<'keep' | 'up' | 'down'>('keep');
  const z = zones.find(x => x.id === zone);
  return (
    <Modal title="Move selected cards" onClose={onClose}>
      <form className="form-grid" onSubmit={e => { e.preventDefault(); onMove(zone, position, face === 'keep' ? undefined : face === 'up'); }}>
        <label>Destination<select value={zone} onChange={e => setZone(e.target.value)}>{zones.map(x => <option key={x.id} value={x.id}>{x.kind === 'hand' ? `${seatName(x.owner!)}’s hand` : x.name}</option>)}</select></label>
        {z?.kind === 'pile' && <fieldset><legend>Position</legend><label><input type="radio" checked={position === 'top'} onChange={() => setPosition('top')} /> Top</label><label><input type="radio" checked={position === 'bottom'} onChange={() => setPosition('bottom')} /> Bottom</label></fieldset>}
        {z?.kind === 'table' && <fieldset><legend>Face</legend><label><input type="radio" checked={face === 'keep'} onChange={() => setFace('keep')} /> Default</label><label><input type="radio" checked={face === 'up'} onChange={() => setFace('up')} /> Face up</label><label><input type="radio" checked={face === 'down'} onChange={() => setFace('down')} /> Face down</label></fieldset>}
        <button type="submit" className="primary">Move</button>
      </form>
    </Modal>
  );
}
function DealForm({ seats, seatName, onDeal }: { seats: number[]; seatName: (s: number) => string; onDeal: (n: number, seats: number[]) => void }) {
  const [n, setN] = useState(5);
  const [chosen, setChosen] = useState<number[]>(seats);
  return (
    <form className="form-grid" onSubmit={e => { e.preventDefault(); if (chosen.length) onDeal(n, chosen); }}>
      <label>Cards to each seat<input type="number" min={1} max={30} value={n} onChange={e => setN(Math.max(1, Math.min(30, Number(e.target.value) || 1)))} /></label>
      <fieldset><legend>Seats</legend>{seats.map(s => <label key={s}><input type="checkbox" checked={chosen.includes(s)} onChange={e => setChosen(c => (e.target.checked ? [...c, s].sort() : c.filter(x => x !== s)))} /> {seatName(s)}</label>)}</fieldset>
      <button type="submit" className="primary" disabled={!chosen.length}>Deal face-down</button>
    </form>
  );
}
function SplitForm({ piles, onSplit, onMerge }: { piles: ZoneView[]; onSplit: (n: number, target: string) => void; onMerge: (target: string) => void }) {
  const [n, setN] = useState(10);
  const [target, setTarget] = useState(piles[0]?.id ?? '');
  return (
    <div className="form-grid">
      <label>Other pile<select value={target} onChange={e => setTarget(e.target.value)}>{piles.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}</select></label>
      <label>Cards to split off the top<input type="number" min={1} max={300} value={n} onChange={e => setN(Math.max(1, Number(e.target.value) || 1))} /></label>
      <div className="button-row"><button type="button" className="primary" disabled={!target} onClick={() => onSplit(n, target)}>Split onto other pile</button><button type="button" disabled={!target} onClick={() => onMerge(target)}>Merge whole pile onto other</button></div>
    </div>
  );
}
function ComponentForm({ edit, onSave, onClose, onRemove }: { edit?: Component; onSave: (kind: Component['kind'], text: string, value: number, sides: number) => void; onClose: () => void; onRemove?: () => void }) {
  const [kind, setKind] = useState<Component['kind']>(edit?.kind ?? 'counter');
  const [text, setText] = useState(edit?.text ?? '');
  const [value, setValue] = useState(edit?.value ?? 0);
  const [sides, setSides] = useState(edit?.sides ?? 6);
  return (
    <Modal title={edit ? `Edit ${edit.kind}` : 'Add a component'} onClose={onClose}>
      <form className="form-grid" onSubmit={e => { e.preventDefault(); onSave(kind, text.trim() || kind, value, sides); }}>
        {!edit && <label>Kind<select value={kind} onChange={e => setKind(e.target.value as Component['kind'])}><option value="counter">Counter</option><option value="dice">Die</option><option value="token">Token</option><option value="note">Note</option><option value="label">Label</option></select></label>}
        <label>{kind === 'note' ? 'Note text' : 'Label'}{kind === 'note' ? <textarea maxLength={500} value={text} onChange={e => setText(e.target.value)} /> : <input maxLength={120} value={text} onChange={e => setText(e.target.value)} />}</label>
        {kind === 'counter' && <label>Value<input type="number" value={value} onChange={e => setValue(Math.trunc(Number(e.target.value) || 0))} /></label>}
        {kind === 'dice' && !edit && <label>Sides<input type="number" min={2} max={100} value={sides} onChange={e => setSides(Math.max(2, Math.min(100, Number(e.target.value) || 6)))} /></label>}
        <div className="button-row"><button type="submit" className="primary">Save</button>{onRemove && <button type="button" className="danger" onClick={onRemove}>Remove</button>}</div>
      </form>
    </Modal>
  );
}
