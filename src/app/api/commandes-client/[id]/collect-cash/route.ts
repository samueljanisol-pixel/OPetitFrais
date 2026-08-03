import { NextResponse } from "next/server";
import { requireCommandesClientDeliver } from "@/lib/commandes-client/api-auth";
import { transitionWorkflowStatus } from "@/lib/commandes-client/workflow";
import { loadShopCartRow } from "@/lib/commandes-client/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: RouteParams) {
  const gate = await requireCommandesClientDeliver();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { row, error: loadErr } = await loadShopCartRow(supabase, id.trim());
  if (loadErr) {
    return NextResponse.json(
      { error: loadErr },
      { status: loadErr === "Commande introuvable" ? 404 : 500 },
    );
  }

  const ws = row?.workflow_status;
  if (ws !== "livre_espece_a_encaisser" && ws !== "retire_espece_a_encaisser") {
    return NextResponse.json({ error: "Encaissement non disponible" }, { status: 409 });
  }

  const toStatus = ws === "livre_espece_a_encaisser" ? "livre_paye" : "retire_paye";

  const result = await transitionWorkflowStatus(supabase, {
    shopCartId: id.trim(),
    fromStatus: ws,
    toStatus,
    actorUserId: gate.userId,
    extraPatch: { payment_status: "paid" },
  });

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.conflict ? 409 : 500 });
  }

  return NextResponse.json({ ok: true, workflow_status: toStatus, payment_status: "paid" });
}
