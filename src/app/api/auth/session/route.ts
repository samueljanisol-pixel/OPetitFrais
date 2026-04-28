import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SessionPayload } from "@/lib/auth/session-types";
import { buildSessionDisplayLabel } from "@/lib/auth/display-label";
import { loadMagasinsForUser } from "@/lib/magasins/load-magasins-for-user";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) {
      return NextResponse.json({ session: null as SessionPayload | null });
    }

    const { data: keysRaw, error: rk } = await supabase.rpc("get_my_permission_keys");
    const permissions = rk || !Array.isArray(keysRaw) ? [] : (keysRaw as string[]);

    const { data: profile } = await supabase
      .from("profiles")
      .select("login, prenom, nom, role_id, roles(name, slug, is_full_access)")
      .eq("user_id", user.id)
      .maybeSingle();

    const role = profile?.roles as { name: string; slug: string; is_full_access: boolean } | null | undefined;

    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const metaStr = (k: string) => {
      const v = meta[k];
      if (v == null) return "";
      return String(v).trim();
    };
    const prenom = (profile?.prenom ?? "").trim() || metaStr("prenom");
    const nom = (profile?.nom ?? "").trim() || metaStr("nom");
    let login: string | null = profile?.login ?? null;
    if (login == null || login === "") {
      const ml = metaStr("login");
      login = ml || null;
    }

    const magasins: SessionPayload["magasins"] = await loadMagasinsForUser(
      supabase,
      user.id,
      role,
    );

    const displayLabel = buildSessionDisplayLabel(
      {
        userId: user.id,
        email: user.email ?? null,
        login,
        prenom,
        nom,
        roleName: role?.name ?? null,
      },
      meta,
    );

    const payload: SessionPayload = {
      userId: user.id,
      email: user.email ?? null,
      login,
      prenom,
      nom,
      roleId: profile?.role_id ?? null,
      roleName: role?.name ?? null,
      roleSlug: role?.slug ?? null,
      isFullAccess: role?.is_full_access ?? false,
      permissions,
      magasins,
      displayLabel,
    };

    return NextResponse.json({ session: payload });
  } catch {
    return NextResponse.json({ session: null as SessionPayload | null });
  }
}
