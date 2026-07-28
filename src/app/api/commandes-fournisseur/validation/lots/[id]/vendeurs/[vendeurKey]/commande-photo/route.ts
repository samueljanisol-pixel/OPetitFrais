import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireApiPermission } from "@/lib/auth/require-permission-api";
import {
  achatVendeurPhotoPublicUrl,
  upsertAchatVendeurCommandeWhatsAppPhoto,
} from "@/lib/commandes-fournisseur/achat-vendeur-photos";
import { SUPPLIER_SOLE_VENDEUR_KEY } from "@/lib/commandes-fournisseur/achat-vendeur-key";
import { SANS_VENDEUR_KEY } from "@/lib/commandes-fournisseur/validation-lot-vendeur-recap";
import { isLotPretOrAchatEnCours } from "@/lib/commandes-fournisseur/lot-status-achat";

type Ctx = { params: Promise<{ id: string; vendeurKey: string }> };

function decodeKey(raw: string): string {
  return decodeURIComponent(raw);
}

/** Clé validation → clé photos achat (Station : __sans_vendeur__ → __supplier_sole__). */
function toAchatVendeurKey(vendeurKey: string, hasVendeurs: boolean): string | null {
  if (vendeurKey === SANS_VENDEUR_KEY || vendeurKey === SUPPLIER_SOLE_VENDEUR_KEY) {
    return hasVendeurs ? null : SUPPLIER_SOLE_VENDEUR_KEY;
  }
  return vendeurKey.length > 0 ? vendeurKey : null;
}

/**
 * Enregistre l’image commande (PNG WhatsApp / récap) dans les photos achat du vendeur.
 * Permission consolidation ; lot doit être « prêt ».
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const { id: lotId, vendeurKey: rawKey } = await ctx.params;
  const vendeurKey = decodeKey(rawKey);
  const gate = await requireApiPermission("commandes_fournisseur.consolidation");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const supabase = await createSupabaseServerClient();
  const { data: lot, error: lotErr } = await supabase
    .from("commande_fournisseur_lot")
    .select("id, status, supplier_id")
    .eq("id", lotId)
    .maybeSingle();
  if (lotErr) return NextResponse.json({ error: lotErr.message }, { status: 500 });
  if (!lot) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  if (!isLotPretOrAchatEnCours((lot as { status: string }).status)) {
    return NextResponse.json({ error: "Lot non prêt" }, { status: 409 });
  }

  const supplierId = String((lot as { supplier_id: string }).supplier_id);
  const { count: vendeurCount, error: vcErr } = await supabase
    .from("ref_supplier_vendeur")
    .select("id", { count: "exact", head: true })
    .eq("supplier_id", supplierId);
  if (vcErr) return NextResponse.json({ error: vcErr.message }, { status: 500 });

  const achatKey = toAchatVendeurKey(vendeurKey, (vendeurCount ?? 0) > 0);
  if (!achatKey) {
    return NextResponse.json({ error: "vendeurKey non applicable pour l’achat" }, { status: 400 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Fichier requis" }, { status: 400 });
  }

  const up = await upsertAchatVendeurCommandeWhatsAppPhoto(supabase, {
    lotId,
    vendeurKey: achatKey,
    file,
    createdBy: gate.userId,
  });
  if (up.error || !up.path) {
    return NextResponse.json({ error: up.error ?? "Upload impossible" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    id: up.photoId,
    storage_path: up.path,
    vendeur_key: achatKey,
    url: achatVendeurPhotoPublicUrl(supabase, up.path),
  });
}
