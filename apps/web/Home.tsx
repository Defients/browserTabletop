import { useEffect, useState } from 'react';
import { api } from './api.js';
import { loadLocal } from './common.js';
import { lessons } from '../../packages/intrilex/index.js';

interface MyRoom { id: string; title: string; profile: string; savedAt: string; expiresAt: string }

export default function Home({ online }: { online: boolean | null }) {
  const [rooms, setRooms] = useState<MyRoom[] | null>(null);
  useEffect(() => { if (online) void api<MyRoom[]>('/api/rooms').then(setRooms).catch(() => setRooms([])); }, [online]);
  const progress = loadLocal<Record<string, { completed?: boolean }>>('tabletop.lessons', {});
  const done = lessons.filter(l => progress[l.id]?.completed).length;
  return (
    <div className="page home">
      <section className="hero">
        <p className="eyebrow">Private tables · real cards · no accounts</p>
        <h1>Make room for play.</h1>
        <p className="lead">Open a table, send the invitation, and play together in your browsers. Hands stay private, the table saves itself, and Intrilex is ready to teach.</p>
      </section>
      <section className="primary-paths" aria-label="Start">
        <a className="path-card path-create" href="#/create">
          <span className="path-icon" aria-hidden="true">＋</span><h2>Create table</h2>
          <p>Choose a template, get an invitation link, and wait for friends to arrive.</p>
          {online === false && <small className="warn">Table service offline</small>}
        </a>
        <a className="path-card path-join" href="#/join">
          <span className="path-icon" aria-hidden="true">↗</span><h2>Join table</h2>
          <p>Open a link from your host or paste it here. Seats and spectating both work.</p>
        </a>
        <a className="path-card path-learn" href="#/learn">
          <span className="path-icon" aria-hidden="true">◆</span><h2>Learn Intrilex</h2>
          <p>{done ? `${done} of ${lessons.length} lessons complete.` : `${lessons.length} short interactive lessons, then a full First Contact game.`}</p>
        </a>
      </section>

      {online && rooms && rooms.length > 0 && (
        <section className="panel" aria-labelledby="my-tables">
          <h2 id="my-tables">Return to your tables</h2>
          <ul className="room-list">{rooms.map(r => <li key={r.id}><a href={`#/room/${r.id}`}><b>{r.title}</b><span>Saved {new Date(r.savedAt).toLocaleString()} · expires {new Date(r.expiresAt).toLocaleDateString()}</span></a></li>)}</ul>
        </section>
      )}

      <section className="panel two-up" aria-label="Practise on this device">
        <div>
          <h2>Practise on this device</h2>
          <p className="muted">Local practice runs entirely in this browser and saves here. It never creates an invitation.</p>
          <div className="button-column">
            <a className="button-like" href="#/practice/first-contact">First Contact vs. a simple opponent</a>
            <a className="button-like" href="#/practice/table/standard-54">Free table with a 54-card deck</a>
            <a className="button-like" href="#/practice/table/intrilex-core">Intrilex Core sandbox (manual)</a>
          </div>
        </div>
        <div>
          <h2>Make your own table</h2>
          <p className="muted">Lay out zones, seats, counters and custom card faces. Export the template file and share it, or start a room with it.</p>
          <div className="button-column">
            <a className="button-like" href="#/templates">Template library & editor</a>
            <a className="button-like" href="#/recover">Recover a seat with a code</a>
          </div>
        </div>
      </section>
    </div>
  );
}
