import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import type { GameAction, GameCard, GameView } from '../../packages/intrilex/types.js';
import { RULES, anchorValue, explainAction, explainCard } from '../../packages/intrilex/index.js';
import type { PointerClientMessage, ParticipantView } from '../../packages/protocol/index.js';
import { actionKey } from '../../packages/intrilex/actionIdentity.js';
import { actionLookups, buildActionEntries, paramOptions, selectOption, type ActionEntry } from '../../packages/intrilex/presentation.js';
import { rankSuggestedMoves } from '../../packages/intrilex/suggestions.js';
import { CardFace, Modal, cardName, isRed, suitSpans, suitSymbol } from './common.js';
import PossibleMoves, { type ComposerState } from './ActionPanel.js';
import { PresenceLayer } from './Presence.js';
import GameLog from './GameLog.js';

export type BoardZone = 'hand' | 'dp' | 'pr' | 'er' | 'gy';
export interface GameBoardProps {
  view: GameView; onAction: (a: GameAction) => unknown; busy?: boolean;
  names?: [string, string]; hints?: boolean; onToggleHints?: () => void;
  onZone?: (z: BoardZone) => void; onInspectCard?: () => void; highlight?: BoardZone | null;
  presence?: (m: PointerClientMessage) => void; participants?: ParticipantView[];
  suggestions?: boolean;
  banner?: ReactNode;
}

const TYPE_ORDER: Record<string, number> = { choose: 0, 'generated-effect': 1, counter: 2, effect: 3, score: 4, scuttle: 5, draw: 6, decline: 7, 'exhausted-pass': 8, end: 9 };

/** A compressed fan of card backs. Count is authoritative; the fan never leaks identities. */
function HandFan({ count, max = 8, small = false }: { count: number; max?: number; small?: boolean }) {
  const n = Math.min(Math.max(count, 0), max);
  return (
    <span className={`hx-fan ${small ? 'hx-fan-sm' : ''}`} aria-hidden="true">
      {Array.from({ length: n }, (_, i) => {
        const t = n <= 1 ? 0 : (i / (n - 1)) * 2 - 1;
        return <span key={i} className="hx-fan-slot" style={{ '--r': `${(t * 14).toFixed(1)}deg` } as CSSProperties}><CardFace size="sm" /></span>;
      })}
    </span>
  );
}

/** Low-profile landscape stack of trays for Draw Pile / Graveyard / Exile. */
function PileTray({ mode, top }: { mode: 'back' | 'face'; top?: GameCard }) {
  return (
    <span className="hx-tray" aria-hidden="true">
      <i className="hx-tray-l1" /><i className="hx-tray-l2" /><i className="hx-tray-l3" />
      {mode === 'face' && top
        ? <i className={`hx-tray-face ${isRed(top.rank, top.suit) ? 'is-red' : ''}`}>{top.rank}<small>{suitSymbol(top.suit)}</small></i>
        : mode === 'back' ? <i className="hx-tray-face hx-tray-back" /> : <i className="hx-tray-face hx-tray-empty" />}
    </span>
  );
}

