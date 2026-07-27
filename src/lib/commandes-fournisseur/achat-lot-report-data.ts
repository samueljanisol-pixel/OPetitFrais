import type { SupabaseClient } from "@supabase/supabase-js";
import {
  categoryDisplayLabel,
  compareByCategoryThenProductName,
  parseCategoryFromRef,
} from "@/lib/commandes-fournisseur/ligne-category-order";
import { buildLotProductDisplayInfo } from "@/lib/commandes-fournisseur/product-display";
import { montantLigneFromPu, qtyBaseFromLotLine } from "@/lib/commandes-fournisseur/achat-pricing";

export type AchatLotReportLine = {
  productName: string;
  categoryLabel: string;
  udcLabel: string;
  udaLabel: string;
  qteBesoin: number;
  qteAchat: number;
  prixUnitaire: number | null;
  montant: number;
};

export type AchatLotReportSection = {
  key: string;
  title: string;
  lines: AchatLotReportLine[];
  totalProduits: number;
};

export type AchatLotReportFrais = {
  label: string;
  montant: number;
};

export type AchatLotReportPayload = {
  lotId: string;
  supplierLabel: string;
  status: string;
  marquePreteAt: string | null;
  marqueTermineeAt: string | null;
  sections: AchatLotReportSection[];
  frais: AchatLotReportFrais[];
  totalProduits: number;
  totalFrais: number;
  totalGeneral: number;
};

function one<T>(raw: T | T[] | null | undefined): T | null {
  if (raw == null) return null;
  return (Array.isArray(raw) ? raw[0] : raw) as T;
}

