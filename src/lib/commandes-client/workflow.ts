import type { SupabaseClient } from "@supabase/supabase-js";

export const WORKFLOW_STATUSES = [
  "nouvelle",
  "a_valider",
  "a_preparer",
  "en_preparation",
  "a_passer_caisse",
  "a_livrer",
  "a_retirer",
  "en_livraison",
  "livre_paye",
  "livre_espece_a_encaisser",
  "livre_non_paye",
  "retire_paye",
  "retire_espece_a_encaisser",
  "retire_compte_client",
  "annulee",
] as const;

export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];

export type WorkflowLogAction =
  | "transition"
  | "lock_caisse"
  | "unlock_caisse"
  | "lock_expired"
  | "cancel"
  | "pos_link";

export type ConfirmedPaymentMethod = "cash" | "card" | "credit" | "none";

export type CaisseLockState = "available" | "locked_self" | "locked_other";

export const CAISSE_LOCK_TTL_MS = 30 * 60 * 1000;

export const CANCELLABLE_STATUSES: WorkflowStatus[] = [
  "nouvelle",
  "a_valider",
  "a_preparer",
  "en_preparation",
  "a_passer_caisse",
];

export type ShopCartWorkflowLine = {
  productId: string;
  shopOrderUnitId?: string;
  qty: number;
  unitCode?: string;
  unitLabel?: string;
  priceAtAdd: number;
  equivKgAtAdd?: number;
  canonicalKg?: number | null;
  comment?: string | null;
  prepared?: boolean;
  preparedAt?: string | null;
  unavailable?: boolean;
  unavailableAt?: string | null;
};

export type LinePreparationStatus = "available" | "unavailable" | "unchecked";

export type ShopCartRow = {
  id: string;
  cart_number: number;
  client_id: string | null;
  magasin_id: string | null;
  lines: unknown;
  fulfillment_mode: string | null;
  payment_method: string | null;
  order_comment: string | null;
  status: string;
  workflow_status: WorkflowStatus | null;
  montant_total: number | null;
  payment_status: string;
  submitted_at: string | null;
  validated_at: string | null;
  prepared_at: string | null;
  delivery_started_at: string | null;
  delivered_at: string | null;
  confirmed_payment_method: ConfirmedPaymentMethod | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  caisse_locked_at: string | null;
  caisse_lock_magasin_code: string | null;
  caisse_lock_caisse_code: string | null;
};

const TRANSITIONS: Partial<Record<WorkflowStatus, WorkflowStatus[]>> = {
  nouvelle: ["a_valider", "annulee"],
  a_valider: ["a_preparer", "annulee"],
  a_preparer: ["en_preparation", "annulee"],
  en_preparation: ["a_passer_caisse", "a_preparer", "annulee"],
  a_passer_caisse: ["a_livrer", "a_retirer", "annulee"],
  a_livrer: ["en_livraison"],
  en_livraison: ["livre_paye", "livre_espece_a_encaisser", "livre_non_paye"],
  a_retirer: ["retire_paye", "retire_espece_a_encaisser", "retire_compte_client"],
  livre_espece_a_encaisser: ["livre_paye"],
  retire_espece_a_encaisser: ["retire_paye"],
  retire_compte_client: ["retire_paye"],
};

