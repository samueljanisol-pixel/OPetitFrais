import { NextRequest, NextResponse } from "next/server";
import { requireCommandesClientReadAccess } from "@/lib/commandes-client/api-auth";
import { countCommandesClientByFilter, listCommandesClient } from "@/lib/commandes-client/queries";
import type { WorkflowStatus } from "@/lib/commandes-client/workflow";
import { LIST_FILTERS } from "@/features/commandes-client/workflow-labels";
import { loadMagasinsForUser } from "@/lib/magasins/load-magasins-for-user";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const gate = await requireCommandesClientReadAccess();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const supabase = await createSupabaseServerClient();
  const statusParam = req.nextUrl.searchParams.get("workflow_status")?.trim();
  const fulfillmentMode = req.nextUrl.searchParams.get("fulfillment_mode")?.trim() || undefined;
  const magasinIdParam = req.nextUrl.searchParams.get("magasin_id")?.trim() || undefined;
  const includeCancelled = req.nextUrl.searchParams.get("include_cancelled") === "1";

  let workflowStatus: WorkflowStatus | WorkflowStatus[] | undefined;
  if (statusParam) {
    if (statusParam.includes(",")) {
      workflowStatus = statusParam.split(",").map((s) => s.trim()) as WorkflowStatus[];
    } else {
      workflowStatus = statusParam as WorkflowStatus;
    }
  }

  const { data: prof } = await supabase
    .from("profiles")
    .select("roles(slug, is_full_access)")
    .eq("user_id", gate.userId)
    .maybeSingle();
  const roleRaw = prof?.roles as { slug: string | null; is_full_access: boolean } | { slug: string | null; is_full_access: boolean }[] | null;
  const role = Array.isArray(roleRaw) ? roleRaw[0] : roleRaw;

  const { magasins, restricted } = await loadMagasinsForUser(supabase, gate.userId, role ?? null);
  let magasinId = magasinIdParam;
  let magasinIds: string[] | undefined;

  if (magasinId) {
    if (restricted && !magasins.some((m) => m.id === magasinId)) {
      return NextResponse.json({ error: "Magasin non autorisé" }, { status: 403 });
    }
  } else if (restricted && magasins.length > 0) {
    magasinIds = magasins.map((m) => m.id);
  }

  const { items, error } = await listCommandesClient(supabase, {
    workflowStatus,
    fulfillmentMode,
    magasinId,
    magasinIds,
    includeCancelled,
  });

  if (error) return NextResponse.json({ error }, { status: 500 });

  const { counts, error: countErr } = await countCommandesClientByFilter(supabase, LIST_FILTERS, {
    magasinId,
    magasinIds,
  });
  if (countErr) return NextResponse.json({ error: countErr }, { status: 500 });

  return NextResponse.json({ commandes: items, counts });
}
