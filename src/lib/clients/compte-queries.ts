import type { SupabaseClient } from "@supabase/supabase-js";
import { parsePosCaisseInfo } from "@/lib/clients/pos-caisse-display";

export type ClientPanierRow = {
  id: string;
  cart_number: number;
  client_id: string | null;
  montant_total: number;
  pos_total: number | null;
  payment_status: "unpaid" | "paid";
  submitted_at: string | null;
  fulfillment_mode: string | null;
  payment_method: string | null;
  order_comment: string | null;
  lines: unknown;
  paye: boolean;
  magasin_code: string | null;
  magasin_nom: string | null;
  caisse_code: string | null;
  ticket_ref: string | null;
};

export type ClientSummary = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  active: boolean;
  is_system: boolean;
  total: number;
  paye: number;
  reste: number;
};

export type ClientPaiementRow = {
  id: string;
  payment_method_label: string;
  date_paiement: string;
  commentaire: string | null;
  montant: number;
  panier_ids: string[];
};

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function one<T>(raw: T | T[] | null | undefined): T | null {
  if (raw == null) return null;
  return (Array.isArray(raw) ? raw[0] : raw) as T;
}

function panierLabel(cartNumber: number): string {
  return `Panier #${cartNumber}`;
}

/** Montant comptable / affiché : total caisse si encaissé, sinon estimation commande. */
export function effectivePanierMontant(p: Pick<ClientPanierRow, "montant_total" | "pos_total">): number {
  if (p.pos_total != null && Number.isFinite(p.pos_total)) return p.pos_total;
  return p.montant_total;
}

export function summarizePaniers(paniers: ClientPanierRow[]): {
  total: number;
  paye: number;
  reste: number;
} {
  let total = 0;
  let paye = 0;
  for (const p of paniers) {
    const montant = effectivePanierMontant(p);
    total += montant;
    if (p.paye) paye += montant;
  }
  return {
    total: roundMoney(total),
    paye: roundMoney(paye),
    reste: roundMoney(total - paye),
  };
}

export async function loadClientSummaries(
  supabase: SupabaseClient,
): Promise<{ error: string } | { clients: ClientSummary[] }> {
  const [clientsRes, paniersRes] = await Promise.all([
    supabase
      .from("caisse_client")
      .select("id, nom, telephone, email, actif, is_system")
      .eq("is_system", false)
      .order("nom", { ascending: true }),
    supabase
      .from("shop_cart")
      .select("id, client_id, montant_total, payment_status, shop_cart_pos_link ( total )")
      .eq("status", "submitted")
      .not("client_id", "is", null),
  ]);

  if (clientsRes.error) return { error: clientsRes.error.message };
  if (paniersRes.error) return { error: paniersRes.error.message };

  const totalsByClient = new Map<string, { total: number; paye: number }>();

  for (const row of paniersRes.data ?? []) {
    const clientId = (row as { client_id: string | null }).client_id;
    if (clientId == null) continue;
    const posLink = one((row as { shop_cart_pos_link?: unknown }).shop_cart_pos_link);
    const posTotal =
      posLink && (posLink as { total?: number | null }).total != null
        ? roundMoney(Number((posLink as { total: number }).total))
        : null;
    const montantEstime = roundMoney(Number((row as { montant_total: number | null }).montant_total ?? 0));
    const montant = posTotal ?? montantEstime;
    const paid = (row as { payment_status: string }).payment_status === "paid";
    const cur = totalsByClient.get(clientId) ?? { total: 0, paye: 0 };
    cur.total += montant;
    if (paid) cur.paye += montant;
    totalsByClient.set(clientId, cur);
  }

  const clients: ClientSummary[] = (clientsRes.data ?? []).map((c) => {
    const id = String((c as { id: string }).id);
    const sums = totalsByClient.get(id) ?? { total: 0, paye: 0 };
    return {
      id,
      name: String((c as { nom: string }).nom).trim(),
      phone: (c as { telephone?: string | null }).telephone?.trim() || null,
      email: (c as { email?: string | null }).email?.trim() || null,
      active: Boolean((c as { actif: boolean }).actif),
      is_system: Boolean((c as { is_system: boolean }).is_system),
      total: roundMoney(sums.total),
      paye: roundMoney(sums.paye),
      reste: roundMoney(sums.total - sums.paye),
    };
  });

  clients.sort((a, b) => {
    if (b.reste !== a.reste) return b.reste - a.reste;
    return a.name.localeCompare(b.name, "fr", { sensitivity: "base" });
  });

  return { clients };
}

