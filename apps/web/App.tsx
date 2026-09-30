import { useEffect, useRef, useState } from 'react';
import { serviceAvailable } from './api.js';
import { HeaderSlot } from './common.js';
import Home from './Home.js';
import { CreateRoom, JoinRoom, RecoverRoom, RoomLoader } from './Online.js';
import { LocalTable, LocalFirstContact } from './Practice.js';
import { LearnHome, LessonPlayer } from './Learn.js';
import { RulesReference } from './Reference.js';
import { TemplateLibrary } from './Library.js';
import { STATIC_HOST, onlineHref, roomServer } from './hosting.js';

export const APP_NAME = 'Tabletop';

function useHashRoute(): string[] {
  const read = () => location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const [parts, setParts] = useState(read);
  useEffect(() => {
    const on = () => { setParts(read()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return parts;
}

export default function App() {
  const route = useHashRoute();
  const [online, setOnline] = useState<boolean | null>(null);
  const [slotEl, setSlotEl] = useState<HTMLDivElement | null>(null);
  useEffect(() => { let live = true; void serviceAvailable().then(ok => { if (live) setOnline(ok); }); return () => { live = false; }; }, []);
  const [page, a, b] = route;

  // After in-app navigation (not the first load), move focus to the main heading so keyboard and
  // screen-reader users land in context; the first load keeps the natural order starting at the skip link.
  const navigated = useRef(false);
  useEffect(() => {
    if (!navigated.current) { navigated.current = true; return; }
    const h = document.querySelector<HTMLElement>('main h1') ?? document.getElementById('main'); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
  }, [page, a]);

  let content;
  switch (page) {
    case undefined: content = <Home online={online} />; break;
    case 'create': content = <CreateRoom key={a ?? 'default'} online={online} initialTemplate={a} />; break;
    case 'join': content = <JoinRoom online={online} token={a} />; break;
    case 'recover': content = <RecoverRoom />; break;
    case 'room': content = a ? <RoomLoader id={a} /> : <Home online={online} />; break;
    case 'learn': content = a ? <LessonPlayer key={a} id={a} /> : <LearnHome />; break;
    case 'practice': content = a === 'first-contact' ? <LocalFirstContact /> : <LocalTable key={b ?? 'default'} templateId={b} />; break;
    case 'rules': content = <RulesReference />; break;
    case 'templates': content = <TemplateLibrary editId={a} />; break;
    default: content = <NotFound />;
  }
  if (STATIC_HOST && ['create', 'join', 'recover', 'room'].includes(page ?? '')) {
    content = <section className="page narrow"><h1>Online tables</h1>
      {roomServer() ? <><p>Shared rooms open on our multiplayer site. Your guest seat and saved room stay there.</p><a className="button-like primary" href={onlineHref(route.map(encodeURIComponent).join('/'))}>Continue to online tables</a></>
        : <p className="notice">Online rooms are not connected yet. You can still play on this device, learn Intrilex, and create templates.</p>}
      <p><a href="#/practice/first-contact">Play First Contact on this device</a> · <a href="#/templates">Open template library</a></p>
    </section>;
  }
  const wide = page === 'room' || page === 'practice' || (page === 'learn' && !!a) || page === 'templates';
  // Inside a table the merged header carries connection/save state, so the global service dot is redundant there.
  const inTable = page === 'room' || page === 'practice' || (page === 'learn' && !!a);
  return (
    <>
    <div className="ct-env" aria-hidden="true"><div className="ct-stars" /><div className="ct-orbit" /><div className="ct-orbit-2" /></div>
    <div className={`app ${wide ? 'app-wide' : ''}`}>
      <a className="skip-link" href="#main" onClick={e => { e.preventDefault(); document.getElementById('main')?.focus(); }}>Skip to content</a>
      <HeaderSlot.Provider value={slotEl}>
        <header className="topbar">
          <a href="#/" className="brand" aria-label={`${APP_NAME} home`}><span className="brand-mark" aria-hidden="true">◆</span>{APP_NAME}</a>
          <nav aria-label="Main">
            <a href="#/practice/first-contact" aria-current={page === 'practice' ? 'page' : undefined}>Play</a>
            <a href={onlineHref('create')} aria-current={page === 'create' ? 'page' : undefined}>Create</a>
            <a href={onlineHref('join')} aria-current={page === 'join' ? 'page' : undefined}>Join</a>
            <a href="#/learn" aria-current={page === 'learn' ? 'page' : undefined}>Learn</a>
            <a href="#/rules" aria-current={page === 'rules' ? 'page' : undefined}>Rules</a>
            <a href="#/templates" aria-current={page === 'templates' ? 'page' : undefined}>Decks</a>
          </nav>
          <div ref={setSlotEl} className="header-context" />
          {!inTable && <span className={`service-dot ${STATIC_HOST ? '' : online === null ? '' : online ? 'is-on' : 'is-off'}`} role="status">{STATIC_HOST ? 'Play here · shared rooms on our multiplayer site' : online === null ? 'Checking service…' : online ? 'Online tables available' : 'Offline — local practice only'}</span>}
        </header>
        <main id="main" tabIndex={-1}>{content}</main>
      </HeaderSlot.Provider>
    </div>
    </>
  );
}

function NotFound() {
  return <section className="page narrow"><h1>That page does not exist</h1><p><a href="#/">Return home</a></p></section>;
}
