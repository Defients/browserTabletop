/** Neocities serves local play; shared rooms open on their own first-party origin. */
export const STATIC_HOST = import.meta.env?.MODE === 'neocities';

declare global {
  interface Window { TABLETOP_CONFIG?: { roomServerUrl?: string } }
}

export function validateRoomServer(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value);
    const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (url.protocol !== 'https:' && !(loopback && url.protocol === 'http:')) return null;
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    return url.origin;
  } catch { return null; }
}

export function roomServer(): string | null {
  return validateRoomServer(window.TABLETOP_CONFIG?.roomServerUrl);
}

export function onlineHref(route: string): string {
  return STATIC_HOST && roomServer() ? `${roomServer()}/#/${route}` : `#/${route}`;
}
