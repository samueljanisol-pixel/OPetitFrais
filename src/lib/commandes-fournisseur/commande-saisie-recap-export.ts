import type { AppLocale } from "@/i18n/config";
import { magasinCodeMx } from "@/lib/commandes-fournisseur/magasin-code-mx";
import {
  productLogisticDisplayIsArabic,
  productLogisticDisplayName,
} from "@/lib/products/product-display-name";
import { lotCommandeDateInfo, type LotCommandeDateInfo } from "@/lib/commandes-fournisseur/lot-commande-date";
import {
  buildSoitLineForLocale,
  labelFromRefForLocale,
  recapLigneQtyUnitLabel,
  type PackagingRowForDisplay,
  type ProductDisplayInfo,
} from "@/lib/commandes-fournisseur/product-display";
import {
  buildRecapRows,
  type MagasinMxColumn,
  type RecapLigneInput,
  type VendeurRecapGroup,
} from "@/lib/commandes-fournisseur/validation-lot-vendeur-recap";
import {
  categoryDisplayLabel,
  parseCategoryFromRef,
} from "@/lib/commandes-fournisseur/ligne-category-order";

export type CommandeSaisieExportLigne = {
  id: string;
  product_id: string;
  product_packaging_id: string | null;
  qte: number;
  line_comment: string | null;
  vendeur_id?: string | null;
  categoryLabel?: string | null;
  uniteVente?: string;
  condPackUniteVente?: string | null;
  condTitre?: string | null;
  packContentQty?: number | null;
  packSalesUnitIsUnite?: boolean;
  packaging?: PackagingRowForDisplay | null;
  product: {
    name: string;
    name_ar?: string | null;
    code?: string;
    ref_sales_unit?: unknown;
    ref_order_unit?: unknown;
  } | null;
};

function one<T>(raw: T | T[] | null | undefined): T | null {
  if (raw == null) {
    return null;
  }
  return (Array.isArray(raw) ? raw[0] : raw) as T;
}

export function commandeSaisieDateInfo(commande: {
  validated_at?: string | null;
  created_at?: string;
}): LotCommandeDateInfo {
  return lotCommandeDateInfo({
    created_at: commande.created_at,
    commande_fournisseur_lot_inclusion: [
      {
        commande_fournisseur: {
          validated_at: commande.validated_at,
          created_at: commande.created_at,
        },
      },
    ],
  });
}

export function magasinMxColumnFromCommande(commande: {
  magasin_id: string;
  magasins?: { code?: string | null; nom?: string | null } | { code?: string | null; nom?: string | null }[] | null;
}): MagasinMxColumn {
  const mag = one(commande.magasins);
  return {
    id: commande.magasin_id,
    mxCode: magasinCodeMx(mag?.code ?? null, 0),
  };
}

/** Libellé magasin pour l’en-tête export (nom, sinon code). */
export function magasinLabelFromCommande(commande: {
  magasins?: { code?: string | null; nom?: string | null } | { code?: string | null; nom?: string | null }[] | null;
}): string {
  const mag = one(commande.magasins);
  const nom = mag?.nom?.trim();
  if (nom && nom.length > 0) {
    return nom;
  }
  const code = mag?.code?.trim();
  if (code && code.length > 0) {
    return code;
  }
  return "Magasin";
}

function displayFromSaisieLigne(
  l: CommandeSaisieExportLigne,
  locale: AppLocale,
): ProductDisplayInfo {
  const isCond = Boolean(l.product_packaging_id);
  const pack = l.packaging ?? null;
  const productUdv =
    l.product?.ref_sales_unit != null
      ? labelFromRefForLocale(l.product.ref_sales_unit, locale)
      : (l.uniteVente ?? "—");
  const packUdv =
    pack?.ref_sales_unit != null
      ? labelFromRefForLocale(pack.ref_sales_unit, locale)
      : (l.condPackUniteVente ?? productUdv);
  const condTitre = l.condTitre?.trim() || null;
  return {
    uniteVente: productUdv,
    condPackUniteVente: isCond ? packUdv : null,
    condTitre,
    packContentQty: isCond ? (l.packContentQty ?? null) : null,
    isCond,
    packSalesUnitIsUnite: l.packSalesUnitIsUnite === true,
  };
}