export default function GameBoard({ view, onAction, busy = false, names, hints = true, onToggleHints, onZone, onInspectCard, highlight, presence, participants = [], banner, suggestions = true }: GameBoardProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [inspect, setInspect] = useState<GameCard | null>(null);
  const [gy, setGy] = useState(false);
  const [exileOpen, setExileOpen] = useState(false);
  const [why, setWhy] = useState<string[] | null>(null);
  const [sheet, setSheet] = useState(true);
  const [actionSearch, setActionSearch] = useState('');
  const [composer, setComposer] = useState<ComposerState | null>(null);
  const [handNav, setHandNav] = useState<[boolean, boolean]>([false, false]);
  const surface = useRef<HTMLDivElement>(null);
  const handStrip = useRef<HTMLDivElement>(null);
  const me = view.you ?? 0;
  const full = view.profile === 'intrilex-full';
  const them = 1 - me;
  const label = (p: number) => names?.[p] ?? (p === view.you ? 'You' : `Player ${p + 1}`);
  const handIds = new Set(view.hand.map(c => c.id));
  const visibleCards = [...view.hand, ...view.players.flatMap(p => [...p.pr, ...p.er, ...(p.revealedHand ?? [])]), ...(view.choice?.cards ?? []), ...(view.swapBar ?? []).flatMap(s => s.card ? [s.card] : [])];
  const suggested = useMemo(() => suggestions ? rankSuggestedMoves(view) : [], [suggestions, view]);
  const suggestedKeys = useMemo(() => new Set(suggested.map(m => m.key)), [suggested]);
  const latest = useRef(view);
  latest.current = view;
  useEffect(() => { setSelected(null); setActionSearch(''); }, [view]);
  const execute = (key: string) => {
    if (busy) return;
    const current = latest.current.legalActions.find(a => actionKey(a) === key);
    if (!current || latest.current.you === null || latest.current.winner !== null) return;
    onAction(current); setSelected(null); setActionSearch('');
  };

  const actions = useMemo(() => {
    const list = view.legalActions.filter(a => !selected || a.cardId === selected || a.targetId === selected || a.cardIds?.includes(selected) || a.targetIds?.includes(selected) || (!a.cardId && !a.targetId && !a.cardIds?.length && !a.targetIds?.length && a.type !== 'choose'));
    return list.sort((a, b) => (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9));
  }, [view.legalActions, selected]);
  // Semantic decision entries: simple actions + action families, with the search applied
  // family-aware (a family survives when its title or any variant label matches).
  const entries = useMemo(() => buildActionEntries(view, actions, actionSearch), [view, actions, actionSearch]);
  const look = useMemo(() => actionLookups(view), [view]);
  const openFamily = composer ? entries.find((e): e is Extract<ActionEntry, { kind: 'family' }> => e.kind === 'family' && e.family.id === composer.familyId)?.family : undefined;
  // Board cards that would satisfy a still-unset target parameter of the open family.
  const focusTargets = useMemo(() => {
    const ids = new Set<string>();
    if (!composer || !openFamily) return ids;
    for (const p of openFamily.params) {
      if (p.kind !== 'target' || composer.sel[p.key] !== undefined) continue;
      for (const o of paramOptions(openFamily, p, composer.sel, look)) if (o.card) ids.add(o.card.id);
    }
    return ids;
  }, [composer, openFamily, look]);
  const myDecision = view.legalActions.length > 0;
  const status = view.winner !== null ? (view.winner === 'draw' ? 'The game is drawn.' : `${label(view.winner)} ${view.winner === view.you ? 'win' : 'wins'}!`)
    : view.choice ? (view.choice.player === view.you ? 'Your choice' : `${label(view.choice.player)} is choosing`)
    : myDecision ? (view.pending.length ? 'Respond or decline' : 'Your move')
    : view.pending.length ? `${label(view.priority)} may respond` : `${label(view.activePlayer)}’s turn`;

  // While the composer is open, board/hand clicks route into the family's parameters when the
  // card is a legal option; otherwise they keep their normal "filter by card" behaviour.
  const pick = (c: GameCard) => {
    if (composer && openFamily) {
      for (const p of openFamily.params) {
        if (p.kind !== 'card' && p.kind !== 'cards' && p.kind !== 'target') continue;
        if (paramOptions(openFamily, p, composer.sel, look).some(o => o.card?.id === c.id)) {
          setComposer({ familyId: openFamily.id, sel: selectOption(openFamily, composer.sel, p.key, c.id) });
          return;
        }
      }
    }
    setSelected(s => (s === c.id ? null : c.id));
  };
  const swapSlot = (n: number, c?: GameCard) => {
    if (composer && openFamily) {
      for (const p of openFamily.params) {
        if (p.kind !== 'slot') continue;
        if (paramOptions(openFamily, p, composer.sel, look).some(o => o.value === String(n))) {
          setComposer({ familyId: openFamily.id, sel: selectOption(openFamily, composer.sel, p.key, String(n)) });
          return;
        }
      }
    }
    if (c) pick(c);
  };
  const tapTag = (c: GameCard, owner: number) =>
    full && c.tapUntil === 'score' ? `Nine Tap · 0 pts until ${label(owner)} scores`
    : full && c.tapUntil === 'hold' ? `Held · 0 pts until ${label(owner)}’s Start`
    : `Tapped · 0 pts until ${label(owner)}’s Start`;
  const tapTitle = (c: GameCard, owner: number) =>
    full && c.tapUntil === 'score' ? `Nine Tap (§26): scores 0 and stays tapped until ${label(owner)} scores a card for Points — any Points score releases it.`
    : full && c.tapUntil === 'hold' ? `Commandeered hold (⭐2): ${label(owner)} controls it; it untaps at ${label(owner)}’s next Start Phase and may then cast one free effect.`
    : `Tapped (§9): scores 0 until ${label(owner)}’s next Start Phase.`;

  // Lesson mode adds an explicit button per area rather than turning containers of cards into buttons.
  const zoneProps = (z: BoardZone) => ({ 'data-zone': z });
  const pickArea = (z: BoardZone) => onZone ? <button type="button" className="zone-pick" onClick={e => { e.stopPropagation(); onZone(z); }} onKeyDown={(e: KeyboardEvent) => e.stopPropagation()}>Pick this area</button> : null;

  const boardRow = (p: number, zone: 'pr' | 'er', cards: GameCard[]) => {
    const mine = p === view.you;
    const slotCount = Math.max(4, cards.length);
    const title = zone === 'pr' ? 'Point Row' : 'Enduring Row';
    return (
      <div className={`fc-row hx-row fc-${zone} ${highlight === zone && mine ? 'is-lesson-target' : ''}`} {...(mine ? zoneProps(zone) : { 'data-zone': `${zone}-opp` })}>
        <span className="fc-row-name hx-row-name"><b>P{p + 1}</b><span>{title} (<abbr title={title}>{zone.toUpperCase()}</abbr>)</span></span>
        {mine && pickArea(zone)}
        <div className="hx-slots" style={{ '--slots': slotCount } as CSSProperties}>
          {Array.from({ length: slotCount }, (_, i) => {
            const c = cards[i];
            if (!c) return <span key={`empty-${i}`} className="hx-slot" aria-hidden="true" />;
            return (
              <div key={c.id} className={`fc-slot ${c.hostId ? 'is-attached' : ''}`}>
                <span className="fc-card-wrap">
                  <CardFace rank={c.rank} suit={c.suit} tapped={c.tapped} attached={!!c.hostId} variant={zone === 'pr' ? 'point-row' : undefined} selected={selected === c.id} highlight={focusTargets.has(c.id) || view.legalActions.some(a => a.targetId === c.id)}
                    extraLabel={c.hostId ? `Jack attached to ${cardName(cards.find(x => x.id === c.hostId) ?? view.players[p]!.pr.find(x => x.id === c.hostId) ?? { rank: undefined })}` : undefined}
                    onClick={() => pick(c)} onDoubleClick={() => { setInspect(c); onInspectCard?.(); }} />
                  <span className="fc-flags">
                    {c.hostId && <span className="fc-tag">Jack</span>}
                    {zone === 'er' && !c.hostId && <span className="fc-tag" title={`Anchor value ${anchorValue(c)}`}>⚓ {anchorValue(c)}</span>}
                    {full && (c.aegis !== undefined || c.exileBound || c.wildBound || c.playedForEffect) && <span className="full-card-states">{[c.aegis !== undefined && 'Aegis', (c.exileBound || c.wildBound) && 'Exile-bound', c.playedForEffect && 'Played for Effect'].filter(Boolean).join(' · ')}</span>}
                    {zone === 'pr' && view.players[p]!.er.some(j => j.hostId === c.id) && <span className="fc-tag fc-tag-jacked">Jacked +1</span>}
                    {c.tapped && <span className="fc-tag fc-tag-tapped" title={tapTitle(c, p)}>{tapTag(c, p)}</span>}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const field = (p: number) => {
    const pl = view.players[p]!;
    const mine = p === view.you;
    return (
      <section className={`fc-field hx-field ${mine ? 'is-mine' : 'is-theirs'}`} aria-label={`${label(p)} field`}>
        {p === them ? <>{boardRow(p, 'er', pl.er)}{boardRow(p, 'pr', pl.pr)}</> : <>{boardRow(p, 'pr', pl.pr)}{boardRow(p, 'er', pl.er)}</>}
        {!!pl.revealedHand?.length && <details className="full-revealed" open><summary>Publicly revealed hand · {pl.revealedHand.length}</summary><div className="fc-cards">{pl.revealedHand.map(c => <CardFace key={c.id} size="sm" rank={c.rank} suit={c.suit} extraLabel="Public until recorded Start" onClick={() => setInspect(c)} />)}</div></details>}
      </section>
    );
  };

  const seatPanel = (p: number) => {
    const pl = view.players[p]!;
    const mine = p === view.you;
    return (
      <section className={`hx-panel hx-seat ${mine ? 'hx-seat-me' : 'hx-seat-opp'}`} aria-label={`${label(p)} summary`}>
        <header className="hx-seat-head">
          <span className="hx-pbadge" aria-hidden="true">P{p + 1}</span>
          <span className="hx-seat-name"><strong>{label(p)}</strong><small>{view.you === null ? `Player ${p + 1}` : mine ? 'You' : 'Opponent'}</small></span>
          <span className="hx-seat-hand" title={`${pl.handCount} cards in hand`}><i className="hx-mini-back" aria-hidden="true" />{pl.handCount}</span>
        </header>
        <div className="hx-seat-stats">
          <span className="hx-seat-stat" aria-label={`${pl.score} secured points of ${pl.goal} goal`}><b>{pl.score}</b><i>Secured</i></span>
          <span className="hx-seat-stat"><b>{pl.goal}</b><i>Goal</i></span>
          <HandFan count={pl.handCount} max={4} small />
        </div>
        {(view.activePlayer === p || pl.guard || pl.disrupted.length > 0 || full || !!pl.skips) && (
          <div className="hx-seat-pills">
            {view.activePlayer === p && view.winner === null && <span className="pill pill-active">Active turn</span>}
            {pl.guard && <span className="pill pill-guard" title={RULES.guard!.summary}>♛ Guard</span>}
            {pl.disrupted.length > 0 && <span className="pill">Disrupted: {pl.disrupted.join(', ')}</span>}
            {full && <span className="pill">Swap {pl.swapUsed ? 'used' : 'available'}</span>}
            {!!pl.skips && <span className="pill pill-warn">{pl.skips} turn skips pending</span>}
          </div>
        )}
      </section>
    );
  };

  const showWhy = () => { if (selected && handIds.has(selected)) setWhy(explainCard(view, selected)); };
  const topGy = view.graveyard.at(-1);
  const topExile = view.exile?.at(-1);
  const mtTotal = full ? Math.max(3, view.miniTurns) : Math.max(1, view.miniTurns);
  const mtDots = Math.min(view.miniTurns, mtTotal);
  const handDensity = view.hand.length <= 5 ? 'roomy' : view.hand.length <= 7 ? 'tight' : view.hand.length <= 10 ? 'overlap' : 'scroll';

  const updateHandNav = () => {
    const el = handStrip.current;
    if (!el) return;
    const l = el.scrollLeft > 4, r = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
    setHandNav(n => (n[0] === l && n[1] === r ? n : [l, r]));
  };
  useEffect(() => {
    updateHandNav();
    const el = handStrip.current;
    if (!el) return;
    const ro = new ResizeObserver(updateHandNav);
    ro.observe(el);
    window.addEventListener('resize', updateHandNav);
    return () => { ro.disconnect(); window.removeEventListener('resize', updateHandNav); };
  }, [view.hand.length]);
  const scrollHand = (dir: number) => handStrip.current?.scrollBy({ left: dir * Math.max(160, handStrip.current.clientWidth * 0.7), behavior: 'smooth' });

  return (
    <div className="fc-layout hx-layout">
      <div className="fc-status hx-status" role="status" aria-live="polite">
        <span className="hx-logo"><b>Intrilex</b><em>{full ? 'HybriX' : 'First Contact'}</em></span>
        <span className="eyebrow">{full ? 'Intrilex Full' : 'First Contact'}</span>
        <strong>{status}</strong>
        <span className="hx-stats">
          <span className="hx-stat"><i>Turn</i> {view.turn}</span>
          <span className="hx-stat"><i>Phase</i> {view.phase === 'start' ? 'Start' : view.phase === 'finished' ? 'Finished' : 'Action'}</span>
          <span className="hx-stat"><i>Window</i> {view.choice ? 'Choice' : view.pending.length ? 'Reactive' : 'Normal'}</span>
          <span className="hx-stat"><i>Actor</i> {label(view.activePlayer)}</span>
          <span className="hx-stat"><i>Priority</i> {label(view.priority)}</span>
          <span className="hx-stat hx-stat-dots"><i>Mini-Turns</i> {view.miniTurns} / {mtTotal}<span className="hx-dots" aria-hidden="true">{Array.from({ length: mtTotal }, (_, i) => <i key={i} className={i < mtDots ? 'on' : ''} />)}</span></span>
        </span>
        {view.suddenDeath && <span className="pill pill-warn">Sudden Death · {label(view.suddenDeath.player)} · {view.suddenDeath.remaining} to go</span>}
        {!!view.voltage?.length && <span className="pill">Voltage snapshot · ranks {view.voltage.join(', ')}</span>}
        {view.boardLock && <span className="pill pill-warn" title={RULES['BJ.lock']!.summary}>Board Lock · {view.boardLock.remaining} to go</span>}
        {view.exhausted !== null && <span className="pill pill-warn" title={RULES.exhausted!.summary}>Exhausted · {view.exhausted}</span>}
      </div>

      <aside className="hx-left" aria-label="Players, Swap Bar and the Stack">
        {seatPanel(them)}
        {full && (
          <div className="hx-panel full-swap hx-swap" role="group" aria-label="Swap Bar">
            <div className="hx-sec-head"><strong>Swap Bar</strong><span>{view.swapBar?.filter(s => s.card).length ?? 0} face-up · once per Full Turn</span></div>
            <div className="hx-swap-slots">
              {view.swapBar?.map(entry => (
                <div className="full-swap-slot hx-swap-slot" key={entry.slot}>
                  {entry.card ? <CardFace size="sm" rank={entry.card.rank} suit={entry.card.suit} selected={selected === entry.card.id} onClick={() => swapSlot(entry.slot, entry.card)} /> : <CardFace size="sm" onClick={() => swapSlot(entry.slot)} />}
                  <small>Slot {entry.slot + 1} · {entry.card ? 'face-up' : 'hidden'}</small>
                </div>
              ))}
              {!view.swapBar?.length && <span className="fc-empty">Swap Bar empty</span>}
            </div>
          </div>
        )}
        {seatPanel(me)}
        <div role="group" className="fc-stack hx-panel hx-stack" aria-label="Pending plays">
          <div className="hx-sec-head"><strong>Pending Plays <small>(The Stack)</small></strong><span className="hx-count-badge">{view.pending.length}</span></div>
          {view.pending.length ? [...view.pending].reverse().map((i, n) => (
            <div key={i.id} className={`fc-stack-item ${n === 0 ? 'is-top' : ''}`}>
              <span className="hx-stack-num">{n === 0 ? 'TOP' : n + 1}</span>
              {[...(i.card ? [i.card] : []), ...(i.cards ?? [])].map(c => <CardFace key={c.id} size="sm" rank={c.rank} suit={c.suit} />)}
              <span className="hx-stack-text"><b>{label(i.player)}</b> {i.label}{hints && <small>{RULES[i.ruleRef]?.ref}</small>}</span>
            </div>
          )) : <span className="hx-stack-clear">Stack clear</span>}
          {view.choice && (
            <div className="fc-choice">
              <b>{view.choice.player === view.you ? view.choice.prompt : `${label(view.choice.player)} is deciding: ${view.choice.prompt}`}</b>
              {view.choice.cards.length > 0 && <div className="fc-cards">{view.choice.cards.map(c => <CardFace key={c.id} size="sm" rank={c.rank} suit={c.suit} selected={selected === c.id} onClick={() => pick(c)} />)}</div>}
            </div>
          )}
          <small className="hx-stack-note">Resolves top → bottom · newest first</small>
        </div>
      </aside>

      <div className="fc-surface" ref={surface}
        onPointerMove={e => { if (!presence || !surface.current) return; const r = surface.current.getBoundingClientRect(); presence({ type: 'presence', x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)), surface: 'game' }); }}
        onDoubleClick={e => { if (!presence || !surface.current) return; const r = surface.current.getBoundingClientRect(); presence({ type: 'ping', x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)), surface: 'game' }); }}>
        {banner}
        {field(them)}
        <div className="hx-scrimmage" role="separator" aria-label="Line of Scrimmage">
          <span className="hx-scrim-gem" aria-hidden="true" /><span className="hx-scrim-rule" aria-hidden="true" /><b>Line of Scrimmage</b><span className="hx-scrim-rule" aria-hidden="true" /><span className="hx-scrim-gem" aria-hidden="true" />
        </div>
        {field(me)}
        <div className="fc-center hx-piles">
          <div role="group" className={`fc-pile hx-pile ${highlight === 'dp' ? 'is-lesson-target' : ''}`} {...zoneProps('dp')} aria-label={`Draw Pile, ${view.deckCount} cards`}>
            <PileTray mode="back" />
            <b>Draw Pile</b>
            <span className="hx-pile-count">{view.deckCount}</span>
            {pickArea('dp')}
          </div>
          <div role="group" className={`fc-pile hx-pile ${highlight === 'gy' ? 'is-lesson-target' : ''}`} {...zoneProps('gy')} aria-label={`Graveyard, ${view.graveyard.length} cards${topGy ? `, top card ${cardName(topGy)}` : ''}`}>
            <PileTray mode="face" top={topGy} />
            <b>Graveyard</b>
            <span className="hx-pile-count">{view.graveyard.length}</span>
            {view.graveyard.length > 0
              ? <button type="button" className="hx-pile-view" onClick={e => { e.stopPropagation(); setGy(true); }}>Click to view</button>
              : <span className="hx-pile-off">Empty</span>}
            {pickArea('gy')}
          </div>
          {full && (
            <div role="group" className="fc-pile hx-pile" aria-label={`Exile, ${view.exile?.length ?? 0} cards`}>
              <PileTray mode="face" top={topExile} />
              <b>Exile</b>
              <span className="hx-pile-count">{view.exile?.length ?? 0}</span>
              {view.exile?.length
                ? <button type="button" className="hx-pile-view" onClick={() => setExileOpen(true)}>Click to view</button>
                : <span className="hx-pile-off">Empty</span>}
            </div>
          )}
        </div>
        {view.you !== null && (
          <section className={`fc-hand hx-hand ${highlight === 'hand' ? 'is-lesson-target' : ''}`} aria-label="Your private hand" {...zoneProps('hand')}>
            <div className="hand-head"><strong>Your Hand ({view.hand.length})</strong><span>{view.players[me]!.revealedHand?.length ? 'Private except cards marked public below' : 'Private — only you see these faces'}</span>{pickArea('hand')}</div>
            <div className={`hx-hand-wrap hx-d-${handDensity}`}>
              <button type="button" className="hx-hand-arrow" aria-label="Scroll hand left" disabled={!handNav[0]} onClick={() => scrollHand(-1)}>‹</button>
              <div className="hx-hand-strip" ref={handStrip} onScroll={updateHandNav}>
                <div className="fc-cards hx-hand-cards">
                  {view.hand.map((c, i) => (
                    <span className="hx-hand-slot" key={c.id} style={{ '--i': i } as CSSProperties}>
                      <CardFace rank={c.rank} suit={c.suit} extraLabel={view.players[me]!.revealedHand?.some(r => r.id === c.id) ? 'Publicly revealed until recorded Start' : undefined} selected={selected === c.id} onClick={() => pick(c)} onDoubleClick={() => { setInspect(c); onInspectCard?.(); }} />
                    </span>
                  ))}
                  {!view.hand.length && <span className="fc-empty">No cards in hand</span>}
                </div>
              </div>
              <button type="button" className="hx-hand-arrow" aria-label="Scroll hand right" disabled={!handNav[1]} onClick={() => scrollHand(1)}>›</button>
            </div>
          </section>
        )}
        {presence && <PresenceLayer surface="game" participants={participants} />}
      </div>

      <div className="hx-right">
        <section className="hx-panel hx-ophand" aria-label={`${label(them)} hand`}>
          <div className="hx-sec-head"><strong>{view.you === null ? `${label(them)} Hand` : 'Opponent Hand'} ({view.players[them]!.handCount})</strong></div>
          <div className="hx-ophand-body">
            <HandFan count={view.players[them]!.handCount} />
            <span className="hx-ophand-count" aria-hidden="true">{view.players[them]!.handCount}</span>
          </div>
        </section>

        <aside className={`fc-panel hx-panel ${sheet ? '' : 'is-collapsed'} ${myDecision ? 'has-decision' : ''}`} aria-label="Your legal actions">
          <div className="fc-panel-head">
            <h2>{view.winner !== null ? 'Game over' : `Legal Actions (${view.legalActions.length})`}</h2>
            {onToggleHints && <button type="button" className="link-btn" onClick={onToggleHints} aria-pressed={hints}>{hints ? 'Fewer hints' : 'More hints'}</button>}
            <button type="button" className="narrow-only" aria-expanded={sheet} onClick={() => setSheet(s => !s)}>{sheet ? 'Hide' : 'Show'}</button>
          </div>
          {suggested.length > 0 && <section className="fc-suggestions" aria-label="Suggested Moves">
            <h3>Suggested Moves</h3>
            <ol>{suggested.map(move => <li key={move.key}>
              <button type="button" className="action-btn suggested-action" disabled={busy} onClick={() => execute(move.key)} aria-label={`Suggested move ${move.rank}: ${move.label}`}><span>{move.rank}. {suitSpans(move.label)}</span><small>{move.explanation}</small></button>
            </li>)}</ol>
          </section>}
          {myDecision && <h3 className="fc-possible-heading">Possible Moves</h3>}
          {selected && <div className="chip-row"><button type="button" className="chip" onClick={() => setSelected(null)}>Filtering by {suitSpans(cardName(visibleCards.find(c => c.id === selected) ?? {}))} ×</button>
            {handIds.has(selected) && <button type="button" className="chip" onClick={showWhy}>Why can / can’t I?</button>}
            <button type="button" className="chip" onClick={() => { const c = visibleCards.find(x => x.id === selected); if (c) { setInspect(c); onInspectCard?.(); } }}>Inspect</button></div>}

          {full && hints && view.phase === 'start' && <p className="muted small">Start Phase: resolve any choices, optionally use a face-down Swap, then enter the Action Phase. The listed choices come from the rules engine.</p>}
          {full && myDecision && <label className="small">Find a legal action<input type="search" value={actionSearch} onChange={e => setActionSearch(e.target.value)} placeholder="Card, mode or target…" /></label>}
          <PossibleMoves entries={entries} look={look} busy={busy} hints={hints} suggestedKeys={suggestedKeys}
            run={a => execute(actionKey(a))} composer={composer} onComposer={setComposer}
            empty={<p className="empty-note">{view.winner !== null ? 'This game is complete.' : view.you === null ? 'Spectators follow every public play. Hands stay private.' : actionSearch ? 'No legal action matches this search. Clear the search to see other choices.' : selected ? 'No legal action with this card right now.' : `Waiting for ${label(view.choice?.player ?? view.priority)}.`}</p>} />
          <GameLog history={view.history} open={hints} nameOf={label} />
        </aside>
      </div>

      {inspect && <Modal title={cardName(inspect)} onClose={() => setInspect(null)}>
        <div className="inspect-card"><CardFace size="lg" rank={inspect.rank} suit={inspect.suit} tapped={inspect.tapped} /></div>
        {full ? <><p>Full rules · <a href="#/rules" target="_blank" rel="noopener">Rules reference</a></p><ul className="rank-notes">{view.legalActions.filter(a => a.cardId === inspect.id || a.cardIds?.includes(inspect.id)).map((a, i) => <li key={i}>{explainAction(a)}</li>)}</ul><p className="muted small">Available uses depend on timing, targets, protection and the selected mode. The action panel lists the currently authorized declarations.</p></> : <RankNotes rank={inspect.rank} />}
      </Modal>}
      {gy && <Modal title={`Graveyard · ${view.graveyard.length} cards (newest last)`} onClose={() => setGy(false)} wide><div className="browse-grid">{view.graveyard.map(c => <CardFace key={c.id} size="sm" rank={c.rank} suit={c.suit} />)}</div></Modal>}
      {exileOpen && <Modal title={`Exile · ${view.exile?.length ?? 0} cards (newest last)`} onClose={() => setExileOpen(false)} wide><div className="browse-grid">{view.exile?.map(c => <CardFace key={c.id} size="sm" rank={c.rank} suit={c.suit} />)}</div></Modal>}
      {why && <Modal title="Why can / can’t I?" onClose={() => setWhy(null)}><ul className="why-list">{why.map((w, i) => <li key={i}>{suitSpans(w)}</li>)}</ul></Modal>}
    </div>
  );
}

const RANK_RULES: Record<string, string[]> = {
  A: ['A.counter', 'A.purge', 'A.anchor'], '2': ['2.quick'], '3': ['3.base', '3.instant'], '4': ['4.clear', '4.natural', '4.immunity'], '5': ['5.recycle'],
  '6': ['6.dig'], '7': ['7.base', '7.trigger'], '8': ['8.counter', '8.bonus', '8.immunity'], '9': ['9.tap', '9.goal', '9.anchor'], '10': ['FC.disabled'],
  J: ['J.disrupt', 'J.attach'], Q: ['Q.anchor', 'guard'], K: ['K.counter', 'K.anchor'], RJ: ['RJ.modes'], BJ: ['BJ.score', 'BJ.lock'],
};
export function RankNotes({ rank }: { rank: string }) {
  return <ul className="rank-notes">{(RANK_RULES[rank] ?? []).map(id => RULES[id]).filter(Boolean).map(r => <li key={r!.id}><b>{r!.title}</b> <small>{r!.ref}</small><br />{r!.summary}</li>)}</ul>;
}
