import type { PackRoute } from "@/features/commandes-fournisseur/parcours-product-quantity";

export type ParcoursDraft = {
  qtes: Record<string, number>;
  packRoute: Record<string, PackRoute>;
  /** Commentaire libre par `product_id` (propagé sur chaque ligne enregistrée du produit). */
  lineComments?: Record<string, string>;
  index: number;
  focusProductId: string | null;
};

const KEY_PREFIX = "opf-parcours-draft:";

function storageKey(commandeId: string): string {
  return `${KEY_PREFIX}${commandeId}`;
}

export function saveParcoursDraft(commandeId: string, draft: ParcoursDraft): void {
  if (typeof sessionStorage === "undefined") {
    return;
  }
  try {
    sessionStorage.setItem(storageKey(commandeId), JSON.stringify(draft));
  } catch {
    /* quota / private mode */
  }
}

export function loadParcoursDraft(commandeId: string): ParcoursDraft | null {
  if (typeof sessionStorage === "undefined") {
    return null;
  }
  try {
    const raw = sessionStorage.getItem(storageKey(commandeId));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as ParcoursDraft;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    const lineCommentsRaw = parsed.lineComments;
    const lineComments =
      lineCommentsRaw && typeof lineCommentsRaw === "object"
        ? Object.fromEntries(
            Object.entries(lineCommentsRaw).filter(
              ([, v]) => typeof v === "string" && v.trim().length > 0,
            ),
          )
        : {};

    return {
      qtes: parsed.qtes && typeof parsed.qtes === "object" ? parsed.qtes : {},
      packRoute:
        parsed.packRoute && typeof parsed.packRoute === "object" ? parsed.packRoute : {},
      lineComments,
      index: typeof parsed.index === "number" && parsed.index >= 0 ? parsed.index : 0,
      focusProductId:
        typeof parsed.focusProductId === "string" && parsed.focusProductId.length > 0
          ? parsed.focusProductId
          : null,
    };
  } catch {
    return null;
  }
}

export function clearParcoursDraft(commandeId: string): void {
  if (typeof sessionStorage === "undefined") {
    return;
  }
  try {
    sessionStorage.removeItem(storageKey(commandeId));
  } catch {
    /* ignore */
  }
}
