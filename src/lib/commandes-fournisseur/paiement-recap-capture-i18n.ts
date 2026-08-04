import type { AppLocale } from "@/i18n/config";
import frMessages from "@/messages/fr.json";
import arMessages from "@/messages/ar-MA.json";

export type PaiementRecapCaptureLabels = {
  title: string;
  account: string;
  supplier: string;
  paymentDate: string;
  method: string;
  amount: string;
  achatsTitle: string;
  achatDate: string;
  achatAmount: string;
  comment: string;
  dir: "rtl" | "ltr";
};

function messagesForLocale(locale: AppLocale) {
  const root = locale === "ar-MA" ? arMessages : frMessages;
  return root.backoffice.commandes.comptes.paymentRecap;
}

export function paiementRecapCaptureLabels(locale: AppLocale): PaiementRecapCaptureLabels {
  const m = messagesForLocale(locale);
  return {
    title: m.title,
    account: m.account,
    supplier: m.supplier,
    paymentDate: m.paymentDate,
    method: m.method,
    amount: m.amount,
    achatsTitle: m.achatsTitle,
    achatDate: m.achatDate,
    achatAmount: m.achatAmount,
    comment: m.comment,
    dir: locale === "ar-MA" ? "rtl" : "ltr",
  };
}
