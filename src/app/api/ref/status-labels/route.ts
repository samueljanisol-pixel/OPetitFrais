import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireApiAdministrator } from "@/lib/auth/require-administrator-api";
import type { RefStatusLabelRow } from "@/lib/statusLabels/types";
export type { RefStatusLabelRow };

async function gateRead() {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return { ok: false as const, status: 401, error: "Non connecté" };
  }
  return { ok: true as const, supabase };
}

/** Liste des libellés de statuts (lecture : tout utilisateur authentifié). */
export async function GET(req: Request) {
  const g = await gateRead();
  if (!g.ok) {
    return NextResponse.json({ error: g.error }, { status: g.status });
  }
  const url = new URL(req.url);
  const domain = url.searchParams.get("domain")?.trim();

  let q = g.supabase
    .from("ref_status_label")
    .select("id,domain,status_code,label,sort_order")
    .order("domain", { ascending: true })
    .order("sort_order", { ascending: true });
  if (domain) {
    q = q.eq("domain", domain);
  }

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ labels: (data ?? []) as RefStatusLabelRow[] });
}

/** Met à jour des libellés (administrateur uniquement). */
export async function PATCH(req: Request) {
  const adm = await requireApiAdministrator();
  if (!adm.ok) {
    return NextResponse.json({ error: adm.error }, { status: adm.status });
  }

  let body: { updates?: Array<{ id: string; label: string }> };
  try {
    body = (await req.json()) as { updates?: Array<{ id: string; label: string }> };
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const updates = body.updates ?? [];
  if (!Array.isArray(updates) || updates.length === 0) {
    return NextResponse.json({ error: "updates requis (tableau { id, label })" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();

  for (const u of updates) {
    const id = typeof u.id === "string" ? u.id.trim() : "";
    const label = typeof u.label === "string" ? u.label.trim() : "";
    if (!id || !label) {
      return NextResponse.json({ error: "Chaque entrée doit avoir id et label non vides" }, { status: 400 });
    }
    const { error } = await supabase.from("ref_status_label").update({ label }).eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
