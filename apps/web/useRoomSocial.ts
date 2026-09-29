import { useSyncExternalStore } from 'react';
import { SOCIAL_LIMITS, errorText, type ChatEntry, type ChatPart, type ChatSendMessage, type RoomNotification, type SocialServerMessage } from '../../packages/protocol/index.js';
import { loadLocal, saveLocal } from './common.js';

export interface PendingChat { request: ChatSendMessage; createdAt: number; status: 'pending' | 'sent' | 'uncertain' | 'failed'; error?: string; messageId?: string }
export interface SocialSnapshot {
  epoch: string | null; entries: ChatEntry[]; pending: PendingChat[]; notices: RoomNotification[];
  draft: string; chips: ChatPart[]; replyToId?: string; muted: string[]; collapsed: boolean; unread: number; epochChanged: boolean;
}
type Transport = (message: ChatSendMessage) => boolean;

/** One lifecycle-owned store. Chat changes notify only its social subscribers, never the board. */
export function createRoomSocial(roomId: string, participantId: string) {
  const key = `tabletop-social:${roomId}:${participantId}`;
  const stored = loadLocal<unknown>(key, null);
  const settings = stored && typeof stored === 'object' ? stored as Record<string, unknown> : {};
  let readOrder = typeof settings.readOrder === 'number' && Number.isSafeInteger(settings.readOrder) ? settings.readOrder : 0;
  let readEpoch = typeof settings.epoch === 'string' ? settings.epoch : null;
  let state: SocialSnapshot = { epoch: null, entries: [], pending: [], notices: [], draft: '', chips: [], muted: Array.isArray(settings.muted) ? settings.muted.filter((id): id is string => typeof id === 'string').slice(0, 100) : [], collapsed: settings.collapsed !== false, unread: 0, epochChanged: false };
  const listeners = new Set<() => void>();
  const seenNotices = new Set<string>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  let disposed = false;
  let initialized = false;
  let buffered: { epoch: string; entry: ChatEntry }[] = [];
  const persist = () => saveLocal(key, { epoch: readEpoch, readOrder, muted: state.muted, collapsed: state.collapsed });
  const publish = () => {
    if (disposed) return;
    state = { ...state, unread: state.entries.filter(e => e.messageOrder > readOrder && (e.kind === 'system' || (e.author.participantId !== participantId && !state.muted.includes(e.author.participantId)))).length };
    for (const listener of listeners) listener();
  };
  const merge = (entries: ChatEntry[]) => {
    const byId = new Map(state.entries.map(e => [e.id, e]));
    for (const entry of entries) byId.set(entry.id, entry);
    state = { ...state, entries: [...byId.values()].sort((a, b) => a.messageOrder - b.messageOrder).slice(-SOCIAL_LIMITS.history) };
    state = { ...state, pending: state.pending.filter(p => !state.entries.some(e => e.id === p.messageId)) };
  };
  const dismissNotice = (id: string) => {
    clearTimeout(timers.get(id)); timers.delete(id);
    state = { ...state, notices: state.notices.filter(n => n.id !== id) }; publish();
  };
  const clearDecisionNotices = () => {
    for (const notice of state.notices) if (['turn', 'response', 'choice'].includes(notice.kind)) { clearTimeout(timers.get(notice.id)); timers.delete(notice.id); }
    state = { ...state, notices: state.notices.filter(n => !['turn', 'response', 'choice'].includes(n.kind)) }; publish();
  };
  const transmit = (pending: PendingChat, transport: Transport) => {
    let accepted = false;
    try { accepted = transport(pending.request); } catch { /* A closed socket leaves acceptance uncertain. */ }
    const updated: PendingChat = { ...pending, status: accepted ? 'pending' : 'uncertain', error: accepted ? undefined : 'Connection unavailable. Retry explicitly after reconnecting.' };
    state = { ...state, pending: [...state.pending.filter(p => p.request.requestId !== pending.request.requestId), updated].slice(-20) };
    clearTimeout(timers.get(pending.request.requestId));
    if (accepted) timers.set(pending.request.requestId, setTimeout(() => {
      timers.delete(pending.request.requestId);
      state = { ...state, pending: state.pending.map(p => p.request.requestId === pending.request.requestId && p.status === 'pending' ? { ...p, status: 'uncertain', error: 'No acknowledgement arrived. Retry explicitly with the same message ID.' } : p) }; publish();
    }, 15_000));
    publish();
  };
  return {
    activate() { disposed = false; },
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => state,
    handle(message: SocialServerMessage) {
      if (disposed) return;
      switch (message.type) {
        case 'chat-history': {
          const changed = initialized && state.epoch !== message.epoch;
          const first = !initialized;
          if (state.epoch !== message.epoch) {
            for (const notice of state.notices) { clearTimeout(timers.get(notice.id)); timers.delete(notice.id); }
            if (changed) for (const pending of state.pending) { clearTimeout(timers.get(pending.request.requestId)); timers.delete(pending.request.requestId); }
            state = { ...state, epoch: message.epoch, entries: [], notices: [], epochChanged: changed, pending: changed ? state.pending.map(p => ({ ...p, status: 'failed', createdAt: 0, error: 'Earlier delivery cannot be confirmed after the chat session changed. Sending a new message may duplicate it.' })) : state.pending };
          }
          merge([...message.entries, ...buffered.filter(b => b.epoch === message.epoch).map(b => b.entry)]);
          buffered = [];
          if ((first && readEpoch !== message.epoch) || changed) readOrder = Math.max(0, ...message.entries.map(e => e.messageOrder));
          readEpoch = message.epoch; initialized = true; persist(); break;
        }
        case 'chat-message':
          if (!initialized || state.epoch !== message.epoch) { buffered = [...buffered, { epoch: message.epoch, entry: message.entry }].slice(-SOCIAL_LIMITS.history); break; }
          merge([message.entry]); break;
        case 'chat-result':
          if (message.ok && initialized && message.epoch !== state.epoch) break;
          clearTimeout(timers.get(message.requestId)); timers.delete(message.requestId);
          if (message.ok) {
            const submitted = state.pending.find(p => p.request.requestId === message.requestId);
            if (submitted) {
              const submittedText = submitted.request.parts.filter(part => part.type === 'text').map(part => part.text).join('');
              if (submittedText === state.draft && submitted.request.replyToId === state.replyToId && JSON.stringify(submitted.request.parts.filter(part => part.type !== 'text')) === JSON.stringify(state.chips)) state = { ...state, draft: '', chips: [], replyToId: undefined };
            }
          }
          state = { ...state, pending: state.pending.flatMap(p => {
            if (p.request.requestId !== message.requestId) return [p];
            if (message.ok) {
              if (state.epoch === message.epoch && state.entries.some(e => e.id === message.messageId)) return [];
              return [{ ...p, status: 'sent' as const, messageId: message.messageId, error: undefined }];
            }
            return [{ ...p, status: 'failed' as const, error: errorText(message.code) }];
          }) }; break;
        case 'notification': {
          const n = message.notification;
          if (seenNotices.has(n.id) || (n.kind === 'mention' && state.muted.includes(n.participantId))) break;
          seenNotices.add(n.id);
          if (seenNotices.size > 256) { const oldest = seenNotices.values().next().value; if (oldest) seenNotices.delete(oldest); }
          if (n.kind === 'system' && n.code === 'reset') clearDecisionNotices();
          const notices = [...state.notices, n].slice(-5);
          for (const old of state.notices) if (!notices.includes(old)) { clearTimeout(timers.get(old.id)); timers.delete(old.id); }
          state = { ...state, notices };
          timers.set(n.id, setTimeout(() => dismissNotice(n.id), 12_000)); break;
        }
      }
      publish();
    },
    disconnect() { for (const p of state.pending) { clearTimeout(timers.get(p.request.requestId)); timers.delete(p.request.requestId); } state = { ...state, pending: state.pending.map(p => p.status === 'pending' ? { ...p, status: 'uncertain', error: 'Delivery is uncertain. Retry explicitly after reconnecting.' } : p) }; publish(); },
    send(parts: ChatPart[], replyToId: string | undefined, transport: Transport) {
      transmit({ request: { type: 'chat-send', requestId: crypto.randomUUID(), parts: structuredClone(parts), ...(replyToId ? { replyToId } : {}) }, createdAt: Date.now(), status: 'pending' }, transport);
    },
    retry(requestId: string, transport: Transport, newMessage = false) {
      const old = state.pending.find(p => p.request.requestId === requestId); if (!old) return;
      if (!newMessage && Date.now() - old.createdAt > SOCIAL_LIMITS.retryMs) {
        state = { ...state, pending: state.pending.map(p => p === old ? { ...p, status: 'failed', error: 'The retry window expired. Sending a new message may duplicate an earlier accepted message.' } : p) }; publish(); return;
      }
      if (newMessage) state = { ...state, pending: state.pending.filter(p => p !== old) };
      transmit(newMessage ? { ...old, request: { ...old.request, requestId: crypto.randomUUID() }, createdAt: Date.now() } : old, transport);
    },
    dismissNotice, clearDecisionNotices,
    setDraft(draft: string) { state = { ...state, draft }; publish(); },
    setChips(chips: ChatPart[]) { state = { ...state, chips }; publish(); },
    setReply(replyToId?: string) { state = { ...state, replyToId }; publish(); },
    setCollapsed(collapsed: boolean) { state = { ...state, collapsed }; persist(); publish(); },
    setMuted(id: string, muted: boolean) {
      if (muted) for (const n of state.notices) if (n.kind === 'mention' && n.participantId === id) { clearTimeout(timers.get(n.id)); timers.delete(n.id); }
      state = { ...state, muted: muted ? [...new Set([...state.muted, id])].slice(-100) : state.muted.filter(p => p !== id), notices: state.notices.filter(n => !(muted && n.kind === 'mention' && n.participantId === id)) }; persist(); publish();
    },
    markRead() { readOrder = Math.max(readOrder, 0, ...state.entries.map(e => e.messageOrder)); readEpoch = state.epoch; persist(); publish(); },
    destroy() { disposed = true; for (const timer of timers.values()) clearTimeout(timer); timers.clear(); seenNotices.clear(); listeners.clear(); initialized = false; buffered = []; state = { ...state, epoch: null, epochChanged: false, entries: [], pending: [], notices: [], draft: '', chips: [], replyToId: undefined, unread: 0 }; },
  };
}
export type RoomSocialStore = ReturnType<typeof createRoomSocial>;
export function useRoomSocial(store: RoomSocialStore) { return useSyncExternalStore(store.subscribe, store.getSnapshot); }
