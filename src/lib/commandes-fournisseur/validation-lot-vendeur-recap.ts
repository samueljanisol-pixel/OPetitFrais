import type { AppLocale } from "@/i18n/config";
import {
  buildLotProductDisplayInfoForLocale,
  buildSoitLineForLocale,
  orderUnitLabelForLocale,
  recapCondTitreForLocale,
  type PackagingRowForDisplay,
} from "@/lib/commandes-fournisseur/product-display";
import {
  productLogisticDisplayIsArabic,
  productLogisticDisplayName,
} from "@/lib/products/product-display-name";
import type { SaisieLigneTarget } from "@/lib/commandes-fournisseur/ligne-saisie-comments";
import { magasinCodeMx } from "@/lib/commandes-fournisseur/magasin-code-mx";
import { buildLotProductDisplayInfo, buildSoitLine } from "@/lib/commandes-fournisseur/product-display";
import {
  categoryDisplayLabel,
  compareByCategoryThenProductName,
  parseCategoryFromRef,
} from "@/lib/commandes-fournisseur/ligne-category-order";

export type VendeurRef = {
  id: string;
  label: string;
  phone?: string | null;
  preferred_locale?: string | null;
};

export type MagasinMxColumn = {
  id: string;
  mxCode: string;
};

export type RecapLigneInput = {
  id: string;
  product_id: string;
  product_packaging_id: string | null;
  vendeur_id: string | null;
  categoryLabel?: string;
  product: {
    name?: string;
    name_ar?: string | null;
    code?: string;
    ref_sales_unit?: unknown;
    ref_category?: unknown;
    product_packaging?: unknown;
  } | null;
  commande_fournisseur_lot_ligne_magasin: {
    magasin_id: string;
    qte: number;
    magasins?: { code?: string | null } | { code?: string | null }[] | null;
  }[];
  saisieLigneTargets?: SaisieLigneTarget[];
};

export type VendeurRecapRow = {
  ligneId: string;
  productName: string;
  nameAr: string | null;
  /** Nom affiché (locale UI) ; prioritaire sur productName / nameAr dans l’export. */
  productDisplayName?: string;
  productDisplayIsArabic?: boolean;
  categoryLabel: string;
  mags: number[];
  total: number;
  udvCond: string;
  udvCondSub: string | null;
  /** Commentaire ligne par colonne magasin (même ordre que `mags`). */
  magComments: (string | null)[];
};

export type VendeurRecapGroup = {
  vendeurKey: string;
  vendeurLabel: string;
  rows: VendeurRecapRow[];
  commentaire?: string | null;
};

export const SANS_VENDEUR_KEY = "__sans_vendeur__";

export function vendeurKeyForLigne(vendeurId: string | null | undefined): string {
  return typeof vendeurId === "string" && vendeurId.length > 0 ? vendeurId : SANS_VENDEUR_KEY;
}

export function vendeurLabelForKey(
  key: string,
  vendeurs: VendeurRef[],
  supplierLabel?: string,
): string {
  if (key === SANS_VENDEUR_KEY) {
    const supplierTrim = supplierLabel?.trim() ?? "";
    return vendeurs.length === 0 && supplierTrim.length > 0 ? supplierTrim : "Sans vendeur";
  }
  return vendeurs.find((v) => v.id === key)?.label ?? "Vendeur";
}

export type MatrixGroupBy = "category" | "vendeur";

export type MatrixDisplayHeader =
  | { kind: "category"; label: string }
  | { kind: "vendeur"; vendeurKey: string; label: string };

export type MatrixDisplayItem<T> =
  | { type: "header"; header: MatrixDisplayHeader }
  | { type: "row"; ligne: T; index: number };

export function buildMatrixDisplayItems<T extends RecapLigneInput>(
  lignes: T[],
  groupBy: MatrixGroupBy,
  vendeurs: VendeurRef[],
  supplierLabel: string,
  noCategoryLabel: string,
): MatrixDisplayItem<T>[] {
  if (groupBy === "category") {
    const items: MatrixDisplayItem<T>[] = [];
    for (let i = 0; i < lignes.length; i++) {
      const l = lignes[i]!;
      const catKey = (l.categoryLabel ?? "").trim() || noCategoryLabel;
      const prevCat =
        i > 0 ? ((lignes[i - 1]!.categoryLabel ?? "").trim() || noCategoryLabel) : null;
      if (i === 0 || catKey !== prevCat) {
        items.push({ type: "header", header: { kind: "category", label: catKey } });
      }
      items.push({ type: "row", ligne: l, index: i });
    }
    return items;
  }

  const byVendeur = new Map<string, T[]>();
  for (const l of lignes) {
    const key = vendeurKeyForLigne(l.vendeur_id);
    const list = byVendeur.get(key) ?? [];
    list.push(l);
    byVendeur.set(key, list);
  }

  const keys = [...byVendeur.keys()].sort((a, b) => {
    if (a === SANS_VENDEUR_KEY) return 1;
    if (b === SANS_VENDEUR_KEY) return -1;
    const la = vendeurLabelForKey(a, vendeurs, supplierLabel);
    const lb = vendeurLabelForKey(b, vendeurs, supplierLabel);
    return la.localeCompare(lb, "fr");
  });

  const items: MatrixDisplayItem<T>[] = [];
  for (const key of keys) {
    const groupLignes = sortRecapLignesByCategory(byVendeur.get(key) ?? []);
    items.push({
      type: "header",
      header: {
        kind: "vendeur",
        vendeurKey: key,
        label: vendeurLabelForKey(key, vendeurs, supplierLabel),
      },
    });
    for (const l of groupLignes) {
      const index = lignes.findIndex((x) => x.id === l.id);
      items.push({ type: "row", ligne: l, index: index >= 0 ? index : 0 });
    }
  }
  return items;
}

