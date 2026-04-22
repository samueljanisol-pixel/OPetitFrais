/** Marge par défaut : prix de vente − (achat + fabrication + emballage). */
export function defaultMargin(params: {
  price: number
  costPurchase: number | null
  costManufacturing: number | null
  costPackaging: number | null
}): number {
  const a = params.costPurchase ?? 0
  const f = params.costManufacturing ?? 0
  const e = params.costPackaging ?? 0
  return params.price - (a + f + e)
}
