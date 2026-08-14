import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAnyApiPermission, requireApiPermission } from "@/lib/auth/require-permission-api";
import { userHasMagasin } from "@/lib/commandes-fournisseur/api-helpers";
import {
  isSupplierCommandeActive,
  SUPPLIER_COMMANDE_INACTIVE_MSG,
} from "@/lib/commandes-fournisseur/supplier-commande-active";
import { resolveDeliveryDateForCreate } from "@/lib/commandes-fournisseur/resolve-delivery-date";

/** Liste des commandes magasin (caissier : filtre magasinId obligatoire). */
export async function GET(req: Request) {
  const gate = await requireAnyApiPermission([
    "commandes_fournisseur.saisie",
    "commandes_fournisseur.consolidation",
  ]);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const url = new URL(req.url);
  const magasinId = url.searchParams.get("magasinId") ?? "";

  const supabase = await createSupabaseServerClient();

  if (gate.userId) {
    const { data: keysRaw } = await supabase.rpc("get_my_permission_keys");
    const keys = new Set((keysRaw as string[]) ?? []);
    const onlySaisie = keys.has("commandes_fournisseur.saisie") && !keys.has("commandes_fournisseur.consolidation");
    if (onlySaisie && !magasinId) {
      return NextResponse.json({ error: "magasinId requis" }, { status: 400 });
    }
    if (onlySaisie && magasinId) {
      const okMag = await userHasMagasin(supabase, gate.userId, magasinId);
      if (!okMag) {
        return NextResponse.json({ error: "Magasin non autorisé" }, { status: 403 });
      }
    }
  }

  let q = supabase
    .from("commande_fournisseur")
    .select(
      "id, magasin_id, supplier_id, status, commentaire, date_livraison, validated_at, created_at, updated_at, ref_supplier(id, code, label), commande_fournisseur_ligne(id)",
    )
    .order("created_at", { ascending: false });

  if (magasinId) {
    q = q.eq("magasin_id", magasinId);
  }

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const commandes = (data ?? []).map((r) => {
    const ll = (r as { commande_fournisseur_ligne?: { id: string }[] | null }).commande_fournisseur_ligne;
    const arr = Array.isArray(ll) ? ll : ll ? [ll] : [];
    const { commande_fournisseur_ligne: _drop, ...rest } = r as Record<string, unknown>;
    return { ...rest, lineCount: arr.length };
  });

  return NextResponse.json({ commandes });
}

export async function POST(req: Request) {
  const gate = await requireApiPermission("commandes_fournisseur.saisie");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  let body: { magasinId?: string; supplierId?: string; dateLivraison?: string | null };
  try {
    body = (await req.json()) as {
      magasinId?: string;
      supplierId?: string;
      dateLivraison?: string | null;
    };
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const magasinId = body.magasinId?.trim();
  const supplierId = body.supplierId?.trim();
  if (!magasinId || !supplierId) {
    return NextResponse.json({ error: "magasinId et supplierId requis" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const okMag = await userHasMagasin(supabase, gate.userId, magasinId);
  if (!okMag) {
    return NextResponse.json({ error: "Magasin non autorisé" }, { status: 403 });
  }

  const commandeOk = await isSupplierCommandeActive(supabase, supplierId);
  if (!commandeOk) {
    return NextResponse.json({ error: SUPPLIER_COMMANDE_INACTIVE_MSG }, { status: 403 });
  }

  const dateResolved = await resolveDeliveryDateForCreate(supabase, supplierId, body.dateLivraison);
  if ("error" in dateResolved) {
    return NextResponse.json({ error: dateResolved.error }, { status: 400 });
  }

  const { data: row, error } = await supabase
    .from("commande_fournisseur")
    .insert({
      magasin_id: magasinId,
      supplier_id: supplierId,
      status: "en_saisie",
      created_by: gate.userId,
      ...(dateResolved.date ? { date_livraison: dateResolved.date } : {}),
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ id: row.id });
}
