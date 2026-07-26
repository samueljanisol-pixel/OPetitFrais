export type TicketLang = "fr" | "ar";

export function parseTicketLang(raw: string | null | undefined): TicketLang {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "ar" || v === "ar-ma" || v === "arabic" || v === "arabe") {
    return "ar";
  }
  return "fr";
}

export type TicketUiLabels = {
  title: string;
  codePrefix: string;
  datePrefix: string;
  productCol: string;
  qtyCol: string;
  unitCol: string;
  empty: string;
  noLines: string;
  footer: (suppliers: number, products: number) => string;
  sansCategorie: string;
};

export function ticketUiLabels(lang: TicketLang): TicketUiLabels {
  if (lang === "ar") {
    return {
      title: "آخر طلب",
      codePrefix: "الرمز",
      datePrefix: "التاريخ",
      productCol: "المنتج",
      qtyCol: "الكمية",
      unitCol: "الوحدة",
      empty: "لا توجد طلبية للطباعة.",
      noLines: "(بدون أسطر)",
      footer: (suppliers, products) => `${suppliers} مورد — ${products} منتج`,
      sansCategorie: "بدون فئة",
    };
  }
  return {
    title: "DERNIÈRE COMMANDE",
    codePrefix: "Code",
    datePrefix: "Date",
    productCol: "Produit",
    qtyCol: "Qté",
    unitCol: "Unité",
    empty: "Aucune commande à imprimer.",
    noLines: "(aucune ligne)",
    footer: (suppliers, products) =>
      `${suppliers} fournisseur(s) — ${products} produit(s)`,
    sansCategorie: "Sans catégorie",
  };
}
