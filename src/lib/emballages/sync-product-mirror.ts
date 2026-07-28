import type { SupabaseClient } from "@supabase/supabase-js";
import { loadEmballagesConsommablesSupplierId } from "@/lib/emballages/supplier-api";

const PRODUCT_CATEGORY_CODE = "emballages_consommables";
const SALES_UNIT_CODE = "unite";

type MirrorCatalogConfig = {
  supplierId: string;
  categoryId: string;
  salesUnitId: string;
  subcategoryByEmballageCategorieLabel: Map<string, string>;
};

type EmballageForMirror = {
  id: string;
  label: string;
  reference: string | null;
  active: boolean;
  product_id: string | null;
  ref_emballage_categorie?: { label?: string } | { label?: string }[] | null;
};

let cachedConfig: MirrorCatalogConfig | null = null;

function normalizeRelationLabel(
  raw: EmballageForMirror["ref_emballage_categorie"],
): string | null {
  if (raw == null) return null;
  const row = Array.isArray(raw) ? raw[0] : raw;
  const label = row?.label;
  return typeof label === "string" && label.trim() ? label.trim() : null;
}

async function loadMirrorCatalogConfig(
  service: SupabaseClient,
): Promise<{ config: MirrorCatalogConfig | null; error?: string }> {
  if (cachedConfig) {
    return { config: cachedConfig };
  }

  const supplierId = await loadEmballagesConsommablesSupplierId(service);
  if (!supplierId) {
    return { config: null, error: "Fournisseur Emballages et Consommables introuvable" };
  }

  const { data: category, error: catErr } = await service
    .from("ref_category")
    .select("id")
    .eq("code", PRODUCT_CATEGORY_CODE)
    .maybeSingle();
  if (catErr) {
    return { config: null, error: catErr.message };
  }
  if (!category?.id) {
    return { config: null, error: "Catégorie produit Emballages et consommables introuvable" };
  }

  const { data: salesUnit, error: unitErr } = await service
    .from("ref_sales_unit")
    .select("id")
    .eq("code", SALES_UNIT_CODE)
    .maybeSingle();
  if (unitErr) {
    return { config: null, error: unitErr.message };
  }
  if (!salesUnit?.id) {
    return { config: null, error: "Unité de vente « Unité » introuvable" };
  }

  const { data: subcategories, error: subErr } = await service
    .from("ref_subcategory")
    .select("id, label")
    .eq("category_id", category.id);
  if (subErr) {
    return { config: null, error: subErr.message };
  }

  const subcategoryByEmballageCategorieLabel = new Map<string, string>();
  for (const row of subcategories ?? []) {
    const label = (row as { label?: string }).label;
    const id = (row as { id?: string }).id;
    if (typeof label === "string" && typeof id === "string") {
      subcategoryByEmballageCategorieLabel.set(label, id);
    }
  }

  cachedConfig = {
    supplierId,
    categoryId: category.id as string,
    salesUnitId: salesUnit.id as string,
    subcategoryByEmballageCategorieLabel,
  };
  return { config: cachedConfig };
}

function resolveProductCode(reference: string | null): string | null {
  if (reference == null || reference.trim() === "") return null;
  const code = reference.trim();
  if (code.length > 32) return null;
  return code;
}

async function ensureProductSupplierLink(
  service: SupabaseClient,
  productId: string,
  supplierId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: existing, error: selErr } = await service
    .from("product_supplier")
    .select("product_id")
    .eq("product_id", productId)
    .eq("supplier_id", supplierId)
    .maybeSingle();
  if (selErr) {
    return { ok: false, error: selErr.message };
  }
  if (existing) return { ok: true };

  const { error: insErr } = await service
    .from("product_supplier")
    .insert({ product_id: productId, supplier_id: supplierId });
  if (insErr) {
    return { ok: false, error: insErr.message };
  }
  return { ok: true };
}

async function deleteOrphanMirrorProduct(
  service: SupabaseClient,
  productId: string,
): Promise<void> {
  await service.from("product_supplier").delete().eq("product_id", productId);
  await service.from("product").delete().eq("id", productId);
}