function one<T>(raw: T | T[] | null | undefined): T | null {
  if (raw == null) return null;
  return (Array.isArray(raw) ? raw[0] : raw) as T;
}

/** Colonnes magasins du lot avec codes MXX (tri par code M). */
export function buildMagasinMxColumnsFromLot(
  lot: {
    commande_fournisseur_lot_inclusion?: {
      commande_fournisseur?: {
        magasin_id?: string;
        magasins?: { code?: string | null } | { code?: string | null }[] | null;
      } | null;
    }[];
  } | null,
): MagasinMxColumn[] {
  const mags: MagasinMxColumn[] = [];
  const seen = new Set<string>();
  let idx = 0;
  for (const inc of lot?.commande_fournisseur_lot_inclusion ?? []) {
    const cf = inc.commande_fournisseur;
    if (!cf?.magasin_id || seen.has(cf.magasin_id)) {
      continue;
    }
    seen.add(cf.magasin_id);
    const code = one(cf.magasins)?.code ?? "";
    mags.push({
      id: cf.magasin_id,
      mxCode: magasinCodeMx(code, idx),
    });
    idx += 1;
  }
  mags.sort((a, b) => a.mxCode.localeCompare(b.mxCode, "fr", { numeric: true }));
  return mags;
}

type LigneMagasinRef = {
  commande_fournisseur_lot_ligne_magasin?: {
    magasin_id: string;
    magasins?: { code?: string | null } | { code?: string | null }[] | null;
  }[];
};

/** Map magasin_id → MXX à partir des lignes lot (répartition magasin). */
export function buildMagasinMxByIdFromLotLignes(lignes: LigneMagasinRef[]): Map<string, string> {
  const mags: MagasinMxColumn[] = [];
  const seen = new Set<string>();
  let idx = 0;
  for (const l of lignes) {
    for (const cell of l.commande_fournisseur_lot_ligne_magasin ?? []) {
      const id = cell.magasin_id;
      if (!id || seen.has(id)) {
        continue;
      }
      seen.add(id);
      const code = one(cell.magasins)?.code ?? "";
      mags.push({
        id,
        mxCode: magasinCodeMx(code, idx),
      });
      idx += 1;
    }
  }
  mags.sort((a, b) => a.mxCode.localeCompare(b.mxCode, "fr", { numeric: true }));
  return new Map(mags.map((m) => [m.id, m.mxCode]));
}

