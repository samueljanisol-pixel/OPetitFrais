export type CaisseSessionStatus = "closed" | "open" | "locked";

export type CaisseSessionPublic = {
  status: CaisseSessionStatus;
  clotureNumber: number | null;
  clotureRef: string | null;
  caissierId: string | null;
  caissierName: string | null;
  openedAt: string | null;
  saleCount: number;
  cardTicketCount: number;
};

export type CaisseCaissierPublic = {
  userId: string;
  prenom: string;
  nom: string;
};

export type CachedCaissier = CaisseCaissierPublic & {
  pinHash: string;
};

export type CaisseCaissiersPayload = {
  caissiers: CaisseCaissierPublic[];
  error: string | null;
  source: "network" | "cache" | "none";
  fetchedAt: string | null;
};

export type CaisseClotureRecord = {
  clotureRef: string;
  clotureNumber: number;
  caissierId: string;
  caissierName: string;
  openedAt: string;
  closedAt: string;
  bills50: number;
  bills20: number;
  coins10: number;
  drawerTotal: number;
  saleCount: number;
  cardTicketCount: number;
};

export type OpenSessionInput = {
  userId: string;
  pin: string;
};

export type UnlockSessionInput = {
  pin: string;
};

export type CloseSessionInput = {
  bills50: number;
  bills20: number;
  coins10: number;
};

export type SessionActionResult =
  | { ok: true; session: CaisseSessionPublic }
  | { ok: false; error: string };

export function formatCaissierDisplayName(prenom: string, nom: string): string {
  return `${prenom.trim()} ${nom.trim()}`.trim();
}

export function emptyClosedSession(): CaisseSessionPublic {
  return {
    status: "closed",
    clotureNumber: null,
    clotureRef: null,
    caissierId: null,
    caissierName: null,
    openedAt: null,
    saleCount: 0,
    cardTicketCount: 0,
  };
}
