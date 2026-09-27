import { useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import type { TableTemplate } from '../../packages/templates/types.js';
import type { Component, SetupOperation, Zone } from '../../packages/tabletop/types.js';
import { exportTemplate, importTemplate, standardCards, validateRaster, validateTemplate } from '../../packages/templates/index.js';
import { CardFace, download } from './common.js';

type Target = { kind: 'zone' | 'seat' | 'label' | 'object'; index: number };
type Grab = { t: Target; mode: 'move' | 'resize'; sx: number; sy: number; ox: number; oy: number; ow: number; oh: number; pointer: number };
const TABS = ['Basics', 'Zones', 'Cards', 'Components', 'Setup', 'Import / export'] as const;

export default function TemplateEditor({ template, onSave, onCancel }: { template: TableTemplate; onSave: (t: TableTemplate) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState<TableTemplate>(() => structuredClone(template));
  const [tab, setTab] = useState<(typeof TABS)[number]>('Basics');
  const [sel, setSel] = useState<Target | null>(draft.zones.length ? { kind: 'zone', index: 0 } : null);
  const [json, setJson] = useState('');
  const [importError, setImportError] = useState('');
  const [faceError, setFaceError] = useState('');
  const grab = useRef<Grab | null>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);

  const validation = useMemo(() => { try { validateTemplate(draft); return ''; } catch (e) { return (e as Error).message; } }, [draft]);
  const patch = (p: Partial<TableTemplate>) => setDraft(d => ({ ...d, ...p }));
  const setZone = (i: number, p: Partial<Zone>) => setDraft(d => ({ ...d, zones: d.zones.map((z, j) => (j === i ? clean({ ...z, ...p }) : z)) }));
  const setObject = (i: number, p: Partial<Component>) => setDraft(d => ({ ...d, objects: d.objects.map((o, j) => (j === i ? { ...o, ...p } : o)) }));
  const zone = sel?.kind === 'zone' ? draft.zones[sel.index] : undefined;
  const uid = (prefix: string, taken: string[]) => { let n = taken.length + 1; while (taken.includes(`${prefix}-${n}`)) n++; return `${prefix}-${n}`; };

  function down(e: RPointerEvent, t: Target, mode: 'move' | 'resize') {
    e.stopPropagation(); e.preventDefault();
    const r = rectOf(draft, t);
    grab.current = { t, mode, sx: e.clientX, sy: e.clientY, ox: r.x, oy: r.y, ow: r.w, oh: r.h, pointer: e.pointerId };
    setSel(t);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function move(e: RPointerEvent) {
    const g = grab.current;
    if (!g || g.pointer !== e.pointerId) return;
    const dx = (e.clientX - g.sx) / scale, dy = (e.clientY - g.sy) / scale;
    const clampX = (v: number) => Math.round(Math.max(0, Math.min(draft.width, v))), clampY = (v: number) => Math.round(Math.max(0, Math.min(draft.height, v)));
    if (g.t.kind === 'zone') setZone(g.t.index, g.mode === 'move' ? { x: clampX(g.ox + dx), y: clampY(g.oy + dy) } : { width: Math.round(Math.max(30, Math.min(draft.width, g.ow + dx))), height: Math.round(Math.max(30, Math.min(draft.height, g.oh + dy))) });
    if (g.t.kind === 'seat') setDraft(d => ({ ...d, seatLayout: d.seatLayout.map((s, j) => (j === g.t.index ? { ...s, x: clampX(g.ox + dx), y: clampY(g.oy + dy) } : s)) }));
    if (g.t.kind === 'label') setDraft(d => ({ ...d, labels: d.labels.map((s, j) => (j === g.t.index ? { ...s, x: clampX(g.ox + dx), y: clampY(g.oy + dy) } : s)) }));
    if (g.t.kind === 'object') setObject(g.t.index, { x: clampX(g.ox + dx), y: clampY(g.oy + dy) });
  }
  const end = () => { grab.current = null; };

  async function readFace(file: File): Promise<string> {
    const data = await new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(r.error); r.readAsDataURL(file); });
    return validateRaster(data);
  }
  async function setFace(cardId: string, file: File | undefined) {
    if (!file) return;
    try { const face = await readFace(file); setDraft(d => ({ ...d, cards: d.cards.map(c => (c.id === cardId ? { ...c, face } : c)) })); setFaceError(''); }
    catch (e) { setFaceError((e as Error).message); }
  }
  const pileZones = draft.zones.filter(z => z.kind !== 'hand');

  return (
    <div className="editor">
      <div className="editor-canvas-wrap">
        <div className="editor-canvas-tools">
          <label className="inline-field">Preview zoom<input type="range" min={0.25} max={1} step={0.05} value={scale} onChange={e => setScale(Number(e.target.value))} /></label>
          <span className="muted small">Drag areas, seats, labels and components. Drag a zone’s corner to resize it.</span>
        </div>
        <div className="editor-canvas-scroll">
          <div className="editor-canvas" ref={canvas} style={{ width: draft.width * scale, height: draft.height * scale, background: draft.background }} onPointerMove={move} onPointerUp={end} onPointerCancel={end} role="group" aria-label="Layout preview">
            {draft.zones.map((z, i) => (
              <div key={z.id} className={`ed-zone ed-${z.kind} ${sel?.kind === 'zone' && sel.index === i ? 'is-selected' : ''}`} style={{ left: z.x * scale, top: z.y * scale, width: z.width * scale, height: z.height * scale }} onPointerDown={e => down(e, { kind: 'zone', index: i }, 'move')}>
                <span>{z.name}<small>{z.kind} · {z.visibility}{z.owner !== undefined ? ` · seat ${z.owner + 1}` : ''}</small></span>
                <span className="ed-resize" onPointerDown={e => down(e, { kind: 'zone', index: i }, 'resize')} aria-hidden="true" />
              </div>
            ))}
            {draft.labels.map((l, i) => <div key={`l${i}`} className="ed-label" style={{ left: l.x * scale, top: l.y * scale }} onPointerDown={e => down(e, { kind: 'label', index: i }, 'move')}>{l.text}</div>)}
            {draft.objects.map((o, i) => <div key={o.id} className="ed-object" style={{ left: o.x * scale, top: o.y * scale }} onPointerDown={e => down(e, { kind: 'object', index: i }, 'move')}>{o.kind}: {o.text}</div>)}
            {draft.seatLayout.map((s, i) => <div key={`s${i}`} className="ed-seat" style={{ left: s.x * scale, top: s.y * scale }} onPointerDown={e => down(e, { kind: 'seat', index: i }, 'move')}>Seat {s.seat + 1}</div>)}
          </div>
        </div>
      </div>

      <div className="editor-side">
        <div className="tabs" role="tablist">{TABS.map(t => <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? 'is-active' : ''} onClick={() => { setTab(t); if (t === 'Import / export') setJson(JSON.stringify(draft, null, 2)); }}>{t}</button>)}</div>
        <div className="editor-panel" role="tabpanel">
          {tab === 'Basics' && <div className="form-grid">
            <label>Template name<input value={draft.title} maxLength={80} onChange={e => patch({ title: e.target.value })} /></label>
            <label>Description<textarea value={draft.description} maxLength={2000} onChange={e => patch({ description: e.target.value })} /></label>
            <label>Author / provenance<input value={draft.author} maxLength={500} onChange={e => patch({ author: e.target.value })} /></label>
            <div className="two-col">
              <label>Board width<input type="number" min={600} max={4000} value={draft.width} onChange={e => patch({ width: Number(e.target.value) })} /></label>
              <label>Board height<input type="number" min={400} max={4000} value={draft.height} onChange={e => patch({ height: Number(e.target.value) })} /></label>
            </div>
            <div className="two-col">
              <label>Seats<input type="number" min={2} max={8} disabled={draft.profile !== 'free'} value={draft.seats} onChange={e => { const seats = Math.max(2, Math.min(8, Number(e.target.value) || 2)); patch({ seats, seatLayout: Array.from({ length: seats }, (_, s) => draft.seatLayout[s] ?? { seat: s, x: 100 + s * 150, y: draft.height - 60 }) }); }} /></label>
              <label>Background<input type="color" value={draft.background} onChange={e => patch({ background: e.target.value })} /></label>
            </div>
            <p className="muted small">Rules profile: <b>{draft.profile}</b>. {draft.profile === 'free' ? 'Free tables have no rules engine; players arrange everything themselves.' : 'Intrilex profiles pin two seats and select the built-in rules adapter or manual sandbox.'}</p>
            <div className="button-row">
              <button type="button" onClick={() => setDraft(d => ({ ...d, labels: [...d.labels, { text: 'New label', x: 40, y: 40 }] }))}>Add label</button>
              {sel?.kind === 'label' && <><input aria-label="Label text" value={draft.labels[sel.index]?.text ?? ''} onChange={e => setDraft(d => ({ ...d, labels: d.labels.map((l, j) => (j === sel.index ? { ...l, text: e.target.value } : l)) }))} /><button type="button" className="danger" onClick={() => { setDraft(d => ({ ...d, labels: d.labels.filter((_, j) => j !== sel.index) })); setSel(null); }}>Remove label</button></>}
            </div>
          </div>}

          {tab === 'Zones' && <div className="form-grid">
            <label>Zone<select value={sel?.kind === 'zone' ? sel.index : ''} onChange={e => setSel({ kind: 'zone', index: Number(e.target.value) })}><option value="" disabled>Select a zone</option>{draft.zones.map((z, i) => <option key={z.id} value={i}>{z.name}</option>)}</select></label>
            <div className="button-row">
              <button type="button" onClick={() => { const id = uid('zone', draft.zones.map(z => z.id)); setDraft(d => ({ ...d, zones: [...d.zones, { id, name: 'New area', kind: 'table', visibility: 'public', x: 60, y: 60, width: 300, height: 200 }] })); setSel({ kind: 'zone', index: draft.zones.length }); }}>Add table area</button>
              <button type="button" onClick={() => { const id = uid('pile', draft.zones.map(z => z.id)); setDraft(d => ({ ...d, zones: [...d.zones, { id, name: 'New pile', kind: 'pile', visibility: 'hidden', x: 80, y: 80, width: 100, height: 140 }] })); setSel({ kind: 'zone', index: draft.zones.length }); }}>Add pile</button>
            </div>
            {zone && sel && <>
              <label>Name<input value={zone.name} maxLength={80} onChange={e => setZone(sel.index, { name: e.target.value })} /></label>
              <div className="two-col">
                <label>Kind<select value={zone.kind} onChange={e => setZone(sel.index, { kind: e.target.value as Zone['kind'], ...(e.target.value === 'hand' ? { visibility: 'owner', owner: zone.owner ?? 0 } : {}) })}><option value="table">Table area</option><option value="pile">Pile / deck</option><option value="hand">Seat hand</option></select></label>
                <label>Visibility<select value={zone.visibility} disabled={zone.kind === 'hand'} onChange={e => setZone(sel.index, { visibility: e.target.value as Zone['visibility'], ...(e.target.value === 'owner' ? { owner: zone.owner ?? 0 } : {}) })}>
                  <option value="public">Public</option><option value="owner">Private to one seat</option>{zone.kind === 'pile' && <option value="hidden">Hidden from everyone</option>}</select></label>
              </div>
              {(zone.visibility === 'owner' || zone.kind === 'hand') && <label>Owner seat<select value={zone.owner ?? 0} onChange={e => setZone(sel.index, { owner: Number(e.target.value) })}>{Array.from({ length: draft.seats }, (_, s) => <option key={s} value={s}>Seat {s + 1}</option>)}</select></label>}
              <div className="four-col">{(['x', 'y', 'width', 'height'] as const).map(k => <label key={k}>{k}<input type="number" value={zone[k]} onChange={e => setZone(sel.index, { [k]: Number(e.target.value) })} /></label>)}</div>
              <button type="button" className="danger" onClick={() => { setDraft(d => removeZone(d, zone.id)); setSel(null); }}>Remove zone (and its decks/steps)</button>
            </>}
          </div>}

          {tab === 'Cards' && <div className="form-grid">
            <p className="muted small">{draft.cards.length} cards in {draft.decks.length} deck{draft.decks.length === 1 ? '' : 's'}. Faces must be embedded PNG, JPEG or WebP (≤ 1 MB each). Links, SVG and file paths are refused.</p>
            <AddDeck zones={pileZones} onAdd={(zoneId, custom) => setDraft(d => addDeck(d, zoneId, custom))} />
            {faceError && <p role="alert" className="error">{faceError}</p>}
            {draft.decks.map(deck => (
              <fieldset key={deck.id}><legend>Deck “{deck.id}” in {draft.zones.find(z => z.id === deck.zone)?.name}</legend>
                <label>Starts in<select value={deck.zone} onChange={e => setDraft(d => ({ ...d, decks: d.decks.map(x => (x.id === deck.id ? { ...x, zone: e.target.value } : x)) }))}>{pileZones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}</select></label>
                <div className="face-grid">{deck.cards.slice(0, 60).map(id => { const c = draft.cards.find(x => x.id === id)!; return (
                  <label key={id} className="face-cell" title={`Upload a face for ${c.rank} ${c.suit}`}><CardFace size="sm" rank={c.rank} suit={c.suit} image={c.face} /><input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={e => void setFace(id, e.target.files?.[0])} /><span className="sr-only">Upload face for {c.rank} {c.suit}</span></label>
                ); })}</div>
                {deck.cards.length > 60 && <p className="muted small">Showing the first 60 cards.</p>}
                <button type="button" className="danger" onClick={() => setDraft(d => ({ ...d, decks: d.decks.filter(x => x.id !== deck.id), cards: d.cards.filter(c => !deck.cards.includes(c.id)) }))}>Remove deck</button>
              </fieldset>
            ))}
          </div>}

          {tab === 'Components' && <div className="form-grid">
            <div className="button-row">{(['counter', 'dice', 'token', 'note', 'label'] as const).map(k => <button key={k} type="button" onClick={() => { setDraft(d => ({ ...d, objects: [...d.objects, { id: uid(k, d.objects.map(o => o.id)), kind: k, text: k === 'dice' ? 'D6' : `New ${k}`, value: k === 'dice' ? 1 : 0, x: 100, y: 100, locked: false, ...(k === 'dice' ? { sides: 6 } : {}) }] })); setSel({ kind: 'object', index: draft.objects.length }); }}>Add {k}</button>)}</div>
            {draft.objects.map((o, i) => (
              <fieldset key={o.id} className={sel?.kind === 'object' && sel.index === i ? 'is-selected' : ''}><legend>{o.kind}</legend>
                <label>Text<input value={o.text} maxLength={500} onChange={e => setObject(i, { text: e.target.value })} /></label>
                {o.kind === 'counter' && <label>Starting value<input type="number" value={o.value} onChange={e => setObject(i, { value: Math.trunc(Number(e.target.value) || 0) })} /></label>}
                {o.kind === 'dice' && <label>Sides<input type="number" min={2} max={100} value={o.sides ?? 6} onChange={e => setObject(i, { sides: Math.max(2, Math.min(100, Number(e.target.value) || 6)) })} /></label>}
                <label className="check"><input type="checkbox" checked={o.locked} onChange={e => setObject(i, { locked: e.target.checked })} /> Locked (host only)</label>
                <button type="button" className="danger" onClick={() => setDraft(d => ({ ...d, objects: d.objects.filter((_, j) => j !== i), setup: d.setup.filter(s => !(s.op === 'initialize-counter' && s.id === o.id)) }))}>Remove</button>
              </fieldset>
            ))}
          </div>}

          {tab === 'Setup' && <SetupEditor draft={draft} onChange={setup => patch({ setup })} />}

          {tab === 'Import / export' && <div className="form-grid">
            <p className="muted small">Templates are plain data: layout, cards and starting components. They never include live games, hands, credentials or history. Imported templates receive a new ID.</p>
            <div className="button-row">
              <button type="button" disabled={!!validation} onClick={() => download(`${draft.title.replace(/[^\w-]+/g, '-').toLowerCase() || 'template'}.tabletop.json`, exportTemplate(draft))}>Download template file</button>
              <label className="button-like">Import file<input type="file" accept="application/json,.json" className="sr-only" onChange={async e => { const f = e.target.files?.[0]; if (!f) return; try { const t = importTemplate(await f.text()); setDraft(t); setJson(JSON.stringify(t, null, 2)); setImportError(''); setSel(null); } catch (err) { setImportError((err as Error).message); } }} /></label>
            </div>
            <label>Template JSON<textarea className="code" value={json} onChange={e => setJson(e.target.value)} rows={14} spellCheck={false} /></label>
            <button type="button" onClick={() => { try { const t = importTemplate(json); setDraft(t); setImportError(''); setSel(null); } catch (err) { setImportError((err as Error).message); } }}>Apply JSON</button>
            {importError && <p role="alert" className="error">{importError}</p>}
          </div>}
        </div>
        <div className="editor-foot">
          {validation ? <p role="alert" className="error">{validation}</p> : <p className="ok">Template is valid.</p>}
          <div className="button-row"><button type="button" onClick={onCancel}>Cancel</button><button type="button" className="primary" disabled={!!validation} onClick={() => onSave(validateTemplate(draft))}>Save template</button></div>
        </div>
      </div>
    </div>
  );
}

