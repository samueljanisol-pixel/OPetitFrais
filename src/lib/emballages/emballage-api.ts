import type { EmballageCategorieRow, EmballageRow, EmballageTypeRelation } from "@/lib/emballages/types";
import { normalizeEmballageCategorieRef, normalizeEmballageTypeRef } from "@/lib/emballages/types";

export const EMBALLAGE_SELECT =
  "id, label, categorie_id, reference, type_id, sort_order, active, created_at, updated_at, ref_emballage_type(id, label), ref_emballage_categorie(id, code, label)";

export function parseEmballageRow(raw: Record<string, unknown>): EmballageRow {
  const typeIdRaw = raw.type_id;
  return {
    id: raw.id as string,
    label: raw.label as string,
    categorie_id: raw.categorie_id as string,
    reference: typeof raw.reference === "string" ? raw.reference.trim() || null : null,
    type_id: typeof typeIdRaw === "string" && typeIdRaw.length > 0 ? typeIdRaw : null,
    sort_order: typeof raw.sort_order === "number" ? raw.sort_order : 0,
    active: Boolean(raw.active),
    created_at: raw.created_at as string | undefined,
    updated_at: raw.updated_at as string | undefined,
    ref_emballage_type: normalizeEmballageTypeRef(raw.ref_emballage_type as EmballageTypeRelation),
    ref_emballage_categorie: normalizeEmballageCategorieRef(
      raw.ref_emballage_categorie as Parameters<typeof normalizeEmballageCategorieRef>[0],
    ),
  };
}

export const EMBALLAGE_REF_EMBED_SELECT =
  "id, label, reference, ref_emballage_type(id, label), ref_emballage_categorie(id, code, label)";

export function parseEmballageCategorieRow(raw: Record<string, unknown>): EmballageCategorieRow {
  return {
    id: raw.id as string,
    code: raw.code as string,
    label: raw.label as string,
    sort_order: typeof raw.sort_order === "number" ? raw.sort_order : 0,
  };
}
