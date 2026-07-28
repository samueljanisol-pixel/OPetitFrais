import type { EmballageRow, EmballageTypeRelation } from "@/lib/emballages/types";
import { normalizeEmballageTypeRef } from "@/lib/emballages/types";

export const EMBALLAGE_SELECT =
  "id, label, type_id, sort_order, active, created_at, updated_at, ref_emballage_type(id, label)";

export function parseEmballageRow(raw: Record<string, unknown>): EmballageRow {
  return {
    id: raw.id as string,
    label: raw.label as string,
    type_id: raw.type_id as string,
    sort_order: typeof raw.sort_order === "number" ? raw.sort_order : 0,
    active: Boolean(raw.active),
    created_at: raw.created_at as string | undefined,
    updated_at: raw.updated_at as string | undefined,
    ref_emballage_type: normalizeEmballageTypeRef(raw.ref_emballage_type as EmballageTypeRelation),
  };
}

export const EMBALLAGE_REF_EMBED_SELECT =
  "id, label, ref_emballage_type(id, label)";
