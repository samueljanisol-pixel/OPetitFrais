import type { CuisineDayTotals, CuisineJournalEntryRow } from "./types";

export function aggregateDayTotals(
  entries: Pick<CuisineJournalEntryRow, "entry_type" | "quantity">[],
): CuisineDayTotals {
  let entrees = 0;
  let sorties = 0;
  for (const e of entries) {
    const q = Number(e.quantity);
    if (!Number.isFinite(q)) continue;
    if (e.entry_type === "entree") entrees += q;
    else if (e.entry_type === "sortie") sorties += q;
  }
  return { entrees, sorties, net: entrees - sorties };
}
