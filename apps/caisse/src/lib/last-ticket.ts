const LAST_TICKET_KEY = "caisse:last-ticket-b64";
const LAST_TICKET_AT_KEY = "caisse:last-ticket-at";

export function saveLastTicketEscPosBase64(base64: string, soldAt: Date = new Date()): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  window.localStorage.setItem(LAST_TICKET_KEY, base64);
  window.localStorage.setItem(LAST_TICKET_AT_KEY, soldAt.toISOString());
}

export function loadLastTicketEscPosBase64(): string | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  const raw = window.localStorage.getItem(LAST_TICKET_KEY);
  return raw && raw.length > 0 ? raw : null;
}

export function loadLastTicketPaidAt(): Date | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  const raw = window.localStorage.getItem(LAST_TICKET_AT_KEY);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function hasLastTicketEscPos(): boolean {
  return loadLastTicketEscPosBase64() != null;
}
