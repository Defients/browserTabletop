import { useEffect, useMemo, useState } from 'react';
import type { CreateRoomResponse, InvitesResponse, RoomView } from '../../packages/protocol/index.js';
import { artIndex } from '../../packages/tabletop/index.js';
import { exportTemplate, type TableTemplate } from '../../packages/templates/index.js';
import { api, ApiFailure, useRoom, type SaveStatus } from './api.js';
import { Modal, Spinner, download, loadLocal, navigate, saveLocal } from './common.js';
import { allTemplates } from './Library.js';
import TableBoard from './TableBoard.js';
import GameBoard from './GameBoard.js';

const NICK = 'tabletop.nickname';
const inviteLink = (token: string) => `${location.origin}${location.pathname}#/join/${token}`;
const PROFILE_LABEL: Record<string, string> = { free: 'Free table', 'intrilex-core': 'Intrilex Core · manual sandbox', 'intrilex-first-contact': 'Intrilex First Contact · rules-assisted', 'intrilex-full': 'Intrilex Full · rules-assisted' };

function Offline() {
  return <p className="notice" role="alert">The table service is not reachable, so online tables are unavailable right now. <a href="#/practice/first-contact">Local practice</a> still works.</p>;
}

export function CreateRoom({ online, initialTemplate }: { online: boolean | null; initialTemplate?: string }) {
  const templates = useMemo(allTemplates, []);
  const [templateId, setTemplateId] = useState(() => initialTemplate ?? sessionStorage.getItem('tabletop.createTemplate') ?? templates[0]!.id);
  const [nickname, setNickname] = useState(() => loadLocal(NICK, ''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const chosen = templates.find(t => t.id === templateId) ?? templates[0]!;
  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      saveLocal(NICK, nickname.trim());
      const builtIn = !chosen.id.startsWith('custom-');
      const r = await api<CreateRoomResponse>('/api/rooms', builtIn ? { nickname, templateId: chosen.id } : { nickname, template: chosen });
      sessionStorage.removeItem('tabletop.createTemplate');
      sessionStorage.setItem(`tabletop.fresh.${r.roomId}`, '1');
      navigate(`#/room/${r.roomId}`);
    } catch (err) { setError((err as Error).message); setBusy(false); }
  }
  return (
    <section className="page narrow">
      <h1>Create a table</h1>
      {online === false && <Offline />}
      <form className="form-grid" onSubmit={create}>
        <fieldset className="template-picker"><legend>Choose a template</legend>
          {templates.map(t => (
            <label key={t.id} className={`template-option ${t.id === templateId ? 'is-chosen' : ''}`}>
              <input type="radio" name="template" value={t.id} checked={t.id === templateId} onChange={() => setTemplateId(t.id)} />
              <span><b>{t.title}</b><small>{PROFILE_LABEL[t.profile]} · {t.seats} seats{t.id.startsWith('custom-') ? ' · your template' : ''}</small><span className="muted small">{t.description}</span></span>
            </label>
          ))}
        </fieldset>
        <p className="small"><a href="#/templates">Make or import your own template</a></p>
        <label>Your nickname<input value={nickname} onChange={e => setNickname(e.target.value)} maxLength={32} required autoComplete="nickname" /></label>
        {error && <p role="alert" className="error">{error}</p>}
        <button type="submit" className="primary" disabled={busy || online === false || !nickname.trim()}>{busy ? 'Creating…' : 'Create table'}</button>
      </form>
    </section>
  );
}

