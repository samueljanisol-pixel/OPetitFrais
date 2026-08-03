const TICKET_COUNTER_PREFIX = "caisse:ticket-no";

function storageKey(magasinCode: string, caisseCode: string): string {
  return `${TICKET_COUNTER_PREFIX}:${magasinCode.trim()}:${caisseCode.trim()}`;
}

/** Numéro de ticket suivant (persisté par magasin + caisse). */
export function nextTicketNumber(magasinCode: string, caisseCode: string): number {
  if (typeof window === "undefined" || !window.localStorage) {
    return Date.now() % 100000;
  }

  const key = storageKey(magasinCode, caisseCode);
  const raw = window.localStorage.getItem(key);
  const prev = raw ? Number.parseInt(raw, 10) : 0;
  const next = Number.isFinite(prev) && prev >= 0 ? prev + 1 : 1;
  window.localStorage.setItem(key, String(next));
  return next;
}

export function formatTicketReference(
  magasinCode: string,
  caisseCode: string,
  ticketNumber: number,
): string {
  const m = magasinCode.replace(/\D/g, "").padStart(2, "0").slice(-2);
  const c = caisseCode.replace(/\D/g, "").padStart(2, "0").slice(-2);
  return `M${m}C${c}T${ticketNumber}`;
}