async function isProductCodeTaken(
  service: SupabaseClient,
  code: string,
): Promise<boolean> {
  const { count, error } = await service
    .from("product")
    .select("id", { count: "exact", head: true })
    .ilike("code", code);
  if (error) {
    throw new Error(error.message);
  }
  return (count ?? 0) > 0;
}

export async function upsertProductMirrorFromEmballage(
  service: SupabaseClient,
  emballageId: string,
): Promise<{ productId: string | null; error?: string }> {
  const { data: emballageRaw, error: loadErr } = await service
    .from("ref_emballage")
    .select("id, label, reference, active, product_id, ref_emballage_categorie(label)")
    .eq("id", emballageId)
    .maybeSingle();

  if (loadErr) {
    return { productId: null, error: loadErr.message };
  }
  if (!emballageRaw) {
    return { productId: null, error: "Article introuvable" };
  }

  const emballage = emballageRaw as EmballageForMirror;
  const { config, error: cfgErr } = await loadMirrorCatalogConfig(service);
  if (!config) {
    return { productId: null, error: cfgErr ?? "Configuration miroir indisponible" };
  }

  const categorieLabel = normalizeRelationLabel(emballage.ref_emballage_categorie);
  const subcategoryId =
    categorieLabel != null
      ? (config.subcategoryByEmballageCategorieLabel.get(categorieLabel) ?? null)
      : null;

  const productPatch = {
    name: emballage.label,
    active: emballage.active,
    category_id: config.categoryId,
    subcategory_id: subcategoryId,
    supplier_id: config.supplierId,
    visible_vitrine: false,
    allow_unit_in_commande: true,
  };

  if (emballage.product_id) {
    const { error: updErr } = await service
      .from("product")
      .update(productPatch)
      .eq("id", emballage.product_id);
    if (updErr) {
      return { productId: null, error: updErr.message };
    }
    const link = await ensureProductSupplierLink(service, emballage.product_id, config.supplierId);
    if (!link.ok) {
      return { productId: null, error: link.error };
    }
    return { productId: emballage.product_id };
  }

  const desiredCode = resolveProductCode(emballage.reference);
  let insertCode: string | null = desiredCode;
  if (desiredCode) {
    try {
      if (await isProductCodeTaken(service, desiredCode)) {
        insertCode = null;
      }
    } catch (e) {
      return {
        productId: null,
        error: e instanceof Error ? e.message : "Vérification code produit impossible",
      };
    }
  }

  const { data: created, error: insErr } = await service
    .from("product")
    .insert({
      code: insertCode,
      name: emballage.label,
      price: 0,
      sales_unit_id: config.salesUnitId,
      category_id: config.categoryId,
      subcategory_id: subcategoryId,
      supplier_id: config.supplierId,
      active: emballage.active,
      visible_vitrine: false,
      allow_unit_in_commande: true,
    })
    .select("id")
    .single();

  if (insErr || !created?.id) {
    return { productId: null, error: insErr?.message ?? "Création produit miroir impossible" };
  }

  const productId = created.id as string;

  const link = await ensureProductSupplierLink(service, productId, config.supplierId);
  if (!link.ok) {
    await deleteOrphanMirrorProduct(service, productId);
    return { productId: null, error: link.error };
  }

  const { error: linkErr } = await service
    .from("ref_emballage")
    .update({ product_id: productId })
    .eq("id", emballageId);
  if (linkErr) {
    await deleteOrphanMirrorProduct(service, productId);
    return { productId: null, error: linkErr.message };
  }

  return { productId };
}

export async function deactivateProductMirrorById(
  service: SupabaseClient,
  productId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error: updErr } = await service
    .from("product")
    .update({ active: false })
    .eq("id", productId);
  if (updErr) {
    return { ok: false, error: updErr.message };
  }
  return { ok: true };
}

export async function deactivateProductMirrorFromEmballage(
  service: SupabaseClient,
  emballageId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error: loadErr } = await service
    .from("ref_emballage")
    .select("product_id")
    .eq("id", emballageId)
    .maybeSingle();

  if (loadErr) {
    return { ok: false, error: loadErr.message };
  }

  const productId = (data as { product_id?: string | null } | null)?.product_id;
  if (!productId) {
    return { ok: true };
  }
  return deactivateProductMirrorById(service, productId);
}

export function resetMirrorCatalogConfigCache(): void {
  cachedConfig = null;
}
