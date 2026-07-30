import type { CatalogProduct } from "@opf/caisse-core";
import type { SaurusPluItem } from "./saurus-scale/protocol";

export type SaurusPluSkip = {
  code: string;
  reason: string;
};

function parsePluFromCode(code: string): number | null {
  const digits = code.replace(/\D/g, "");
  if (digits.length === 0) return null;
  const n = Number.parseInt(digits, 10);
  if (!Number.isFinite(n) || n <= 0 || n > 65535) return null;
  return n;
}

export function catalogToSaurusPluItems(products: CatalogProduct[]): {
  items: SaurusPluItem[];
  skipped: SaurusPluSkip[];
} {
  const items: SaurusPluItem[] = [];
  const skipped: SaurusPluSkip[] = [];
  const seenPlu = new Set<number>();

  for (const product of products) {
    if (!product.active) continue;
    const code = product.code.trim();
    const plu = parsePluFromCode(code);
    if (plu == null) {
      skipped.push({ code, reason: "Code PLU invalide" });
      continue;
    }
    if (seenPlu.has(plu)) {
      skipped.push({ code, reason: `PLU ${plu} déjà utilisé` });
      continue;
    }

    const priceCents = Math.round(product.price * 100);
    if (priceCents <= 0) {
      skipped.push({ code, reason: "Prix manquant ou nul" });
      continue;
    }
    if (priceCents > 9999) {
      skipped.push({ code, reason: "Prix > 99,99 DH (max balance)" });
      continue;
    }

    const unitKg = product.salesUnit === "kg";
    seenPlu.add(plu);
    items.push({
      plu,
      name: product.salesName,
      priceCents,
      unitKg,
      flag: unitKg ? 5 : 0,
    });
  }

  items.sort((a, b) => a.plu - b.plu);
  return { items, skipped };
}
