import { useEffect, useMemo, useState } from 'react';
import { createLesson, lessonAct, lessonHint, lessonObserve, lessons, projectGame, resumeLesson, saveLesson, type GameAction, type LessonState } from '../../packages/intrilex/index.js';
import { loadLocal, saveLocal } from './common.js';
import GameBoard, { type BoardZone } from './GameBoard.js';

type Progress = Record<string, { completed?: boolean; skipped?: boolean; save?: string }>;
const KEY = 'tabletop.lessons';
const readProgress = () => loadLocal<Progress>(KEY, {});

export function LearnHome() {
  const [progress, setProgress] = useState(readProgress);
  return (
    <section className="page">
      <div className="page-head">
        <h1>Learn Intrilex</h1>
        <p className="lead">Seven short lessons on the real First Contact rules engine, then a full game. Progress is stored only in this browser.</p>
      </div>
      <ol className="lesson-list">
        {lessons.map(l => {
          const p = progress[l.id];
          return (
            <li key={l.id} className={p?.completed ? 'is-done' : ''}>
              <a href={`#/learn/${l.id}`}><b>{l.title}</b><span>{l.objective}</span></a>
              <span className="lesson-state">{p?.completed ? '✓ Complete' : p?.skipped ? 'Skipped' : p?.save ? 'In progress' : 'Not started'}{l.openHand ? ' · teaching foreknowledge' : ''}</span>
            </li>
          );
        })}
      </ol>
      <div className="panel">
        <h2>Graduation path</h2>
        <p>After the lessons, play a <a href="#/practice/first-contact">complete First Contact game</a> against a simple legal opponent, or invite a friend to an online First Contact table. When ready for Core, the <a href="#/practice/table/intrilex-core">Core sandbox</a> gives you the full canonical layout with manual play — its rules are references, not automated adjudication. The rulebook’s order is: suit abilities and Supers, Swap Bar, full Mini-Turn economy, Aegis/Royal Shield/reveals, Voltage, Combos and Ultras, then optional modules (§27 15.8).</p>
        <button type="button" onClick={() => { saveLocal(KEY, {}); setProgress({}); }}>Reset all lesson progress</button>
      </div>
    </section>
  );
}

export function LessonPlayer({ id }: { id: string }) {
  const def = lessons.find(l => l.id === id);
  const [state, setState] = useState<LessonState | null>(() => {
    if (!def) return null;
    const saved = readProgress()[id]?.save;
    if (saved) { try { return resumeLesson(saved); } catch { /* corrupted save: start fresh */ } }
    return createLesson(id);
  });
  const [showHint, setShowHint] = useState(false);
  const [hints, setHints] = useState(true);
  useEffect(() => {
    if (!state) return;
    const p = readProgress();
    p[id] = { ...p[id], save: saveLesson(state), ...(state.completed ? { completed: true } : {}) };
    saveLocal(KEY, p);
  }, [state, id]);
  const view = useMemo(() => (state ? projectGame(state.game, 0) : null), [state]);
  if (!def || !state || !view) return <section className="page narrow"><h1>Lesson not found</h1><a href="#/learn">All lessons</a></section>;
  const index = lessons.indexOf(def);
  const next = lessons[index + 1];
  const onAction = (a: GameAction) => { try { setState(s => (s ? lessonAct(s, a) : s)); } catch (e) { setState(s => (s ? { ...s, feedback: (e as Error).message } : s)); } };
  const onZone = def.tasks ? (z: BoardZone) => setState(s => (s ? lessonObserve(s, `zone:${z}`) : s)) : undefined;
  const onInspect = def.tasks ? () => setState(s => (s ? lessonObserve(s, 'inspect') : s)) : undefined;
  return (
    <div className="lesson">
      <header className="lesson-bar">
        <div><p className="eyebrow">Lesson {index + 1} of {lessons.length}</p><h1>{def.title}</h1></div>
        <div className="button-row">
          <button type="button" onClick={() => setShowHint(h => !h)} aria-expanded={showHint}>Hint</button>
          <button type="button" onClick={() => { setState(createLesson(id)); setShowHint(false); }}>Reset lesson</button>
          {!state.completed && next && <a className="button-like" href={`#/learn/${next.id}`} onClick={() => { const p = readProgress(); p[id] = { ...p[id], skipped: true }; saveLocal(KEY, p); }}>Skip</a>}
          <a className="button-like" href="#/learn">All lessons</a>
        </div>
      </header>
      {def.openHand && <p className="notice small"><b>Teaching foreknowledge:</b> this lesson tells you what your opponent will do. It is a scripted scenario, not private play.</p>}
      <div className="lesson-brief">
        <p><b>Objective:</b> {def.objective}</p>
        <p className="muted">{def.explanation}</p>
        <p className="small">Sources: {def.refs.join(' · ')}</p>
        {def.tasks && <ol className="task-list">{def.tasks.map((t, i) => <li key={t.id} className={i < state.observed.length ? 'is-done' : i === state.observed.length ? 'is-current' : ''}>{t.prompt}</li>)}</ol>}
        <p className={`lesson-feedback ${state.completed ? 'is-complete' : ''}`} role="status" aria-live="polite">{state.completed ? `✓ ${state.feedback}` : state.feedback}</p>
        {showHint && <p className="hint">{lessonHint(state)}</p>}
        {state.completed && <div className="button-row">{next ? <a className="button-like primary" href={`#/learn/${next.id}`}>Next lesson: {next.title}</a> : <a className="button-like primary" href="#/practice/first-contact">Play a full First Contact game</a>}</div>}
      </div>
      <GameBoard view={view} onAction={onAction} names={['You', 'Opponent']} hints={hints} onToggleHints={() => setHints(!hints)} onZone={onZone} onInspectCard={onInspect} suggestions={false} />
    </div>
  );
}
