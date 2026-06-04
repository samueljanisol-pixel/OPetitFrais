import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAnyApiPermission } from "@/lib/auth/require-permission-api";
import { isAppLocale, type AppLocale } from "@/i18n/config";
import { flattenMessageTree, getBaseMessages } from "@/lib/i18n/message-catalog";

type UpsertItem = { message_key: string; locale: AppLocale; value: string };
type DeleteItem = { message_key: string; locale: AppLocale };

function defaultForKey(locale: AppLocale, messageKey: string): string {
  const flat = flattenMessageTree(getBaseMessages(locale));
  return flat[messageKey] ?? "";
}

export async function PATCH(req: Request) {
  const gate = await requireAnyApiPermission(["parametres.write"]);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  let body: { upserts?: UpsertItem[]; deletes?: DeleteItem[] };
  try {
    body = (await req.json()) as { upserts?: UpsertItem[]; deletes?: DeleteItem[] };
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();

  for (const d of body.deletes ?? []) {
    const message_key = typeof d.message_key === "string" ? d.message_key.trim() : "";
    const locale = d.locale;
    if (!message_key || !isAppLocale(locale)) {
      return NextResponse.json({ error: "delete : message_key et locale requis" }, { status: 400 });
    }
    const { error } = await supabase
      .from("ref_ui_translation")
      .delete()
      .eq("message_key", message_key)
      .eq("locale", locale);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  for (const u of body.upserts ?? []) {
    const message_key = typeof u.message_key === "string" ? u.message_key.trim() : "";
    const locale = u.locale;
    const value = typeof u.value === "string" ? u.value : "";
    if (!message_key || !isAppLocale(locale)) {
      return NextResponse.json({ error: "upsert : message_key et locale requis" }, { status: 400 });
    }

    const trimmed = value.trim();
    const defaultValue = defaultForKey(locale, message_key);

    if (trimmed === defaultValue) {
      const { error } = await supabase
        .from("ref_ui_translation")
        .delete()
        .eq("message_key", message_key)
        .eq("locale", locale);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      continue;
    }

    const { error } = await supabase.from("ref_ui_translation").upsert(
      { message_key, locale, value: trimmed },
      { onConflict: "message_key,locale" },
    );
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
