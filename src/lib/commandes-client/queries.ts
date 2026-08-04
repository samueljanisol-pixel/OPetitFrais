import type { SupabaseClient } from "@supabase/supabase-js";
import { magasinCodeLookupCandidates } from "@/lib/caisse/magasin-code";
import {
  parseWorkflowLines,
  totalFromStoredLines,
  type ShopCartRow,
  type WorkflowStatus,
} from "@/lib/commandes-client/workflow";

export type CommandeClientListItem = {
  id: string;
  cart_number: number;
  workflow_status: WorkflowStatus | null;
  fulfillment_mode: string | null;
  payment_method: string | null;
  payment_status: string;
  montant_total: number | null;
  pos_total: number | null;
  submitted_at: string | null;
  client_id: string | null;
  client_nom: string | null;
  magasin_id: string | null;
  magasin_code: string | null;
  magasin_nom: string | null;
  line_count: number;
  prepared_line_count: number;
  caisse_lock_magasin_code: string | null;
  caisse_lock_caisse_code: string | null;
  caisse_locked_at: string | null;
};

export type CommandeClientDetail = CommandeClientListItem & {
  order_comment: string | null;
  preparation_comment: string | null;
  lines: ReturnType<typeof parseWorkflowLines>;
  validated_at: string | null;
  prepared_at: string | null;
  delivery_started_at: string | null;
  delivered_at: string | null;
  confirmed_payment_method: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  ticket_ref: string | null;
};

export type WorkflowLogEntry = {
  id: string;
  created_at: string;
  from_status: string | null;
  to_status: string | null;
  action: string;
  comment: string | null;
  metadata: Record<string, unknown>;
};

type MagasinRel = { code?: string | null; nom?: string | null } | null;
type ClientRel = { nom?: string | null } | null;
type PosLinkRel = { ticket_ref?: string | null; total?: number | null } | null;

