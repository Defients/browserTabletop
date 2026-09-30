import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { GameAction } from '../../packages/intrilex/types.js';
import { RULES, explainAction } from '../../packages/intrilex/index.js';
import { actionKey } from '../../packages/intrilex/actionIdentity.js';
import {
  effectiveSelection, paramOptions, previewText, reconcileSelection, resolvedAction, selectOption,
  type ActionEntry, type ActionFamily, type ActionLookups, type ParamOption, type ParamSpec, type Selection,
} from '../../packages/intrilex/presentation.js';
import { CardFace, suitSpans } from './common.js';

export interface ComposerState { familyId: string; sel: Selection }

export interface PossibleMovesProps {
  entries: ActionEntry[];
  look: ActionLookups;
  busy: boolean;
  hints: boolean;
  suggestedKeys: Set<string>;
  run: (a: GameAction) => void;
  composer: ComposerState | null;
  onComposer: (c: ComposerState | null) => void;
  empty: ReactNode;
}

const domId = (familyId: string) => `fc-fam-${familyId.replace(/[^\w-]/g, '_')}`;

/**
 * The Possible Moves list: semantic action entries. Single-variant entries render as the
 * familiar direct action buttons; multi-variant families render one calm row that either
 * expands inline options or drills down into the parameterised Action Composer.
 */
export default function PossibleMoves({ entries, look, busy, hints, suggestedKeys, run, composer, onComposer, empty }: PossibleMovesProps) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const composerRef = useRef<HTMLDivElement>(null);
  const openFamily = composer ? entries.find((e): e is Extract<ActionEntry, { kind: 'family' }> => e.kind === 'family' && e.family.id === composer.familyId)?.family : undefined;

  // Live-state reconciliation: close the composer when its family is no longer legal, and
  // prune selections that the newest legal-action set no longer admits.
  useEffect(() => {
    if (!composer) return;
    if (!openFamily) { onComposer(null); return; }
    const next = reconcileSelection(openFamily, composer.sel);
    if (JSON.stringify(next) !== JSON.stringify(composer.sel)) onComposer({ familyId: openFamily.id, sel: next });
  }, [composer, openFamily, onComposer]);
  useEffect(() => { if (openFamily) composerRef.current?.focus(); }, [openFamily?.id]);
  useEffect(() => {
    const ids = new Set(entries.filter(e => e.kind === 'family').map(e => e.family.id));
    setExpanded(prev => { const keep = [...prev].filter(id => ids.has(id)); return keep.length === prev.size ? prev : new Set(keep); });
  }, [entries]);

  const pick = (family: ActionFamily, key: string, value: string) => onComposer({ familyId: family.id, sel: selectOption(family, composer!.sel, key, value) });
  const back = (family: ActionFamily) => {
    onComposer(null);
    requestAnimationFrame(() => document.getElementById(domId(family.id))?.focus());
  };

  const rowFor = (family: ActionFamily) => {
    const anySuggested = family.variants.some(v => suggestedKeys.has(actionKey(v)));
    const cls = `action-btn action-family action-${family.variants[0]!.type} ${anySuggested ? 'is-suggested' : ''}`;
    const labels = family.variants.map(v => v.label).join('||');
    if (family.presentation === 'inline') {
      const open = expanded.has(family.id);
      const param = family.params.find(p => new Set(family.variants.map(v => JSON.stringify(p.get(v)))).size > 1) ?? family.params[0]!;
      const options = paramOptions(family, param, {}, look);
      return (
        <div key={family.id} className="fc-fam">
          <button type="button" id={domId(family.id)} title={family.detail ?? family.title} data-ic={family.icon} data-labels={labels} aria-expanded={open}
            className={cls} disabled={busy}
            onClick={() => setExpanded(s => { const n = new Set(s); if (n.has(family.id)) n.delete(family.id); else n.add(family.id); return n; })}>
            <span>{suitSpans(family.title)}</span>
            {hints && family.ruleRef && RULES[family.ruleRef] && <small>{RULES[family.ruleRef]!.ref}</small>}
            <span className="fc-fam-count">{family.variants.length} {open ? '▴' : '▾'}</span>
          </button>
          {open && (
            <div className="fc-inline-opts" role="group" aria-label={`${family.title} options`}>
              {options.map(o => {
                const a = resolvedAction(family, { [param.key]: o.value });
                return <Opt key={o.value} kind={param.kind} opt={o} busy={busy} aria={a?.label} onPick={() => a && run(a)} />;
              })}
            </div>
          )}
        </div>
      );
    }
    return (
      <button type="button" key={family.id} id={domId(family.id)} title={family.detail ?? family.title} data-ic={family.icon} data-labels={labels}
        className={cls} disabled={busy}
        onClick={() => onComposer({ familyId: family.id, sel: {} })}>
        <span>{suitSpans(family.title)}</span>
        {hints && family.ruleRef && RULES[family.ruleRef] && <small>{RULES[family.ruleRef]!.ref}</small>}
        <span className="fc-fam-count">{family.variants.length} ›</span>
      </button>
    );
  };

  if (openFamily && composer) {
    const family = openFamily;
    const sel = composer.sel;
    const eff = effectiveSelection(family, sel);
    const resolved = resolvedAction(family, sel);
    const preview = previewText(family, sel, look);
    return (
      <div className="fc-actions">
        <div className="fc-composer" ref={composerRef} tabIndex={-1} data-family={family.id}
          onKeyDown={(e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); back(family); } }}>
          <div className="fc-composer-top">
            <button type="button" className="fc-back link-btn" onClick={() => back(family)}>‹ Possible Moves</button>
            <span className="fc-fam-count" aria-hidden="true">{family.variants.length}</span>
          </div>
          <header className="fc-composer-head">
            <span className="fc-composer-ic" aria-hidden="true">{family.icon}</span>
            <div className="fc-composer-title"><b>{suitSpans(family.title)}</b>{family.detail && <small>{suitSpans(family.detail)}</small>}</div>
          </header>
          {family.params.map(p => (
            <ParamSection key={p.key} family={family} param={p} sel={sel} auto={eff[p.key]} look={look} busy={busy} onPick={v => pick(family, p.key, v)} />
          ))}
          <p className="fc-preview" aria-live="polite">{suitSpans(preview)}</p>
          <div className="fc-composer-foot">
            <button type="button" className="fc-confirm primary" disabled={busy || !resolved} onClick={() => resolved && run(resolved)}>
              {resolved ? 'Confirm' : 'Choose options'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fc-actions">
      {entries.map((e, i) => e.kind === 'action' ? (
        <button type="button" title={explainAction(e.action)} key={`${e.key}|${i}`} data-ic={ICON[e.action.type] ?? '·'}
          className={`action-btn action-${e.action.type} ${suggestedKeys.has(e.key) ? 'is-suggested' : ''}`} disabled={busy}
          onClick={() => run(e.action)}>
          <span>{suitSpans(e.action.label)}</span>{hints && RULES[e.action.ruleRef] && <small>{RULES[e.action.ruleRef]!.ref}</small>}
        </button>
      ) : rowFor(e.family))}
      {!entries.length && empty}
    </div>
  );
}

