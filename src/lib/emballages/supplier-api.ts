import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { EMBALLAGES_CONSOMMABLES_SUPPLIER_CODE } from "@/lib/emballages/constants";

export async function loadEmballagesConsommablesSupplierId(
  service: ReturnType<typeof createSupabaseServiceRoleClient>,
): Promise<string | null> {
  const { data, error } = await service
    .from("ref_supplier")
    .select("id")
    .eq("code", EMBALLAGES_CONSOMMABLES_SUPPLIER_CODE)
    .maybeSingle();
  if (error || !data?.id) return null;
  return data.id as string;
}

export async function validateEmballagesVendeurId(
  service: ReturnType<typeof createSupabaseServiceRoleClient>,
  vendeurId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supplierId = await loadEmballagesConsommablesSupplierId(service);
  if (!supplierId) {
    return { ok: false, error: "Fournisseur Emballages et Consommables introuvable" };
  }

  const { data, error } = await service
    .from("ref_supplier_vendeur")
    .select("id, supplier_id")
    .eq("id", vendeurId)
    .maybeSingle();

  if (error) {
    return { ok: false, error: error.message };
  }
  if (!data) {
    return { ok: false, error: "Vendeur introuvable" };
  }
  if (data.supplier_id !== supplierId) {
    return { ok: false, error: "Vendeur non rattaché au fournisseur Emballages et Consommables" };
  }

  return { ok: true };
}

export async function loadEmballageCategorieIdByCode(
  service: ReturnType<typeof createSupabaseServiceRoleClient>,
  code: string,
): Promise<string | null> {
  const { data, error } = await service
    .from("ref_emballage_categorie")
    .select("id")
    .eq("code", code)
    .maybeSingle();
  if (error || !data?.id) return null;
  return data.id as string;
}

export async function validateEmballageIdForCategorie(
  service: ReturnType<typeof createSupabaseServiceRoleClient>,
  emballageId: string,
  categorieCode: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const categorieId = await loadEmballageCategorieIdByCode(service, categorieCode);
  if (!categorieId) {
    return { ok: false, error: "Catégorie introuvable" };
  }

  const { data, error } = await service
    .from("ref_emballage")
    .select("id, categorie_id")
    .eq("id", emballageId)
    .maybeSingle();

  if (error) {
    return { ok: false, error: error.message };
  }
  if (!data) {
    return { ok: false, error: "Article introuvable" };
  }
  if (data.categorie_id !== categorieId) {
    return { ok: false, error: `Article incompatible avec la catégorie ${categorieCode}` };
  }

  return { ok: true };
}
