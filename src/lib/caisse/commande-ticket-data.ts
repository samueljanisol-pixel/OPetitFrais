import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppLocale } from "@/i18n/config";
import {
  compareByCategoryThenProductName,
  parseCategoryFromRef,
  type CategoryParsed,
} from "@/lib/commandes-fournisseur/ligne-category-order";
import {
  buildPackagingCondTitreForLocale,
  labelFromRefForLocale,
  orderUnitLabelForLocale,
  packagingConditionnementLabelForLocale,
  type PackagingRowForDisplay,
} from "@/lib/commandes-fournisseur/product-display";
import { roundQty2 } from "@/lib/commandes-fournisseur/qty-parse";
import {
  ticketDateIsoFromTimestamp,
  timestampOnTicketDay,
} from "@/lib/caisse/ticket-day-bounds";
import { ticketUiLabels, type TicketLang } from "@/lib/caisse/ticket-lang";

export type CommandeTicketLine = {
  productId: string;
  productPackagingId: string | null;
  productName: string;
  productCode: string;
  qty: number;
  unitLabel: string;
  packagingLabel: string | null;
  category: CategoryParsed;
  categoryLabel: string;
};

export type CommandeTicketCategoryGroup = {
  categoryLabel: string;
  sortOrder: number;
  lines: CommandeTicketLine[];
};

export type CommandeTicketSupplierBlock = {
  supplierId: string;
  supplierLabel: string;
  commandeId: string;
  dateIso: string;
  groups: CommandeTicketCategoryGroup[];
  lineCount: number;
};

export type CommandeTicketPayload = {
  magasin: { id: string; code: string; nom: string };
  dateIso: string;
  lang: TicketLang;
  suppliers: CommandeTicketSupplierBlock[];
  lineCount: number;
};

type MagasinRow = { id: string; code: string; nom: string };

type CommandeRow = {
  id: string;
  supplier_id: string;
  validated_at: string | null;
  created_at: string;
  ref_supplier:
    | { label?: string | null; code?: string | null }
    | { label?: string | null; code?: string | null }[]
    | null;
};

type LigneRow = {
  id: string;
  commande_id: string;
  product_id: string;
  product_packaging_id: string | null;
  qte: number | string;
};

type ProductRow = {
  id: string;
  name: string;
  name_ar: string | null;
  code: string;
  ref_sales_unit: unknown;
  ref_order_unit?: unknown;
  ref_category?: unknown;
};

function one<T>(raw: T | T[] | null | undefined): T | null {
  if (raw == null) return null;
  return (Array.isArray(raw) ? raw[0] : raw) as T;
}

function refTimestamp(cmd: CommandeRow): string {
  if (typeof cmd.validated_at === "string" && cmd.validated_at.length > 0) {
    return cmd.validated_at;
  }
  return cmd.created_at;
}

function supplierLabelFrom(raw: CommandeRow["ref_supplier"], supplierId: string): string {
  const s = one(raw);
  const label = s?.label?.trim();
  if (label) return label;
  const code = s?.code?.trim();
  if (code) return code;
  return `Fournisseur ${supplierId.slice(0, 8)}`;
}