export async function loadPaniersForClient(
  supabase: SupabaseClient,
  clientId: string,
): Promise<{ error: string } | { paniers: ClientPanierRow[] }> {
  const { data, error } = await supabase
    .from("shop_cart")
    .select(
      "id, cart_number, client_id, montant_total, payment_status, submitted_at, fulfillment_mode, payment_method, order_comment, lines, shop_cart_pos_link ( caisse_code, ticket_ref, total, magasins ( code, nom ) )",
    )
    .eq("client_id", clientId)
    .eq("status", "submitted")
    .order("submitted_at", { ascending: false });

  if (error) return { error: error.message };

  const paniers: ClientPanierRow[] = (data ?? []).map((row) => {
    const paymentStatus = (row as { payment_status: string }).payment_status;
    const pos = parsePosCaisseInfo((row as { shop_cart_pos_link?: unknown }).shop_cart_pos_link);
    const posLink = one((row as { shop_cart_pos_link?: unknown }).shop_cart_pos_link);
    const posTotal =
      posLink && (posLink as { total?: number | null }).total != null
        ? roundMoney(Number((posLink as { total: number }).total))
        : null;
    return {
      id: String((row as { id: string }).id),
      cart_number: Number((row as { cart_number: number }).cart_number),
      client_id: (row as { client_id: string | null }).client_id,
      montant_total: roundMoney(Number((row as { montant_total: number | null }).montant_total ?? 0)),
      pos_total: posTotal,
      payment_status: paymentStatus === "paid" ? "paid" : "unpaid",
      submitted_at: (row as { submitted_at?: string | null }).submitted_at ?? null,
      fulfillment_mode: (row as { fulfillment_mode?: string | null }).fulfillment_mode ?? null,
      payment_method: (row as { payment_method?: string | null }).payment_method ?? null,
      order_comment: (row as { order_comment?: string | null }).order_comment ?? null,
      lines: (row as { lines: unknown }).lines,
      paye: paymentStatus === "paid",
      magasin_code: pos?.magasin_code ?? null,
      magasin_nom: pos?.magasin_nom ?? null,
      caisse_code: pos?.caisse_code ?? null,
      ticket_ref: pos?.ticket_ref ?? null,
    };
  });

  return { paniers };
}

export type UnlinkedPanierRow = {
  id: string;
  cart_number: number;
  montant_total: number;
  submitted_at: string | null;
  fulfillment_mode: string | null;
  payment_method: string | null;
  label: string;
};

export async function loadUnlinkedPaniers(
  supabase: SupabaseClient,
): Promise<{ error: string } | { paniers: UnlinkedPanierRow[] }> {
  const { data, error } = await supabase
    .from("shop_cart")
    .select("id, cart_number, montant_total, submitted_at, fulfillment_mode, payment_method")
    .eq("status", "submitted")
    .is("client_id", null)
    .order("submitted_at", { ascending: false });

  if (error) return { error: error.message };

  const paniers: UnlinkedPanierRow[] = (data ?? []).map((row) => {
    const cartNumber = Number((row as { cart_number: number }).cart_number);
    return {
      id: String((row as { id: string }).id),
      cart_number: cartNumber,
      montant_total: roundMoney(Number((row as { montant_total: number | null }).montant_total ?? 0)),
      submitted_at: (row as { submitted_at?: string | null }).submitted_at ?? null,
      fulfillment_mode: (row as { fulfillment_mode?: string | null }).fulfillment_mode ?? null,
      payment_method: (row as { payment_method?: string | null }).payment_method ?? null,
      label: panierLabel(cartNumber),
    };
  });

  return { paniers };
}

export async function loadPaiementsForClient(
  supabase: SupabaseClient,
  clientId: string,
): Promise<{ error: string } | { paiements: ClientPaiementRow[] }> {
  const { data: paiements, error } = await supabase
    .from("client_paiement")
    .select(
      "id, payment_method_id, date_paiement, commentaire, montant, ref_payment_method(id, label)",
    )
    .eq("client_id", clientId)
    .order("date_paiement", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) return { error: error.message };

  const pids = (paiements ?? []).map((p) => String((p as { id: string }).id));
  const paniersByPaiement = new Map<string, string[]>();

  if (pids.length > 0) {
    const { data: links, error: le } = await supabase
      .from("client_paiement_panier")
      .select("paiement_id, shop_cart_id")
      .in("paiement_id", pids);
    if (le) return { error: le.message };
    for (const link of links ?? []) {
      const pid = String((link as { paiement_id: string }).paiement_id);
      const arr = paniersByPaiement.get(pid) ?? [];
      arr.push(String((link as { shop_cart_id: string }).shop_cart_id));
      paniersByPaiement.set(pid, arr);
    }
  }

  const rows: ClientPaiementRow[] = (paiements ?? []).map((p) => {
    const id = String((p as { id: string }).id);
    const pm = one((p as { ref_payment_method?: unknown }).ref_payment_method);
    const pmLabel =
      typeof (pm as { label?: string } | null)?.label === "string"
        ? (pm as { label: string }).label
        : "—";
    return {
      id,
      payment_method_label: pmLabel,
      date_paiement: String((p as { date_paiement: string }).date_paiement),
      commentaire: (p as { commentaire?: string | null }).commentaire ?? null,
      montant: roundMoney(Number((p as { montant: number }).montant)),
      panier_ids: paniersByPaiement.get(id) ?? [],
    };
  });

  return { paiements: rows };
}

export function paniersMatchClient(
  paniers: Array<{ client_id: string | null; payment_status: string; status?: string }>,
  clientId: string,
): boolean {
  for (const p of paniers) {
    if (p.client_id !== clientId) return false;
    if (p.payment_status === "paid") return false;
  }
  return true;
}

export { panierLabel, roundMoney };