function labelFromNested(raw: unknown): string {
  const o = one(raw as { label?: string | null } | null);
  const t = o?.label?.trim();
  return t && t.length > 0 ? t : "—";
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export async function loadAchatLotReportPayload(
  supabase: SupabaseClient,
  lotId: string,
): Promise<{ error: string; status: number } | { payload: AchatLotReportPayload }> {
  const { data: lot, error: lotErr } = await supabase
    .from("commande_fournisseur_lot")
    .select(
      "id, supplier_id, status, marque_prete_at, marque_terminee_at, ref_supplier(id, code, label)",
    )
    .eq("id", lotId)
    .maybeSingle();

  if (lotErr) {
    return { error: lotErr.message, status: 500 };
  }
  if (!lot) {
    return { error: "Introuvable", status: 404 };
  }

  const supplierId = String((lot as { supplier_id: string }).supplier_id);
  const supplierRaw = (lot as { ref_supplier?: unknown }).ref_supplier;
  const supplierObj = one(supplierRaw as { label?: string; code?: string } | null);
  const supplierLabel =
    (typeof supplierObj?.label === "string" && supplierObj.label.trim()) ||
    (typeof supplierObj?.code === "string" && supplierObj.code.trim()) ||
    "Fournisseur";

  const [lignesRes, fraisRes, vendeursRes] = await Promise.all([
    supabase
      .from("commande_fournisseur_lot_ligne")
      .select(
        "id, product_id, product_packaging_id, qte_achat, qte_besoin_fige, vendeur_id, prix_achat_unitaire, montant_ligne_achat, product(id, name, name_ar, ref_sales_unit(label), ref_purchase_unit(label), ref_order_unit(label), ref_category(label, sort_order), product_packaging(id, quantity, nom, nom_ar, ref_conditionnement(label), ref_sales_unit(label)))",
      )
      .eq("lot_id", lotId),
    supabase
      .from("commande_fournisseur_lot_frais")
      .select("id, label, montant, vendeur_id")
      .eq("lot_id", lotId)
      .order("created_at", { ascending: true }),
    supabase
      .from("ref_supplier_vendeur")
      .select("id, label")
      .eq("supplier_id", supplierId)
      .order("sort_order", { ascending: true })
      .order("label", { ascending: true }),
  ]);

  if (lignesRes.error) return { error: lignesRes.error.message, status: 500 };
  if (fraisRes.error) return { error: fraisRes.error.message, status: 500 };
  if (vendeursRes.error) return { error: vendeursRes.error.message, status: 500 };

  type RawLigne = {
    id: string;
    product_packaging_id: string | null;
    qte_achat: number | string | null;
    qte_besoin_fige?: number | string | null;
    vendeur_id?: string | null;
    prix_achat_unitaire?: number | null;
    montant_ligne_achat?: number | null;
    product?: unknown;
  };

  const rows = [...(lignesRes.data ?? [])] as RawLigne[];
  rows.sort((a, b) => {
    const pa = one(a.product as { ref_category?: unknown; name?: string } | null);
    const pb = one(b.product as { ref_category?: unknown; name?: string } | null);
    const ca = pa ? parseCategoryFromRef(pa.ref_category) : { label: "", sort_order: null };
    const cb = pb ? parseCategoryFromRef(pb.ref_category) : { label: "", sort_order: null };
    return compareByCategoryThenProductName(
      ca,
      cb,
      pa?.name ?? "",
      pb?.name ?? "",
      String(a.id),
      String(b.id),
    );
  });

  const vendeurs = (vendeursRes.data ?? []) as Array<{ id: string; label: string }>;
  const vendeurById = new Map(vendeurs.map((v) => [v.id, v.label]));
  const soleVendor = vendeurs.length === 0;

  type AccSection = { key: string; title: string; lines: AchatLotReportLine[]; totalProduits: number };
  const sectionsMap = new Map<string, AccSection>();

  for (const L of rows) {
    const pr = one(
      L.product as {
        name?: string | null;
        ref_category?: unknown;
        ref_sales_unit?: unknown;
        ref_purchase_unit?: unknown;
        ref_order_unit?: unknown;
        product_packaging?: unknown;
      } | null,
    );
    const display = buildLotProductDisplayInfo(pr ?? null, L.product_packaging_id);
    const qteAchat = num(L.qte_achat, 0);
    const qteBesoin = num(L.qte_besoin_fige, 0);
    const pu =
      L.prix_achat_unitaire != null && Number.isFinite(Number(L.prix_achat_unitaire))
        ? Number(L.prix_achat_unitaire)
        : null;
    const qtyBase = qtyBaseFromLotLine(qteAchat, display);
    const montantStored =
      L.montant_ligne_achat != null && Number.isFinite(Number(L.montant_ligne_achat))
        ? Number(L.montant_ligne_achat)
        : null;
    const montant = montantStored ?? montantLigneFromPu(pu, qtyBase) ?? 0;

    const orderUnit = labelFromNested(pr?.ref_order_unit);
    const salesUnit = labelFromNested(pr?.ref_sales_unit);
    const udcLabel =
      display.isCond && display.condTitre
        ? display.condTitre
        : orderUnit !== "—"
          ? orderUnit
          : salesUnit;
    const udaLabel = labelFromNested(pr?.ref_purchase_unit);
    const cat = pr ? parseCategoryFromRef(pr.ref_category) : { label: "", sort_order: null };

    const line: AchatLotReportLine = {
      productName:
        typeof pr?.name === "string" && pr.name.trim().length > 0 ? pr.name.trim() : "—",
      categoryLabel: categoryDisplayLabel(cat),
      udcLabel,
      udaLabel,
      qteBesoin,
      qteAchat,
      prixUnitaire: pu,
      montant,
    };

    const vid = L.vendeur_id != null && String(L.vendeur_id).length > 0 ? String(L.vendeur_id) : null;
    const key = vid ?? "__supplier__";
    const title = vid
      ? (vendeurById.get(vid) ?? "Vendeur")
      : soleVendor
        ? supplierLabel
        : "Sans vendeur";

    let sec = sectionsMap.get(key);
    if (!sec) {
      sec = { key, title, lines: [], totalProduits: 0 };
      sectionsMap.set(key, sec);
    }
    sec.lines.push(line);
    sec.totalProduits += montant;
  }

  const sections = [...sectionsMap.values()].sort((a, b) => {
    if (a.key === "__supplier__") return 1;
    if (b.key === "__supplier__") return -1;
    return a.title.localeCompare(b.title, "fr", { sensitivity: "base" });
  });

  const frais: AchatLotReportFrais[] = [];
  for (const f of fraisRes.data ?? []) {
    if ((f as { vendeur_id?: string | null }).vendeur_id != null) continue;
    const label = typeof f.label === "string" ? f.label.trim() : "";
    if (!label) continue;
    const montant = Math.round(num(f.montant, 0) * 100) / 100;
    frais.push({ label, montant });
  }

  const totalProduits = sections.reduce((acc, s) => acc + s.totalProduits, 0);
  const totalFrais = frais.reduce((acc, f) => acc + f.montant, 0);

  return {
    payload: {
      lotId: String((lot as { id: string }).id),
      supplierLabel,
      status: String((lot as { status: string }).status),
      marquePreteAt: (lot as { marque_prete_at?: string | null }).marque_prete_at ?? null,
      marqueTermineeAt: (lot as { marque_terminee_at?: string | null }).marque_terminee_at ?? null,
      sections,
      frais,
      totalProduits: Math.round(totalProduits * 100) / 100,
      totalFrais: Math.round(totalFrais * 100) / 100,
      totalGeneral: Math.round((totalProduits + totalFrais) * 100) / 100,
    },
  };
}