function packagingForRecapInput(l: CommandeSaisieExportLigne): PackagingRowForDisplay[] {
  if (!l.product_packaging_id || !l.packaging) {
    return [];
  }
  return [l.packaging];
}

function toRecapLigneInput(l: CommandeSaisieExportLigne, magasinId: string): RecapLigneInput {
  const catLabel = (l.categoryLabel ?? "").trim();
  return {
    id: l.id,
    product_id: l.product_id,
    product_packaging_id: l.product_packaging_id,
    vendeur_id: l.vendeur_id ?? null,
    categoryLabel: catLabel.length > 0 ? catLabel : undefined,
    product: {
      name: l.product?.name,
      name_ar: l.product?.name_ar,
      code: l.product?.code,
      ref_sales_unit: l.product?.ref_sales_unit ?? { label: l.uniteVente ?? "—" },
      ref_category: catLabel.length > 0 ? { label: catLabel, sort_order: 0 } : undefined,
      product_packaging: packagingForRecapInput(l),
    },
    commande_fournisseur_lot_ligne_magasin: [
      {
        magasin_id: magasinId,
        qte: l.qte,
      },
    ],
    saisieLigneTargets: [
      {
        ligneId: l.id,
        commandeId: "",
        magasinId,
        magasinLabel: "",
        lineComment: l.line_comment,
        qte: l.qte,
      },
    ],
  };
}

function applyLocaleToRecapRows(
  rows: VendeurRecapGroup["rows"],
  lignes: CommandeSaisieExportLigne[],
  locale: AppLocale,
  formatSoitLine: (qty: string, unit: string) => string,
): void {
  for (let i = 0; i < rows.length; i++) {
    const src = lignes.find((l) => l.id === rows[i]!.ligneId);
    if (!src) {
      continue;
    }
    const pack = src.packaging ?? null;
    const display = displayFromSaisieLigne(src, locale);
    const soitLine =
      src.qte > 0
        ? buildSoitLineForLocale(display, src.qte, locale, pack, formatSoitLine)
        : null;
    const qtyUnit = recapLigneQtyUnitLabel(src, locale);
    rows[i]!.udvCond = qtyUnit !== "—" ? qtyUnit : "—";
    rows[i]!.udvCondSub = soitLine;
    if (src.product) {
      rows[i]!.productDisplayName = productLogisticDisplayName(src.product, locale);
      rows[i]!.productDisplayIsArabic = productLogisticDisplayIsArabic(src.product, locale);
    }
    const cat = src.categoryLabel
      ? { label: src.categoryLabel, sort_order: null as number | null }
      : parseCategoryFromRef(undefined);
    rows[i]!.categoryLabel = categoryDisplayLabel(cat);
  }
}

/**
 * Récap export image pour une commande saisie validée — **un seul tableau**
 * (tous les produits du fournisseur, sans découpage par vendeur marché).
 */
export function buildCommandeSaisieRecapGroups(
  lignes: CommandeSaisieExportLigne[],
  magasinColumn: MagasinMxColumn,
  supplierLabel: string,
  locale: AppLocale,
  formatSoitLine: (qty: string, unit: string) => string,
): VendeurRecapGroup[] {
  const inputs = lignes.map((l) => toRecapLigneInput(l, magasinColumn.id));
  const rows = buildRecapRows(inputs, [magasinColumn]);
  applyLocaleToRecapRows(rows, lignes, locale, formatSoitLine);
  if (rows.length === 0) {
    return [];
  }
  return [
    {
      vendeurKey: "__commande_saisie__",
      vendeurLabel: supplierLabel.trim() || "Commande",
      rows,
    },
  ];
}
