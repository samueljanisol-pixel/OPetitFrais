import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { requireApiPermission } from "@/lib/auth/require-permission-api";

export async function PATCH(req: Request, ctx: { params: Promise<{ userId: string }> }) {
  const gate = await requireApiPermission("admin.utilisateurs");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const { userId } = await ctx.params;
  let body: {
    prenom?: string;
    nom?: string;
    role_id?: string;
    login?: string | null;
    password?: string;
    magasin_ids?: string[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  if (body.magasin_ids !== undefined) {
    const mg = await requireApiPermission("admin.magasins");
    if (!mg.ok) {
      return NextResponse.json({ error: mg.error }, { status: mg.status });
    }
  }

  let service;
  try {
    service = createSupabaseServiceRoleClient();
  } catch {
    return NextResponse.json({ error: "Service role non configurée" }, { status: 500 });
  }

  const profilePatch: Record<string, unknown> = {};
  if (typeof body.prenom === "string") profilePatch.prenom = body.prenom.trim();
  if (typeof body.nom === "string") profilePatch.nom = body.nom.trim();
  if (typeof body.role_id === "string") profilePatch.role_id = body.role_id;
  if ("login" in body) {
    const v = body.login;
    profilePatch.login = v === null || v === "" ? null : String(v).trim();
  }

  if (Object.keys(profilePatch).length > 0) {
    const { error } = await service.from("profiles").update(profilePatch).eq("user_id", userId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
  }

  const pwd = typeof body.password === "string" ? body.password : "";
  if (pwd.length > 0 && pwd.length < 6) {
    return NextResponse.json({ error: "Mot de passe : minimum 6 caractères" }, { status: 400 });
  }

  const syncAuthMeta =
    typeof body.prenom === "string" || typeof body.nom === "string" || "login" in body || pwd.length > 0;

  if (syncAuthMeta) {
    const { data: existing, error: ge } = await service.auth.admin.getUserById(userId);
    if (ge || !existing.user) {
      return NextResponse.json({ error: ge?.message ?? "Utilisateur Auth introuvable" }, { status: 400 });
    }

    const authPayload: { password?: string; user_metadata?: Record<string, unknown> } = {};
    if (pwd.length > 0) authPayload.password = pwd;

    if (typeof body.prenom === "string" || typeof body.nom === "string" || "login" in body) {
      const meta = { ...(existing.user.user_metadata as Record<string, unknown> | undefined) };
      if (typeof body.prenom === "string") meta.prenom = body.prenom.trim();
      if (typeof body.nom === "string") meta.nom = body.nom.trim();
      if ("login" in body) {
        const lv = body.login;
        meta.login = lv === null || lv === "" ? null : String(lv).trim();
      }
      authPayload.user_metadata = meta;
    }

    if (authPayload.password !== undefined || authPayload.user_metadata !== undefined) {
      const { error: ue } = await service.auth.admin.updateUserById(userId, authPayload);
      if (ue) {
        return NextResponse.json({ error: ue.message }, { status: 400 });
      }
    }
  }

  if (body.magasin_ids !== undefined) {
    const ids = body.magasin_ids;
    if (ids.length > 0) {
      const { data: magOk } = await service.from("magasins").select("id").in("id", ids);
      if (!magOk || magOk.length !== ids.length) {
        return NextResponse.json({ error: "Un ou plusieurs magasins sont invalides" }, { status: 400 });
      }
    }
    const { error: delE } = await service.from("profile_magasins").delete().eq("user_id", userId);
    if (delE) {
      return NextResponse.json({ error: delE.message }, { status: 400 });
    }
    if (ids.length > 0) {
      const { error: insE } = await service
        .from("profile_magasins")
        .insert(ids.map((mid) => ({ user_id: userId, magasin_id: mid })));
      if (insE) {
        return NextResponse.json({ error: insE.message }, { status: 400 });
      }
    }
  }

  const { data: profile, error: pe } = await service.from("profiles").select().eq("user_id", userId).single();
  if (pe) {
    return NextResponse.json({ error: pe.message }, { status: 400 });
  }

  return NextResponse.json({ profile });
}
