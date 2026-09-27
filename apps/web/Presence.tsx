import type { ParticipantView, Surface } from '../../packages/protocol/index.js';
import { usePointers } from './api.js';

const COLORS = ['#f2b441', '#6ec3ff', '#ff7a90', '#9be38c', '#c49bff', '#ffa25c', '#5fe0cf', '#f5f5a0'];

/**
 * Remote pointers and pings. Subscribes to the presence store directly, so cursor traffic re-renders only
 * this layer — never the durable board.
 */
export function PresenceLayer({ surface, participants, transform }: { surface: Surface; participants: ParticipantView[]; transform?: { pan: { x: number; y: number }; zoom: number; width: number; height: number } }) {
  const pointers = usePointers();
  return (
    <div className="presence-layer" aria-hidden="true">
      {pointers.filter(([, p]) => p.surface === surface).map(([id, p]) => {
        const who = participants.find(x => x.id === id);
        if (!who) return null;
        const color = COLORS[participants.indexOf(who) % COLORS.length];
        const style = transform
          ? { left: transform.pan.x + p.x * transform.width * transform.zoom, top: transform.pan.y + p.y * transform.height * transform.zoom }
          : { left: `${p.x * 100}%`, top: `${p.y * 100}%` };
        const pinging = p.ping && Date.now() - p.ping < 2500;
        return (
          <div key={id} className="remote-pointer" style={{ ...style, ['--pc' as string]: color }}>
            {pinging && <span className="ping-ring" />}
            <svg width="16" height="18" viewBox="0 0 16 18"><path d="M1 1l13 7-6 2-3 6z" fill={color} stroke="#102" strokeWidth="1" /></svg>
            <span className="pointer-name">{who.nickname}</span>
          </div>
        );
      })}
    </div>
  );
}
