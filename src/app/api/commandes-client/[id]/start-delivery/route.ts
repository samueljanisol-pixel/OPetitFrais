import { NextResponse } from "next/server";
import { requireCommandesClientDeliver } from "@/lib/commandes-client/api-auth";
import { getCommandeClientListItem, loadShopCartRow } from "@/lib/commandes-client/queries";
import { transitionWorkflowStatus } from "@/lib/commandes-client/workflow";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: RouteParams) {
  const gate = await requireCommandesClientDeliver();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const { id } = await params;
  const shopCartId = id.trim();
  if (!shopCartId) {
    return NextResponse.json({ error: "Id requis" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { row, error: loadErr } = await loadShopCartRow(supabase, shopCartId);
  if (loadErr) {
    return NextResponse.json(
      { error: loadErr },
      { status: loadErr === "Commande introuvable" ? 404 : 500 },
    );
  }
  if (!row || row.workflow_status !== "a_livrer") {
    return NextResponse.json({ error: "Commande non disponible pour démarrer la livraison" }, { status: 409 });
  }

  const now = new Date().toISOString();
  const result = await transitionWorkflowStatus(supabase, {
    shopCartId,
    fromStatus: "a_livrer",
    toStatus: "en_livraison",
    actorUserId: gate.userId,
    extraPatch: { delivery_started_at: now },
  });

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.conflict ? 409 : 500 });
  }

  const { item, error: itemErr } = await getCommandeClientListItem(supabase, shopCartId);
  if (itemErr) return NextResponse.json({ error: itemErr }, { status: 500 });
  if (!item) return NextResponse.json({ error: "Commande introuvable" }, { status: 404 });

  return NextResponse.json({ ok: true, commande: item });
}
