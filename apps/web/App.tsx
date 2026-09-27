import { useEffect, useState } from 'react';
import { serviceAvailable } from './api.js';
import Home from './Home.js';
import { CreateRoom, JoinRoom, RecoverRoom, RoomLoader } from './Online.js';
import { LocalTable, LocalFirstContact } from './Practice.js';
import { LearnHome, LessonPlayer } from './Learn.js';
import { RulesReference } from './Reference.js';
import { TemplateLibrary } from './Library.js';

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
  useEffect(() => { let live = true; void serviceAvailable().then(ok => { if (live) setOnline(ok); }); return () => { live = false; }; }, []);
  const [page, a, b] = route;

  // Move focus to the main heading on navigation so keyboard and screen-reader users land in context.
  useEffect(() => { const h = document.querySelector<HTMLElement>('main h1'); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); } }, [page, a]);

  let content;
  switch (page) {
    case undefined: content = <Home online={online} />; break;
    case 'create': content = <CreateRoom online={online} />; break;
    case 'join': content = <JoinRoom online={online} token={a} />; break;
    case 'recover': content = <RecoverRoom />; break;
    case 'room': content = a ? <RoomLoader id={a} /> : <Home online={online} />; break;
    case 'learn': content = a ? <LessonPlayer key={a} id={a} /> : <LearnHome />; break;
    case 'practice': content = a === 'first-contact' ? <LocalFirstContact /> : <LocalTable key={b ?? 'default'} templateId={b} />; break;
    case 'rules': content = <RulesReference />; break;
    case 'templates': content = <TemplateLibrary editId={a} />; break;
    default: content = <NotFound />;
  }
  const wide = page === 'room' || page === 'practice' || (page === 'learn' && !!a) || page === 'templates';
  return (
    <div className={`app ${wide ? 'app-wide' : ''}`}>
      <a className="skip-link" href="#main" onClick={e => { e.preventDefault(); document.getElementById('main')?.focus(); }}>Skip to content</a>
      <header className="topbar">
        <a href="#/" className="brand" aria-label={`${APP_NAME} home`}><span className="brand-mark" aria-hidden="true">◆</span>{APP_NAME}</a>
        <nav aria-label="Main">
          <a href="#/create" aria-current={page === 'create' ? 'page' : undefined}>Create</a>
          <a href="#/join" aria-current={page === 'join' ? 'page' : undefined}>Join</a>
          <a href="#/learn" aria-current={page === 'learn' ? 'page' : undefined}>Learn Intrilex</a>
          <a href="#/rules" aria-current={page === 'rules' ? 'page' : undefined}>Rules</a>
        </nav>
        <span className={`service-dot ${online === null ? '' : online ? 'is-on' : 'is-off'}`} role="status">{online === null ? 'Checking service…' : online ? 'Online tables available' : 'Offline — local practice only'}</span>
      </header>
      <main id="main" tabIndex={-1}>{content}</main>
    </div>
  );
}

function NotFound() {
  return <section className="page narrow"><h1>That page does not exist</h1><p><a href="#/">Return home</a></p></section>;
}
