const LAST_TICKET_KEY = "caisse:last-ticket-b64";

export function saveLastTicketEscPosBase64(base64: string): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  window.localStorage.setItem(LAST_TICKET_KEY, base64);
}

export function loadLastTicketEscPosBase64(): string | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  const raw = window.localStorage.getItem(LAST_TICKET_KEY);
  return raw && raw.length > 0 ? raw : null;
}

export function hasLastTicketEscPos(): boolean {
  return loadLastTicketEscPosBase64() != null;
}
