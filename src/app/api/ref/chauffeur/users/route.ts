import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { requireAnyApiPermission } from "@/lib/auth/require-permission-api";
import { listChauffeurUserOptions } from "@/lib/ref/chauffeur-server";

export async function GET() {
  const gate = await requireAnyApiPermission(["parametres.read", "parametres.write"]);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  let service;
  try {
    service = createSupabaseServiceRoleClient();
  } catch {
    return NextResponse.json({ error: "Service role non configurée" }, { status: 500 });
  }

  try {
    const users = await listChauffeurUserOptions(service);
    return NextResponse.json({ users });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur" }, { status: 500 });
  }
}