export function canTransition(from: WorkflowStatus | null, to: WorkflowStatus): boolean {
  if (from == null) return to === "nouvelle";
  const allowed = TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

export function parseTicketReference(ticketRef: string): {
  magasinCode: string;
  caisseCode: string;
  ticketNumber: number;
} | null {
  const m = /^M(\d{2})C(\d{2})T(\d+)$/i.exec(ticketRef.trim());
  if (!m) return null;
  const ticketNumber = Number(m[3]);
  if (!Number.isFinite(ticketNumber) || ticketNumber <= 0) return null;
  return {
    magasinCode: `M${m[1]}`,
    caisseCode: `C${m[2]}`,
    ticketNumber,
  };
}

export function isLockExpired(lockedAt: string | null, nowMs = Date.now()): boolean {
  if (lockedAt == null) return false;
  const t = Date.parse(lockedAt);
  if (!Number.isFinite(t)) return true;
  return nowMs - t > CAISSE_LOCK_TTL_MS;
}

export function computeCaisseLockState(
  row: Pick<
    ShopCartRow,
    "caisse_locked_at" | "caisse_lock_magasin_code" | "caisse_lock_caisse_code"
  >,
  viewerMagasinCode: string,
  viewerCaisseCode: string,
): { state: CaisseLockState; label: string | null } {
  if (row.caisse_locked_at == null) {
    return { state: "available", label: null };
  }
  if (isLockExpired(row.caisse_locked_at)) {
    return { state: "available", label: null };
  }
  const mag = (row.caisse_lock_magasin_code ?? "").trim();
  const caisse = (row.caisse_lock_caisse_code ?? "").trim();
  const same =
    mag.toUpperCase() === viewerMagasinCode.trim().toUpperCase() &&
    caisse.toUpperCase() === viewerCaisseCode.trim().toUpperCase();
  if (same) {
    return { state: "locked_self", label: `${mag}${caisse}` };
  }
  return { state: "locked_other", label: `${mag}${caisse}` };
}

export function totalFromStoredLines(lines: unknown): number {
  if (!Array.isArray(lines)) return 0;
  let sum = 0;
  for (const raw of lines) {
    if (!raw || typeof raw !== "object") continue;
    const l = raw as Record<string, unknown>;
    const qty = typeof l.qty === "number" ? l.qty : 0;
    const price = typeof l.priceAtAdd === "number" ? l.priceAtAdd : 0;
    if (Number.isFinite(qty) && Number.isFinite(price)) {
      sum += qty * price;
    }
  }
  return Math.round(sum * 100) / 100;
}

export function parseWorkflowLines(lines: unknown): ShopCartWorkflowLine[] {
  if (!Array.isArray(lines)) return [];
  const out: ShopCartWorkflowLine[] = [];
  for (const raw of lines) {
    if (!raw || typeof raw !== "object") continue;
    const l = raw as Record<string, unknown>;
    const productId = typeof l.productId === "string" ? l.productId : "";
    const qty = typeof l.qty === "number" ? l.qty : 0;
    const priceAtAdd = typeof l.priceAtAdd === "number" ? l.priceAtAdd : 0;
    if (!productId || qty <= 0) continue;
    out.push({
      productId,
      shopOrderUnitId: typeof l.shopOrderUnitId === "string" ? l.shopOrderUnitId : undefined,
      qty,
      unitCode: typeof l.unitCode === "string" ? l.unitCode : undefined,
      unitLabel: typeof l.unitLabel === "string" ? l.unitLabel : undefined,
      priceAtAdd,
      equivKgAtAdd: typeof l.equivKgAtAdd === "number" ? l.equivKgAtAdd : undefined,
      canonicalKg: typeof l.canonicalKg === "number" ? l.canonicalKg : null,
      comment: typeof l.comment === "string" ? l.comment : null,
      prepared: l.prepared === true,
      preparedAt: typeof l.preparedAt === "string" ? l.preparedAt : null,
      unavailable: l.unavailable === true,
      unavailableAt: typeof l.unavailableAt === "string" ? l.unavailableAt : null,
    });
  }
  return out;
}

export function getLinePreparationStatus(line: ShopCartWorkflowLine): LinePreparationStatus {
  if (line.unavailable === true) return "unavailable";
  if (line.prepared === true) return "available";
  return "unchecked";
}

export function isLinePreparationMarked(line: ShopCartWorkflowLine): boolean {
  return line.prepared === true || line.unavailable === true;
}

export function applyLinePreparationStatus(
  line: ShopCartWorkflowLine,
  status: LinePreparationStatus,
): ShopCartWorkflowLine {
  const now = new Date().toISOString();
  if (status === "available") {
    return {
      ...line,
      prepared: true,
      preparedAt: now,
      unavailable: false,
      unavailableAt: null,
    };
  }
  if (status === "unavailable") {
    return {
      ...line,
      prepared: false,
      preparedAt: null,
      unavailable: true,
      unavailableAt: now,
    };
  }
  return {
    ...line,
    prepared: false,
    preparedAt: null,
    unavailable: false,
    unavailableAt: null,
  };
}

export function allLinesPreparationMarked(lines: ShopCartWorkflowLine[]): boolean {
  if (lines.length === 0) return false;
  return lines.every(isLinePreparationMarked);
}

export function markUnmarkedLinesUnavailable(lines: ShopCartWorkflowLine[]): ShopCartWorkflowLine[] {
  return lines.map((line) =>
    isLinePreparationMarked(line) ? line : applyLinePreparationStatus(line, "unavailable"),
  );
}

/** @deprecated Utiliser allLinesPreparationMarked */
export function allLinesPrepared(lines: ShopCartWorkflowLine[]): boolean {
  return allLinesPreparationMarked(lines);
}

export async function appendWorkflowLog(
  supabase: SupabaseClient,
  input: {
    shopCartId: string;
    fromStatus?: WorkflowStatus | null;
    toStatus?: WorkflowStatus | null;
    action: WorkflowLogAction;
    actorUserId?: string | null;
    comment?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("shop_cart_workflow_log").insert({
    shop_cart_id: input.shopCartId,
    from_status: input.fromStatus ?? null,
    to_status: input.toStatus ?? null,
    action: input.action,
    actor_user_id: input.actorUserId ?? null,
    comment: input.comment?.trim() || null,
    metadata: input.metadata ?? {},
  });
  if (error) return { error: error.message };
  return { error: null };
}

export async function transitionWorkflowStatus(
  supabase: SupabaseClient,
  input: {
    shopCartId: string;
    fromStatus: WorkflowStatus | null;
    toStatus: WorkflowStatus;
    actorUserId?: string | null;
    comment?: string | null;
    extraPatch?: Record<string, unknown>;
  },
): Promise<{ error: string | null; conflict?: boolean }> {
  if (!canTransition(input.fromStatus, input.toStatus)) {
    return { error: "Transition workflow invalide", conflict: true };
  }

  const patch: Record<string, unknown> = {
    workflow_status: input.toStatus,
    ...input.extraPatch,
  };

  let query = supabase.from("shop_cart").update(patch).eq("id", input.shopCartId);
  if (input.fromStatus != null) {
    query = query.eq("workflow_status", input.fromStatus);
  } else {
    query = query.is("workflow_status", null);
  }

  const { data, error } = await query.select("id").maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "Transition refusée (statut modifié)", conflict: true };

  const logResult = await appendWorkflowLog(supabase, {
    shopCartId: input.shopCartId,
    fromStatus: input.fromStatus,
    toStatus: input.toStatus,
    action: "transition",
    actorUserId: input.actorUserId,
    comment: input.comment,
  });
  if (logResult.error) return logResult;

  return { error: null };
}

export async function clearExpiredCaisseLockIfNeeded(
  supabase: SupabaseClient,
  row: ShopCartRow,
): Promise<void> {
  if (row.caisse_locked_at == null) return;
  if (!isLockExpired(row.caisse_locked_at)) return;

  await supabase
    .from("shop_cart")
    .update({
      caisse_locked_at: null,
      caisse_lock_magasin_code: null,
      caisse_lock_caisse_code: null,
    })
    .eq("id", row.id);

  await appendWorkflowLog(supabase, {
    shopCartId: row.id,
    fromStatus: row.workflow_status,
    toStatus: row.workflow_status,
    action: "lock_expired",
    metadata: {
      magasinCode: row.caisse_lock_magasin_code,
      caisseCode: row.caisse_lock_caisse_code,
    },
  });
}

export async function acquireCaisseLock(
  supabase: SupabaseClient,
  input: {
    shopCartId: string;
    magasinCode: string;
    caisseCode: string;
  },
): Promise<{ error: string | null; conflict?: boolean; lockLabel?: string }> {
  const { data: row, error: fe } = await supabase
    .from("shop_cart")
    .select(
      "id, workflow_status, caisse_locked_at, caisse_lock_magasin_code, caisse_lock_caisse_code",
    )
    .eq("id", input.shopCartId)
    .maybeSingle();

  if (fe) return { error: fe.message };
  if (!row) return { error: "Commande introuvable" };
  if (String(row.workflow_status) !== "a_passer_caisse") {
    return { error: "Commande non disponible en caisse", conflict: true };
  }

  const cart = row as ShopCartRow;
  if (cart.caisse_locked_at != null && !isLockExpired(cart.caisse_locked_at)) {
    const lock = computeCaisseLockState(cart, input.magasinCode, input.caisseCode);
    if (lock.state === "locked_other") {
      return {
        error: `Commande en cours sur ${lock.label ?? "une autre caisse"}`,
        conflict: true,
        lockLabel: lock.label ?? undefined,
      };
    }
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("shop_cart")
    .update({
      caisse_locked_at: now,
      caisse_lock_magasin_code: input.magasinCode.trim(),
      caisse_lock_caisse_code: input.caisseCode.trim(),
    })
    .eq("id", input.shopCartId)
    .eq("workflow_status", "a_passer_caisse")
    .select("id")
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: "Verrou impossible", conflict: true };

  await appendWorkflowLog(supabase, {
    shopCartId: input.shopCartId,
    fromStatus: "a_passer_caisse",
    toStatus: "a_passer_caisse",
    action: "lock_caisse",
    metadata: {
      magasinCode: input.magasinCode,
      caisseCode: input.caisseCode,
    },
  });

  return { error: null };
}

export async function releaseCaisseLock(
  supabase: SupabaseClient,
  input: {
    shopCartId: string;
    magasinCode?: string;
    caisseCode?: string;
    force?: boolean;
  },
): Promise<{ error: string | null }> {
  const { data: row, error: fe } = await supabase
    .from("shop_cart")
    .select("id, caisse_locked_at, caisse_lock_magasin_code, caisse_lock_caisse_code, workflow_status")
    .eq("id", input.shopCartId)
    .maybeSingle();

  if (fe) return { error: fe.message };
  if (!row) return { error: "Commande introuvable" };
  const cart = row as ShopCartRow;
  if (cart.caisse_locked_at == null) return { error: null };

  if (!input.force && input.magasinCode && input.caisseCode) {
    const lock = computeCaisseLockState(cart, input.magasinCode, input.caisseCode);
    if (lock.state === "locked_other") {
      return { error: "Verrou détenu par un autre poste" };
    }
  }

  const { error } = await supabase
    .from("shop_cart")
    .update({
      caisse_locked_at: null,
      caisse_lock_magasin_code: null,
      caisse_lock_caisse_code: null,
    })
    .eq("id", input.shopCartId);

  if (error) return { error: error.message };

  await appendWorkflowLog(supabase, {
    shopCartId: input.shopCartId,
    fromStatus: cart.workflow_status,
    toStatus: cart.workflow_status,
    action: "unlock_caisse",
    metadata: {
      magasinCode: input.magasinCode ?? cart.caisse_lock_magasin_code,
      caisseCode: input.caisseCode ?? cart.caisse_lock_caisse_code,
    },
  });

  return { error: null };
}

export function paymentStatusFromPosPayments(
  payments: Array<{ mode: string; amount: number }>,
  totalDue: number,
): "paid" | "unpaid" {
  const hasCredit = payments.some((p) => p.mode === "credit" && p.amount > 0.001);
  if (hasCredit) return "unpaid";
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
  if (totalPaid >= totalDue - 0.001) return "paid";
  return "unpaid";
}

export function workflowStatusAfterPosLink(fulfillmentMode: string | null): WorkflowStatus {
  return fulfillmentMode === "pickup" ? "a_retirer" : "a_livrer";
}
