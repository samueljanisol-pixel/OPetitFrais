import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireApiPermission } from "@/lib/auth/require-permission-api";
import { userCanAccessSalarie } from "@/lib/salaries/api-helpers";

type Ctx = { params: Promise<{ id: string; paiementId: string }> };

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id, paiementId } = await ctx.params;
  const gate = await requireApiPermission("salaries.write");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const supabase = await createSupabaseServerClient();
  const access = await userCanAccessSalarie(supabase, gate.userId, id);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { error } = await supabase
    .from("salarie_paiement")
    .delete()
    .eq("id", paiementId)
    .eq("salarie_id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