function one<T>(rel: T | T[] | null | undefined): T | null {
  if (rel == null) return null;
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

function mapListRow(row: Record<string, unknown>): CommandeClientListItem {
  const magasin = one(row.magasins as MagasinRel | MagasinRel[]);
  const client = one(row.caisse_client as ClientRel | ClientRel[]);
  const posLink = one(row.shop_cart_pos_link as PosLinkRel | PosLinkRel[]);
  const lines = parseWorkflowLines(row.lines);

  return {
    id: String(row.id),
    cart_number: Number(row.cart_number),
    workflow_status: (row.workflow_status as WorkflowStatus | null) ?? null,
    fulfillment_mode: (row.fulfillment_mode as string | null) ?? null,
    payment_method: (row.payment_method as string | null) ?? null,
    payment_status: String(row.payment_status ?? "unpaid"),
    montant_total:
      row.montant_total != null ? Number(row.montant_total) : totalFromStoredLines(row.lines),
    pos_total: posLink?.total != null ? Number(posLink.total) : null,
    submitted_at: (row.submitted_at as string | null) ?? null,
    client_id: (row.client_id as string | null) ?? null,
    client_nom: client?.nom ?? null,
    magasin_id: (row.magasin_id as string | null) ?? null,
    magasin_code: magasin?.code ?? null,
    magasin_nom: magasin?.nom ?? null,
    line_count: lines.length,
    prepared_line_count: lines.filter((l) => l.prepared === true || l.unavailable === true).length,
    caisse_lock_magasin_code: (row.caisse_lock_magasin_code as string | null) ?? null,
    caisse_lock_caisse_code: (row.caisse_lock_caisse_code as string | null) ?? null,
    caisse_locked_at: (row.caisse_locked_at as string | null) ?? null,
  };
}

const LIST_SELECT = `
  id,
  cart_number,
  workflow_status,
  fulfillment_mode,
  payment_method,
  payment_status,
  montant_total,
  submitted_at,
  client_id,
  magasin_id,
  lines,
  caisse_locked_at,
  caisse_lock_magasin_code,
  caisse_lock_caisse_code,
  magasins ( code, nom ),
  caisse_client ( nom ),
  shop_cart_pos_link ( ticket_ref, total )
`;

const DETAIL_SELECT = `
  ${LIST_SELECT},
  order_comment,
  preparation_comment,
  validated_at,
  prepared_at,
  delivery_started_at,
  delivered_at,
  confirmed_payment_method,
  cancelled_at,
  cancel_reason
`;

export async function listCommandesClient(
  supabase: SupabaseClient,
  filters: {
    workflowStatus?: WorkflowStatus | WorkflowStatus[];
    fulfillmentMode?: string;
    magasinId?: string;
    magasinIds?: string[];
    includeCancelled?: boolean;
  },
): Promise<{ items: CommandeClientListItem[]; error: string | null }> {
  let query = supabase
    .from("shop_cart")
    .select(LIST_SELECT)
    .eq("status", "submitted")
    .order("submitted_at", { ascending: false, nullsFirst: false });

  if (filters.workflowStatus != null) {
    const statuses = Array.isArray(filters.workflowStatus)
      ? filters.workflowStatus
      : [filters.workflowStatus];
    query = query.in("workflow_status", statuses);
  } else if (!filters.includeCancelled) {
    query = query.neq("workflow_status", "annulee");
  }

  if (filters.fulfillmentMode) {
    query = query.eq("fulfillment_mode", filters.fulfillmentMode);
  }
  if (filters.magasinId) {
    query = query.eq("magasin_id", filters.magasinId);
  } else if (filters.magasinIds && filters.magasinIds.length > 0) {
    query = query.in("magasin_id", filters.magasinIds);
  }

  const { data, error } = await query;
  if (error) return { items: [], error: error.message };

  const items = ((data ?? []) as Record<string, unknown>[]).map(mapListRow);
  return { items, error: null };
}

export type CommandeListFilterDef = { key: string; statuses?: WorkflowStatus[] };

function applyMagasinFilter<T extends { eq: (col: string, val: string) => T; in: (col: string, vals: string[]) => T }>(
  query: T,
  magasinId?: string,
  magasinIds?: string[],
): T {
  if (magasinId) return query.eq("magasin_id", magasinId);
  if (magasinIds && magasinIds.length > 0) return query.in("magasin_id", magasinIds);
  return query;
}

export async function countCommandesClientByFilter(
  supabase: SupabaseClient,
  filterDefs: CommandeListFilterDef[],
  filters: {
    magasinId?: string;
    magasinIds?: string[];
  },
): Promise<{ counts: Record<string, number>; error: string | null }> {
  let query = supabase
    .from("shop_cart")
    .select("workflow_status")
    .eq("status", "submitted");

  query = applyMagasinFilter(query, filters.magasinId, filters.magasinIds);

  const { data, error } = await query;
  if (error) return { counts: {}, error: error.message };

  const byStatus: Record<string, number> = {};
  for (const row of data ?? []) {
    const ws = (row as { workflow_status: string | null }).workflow_status ?? "nouvelle";
    byStatus[ws] = (byStatus[ws] ?? 0) + 1;
  }

  const counts: Record<string, number> = {};
  for (const def of filterDefs) {
    if (def.key === "all" || !def.statuses) continue;
    counts[def.key] = def.statuses.reduce((sum, status) => sum + (byStatus[status] ?? 0), 0);
  }

  return { counts, error: null };
}

export async function getCommandeClientDetail(
  supabase: SupabaseClient,
  id: string,
): Promise<{ item: CommandeClientDetail | null; error: string | null }> {
  const { data, error } = await supabase
    .from("shop_cart")
    .select(DETAIL_SELECT)
    .eq("id", id)
    .eq("status", "submitted")
    .maybeSingle();

  if (error) return { item: null, error: error.message };
  if (!data) return { item: null, error: "Commande introuvable" };

  const base = mapListRow(data as Record<string, unknown>);
  const posLink = one(
    (data as Record<string, unknown>).shop_cart_pos_link as PosLinkRel | PosLinkRel[],
  );
  const row = data as Record<string, unknown>;

  return {
    item: {
      ...base,
      order_comment: (row.order_comment as string | null) ?? null,
      preparation_comment: (row.preparation_comment as string | null) ?? null,
      lines: parseWorkflowLines(row.lines),
      validated_at: (row.validated_at as string | null) ?? null,
      prepared_at: (row.prepared_at as string | null) ?? null,
      delivery_started_at: (row.delivery_started_at as string | null) ?? null,
      delivered_at: (row.delivered_at as string | null) ?? null,
      confirmed_payment_method: (row.confirmed_payment_method as string | null) ?? null,
      cancelled_at: (row.cancelled_at as string | null) ?? null,
      cancel_reason: (row.cancel_reason as string | null) ?? null,
      ticket_ref: posLink?.ticket_ref ?? null,
    },
    error: null,
  };
}

export async function listWorkflowLog(
  supabase: SupabaseClient,
  shopCartId: string,
  limit = 50,
): Promise<{ entries: WorkflowLogEntry[]; error: string | null }> {
  const { data, error } = await supabase
    .from("shop_cart_workflow_log")
    .select("id, created_at, from_status, to_status, action, comment, metadata")
    .eq("shop_cart_id", shopCartId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return { entries: [], error: error.message };

  const entries: WorkflowLogEntry[] = ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    created_at: String(row.created_at),
    from_status: (row.from_status as string | null) ?? null,
    to_status: (row.to_status as string | null) ?? null,
    action: String(row.action),
    comment: (row.comment as string | null) ?? null,
    metadata:
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {},
  }));

  return { entries, error: null };
}

