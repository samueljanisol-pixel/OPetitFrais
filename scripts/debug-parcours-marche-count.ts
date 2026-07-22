import { resolve } from "node:path";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { applyCommandeProductPackagingFilter } from "../src/lib/commandes-fournisseur/applyCommandeProductPackagingFilter";
import { COMMANDE_PACKAGING_SELECT } from "../src/lib/commandes-fournisseur/commande-packaging-fields";
import { productIdsLinkedToCommandeSupplier } from "../src/lib/commandes-fournisseur/product-ids-for-commande-supplier";

config({ path: resolve(process.cwd(), ".env.local") });

const PRODUCT_SELECT = `id, code, name, supplier_id, active, allow_unit_in_commande, ref_category(label, sort_order), product_packaging(${COMMANDE_PACKAGING_SELECT})`;

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: suppliers } = await sb.from("ref_supplier").select("id,label");
  const marche = suppliers!.find((s) => s.label === "Marché")!;

  async function countForCommande(commandeId: string | null, magasinId: string | null) {
    const { data: byPrimary } = await sb
      .from("product")
      .select(PRODUCT_SELECT)
      .eq("supplier_id", marche.id)
      .eq("active", true);

    const linked = await productIdsLinkedToCommandeSupplier(sb, marche.id);
    const byId = new Map<string, Record<string, unknown>>();
    for (const p of byPrimary ?? []) byId.set(p.id, p as Record<string, unknown>);

    const ligneProductIds: string[] = [];
    if (commandeId) {
      const { data: lignes } = await sb
        .from("commande_fournisseur_ligne")
        .select("product_id")
        .eq("commande_id", commandeId);
      for (const l of lignes ?? []) {
        const pid = (l as { product_id?: string }).product_id;
        if (pid) ligneProductIds.push(pid);
      }
    }

    const missing = [...new Set([...linked, ...ligneProductIds])].filter((id) => !byId.has(id));
    if (missing.length > 0) {
      const { data: extra } = await sb
        .from("product")
        .select(`${PRODUCT_SELECT}, ref_supplier(label)`)
        .in("id", missing)
        .eq("active", true);
      for (const p of extra ?? []) byId.set(p.id, p as Record<string, unknown>);
    }

    const rows = [...byId.values()];
    const filtered = applyCommandeProductPackagingFilter(rows, magasinId, marche.id);
    return { byPrimary: byPrimary?.length ?? 0, union: rows.length, filtered: filtered.length, rows, filteredRows: filtered, ligneProductIds };
  }

  const base = await countForCommande(null, null);
  console.log("Sans commandeId:");
  console.log("  Actifs supplier_id=Marché:", base.byPrimary);
  console.log("  Après filtre colis:", base.filtered);

  const { data: commandes } = await sb
    .from("commande_fournisseur")
    .select("id, magasin_id, status, created_at")
    .eq("supplier_id", marche.id)
    .eq("status", "en_saisie")
    .order("created_at", { ascending: false })
    .limit(5);

  for (const c of commandes ?? []) {
    const r = await countForCommande(c.id, c.magasin_id ?? null);
    console.log(`\nCommande ${c.id.slice(0, 8)}… magasin=${c.magasin_id?.slice(0, 8) ?? "?"}`);
    console.log("  Lignes produits distincts:", [...new Set(r.ligneProductIds)].length);
    console.log("  Union:", r.union, "→ parcours:", r.filtered);
    if (r.filtered > base.byPrimary) {
      const primaryIds = new Set((await sb.from("product").select("id").eq("supplier_id", marche.id)).data?.map((p) => p.id));
      for (const p of r.filteredRows) {
        if (!primaryIds.has(p.id)) {
          console.log(`  + hors 108 Marché: ${(p as { code?: string }).code} ${(p as { name?: string }).name}`);
        }
      }
    }
  }

  const { data: ps } = await sb
    .from("product_supplier")
    .select("product_id, product:product!product_supplier_product_id_fkey(id, code, name, active, supplier_id, ref_supplier(label))")
    .eq("supplier_id", marche.id);
  const cross = (ps ?? []).filter((r) => {
    const p = Array.isArray(r.product) ? r.product[0] : r.product;
    return p && p.supplier_id !== marche.id && p.active;
  });
  console.log(`\nproduct_supplier Marché mais fournisseur principal autre: ${cross.length}`);
  for (const r of cross) {
    const p = Array.isArray(r.product) ? r.product[0] : r.product;
    const sup = p?.ref_supplier;
    const sl = Array.isArray(sup) ? sup[0]?.label : sup?.label;
    console.log(`  ${p?.code} ${p?.name} (principal: ${sl})`);
  }

  const linked = await productIdsLinkedToCommandeSupplier(sb, marche.id);
  const { data: primaryRows } = await sb.from("product").select("id").eq("supplier_id", marche.id).eq("active", true);
  const primarySet = new Set((primaryRows ?? []).map((p) => p.id));
  const linkedNotPrimary = linked.filter((id) => !primarySet.has(id));
  console.log(`\nIDs liés Marché hors primary: ${linkedNotPrimary.length}`);
  if (linkedNotPrimary.length > 0) {
    const { data: linkedProducts } = await sb
      .from("product")
      .select("id, code, name, active, supplier_id, ref_supplier(label)")
      .in("id", linkedNotPrimary);
    for (const p of linkedProducts ?? []) {
      const sup = (p as { ref_supplier?: { label?: string } | { label?: string }[] }).ref_supplier;
      const sl = Array.isArray(sup) ? sup[0]?.label : sup?.label;
      console.log(`  ${p.code} ${p.name} active=${p.active} principal=${sl}`);
    }
    if ((linkedProducts ?? []).length === 0) {
      console.log("  (IDs:", linkedNotPrimary.join(", "), ")");
      for (const id of linkedNotPrimary) {
        const { data: one, error } = await sb
          .from("product")
          .select("id, code, name, active, supplier_id, ref_supplier(label)")
          .eq("id", id)
          .maybeSingle();
        const sup = (one as { ref_supplier?: { label?: string } | { label?: string }[] } | null)?.ref_supplier;
        const sl = Array.isArray(sup) ? sup[0]?.label : sup?.label;
        console.log(`    lookup ${id}:`, one ? `${one.code} ${one.name} active=${one.active} principal=${sl}` : error?.message ?? "null");
      }
    }
  }

  // Produits Marché exclus du parcours (sans colis ni unité autorisée)
  const { data: allMarche } = await sb
    .from("product")
    .select(PRODUCT_SELECT)
    .eq("supplier_id", marche.id)
    .eq("active", true);
  const filteredAll = applyCommandeProductPackagingFilter(allMarche ?? [], null, marche.id);
  const filteredIds = new Set(filteredAll.map((p) => p.id));
  const excluded = (allMarche ?? []).filter((p) => !filteredIds.has(p.id));
  console.log(`\nProduits Marché exclus du parcours (filtre colis/unité): ${excluded.length}`);
  for (const p of excluded) {
    console.log(`  ${(p as { code?: string }).code} ${(p as { name?: string }).name}`);
  }

  const { count: totalMarcheActive } = await sb
    .from("product")
    .select("*", { count: "exact", head: true })
    .eq("supplier_id", marche.id)
    .eq("active", true);
  const { data: psAll } = await sb.from("product_supplier").select("product_id").eq("supplier_id", marche.id);
  const psIds = [...new Set((psAll ?? []).map((r) => r.product_id))];
  const { count: psActiveCount } = await sb
    .from("product")
    .select("*", { count: "exact", head: true })
    .in("id", psIds.length ? psIds : ["00000000-0000-0000-0000-000000000000"])
    .eq("active", true);
  console.log(`\nActifs primary Marché: ${totalMarcheActive}`);
  console.log(`Actifs via product_supplier Marché: ${psActiveCount}`);

  // Simulation exacte API parcours-produits
  const linkedSim = await productIdsLinkedToCommandeSupplier(sb, marche.id);
  const { data: byProductSupplier } = await sb
    .from("product")
    .select(PRODUCT_SELECT)
    .eq("supplier_id", marche.id)
    .eq("active", true);
  const byId = new Map<string, Record<string, unknown>>();
  for (const p of byProductSupplier ?? []) byId.set(p.id, p as Record<string, unknown>);
  const missingIds = linkedSim.filter((id) => !byId.has(id));
  console.log(`\nSimulation API: primary=${byId.size}, missing linked=${missingIds.length}`);
  if (missingIds.length > 0) {
    const { data: extra, error: exErr } = await sb
      .from("product")
      .select(PRODUCT_SELECT)
      .in("id", missingIds)
      .eq("active", true);
    console.log(`  extra fetch: ${extra?.length ?? 0}`, exErr?.message ?? "");
    for (const p of extra ?? []) {
      byId.set(p.id, p as Record<string, unknown>);
      console.log(`  + ${(p as { code?: string }).code} ${(p as { name?: string }).name}`);
    }
  }
  const simFiltered = applyCommandeProductPackagingFilter([...byId.values()], null, marche.id);
  console.log(`  parcours simulé: ${simFiltered.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
