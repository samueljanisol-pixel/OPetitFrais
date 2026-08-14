import type { SupabaseClient } from "@supabase/supabase-js";
import {
  defaultDeliveryDateIso,
  parseIsoDateString,
  supplierUsesDeliveryDate,
} from "@/lib/commandes-fournisseur/delivery-date";

type SupplierRow = { id: string; code: string | null };

/** Charge code fournisseur + nombre de vendeurs pour la règle date de livraison. */
export async function loadSupplierDeliveryDateContext(
  supabase: SupabaseClient,
  supplierId: string,
): Promise<{ supplier: SupplierRow; vendeurCount: number } | null> {
  const { data: supplier, error } = await supabase
    .from("ref_supplier")
    .select("id, code")
    .eq("id", supplierId)
    .maybeSingle();
  if (error || !supplier) {
    return null;
  }
  const { count, error: ve } = await supabase
    .from("ref_supplier_vendeur")
    .select("id", { count: "exact", head: true })
    .eq("supplier_id", supplierId);
  if (ve) {
    return null;
  }
  return {
    supplier: supplier as SupplierRow,
    vendeurCount: count ?? 0,
  };
}

export async function supplierRequiresDeliveryDate(
  supabase: SupabaseClient,
  supplierId: string,
): Promise<boolean> {
  const ctx = await loadSupplierDeliveryDateContext(supabase, supplierId);
  if (!ctx) {
    return false;
  }
  return supplierUsesDeliveryDate(ctx.supplier.code, ctx.vendeurCount);
}

/** Résout la date de livraison à persister à la création (demain par défaut si requis). */
export async function resolveDeliveryDateForCreate(
  supabase: SupabaseClient,
  supplierId: string,
  rawDate: unknown,
): Promise<{ date: string | null } | { error: string }> {
  const requires = await supplierRequiresDeliveryDate(supabase, supplierId);
  if (!requires) {
    return { date: null };
  }
  const parsed = rawDate != null ? parseIsoDateString(rawDate) : null;
  if (parsed) {
    return { date: parsed };
  }
  if (rawDate != null && rawDate !== "") {
    return { error: "dateLivraison invalide (attendu AAAA-MM-JJ)" };
  }
  return { date: defaultDeliveryDateIso() };
}
