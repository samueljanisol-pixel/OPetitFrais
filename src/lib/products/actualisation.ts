import type { SupabaseClient } from "@supabase/supabase-js";
import { PRODUCT_SUPPLIER_PRODUCT_EMBED } from "@/lib/products/product-supabase-select";

export const ACTUALISATION_PERMS = ["produits.write", "commandes_fournisseur.achat"] as const;

/** Délai minimum sans commande (qte_achat > 0) avant proposition de désactivation. */
export const DESACTIVATION_DAYS_WITHOUT_ORDER = 5;

export type ActualisationQueue = "prix" | "activation" | "desactivation";

/** Arrondi au demi supérieur (ex. 10,1 → 10,5 ; 10,51 → 11). */
export function roundSalePriceUpToHalf(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.ceil(n * 2) / 2;
}

/** Prix de vente proposé = coûts + marge (inverse de defaultMargin), arrondi au 0,5 supérieur. */
export function proposedSalePrice(params: {
  costPurchase: number | null;
  costManufacturing: number | null;
  costPackaging: number | null;
  margin: number | null;
}): number {
  const a = params.costPurchase ?? 0;
  const f = params.costManufacturing ?? 0;
  const e = params.costPackaging ?? 0;
  const m = params.margin ?? 0;
  return roundSalePriceUpToHalf(a + f + e + m);
}

/** Comparaison monétaire à 2 décimales (prix de vente). */
export function salePricesEqual(a: number, b: number): boolean {
  return Math.round(Number(a) * 100) === Math.round(Number(b) * 100);
}

async function clearOtherQueues(
  supabase: SupabaseClient,
  productId: string,
  keep: ActualisationQueue,
): Promise<{ error: string } | { ok: true }> {
  const tables: Array<{ queue: ActualisationQueue; table: string }> = [
    { queue: "prix", table: "product_actualisation_prix" },
    { queue: "activation", table: "product_actualisation_activation" },
    { queue: "desactivation", table: "product_actualisation_desactivation" },
  ];
  for (const { queue, table } of tables) {
    if (queue === keep) continue;
    const { error } = await supabase.from(table).delete().eq("product_id", productId);
    if (error) return { error: error.message };
  }
  return { ok: true };
}

export type EnqueueAfterPurchaseArgs = {
  productId: string;
  lotId: string;
  supplierId: string;
  newCostPurchase: number;
  productActive: boolean;
  productPrice: number;
  costManufacturing: number | null;
  costPackaging: number | null;
  margin: number | null;
};

/**
 * Après achat (clôture vendeur) : file prix si prix actuel ≠ proposé ;
 * sinon file activation si produit inactif ; sinon rien.
 * Retire toujours le produit des autres files concurrentes.
 */
export async function enqueueProductActualisationAfterPurchase(
  supabase: SupabaseClient,
  args: EnqueueAfterPurchaseArgs,
): Promise<{ error: string } | { ok: true; queue: ActualisationQueue | null }> {
  const proposed = proposedSalePrice({
    costPurchase: args.newCostPurchase,
    costManufacturing: args.costManufacturing,
    costPackaging: args.costPackaging,
    margin: args.margin,
  });
  const needsPriceUpdate = !salePricesEqual(args.productPrice, proposed);
  const now = new Date().toISOString();

  if (needsPriceUpdate) {
    const cleared = await clearOtherQueues(supabase, args.productId, "prix");
    if ("error" in cleared) return cleared;

    const { error } = await supabase.from("product_actualisation_prix").upsert(
      {
        product_id: args.productId,
        lot_id: args.lotId,
        supplier_id: args.supplierId,
        new_cost_purchase: args.newCostPurchase,
        created_at: now,
      },
      { onConflict: "product_id" },
    );
    if (error) return { error: error.message };
    return { ok: true, queue: "prix" };
  }

  if (!args.productActive) {
    const cleared = await clearOtherQueues(supabase, args.productId, "activation");
    if ("error" in cleared) return cleared;

    const { error } = await supabase.from("product_actualisation_activation").upsert(
      {
        product_id: args.productId,
        lot_id: args.lotId,
        supplier_id: args.supplierId,
        created_at: now,
      },
      { onConflict: "product_id" },
    );
    if (error) return { error: error.message };
    return { ok: true, queue: "activation" };
  }

  // Prix inchangé et déjà actif : retirer d'éventuelles files obsolètes
  for (const table of [
    "product_actualisation_prix",
    "product_actualisation_activation",
    "product_actualisation_desactivation",
  ] as const) {
    const { error } = await supabase.from(table).delete().eq("product_id", args.productId);
    if (error) return { error: error.message };
  }

  return { ok: true, queue: null };
}

