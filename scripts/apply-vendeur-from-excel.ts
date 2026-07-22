/**
 * Assigne le vendeur marché à chaque produit listé dans l'Excel
 * « Unité de commande.xlsx » (colonne vendeur par bloc).
 *
 * Usage : npx tsx scripts/apply-vendeur-from-excel.ts [chemin.xlsx]
 */

import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

type ExcelEntry = { code: number; nom: string; unit: string; ar: string; vendeur: string };
type ProductRow = { id: string; code: string; name: string; supplier_id: string; vendeur_id: string | null };
type VendeurRow = { id: string; supplier_id: string; label: string };

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

function vendeurIdForLabel(label: string, vendeurs: VendeurRow[]): string | null {
  const key = norm(label);
  if (!key) return null;
  const exact = vendeurs.find((v) => norm(v.label) === key);
  if (exact) return exact.id;
  return vendeurs.find((v) => norm(v.label).includes(key) || key.includes(norm(v.label)))?.id ?? null;
}

async function main() {
  const excelPath = process.argv[2] ?? DEFAULT_EXCEL;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Variables Supabase manquantes (.env.local)");
  }

  const entries = parseExcel(excelPath);
  const withVendor = entries.filter((e) => e.vendeur.trim().length > 0);
  console.log(`${entries.length} codes produits, ${withVendor.length} avec vendeur`);

  const supabase = createClient(url, serviceKey);

  const { data: suppliers, error: supErr } = await supabase
    .from("ref_supplier")
    .select("id, label")
    .order("sort_order");
  if (supErr) throw new Error(supErr.message);

  const marche = (suppliers ?? []).find((s) => norm((s as { label: string }).label) === norm("Marché"));
  if (!marche) {
    throw new Error('Fournisseur « Marché » introuvable.');
  }
  const marcheId = (marche as { id: string }).id;

  const { data: vendeursRaw, error: vendErr } = await supabase
    .from("ref_supplier_vendeur")
    .select("id, supplier_id, label")
    .eq("supplier_id", marcheId);
  if (vendErr) throw new Error(vendErr.message);

  const vendeurs = (vendeursRaw ?? []) as VendeurRow[];
  console.log(`${vendeurs.length} vendeurs Marché en base`);

  const { data: products, error: prodErr } = await supabase
    .from("product")
    .select("id, code, name, supplier_id, vendeur_id");
  if (prodErr) throw new Error(prodErr.message);

  const byCode = new Map<string, ProductRow>();
  for (const p of (products ?? []) as ProductRow[]) {
    byCode.set(norm(p.code), p);
  }

  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];
  const unknownVendors = new Set<string>();

  for (const entry of withVendor) {
    const product = byCode.get(norm(String(entry.code)));
    if (!product) {
      errors.push(`Code ${entry.code} (${entry.nom}) : produit introuvable`);
      continue;
    }

    const vendeurId = vendeurIdForLabel(entry.vendeur, vendeurs);
    if (!vendeurId) {
      unknownVendors.add(entry.vendeur);
      errors.push(`Code ${entry.code} : vendeur « ${entry.vendeur} » introuvable`);
      continue;
    }

    if (product.vendeur_id === vendeurId) {
      skipped += 1;
      continue;
    }

    const { error: updErr } = await supabase
      .from("product")
      .update({ vendeur_id: vendeurId })
      .eq("id", product.id);
    if (updErr) {
      errors.push(`Code ${entry.code} : ${updErr.message}`);
      continue;
    }
    updated += 1;
  }

  console.log("\n--- Résultat ---");
  console.log(`Vendeurs assignés : ${updated}`);
  console.log(`Déjà à jour : ${skipped}`);
  console.log(`Erreurs : ${errors.length}`);
  if (unknownVendors.size > 0) {
    console.log("\nVendeurs Excel sans correspondance :");
    for (const v of [...unknownVendors].sort()) {
      console.log(`  ${v}`);
    }
  }
  if (errors.length > 0) {
    console.log("\nDétail :");
    for (const e of errors.slice(0, 30)) console.log(`  ${e}`);
    if (errors.length > 30) console.log(`  … +${errors.length - 30} autres`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
