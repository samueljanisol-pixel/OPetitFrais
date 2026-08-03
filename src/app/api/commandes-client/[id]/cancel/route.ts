import { NextRequest, NextResponse } from "next/server";
import { requireCommandesClientValidate } from "@/lib/commandes-client/api-auth";
import {
  appendWorkflowLog,
  CANCELLABLE_STATUSES,
  isLockExpired,
  type WorkflowStatus,
} from "@/lib/commandes-client/workflow";
import { loadShopCartRow } from "@/lib/commandes-client/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

type Body = { reason?: string };

export async function POST(req: NextRequest, { params }: RouteParams) {
  const gate = await requireCommandesClientValidate();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const { id } = await params;
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!reason) {
    return NextResponse.json({ error: "Motif d'annulation requis" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { row, error: loadErr } = await loadShopCartRow(supabase, id.trim());
  if (loadErr) {
    return NextResponse.json(
      { error: loadErr },
      { status: loadErr === "Commande introuvable" ? 404 : 500 },
    );
  }
  if (!row?.workflow_status || !CANCELLABLE_STATUSES.includes(row.workflow_status)) {
    return NextResponse.json({ error: "Commande non annulable" }, { status: 409 });
  }

  if (
    row.workflow_status === "a_passer_caisse" &&
    row.caisse_locked_at != null &&
    !isLockExpired(row.caisse_locked_at)
  ) {
    const label = `${row.caisse_lock_magasin_code ?? ""}${row.caisse_lock_caisse_code ?? ""}`.trim();
    return NextResponse.json(
      { error: label ? `Commande verrouillée en caisse (${label})` : "Commande verrouillée en caisse" },
      { status: 409 },
    );
  }

  const fromStatus = row.workflow_status as WorkflowStatus;
  const now = new Date().toISOString();

  const { error: updErr } = await supabase
    .from("shop_cart")
    .update({
      workflow_status: "annulee",
      cancelled_at: now,
      cancelled_by: gate.userId,
      cancel_reason: reason,
      caisse_locked_at: null,
      caisse_lock_magasin_code: null,
      caisse_lock_caisse_code: null,
    })
    .eq("id", id.trim())
    .eq("workflow_status", fromStatus);

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  await appendWorkflowLog(supabase, {
    shopCartId: id.trim(),
    fromStatus,
    toStatus: "annulee",
    action: "cancel",
    actorUserId: gate.userId,
    comment: reason,
  });

  return NextResponse.json({ ok: true, workflow_status: "annulee" });
}
