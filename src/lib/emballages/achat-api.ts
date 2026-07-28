import type { EmballageAchatFicheRow, EmballageAchatLigneRow, EmballageRefRelation, EmballageVendeurRelation } from "@/lib/emballages/types";
import { emballageAchatLigneMontant, isEmballageStatutFiche, normalizeEmballageRef, normalizeEmballageVendeurRef } from "@/lib/emballages/types";

export function isIsoDate(raw: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(raw);
}

export function parseFicheRow(raw: Record<string, unknown>): EmballageAchatFicheRow {
  const statutRaw = typeof raw.statut === "string" ? raw.statut : "ouvert";
  const vendeurIdRaw = raw.vendeur_id;
  return {
    id: raw.id as string,
    date_achat: raw.date_achat as string,
    statut: isEmballageStatutFiche(statutRaw) ? statutRaw : "ouvert",
    note: (raw.note as string | null) ?? null,
    vendeur_id: typeof vendeurIdRaw === "string" && vendeurIdRaw.length > 0 ? vendeurIdRaw : null,
    cloture_at: (raw.cloture_at as string | null) ?? null,
    created_at: raw.created_at as string | undefined,
    updated_at: raw.updated_at as string | undefined,
    ref_supplier_vendeur: normalizeEmballageVendeurRef(
      raw.ref_supplier_vendeur as EmballageVendeurRelation | undefined,
    ),
  };
}

export function parseLigneRow(raw: Record<string, unknown>): EmballageAchatLigneRow {
  const quantite =
    typeof raw.quantite === "number" ? raw.quantite : Number.parseFloat(String(raw.quantite));
  const prix_unitaire =
    typeof raw.prix_unitaire === "number"
      ? raw.prix_unitaire
      : Number.parseFloat(String(raw.prix_unitaire));
  return {
    id: raw.id as string,
    fiche_id: raw.fiche_id as string,
    emballage_id: raw.emballage_id as string,
    quantite: Number.isFinite(quantite) ? quantite : 0,
    prix_unitaire: Number.isFinite(prix_unitaire) ? prix_unitaire : 0,
    note: (raw.note as string | null) ?? null,
    sort_order: typeof raw.sort_order === "number" ? raw.sort_order : 0,
    created_at: raw.created_at as string | undefined,
    updated_at: raw.updated_at as string | undefined,
    ref_emballage: normalizeEmballageRef(raw.ref_emballage as EmballageRefRelation),
  };
}

export function sumLignesMontant(lignes: EmballageAchatLigneRow[]): number {
  return lignes.reduce((acc, l) => acc + emballageAchatLigneMontant(l), 0);
}

export const FICHE_SELECT =
  "id, date_achat, statut, note, vendeur_id, cloture_at, created_at, updated_at, ref_supplier_vendeur(id, label)";
export const LIGNE_SELECT =
  "id, fiche_id, emballage_id, quantite, prix_unitaire, note, sort_order, created_at, updated_at, ref_emballage(id, label, reference, ref_emballage_type(id, label), ref_emballage_categorie(id, code, label))";