/** Produits liés au fournisseur (principal ∪ product_supplier), actifs et vitrine. */
export async function activeVitrineProductIdsForSupplier(
  supabase: SupabaseClient,
  supplierId: string,
): Promise<string[] | { error: string }> {
  const sid = supplierId.trim();
  if (!sid) return [];

  const ids = new Set<string>();

  const { data: byPrimary, error: e1 } = await supabase
    .from("product")
    .select("id")
    .eq("supplier_id", sid)
    .eq("active", true)
    .eq("visible_vitrine", true);
  if (e1) return { error: e1.message };
  for (const row of byPrimary ?? []) {
    const id = (row as { id?: string }).id;
    if (id) ids.add(id);
  }

  const { data: viaLink, error: e2 } = await supabase
    .from("product_supplier")
    .select(`product_id, ${PRODUCT_SUPPLIER_PRODUCT_EMBED}!inner(id, active, visible_vitrine)`)
    .eq("supplier_id", sid)
    .eq("product.active", true)
    .eq("product.visible_vitrine", true);
  if (e2) return { error: e2.message };
  for (const row of viaLink ?? []) {
    const pid = (row as { product_id?: string }).product_id;
    if (pid) ids.add(pid);
  }

  return [...ids];
}

function cutoffDateForDesactivation(reference = new Date()): Date {
  const d = new Date(reference);
  d.setDate(d.getDate() - DESACTIVATION_DAYS_WITHOUT_ORDER);
  return d;
}

/** Dernière clôture lot (marque_terminee_at) avec qte_achat > 0, par produit et fournisseur. */
async function lastPositiveOrderDatesForSupplier(
  supabase: SupabaseClient,
  supplierId: string,
): Promise<Map<string, string> | { error: string }> {
  const { data: lots, error: lotErr } = await supabase
    .from("commande_fournisseur_lot")
    .select("id, marque_terminee_at")
    .eq("supplier_id", supplierId)
    .eq("status", "terminee")
    .not("marque_terminee_at", "is", null);
  if (lotErr) return { error: lotErr.message };

  const lotDates = new Map<string, string>();
  for (const lot of lots ?? []) {
    const id = (lot as { id?: string }).id;
    const closedAt = (lot as { marque_terminee_at?: string }).marque_terminee_at;
    if (id && closedAt) lotDates.set(id, closedAt);
  }

  const lotIds = [...lotDates.keys()];
  if (lotIds.length === 0) return new Map();

  const { data: lignes, error: le } = await supabase
    .from("commande_fournisseur_lot_ligne")
    .select("product_id, lot_id, qte_achat")
    .in("lot_id", lotIds)
    .gt("qte_achat", 0);
  if (le) return { error: le.message };

  const byProduct = new Map<string, string>();
  for (const row of lignes ?? []) {
    const pid = (row as { product_id?: string }).product_id;
    const lid = (row as { lot_id?: string }).lot_id;
    if (!pid || !lid) continue;
    const lotDate = lotDates.get(lid);
    if (!lotDate) continue;
    const prev = byProduct.get(pid);
    if (!prev || lotDate > prev) byProduct.set(pid, lotDate);
  }

  return byProduct;
}

