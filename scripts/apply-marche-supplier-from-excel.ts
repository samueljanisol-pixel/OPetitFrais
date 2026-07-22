/**
 * Assigne le fournisseur « Marché » aux produits listés dans l'Excel
 * « Unité de commande.xlsx », et le retire pour tous les autres.
 *
 * Usage : npx tsx scripts/apply-marche-supplier-from-excel.ts [chemin.xlsx]
 */

import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import {
  primarySupplierIdFromSelection,
  syncProductSuppliers,
} from "../src/lib/products/product-supplier";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

type ExcelEntry = { code: number; nom: string; unit: string; ar: string };
type ProductRow = {
  id: string;
  code: string;
  name: string;
  supplier_id: string;
  vendeur_id: string | null;
};
type SupplierRow = { id: string; label: string; sort_order: number };

const norm = (s: string) => s.trim().toLowerCase();
const DEFAULT_EXCEL = String.raw`c:\Users\Sam\Downloads\Unité de commande.xlsx`;

function parseExcel(path: string): ExcelEntry[] {
  const parser = resolve(process.cwd(), "scripts/parse-order-units-excel.py");
  const out = execSync(`python "${parser}" "${path}"`, {
    encoding: "utf-8",
    maxBuffer: 10 * 1024 * 1024,
  });
  return JSON.parse(out) as ExcelEntry[];
}

async function loadVendeurSupplierMap(
  supabase: ReturnType<typeof createClient>,
): Promise<Map<string, string>> {
  const { data, error } = await supabase.from("ref_supplier_vendeur").select("id, supplier_id");
  if (error) throw new Error(error.message);
  const map = new Map<string, string>();
  for (const row of data ?? []) {
    const r = row as { id: string; supplier_id: string };
    map.set(r.id, r.supplier_id);
  }
  return map;
}

function vendeurIdForSupplier(
  vendeurId: string | null | undefined,
  supplierId: string,
  vendeurSuppliers: Map<string, string>,
): string | null {
  if (!vendeurId) return null;
  const vs = vendeurSuppliers.get(vendeurId);
  return vs === supplierId ? vendeurId : null;
}

async function main() {
  const excelPath = process.argv[2] ?? DEFAULT_EXCEL;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Variables Supabase manquantes (.env.local)");
  }

  const entries = parseExcel(excelPath);
  const excelCodes = new Set(entries.map((e) => norm(String(e.code))));
  console.log(`${entries.length} codes produits dans l'Excel`);

  const supabase = createClient(url, serviceKey);

  const { data: suppliers, error: supErr } = await supabase
    .from("ref_supplier")
    .select("id, label, sort_order")
    .order("sort_order");
  if (supErr) throw new Error(supErr.message);

  const suppliersOrdered = (suppliers ?? []) as SupplierRow[];
  const marche = suppliersOrdered.find((s) => norm(s.label) === norm("Marché"));
  if (!marche) {
    throw new Error('Fournisseur « Marché » introuvable dans ref_supplier.');
  }
  const fallback = suppliersOrdered.find((s) => norm(s.label) === norm("Epicerie"));
  if (!fallback) {
    throw new Error('Fournisseur « Epicerie » introuvable (repli pour retrait Marché).');
  }

  const { data: products, error: prodErr } = await supabase
    .from("product")
    .select("id, code, name, supplier_id, vendeur_id");
  if (prodErr) throw new Error(prodErr.message);

  const allProducts = (products ?? []) as ProductRow[];
  const vendeurSuppliers = await loadVendeurSupplierMap(supabase);

  const { data: links, error: linkErr } = await supabase
    .from("product_supplier")
    .select("product_id, supplier_id");
  if (linkErr) throw new Error(linkErr.message);

  const linksByProduct = new Map<string, string[]>();
  for (const row of links ?? []) {
    const r = row as { product_id: string; supplier_id: string };
    const list = linksByProduct.get(r.product_id) ?? [];
    list.push(r.supplier_id);
    linksByProduct.set(r.product_id, list);
  }

  let setMarche = 0;
  let removedMarche = 0;
  let fallbackEpicerie = 0;
  let vendeurCleared = 0;
  const errors: string[] = [];

  for (const product of allProducts) {
    const inExcel = excelCodes.has(norm(product.code));
    const currentLinks = linksByProduct.get(product.id) ?? [product.supplier_id];
    const uniqueLinks = [...new Set(currentLinks)];

    try {
      if (inExcel) {
        const primary = await syncProductSuppliers(
          supabase,
          product.id,
          [marche.id],
          suppliersOrdered,
        );
        if (!primary) {
          errors.push(`${product.code} ${product.name} : sync Marché sans fournisseur principal`);
          continue;
        }
        const vendeurId = vendeurIdForSupplier(product.vendeur_id, primary, vendeurSuppliers);
        const patch: { supplier_id: string; vendeur_id?: string | null } = { supplier_id: primary };
        if (vendeurId !== product.vendeur_id) {
          patch.vendeur_id = vendeurId;
          vendeurCleared += 1;
        }
        const { error: updErr } = await supabase.from("product").update(patch).eq("id", product.id);
        if (updErr) throw new Error(updErr.message);
        setMarche += 1;
        continue;
      }

      if (!uniqueLinks.includes(marche.id) && product.supplier_id !== marche.id) {
        continue;
      }

      const withoutMarche = uniqueLinks.filter((id) => id !== marche.id);
      const nextSuppliers = withoutMarche.length > 0 ? withoutMarche : [fallback.id];
      if (withoutMarche.length === 0) {
        fallbackEpicerie += 1;
      }

      const primary = await syncProductSuppliers(
        supabase,
        product.id,
        nextSuppliers,
        suppliersOrdered,
      );
      if (!primary) {
        errors.push(`${product.code} ${product.name} : fournisseur principal introuvable après retrait Marché`);
        continue;
      }

      const vendeurId = vendeurIdForSupplier(product.vendeur_id, primary, vendeurSuppliers);
      const patch: { supplier_id: string; vendeur_id?: string | null } = { supplier_id: primary };
      if (vendeurId !== product.vendeur_id) {
        patch.vendeur_id = vendeurId;
        vendeurCleared += 1;
      }
      const { error: updErr } = await supabase.from("product").update(patch).eq("id", product.id);
      if (updErr) throw new Error(updErr.message);
      removedMarche += 1;
    } catch (e) {
      errors.push(`${product.code} ${product.name} : ${e instanceof Error ? e.message : e}`);
    }
  }

  console.log("\n--- Résultat ---");
  console.log(`Marché assigné (Excel) : ${setMarche}`);
  console.log(`Marché retiré (autres) : ${removedMarche}`);
  console.log(`Repli Epicerie (sans autre fournisseur) : ${fallbackEpicerie}`);
  console.log(`Vendeurs réinitialisés : ${vendeurCleared}`);
  console.log(`Erreurs : ${errors.length}`);

  if (errors.length > 0) {
    console.log("\nErreurs / avertissements :");
    for (const e of errors) console.log(`  ${e}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
