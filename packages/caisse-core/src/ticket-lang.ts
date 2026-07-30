export type TicketLang = "fr" | "ar";

export function parseTicketLang(raw: string | null | undefined): TicketLang {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "ar" || v === "ar-ma" || v === "arabic" || v === "arabe") {
    return "ar";
  }
  return "fr";
}
