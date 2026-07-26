import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { requireAnyApiPermission, requireApiPermission } from "@/lib/auth/require-permission-api";
import { CHAUFFEUR_USER_ID_SETTING_KEY } from "@/lib/ref/chauffeur-setting";
import { loadChauffeurProfile } from "@/lib/ref/chauffeur-server";

export async function GET() {
  const gate = await requireAnyApiPermission([
    "commandes_fournisseur.consolidation",
    "parametres.read",
    "parametres.write",
  ]);
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
    const { chauffeur, userId } = await loadChauffeurProfile(service);
    return NextResponse.json({ userId, chauffeur });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const gate = await requireApiPermission("parametres.write");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  let body: { userId?: string | null };
  try {
    body = (await req.json()) as { userId?: string | null };
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  if (!("userId" in body)) {
    return NextResponse.json({ error: "userId requis" }, { status: 400 });
  }

  const raw = body.userId;
  const userId = raw === null || raw === undefined || String(raw).trim().length === 0 ? null : String(raw).trim();

  let service;
  try {
    service = createSupabaseServiceRoleClient();
  } catch {
    return NextResponse.json({ error: "Service role non configurée" }, { status: 500 });
  }

  if (userId) {
    const { data: profile, error: pe } = await service.from("profiles").select("user_id").eq("user_id", userId).maybeSingle();
    if (pe) {
      return NextResponse.json({ error: pe.message }, { status: 500 });
    }
    if (!profile) {
      return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 400 });
    }
  }

  if (userId) {
    const { error: ue } = await service.from("ref_app_setting").upsert(
      {
        key: CHAUFFEUR_USER_ID_SETTING_KEY,
        value: userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );
    if (ue) {
      return NextResponse.json({ error: ue.message }, { status: 500 });
    }
  } else {
    const { error: de } = await service.from("ref_app_setting").delete().eq("key", CHAUFFEUR_USER_ID_SETTING_KEY);
    if (de) {
      return NextResponse.json({ error: de.message }, { status: 500 });
    }
  }

  try {
    const { chauffeur } = await loadChauffeurProfile(service);
    return NextResponse.json({ ok: true, userId, chauffeur });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur" }, { status: 500 });
  }
}