export function JoinRoom({ online, token }: { online: boolean | null; token?: string }) {
  const [link, setLink] = useState(token ?? '');
  const [nickname, setNickname] = useState(() => loadLocal(NICK, ''));
  const [spectator, setSpectator] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [full, setFull] = useState(false);
  const parsed = /([\w-]{43})\s*$/.exec(link.trim())?.[1];
  async function join(asSpectator = spectator) {
    if (!parsed) { setError('Paste the whole invitation link or code.'); return; }
    setBusy(true); setError(''); setFull(false);
    try {
      saveLocal(NICK, nickname.trim());
      const r = await api<{ roomId: string }>('/api/join', { invite: parsed, nickname, spectator: asSpectator });
      navigate(`#/room/${r.roomId}`);
    } catch (err) {
      const f = err as ApiFailure;
      setError(f.message); setFull(f.code === 'SEATS_FULL'); setBusy(false);
    }
  }
  return (
    <section className="page narrow">
      <h1>Join a table</h1>
      {online === false && <Offline />}
      <form className="form-grid" onSubmit={e => { e.preventDefault(); void join(); }}>
        <label>Invitation link or code<input value={link} onChange={e => setLink(e.target.value)} required placeholder="https://…/#/join/…" autoComplete="off" /></label>
        <label>Your nickname<input value={nickname} onChange={e => setNickname(e.target.value)} maxLength={32} required autoComplete="nickname" /></label>
        <label className="check"><input type="checkbox" checked={spectator} onChange={e => setSpectator(e.target.checked)} /> Join as a spectator (watch without a seat)</label>
        {error && <p role="alert" className="error">{error}</p>}
        {full && <button type="button" onClick={() => void join(true)}>Join as a spectator instead</button>}
        <button type="submit" className="primary" disabled={busy || online === false || !nickname.trim()}>{busy ? 'Joining…' : 'Join table'}</button>
      </form>
      <p className="muted small">Your browser keeps a private session cookie so you can refresh and return. There are no accounts: if you clear this browser, ask for a <a href="#/recover">recovery code</a> beforehand.</p>
    </section>
  );
}

export function RecoverRoom() {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  return (
    <section className="page narrow">
      <h1>Recover your seat</h1>
      <p>A recovery code moves your participant (seat, host role and private hand) to this browser. Anyone holding the code can do the same, so keep it private. It works once.</p>
      <form className="form-grid" onSubmit={async e => { e.preventDefault(); try { const r = await api<{ roomId: string }>('/api/recover', { code: code.trim() }); navigate(`#/room/${r.roomId}`); } catch (err) { setError((err as Error).message); } }}>
        <label>Recovery code<input value={code} onChange={e => setCode(e.target.value)} required autoComplete="off" /></label>
        {error && <p role="alert" className="error">{error}</p>}
        <button type="submit" className="primary">Recover</button>
      </form>
    </section>
  );
}

export function RoomLoader({ id }: { id: string }) {
  const [view, setView] = useState<RoomView | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { setView(null); setError(''); api<RoomView>(`/api/rooms/${id}`).then(setView).catch(e => setError((e as Error).message)); }, [id]);
  if (error) return <section className="page narrow"><h1>Table unavailable</h1><p role="alert">{error}</p><p><a href="#/join">Join with an invitation</a> · <a href="#/">Home</a></p></section>;
  if (!view) return <section className="page narrow"><h1 className="sr-only">Loading table</h1><Spinner label="Opening table" /></section>;
  return <RoomScreen key={view.id} initial={view} />;
}

const STATUS: Record<SaveStatus, string> = { saved: 'Saved', pending: 'Saving…', disconnected: 'Disconnected — reconnecting', failed: 'Not saved' };

