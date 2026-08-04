export type PosPanierLine = {
  productId?: string;
  productCode?: string;
  productName?: string;
  qty?: number;
  unitPrice?: number;
  lineTotal?: number;
  salesUnit?: "kg" | "unit";
};

export function parsePosPanierLines(raw: unknown): PosPanierLine[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((line): line is PosPanierLine => line != null && typeof line === "object");
}

export function posLineQtyLabel(line: PosPanierLine): string {
  const qty = typeof line.qty === "number" ? line.qty : 0;
  const unit = line.salesUnit === "kg" ? "kg" : "pce";
  return `${qty} ${unit}`;
}

export function posLineProductLabel(line: PosPanierLine): string {
  const name = typeof line.productName === "string" ? line.productName.trim() : "";
  if (name.length > 0) return name;
  const code = typeof line.productCode === "string" ? line.productCode.trim() : "";
  if (code.length > 0) return code;
  return "—";
}
