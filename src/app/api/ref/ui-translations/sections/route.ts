import { NextResponse } from "next/server";
import { TRANSLATION_SECTIONS } from "@/lib/i18n/message-catalog";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  }

  return NextResponse.json({ sections: TRANSLATION_SECTIONS });
}