export async function loadShopCartRow(
  supabase: SupabaseClient,
  id: string,
): Promise<{ row: ShopCartRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from("shop_cart")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) return { row: null, error: error.message };
  if (!data) return { row: null, error: "Commande introuvable" };
  return { row: data as ShopCartRow, error: null };
}

export async function resolveMagasinIdByCode(
  supabase: SupabaseClient,
  magasinCode: string,
): Promise<{ magasinId: string | null; error: string | null }> {
  const candidates = magasinCodeLookupCandidates(magasinCode);

  for (const code of candidates) {
    const { data, error } = await supabase
      .from("magasins")
      .select("id")
      .ilike("code", code)
      .maybeSingle();

    if (error) return { magasinId: null, error: error.message };
    if (data) return { magasinId: String(data.id), error: null };
  }

  return { magasinId: null, error: "Magasin introuvable" };
}

export async function getCommandeClientListItem(
  supabase: SupabaseClient,
  id: string,
): Promise<{ item: CommandeClientListItem | null; error: string | null }> {
  const { data, error } = await supabase
    .from("shop_cart")
    .select(LIST_SELECT)
    .eq("id", id)
    .eq("status", "submitted")
    .maybeSingle();

  if (error) return { item: null, error: error.message };
  if (!data) return { item: null, error: "Commande introuvable" };
  return { item: mapListRow(data as Record<string, unknown>), error: null };
}

export async function findCommandeByTicketRef(
  supabase: SupabaseClient,
  ticketRef: string,
): Promise<{ shopCartId: string | null; error: string | null }> {
  const { data, error } = await supabase
    .from("shop_cart_pos_link")
    .select("shop_cart_id")
    .eq("ticket_ref", ticketRef.trim())
    .maybeSingle();

  if (error) return { shopCartId: null, error: error.message };
  if (!data) return { shopCartId: null, error: "Ticket inconnu" };
  return { shopCartId: String(data.shop_cart_id), error: null };
}

export async function findCommandeByCartNumber(
  supabase: SupabaseClient,
  cartNumber: number,
): Promise<{ shopCartId: string | null; error: string | null }> {
  const { data, error } = await supabase
    .from("shop_cart")
    .select("id")
    .eq("status", "submitted")
    .eq("cart_number", cartNumber)
    .maybeSingle();

  if (error) return { shopCartId: null, error: error.message };
  if (!data) return { shopCartId: null, error: "Panier introuvable" };
  return { shopCartId: String(data.id), error: null };
}
