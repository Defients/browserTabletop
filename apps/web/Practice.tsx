import { useEffect, useMemo, useRef, useState } from 'react';
import { applyTable, artIndex, createTable, projectTable, secureRandom, TableError, type TableCommand, type TableState } from '../../packages/tabletop/index.js';
import { applyGame, chooseBotAction, createGame, projectGame, assertGameIntegrity, normalizeGameState, type GameAction, type GameState } from '../../packages/intrilex/index.js';
import { HeaderContext, Modal, loadLocal, saveLocal } from './common.js';
import { allTemplates, findTemplate } from './Library.js';
import TableBoard from './TableBoard.js';
import GameBoard from './GameBoard.js';

/** Local practice: the same domain engines, saved only in this browser, never presented as an invitation. */
function LocalBanner({ children }: { children?: React.ReactNode }) {
  return <p className="notice small"><b>Local practice.</b> Runs and saves only in this browser — there is no invitation or server. {children}</p>;
}

export function LocalTable({ templateId }: { templateId?: string }) {
  const template = findTemplate(templateId) ?? findTemplate('standard-54')!;
  const key = `tabletop.local.table.${template.id}`;
  const [state, setState] = useState<TableState>(() => { const saved = loadLocal<TableState | null>(key, null); return saved?.version === 1 ? saved : createTable(template, secureRandom); });
  const [seat, setSeat] = useState(0);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [saved, setSaved] = useState(true);
  const art = useMemo(() => artIndex(template).images, [template]);
  useEffect(() => { setSaved(saveLocal(key, state)); }, [key, state]);
  const view = useMemo(() => projectTable(state, seat), [state, seat]);
  const onCommand = (c: TableCommand) => {
    try { setState(s => applyTable(s, { seat, host: true }, c, secureRandom)); setError(''); }
    catch (e) { setError(e instanceof TableError ? e.message : 'That action is not allowed.'); }
  };
  return (
    <div className="room">
      <HeaderContext>
        <div className="room-head">
          <div className="room-title"><h1>{template.title}</h1><span className="badge">Local practice</span></div>
          <span className={`save-state save-${saved ? 'saved' : 'failed'}`} role="status">{saved ? 'Saved on this device' : 'Could not save (storage full?)'}</span>
          <div className="button-row">
            <label className="inline-field">View as<select value={seat} onChange={e => setSeat(Number(e.target.value))}>{Array.from({ length: template.seats }, (_, s) => <option key={s} value={s}>Seat {s + 1}</option>)}</select></label>
            <label className="inline-field">Template<select value={template.id} onChange={e => { location.hash = `#/practice/table/${encodeURIComponent(e.target.value)}`; }}>{allTemplates().filter(t => t.profile !== 'intrilex-first-contact').map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</select></label>
            <button type="button" className="danger" onClick={() => setConfirm(true)}>Reset</button>
          </div>
        </div>
      </HeaderContext>
      <LocalBanner>Switch “View as” to practise hand privacy between seats on one screen.</LocalBanner>
      {template.profile === 'intrilex-core' && <p className="notice small">Core sandbox: automatic setup, manual play. Nothing here adjudicates Core rules.</p>}
      {error && <div className="toast" role="alert"><span>{error}</span><button type="button" className="icon-btn" aria-label="Dismiss" onClick={() => setError('')}>×</button></div>}
      <TableBoard key={template.id} view={view} seat={seat} host art={art} onCommand={onCommand} />
      {confirm && <Modal title="Reset this practice table?" onClose={() => setConfirm(false)}><p>All cards return to the template layout with a fresh shuffle.</p>
        <div className="button-row"><button type="button" onClick={() => setConfirm(false)}>Cancel</button><button type="button" className="danger" onClick={() => { setState(createTable(template, secureRandom)); setConfirm(false); }}>Reset</button></div></Modal>}
    </div>
  );
}

const FC_KEY = 'tabletop.local.firstContact';
export function LocalFirstContact() {
  const [game, setGame] = useState<GameState>(() => { const g = loadLocal<GameState | null>(FC_KEY, null); try { if (g?.version === 2) { normalizeGameState(g); assertGameIntegrity(g); return g; } } catch { /* start fresh */ } return createGame(); });
  const [hints, setHints] = useState(() => loadLocal('tabletop.hints', true));
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false);
  const reduced = useRef(typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => { saveLocal(FC_KEY, game); }, [game]);
  // The opponent sees only its own projection and plays only listed legal actions.
  useEffect(() => {
    if (game.winner !== null) return;
    const botView = projectGame(game, 1);
    if (!botView.legalActions.length) return;
    const t = setTimeout(() => { const a = chooseBotAction(botView); if (a) setGame(g => applyGame(g, 1, a)); }, reduced.current ? 150 : 650);
    return () => clearTimeout(t);
  }, [game]);
  const view = useMemo(() => projectGame(game, 0), [game]);
  const act = (a: GameAction) => { try { setGame(g => applyGame(g, 0, a)); setError(''); } catch (e) { setError((e as Error).message); } };
  return (
    <div className="room">
      <HeaderContext>
        <div className="room-head">
          <div className="room-title"><h1>First Contact practice</h1><span className="badge">vs. simple opponent</span></div>
          <span className="save-state save-saved" role="status">Saved on this device</span>
          <div className="button-row"><a className="button-like" href="#/learn">Lessons</a><button type="button" className="danger" onClick={() => setConfirm(true)}>New game</button></div>
        </div>
      </HeaderContext>
      <LocalBanner>The opponent plays only legal actions from its own view — it never sees your hand.</LocalBanner>
      {error && <div className="toast" role="alert"><span>{error}</span><button type="button" className="icon-btn" aria-label="Dismiss" onClick={() => setError('')}>×</button></div>}
      <GameBoard view={view} onAction={act} names={['You', 'Opponent']} hints={hints} onToggleHints={() => { setHints(!hints); saveLocal('tabletop.hints', !hints); }} />
      {confirm && <Modal title="Start a new practice game?" onClose={() => setConfirm(false)}><p>The current game will be discarded.</p>
        <div className="button-row"><button type="button" onClick={() => setConfirm(false)}>Keep playing</button><button type="button" className="danger" onClick={() => { setGame(createGame()); setConfirm(false); }}>New game</button></div></Modal>}
    </div>
  );
}
