import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAppLocale, type AppLocale } from "@/i18n/config";

function serviceClientOrNull() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  }

  const url = new URL(req.url);
  const localeRaw = url.searchParams.get("locale");
  if (!isAppLocale(localeRaw)) {
    return NextResponse.json({ error: "locale invalide" }, { status: 400 });
  }

  // Lecture via service role si le JWT utilisateur est rejeté par PostgREST (PGRST303).
  let data: { message_key: string; value: string }[] | null = null;
  let error: { message: string } | null = null;

  const userQuery = await supabase
    .from("ref_ui_translation")
    .select("message_key, value")
    .eq("locale", localeRaw);

  if (userQuery.error) {
    const service = serviceClientOrNull();
    if (service) {
      const serviceQuery = await service
        .from("ref_ui_translation")
        .select("message_key, value")
        .eq("locale", localeRaw);
      data = serviceQuery.data;
      error = serviceQuery.error;
    } else {
      error = userQuery.error;
    }
  } else {
    data = userQuery.data;
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const overrides: Record<string, string> = {};
  for (const row of data ?? []) {
    if (typeof row.message_key === "string" && typeof row.value === "string") {
      overrides[row.message_key] = row.value;
    }
  }

  return NextResponse.json({ locale: localeRaw as AppLocale, overrides });
}
