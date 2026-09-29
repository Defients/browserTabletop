import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { GameAction, GameCard, GameView } from '../../packages/intrilex/types.js';
import { RULES, anchorValue, explainAction, explainCard } from '../../packages/intrilex/index.js';
import type { PointerClientMessage, ParticipantView } from '../../packages/protocol/index.js';
import { actionKey } from '../../packages/intrilex/actionIdentity.js';
import { rankSuggestedMoves } from '../../packages/intrilex/suggestions.js';
import { CardFace, Modal, cardName, suitSpans } from './common.js';
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

export default function GameBoard({ view, onAction, busy = false, names, hints = true, onToggleHints, onZone, onInspectCard, highlight, presence, participants = [], banner, suggestions = true }: GameBoardProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [inspect, setInspect] = useState<GameCard | null>(null);
  const [gy, setGy] = useState(false);
  const [exileOpen, setExileOpen] = useState(false);
  const [why, setWhy] = useState<string[] | null>(null);
  const [sheet, setSheet] = useState(true);
  const [actionSearch, setActionSearch] = useState('');
  const surface = useRef<HTMLDivElement>(null);
  const me = view.you ?? 0;
  const full = view.profile === 'intrilex-full';
  const them = 1 - me;
  const label = (p: number) => names?.[p] ?? (p === view.you ? 'You' : `Player ${p + 1}`);
  const handIds = new Set(view.hand.map(c => c.id));
  const visibleCards = [...view.hand, ...view.players.flatMap(p => [...p.pr, ...p.er, ...(p.revealedHand ?? [])]), ...(view.choice?.cards ?? []), ...(view.swapBar ?? []).flatMap(s => s.card ? [s.card] : [])];
  const suggested = useMemo(() => suggestions ? rankSuggestedMoves(view) : [], [suggestions, view]);
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
    return list.filter(a => !actionSearch || a.label.toLocaleLowerCase().includes(actionSearch.trim().toLocaleLowerCase())).sort((a, b) => (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9));
  }, [view.legalActions, selected, actionSearch]);
  const myDecision = view.legalActions.length > 0;
  const status = view.winner !== null ? (view.winner === 'draw' ? 'The game is drawn.' : `${label(view.winner)} ${view.winner === view.you ? 'win' : 'wins'}!`)
    : view.choice ? (view.choice.player === view.you ? 'Your choice' : `${label(view.choice.player)} is choosing`)
    : myDecision ? (view.pending.length ? 'Respond or decline' : 'Your move')
    : view.pending.length ? `${label(view.priority)} may respond` : `${label(view.activePlayer)}’s turn`;

  const pick = (c: GameCard) => setSelected(s => (s === c.id ? null : c.id));
  const tapTag = (c: GameCard, owner: number) =>
    full && c.tapUntil === 'score' ? `Nine Tap · 0 pts until ${label(owner)} scores`
    : full && c.tapUntil === 'hold' ? `Held · 0 pts until ${label(owner)}’s Start`
    : `Tapped · 0 pts until ${label(owner)}’s Start`;
  const tapTitle = (c: GameCard, owner: number) =>
    full && c.tapUntil === 'score' ? `Nine Tap (§26): scores 0 and stays tapped until ${label(owner)} scores a card for Points — any Points score releases it.`
    : full && c.tapUntil === 'hold' ? `Commandeered hold (⭐2): ${label(owner)} controls it; it untaps at ${label(owner)}’s next Start Phase and may then cast one free effect.`
    : `Tapped (§9): scores 0 until ${label(owner)}’s next Start Phase.`;
  const cardsRow = (items: GameCard[], empty: string, zone: 'pr' | 'er', owner: number) => (
    <div className="fc-cards">
      {items.length ? items.map(c => (
        <div key={c.id} className={`fc-slot ${c.hostId ? 'is-attached' : ''}`}>
          <CardFace rank={c.rank} suit={c.suit} tapped={c.tapped} attached={!!c.hostId} selected={selected === c.id} highlight={view.legalActions.some(a => a.targetId === c.id)}
            extraLabel={c.hostId ? `Jack attached to ${cardName(items.find(x => x.id === c.hostId) ?? view.players[owner]!.pr.find(x => x.id === c.hostId) ?? { rank: undefined })}` : undefined}
            onClick={() => pick(c)} onDoubleClick={() => { setInspect(c); onInspectCard?.(); }} />
          {c.hostId && <span className="fc-tag">Jack</span>}
          {zone === 'er' && !c.hostId && <span className="fc-tag" title={`Anchor value ${anchorValue(c)}`}>⚓ {anchorValue(c)}</span>}
          {full && (c.aegis !== undefined || c.exileBound || c.wildBound || c.playedForEffect) && <span className="full-card-states">{[c.aegis !== undefined && 'Aegis', (c.exileBound || c.wildBound) && 'Exile-bound', c.playedForEffect && 'Played for Effect'].filter(Boolean).join(' · ')}</span>}
          {zone === 'pr' && view.players[owner]!.er.some(j => j.hostId === c.id) && <span className="fc-tag fc-tag-jacked">Jacked +1</span>}
          {c.tapped && <span className="fc-tag fc-tag-tapped" title={tapTitle(c, owner)}>{tapTag(c, owner)}</span>}
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
          {full && <span className="pill">Swap {pl.swapUsed ? 'used' : 'available'}</span>}
          {!!pl.skips && <span className="pill pill-warn">{pl.skips} turn skips pending</span>}
          <span className="fc-score" aria-label={`${pl.score} secured points of ${pl.goal} goal`}><b>{pl.score}</b> / {pl.goal}<small>secured / Goal</small></span>
        </header>
        <div className={`fc-row fc-er ${highlight === 'er' && mine ? 'is-lesson-target' : ''}`} {...(mine ? zoneProps('er') : { 'data-zone': 'er-opp' })}>
          <span className="fc-row-name">Enduring Row <abbr title="Enduring Row">ER</abbr></span>{mine && pickArea('er')}{cardsRow(pl.er, 'Anchors and Attachments', 'er', p)}
        </div>
        <div className={`fc-row fc-pr ${highlight === 'pr' && mine ? 'is-lesson-target' : ''}`} {...(mine ? zoneProps('pr') : { 'data-zone': 'pr-opp' })}>
          <span className="fc-row-name">Point Row <abbr title="Point Row">PR</abbr></span>{mine && pickArea('pr')}{cardsRow(pl.pr, 'Scored cards', 'pr', p)}
        </div>
        {!!pl.revealedHand?.length && <details className="full-revealed" open><summary>Publicly revealed hand · {pl.revealedHand.length}</summary><div className="fc-cards">{pl.revealedHand.map(c => <CardFace key={c.id} size="sm" rank={c.rank} suit={c.suit} extraLabel="Public until recorded Start" onClick={() => setInspect(c)} />)}</div></details>}
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
          <span className="eyebrow">{full ? 'Intrilex Full' : 'First Contact'} · Turn {view.turn}{full && ` · ${view.phase === 'start' ? 'Start Phase' : view.phase === 'finished' ? 'Finished' : 'Action Phase'}`}</span>
          <strong>{status}</strong>
          <span>{view.winner === null && `${label(view.activePlayer)}: ${full ? `${view.miniTurns} Mini-Turn${view.miniTurns === 1 ? '' : 's'} left` : view.miniTurns ? '1 Action left' : 'Action spent'}`}</span>
          {full && view.miniTurnsGranted !== undefined && <span className="pill">{view.miniTurnsGranted} / 3 Mini-Turns granted</span>}
          {view.suddenDeath && <span className="pill pill-warn">Sudden Death · {label(view.suddenDeath.player)} · {view.suddenDeath.remaining} to go</span>}
          {!!view.voltage?.length && <span className="pill">Voltage snapshot · ranks {view.voltage.join(', ')}</span>}
          {view.boardLock && <span className="pill pill-warn" title={RULES['BJ.lock']!.summary}>Board Lock · {view.boardLock.remaining} to go</span>}
          {view.exhausted !== null && <span className="pill pill-warn" title={RULES.exhausted!.summary}>Exhausted · {view.exhausted}</span>}
        </div>
        {full && <section className="full-shared" aria-label="Full shared zones">
          <div className="full-swap" role="group" aria-label="Swap Bar"><div className="hand-head"><strong>Swap Bar</strong><span>Once per Full Turn · finite supply</span></div><div className="fc-cards">
            {view.swapBar?.map(entry => <div className="full-swap-slot" key={entry.slot}>{entry.card ? <CardFace size="sm" rank={entry.card.rank} suit={entry.card.suit} selected={selected === entry.card.id} onClick={() => pick(entry.card!)} /> : <CardFace size="sm" />}<small>Slot {entry.slot + 1} · {entry.card ? 'face-up' : 'hidden'}</small></div>)}
            {!view.swapBar?.length && <span className="fc-empty">Swap Bar empty</span>}
          </div></div>
          <div className="full-exile" role="group" aria-label={`Exile, ${view.exile?.length ?? 0} cards`}><strong>Exile · {view.exile?.length ?? 0}</strong><p className="muted small">Public · newest last</p><button type="button" disabled={!view.exile?.length} onClick={() => setExileOpen(true)}>Browse Exile</button></div>
        </section>}
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
                {[...(i.card ? [i.card] : []), ...(i.cards ?? [])].map(c => <CardFace key={c.id} size="sm" rank={c.rank} suit={c.suit} />)}
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
            <div className="hand-head"><strong>Your hand</strong><span>{view.players[me]!.revealedHand?.length ? 'Private except cards marked public below' : 'Private — only you see these faces'}</span>{pickArea('hand')}</div>
            <div className="fc-cards">
              {view.hand.map(c => <CardFace key={c.id} rank={c.rank} suit={c.suit} extraLabel={view.players[me]!.revealedHand?.some(r => r.id === c.id) ? 'Publicly revealed until recorded Start' : undefined} selected={selected === c.id} onClick={() => pick(c)} onDoubleClick={() => { setInspect(c); onInspectCard?.(); }} />)}
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
        {suggested.length > 0 && <section className="fc-suggestions" aria-label="Suggested Moves">
          <h3>Suggested Moves</h3>
          <p className="muted small">{view.legalActions.length <= 2 ? 'These are the available legal choices for this decision.' : 'Advice from your visible cards and public board. Every legal choice remains below.'}</p>
          <ol>{suggested.map(move => <li key={move.key}>
            <button type="button" className="action-btn suggested-action" disabled={busy} onClick={() => execute(move.key)} aria-label={`Suggested move ${move.rank}: ${move.label}`}><span>{move.rank}. {suitSpans(move.label)}</span><small>{move.explanation}</small></button>
          </li>)}</ol>
        </section>}
        {myDecision && <h3 className="fc-possible-heading">Possible Moves</h3>}
        {selected && <div className="chip-row"><button type="button" className="chip" onClick={() => setSelected(null)}>Filtering by {suitSpans(cardName(visibleCards.find(c => c.id === selected) ?? {}))} ×</button>
          {handIds.has(selected) && <button type="button" className="chip" onClick={showWhy}>Why can / can’t I?</button>}
          <button type="button" className="chip" onClick={() => { const c = visibleCards.find(x => x.id === selected); if (c) { setInspect(c); onInspectCard?.(); } }}>Inspect</button></div>}
        {hints && !selected && myDecision && <p className="muted small">Select a card to focus its choices. Legal choices only are listed; the engine checks them again.</p>}
        {full && hints && view.phase === 'start' && <p className="muted small">Start Phase: resolve any choices, optionally use a face-down Swap, then enter the Action Phase. The listed choices come from the rules engine.</p>}
        {full && myDecision && <label className="small">Find a legal action<input type="search" value={actionSearch} onChange={e => setActionSearch(e.target.value)} placeholder="Card, mode or target…" /></label>}
        <div className="fc-actions">
          {actions.map((a, i) => (
            <button type="button" title={explainAction(a)} key={`${actionKey(a)}|${i}`} className={`action-btn action-${a.type}`} disabled={busy} onClick={() => execute(actionKey(a))}>
              <span>{suitSpans(a.label)}</span>{hints && RULES[a.ruleRef] && <small>{RULES[a.ruleRef]!.ref}</small>}
            </button>
          ))}
          {!actions.length && <p className="empty-note">{view.winner !== null ? 'This game is complete.' : view.you === null ? 'Spectators follow every public play. Hands stay private.' : actionSearch ? 'No legal action matches this search. Clear the search to see other choices.' : selected ? 'No legal action with this card right now.' : `Waiting for ${label(view.choice?.player ?? view.priority)}.`}</p>}
        </div>
        <GameLog history={view.history} open={hints} nameOf={label} />
      </aside>

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