function clean(z: Zone): Zone {
  const { owner, ...rest } = z;
  if (z.kind === 'hand') return { ...rest, visibility: 'owner', owner: owner ?? 0 };
  if (z.kind === 'table' && z.visibility === 'hidden') return { ...rest, visibility: 'public' };
  return z.visibility === 'owner' ? { ...rest, owner: owner ?? 0 } : rest;
}
function rectOf(t: TableTemplate, target: Target) {
  if (target.kind === 'zone') { const z = t.zones[target.index]!; return { x: z.x, y: z.y, w: z.width, h: z.height }; }
  const p = target.kind === 'seat' ? t.seatLayout[target.index]! : target.kind === 'label' ? t.labels[target.index]! : t.objects[target.index]!;
  return { x: p.x, y: p.y, w: 0, h: 0 };
}
function removeZone(t: TableTemplate, id: string): TableTemplate {
  const decks = t.decks.filter(d => d.zone !== id);
  const keep = new Set(decks.flatMap(d => d.cards));
  const refs = (s: SetupOperation) => ('zone' in s && s.zone === id) || ('target' in s && s.target === id);
  return { ...t, zones: t.zones.filter(z => z.id !== id), decks, cards: t.cards.filter(c => keep.has(c.id)), setup: t.setup.filter(s => !refs(s)) };
}
function addDeck(t: TableTemplate, zone: string, custom?: { rank: string; suit: string; count: number }): TableTemplate {
  const taken = new Set(t.cards.map(c => c.id));
  let n = t.decks.length + 1;
  while (t.decks.some(d => d.id === `deck-${n}`)) n++;
  const prefix = `d${n}`;
  const cards = custom
    ? Array.from({ length: custom.count }, (_, i) => ({ id: `${prefix}-${i + 1}`, rank: custom.rank, suit: custom.suit }))
    : standardCards.map(c => ({ ...c, id: taken.has(c.id) ? `${prefix}-${c.id}` : c.id }));
  return { ...t, cards: [...t.cards, ...cards], decks: [...t.decks, { id: `deck-${n}`, zone, cards: cards.map(c => c.id) }] };
}

