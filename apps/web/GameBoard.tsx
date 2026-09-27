import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { GameAction, GameCard, GameView } from '../../packages/intrilex/types.js';
import { RULES, explainCard } from '../../packages/intrilex/index.js';
import type { ClientMessage, ParticipantView } from '../../packages/protocol/index.js';
import { CardFace, Modal, cardName } from './common.js';
import { PresenceLayer } from './Presence.js';

export type BoardZone = 'hand' | 'dp' | 'pr' | 'er' | 'gy';
export interface GameBoardProps {
  view: GameView; onAction: (a: GameAction) => unknown; busy?: boolean;
  names?: [string, string]; hints?: boolean; onToggleHints?: () => void;
  onZone?: (z: BoardZone) => void; onInspectCard?: () => void; highlight?: BoardZone | null;
  presence?: (m: ClientMessage) => void; participants?: ParticipantView[];
  banner?: ReactNode;
}

const TYPE_ORDER: Record<string, number> = { choose: 0, 'generated-effect': 1, counter: 2, effect: 3, score: 4, scuttle: 5, draw: 6, decline: 7, 'exhausted-pass': 8, end: 9 };

export default function GameBoard({ view, onAction, busy = false, names, hints = true, onToggleHints, onZone, onInspectCard, highlight, presence, participants = [], banner }: GameBoardProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [inspect, setInspect] = useState<GameCard | null>(null);
  const [gy, setGy] = useState(false);
  const [why, setWhy] = useState<string[] | null>(null);
  const [sheet, setSheet] = useState(true);
  const surface = useRef<HTMLDivElement>(null);
  const me = view.you ?? 0;
  const them = 1 - me;
  const label = (p: number) => names?.[p] ?? (p === view.you ? 'You' : `Player ${p + 1}`);
  const handIds = new Set(view.hand.map(c => c.id));

  const actions = useMemo(() => {
    const list = view.legalActions.filter(a => !selected || a.cardId === selected || a.targetId === selected || (!a.cardId && !a.targetId && a.type !== 'choose'));
    return list.slice().sort((a, b) => (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9));
  }, [view.legalActions, selected]);
  const myDecision = view.legalActions.length > 0;
  const status = view.winner !== null ? (view.winner === 'draw' ? 'The game is drawn.' : `${label(view.winner)} ${view.winner === view.you ? 'win' : 'wins'}!`)
    : view.choice ? (view.choice.player === view.you ? 'Your choice' : `${label(view.choice.player)} is choosing`)
    : myDecision ? (view.pending.length ? 'Respond or decline' : 'Your move')
    : view.pending.length ? `${label(view.priority)} may respond` : `${label(view.activePlayer)}’s turn`;

  const pick = (c: GameCard) => setSelected(s => (s === c.id ? null : c.id));
  const cardsRow = (items: GameCard[], empty: string, zone: 'pr' | 'er', owner: number) => (
    <div className="fc-cards">
      {items.length ? items.map(c => (
        <div key={c.id} className={`fc-slot ${c.hostId ? 'is-attached' : ''}`}>
          <CardFace rank={c.rank} suit={c.suit} tapped={c.tapped} attached={!!c.hostId} selected={selected === c.id} highlight={view.legalActions.some(a => a.targetId === c.id)}
            extraLabel={c.hostId ? `Jack attached to ${cardName(items.find(x => x.id === c.hostId) ?? view.players[owner]!.pr.find(x => x.id === c.hostId) ?? { rank: undefined })}` : undefined}
            onClick={() => pick(c)} onDoubleClick={() => { setInspect(c); onInspectCard?.(); }} />
          {c.hostId && <span className="fc-tag">Jack</span>}
          {zone === 'pr' && view.players[owner]!.er.some(j => j.hostId === c.id) && <span className="fc-tag fc-tag-jacked">Jacked +1</span>}
        </div>
      )) : <span className="fc-empty">{empty}</span>}
    </div>
  );
  // Lesson mode adds an explicit button per area rather than turning containers of cards into buttons.
  const zoneProps = (z: BoardZone) => ({ 'data-zone': z });
  const pickArea = (z: BoardZone) => onZone ? <button type="button" className="zone-pick" onClick={e => { e.stopPropagation(); onZone(z); }} onKeyDown={(e: KeyboardEvent) => e.stopPropagation()}>Pick this area</button> : null;
  const field = (p: number) => {
    const pl = view.players[p]!;
    const mine = p === view.you;
    return (
      <section className={`fc-field ${mine ? 'is-mine' : 'is-theirs'}`} aria-label={`${label(p)} field`}>
        <header className="fc-field-head">
          <strong>{label(p)}</strong>
          {view.activePlayer === p && view.winner === null && <span className="pill pill-active">Active turn</span>}
          <span className="pill">{pl.handCount} in hand</span>
          {pl.guard && <span className="pill pill-guard" title={RULES.guard!.summary}>♛ Guard</span>}
          {pl.disrupted.length > 0 && <span className="pill">Disrupted: {pl.disrupted.join(', ')}</span>}
          <span className="fc-score" aria-label={`${pl.score} secured points of ${pl.goal} goal`}><b>{pl.score}</b> / {pl.goal}<small>secured / Goal</small></span>
        </header>
        <div className={`fc-row fc-er ${highlight === 'er' && mine ? 'is-lesson-target' : ''}`} {...(mine ? zoneProps('er') : { 'data-zone': 'er-opp' })}>
          <span className="fc-row-name">Enduring Row <abbr title="Enduring Row">ER</abbr></span>{mine && pickArea('er')}{cardsRow(pl.er, 'Anchors and Attachments', 'er', p)}
        </div>
        <div className={`fc-row fc-pr ${highlight === 'pr' && mine ? 'is-lesson-target' : ''}`} {...(mine ? zoneProps('pr') : { 'data-zone': 'pr-opp' })}>
          <span className="fc-row-name">Point Row <abbr title="Point Row">PR</abbr></span>{mine && pickArea('pr')}{cardsRow(pl.pr, 'Scored cards', 'pr', p)}
        </div>
      </section>
    );
  };
  const showWhy = () => { if (selected && handIds.has(selected)) setWhy(explainCard(view, selected)); };
  const topGy = view.graveyard.at(-1);

  return (
    <div className="fc-layout">
      <div className="fc-surface" ref={surface}
        onPointerMove={e => { if (!presence || !surface.current) return; const r = surface.current.getBoundingClientRect(); presence({ type: 'presence', x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)), surface: 'game' }); }}
        onDoubleClick={e => { if (!presence || !surface.current) return; const r = surface.current.getBoundingClientRect(); presence({ type: 'ping', x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)), surface: 'game' }); }}>
        {banner}
        <div className="fc-status" role="status" aria-live="polite">
          <span className="eyebrow">First Contact · Turn {view.turn}</span>
          <strong>{status}</strong>
          <span>{view.winner === null && `${label(view.activePlayer)}: ${view.miniTurns ? '1 Action left' : 'Action spent'}`}</span>
          {view.boardLock && <span className="pill pill-warn" title={RULES['BJ.lock']!.summary}>Board Lock · {view.boardLock.remaining} to go</span>}
          {view.exhausted !== null && <span className="pill pill-warn" title={RULES.exhausted!.summary}>Exhausted · {view.exhausted}</span>}
        </div>
        {field(them)}
        <div className="fc-center">
          <div role="group" className={`fc-pile ${highlight === 'dp' ? 'is-lesson-target' : ''}`} {...zoneProps('dp')} aria-label={`Draw Pile, ${view.deckCount} cards`}>
            {view.deckCount ? <CardFace size="sm" /> : <span className="fc-empty-pile">empty</span>}<span><b>Draw Pile</b> DP · {view.deckCount}</span>{pickArea('dp')}
          </div>
          <div role="group" className={`fc-pile ${highlight === 'gy' ? 'is-lesson-target' : ''}`} {...zoneProps('gy')} aria-label={`Graveyard, ${view.graveyard.length} cards${topGy ? `, top card ${cardName(topGy)}` : ''}`}>
            {topGy ? <CardFace size="sm" rank={topGy.rank} suit={topGy.suit} /> : <span className="fc-empty-pile">empty</span>}
            <span><b>Graveyard</b> GY · {view.graveyard.length}</span>{pickArea('gy')}
            {view.graveyard.length > 0 && <button type="button" className="link-btn" onClick={e => { e.stopPropagation(); setGy(true); }}>Browse</button>}
          </div>
          <div role="group" className="fc-stack" aria-label="Pending plays">
            <span className="eyebrow">Stack · newest first</span>
            {view.pending.length ? [...view.pending].reverse().map((i, n) => (
              <div key={i.id} className={`fc-stack-item ${n === 0 ? 'is-top' : ''}`}>
                {i.card && <CardFace size="sm" rank={i.card.rank} suit={i.card.suit} />}
                <span><b>{label(i.player)}</b> {i.label}{hints && <small>{RULES[i.ruleRef]?.ref}</small>}</span>
              </div>
            )) : <span className="fc-empty">Nothing pending</span>}
            {view.choice && (
              <div className="fc-choice">
                <b>{view.choice.player === view.you ? view.choice.prompt : `${label(view.choice.player)} is deciding: ${view.choice.prompt}`}</b>
                {view.choice.cards.length > 0 && <div className="fc-cards">{view.choice.cards.map(c => <CardFace key={c.id} size="sm" rank={c.rank} suit={c.suit} selected={selected === c.id} onClick={() => pick(c)} />)}</div>}
              </div>
            )}
          </div>
        </div>
        {field(me)}
        {view.you !== null && (
          <section className={`fc-hand ${highlight === 'hand' ? 'is-lesson-target' : ''}`} aria-label="Your private hand" {...zoneProps('hand')}>
            <div className="hand-head"><strong>Your hand</strong><span>Private — only you see these faces</span>{pickArea('hand')}</div>
            <div className="fc-cards">
              {view.hand.map(c => <CardFace key={c.id} rank={c.rank} suit={c.suit} selected={selected === c.id} onClick={() => pick(c)} onDoubleClick={() => { setInspect(c); onInspectCard?.(); }} />)}
              {!view.hand.length && <span className="fc-empty">No cards in hand</span>}
            </div>
          </section>
        )}
        {presence && <PresenceLayer surface="game" participants={participants} />}
      </div>

      <aside className={`fc-panel ${sheet ? '' : 'is-collapsed'} ${myDecision ? 'has-decision' : ''}`} aria-label="Your legal actions">
        <div className="fc-panel-head">
          <h2>{view.winner !== null ? 'Game over' : myDecision ? `Choose a legal action (${view.legalActions.length})` : 'Waiting'}</h2>
          {onToggleHints && <button type="button" className="link-btn" onClick={onToggleHints} aria-pressed={hints}>{hints ? 'Fewer hints' : 'More hints'}</button>}
          <button type="button" className="narrow-only" aria-expanded={sheet} onClick={() => setSheet(s => !s)}>{sheet ? 'Hide' : 'Show'}</button>
        </div>
        {selected && <div className="chip-row"><button type="button" className="chip" onClick={() => setSelected(null)}>Filtering by {cardName([...view.hand, ...view.players.flatMap(p => [...p.pr, ...p.er]), ...(view.choice?.cards ?? [])].find(c => c.id === selected) ?? {})} ×</button>
          {handIds.has(selected) && <button type="button" className="chip" onClick={showWhy}>Why can / can’t I?</button>}
          <button type="button" className="chip" onClick={() => { const c = [...view.hand, ...view.players.flatMap(p => [...p.pr, ...p.er])].find(x => x.id === selected); if (c) { setInspect(c); onInspectCard?.(); } }}>Inspect</button></div>}
        {hints && !selected && myDecision && <p className="muted small">Select a card to focus its choices. Legal choices only are listed; the engine checks them again.</p>}
        <div className="fc-actions">
          {actions.map((a, i) => (
            <button type="button" key={`${a.type}|${a.cardId}|${a.targetId}|${a.mode}|${i}`} className={`action-btn action-${a.type}`} disabled={busy} onClick={() => { onAction(a); setSelected(null); }}>
              <span>{a.label}</span>{hints && RULES[a.ruleRef] && <small>{RULES[a.ruleRef]!.ref}</small>}
            </button>
          ))}
          {!actions.length && <p className="empty-note">{view.winner !== null ? 'This game is complete.' : view.you === null ? 'Spectators follow every public play. Hands stay private.' : selected ? 'No legal action with this card right now.' : `Waiting for ${label(view.choice?.player ?? view.priority)}.`}</p>}
        </div>
        <details className="fc-history" open={hints}>
          <summary>What happened?</summary>
          <ol reversed>{view.history.slice(-14).reverse().map((h, i) => <li key={i}>{h}</li>)}</ol>
        </details>
      </aside>

      {inspect && <Modal title={cardName(inspect)} onClose={() => setInspect(null)}>
        <div className="inspect-card"><CardFace size="lg" rank={inspect.rank} suit={inspect.suit} tapped={inspect.tapped} /></div>
        <RankNotes rank={inspect.rank} />
      </Modal>}
      {gy && <Modal title={`Graveyard · ${view.graveyard.length} cards (newest last)`} onClose={() => setGy(false)} wide><div className="browse-grid">{view.graveyard.map(c => <CardFace key={c.id} size="sm" rank={c.rank} suit={c.suit} />)}</div></Modal>}
      {why && <Modal title="Why can / can’t I?" onClose={() => setWhy(null)}><ul className="why-list">{why.map((w, i) => <li key={i}>{w}</li>)}</ul></Modal>}
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
