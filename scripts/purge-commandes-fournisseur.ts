/**
 * Purge des commandes fournisseur / lots / achats (données de lot).
 *
 * Conserve :
 * - 4 commandes intégrées du 27/07/2026 (Station 15:50 & 15:54, Marché 20:05 & 20:23:52)
 * - les lots liés à ces commandes (via lot_id ou inclusion)
 *
 * Usage :
 *   npx tsx scripts/purge-commandes-fournisseur.ts           # dry-run
 *   npx tsx scripts/purge-commandes-fournisseur.ts --execute  # purge réelle
 */

import { resolve } from "node:path";
import { config } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

/** Préfixes created_at UTC des commandes à conserver (status integree). */
const KEEP_COMMANDE_CREATED_AT_PREFIXES = [
  "2026-07-27T15:50:53",
  "2026-07-27T15:54:14",
  "2026-07-27T20:05:15",
  "2026-07-27T20:23:52",
] as const;

type CommandeRow = {
  id: string;
  created_at: string;
  status: string;
  lot_id: string | null;
  ref_supplier: { label?: string } | { label?: string }[] | null;
  magasins: { nom?: string } | { nom?: string }[] | null;
};

type LotRow = {
  id: string;
  status: string;
  created_at: string;
  ref_supplier: { label?: string } | { label?: string }[] | null;
};

function relLabel(
  rel: { label?: string } | { label?: string }[] | null | undefined,
): string {
  if (rel == null) return "?";
  const obj = Array.isArray(rel) ? rel[0] : rel;
  return obj?.label ?? "?";
}

function isKeeperCommande(c: CommandeRow): boolean {
  return (
    c.status === "integree" &&
    KEEP_COMMANDE_CREATED_AT_PREFIXES.some((p) => c.created_at.startsWith(p))
  );
}

async function fetchAllCommandes(sb: SupabaseClient): Promise<CommandeRow[]> {
  const { data, error } = await sb
    .from("commande_fournisseur")
    .select("id, created_at, status, lot_id, ref_supplier(label), magasins(nom)")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as CommandeRow[];
}

async function fetchAllLots(sb: SupabaseClient): Promise<LotRow[]> {
  const { data, error } = await sb
    .from("commande_fournisseur_lot")
    .select("id, status, created_at, ref_supplier(label)")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as LotRow[];
}