function RoomScreen({ initial }: { initial: RoomView }) {
  const { view, status, error, ended, command, presence, clearError } = useRoom(initial);
  const [template, setTemplate] = useState<TableTemplate | null>(null);
  const [panel, setPanel] = useState<null | 'invite' | 'people' | 'menu' | 'reset' | 'recovery'>(() => (sessionStorage.getItem(`tabletop.fresh.${initial.id}`) ? 'invite' : null));
  const [invites, setInvites] = useState<InvitesResponse | null>(null);
  const [recovery, setRecovery] = useState('');
  const [copied, setCopied] = useState('');
  const [hints, setHints] = useState(() => loadLocal('tabletop.hints', true));
  useEffect(() => { sessionStorage.removeItem(`tabletop.fresh.${initial.id}`); api<TableTemplate>(`/api/rooms/${initial.id}/template`).then(setTemplate).catch(() => undefined); }, [initial.id]);
  useEffect(() => { if (panel === 'invite' && view.you.host) api<InvitesResponse>(`/api/rooms/${view.id}/invites`).then(setInvites).catch(() => setInvites(null)); }, [panel, view.id, view.you.host, view.revision]);
  const art = useMemo(() => (template ? artIndex(template).images : {}), [template]);
  const host = view.you.host;
  const names = (s: number) => view.participants.find(p => p.seat === s)?.nickname ?? `Seat ${s + 1} (empty)`;
  const copy = async (text: string, what: string) => { try { await navigator.clipboard.writeText(text); setCopied(what); } catch { setCopied(''); } };

  if (ended) return <section className="page narrow"><h1>{ended}</h1><p><a href="#/">Return home</a></p></section>;
  return (
    <div className="room">
      <header className="room-bar">
        <div className="room-title"><h1>{view.title}</h1><span className="badge">{PROFILE_LABEL[view.profile]}</span>{view.locked && <span className="badge badge-warn">Locked</span>}</div>
        <span className={`save-state save-${status}`} role="status" aria-live="polite">{STATUS[status]}</span>
        <span className="you-are">{view.you.seat === null ? 'Spectating' : `You: ${view.game ? `Player ${view.you.seat + 1}` : `Seat ${view.you.seat + 1}`}`}{host ? ' · host' : ''}</span>
        <div className="button-row">
          {host && <button type="button" className="primary" onClick={() => setPanel('invite')}>Invite</button>}
          <button type="button" onClick={() => setPanel('people')}>People ({view.participants.length})</button>
          <button type="button" onClick={() => setPanel('menu')}>Table menu</button>
        </div>
      </header>
      {error && <div className="toast" role="alert"><span>{error}</span><button type="button" className="icon-btn" aria-label="Dismiss" onClick={clearError}>×</button></div>}
      {view.profile === 'intrilex-core' && <p className="notice small">Core sandbox: setup was automatic; everything after is manual. Scores, markers and legality are maintained by the players — nothing here adjudicates Core rules. <a href="#/rules">Rule reference</a></p>}
      {view.game && <GameBoard view={view.game} onAction={a => command({ type: 'game', action: { type: a.type, cardId: a.cardId, targetId: a.targetId, cardIds: a.cardIds, targetIds: a.targetIds, mode: a.mode } })} busy={status === 'pending'}
        names={[names(0), names(1)]} hints={hints} onToggleHints={() => { setHints(!hints); saveLocal('tabletop.hints', !hints); }} presence={presence} participants={view.participants} />}
      {view.table && <TableBoard view={view.table} seat={view.you.seat} host={host} art={art} onCommand={action => command({ type: 'table', action })} participants={view.participants} presence={presence}
        canUndo={view.canUndo} onUndo={() => command({ type: 'undo' })} readOnly={view.you.readOnly} />}

      {panel === 'invite' && host && <Modal title="Invite people" onClose={() => { setPanel(null); setCopied(''); }}>
        {invites ? <div className="form-grid">
          <label>Player invitation<div className="copy-row"><input readOnly value={inviteLink(invites.invite)} onFocus={e => e.currentTarget.select()} /><button type="button" onClick={() => copy(inviteLink(invites.invite), 'player')}>{copied === 'player' ? 'Copied' : 'Copy'}</button></div></label>
          <label>Spectator invitation (read-only)<div className="copy-row"><input readOnly value={inviteLink(invites.spectatorInvite)} onFocus={e => e.currentTarget.select()} /><button type="button" onClick={() => copy(inviteLink(invites.spectatorInvite), 'spectator')}>{copied === 'spectator' ? 'Copied' : 'Copy'}</button></div></label>
          <p className="muted small">Anyone with the player link can take a free seat until you lock the table or replace the links. Links never include your own credentials.</p>
          <button type="button" onClick={() => void command({ type: 'rotate-invite' })}>Replace both links (old links stop working)</button>
        </div> : <Spinner label="Loading invitations" />}
      </Modal>}

      {panel === 'people' && <Modal title="People at this table" onClose={() => setPanel(null)}>
        <ul className="people">{view.participants.map(p => (
          <li key={p.id}>
            <span className={`dot ${p.connected ? 'is-on' : ''}`} aria-hidden="true" />
            <b>{p.nickname}</b> <span className="muted">{p.seat === null ? 'spectator' : view.game ? `Player ${p.seat + 1}` : `seat ${p.seat + 1}`}{p.host ? ' · host' : ''}{p.readOnly ? ' · read-only' : ''} · {p.connected ? 'online' : 'away'}</span>
            {host && p.id !== view.you.id && <span className="button-row">
              {!p.readOnly && <button type="button" onClick={() => void command({ type: 'transfer', participantId: p.id })}>Make host</button>}
              <button type="button" className="danger" onClick={() => void command({ type: 'remove', participantId: p.id })}>Remove</button>
            </span>}
          </li>
        ))}</ul>
        {!view.you.readOnly && <fieldset><legend>Your seat</legend><div className="button-row">
          {Array.from({ length: view.seats }, (_, s) => s).map(s => { const taken = view.participants.some(p => p.seat === s && p.id !== view.you.id); return <button type="button" key={s} disabled={taken || view.you.seat === s} onClick={() => void command({ type: 'seat', seat: s })}>{view.you.seat === s ? `In seat ${s + 1}` : taken ? `Seat ${s + 1} taken` : `Take seat ${s + 1}`}</button>; })}
          <button type="button" disabled={view.you.seat === null} onClick={() => void command({ type: 'seat', seat: null })}>Spectate</button>
        </div>{view.game && <p className="muted small">In a guided game you may only sit in a seat whose hand you have already held, so nobody can see both hands.</p>}</fieldset>}
      </Modal>}

      {panel === 'menu' && <Modal title="Table menu" onClose={() => setPanel(null)}>
        <div className="button-column">
          {template && <button type="button" onClick={() => download(`${template.id}.tabletop.json`, exportTemplate(template))}>Export this table’s template (no live state)</button>}
          <button type="button" onClick={async () => { const r = await api<{ code: string }>(`/api/rooms/${view.id}/recovery`, {}); setRecovery(r.code); setPanel('recovery'); }}>Create a recovery code for my seat</button>
          {host && <button type="button" onClick={() => void command({ type: 'lock', locked: !view.locked })}>{view.locked ? 'Unlock: allow new guests' : 'Lock: no new guests'}</button>}
          {host && <button type="button" className="danger" onClick={() => setPanel('reset')}>Reset table…</button>}
          {!host && <button type="button" className="danger" onClick={() => void command({ type: 'leave' })}>Leave table</button>}
          <a className="button-like" href="#/rules" target="_blank" rel="noopener">Open rules reference</a>
        </div>
        <details><summary>Table activity</summary><ol reversed className="history">{view.history.slice().reverse().map((h, i) => <li key={i}>{h}</li>)}</ol>
          {view.table && <><h3>Card activity</h3><ol reversed className="history">{view.table.history.slice().reverse().map((h, i) => <li key={i}>{h}</li>)}</ol></>}</details>
        <p className="muted small">Saved {new Date(view.savedAt).toLocaleString()}. This table is kept until {new Date(view.expiresAt).toLocaleDateString()} and extends with activity.</p>
      </Modal>}

      {panel === 'reset' && <Modal title="Reset the whole table?" onClose={() => setPanel('menu')}>
        <p>Everyone’s cards return to the template’s starting layout and piles are reshuffled. This cannot be undone.</p>
        <div className="button-row"><button type="button" onClick={() => setPanel(null)}>Keep playing</button><button type="button" className="danger" onClick={() => { void command({ type: 'reset', confirm: true }); setPanel(null); }}>Reset for everyone</button></div>
      </Modal>}

      {panel === 'recovery' && <Modal title="Your recovery code" onClose={() => { setPanel(null); setRecovery(''); }}>
        <p>Use this once on another browser at <b>Recover a seat</b> to move your seat{host ? ' and host role' : ''} there. Anyone with it can take your place — do not share it. Creating a new code replaces this one.</p>
        <div className="copy-row"><input readOnly value={recovery} onFocus={e => e.currentTarget.select()} aria-label="Recovery code" /><button type="button" onClick={() => copy(recovery, 'recovery')}>{copied === 'recovery' ? 'Copied' : 'Copy'}</button></div>
      </Modal>}
    </div>
  );
}
