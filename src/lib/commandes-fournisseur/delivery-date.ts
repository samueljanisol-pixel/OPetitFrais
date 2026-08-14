/** Code fournisseur « Marché » (seed ref_supplier). */
export const SUPPLIER_CODE_MARCHE = "marche";

/** Marché ou Station (fournisseur sans marchands). */
export function supplierUsesDeliveryDate(
  supplierCode: string | null | undefined,
  vendeurCount: number,
): boolean {
  if (supplierCode === SUPPLIER_CODE_MARCHE) {
    return true;
  }
  return vendeurCount === 0;
}

/** Demain (calendrier local serveur / client). */
export function defaultDeliveryDateIso(from: Date = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  d.setDate(d.getDate() + 1);
  return formatIsoDateLocal(d);
}

export function formatIsoDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Valide une chaîne YYYY-MM-DD ; retourne la chaîne normalisée ou null. */
export function parseIsoDateString(raw: unknown): string | null {
  if (typeof raw !== "string") {
    return null;
  }
  const t = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    return null;
  }
  const [y, m, d] = t.split("-").map((x) => Number(x));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return null;
  }
  const dt = new Date(y, m - 1, d);
  if (
    dt.getFullYear() !== y ||
    dt.getMonth() !== m - 1 ||
    dt.getDate() !== d
  ) {
    return null;
  }
  return t;
}

/** Vérifie que toutes les commandes ont la même date de livraison (non nulle si au moins une est renseignée). */
export function assertUniformDeliveryDates(
  dates: Array<string | null | undefined>,
): { ok: true; date: string | null } | { ok: false; error: string } {
  const normalized = dates.map((d) => (d == null || d === "" ? null : String(d)));
  const nonNull = normalized.filter((d): d is string => d != null);
  if (nonNull.length === 0) {
    return { ok: true, date: null };
  }
  const unique = new Set(nonNull);
  if (unique.size > 1) {
    return {
      ok: false,
      error:
        "Impossible de constituer un lot : les commandes sélectionnées ont des dates de livraison différentes",
    };
  }
  if (nonNull.length !== normalized.length) {
    return {
      ok: false,
      error:
        "Impossible de constituer un lot : certaines commandes n'ont pas de date de livraison",
    };
  }
  return { ok: true, date: nonNull[0]! };
}
