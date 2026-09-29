import type { ParticipantView, RoomNotification } from '../../packages/protocol/index.js';
import { useRoomSocial, type RoomSocialStore } from './useRoomSocial.js';

export function notificationText(n: RoomNotification, participants: ParticipantView[] = []) {
  switch (n.kind) {
    case 'turn': return 'Your turn: a move is available.';
    case 'response': return 'Priority passed to you: respond or decline.';
    case 'choice': return 'Your choice is needed.';
    case 'reconnected': return `${n.nickname} reconnected.`;
    case 'disconnected': return `${n.nickname} disconnected.`;
    case 'mention': return `${participants.find(p => p.id === n.participantId)?.nickname ?? 'A participant'} mentioned you in room chat.`;
    case 'system': return n.code === 'reset' ? 'The host reset this table.' : 'The game is complete.';
  }
}
export default function Notifications({ social, participants = [] }: { social: RoomSocialStore; participants?: ParticipantView[] }) {
  const { notices } = useRoomSocial(social);
  return <section className="room-notices" aria-label="Room notifications"><div role="status" aria-live="polite" aria-atomic="true" className="sr-only">{notices.length ? notificationText(notices[notices.length - 1], participants) : ''}</div>{notices.map(n => <div className={`room-notice notice-${n.kind}`} key={n.id}><p>{notificationText(n, participants)}</p><button type="button" className="icon-btn" aria-label={`Dismiss ${n.kind} notification`} onClick={() => social.dismissNotice(n.id)}>×</button></div>)}</section>;
}
