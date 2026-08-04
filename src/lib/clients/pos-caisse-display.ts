type MagasinRel = { code?: string | null; nom?: string | null } | null;

type PosLinkRow = {
  caisse_code?: string | null;
  ticket_ref?: string | null;
  magasins?: MagasinRel | MagasinRel[] | null;
};

export type PosCaisseInfo = {
  magasin_code: string | null;
  magasin_nom: string | null;
  caisse_code: string | null;
  ticket_ref: string | null;
};

function one<T>(rel: T | T[] | null | undefined): T | null {
  if (rel == null) return null;
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

function parseTicketRefParts(ticketRef: string): Pick<PosCaisseInfo, "magasin_code" | "caisse_code"> | null {
  const match = /^M(\d{2})C(\d{2})T\d+$/i.exec(ticketRef.trim());
  if (!match) return null;
  return {
    magasin_code: `M${match[1]}`,
    caisse_code: `C${match[2]}`,
  };
}

export function parsePosCaisseInfo(posLinkRaw: unknown): PosCaisseInfo | null {
  const posLink = one(posLinkRaw as PosLinkRow | PosLinkRow[]);
  if (!posLink) return null;

  const magasin = one(posLink.magasins);
  let magasinCode =
    typeof magasin?.code === "string" && magasin.code.trim().length > 0
      ? magasin.code.trim()
      : null;
  const magasinNom =
    typeof magasin?.nom === "string" && magasin.nom.trim().length > 0 ? magasin.nom.trim() : null;
  let caisseCode =
    typeof posLink.caisse_code === "string" && posLink.caisse_code.trim().length > 0
      ? posLink.caisse_code.trim()
      : null;
  const ticketRef =
    typeof posLink.ticket_ref === "string" && posLink.ticket_ref.trim().length > 0
      ? posLink.ticket_ref.trim()
      : null;

  if (ticketRef && (!magasinCode || !caisseCode)) {
    const parsed = parseTicketRefParts(ticketRef);
    if (parsed) {
      magasinCode = magasinCode ?? parsed.magasin_code;
      caisseCode = caisseCode ?? parsed.caisse_code;
    }
  }

  if (!magasinCode && !magasinNom && !caisseCode && !ticketRef) return null;

  return {
    magasin_code: magasinCode,
    magasin_nom: magasinNom,
    caisse_code: caisseCode,
    ticket_ref: ticketRef,
  };
}

export function formatMagasinLabel(info: Pick<PosCaisseInfo, "magasin_code" | "magasin_nom">): string | null {
  if (info.magasin_code && info.magasin_nom && info.magasin_code !== info.magasin_nom) {
    return `${info.magasin_code} — ${info.magasin_nom}`;
  }
  return info.magasin_code ?? info.magasin_nom ?? null;
}
