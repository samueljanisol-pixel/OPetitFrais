import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAnyApiPermission } from "@/lib/auth/require-permission-api";
import { applyCommandeProductPackagingFilter } from "@/lib/commandes-fournisseur/applyCommandeProductPackagingFilter";

const MAX_Q = 100;
const MAX_RESULTS = 100;

const PERMS = ["commandes_fournisseur.saisie", "commandes_fournisseur.consolidation", "commandes_fournisseur.achat"];

const PACKAGING_FIELDS =
  "id, conditionnement_id, quantity, nom, available_for_sale, available_for_purchase, ref_conditionnement(label, code, supplier_id), ref_sales_unit(label, code), product_packaging_magasin(magasin_id, sellable, purchasable)";

function escapeIlikeFragment(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/**
 * Produits catalogue (fournisseur) avec recherche nom/code optionnelle et filtre catégorie.
 * Tri identique au parcours : catégorie puis nom.
 */
export async function GET(req: Request) {
  const gate = await requireAnyApiPermission(PERMS);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const url = new URL(req.url);
  const supplierId = url.searchParams.get("supplierId")?.trim() || "";
  /** Si false/absent tout en gardant supplierId : tous les fournisseurs ; si true (défaut) : limite au fournisseur fourni */
  const onlySupplierRaw = url.searchParams.get("onlySupplier");
  const onlySupplier = onlySupplierRaw === null ? true : !["false", "0"].includes((onlySupplierRaw ?? "").trim().toLowerCase());

  const rawQ = (url.searchParams.get("q") ?? "").trim().slice(0, MAX_Q);
  const categoryId = url.searchParams.get("categoryId")?.trim() || null;
  const magasinId = url.searchParams.get("magasinId")?.trim() || null;

  if (onlySupplier && supplierId.length === 0) {
    return NextResponse.json({ error: "supplierId requis lorsque le filtre fournisseur est actif" }, { status: 400 });
  }

  if (!onlySupplier) {
    if (rawQ.length < 2 && !categoryId) {
      return NextResponse.json({
        products: [],
        total: 0,
        hint: "Saisissez au moins 2 caractères ou une catégorie pour chercher hors fournisseur par défaut.",
      });
    }
  }

  const supabase = await createSupabaseServerClient();

  let qb = supabase
    .from("product")
    .select(
      `id, code, name, name_ar, category_id, supplier_id, allow_unit_in_commande, ref_supplier(code, label), ref_category(label, sort_order), ref_sales_unit(label, code), product_packaging(${PACKAGING_FIELDS})`,
    )
    .eq("active", true);

  if (supplierId.length > 0 && onlySupplier) {
    qb = qb.eq("supplier_id", supplierId);
  }

  if (categoryId) {
    qb = qb.eq("category_id", categoryId);
  }

  if (rawQ.length > 0) {
    const pat = escapeIlikeFragment(rawQ);
    qb = qb.or(`name.ilike.%${pat}%,code.ilike.%${pat}%`);
  }

  const { data: products, error } = await qb.limit(MAX_RESULTS).order("name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = products ?? [];
  type CatSort = { label: string; sort_order: number | null };
  const parseCat = (raw: unknown): CatSort | null => {
    const c = (Array.isArray(raw) ? raw[0] : raw) as CatSort | null | undefined;
    return c && typeof c === "object" && "label" in c ? c : null;
  };

  const sorted = [...rows].sort((a, b) => {
    const ca = parseCat(
      (a as { ref_category?: unknown }).ref_category,
    ) ?? { label: "", sort_order: 0 };
    const cb = parseCat(
      (b as { ref_category?: unknown }).ref_category,
    ) ?? { label: "", sort_order: 0 };
    const oa = ca.sort_order ?? 0;
    const ob = cb.sort_order ?? 0;
    if (oa !== ob) return oa - ob;
    const la = (ca.label || "").localeCompare(cb.label || "", "fr");
    if (la !== 0) return la;
    return (a as { name: string }).name.localeCompare((b as { name: string }).name, "fr");
  });

  const filtered = magasinId
    ? applyCommandeProductPackagingFilter(sorted as Parameters<typeof applyCommandeProductPackagingFilter>[0], magasinId)
    : sorted;

  return NextResponse.json({ products: filtered, total: filtered.length });
}
