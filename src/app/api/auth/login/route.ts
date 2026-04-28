import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { authErrorMessageFr } from "@/lib/auth/auth-error-fr";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

function looksLikeEmail(s: string): boolean {
  return s.includes("@");
}

export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.json({ error: "Supabase non configuré" }, { status: 500 });
  }

  let body: { identifier?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const identifier = (body.identifier ?? "").trim();
  const password = body.password ?? "";
  if (!identifier || !password) {
    return NextResponse.json({ error: "Identifiant et mot de passe requis" }, { status: 400 });
  }

  const cookieStore = await cookies();

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          /* ignore */
        }
      },
    },
  });

  let email = identifier;

  if (!looksLikeEmail(identifier)) {
    let service;
    try {
      service = createSupabaseServiceRoleClient();
    } catch {
      return NextResponse.json(
        { error: "Connexion par login indisponible (clé service requise côté serveur)" },
        { status: 503 },
      );
    }
    const { data: profile, error: pe } = await service
      .from("profiles")
      .select("user_id")
      .ilike("login", identifier)
      .maybeSingle();
    if (pe || !profile?.user_id) {
      return NextResponse.json({ error: "Identifiant ou mot de passe incorrect" }, { status: 401 });
    }
    const { data: userData, error: ue } = await service.auth.admin.getUserById(profile.user_id);
    if (ue || !userData.user?.email) {
      return NextResponse.json({ error: "Identifiant ou mot de passe incorrect" }, { status: 401 });
    }
    email = userData.user.email;
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return NextResponse.json({ error: authErrorMessageFr(error.message) }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
