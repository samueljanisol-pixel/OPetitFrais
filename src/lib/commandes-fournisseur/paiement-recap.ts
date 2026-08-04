import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppLocale } from "@/i18n/config";
import type { CompteAccountType } from "@/lib/commandes-fournisseur/compte-queries";
import {
  stationExportLocale,
  vendorExportLocale,
} from "@/lib/commandes-fournisseur/vendor-recap-capture-i18n";

export type PaiementRecapAchatLine = {
  id: string;
  date_cloture: string;
  montant_total: number;
};

export type PaiementRecapData = {
  paiement_id: string;
  account_type: CompteAccountType;
  account_label: string;
  parent_supplier_label: string | null;
  date_paiement: string;
  payment_method_label: string;
  montant: number;
  commentaire: string | null;
  achats: PaiementRecapAchatLine[];
  whatsapp_phone: string | null;
  export_locale: AppLocale;
};

function one<T>(raw: T | T[] | null | undefined): T | null {
  if (raw == null) return null;
  return (Array.isArray(raw) ? raw[0] : raw) as T;
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function supplierLabelFromRef(raw: unknown): string {
  const o = one(raw as { label?: string; code?: string } | null);
  const lb = typeof o?.label === "string" ? o.label.trim() : "";
  const code = typeof o?.code === "string" ? o.code.trim() : "";
  return lb || code || "—";
}

export async function loadPaiementRecap(
  supabase: SupabaseClient,
  paiementId: string,
): Promise<{ error: string; status?: number } | { recap: PaiementRecapData }> {
  const { data: paiement, error: pe } = await supabase
    .from("fournisseur_paiement")
    .select(
      "id, supplier_id, vendeur_id, date_paiement, commentaire, montant, ref_payment_method(id, label)",
    )
    .eq("id", paiementId)
    .maybeSingle();

  if (pe) return { error: pe.message, status: 500 };
  if (!paiement) return { error: "Paiement introuvable", status: 404 };

  const vendeurId = (paiement as { vendeur_id?: string | null }).vendeur_id ?? null;
  const supplierId = String((paiement as { supplier_id: string }).supplier_id);

  let accountType: CompteAccountType;
  let accountLabel = "—";
  let parentSupplierLabel: string | null = null;
  let whatsappPhone: string | null = null;
  let exportLocale: AppLocale = "fr";

  if (vendeurId != null) {
    accountType = "vendeur";
    const { data: vendeur, error: ve } = await supabase
      .from("ref_supplier_vendeur")
      .select("id, label, phone, preferred_locale, ref_supplier(id, code, label)")
      .eq("id", vendeurId)
      .maybeSingle();
    if (ve) return { error: ve.message, status: 500 };
    if (!vendeur) return { error: "Vendeur introuvable", status: 404 };

    accountLabel = String((vendeur as { label: string }).label);
    const parent = supplierLabelFromRef((vendeur as { ref_supplier?: unknown }).ref_supplier);
    parentSupplierLabel = parent !== "—" ? parent : null;
    const phone = (vendeur as { phone?: string | null }).phone;
    whatsappPhone = typeof phone === "string" && phone.trim().length > 0 ? phone.trim() : null;
    exportLocale = vendorExportLocale((vendeur as { preferred_locale?: string | null }).preferred_locale);
  } else {
    accountType = "station";
    const { data: supplier, error: se } = await supabase
      .from("ref_supplier")
      .select("id, code, label")
      .eq("id", supplierId)
      .maybeSingle();
    if (se) return { error: se.message, status: 500 };
    if (!supplier) return { error: "Fournisseur introuvable", status: 404 };

    accountLabel = supplierLabelFromRef(supplier);
    exportLocale = stationExportLocale();
    whatsappPhone = null;
  }

  const { data: links, error: le } = await supabase
    .from("fournisseur_paiement_achat")
    .select("achat_id")
    .eq("paiement_id", paiementId);

  if (le) return { error: le.message, status: 500 };

  const achatIds = (links ?? []).map((l) => String((l as { achat_id: string }).achat_id));
  let achats: PaiementRecapAchatLine[] = [];

  if (achatIds.length > 0) {
    const { data: achatRows, error: ae } = await supabase
      .from("fournisseur_compte_achat")
      .select("id, date_cloture, montant_total")
      .in("id", achatIds)
      .order("date_cloture", { ascending: true });

    if (ae) return { error: ae.message, status: 500 };

    achats = (achatRows ?? []).map((a) => ({
      id: String((a as { id: string }).id),
      date_cloture: String((a as { date_cloture: string }).date_cloture),
      montant_total: roundMoney(Number((a as { montant_total: number }).montant_total)),
    }));
  }

  const pm = one((paiement as { ref_payment_method?: unknown }).ref_payment_method);
  const pmLabel =
    typeof (pm as { label?: string } | null)?.label === "string"
      ? (pm as { label: string }).label
      : "—";

  return {
    recap: {
      paiement_id: paiementId,
      account_type: accountType,
      account_label: accountLabel,
      parent_supplier_label: parentSupplierLabel,
      date_paiement: String((paiement as { date_paiement: string }).date_paiement),
      payment_method_label: pmLabel,
      montant: roundMoney(Number((paiement as { montant: number }).montant)),
      commentaire: (paiement as { commentaire?: string | null }).commentaire ?? null,
      achats,
      whatsapp_phone: whatsappPhone,
      export_locale: exportLocale,
    },
  };
}
