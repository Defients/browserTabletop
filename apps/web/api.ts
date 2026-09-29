import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { errorText, parseServerMessage, type PointerClientMessage, type ChatSendMessage, type ChatPart, type CommandResponse, type RoomCommand, type RoomView, type Surface } from '../../packages/protocol/index.js';
import { createRoomSocial } from './useRoomSocial.js';
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
  const [connected, setConnected] = useState(false);
  const social = useMemo(() => createRoomSocial(initial.id, initial.you.id), [initial.id, initial.you.id]);
  const ref = useRef(view);
  ref.current = view;
  const socket = useRef<WebSocket | null>(null);
  const inFlight = useRef(0);
  const ready = useRef(false);
  const scope = useRef(0);

  useEffect(() => {
    let live = true, attempts = 0;
    social.activate();
    const lifecycle = ++scope.current;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const connect = () => {
      if (!live) return;
      const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?room=${encodeURIComponent(initial.id)}`);
      socket.current = ws;
      ready.current = false; setConnected(false);
      ws.onopen = () => { if (live && socket.current === ws) attempts = 0; };
      ws.onmessage = e => {
        if (!live || socket.current !== ws || scope.current !== lifecycle) return;
        const m = parseServerMessage(String(e.data));
        if (!m) return;
        switch (m.type) {
          case 'snapshot':
            if (m.view.id !== initial.id || m.view.you.id !== initial.you.id) return;
            if (m.view.revision >= ref.current.revision) {
              if (m.view.revision > ref.current.revision) social.clearDecisionNotices();
              ref.current = m.view; setView(m.view);
            }
            ready.current = true; setConnected(true);
            if (!inFlight.current) setStatus('saved');
            break;
          case 'presence': case 'ping': {
            const prev = pointers.get(m.participantId);
            pointers.set(m.participantId, { x: m.x, y: m.y, surface: m.surface, at: Date.now(), ...(m.type === 'ping' ? { ping: Date.now() } : prev?.ping ? { ping: prev.ping } : {}) });
            emit(); break;
          }
          case 'chat-history': case 'chat-message': case 'chat-result': case 'notification': social.handle(m); break;
        }
      };
      ws.onclose = e => {
        if (!live || socket.current !== ws) return;
        ready.current = false; setConnected(false); social.disconnect(); social.clearDecisionNotices();
        if (e.code === 4003) { social.destroy(); setEnded('Your access to this table has ended.'); return; }
        if (e.code === 4004) { social.destroy(); setEnded('This table has expired.'); return; }
        setStatus('disconnected');
        timer = setTimeout(connect, Math.min(8000, 600 * 2 ** attempts++));
      };
      ws.onerror = () => ws.close();
    };
    connect();
    return () => { live = false; scope.current++; ready.current = false; clearTimeout(timer); socket.current?.close(); social.destroy(); pointers.clear(); emit(); };
  }, [initial.id, initial.you.id, social]);

  const command = useCallback(async (command: RoomCommand): Promise<boolean> => {
    const current = ref.current;
    const lifecycle = scope.current;
    if ((command.type === 'game' || command.type === 'table') && (!ready.current || inFlight.current)) return false;
    inFlight.current++;
    setStatus('pending'); setError('');
    try {
      const result = await api<CommandResponse>(`/api/rooms/${current.id}/commands`, { requestId: crypto.randomUUID(), revision: current.revision, command });
      if (scope.current !== lifecycle) return false;
      if (result.left) { social.destroy(); setEnded('You left the table.'); return true; }
      if (result.view && result.view.id === current.id && result.view.you.id === current.you.id && result.view.revision >= ref.current.revision) {
        if (result.view.revision > ref.current.revision) social.clearDecisionNotices();
        ref.current = result.view; setView(result.view);
      }
      setStatus(ready.current ? 'saved' : 'disconnected');
      return true;
    } catch (e) {
      if (scope.current !== lifecycle) return false;
      const f = e instanceof ApiFailure ? e : new ApiFailure('REQUEST_FAILED');
      if (f.view && f.view.id === current.id && f.view.you.id === current.you.id && f.view.revision >= ref.current.revision) { ref.current = f.view; setView(f.view); }
      setError(f.message);
      setStatus(f.code === 'NETWORK' ? 'disconnected' : 'failed');
      if (f.code === 'NETWORK') { ready.current = false; setConnected(false); socket.current?.close(); }
      if (f.code === 'ROOM_ACCESS_DENIED') { social.destroy(); setEnded('Your access to this table has ended.'); }
      return false;
    } finally { inFlight.current--; }
  }, [social]);

  const lastSent = useRef(0);
  const presence = useCallback((m: PointerClientMessage) => {
    const t = Date.now();
    if (m.type === 'presence' && t - lastSent.current < 80) return;
    lastSent.current = t;
    if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify(m));
  }, []);

  const chatTransport = useCallback((message: ChatSendMessage) => {
    if (!ready.current || socket.current?.readyState !== WebSocket.OPEN) return false;
    socket.current.send(JSON.stringify(message)); return true;
  }, []);
  const sendChat = useCallback((parts: ChatPart[], replyToId?: string) => social.send(parts, replyToId, chatTransport), [social, chatTransport]);
  const retryChat = useCallback((requestId: string, newMessage = false) => social.retry(requestId, chatTransport, newMessage), [social, chatTransport]);
  return { view, status, error, ended, connected, social, sendChat, retryChat, command, presence, clearError: () => setError('') };
}
