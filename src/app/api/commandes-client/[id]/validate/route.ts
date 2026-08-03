import { NextRequest, NextResponse } from "next/server";
import { requireCommandesClientValidate } from "@/lib/commandes-client/api-auth";
import { totalFromStoredLines, transitionWorkflowStatus } from "@/lib/commandes-client/workflow";
import { loadShopCartRow } from "@/lib/commandes-client/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

type Body = { magasin_id?: string };

export async function POST(req: NextRequest, { params }: RouteParams) {
  const gate = await requireCommandesClientValidate();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const { id } = await params;
  let body: Body = {};
  try {
    const text = await req.text();
    if (text.trim()) body = JSON.parse(text) as Body;
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { row, error: loadErr } = await loadShopCartRow(supabase, id.trim());
  if (loadErr) {
    return NextResponse.json(
      { error: loadErr },
      { status: loadErr === "Commande introuvable" ? 404 : 500 },
    );
  }
  if (!row || row.workflow_status !== "a_valider") {
    return NextResponse.json({ error: "Commande non validable à cette étape" }, { status: 409 });
  }
  if (!row.client_id) {
    return NextResponse.json({ error: "Client requis" }, { status: 400 });
  }

  const magasinId = (body.magasin_id?.trim() || row.magasin_id)?.trim();
  if (!magasinId) {
    return NextResponse.json({ error: "magasin_id requis" }, { status: 400 });
  }

  const montant = row.montant_total ?? totalFromStoredLines(row.lines);
  const now = new Date().toISOString();

  const { error: preErr } = await supabase
    .from("shop_cart")
    .update({
      magasin_id: magasinId,
      montant_total: montant,
      validated_at: now,
      validated_by: gate.userId,
    })
    .eq("id", id.trim())
    .eq("workflow_status", "a_valider");

  if (preErr) return NextResponse.json({ error: preErr.message }, { status: 500 });

  const result = await transitionWorkflowStatus(supabase, {
    shopCartId: id.trim(),
    fromStatus: "a_valider",
    toStatus: "a_preparer",
    actorUserId: gate.userId,
  });

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.conflict ? 409 : 500 });
  }

  return NextResponse.json({ ok: true, workflow_status: "a_preparer" });
}
