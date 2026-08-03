import { NextRequest, NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/require-permission-api";
import { paniersMatchClient, roundMoney } from "@/lib/clients/compte-queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type PostBody = {
  clientId?: string;
  panierIds?: string[];
  paymentMethodId?: string;
  datePaiement?: string;
  commentaire?: string | null;
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

  const clientId = typeof body.clientId === "string" ? body.clientId.trim() : "";
  const panierIds = Array.isArray(body.panierIds)
    ? body.panierIds.filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];
  const paymentMethodId =
    typeof body.paymentMethodId === "string" ? body.paymentMethodId.trim() : "";
  const datePaiement = typeof body.datePaiement === "string" ? body.datePaiement.trim() : "";
  const commentaire =
    typeof body.commentaire === "string" && body.commentaire.trim().length > 0
      ? body.commentaire.trim()
      : null;

  if (!clientId || panierIds.length === 0 || !paymentMethodId || !datePaiement) {
    return NextResponse.json({ error: "Champs obligatoires manquants" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();

  const { data: client, error: ce } = await supabase
    .from("caisse_client")
    .select("id")
    .eq("id", clientId)
    .maybeSingle();

  if (ce) return NextResponse.json({ error: ce.message }, { status: 500 });
  if (!client) return NextResponse.json({ error: "Client introuvable" }, { status: 404 });

  const { data: paniers, error: pe } = await supabase
    .from("shop_cart")
    .select("id, client_id, montant_total, payment_status, status")
    .in("id", panierIds);

  if (pe) return NextResponse.json({ error: pe.message }, { status: 500 });
  if ((paniers ?? []).length !== panierIds.length) {
    return NextResponse.json({ error: "Un ou plusieurs paniers introuvables" }, { status: 404 });
  }

  const panierRows = (paniers ?? []).map((p) => ({
    client_id: (p as { client_id: string | null }).client_id,
    payment_status: String((p as { payment_status: string }).payment_status),
    status: String((p as { status: string }).status),
  }));

  if (!paniersMatchClient(panierRows, clientId)) {
    return NextResponse.json(
      { error: "Tous les paniers doivent appartenir au client et être impayés" },
      { status: 400 },
    );
  }

  for (const p of paniers ?? []) {
    if (String((p as { status: string }).status) !== "submitted") {
      return NextResponse.json({ error: "Panier non soumis" }, { status: 400 });
    }
  }

  const { data: alreadyPaid, error: ape } = await supabase
    .from("client_paiement_panier")
    .select("shop_cart_id")
    .in("shop_cart_id", panierIds);

  if (ape) return NextResponse.json({ error: ape.message }, { status: 500 });
  if ((alreadyPaid ?? []).length > 0) {
    return NextResponse.json({ error: "Un ou plusieurs paniers sont déjà payés" }, { status: 409 });
  }

  const { data: pm, error: pme } = await supabase
    .from("ref_payment_method")
    .select("id")
    .eq("id", paymentMethodId)
    .maybeSingle();

  if (pme) return NextResponse.json({ error: pme.message }, { status: 500 });
  if (!pm) return NextResponse.json({ error: "Mode de paiement introuvable" }, { status: 404 });

  let montant = 0;
  for (const p of paniers ?? []) {
    montant += Number((p as { montant_total: number | null }).montant_total ?? 0);
  }
  montant = roundMoney(montant);
  if (montant <= 0) {
    return NextResponse.json({ error: "Montant invalide" }, { status: 400 });
  }

  const { data: paiement, error: ie } = await supabase
    .from("client_paiement")
    .insert({
      client_id: clientId,
      payment_method_id: paymentMethodId,
      date_paiement: datePaiement,
      commentaire,
      montant,
      created_by: gate.userId ?? null,
    })
    .select("id")
    .single();

  if (ie || !paiement) {
    return NextResponse.json({ error: ie?.message ?? "Création paiement échouée" }, { status: 500 });
  }

  const paiementId = String((paiement as { id: string }).id);
  const links = panierIds.map((shop_cart_id) => ({ paiement_id: paiementId, shop_cart_id }));
  const { error: le } = await supabase.from("client_paiement_panier").insert(links);

  if (le) {
    await supabase.from("client_paiement").delete().eq("id", paiementId);
    return NextResponse.json({ error: le.message }, { status: 500 });
  }

  const { error: ue } = await supabase
    .from("shop_cart")
    .update({ payment_status: "paid" })
    .in("id", panierIds);

  if (ue) {
    await supabase.from("client_paiement_panier").delete().eq("paiement_id", paiementId);
    await supabase.from("client_paiement").delete().eq("id", paiementId);
    return NextResponse.json({ error: ue.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, paiementId, montant });
}
