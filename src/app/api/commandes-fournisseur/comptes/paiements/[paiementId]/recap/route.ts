import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireApiPermission } from "@/lib/auth/require-permission-api";
import { loadPaiementRecap } from "@/lib/commandes-fournisseur/paiement-recap";

type Ctx = { params: Promise<{ paiementId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { paiementId } = await ctx.params;
  const gate = await requireApiPermission("commandes_fournisseur.comptes");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const supabase = await createSupabaseServerClient();
  const result = await loadPaiementRecap(supabase, paiementId);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  }

  return NextResponse.json({ recap: result.recap });
}
