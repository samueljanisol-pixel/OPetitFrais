export function formatDh(value: number): string {
  return value.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatEcartDh(value: number): string {
  const abs = formatDh(Math.abs(value));
  if (value > 0) return `+${abs}`;
  if (value < 0) return `-${abs}`;
  return abs;
}

export function ecartColor(value: number): "success.main" | "error.main" | "text.primary" {
  if (value > 0) return "success.main";
  if (value < 0) return "error.main";
  return "text.primary";
}

export function formatDrawerDetail(bills50: number, bills20: number, coins10: number): string | null {
  const parts: string[] = [];
  if (bills50 > 0) parts.push(`${bills50} x 50`);
  if (bills20 > 0) parts.push(`${bills20} x 20`);
  if (coins10 > 0) parts.push(`${coins10} x 10`);
  if (parts.length === 0) return null;
  return `(${parts.join(", ")})`;
}

export function formatClotureWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function verifyTotals(input: {
  bills200: number;
  bills100: number;
  bills50: number;
  bills20: number;
  drawerTotal: number;
  cashSales: number;
}) {
  const counted = input.bills200 * 200 + input.bills100 * 100 + input.bills50 * 50 + input.bills20 * 20;
  const withFloat = counted + input.drawerTotal;
  return {
    counted,
    withFloat,
    cashSales: input.cashSales,
    difference: withFloat - input.cashSales,
  };
}
