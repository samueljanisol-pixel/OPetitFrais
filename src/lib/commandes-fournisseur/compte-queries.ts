import type { SupabaseClient } from "@supabase/supabase-js";
import { loadPhotoCountsForPaiements } from "@/lib/commandes-fournisseur/paiement-photos";

export type CompteAccountType = "vendeur" | "station";

export type CompteAchatRow = {
  id: string;
  lot_id: string;
  supplier_id: string;
  vendeur_id: string | null;
  kind: "station" | "vendeur" | "frais_generaux";
  montant_total: number;
  date_cloture: string;
  paye: boolean;
  paiement_id: string | null;
};

export type CompteSummary = {
  account_type: CompteAccountType;
  account_id: string;
  label: string;
  parent_supplier_label?: string;
  total: number;
  paye: number;
  reste: number;
};

export type CompteAccountRef =
  | { type: "vendeur"; vendeurId: string }
  | { type: "station"; supplierId: string };

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function one<T>(raw: T | T[] | null | undefined): T | null {
  if (raw == null) return null;
  return (Array.isArray(raw) ? raw[0] : raw) as T;
}

function supplierLabelFromRef(raw: unknown): string {
  const o = one(raw as { label?: string; code?: string } | null);
  const lb = typeof o?.label === "string" ? o.label.trim() : "";
  const code = typeof o?.code === "string" ? o.code.trim() : "";
  return lb || code || "—";
}

async function loadPaidMap(
  supabase: SupabaseClient,
  achatIds: string[],
): Promise<{ error: string } | Map<string, string>> {
  const paidMap = new Map<string, string>();
  if (achatIds.length === 0) return paidMap;

  const { data: links, error: le } = await supabase
    .from("fournisseur_paiement_achat")
    .select("achat_id, paiement_id")
    .in("achat_id", achatIds);

  if (le) return { error: le.message };
  for (const link of links ?? []) {
    paidMap.set(
      String((link as { achat_id: string }).achat_id),
      String((link as { paiement_id: string }).paiement_id),
    );
  }
  return paidMap;
}

function mapAchatRows(
  achats: Array<Record<string, unknown>>,
  paidMap: Map<string, string>,
): CompteAchatRow[] {
  return achats.map((a) => {
    const id = String(a.id);
    const paiementId = paidMap.get(id) ?? null;
    return {
      id,
      lot_id: String(a.lot_id),
      supplier_id: String(a.supplier_id),
      vendeur_id: (a.vendeur_id as string | null | undefined) ?? null,
      kind: a.kind as CompteAchatRow["kind"],
      montant_total: roundMoney(Number(a.montant_total)),
      date_cloture: String(a.date_cloture),
      paye: paiementId != null,
      paiement_id: paiementId,
    };
  });
}

/** Charge les achats comptables d'un compte vendeur ou station. */
export async function loadAchatsForAccount(
  supabase: SupabaseClient,
  account: CompteAccountRef,
): Promise<{ error: string } | { achats: CompteAchatRow[] }> {
  let query = supabase
    .from("fournisseur_compte_achat")
    .select("id, lot_id, supplier_id, vendeur_id, kind, montant_total, date_cloture")
    .neq("kind", "frais_generaux")
    .order("date_cloture", { ascending: false });

  if (account.type === "vendeur") {
    query = query.eq("vendeur_id", account.vendeurId).eq("kind", "vendeur");
  } else {
    query = query.eq("supplier_id", account.supplierId).eq("kind", "station");
  }

  const { data: achats, error } = await query;
  if (error) return { error: error.message };

  const ids = (achats ?? []).map((a) => String((a as { id: string }).id));
  const paidResult = await loadPaidMap(supabase, ids);
  if (!("get" in paidResult)) {
    return { error: paidResult.error };
  }
  const paidMap = paidResult;

  return { achats: mapAchatRows((achats ?? []) as Array<Record<string, unknown>>, paidMap) };
}

export function summarizeAchats(achats: CompteAchatRow[]): { total: number; paye: number; reste: number } {
  let total = 0;
  let paye = 0;
  for (const a of achats) {
    total += a.montant_total;
    if (a.paye) paye += a.montant_total;
  }
  return {
    total: roundMoney(total),
    paye: roundMoney(paye),
    reste: roundMoney(total - paye),
  };
}

