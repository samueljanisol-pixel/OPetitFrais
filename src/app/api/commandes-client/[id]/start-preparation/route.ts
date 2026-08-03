import { NextResponse } from "next/server";
import { requireCommandesClientPrepare } from "@/lib/commandes-client/api-auth";
import { applyLinePreparationStatus, parseWorkflowLines, transitionWorkflowStatus } from "@/lib/commandes-client/workflow";
import { loadShopCartRow } from "@/lib/commandes-client/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: RouteParams) {
  const gate = await requireCommandesClientPrepare();
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
  if (!row || row.workflow_status !== "a_preparer") {
    return NextResponse.json({ error: "Préparation non disponible" }, { status: 409 });
  }

  const resetLines = parseWorkflowLines(row.lines).map((line) =>
    applyLinePreparationStatus(line, "unchecked"),
  );

  const { error: updateErr } = await supabase
    .from("shop_cart")
    .update({ lines: resetLines, preparation_comment: null })
    .eq("id", id.trim())
    .eq("workflow_status", "a_preparer");

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  const result = await transitionWorkflowStatus(supabase, {
    shopCartId: id.trim(),
    fromStatus: "a_preparer",
    toStatus: "en_preparation",
    actorUserId: gate.userId,
  });

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.conflict ? 409 : 500 });
  }

  return NextResponse.json({ ok: true, workflow_status: "en_preparation" });
}
