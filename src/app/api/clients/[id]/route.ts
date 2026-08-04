import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/require-permission-api";
import {
  loadPaiementsForClient,
  loadPaniersForClient,
  summarizePaniers,
} from "@/lib/clients/compte-queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const gate = await requireApiPermission("clients.read");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const { id } = await params;
  const clientId = id.trim();
  if (!clientId) {
    return NextResponse.json({ error: "Id requis" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();

  const { data: client, error: ce } = await supabase
    .from("caisse_client")
    .select("id, nom, telephone, email, notes, actif, is_system")
    .eq("id", clientId)
    .maybeSingle();

  if (ce) return NextResponse.json({ error: ce.message }, { status: 500 });
  if (!client) return NextResponse.json({ error: "Client introuvable" }, { status: 404 });

  const [paniersResult, paiementsResult] = await Promise.all([
    loadPaniersForClient(supabase, clientId),
    loadPaiementsForClient(supabase, clientId),
  ]);

  if ("error" in paniersResult) {
    return NextResponse.json({ error: paniersResult.error }, { status: 500 });
  }
  if ("error" in paiementsResult) {
    return NextResponse.json({ error: paiementsResult.error }, { status: 500 });
  }

  const paniers = paniersResult.paniers.map((p) => ({
    id: p.id,
    cart_number: p.cart_number,
    label: `Panier #${p.cart_number}`,
    montant_total: p.montant_total,
    pos_total: p.pos_total,
    submitted_at: p.submitted_at,
    fulfillment_mode: p.fulfillment_mode,
    payment_method: p.payment_method,
    paye: p.paye,
    magasin_code: p.magasin_code,
    magasin_nom: p.magasin_nom,
    caisse_code: p.caisse_code,
    ticket_ref: p.ticket_ref,
  }));

  const totals = summarizePaniers(paniersResult.paniers);

  return NextResponse.json({
    client: {
      id: String(client.id),
      name: String(client.nom).trim(),
      phone: client.telephone?.trim() || null,
      email: client.email?.trim() || null,
      notes: client.notes?.trim() || null,
      active: Boolean(client.actif),
      is_system: Boolean(client.is_system),
    },
    paniers,
    paiements: paiementsResult.paiements,
    totals,
  });
}

type PatchBody = {
  name?: string;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  active?: boolean;
};

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const gate = await requireApiPermission("clients.write");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const { id } = await params;
  const clientId = id.trim();
  if (!clientId) {
    return NextResponse.json({ error: "Id requis" }, { status: 400 });
  }

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();

  const { data: existing, error: fe } = await supabase
    .from("caisse_client")
    .select("id, is_system")
    .eq("id", clientId)
    .maybeSingle();

  if (fe) return NextResponse.json({ error: fe.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "Client introuvable" }, { status: 404 });

  const patch: Record<string, unknown> = {};

  if ("name" in body) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return NextResponse.json({ error: "Nom requis" }, { status: 400 });
    if (!existing.is_system) patch.nom = name;
  }
  if ("phone" in body) {
    patch.telephone =
      typeof body.phone === "string" && body.phone.trim().length > 0 ? body.phone.trim() : null;
  }
  if ("email" in body) {
    patch.email =
      typeof body.email === "string" && body.email.trim().length > 0 ? body.email.trim() : null;
  }
  if ("notes" in body) {
    patch.notes =
      typeof body.notes === "string" && body.notes.trim().length > 0 ? body.notes.trim() : null;
  }
  if ("active" in body) {
    if (existing.is_system && body.active === false) {
      return NextResponse.json({ error: "Client système non désactivable" }, { status: 409 });
    }
    patch.actif = body.active;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Aucun champ à mettre à jour" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("caisse_client")
    .update(patch)
    .eq("id", clientId)
    .select("id, nom, telephone, email, notes, actif, is_system")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Client introuvable" }, { status: 404 });

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
