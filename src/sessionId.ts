/** Session ids are file basenames (UUIDs); anything else is rejected before it reaches a command or URI. */
export const isSessionId = (id: unknown): id is string => typeof id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(id);
