import { magasinCodeMx } from "@/lib/commandes-fournisseur/magasin-code-mx";
import { lotCommandeDateInfo, type LotCommandeDateInfo } from "@/lib/commandes-fournisseur/lot-commande-date";
import {
  buildSoitLine,
  type ProductDisplayInfo,
} from "@/lib/commandes-fournisseur/product-display";
import {
  buildVendeurRecapGroups,
  type MagasinMxColumn,
  type RecapLigneInput,
  type VendeurRecapGroup,
  type VendeurRef,
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
  product: { name: string; name_ar?: string | null; code?: string } | null;
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

function displayFromSaisieLigne(l: CommandeSaisieExportLigne): ProductDisplayInfo {
  const isCond = Boolean(l.product_packaging_id);
  const productUdv = l.uniteVente ?? "—";
  const packUdv = l.condPackUniteVente ?? productUdv;
  return {
    uniteVente: productUdv,
    condPackUniteVente: isCond ? packUdv : null,
    condTitre: l.condTitre ?? null,
    packContentQty: isCond ? (l.packContentQty ?? null) : null,
    isCond,
    packSalesUnitIsUnite: l.packSalesUnitIsUnite === true,
  };
}

function fakeProductPackaging(l: CommandeSaisieExportLigne) {
  if (!l.product_packaging_id) {
    return [];
  }
  const label =
    l.condTitre?.replace(/\s*\([^)]*\)\s*$/, "").trim() ||
    l.condTitre?.trim() ||
    "Colis";
  const packUdv = l.condPackUniteVente ?? l.uniteVente ?? "—";
  return [
    {
      id: l.product_packaging_id,
      quantity: l.packContentQty ?? 1,
      nom: null,
      ref_conditionnement: { label },
      ref_sales_unit: l.packSalesUnitIsUnite
        ? { label: "Unité", code: "unite" }
        : { label: packUdv },
    },
  ];
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
      ref_sales_unit: { label: l.uniteVente ?? "—" },
      ref_category: catLabel.length > 0 ? { label: catLabel, sort_order: 0 } : undefined,
      product_packaging: fakeProductPackaging(l),
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

/** Récap export image (même format validation lot) pour une commande saisie validée. */
export function buildCommandeSaisieRecapGroups(
  lignes: CommandeSaisieExportLigne[],
  vendeurs: VendeurRef[],
  magasinColumn: MagasinMxColumn,
  supplierLabel: string,
): VendeurRecapGroup[] {
  const inputs = lignes.map((l) => toRecapLigneInput(l, magasinColumn.id));
  const groups = buildVendeurRecapGroups(inputs, vendeurs, [magasinColumn], supplierLabel);
  for (const group of groups) {
    for (let i = 0; i < group.rows.length; i++) {
      const src = lignes.find((l) => l.id === group.rows[i]!.ligneId);
      if (!src) {
        continue;
      }
      const display = displayFromSaisieLigne(src);
      const soitLine = src.qte > 0 ? buildSoitLine(display, src.qte) : null;
      if (display.isCond && display.condTitre) {
        group.rows[i]!.udvCond = display.condTitre;
        group.rows[i]!.udvCondSub = soitLine;
      } else if (soitLine) {
        group.rows[i]!.udvCondSub = soitLine;
      }
      const cat = src.categoryLabel
        ? { label: src.categoryLabel, sort_order: null as number | null }
        : parseCategoryFromRef(undefined);
      group.rows[i]!.categoryLabel = categoryDisplayLabel(cat);
    }
  }
  return groups;
}
