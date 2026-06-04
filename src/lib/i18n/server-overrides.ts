import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AppLocale } from "@/i18n/config";
import { isAppLocale } from "@/i18n/config";

export async function loadServerOverrides(locale: AppLocale): Promise<Record<string, string>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("ref_ui_translation")
    .select("message_key, value")
    .eq("locale", locale);

  if (error || !data) return {};

  const out: Record<string, string> = {};
  for (const row of data) {
    const key = row.message_key;
    const value = row.value;
    if (typeof key === "string" && typeof value === "string") {
      out[key] = value;
    }
  }
  return out;
}

export async function loadAllOverridesForLocales(): Promise<{
  fr: Record<string, string>;
  arMa: Record<string, string>;
}> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("ref_ui_translation").select("message_key, locale, value");

  const fr: Record<string, string> = {};
  const arMa: Record<string, string> = {};

  if (error || !data) {
    return { fr, arMa };
  }

  for (const row of data) {
    const key = row.message_key;
    const loc = row.locale;
    const value = row.value;
    if (typeof key !== "string" || typeof value !== "string" || !isAppLocale(loc)) continue;
    if (loc === "fr") fr[key] = value;
    else arMa[key] = value;
  }

  return { fr, arMa };
}