async function main() {
  const execute = process.argv.includes("--execute");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase non configuré (.env.local)");

  const sb = createClient(url, key);

  const commandes = await fetchAllCommandes(sb);
  const lots = await fetchAllLots(sb);

  const keepers = commandes.filter(isKeeperCommande);
  if (keepers.length !== KEEP_COMMANDE_CREATED_AT_PREFIXES.length) {
    throw new Error(
      `Attendu ${KEEP_COMMANDE_CREATED_AT_PREFIXES.length} commandes à garder, trouvé ${keepers.length}`,
    );
  }

  const keepCmdIds = new Set(keepers.map((c) => c.id));
  const keepCmdIdList = [...keepCmdIds];

  const { data: inclusionsForKeepers, error: incErr } = await sb
    .from("commande_fournisseur_lot_inclusion")
    .select("lot_id, commande_id")
    .in("commande_id", keepCmdIdList);
  if (incErr) throw new Error(incErr.message);

  const keepLotIds = new Set<string>([
    ...keepers.flatMap((c) => (c.lot_id ? [c.lot_id] : [])),
    ...(inclusionsForKeepers ?? []).map((i) => i.lot_id as string),
  ]);
  const keepLotIdList = [...keepLotIds];

  const deleteCommandes = commandes.filter((c) => !keepCmdIds.has(c.id));
  const deleteLots = lots.filter((l) => !keepLotIds.has(l.id));
  const keepLots = lots.filter((l) => keepLotIds.has(l.id));

  console.log(execute ? "=== EXECUTE ===" : "=== DRY-RUN (passer --execute pour purger) ===");
  console.log("");
  console.log("Commandes à GARDER:", keepers.length);
  for (const c of keepers) {
    const mag = Array.isArray(c.magasins) ? c.magasins[0]?.nom : c.magasins?.nom;
    console.log(
      `  ${c.created_at} | ${c.status} | ${relLabel(c.ref_supplier)} | ${mag ?? "?"} | lot=${c.lot_id ?? "null"} | ${c.id}`,
    );
  }
  console.log("");
  console.log("Lots à GARDER:", keepLots.length);
  for (const l of keepLots) {
    console.log(
      `  ${l.created_at} | ${l.status} | ${relLabel(l.ref_supplier)} | ${l.id}`,
    );
  }
  console.log("");
  console.log("Commandes à SUPPRIMER:", deleteCommandes.length);
  console.log("Lots à SUPPRIMER (achats inclus via CASCADE):", deleteLots.length);

  if (keepLotIdList.length > 0) {
    const { data: allIncOnKeepLots, error: aErr } = await sb
      .from("commande_fournisseur_lot_inclusion")
      .select("lot_id, commande_id")
      .in("lot_id", keepLotIdList);
    if (aErr) throw new Error(aErr.message);

    const strayInclusions = (allIncOnKeepLots ?? []).filter(
      (i) => !keepCmdIds.has(i.commande_id as string),
    );
    console.log(
      "Inclusions hors keepers sur lots gardés (à retirer):",
      strayInclusions.length,
    );
  }

  if (!execute) {
    console.log("");
    console.log("Aucune modification. Relancer avec --execute pour appliquer.");
    return;
  }

  // 1) Retirer les inclusions non-keepers des lots conservés (RESTRICT sinon)
  if (keepLotIdList.length > 0) {
    const { data: allIncOnKeepLots, error: aErr } = await sb
      .from("commande_fournisseur_lot_inclusion")
      .select("lot_id, commande_id")
      .in("lot_id", keepLotIdList);
    if (aErr) throw new Error(aErr.message);

    const stray = (allIncOnKeepLots ?? []).filter(
      (i) => !keepCmdIds.has(i.commande_id as string),
    );
    for (const row of stray) {
      const { error } = await sb
        .from("commande_fournisseur_lot_inclusion")
        .delete()
        .eq("lot_id", row.lot_id)
        .eq("commande_id", row.commande_id);
      if (error) throw new Error(`inclusion delete: ${error.message}`);
    }
    console.log("Inclusions retirées:", stray.length);

    // détacher lot_id des commandes non gardées pointant vers un lot gardé
    const toDetach = deleteCommandes.filter(
      (c) => c.lot_id != null && keepLotIds.has(c.lot_id),
    );
    for (const c of toDetach) {
      const { error } = await sb
        .from("commande_fournisseur")
        .update({ lot_id: null })
        .eq("id", c.id);
      if (error) throw new Error(`detach lot_id: ${error.message}`);
    }
    console.log("lot_id détachés:", toDetach.length);
  }

  // 2) Supprimer les lots non gardés → CASCADE lignes/frais/commentaires/inclusions (= achats)
  const deleteLotIds = deleteLots.map((l) => l.id);
  if (deleteLotIds.length > 0) {
    // batch delete
    const chunk = 50;
    for (let i = 0; i < deleteLotIds.length; i += chunk) {
      const slice = deleteLotIds.slice(i, i + chunk);
      const { error } = await sb
        .from("commande_fournisseur_lot")
        .delete()
        .in("id", slice);
      if (error) throw new Error(`lot delete: ${error.message}`);
    }
    console.log("Lots supprimés:", deleteLotIds.length);
  }

  // 3) Supprimer les commandes non gardées → CASCADE lignes
  const deleteCmdIds = deleteCommandes.map((c) => c.id);
  if (deleteCmdIds.length > 0) {
    const chunk = 50;
    for (let i = 0; i < deleteCmdIds.length; i += chunk) {
      const slice = deleteCmdIds.slice(i, i + chunk);
      const { error } = await sb
        .from("commande_fournisseur")
        .delete()
        .in("id", slice);
      if (error) throw new Error(`commande delete: ${error.message}`);
    }
    console.log("Commandes supprimées:", deleteCmdIds.length);
  }

  const remainingCmd = await fetchAllCommandes(sb);
  const remainingLots = await fetchAllLots(sb);
  console.log("");
  console.log("=== APRÈS PURGE ===");
  console.log("Commandes restantes:", remainingCmd.length);
  for (const c of remainingCmd) {
    const mag = Array.isArray(c.magasins) ? c.magasins[0]?.nom : c.magasins?.nom;
    console.log(
      `  ${c.created_at} | ${c.status} | ${relLabel(c.ref_supplier)} | ${mag ?? "?"} | ${c.id}`,
    );
  }
  console.log("Lots restants:", remainingLots.length);
  for (const l of remainingLots) {
    console.log(
      `  ${l.created_at} | ${l.status} | ${relLabel(l.ref_supplier)} | ${l.id}`,
    );
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
