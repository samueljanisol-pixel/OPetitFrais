import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SessionPayload } from "@/lib/auth/session-types";
import { buildSessionDisplayLabel } from "@/lib/auth/display-label";
import { loadUserAccessByUserId } from "@/lib/auth/load-user-access";
import { loadMagasinsForUser } from "@/lib/magasins/load-magasins-for-user";
import { normalizeLocale } from "@/i18n/config";

function serviceClientOrNull() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) {
      return NextResponse.json({ session: null as SessionPayload | null });
    }

    const access = await loadUserAccessByUserId(user.id);
    if (!access) {
      return NextResponse.json({ session: null as SessionPayload | null });
    }

    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const metaStr = (k: string) => {
      const v = meta[k];
      if (v == null) return "";
      return String(v).trim();
    };
    const prenom = access.prenom || metaStr("prenom");
    const nom = access.nom || metaStr("nom");
    let login: string | null = access.login;
    if (login == null || login === "") {
      const ml = metaStr("login");
      login = ml || null;
    }

    let magasinsLoad = await loadMagasinsForUser(supabase, user.id, {
      slug: access.role?.slug ?? null,
      is_full_access: access.isFullAccess,
    });
    if (magasinsLoad.magasins.length === 0 && access.isFullAccess) {
      const service = serviceClientOrNull();
      if (service) {
        magasinsLoad = await loadMagasinsForUser(service, user.id, {
          slug: access.role?.slug ?? null,
          is_full_access: true,
        });
      }
    }

    const displayLabel = buildSessionDisplayLabel(
      {
        userId: user.id,
        email: user.email ?? null,
        login,
        prenom,
        nom,
        roleName: access.role?.name ?? null,
      },
      meta,
    );

    const payload: SessionPayload = {
      userId: user.id,
      email: user.email ?? null,
      login,
      prenom,
      nom,
      roleId: access.role_id,
      roleName: access.role?.name ?? null,
      roleSlug: access.role?.slug ?? null,
      isFullAccess: access.isFullAccess,
      permissions: access.permissions,
      magasins: magasinsLoad.magasins,
      magasinsRestricted: magasinsLoad.restricted,
      displayLabel,
      uiLocale: normalizeLocale(access.ui_locale),
    };

    return NextResponse.json({ session: payload });
  } catch {
    return NextResponse.json({ session: null as SessionPayload | null });
  }
}