/** Résumé comptable : 1 ligne par vendeur + 1 par station (fournisseur sans vendeurs). */
export async function loadCompteSummaries(
  supabase: SupabaseClient,
): Promise<{ error: string } | { accounts: CompteSummary[] }> {
  const [vendeursRes, suppliersRes, achatsRes] = await Promise.all([
    supabase
      .from("ref_supplier_vendeur")
      .select("id, label, supplier_id, ref_supplier(id, code, label)")
      .order("sort_order", { ascending: true })
      .order("label", { ascending: true }),
    supabase
      .from("ref_supplier")
      .select("id, code, label")
      .eq("commande_active", true)
      .order("sort_order", { ascending: true })
      .order("label", { ascending: true }),
    supabase
      .from("fournisseur_compte_achat")
      .select("id, supplier_id, vendeur_id, kind, montant_total")
      .neq("kind", "frais_generaux"),
  ]);

  if (vendeursRes.error) return { error: vendeursRes.error.message };
  if (suppliersRes.error) return { error: suppliersRes.error.message };
  if (achatsRes.error) return { error: achatsRes.error.message };

  const achats = achatsRes.data ?? [];
  const ids = achats.map((a) => String((a as { id: string }).id));
  const paidSet = new Set<string>();

  if (ids.length > 0) {
    const { data: links, error: le } = await supabase
      .from("fournisseur_paiement_achat")
      .select("achat_id")
      .in("achat_id", ids);
    if (le) return { error: le.message };
    for (const link of links ?? []) {
      paidSet.add(String((link as { achat_id: string }).achat_id));
    }
  }

  const byVendeur = new Map<string, { total: number; paye: number }>();
  const byStation = new Map<string, { total: number; paye: number }>();

  for (const a of achats) {
    const kind = String((a as { kind: string }).kind);
    const montant = roundMoney(Number((a as { montant_total: number }).montant_total));
    const paid = paidSet.has(String((a as { id: string }).id));

    if (kind === "vendeur") {
      const vid = (a as { vendeur_id?: string | null }).vendeur_id;
      if (vid == null) continue;
      const key = String(vid);
      const cur = byVendeur.get(key) ?? { total: 0, paye: 0 };
      cur.total += montant;
      if (paid) cur.paye += montant;
      byVendeur.set(key, cur);
    } else if (kind === "station") {
      const sid = String((a as { supplier_id: string }).supplier_id);
      const cur = byStation.get(sid) ?? { total: 0, paye: 0 };
      cur.total += montant;
      if (paid) cur.paye += montant;
      byStation.set(sid, cur);
    }
  }

  const supplierIdsWithVendeurs = new Set(
    (vendeursRes.data ?? []).map((v) => String((v as { supplier_id: string }).supplier_id)),
  );

  const accounts: CompteSummary[] = [];

  for (const v of vendeursRes.data ?? []) {
    const vid = String((v as { id: string }).id);
    const label = String((v as { label: string }).label);
    const parent = supplierLabelFromRef((v as { ref_supplier?: unknown }).ref_supplier);
    const sums = byVendeur.get(vid) ?? { total: 0, paye: 0 };
    accounts.push({
      account_type: "vendeur",
      account_id: vid,
      label,
      parent_supplier_label: parent !== "—" ? parent : undefined,
      total: roundMoney(sums.total),
      paye: roundMoney(sums.paye),
      reste: roundMoney(sums.total - sums.paye),
    });
  }

  for (const s of suppliersRes.data ?? []) {
    const sid = String((s as { id: string }).id);
    if (supplierIdsWithVendeurs.has(sid)) continue;
    const label = supplierLabelFromRef(s);
    const sums = byStation.get(sid) ?? { total: 0, paye: 0 };
    accounts.push({
      account_type: "station",
      account_id: sid,
      label,
      total: roundMoney(sums.total),
      paye: roundMoney(sums.paye),
      reste: roundMoney(sums.total - sums.paye),
    });
  }

  accounts.sort((a, b) => {
    const typeOrder = (t: CompteAccountType) => (t === "vendeur" ? 0 : 1);
    const typeCmp = typeOrder(a.account_type) - typeOrder(b.account_type);
    if (typeCmp !== 0) return typeCmp;
    const pa = a.parent_supplier_label ?? a.label;
    const pb = b.parent_supplier_label ?? b.label;
    const c = pa.localeCompare(pb, "fr", { sensitivity: "base" });
    if (c !== 0) return c;
    return a.label.localeCompare(b.label, "fr", { sensitivity: "base" });
  });

  return { accounts };
}