function AddDeck({ zones, onAdd }: { zones: Zone[]; onAdd: (zone: string, custom?: { rank: string; suit: string; count: number }) => void }) {
  const [zone, setZone] = useState(zones.find(z => z.kind === 'pile')?.id ?? zones[0]?.id ?? '');
  const [rank, setRank] = useState('Card');
  const [suit, setSuit] = useState('');
  const [count, setCount] = useState(10);
  return (
    <fieldset><legend>Add cards</legend>
      <label>Place in<select value={zone} onChange={e => setZone(e.target.value)}>{zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}</select></label>
      <div className="button-row"><button type="button" disabled={!zone} onClick={() => onAdd(zone)}>Add a standard 54-card deck</button></div>
      <div className="three-col">
        <label>Card name<input value={rank} maxLength={20} onChange={e => setRank(e.target.value)} /></label>
        <label>Group / suit<input value={suit} maxLength={20} onChange={e => setSuit(e.target.value)} /></label>
        <label>How many<input type="number" min={1} max={100} value={count} onChange={e => setCount(Math.max(1, Math.min(100, Number(e.target.value) || 1)))} /></label>
      </div>
      <button type="button" disabled={!zone || !rank.trim()} onClick={() => onAdd(zone, { rank: rank.trim(), suit: suit.trim(), count })}>Add custom cards (upload faces below)</button>
    </fieldset>
  );
}

