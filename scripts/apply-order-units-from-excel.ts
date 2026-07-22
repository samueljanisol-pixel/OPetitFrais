/**
 * Applique les unités de commande (UdC / product.order_unit_id) depuis un Excel
 * structuré comme « Unité de commande.xlsx » (colonne « Unité d'Achat »).
 *
 * Usage : npx tsx scripts/apply-order-units-from-excel.ts [chemin.xlsx]
 */

import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

type ExcelEntry = { code: number; nom: string; unit: string; ar: string };

type RefRow = { id: string; code: string; label: string };

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

async function ensureOrderUnits(
  supabase: ReturnType<typeof createClient>,
  labels: string[],
): Promise<Map<string, string>> {
  const { data: existing, error } = await supabase.from("ref_order_unit").select("id, code, label");
  if (error) throw new Error(`ref_order_unit : ${error.message}`);

  const byLabel = new Map<string, string>();
  for (const row of (existing ?? []) as RefRow[]) {
    byLabel.set(norm(row.label), row.id);
  }

  let sortOrder =
    ((existing ?? []) as RefRow[]).reduce((max, r) => Math.max(max, 0), 0) + 1;

  for (const label of labels) {
    if (byLabel.has(norm(label))) continue;
    const { data: inserted, error: insertErr } = await supabase
      .from("ref_order_unit")
      .insert({ label, sort_order: sortOrder })
      .select("id, label")
      .single();
    if (insertErr) throw new Error(`Création UdC « ${label} » : ${insertErr.message}`);
    byLabel.set(norm((inserted as RefRow).label), (inserted as RefRow).id);
    sortOrder += 1;
    console.log(`+ UdC créée : ${label}`);
  }

  return byLabel;
}

async function main() {
  const excelPath = process.argv[2] ?? DEFAULT_EXCEL;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Variables Supabase manquantes (.env.local)");
  }

  const entries = parseExcel(excelPath);
  if (entries.length === 0) {
    throw new Error(`Aucune ligne produit dans ${excelPath}`);
  }

  const unitLabels = [...new Set(entries.map((e) => e.unit).filter(Boolean))];
  console.log(`${entries.length} produits, unités : ${unitLabels.join(", ")}`);

  const supabase = createClient(url, serviceKey);
  const byUnitLabel = await ensureOrderUnits(supabase, unitLabels);

  const codes = entries.map((e) => String(e.code));
  const { data: products, error: prodErr } = await supabase
    .from("product")
    .select("id, code, name, order_unit_id")
    .in("code", codes);
  if (prodErr) throw new Error(`product : ${prodErr.message}`);

  const byCode = new Map<string, { id: string; code: string; name: string; order_unit_id: string | null }>();
  for (const p of products ?? []) {
    const row = p as { id: string; code: string; name: string; order_unit_id: string | null };
    byCode.set(norm(row.code), row);
  }

  let updated = 0;
  let unchanged = 0;
  const missing: ExcelEntry[] = [];
  const unknownUnit: ExcelEntry[] = [];
  const errors: string[] = [];

  for (const entry of entries) {
    const product = byCode.get(norm(String(entry.code)));
    if (!product) {
      missing.push(entry);
      continue;
    }
    const unitId = byUnitLabel.get(norm(entry.unit));
    if (!unitId) {
      unknownUnit.push(entry);
      continue;
    }
    if (product.order_unit_id === unitId) {
      unchanged += 1;
      continue;
    }
    const { error: updErr } = await supabase
      .from("product")
      .update({ order_unit_id: unitId })
      .eq("id", product.id);
    if (updErr) {
      errors.push(`${entry.code} ${entry.nom} : ${updErr.message}`);
      continue;
    }
    updated += 1;
  }

  console.log("\n--- Résultat ---");
  console.log(`Mis à jour : ${updated}`);
  console.log(`Déjà corrects : ${unchanged}`);
  console.log(`Codes absents en base : ${missing.length}`);
  console.log(`Unité inconnue : ${unknownUnit.length}`);
  console.log(`Erreurs : ${errors.length}`);

  if (missing.length > 0) {
    console.log("\nCodes absents :");
    for (const m of missing) console.log(`  ${m.code} ${m.nom} (${m.unit})`);
  }
  if (unknownUnit.length > 0) {
    console.log("\nUnités inconnues :");
    for (const u of unknownUnit) console.log(`  ${u.code} ${u.nom} → ${u.unit}`);
  }
  if (errors.length > 0) {
    console.log("\nErreurs :");
    for (const e of errors) console.log(`  ${e}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
