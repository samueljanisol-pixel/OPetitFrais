import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  TRANSLATION_SECTIONS,
  buildSectionRows,
  listKeysForSection,
} from "@/lib/i18n/message-catalog";
import { loadAllOverridesForLocales } from "@/lib/i18n/server-overrides";

export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  }

  const url = new URL(req.url);
  const sectionId = url.searchParams.get("sectionId")?.trim() ?? "";
  const section = TRANSLATION_SECTIONS.find((s) => s.id === sectionId);
  if (!section) {
    return NextResponse.json({ error: "section inconnue" }, { status: 400 });
  }

  const keys = listKeysForSection(section.prefix);
  if (keys.length === 0) {
    return NextResponse.json({ section, rows: [] });
  }

  const { fr, arMa } = await loadAllOverridesForLocales();
  const rows = buildSectionRows(section.prefix, fr, arMa);

  return NextResponse.json({ section, rows });
}
