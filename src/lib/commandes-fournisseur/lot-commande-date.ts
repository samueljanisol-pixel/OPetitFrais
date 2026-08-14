/** Dates des commandes incluses dans un lot (affichage + nom de fichier export). */
export type LotCommandeDateInfo = {
  /** Ex. « 19/05/2026 » ou plage « 18/05/2026 – 19/05/2026 » */
  label: string;
  /** Ex. « 2026-05-19 » pour le nom de fichier */
  slug: string;
};

type CommandeInclusion = {
  commande_fournisseur?: {
    created_at?: string;
    validated_at?: string | null;
    date_livraison?: string | null;
  } | null;
};

function one<T>(raw: T | T[] | null | undefined): T | null {
  if (raw == null) return null;
  return (Array.isArray(raw) ? raw[0] : raw) as T;
}

function toDayStart(iso: string): number {
  const d = new Date(iso);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function formatLabelFr(dayMs: number): string {
  return new Date(dayMs).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatSlug(dayMs: number): string {
  const d = new Date(dayMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Date de commande : `validated_at` ou `created_at` des commandes incluses ; repli sur `lotCreatedAt`. */
export function lotCommandeDateInfo(
  lot: {
    created_at?: string;
    date_livraison?: string | null;
    commande_fournisseur_lot_inclusion?: CommandeInclusion[];
  } | null,
): LotCommandeDateInfo {
  const daySet = new Set<number>();
  for (const inc of lot?.commande_fournisseur_lot_inclusion ?? []) {
    const cf = one(inc.commande_fournisseur);
    if (!cf) continue;
    const iso =
      typeof cf.validated_at === "string" && cf.validated_at.length > 0
        ? cf.validated_at
        : cf.created_at;
    if (typeof iso === "string" && iso.length > 0) {
      daySet.add(toDayStart(iso));
    }
  }
  if (daySet.size === 0 && typeof lot?.created_at === "string" && lot.created_at.length > 0) {
    daySet.add(toDayStart(lot.created_at));
  }
  const days = [...daySet].sort((a, b) => a - b);
  if (days.length === 0) {
    const now = Date.now();
    return { label: formatLabelFr(now), slug: formatSlug(now) };
  }
  const min = days[0]!;
  const max = days[days.length - 1]!;
  if (min === max) {
    return { label: formatLabelFr(min), slug: formatSlug(min) };
  }
  return {
    label: `${formatLabelFr(min)} – ${formatLabelFr(max)}`,
    slug: `${formatSlug(min)}_${formatSlug(max)}`,
  };
}

function isoDateToDayMs(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map((x) => Number(x));
  return Date.UTC(y, m - 1, d);
}

/** Date de livraison : lot puis commandes incluses (une seule date attendue en consolidation). */
export function lotLivraisonDateInfo(
  lot: {
    date_livraison?: string | null;
    commande_fournisseur_lot_inclusion?: CommandeInclusion[];
  } | null,
): LotCommandeDateInfo | null {
  const daySet = new Set<number>();
  const lotDate = lot?.date_livraison;
  if (typeof lotDate === "string" && lotDate.length > 0) {
    daySet.add(isoDateToDayMs(lotDate));
  }
  for (const inc of lot?.commande_fournisseur_lot_inclusion ?? []) {
    const cf = one(inc.commande_fournisseur);
    const dl = cf?.date_livraison;
    if (typeof dl === "string" && dl.length > 0) {
      daySet.add(isoDateToDayMs(dl));
    }
  }
  const days = [...daySet].sort((a, b) => a - b);
  if (days.length === 0) {
    return null;
  }
  const min = days[0]!;
  const max = days[days.length - 1]!;
  if (min === max) {
    return { label: formatLabelFr(min), slug: formatSlug(min) };
  }
  return {
    label: `${formatLabelFr(min)} – ${formatLabelFr(max)}`,
    slug: `${formatSlug(min)}_${formatSlug(max)}`,
  };
}
