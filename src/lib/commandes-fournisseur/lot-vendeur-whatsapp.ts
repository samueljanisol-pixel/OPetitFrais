import type { SupabaseClient } from "@supabase/supabase-js";
import { vendeurKeyForLigne } from "@/lib/commandes-fournisseur/validation-lot-vendeur-recap";

/** Efface la coche « WhatsApp envoyé » pour un vendeur du lot (no-op si absent). */
export async function clearVendeurWhatsAppSent(
  supabase: SupabaseClient,
  lotId: string,
  vendeurKey: string,
): Promise<string | null> {
  const key = vendeurKey.trim();
  if (!key) {
    return null;
  }

  const { data: existing, error: re } = await supabase
    .from("commande_fournisseur_lot_vendeur_comment")
    .select("whatsapp_sent_at")
    .eq("lot_id", lotId)
    .eq("vendeur_key", key)
    .maybeSingle();
  if (re) {
    return re.message;
  }
  if ((existing as { whatsapp_sent_at?: string | null } | null)?.whatsapp_sent_at == null) {
    return null;
  }

  const { error: ue } = await supabase
    .from("commande_fournisseur_lot_vendeur_comment")
    .update({ whatsapp_sent_at: null, updated_at: new Date().toISOString() })
    .eq("lot_id", lotId)
    .eq("vendeur_key", key);
  return ue ? ue.message : null;
}

export async function clearVendeurWhatsAppSentForVendeurIds(
  supabase: SupabaseClient,
  lotId: string,
  vendeurIds: Array<string | null | undefined>,
): Promise<string | null> {
  const keys = [
    ...new Set(
      vendeurIds.flatMap((vid) => {
        const key = vendeurKeyForLigne(vid ?? null);
        return key.length > 0 ? [key] : [];
      }),
    ),
  ];
  for (const key of keys) {
    const err = await clearVendeurWhatsAppSent(supabase, lotId, key);
    if (err) {
      return err;
    }
  }
  return null;
}

export async function clearVendeurWhatsAppSentForLotLigne(
  supabase: SupabaseClient,
  lotId: string,
  lotLigneId: string,
): Promise<string | null> {
  const { data: ligne, error: le } = await supabase
    .from("commande_fournisseur_lot_ligne")
    .select("vendeur_id")
    .eq("id", lotLigneId)
    .maybeSingle();
  if (le) {
    return le.message;
  }
  if (!ligne) {
    return null;
  }
  return clearVendeurWhatsAppSentForVendeurIds(supabase, lotId, [
    (ligne as { vendeur_id?: string | null }).vendeur_id,
  ]);
}
