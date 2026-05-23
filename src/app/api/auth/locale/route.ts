import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAppLocale, type AppLocale } from "@/i18n/config";
import { localeCookieOptions } from "@/lib/i18n/locale-cookie";

export async function PATCH(req: Request) {
  let body: { locale?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  const locale = body.locale;
  if (!isAppLocale(locale)) {
    return NextResponse.json({ error: "Locale invalide" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { error } = await supabase.from("profiles").update({ ui_locale: locale }).eq("user_id", user.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const cookieStore = await cookies();
  const opts = localeCookieOptions(locale as AppLocale);
  cookieStore.set(opts.name, opts.value, {
    path: opts.path,
    maxAge: opts.maxAge,
    sameSite: opts.sameSite,
  });

  return NextResponse.json({ ok: true, locale });
}