const ICON: Record<string, string> = {
  choose: '◈', 'generated-effect': '✧', counter: '✕', effect: '✦', score: '▲', scuttle: '⚔',
  draw: '▽', decline: '↩', 'exhausted-pass': '∅', end: '⏵', 'start-action': '▶',
  'swap-down': '⇅', 'swap-draw': '⇄', 'draw-cast': '✳', voltage: '⚡',
};

function ParamSection({ family, param, sel, auto, look, busy, onPick }: {
  family: ActionFamily; param: ParamSpec; sel: Selection; auto: string | string[] | undefined;
  look: ActionLookups; busy: boolean; onPick: (v: string) => void;
}) {
  const options = useMemo(() => paramOptions(family, param, sel, look), [family, param, sel, look]);
  const picked = sel[param.key];
  const forced = picked === undefined && auto !== undefined;
  return (
    <section className="fc-param" aria-label={param.label}>
      <h4 className="fc-param-name">{param.label}</h4>
      <div className="fc-opts">
        {!options.length && <span className="fc-param-hint">{picked ? 'Chosen' : 'Determined by other choices'}</span>}
        {options.map(o => <Opt key={o.value} kind={param.kind} opt={o} busy={busy} forced={forced && (Array.isArray(auto) ? auto.includes(o.value) : auto === o.value)} onPick={() => onPick(o.value)} />)}
      </div>
    </section>
  );
}

/** One parameter option: mini card face for card-valued picks, text chip otherwise. */
function Opt({ kind, opt, busy, forced = false, aria, onPick }: { kind: ParamSpec['kind']; opt: ParamOption; busy: boolean; forced?: boolean; aria?: string; onPick: () => void }) {
  const on = opt.selected || forced;
  if (kind === 'slot' || kind === 'card' || kind === 'cards' || opt.card) {
    return (
      <button type="button" className={`fc-opt fc-opt-card ${on ? 'is-on' : ''}`} aria-pressed={on} disabled={busy} onClick={onPick} aria-label={aria ?? opt.label}>
        <CardFace size="sm" rank={opt.card?.rank} suit={opt.card?.suit} />
        <span>{suitSpans(opt.label)}</span>
      </button>
    );
  }
  return (
    <button type="button" className={`fc-opt ${on ? 'is-on' : ''}`} aria-pressed={on} disabled={busy} onClick={onPick} aria-label={aria ?? opt.label}>
      {suitSpans(opt.label)}
    </button>
  );
}
