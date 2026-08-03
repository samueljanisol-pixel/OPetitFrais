import { NextRequest, NextResponse } from "next/server";
import { requireCommandesClientPrepare } from "@/lib/commandes-client/api-auth";
import {
  allLinesPreparationMarked,
  markUnmarkedLinesUnavailable,
  parseWorkflowLines,
  transitionWorkflowStatus,
} from "@/lib/commandes-client/workflow";
import { loadShopCartRow } from "@/lib/commandes-client/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteParams) {
  const gate = await requireCommandesClientPrepare();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const { id } = await params;
  let body: { preparationComment?: unknown; markMissingUnavailable?: unknown };
  try {
    body = (await req.json()) as { preparationComment?: unknown; markMissingUnavailable?: unknown };
  } catch {
    body = {};
  }

  const preparationComment =
    typeof body.preparationComment === "string" ? body.preparationComment.trim() : "";
  const markMissingUnavailable = body.markMissingUnavailable === true;

  const supabase = await createSupabaseServerClient();
  const { row, error: loadErr } = await loadShopCartRow(supabase, id.trim());
  if (loadErr) {
    return NextResponse.json(
      { error: loadErr },
      { status: loadErr === "Commande introuvable" ? 404 : 500 },
    );
  }
  if (!row || row.workflow_status !== "en_preparation") {
    return NextResponse.json({ error: "Préparation non disponible" }, { status: 409 });
  }

  let lines = parseWorkflowLines(row.lines);
  if (!allLinesPreparationMarked(lines)) {
    if (!markMissingUnavailable) {
      return NextResponse.json(
        { error: "Lignes non validées", code: "lines_unmarked" },
        { status: 400 },
      );
    }
    lines = markUnmarkedLinesUnavailable(lines);
  }

  const now = new Date().toISOString();
  const { error: patchErr } = await supabase
    .from("shop_cart")
    .update({
      lines,
      prepared_at: now,
      prepared_by: gate.userId,
      preparation_comment: preparationComment || null,
    })
    .eq("id", id.trim())
    .eq("workflow_status", "en_preparation");

  if (patchErr) {
    return NextResponse.json({ error: patchErr.message }, { status: 500 });
  }

  const result = await transitionWorkflowStatus(supabase, {
    shopCartId: id.trim(),
    fromStatus: "en_preparation",
    toStatus: "a_passer_caisse",
    actorUserId: gate.userId,
    comment: preparationComment || null,
  });

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.conflict ? 409 : 500 });
  }

  return NextResponse.json({ ok: true, workflow_status: "a_passer_caisse", lines });
}
