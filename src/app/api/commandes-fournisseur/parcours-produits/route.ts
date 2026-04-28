import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireApiPermission } from "@/lib/auth/require-permission-api";

/**
 * Liste ordonnée des produits actifs d'un fournisseur (parcours caissier i/N).
 * Tri : catégorie (sort_order, label) puis nom produit.
 */
export async function GET(req: Request) {
  const gate = await requireApiPermission("commandes_fournisseur.saisie");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const url = new URL(req.url);
  const supplierId = url.searchParams.get("supplierId")?.trim();
  if (!supplierId) {
    return NextResponse.json({ error: "supplierId requis" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: products, error } = await supabase
    .from("product")
    .select(
      "id, code, name, category_id, supplier_id, ref_category(label, sort_order), ref_sales_unit(label, code), product_packaging(id, conditionnement_id, quantity, ref_conditionnement(label, code), ref_sales_unit(label, code))",
    )
    .eq("supplier_id", supplierId)
    .eq("active", true)
    .order("name", { ascending: true });

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

  return NextResponse.json({ products: sorted, total: sorted.length });
}