function hadNoPositiveOrderForDays(
  productId: string,
  lastPositiveOrderByProduct: Map<string, string>,
  createdAtByProduct: Map<string, string>,
  cutoff: Date,
): boolean {
  const reference =
    lastPositiveOrderByProduct.get(productId) ?? createdAtByProduct.get(productId);
  if (!reference) return false;
  return new Date(reference) <= cutoff;
}

/**
 * À la clôture lot : enfile les produits fournisseur actifs+vitrine non commandés
 * (pas de ligne ou qte_achat = 0) depuis plus de {@link DESACTIVATION_DAYS_WITHOUT_ORDER} jours,
 * sauf s'ils sont déjà en file prix ou activation.
 */
export async function enqueueProductActualisationDesactivationForLot(
  supabase: SupabaseClient,
  opts: { lotId: string; supplierId: string },
): Promise<{ error: string } | { ok: true; count: number }> {
  const { lotId, supplierId } = opts;

  const candidates = await activeVitrineProductIdsForSupplier(supabase, supplierId);
  if ("error" in candidates) return { error: candidates.error };
  if (candidates.length === 0) return { ok: true, count: 0 };

  const { data: lignes, error: le } = await supabase
    .from("commande_fournisseur_lot_ligne")
    .select("product_id, qte_achat")
    .eq("lot_id", lotId);
  if (le) return { error: le.message };

  const commanded = new Set<string>();
  for (const row of lignes ?? []) {
    const pid = (row as { product_id?: string }).product_id;
    const qte = (row as { qte_achat?: number | null }).qte_achat;
    if (!pid) continue;
    if (qte != null && Number(qte) > 0) commanded.add(pid);
  }

  const [inPrix, inAct] = await Promise.all([
    supabase.from("product_actualisation_prix").select("product_id").in("product_id", candidates),
    supabase
      .from("product_actualisation_activation")
      .select("product_id")
      .in("product_id", candidates),
  ]);
  if (inPrix.error) return { error: inPrix.error.message };
  if (inAct.error) return { error: inAct.error.message };

  const blocked = new Set<string>();
  for (const r of inPrix.data ?? []) {
    const id = (r as { product_id?: string }).product_id;
    if (id) blocked.add(id);
  }
  for (const r of inAct.data ?? []) {
    const id = (r as { product_id?: string }).product_id;
    if (id) blocked.add(id);
  }

  const notCommanded = candidates.filter((id) => !commanded.has(id) && !blocked.has(id));
  if (notCommanded.length === 0) return { ok: true, count: 0 };

  const lastOrders = await lastPositiveOrderDatesForSupplier(supabase, supplierId);
  if ("error" in lastOrders) return { error: lastOrders.error };

  const { data: productRows, error: pe } = await supabase
    .from("product")
    .select("id, created_at")
    .in("id", notCommanded);
  if (pe) return { error: pe.message };

  const createdAtByProduct = new Map<string, string>();
  for (const row of productRows ?? []) {
    const id = (row as { id?: string }).id;
    const createdAt = (row as { created_at?: string }).created_at;
    if (id && createdAt) createdAtByProduct.set(id, createdAt);
  }

  const cutoff = cutoffDateForDesactivation();
  const toEnqueue = notCommanded.filter((id) =>
    hadNoPositiveOrderForDays(id, lastOrders, createdAtByProduct, cutoff),
  );
  if (toEnqueue.length === 0) return { ok: true, count: 0 };

  const now = new Date().toISOString();
  const rows = toEnqueue.map((product_id) => ({
    product_id,
    lot_id: lotId,
    supplier_id: supplierId,
    created_at: now,
  }));

  const { error } = await supabase
    .from("product_actualisation_desactivation")
    .upsert(rows, { onConflict: "product_id" });
  if (error) return { error: error.message };

  return { ok: true, count: toEnqueue.length };
}

export function actualisationQueueTable(queue: ActualisationQueue): string {
  if (queue === "prix") return "product_actualisation_prix";
  if (queue === "activation") return "product_actualisation_activation";
  return "product_actualisation_desactivation";
}