export type PaiementRow = {
  id: string;
  supplier_id: string;
  vendeur_id: string | null;
  payment_method_id: string;
  payment_method_label: string;
  date_paiement: string;
  commentaire: string | null;
  montant: number;
  created_at: string;
  achat_ids: string[];
  photo_count: number;
};

export async function loadPaiementsForAccount(
  supabase: SupabaseClient,
  account: CompteAccountRef,
): Promise<{ error: string } | { paiements: PaiementRow[] }> {
  let query = supabase
    .from("fournisseur_paiement")
    .select(
      "id, supplier_id, vendeur_id, payment_method_id, date_paiement, commentaire, montant, created_at, ref_payment_method(id, label)",
    )
    .order("date_paiement", { ascending: false })
    .order("created_at", { ascending: false });

  if (account.type === "vendeur") {
    query = query.eq("vendeur_id", account.vendeurId);
  } else {
    query = query.eq("supplier_id", account.supplierId).is("vendeur_id", null);
  }

  const { data: paiements, error } = await query;
  if (error) return { error: error.message };

  const pids = (paiements ?? []).map((p) => String((p as { id: string }).id));
  const achatsByPaiement = new Map<string, string[]>();

  if (pids.length > 0) {
    const { data: links, error: le } = await supabase
      .from("fournisseur_paiement_achat")
      .select("paiement_id, achat_id")
      .in("paiement_id", pids);
    if (le) return { error: le.message };
    for (const link of links ?? []) {
      const pid = String((link as { paiement_id: string }).paiement_id);
      const arr = achatsByPaiement.get(pid) ?? [];
      arr.push(String((link as { achat_id: string }).achat_id));
      achatsByPaiement.set(pid, arr);
    }
  }

  const photoCountsResult = await loadPhotoCountsForPaiements(supabase, pids);
  if (!("get" in photoCountsResult)) {
    return { error: photoCountsResult.error };
  }
  const photoCounts = photoCountsResult;

  const rows: PaiementRow[] = (paiements ?? []).map((p) => {
    const id = String((p as { id: string }).id);
    const pm = one((p as { ref_payment_method?: unknown }).ref_payment_method);
    const pmLabel =
      typeof (pm as { label?: string } | null)?.label === "string"
        ? (pm as { label: string }).label
        : "—";
    return {
      id,
      supplier_id: String((p as { supplier_id: string }).supplier_id),
      vendeur_id: (p as { vendeur_id?: string | null }).vendeur_id ?? null,
      payment_method_id: String((p as { payment_method_id: string }).payment_method_id),
      payment_method_label: pmLabel,
      date_paiement: String((p as { date_paiement: string }).date_paiement),
      commentaire: (p as { commentaire?: string | null }).commentaire ?? null,
      montant: roundMoney(Number((p as { montant: number }).montant)),
      created_at: String((p as { created_at: string }).created_at),
      achat_ids: achatsByPaiement.get(id) ?? [],
      photo_count: photoCounts.get(id) ?? 0,
    };
  });

  return { paiements: rows };
}

/** Vérifie que les achats appartiennent au compte donné. */
export function achatsMatchAccount(
  achats: Array<{ kind: string; supplier_id: string; vendeur_id: string | null }>,
  account: CompteAccountRef,
): boolean {
  for (const a of achats) {
    if (a.kind === "frais_generaux") return false;
    if (account.type === "vendeur") {
      if (a.kind !== "vendeur" || a.vendeur_id !== account.vendeurId) return false;
    } else {
      if (a.kind !== "station" || a.supplier_id !== account.supplierId) return false;
    }
  }
  return true;
}
