/**
 * Active tous les produits dont le fournisseur principal est « Marché ».
 *
 * Usage : npx tsx scripts/activate-marche-products.ts
 */

import { resolve } from "node:path";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

const norm = (s: string) => s.trim().toLowerCase();

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase non configuré");

  const sb = createClient(url, key);

  const { data: suppliers, error: sErr } = await sb.from("ref_supplier").select("id, label");
  if (sErr) throw new Error(sErr.message);

  const marche = (suppliers ?? []).find((s) => norm(String(s.label)) === norm("Marché"));
  if (!marche) throw new Error('Fournisseur « Marché » introuvable');

  const { data: products, error: pErr } = await sb
    .from("product")
    .select("id, code, name, active")
    .eq("supplier_id", marche.id);
  if (pErr) throw new Error(pErr.message);

  const rows = products ?? [];
  const inactive = rows.filter((p) => !p.active);

  console.log(`Produits Marché : ${rows.length}`);
  console.log(`Inactifs : ${inactive.length}`);

  if (inactive.length === 0) {
    console.log("Tous déjà actifs.");
    return;
  }

  const ids = inactive.map((p) => p.id);
  const { error: uErr } = await sb.from("product").update({ active: true }).in("id", ids);
  if (uErr) throw new Error(uErr.message);

  console.log(`Activés : ${ids.length}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
