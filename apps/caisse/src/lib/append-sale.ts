import type { AppendSalePayload, AppendSaleResult } from "../../electron/preload/index";

export async function appendSaleLocal(payload: AppendSalePayload): Promise<AppendSaleResult> {
  if (!window.caisseApi?.appendSale) {
    return { ok: true, dayFile: "", monthFile: "" };
  }
  return window.caisseApi.appendSale(payload);
}
