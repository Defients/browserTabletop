import { useMemo, useState } from 'react';
import { RULES } from '../../packages/intrilex/index.js';

/** Source-backed reference: original summaries keyed to rulebook headings (v4.3.1). */
const CORE: { ref: string; title: string; summary: string }[] = [
  { ref: '§2', title: 'Core setup', summary: 'Shuffle 54 into DP. Random Player A gets 5 and starts; Player B gets 6. Swap Bar: 2 face-down then 1 face-up from DP. Goals 21.' },
  { ref: '§4.3', title: 'Six ordinary Actions (Core)', summary: 'Draw, Face-Up Swap Bar Draw, Play for Points, Play for Effect, Scuttle, Draw & Cast (first Mini-Turn only). Up to 3 Mini-Turns per Full Turn.' },
  { ref: '§18', title: 'Swap Bar', summary: 'Once per Full Turn: a Face-Down Swap at Start (take a face-down card, give a hand card face-up) or a Face-Up Draw as an Action.' },
  { ref: '§14', title: 'Aegis', summary: 'Hard immunity until a recorded Start Phase; blocks targeting, Scuttle, Attachments and control changes unless explicitly bypassed.' },
  { ref: '§15', title: 'Royal Shield', summary: 'At declaration, if you control more Queens than the opponent, Base and Anchor Aces cannot counter the protected play.' },
  { ref: '§20–21', title: 'Combos, Supers and Ultras', summary: 'Multi-card plays exist only when enabled; Ultras are 3 Black, 3 Red, or 2 Black + 2 Red, one per player per Full Turn.' },
  { ref: '§23', title: 'Sudden Death', summary: 'RJ+BJ or four of a rank: Scrap a Vulnerable enemy card and start a 2-turn timer; only ⭐A can counter.' },
  { ref: '§24', title: 'Voltage and Exile-Bound', summary: 'Start-Phase snapshot of rank 3/4/5 Points unlocks optional abilities. A Rank 10 that begins resolving becomes Exile-Bound.' },
  { ref: '§25', title: 'Exile', summary: 'Public, ordered removal zone reachable only by effects that name Exile.' },
];

export function RulesReference() {
  const [q, setQ] = useState('');
  const fc = useMemo(() => Object.values(RULES), []);
  const match = (t: string) => t.toLowerCase().includes(q.trim().toLowerCase());
  const fcHits = fc.filter(r => !q || match(r.title + r.summary + r.ref + r.id));
  const coreHits = CORE.filter(r => !q || match(r.title + r.summary + r.ref));
  return (
    <section className="page">
      <div className="page-head">
        <h1>Rules reference</h1>
        <p className="muted">Short, original summaries keyed to <i>Intrilex — Complete Player Rulebook v4.3.1</i> headings. The rulebook text controls. First Contact entries are automated by this app; Core entries describe what players maintain by hand in the sandbox.</p>
      </div>
      <label className="search">Search rules<input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Guard, Scuttle, 7, Board Lock…" /></label>
      <h2>First Contact — automated</h2>
      <ul className="rule-list">{fcHits.map(r => <li key={r.id}><b>{r.title}</b> <small>{r.ref} · {r.id}</small><p>{r.summary}</p></li>)}</ul>
      {!fcHits.length && <p className="empty-note">No First Contact rule matches.</p>}
      <h2>Core — manual sandbox only</h2>
      <ul className="rule-list">{coreHits.map(r => <li key={r.ref}><b>{r.title}</b> <small>{r.ref}</small><p>{r.summary}</p></li>)}</ul>
      {!coreHits.length && <p className="empty-note">No Core note matches.</p>}
    </section>
  );
}
