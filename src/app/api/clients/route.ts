import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/require-permission-api";
import { loadClientSummaries } from "@/lib/clients/compte-queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const gate = await requireApiPermission("clients.read");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const supabase = await createSupabaseServerClient();
  const result = await loadClientSummaries(supabase);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ clients: result.clients });
}

type PostBody = {
  name?: string;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
};

export async function POST(req: NextRequest) {
  const gate = await requireApiPermission("clients.write");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Nom requis" }, { status: 400 });
  }

  const phone =
    typeof body.phone === "string" && body.phone.trim().length > 0 ? body.phone.trim() : null;
  const email =
    typeof body.email === "string" && body.email.trim().length > 0 ? body.email.trim() : null;
  const notes =
    typeof body.notes === "string" && body.notes.trim().length > 0 ? body.notes.trim() : null;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("caisse_client")
    .insert({
      nom: name,
      telephone: phone,
      email,
      notes,
      sort_order: 100,
      actif: true,
      is_system: false,
    })
    .select("id, nom, telephone, email, notes, actif, is_system")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Création impossible" }, { status: 500 });
  }

  return NextResponse.json({
    client: {
      id: String(data.id),
      name: String(data.nom).trim(),
      phone: data.telephone?.trim() || null,
      email: data.email?.trim() || null,
      notes: data.notes?.trim() || null,
      active: Boolean(data.actif),
      is_system: Boolean(data.is_system),
    },
  });
}
