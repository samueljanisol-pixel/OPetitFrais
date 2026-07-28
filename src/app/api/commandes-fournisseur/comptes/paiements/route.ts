import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireApiPermission } from "@/lib/auth/require-permission-api";
import { achatsMatchAccount, type CompteAccountType } from "@/lib/commandes-fournisseur/compte-queries";

type PostBody = {
  accountType?: CompteAccountType;
  accountId?: string;
  achatIds?: string[];
  paymentMethodId?: string;
  datePaiement?: string;
  commentaire?: string | null;
};

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function POST(req: NextRequest) {
  const gate = await requireApiPermission("commandes_fournisseur.comptes");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const accountType = body.accountType;
  const accountId = typeof body.accountId === "string" ? body.accountId.trim() : "";
  const achatIds = Array.isArray(body.achatIds)
    ? body.achatIds.filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];
  const paymentMethodId =
    typeof body.paymentMethodId === "string" ? body.paymentMethodId.trim() : "";
  const datePaiement = typeof body.datePaiement === "string" ? body.datePaiement.trim() : "";
  const commentaire =
    typeof body.commentaire === "string" && body.commentaire.trim().length > 0
      ? body.commentaire.trim()
      : null;

  if (
    (accountType !== "vendeur" && accountType !== "station") ||
    !accountId ||
    achatIds.length === 0 ||
    !paymentMethodId ||
    !datePaiement
  ) {
    return NextResponse.json({ error: "Champs obligatoires manquants" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();

  const { data: achats, error: ae } = await supabase
    .from("fournisseur_compte_achat")
    .select("id, supplier_id, vendeur_id, kind, montant_total")
    .in("id", achatIds);

  if (ae) {
    return NextResponse.json({ error: ae.message }, { status: 500 });
  }
  if ((achats ?? []).length !== achatIds.length) {
    return NextResponse.json({ error: "Un ou plusieurs achats introuvables" }, { status: 404 });
  }

  const account =
    accountType === "vendeur"
      ? { type: "vendeur" as const, vendeurId: accountId }
      : { type: "station" as const, supplierId: accountId };

  const achatRows = (achats ?? []).map((a) => ({
    kind: String((a as { kind: string }).kind),
    supplier_id: String((a as { supplier_id: string }).supplier_id),
    vendeur_id: (a as { vendeur_id?: string | null }).vendeur_id ?? null,
  }));

  if (!achatsMatchAccount(achatRows, account)) {
    return NextResponse.json(
      { error: "Tous les achats doivent appartenir au même compte" },
      { status: 400 },
    );
  }

  const { data: alreadyPaid, error: pe } = await supabase
    .from("fournisseur_paiement_achat")
    .select("achat_id")
    .in("achat_id", achatIds);

  if (pe) {
    return NextResponse.json({ error: pe.message }, { status: 500 });
  }
  if ((alreadyPaid ?? []).length > 0) {
    return NextResponse.json({ error: "Un ou plusieurs achats sont déjà payés" }, { status: 409 });
  }

  const { data: pm, error: pme } = await supabase
    .from("ref_payment_method")
    .select("id")
    .eq("id", paymentMethodId)
    .maybeSingle();

  if (pme) {
    return NextResponse.json({ error: pme.message }, { status: 500 });
  }
  if (!pm) {
    return NextResponse.json({ error: "Mode de paiement introuvable" }, { status: 404 });
  }

  let supplierId = "";
  let vendeurId: string | null = null;

  if (account.type === "vendeur") {
    const { data: vendeur, error: ve } = await supabase
      .from("ref_supplier_vendeur")
      .select("id, supplier_id")
      .eq("id", account.vendeurId)
      .maybeSingle();
    if (ve || !vendeur) {
      return NextResponse.json({ error: ve?.message ?? "Vendeur introuvable" }, { status: 404 });
    }
    supplierId = String((vendeur as { supplier_id: string }).supplier_id);
    vendeurId = account.vendeurId;
  } else {
    supplierId = account.supplierId;
  }

  let montant = 0;
  for (const a of achats ?? []) {
    montant += Number((a as { montant_total: number }).montant_total);
  }
  montant = roundMoney(montant);
  if (montant <= 0) {
    return NextResponse.json({ error: "Montant invalide" }, { status: 400 });
  }

  const { data: paiement, error: ie } = await supabase
    .from("fournisseur_paiement")
    .insert({
      supplier_id: supplierId,
      vendeur_id: vendeurId,
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
  const links = achatIds.map((achat_id) => ({ paiement_id: paiementId, achat_id }));
  const { error: le } = await supabase.from("fournisseur_paiement_achat").insert(links);

  if (le) {
    await supabase.from("fournisseur_paiement").delete().eq("id", paiementId);
    return NextResponse.json({ error: le.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, paiementId, montant });
}
