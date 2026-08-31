import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isAppLocale, type AppLocale } from "@/i18n/config";

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

  const { data, error } = await supabase
    .from("ref_ui_translation")
    .select("message_key, value")
    .eq("locale", localeRaw);

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
