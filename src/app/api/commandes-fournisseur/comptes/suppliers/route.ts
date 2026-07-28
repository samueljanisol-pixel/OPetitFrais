import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireApiPermission } from "@/lib/auth/require-permission-api";
import { loadCompteSummaries } from "@/lib/commandes-fournisseur/compte-queries";

export async function GET() {
  const gate = await requireApiPermission("commandes_fournisseur.comptes");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const supabase = await createSupabaseServerClient();
  const result = await loadCompteSummaries(supabase);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ accounts: result.accounts });
}
