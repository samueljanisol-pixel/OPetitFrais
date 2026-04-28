import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAnyApiPermission } from "@/lib/auth/require-permission-api";

const PERMS = ["commandes_fournisseur.saisie", "commandes_fournisseur.consolidation", "commandes_fournisseur.achat"];

type CatEmbed = {
  id: string;
  label: string | null;
  sort_order: number | null;
};

/** Catégories distinctes représentées par les produits actifs d’un fournisseur (filtre liste). */
export async function GET(req: Request) {
  const gate = await requireAnyApiPermission(PERMS);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const supplierId = new URL(req.url).searchParams.get("supplierId")?.trim() ?? "";
  const onlySupplierRaw = new URL(req.url).searchParams.get("onlySupplier");
  const onlySupplier = onlySupplierRaw === null ? true : !["false", "0"].includes((onlySupplierRaw ?? "").trim().toLowerCase());

  if (onlySupplier && supplierId.length === 0) {
    return NextResponse.json({ error: "supplierId requis lorsque le filtre fournisseur est actif" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();

  let qb = supabase
    .from("product")
    .select("category_id, ref_category(id, label, sort_order)")
    .eq("active", true);

  if (onlySupplier) {
    qb = qb.eq("supplier_id", supplierId);
  }

  const { data: rows, error } = await qb;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const seen = new Map<string, CatEmbed>();
  for (const r of rows ?? []) {
    const cid = (r as { category_id: string | null }).category_id;
    if (!cid || seen.has(cid)) {
      continue;
    }
    const raw = (r as { ref_category?: unknown }).ref_category;
    const ref = (Array.isArray(raw) ? raw[0] : raw) as CatEmbed | null | undefined;
    seen.set(cid, {
      id: ref?.id ?? cid,
      label: ref?.label ?? null,
      sort_order: ref?.sort_order ?? 0,
    });
  }

  const categories = [...seen.values()].sort((a, b) => {
    const oa = a.sort_order ?? 0;
    const ob = b.sort_order ?? 0;
    if (oa !== ob) {
      return oa - ob;
    }
    return (a.label ?? "").localeCompare(b.label ?? "", "fr");
  });

  return NextResponse.json({ categories });
}