function formatQty(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (Number.isInteger(n)) return String(n);
  return n.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

export { formatQty };

function appLocale(lang: TicketLang): AppLocale {
  return lang === "ar" ? "ar-MA" : "fr";
}

function categoryLabelForLang(
  refCategory: unknown,
  lang: TicketLang,
  sansCategorie: string,
): { parsed: CategoryParsed; label: string } {
  const parsed = parseCategoryFromRef(refCategory);
  if (lang === "ar") {
    const c = (Array.isArray(refCategory) ? refCategory[0] : refCategory) as
      | { label?: string; label_ar?: string | null; sort_order?: number | null }
      | null
      | undefined;
    const ar = typeof c?.label_ar === "string" ? c.label_ar.trim() : "";
    if (ar.length > 0) {
      return { parsed, label: ar };
    }
  }
  const label = parsed.label.length > 0 ? parsed.label : sansCategorie;
  return { parsed, label };
}

function productNameForLang(product: ProductRow | undefined, lang: TicketLang): string {
  if (!product) return lang === "ar" ? "منتج" : "Produit";
  if (lang === "ar") {
    const ar = product.name_ar?.trim();
    if (ar) return ar;
  }
  return product.name?.trim() || (lang === "ar" ? "منتج" : "Produit");
}

type Agg = {
  productId: string;
  productPackagingId: string | null;
  qty: number;
  productName: string;
  productCode: string;
  unitLabel: string;
  packagingLabel: string | null;
  category: CategoryParsed;
  categoryLabel: string;
  sortKeyLineId: string;
};

function buildCategoryGroups(
  lignes: LigneRow[],
  productMap: Record<string, ProductRow>,
  packMap: Record<string, PackagingRowForDisplay>,
  lang: TicketLang,
): CommandeTicketCategoryGroup[] {
  const locale = appLocale(lang);
  const ui = ticketUiLabels(lang);
  const aggMap = new Map<string, Agg>();

  for (const ligne of lignes) {
    const product = productMap[ligne.product_id];
    const { parsed: category, label: categoryLabel } = categoryLabelForLang(
      product?.ref_category,
      lang,
      ui.sansCategorie,
    );
    const packId = ligne.product_packaging_id;
    const pack = packId ? (packMap[packId] ?? null) : null;

    let unitLabel: string;
    let packagingLabel: string | null = null;
    if (pack) {
      packagingLabel = buildPackagingCondTitreForLocale(pack, locale);
      unitLabel = packagingConditionnementLabelForLocale(pack, locale);
    } else {
      unitLabel = orderUnitLabelForLocale(
        product?.ref_order_unit,
        product?.ref_sales_unit,
        locale,
      );
      if (unitLabel === "—") {
        unitLabel = labelFromRefForLocale(product?.ref_sales_unit, locale);
      }
    }

    const qty = roundQty2(typeof ligne.qte === "string" ? parseFloat(ligne.qte) : Number(ligne.qte));
    const key = `${ligne.product_id}::${packId ?? ""}`;
    const existing = aggMap.get(key);
    if (existing) {
      existing.qty = roundQty2(existing.qty + (Number.isFinite(qty) ? qty : 0));
      continue;
    }

    aggMap.set(key, {
      productId: ligne.product_id,
      productPackagingId: packId,
      qty: Number.isFinite(qty) ? qty : 0,
      productName: productNameForLang(product, lang),
      productCode: product?.code?.trim() || "",
      unitLabel,
      packagingLabel,
      category,
      categoryLabel,
      sortKeyLineId: String(ligne.id),
    });
  }

  const aggregated = [...aggMap.values()].sort((a, b) =>
    compareByCategoryThenProductName(
      a.category,
      b.category,
      a.productName,
      b.productName,
      a.sortKeyLineId,
      b.sortKeyLineId,
    ),
  );

  const groups: CommandeTicketCategoryGroup[] = [];
  for (const row of aggregated) {
    const line: CommandeTicketLine = {
      productId: row.productId,
      productPackagingId: row.productPackagingId,
      productName: row.productName,
      productCode: row.productCode,
      qty: row.qty,
      unitLabel: row.unitLabel,
      packagingLabel: row.packagingLabel,
      category: row.category,
      categoryLabel: row.categoryLabel,
    };
    const last = groups[groups.length - 1];
    if (last && last.categoryLabel === row.categoryLabel) {
      last.lines.push(line);
    } else {
      groups.push({
        categoryLabel: row.categoryLabel,
        sortOrder: row.category.sort_order ?? 0,
        lines: [line],
      });
    }
  }
  return groups;
}

/**
 * Dernière commande non vide par fournisseur pour le magasin.
 */
export async function loadCommandeTicketPayload(
  supabase: SupabaseClient,
  magasinCode: string,
  dateIso: string | null,
  lang: TicketLang = "fr",
): Promise<
  | { ok: true; payload: CommandeTicketPayload }
  | { ok: false; status: number; error: string }
> {
  const code = magasinCode.trim();
  if (!code) {
    return { ok: false, status: 400, error: "Paramètre magasin requis." };
  }

  const { data: magasinRaw, error: magErr } = await supabase
    .from("magasins")
    .select("id, code, nom")
    .eq("code", code)
    .maybeSingle();

  if (magErr) {
    return { ok: false, status: 500, error: magErr.message };
  }
  if (!magasinRaw) {
    return { ok: false, status: 404, error: `Magasin introuvable : ${code}` };
  }
  const magasin = magasinRaw as MagasinRow;

  const { data: commandesRaw, error: cmdErr } = await supabase
    .from("commande_fournisseur")
    .select("id, supplier_id, validated_at, created_at, ref_supplier(code, label)")
    .eq("magasin_id", magasin.id)
    .in("status", ["en_saisie", "validee", "integree"]);

  if (cmdErr) {
    return { ok: false, status: 500, error: cmdErr.message };
  }

  let candidates = (commandesRaw ?? []) as CommandeRow[];

  const emptyPayload = (resolvedDate: string): CommandeTicketPayload => ({
    magasin: { id: magasin.id, code: magasin.code, nom: magasin.nom },
    dateIso: resolvedDate,
    lang,
    suppliers: [],
    lineCount: 0,
  });

  if (candidates.length === 0) {
    return { ok: true, payload: emptyPayload(dateIso ?? "") };
  }

  if (dateIso) {
    candidates = candidates.filter((c) => timestampOnTicketDay(refTimestamp(c), dateIso));
  }

  if (candidates.length === 0) {
    return { ok: true, payload: emptyPayload(dateIso ?? "") };
  }

  const candidateIds = candidates.map((c) => c.id);
  const { data: ligneIdsRaw, error: ligneIdsErr } = await supabase
    .from("commande_fournisseur_ligne")
    .select("commande_id")
    .in("commande_id", candidateIds);

  if (ligneIdsErr) {
    return { ok: false, status: 500, error: ligneIdsErr.message };
  }

  const commandeIdsWithLines = new Set(
    (ligneIdsRaw ?? []).map((r) => r.commande_id as string),
  );
  const withLines = candidates.filter((c) => commandeIdsWithLines.has(c.id));

  const latestBySupplier = new Map<string, CommandeRow>();
  for (const c of withLines) {
    const prev = latestBySupplier.get(c.supplier_id);
    if (!prev || refTimestamp(c) > refTimestamp(prev)) {
      latestBySupplier.set(c.supplier_id, c);
    }
  }

  const selected = [...latestBySupplier.values()].sort((a, b) =>
    supplierLabelFrom(a.ref_supplier, a.supplier_id).localeCompare(
      supplierLabelFrom(b.ref_supplier, b.supplier_id),
      "fr",
    ),
  );

  let headerDate = dateIso ?? "";
  if (!headerDate && selected.length > 0) {
    let latestTs = "";
    for (const c of selected) {
      const ts = refTimestamp(c);
      if (!latestTs || ts > latestTs) latestTs = ts;
    }
    headerDate = ticketDateIsoFromTimestamp(latestTs);
  }

  if (selected.length === 0) {
    return { ok: true, payload: emptyPayload(headerDate) };
  }

  const commandeIds = selected.map((c) => c.id);
  const { data: lignesRaw, error: lignesErr } = await supabase
    .from("commande_fournisseur_ligne")
    .select("id, commande_id, product_id, product_packaging_id, qte")
    .in("commande_id", commandeIds);

  if (lignesErr) {
    return { ok: false, status: 500, error: lignesErr.message };
  }

  const lignes = (lignesRaw ?? []) as LigneRow[];
  const lignesByCommande = new Map<string, LigneRow[]>();
  for (const l of lignes) {
    const list = lignesByCommande.get(l.commande_id) ?? [];
    list.push(l);
    lignesByCommande.set(l.commande_id, list);
  }

  const pids = [...new Set(lignes.map((l) => l.product_id).filter(Boolean))];
  const packIds = [
    ...new Set(lignes.map((l) => l.product_packaging_id).filter((x): x is string => Boolean(x))),
  ];

  let productMap: Record<string, ProductRow> = {};
  if (pids.length > 0) {
    const { data: prods, error: pErr } = await supabase
      .from("product")
      .select(
        "id, name, name_ar, code, ref_sales_unit(label, label_ar, code), ref_order_unit(label, label_ar, code), ref_category(label, label_ar, sort_order)",
      )
      .in("id", pids);
    if (pErr) {
      return { ok: false, status: 500, error: pErr.message };
    }
    productMap = Object.fromEntries((prods ?? []).map((p) => [p.id, p as ProductRow]));
  }

  let packMap: Record<string, PackagingRowForDisplay> = {};
  if (packIds.length > 0) {
    const { data: packs, error: packErr } = await supabase
      .from("product_packaging")
      .select(
        "id, quantity, nom, nom_ar, ref_conditionnement(label, label_ar, code), ref_sales_unit(label, label_ar, code)",
      )
      .in("id", packIds);
    if (packErr) {
      return { ok: false, status: 500, error: packErr.message };
    }
    packMap = Object.fromEntries((packs ?? []).map((p) => [p.id, p as PackagingRowForDisplay]));
  }

  const suppliers: CommandeTicketSupplierBlock[] = [];
  let totalLines = 0;
  for (const cmd of selected) {
    const cmdLignes = lignesByCommande.get(cmd.id) ?? [];
    const groups = buildCategoryGroups(cmdLignes, productMap, packMap, lang);
    const lineCount = groups.reduce((n, g) => n + g.lines.length, 0);
    totalLines += lineCount;
    suppliers.push({
      supplierId: cmd.supplier_id,
      supplierLabel: supplierLabelFrom(cmd.ref_supplier, cmd.supplier_id),
      commandeId: cmd.id,
      dateIso: ticketDateIsoFromTimestamp(refTimestamp(cmd)),
      groups,
      lineCount,
    });
  }

  return {
    ok: true,
    payload: {
      magasin: { id: magasin.id, code: magasin.code, nom: magasin.nom },
      dateIso: headerDate,
      lang,
      suppliers,
      lineCount: totalLines,
    },
  };
}
