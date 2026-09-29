import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { errorText, parseServerMessage, type ClientMessage, type CommandResponse, type RoomCommand, type RoomView, type Surface } from '../../packages/protocol/index.js';
import { STATIC_HOST } from './hosting.js';

export class ApiFailure extends Error { constructor(public code: string, public view?: RoomView) { super(errorText(code)); } }

let csrf = '';
async function ensureSession() {
  if (csrf) return;
  const r = await fetch('/api/session', { credentials: 'same-origin' });
  if (!r.ok) throw new ApiFailure('SERVICE_UNAVAILABLE');
  csrf = ((await r.json()) as { csrf: string }).csrf;
}

export async function api<T>(path: string, body?: unknown): Promise<T> {
  if (STATIC_HOST) throw new ApiFailure('SERVICE_UNAVAILABLE');
  let response: Response;
  try {
    await ensureSession();
    response = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin',
      headers: body === undefined ? {} : { 'content-type': 'application/json', 'x-csrf-token': csrf },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    if (e instanceof ApiFailure) throw e;
    throw new ApiFailure('NETWORK');
  }
  const data = await response.json().catch(() => ({})) as { error?: string; view?: RoomView };
  if (response.status === 401) csrf = '';
  if (!response.ok) throw new ApiFailure(data.error ?? 'REQUEST_FAILED', data.view);
  return data as T;
}

export const serviceAvailable = () => STATIC_HOST ? Promise.resolve(false) : fetch('/ready').then(r => r.ok).catch(() => false);

// ---------------------------------------------------------------- presence (outside React state)

type Pointer = { x: number; y: number; surface: Surface; at: number; ping?: number };
const pointers = new Map<string, Pointer>();
const listeners = new Set<() => void>();
let snapshot: [string, Pointer][] = [];
const emit = () => { snapshot = [...pointers.entries()]; for (const l of listeners) l(); };
export function usePointers() {
  return useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb); }, () => snapshot);
}
setInterval(() => { const t = Date.now(); let changed = false; for (const [k, v] of pointers) if (t - v.at > 6000) { pointers.delete(k); changed = true; } if (changed) emit(); }, 2000);

export type SaveStatus = 'saved' | 'pending' | 'disconnected' | 'failed';

/** Live room connection: HTTP for durable commands, WebSocket for projected snapshots and ephemeral presence. */
export function useRoom(initial: RoomView) {
  const [view, setView] = useState<RoomView>(initial);
  const [status, setStatus] = useState<SaveStatus>('pending');
  const [error, setError] = useState('');
  const [ended, setEnded] = useState('');
  const ref = useRef(view);
  ref.current = view;
  const socket = useRef<WebSocket | null>(null);
  const inFlight = useRef(0);

  useEffect(() => {
    let live = true, attempts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const connect = () => {
      if (!live) return;
      const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?room=${encodeURIComponent(initial.id)}`);
      socket.current = ws;
      ws.onopen = () => { attempts = 0; if (!inFlight.current) setStatus('saved'); };
      ws.onmessage = e => {
        const m = parseServerMessage(String(e.data));
        if (!m) return;
        if (m.type === 'snapshot') {
          if (m.view.revision >= ref.current.revision || m.view.id !== ref.current.id) setView(m.view);
          if (!inFlight.current) setStatus('saved');
        } else {
          const prev = pointers.get(m.participantId);
          pointers.set(m.participantId, { x: m.x, y: m.y, surface: m.surface, at: Date.now(), ...(m.type === 'ping' ? { ping: Date.now() } : prev?.ping ? { ping: prev.ping } : {}) });
          emit();
        }
      };
      ws.onclose = e => {
        if (!live) return;
        if (e.code === 4003) { setEnded('Your access to this table has ended.'); return; }
        if (e.code === 4004) { setEnded('This table has expired.'); return; }
        setStatus('disconnected');
        timer = setTimeout(connect, Math.min(8000, 600 * 2 ** attempts++));
      };
      ws.onerror = () => ws.close();
    };
    connect();
    return () => { live = false; clearTimeout(timer); socket.current?.close(); pointers.clear(); emit(); };
  }, [initial.id]);

  const command = useCallback(async (command: RoomCommand): Promise<boolean> => {
    const current = ref.current;
    inFlight.current++;
    setStatus('pending'); setError('');
    try {
      const result = await api<CommandResponse>(`/api/rooms/${current.id}/commands`, { requestId: crypto.randomUUID(), revision: current.revision, command });
      if (result.left) { setEnded('You left the table.'); return true; }
      if (result.view && result.view.revision >= ref.current.revision) setView(result.view);
      setStatus(socket.current?.readyState === WebSocket.OPEN ? 'saved' : 'disconnected');
      return true;
    } catch (e) {
      const f = e instanceof ApiFailure ? e : new ApiFailure('REQUEST_FAILED');
      if (f.view) setView(f.view);
      setError(f.message);
      setStatus(f.code === 'NETWORK' ? 'disconnected' : 'failed');
      if (f.code === 'ROOM_ACCESS_DENIED') setEnded('Your access to this table has ended.');
      return false;
    } finally { inFlight.current--; }
  }, []);

  const lastSent = useRef(0);
  const presence = useCallback((m: ClientMessage) => {
    const t = Date.now();
    if (m.type === 'presence' && t - lastSent.current < 80) return;
    lastSent.current = t;
    if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify(m));
  }, []);

  return { view, status, error, ended, command, presence, clearError: () => setError('') };
}