function formatQty(n: number): string {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function buildMagComments(
  targets: SaisieLigneTarget[] | undefined,
  magasinColumns: MagasinMxColumn[],
): (string | null)[] {
  const byMag = new Map<string, string>();
  for (const t of targets ?? []) {
    const text = t.lineComment?.trim();
    if (text) {
      byMag.set(t.magasinId, text);
    }
  }
  return magasinColumns.map((col) => byMag.get(col.id) ?? null);
}

function buildRecapRow(l: RecapLigneInput, magasinColumns: MagasinMxColumn[]): VendeurRecapRow {
  const p = one(l.product);
  const mags = magasinColumns.map((col) => {
    const cell = l.commande_fournisseur_lot_ligne_magasin?.find((x) => x.magasin_id === col.id);
    return Number(cell?.qte) || 0;
  });
  const total = mags.reduce((s, n) => s + n, 0);
  const display = buildLotProductDisplayInfo(
    p
      ? {
          ref_sales_unit: p.ref_sales_unit,
          product_packaging: p.product_packaging,
        }
      : null,
    l.product_packaging_id ?? null,
  );
  const soitLine = total > 0 ? buildSoitLine(display, total) : null;
  let udvCond = display.uniteVente !== "—" ? display.uniteVente : "—";
  let udvCondSub: string | null = null;
  if (display.isCond && display.condTitre) {
    udvCond = display.condTitre;
    udvCondSub = soitLine;
  } else if (soitLine) {
    udvCondSub = soitLine;
  }
  const cat = p ? parseCategoryFromRef(p.ref_category) : { label: "", sort_order: null };
  return {
    ligneId: l.id,
    productName: p?.name?.trim() ? String(p.name) : "—",
    nameAr: typeof p?.name_ar === "string" && p.name_ar.trim().length > 0 ? p.name_ar.trim() : null,
    categoryLabel: categoryDisplayLabel(cat),
    mags,
    total,
    udvCond,
    udvCondSub,
    magComments: buildMagComments(l.saisieLigneTargets, magasinColumns),
  };
}

function sortRecapLignesByCategory(lignes: RecapLigneInput[]): RecapLigneInput[] {
  return [...lignes].sort((a, b) => {
    const pa = one(a.product);
    const pb = one(b.product);
    const ca = pa ? parseCategoryFromRef(pa.ref_category) : { label: "", sort_order: null };
    const cb = pb ? parseCategoryFromRef(pb.ref_category) : { label: "", sort_order: null };
    return compareByCategoryThenProductName(
      ca,
      cb,
      pa?.name ?? "",
      pb?.name ?? "",
      String(a.id),
      String(b.id),
    );
  });
}

/** Lignes récap triées par catégorie puis nom produit (sans regroupement vendeur). */
export function buildRecapRows(
  lignes: RecapLigneInput[],
  magasinColumns: MagasinMxColumn[],
): VendeurRecapRow[] {
  return sortRecapLignesByCategory(lignes).map((l) => buildRecapRow(l, magasinColumns));
}

export function buildVendeurRecapGroups(
  lignes: RecapLigneInput[],
  vendeurs: VendeurRef[],
  magasinColumns: MagasinMxColumn[],
  /** Utilisé à la place de « Sans vendeur » si le fournisseur n’a aucun marchand. */
  supplierLabel?: string,
  vendeurCommentaires?: Record<string, string | null | undefined>,
): VendeurRecapGroup[] {
  const byVendeur = new Map<string, RecapLigneInput[]>();

  for (const l of lignes) {
    const key = vendeurKeyForLigne(l.vendeur_id);
    const list = byVendeur.get(key) ?? [];
    list.push(l);
    byVendeur.set(key, list);
  }

  const keys = [...byVendeur.keys()].sort((a, b) => {
    if (a === SANS_VENDEUR_KEY) return 1;
    if (b === SANS_VENDEUR_KEY) return -1;
    const la = vendeurLabelForKey(a, vendeurs, supplierLabel);
    const lb = vendeurLabelForKey(b, vendeurs, supplierLabel);
    return la.localeCompare(lb, "fr");
  });

  const groups: VendeurRecapGroup[] = [];
  for (const key of keys) {
    const raw = byVendeur.get(key) ?? [];
    groups.push({
      vendeurKey: key,
      vendeurLabel: vendeurLabelForKey(key, vendeurs, supplierLabel),
      commentaire: vendeurCommentaires?.[key] ?? null,
      rows: buildRecapRows(raw, magasinColumns),
    });
  }
  return groups;
}

export function formatRecapQtyCell(n: number): string {
  if (!Number.isFinite(n) || n <= 0) {
    return "";
  }
  return formatQty(n);
}

function packagingForLigne(l: RecapLigneInput): PackagingRowForDisplay | null {
  const p = one(l.product);
  if (!l.product_packaging_id || !p?.product_packaging) {
    return null;
  }
  const packs = Array.isArray(p.product_packaging) ? p.product_packaging : [p.product_packaging];
  const pack = packs.find((x) => (x as PackagingRowForDisplay).id === l.product_packaging_id) as
    | PackagingRowForDisplay
    | undefined;
  return pack ?? null;
}

/** Applique la locale vendeur aux lignes récap (noms produit, UdV, « Soit … »). */
export function applyLocaleToVendeurRecapRows(
  rows: VendeurRecapRow[],
  lignes: RecapLigneInput[],
  locale: AppLocale,
  formatSoitLine: (qty: string, unit: string) => string,
): void {
  for (const row of rows) {
    const src = lignes.find((l) => l.id === row.ligneId);
    if (!src) {
      continue;
    }
    const p = one(src.product);
    const pack = packagingForLigne(src);
    const display = buildLotProductDisplayInfoForLocale(p, src.product_packaging_id, locale);
    const soitLine =
      row.total > 0 ? buildSoitLineForLocale(display, row.total, locale, pack, formatSoitLine) : null;
    let udvCond = display.uniteVente !== "—" ? display.uniteVente : "—";
    let udvCondSub: string | null = null;
    if (display.isCond) {
      const condTitre = recapCondTitreForLocale(display.condTitre, pack, locale);
      if (condTitre) {
        udvCond = condTitre;
        udvCondSub = soitLine;
      } else if (soitLine) {
        udvCondSub = soitLine;
      }
    } else if (soitLine) {
      udvCondSub = soitLine;
    } else if (p) {
      const qtyUnit = orderUnitLabelForLocale(p.ref_order_unit, p.ref_sales_unit, locale);
      if (qtyUnit !== "—") {
        udvCond = qtyUnit;
      }
    }
    row.udvCond = udvCond;
    row.udvCondSub = udvCondSub;
    if (p) {
      row.productDisplayName = productLogisticDisplayName(p, locale);
      row.productDisplayIsArabic = productLogisticDisplayIsArabic(p, locale);
    }
  }
}