function SetupEditor({ draft, onChange }: { draft: TableTemplate; onChange: (s: SetupOperation[]) => void }) {
  const piles = draft.zones.filter(z => z.kind === 'pile');
  const others = draft.zones;
  const [op, setOp] = useState<SetupOperation['op']>('shuffle');
  const [zone, setZone] = useState(piles[0]?.id ?? '');
  const [target, setTarget] = useState(others.find(z => z.kind === 'hand')?.id ?? others[0]?.id ?? '');
  const [count, setCount] = useState(5);
  const [faceUp, setFaceUp] = useState(false);
  const counters = draft.objects.filter(o => o.kind === 'counter');
  const [counter, setCounter] = useState(counters[0]?.id ?? '');
  const describe = (s: SetupOperation) => {
    const n = (id: string) => draft.zones.find(z => z.id === id)?.name ?? id;
    switch (s.op) {
      case 'shuffle': return `Shuffle ${n(s.zone)}`;
      case 'deal': return `Deal ${s.count} from ${n(s.zone)} to ${n(s.target)}`;
      case 'place': return `Place ${s.count} ${s.faceUp ? 'face-up' : 'face-down'} from ${n(s.zone)} onto ${n(s.target)}`;
      case 'initialize-counter': return `Set ${draft.objects.find(o => o.id === s.id)?.text ?? s.id} to ${s.value}`;
      case 'choose-first-seat': return 'Randomly choose the first seat';
      case 'deal-seat': return `Deal ${s.count} from ${n(s.zone)} to the ${s.seat} seat`;
    }
  };
  const add = () => {
    const step: SetupOperation | null = op === 'shuffle' ? { op, zone } : op === 'deal' ? { op, zone, target, count } : op === 'place' ? { op, zone, target, count, faceUp }
      : op === 'initialize-counter' ? (counter ? { op, id: counter, value: count } : null) : op === 'choose-first-seat' ? { op } : { op: 'deal-seat', zone, seat: 'first', count };
    if (step) onChange([...draft.setup, step]);
  };
  return (
    <div className="form-grid">
      <p className="muted small">Setup runs once when a table is created or reset, using only these allow-listed steps. Live tables shuffle with secure server randomness.</p>
      <ol className="setup-list">{draft.setup.map((s, i) => <li key={i}>{describe(s)} <button type="button" className="link-btn" onClick={() => onChange(draft.setup.filter((_, j) => j !== i))}>Remove</button>{i > 0 && <button type="button" className="link-btn" onClick={() => { const next = draft.setup.slice(); [next[i - 1], next[i]] = [next[i]!, next[i - 1]!]; onChange(next); }}>Move up</button>}</li>)}</ol>
      <fieldset><legend>Add a step</legend>
        <label>Step<select value={op} onChange={e => setOp(e.target.value as SetupOperation['op'])}><option value="shuffle">Shuffle a pile</option><option value="deal">Deal to a zone</option><option value="place">Place onto a zone</option><option value="initialize-counter">Set a counter</option><option value="choose-first-seat">Choose first seat randomly</option></select></label>
        {op !== 'initialize-counter' && op !== 'choose-first-seat' && <label>From pile<select value={zone} onChange={e => setZone(e.target.value)}>{piles.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}</select></label>}
        {(op === 'deal' || op === 'place') && <label>To<select value={target} onChange={e => setTarget(e.target.value)}>{others.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}</select></label>}
        {op === 'initialize-counter' && <label>Counter<select value={counter} onChange={e => setCounter(e.target.value)}>{counters.map(o => <option key={o.id} value={o.id}>{o.text}</option>)}</select></label>}
        {(op === 'deal' || op === 'place' || op === 'initialize-counter') && <label>{op === 'initialize-counter' ? 'Value' : 'Count'}<input type="number" value={count} onChange={e => setCount(Math.trunc(Number(e.target.value) || 0))} /></label>}
        {op === 'place' && <label className="check"><input type="checkbox" checked={faceUp} onChange={e => setFaceUp(e.target.checked)} /> Face up</label>}
        <button type="button" onClick={add} disabled={op !== 'choose-first-seat' && op !== 'initialize-counter' && !zone}>Add step</button>
      </fieldset>
    </div>
  );
}
