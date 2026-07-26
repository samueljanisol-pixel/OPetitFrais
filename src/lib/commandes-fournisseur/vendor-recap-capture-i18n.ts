import type { AppLocale } from "@/i18n/config";
import frMessages from "@/messages/fr.json";
import arMessages from "@/messages/ar-MA.json";

type CommonMessages = {
  total: string;
  udvCond: string;
  noLines: string;
  soitLine: string;
  captureProduct: string;
  captureOrderOn: string;
  captureOrderBy: string;
};

function commonForLocale(locale: AppLocale): CommonMessages {
  const root = locale === "ar-MA" ? arMessages : frMessages;
  const c = root.backoffice.commandes.common;
  return {
    total: c.total,
    udvCond: c.udvCond,
    noLines: c.noLines,
    soitLine: c.soitLine,
    captureProduct: c.captureProduct,
    captureOrderOn: c.captureOrderOn,
    captureOrderBy: c.captureOrderBy,
  };
}

function interpolate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "");
}

export type VendorRecapCaptureLabels = {
  product: string;
  total: string;
  udvCond: string;
  noLines: string;
  orderOnLine: string;
  orderByLine: string | null;
  formatSoitLine: (qty: string, unit: string) => string;
  dir: "rtl" | "ltr";
};

export function vendorExportLocale(raw: string | null | undefined): AppLocale {
  return raw === "ar-MA" ? "ar-MA" : "fr";
}

export function vendorRecapCaptureLabels(
  locale: AppLocale,
  _supplierLabel: string,
  commandeDateLabel: string,
  commandeParLabel?: string | null,
): VendorRecapCaptureLabels {
  const c = commonForLocale(locale);
  const par = commandeParLabel?.trim() ?? "";
  return {
    product: c.captureProduct,
    total: c.total,
    udvCond: c.udvCond,
    noLines: c.noLines,
    orderOnLine: interpolate(c.captureOrderOn, { date: commandeDateLabel }),
    orderByLine: par.length > 0 ? interpolate(c.captureOrderBy, { name: par }) : null,
    formatSoitLine: (qty, unit) => interpolate(c.soitLine, { qty, unit }),
    dir: locale === "ar-MA" ? "rtl" : "ltr",
  };
}
