import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireApiPermission } from "@/lib/auth/require-permission-api";
import { applyCommandeProductPackagingFilter } from "@/lib/commandes-fournisseur/applyCommandeProductPackagingFilter";
import { COMMANDE_PACKAGING_SELECT } from "@/lib/commandes-fournisseur/commande-packaging-fields";
import { productIdsLinkedToCommandeSupplier } from "@/lib/commandes-fournisseur/product-ids-for-commande-supplier";
import { productPhotoPublicUrl } from "@/lib/products/storage";

const PRODUCT_SELECT = `id, code, name, name_ar, category_id, supplier_id, image_path, allow_unit_in_commande, ref_category(label, sort_order), ref_sales_unit(label, label_ar, code), product_packaging(${COMMANDE_PACKAGING_SELECT})`;

type ProductRow = Record<string, unknown> & { id: string; name: string };

type CatSort = { label: string; sort_order: number | null };

function parseCat(raw: unknown): CatSort | null {
  const c = (Array.isArray(raw) ? raw[0] : raw) as CatSort | null | undefined;
  return c && typeof c === "object" && "label" in c ? c : null;
}

function sortProductsByCategory(rows: ProductRow[]): ProductRow[] {
  return [...rows].sort((a, b) => {
    const ca = parseCat(a.ref_category) ?? { label: "", sort_order: 0 };
    const cb = parseCat(b.ref_category) ?? { label: "", sort_order: 0 };
    const oa = ca.sort_order ?? 0;
    const ob = cb.sort_order ?? 0;
    if (oa !== ob) return oa - ob;
    const la = (ca.label || "").localeCompare(cb.label || "", "fr");
    if (la !== 0) return la;
    return a.name.localeCompare(b.name, "fr");
  });
}

/**
 * Liste ordonnée des produits actifs pour le parcours caissier.
 * Inclut les produits du fournisseur ET ceux qui ont un colis lié à ce fournisseur (même autre supplier_id sur le produit).
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

  const magasinId = url.searchParams.get("magasinId")?.trim() || null;
  const productId = url.searchParams.get("productId")?.trim() || null;
  const commandeId = url.searchParams.get("commandeId")?.trim() || null;

  const supabase = await createSupabaseServerClient();

  let rows: ProductRow[] = [];

  if (productId) {
    const { data: one, error } = await supabase
      .from("product")
      .select(PRODUCT_SELECT)
      .eq("id", productId)
      .eq("active", true)
      .maybeSingle();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!one) {
      return NextResponse.json({ error: "Produit introuvable" }, { status: 404 });
    }
    rows = [one as ProductRow];
  } else {
    const { data: byProductSupplier, error: e1 } = await supabase
      .from("product")
      .select(PRODUCT_SELECT)
      .eq("supplier_id", supplierId)
      .eq("active", true);
    if (e1) {
      return NextResponse.json({ error: e1.message }, { status: 500 });
    }

    const byId = new Map<string, ProductRow>();
    for (const p of (byProductSupplier ?? []) as ProductRow[]) {
      byId.set(p.id, p);
    }

    const linkedIds = await productIdsLinkedToCommandeSupplier(supabase, supplierId);
    const ligneProductIds: string[] = [];
    if (commandeId) {
      const { data: lignes } = await supabase
        .from("commande_fournisseur_ligne")
        .select("product_id")
        .eq("commande_id", commandeId);
      for (const l of lignes ?? []) {
        const pid = (l as { product_id?: string }).product_id;
        if (pid) {
          ligneProductIds.push(pid);
        }
      }
    }
    const missingIds = [...new Set([...linkedIds, ...ligneProductIds])].filter((id) => !byId.has(id));
    if (missingIds.length > 0) {
      const { data: extra, error: e2 } = await supabase
        .from("product")
        .select(PRODUCT_SELECT)
        .in("id", missingIds)
        .eq("active", true);
      if (e2) {
        return NextResponse.json({ error: e2.message }, { status: 500 });
      }
      for (const p of (extra ?? []) as ProductRow[]) {
        byId.set(p.id, p);
      }
    }

    rows = [...byId.values()];
  }

  const sorted = sortProductsByCategory(rows);

  const filteredByPackaging = applyCommandeProductPackagingFilter(
    sorted as Parameters<typeof applyCommandeProductPackagingFilter>[0],
    magasinId,
    supplierId,
  );

  const withPhotos = filteredByPackaging.map((row) => {
    const image_path = (row as { image_path?: string | null }).image_path;
    const photoUrl = productPhotoPublicUrl(supabase, image_path ?? null);
    return { ...(row as object), photoUrl };
  });

  if (productId) {
    const one = withPhotos[0] ?? null;
    if (!one) {
      return NextResponse.json({ error: "Produit introuvable" }, { status: 404 });
    }
    return NextResponse.json({ product: one });
  }

  return NextResponse.json({ products: withPhotos, total: withPhotos.length });
}
