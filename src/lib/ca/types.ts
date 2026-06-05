export type PanierMag = { nbPaniers: number; panierMoyen: number | null }

export type CaRecordRef = { date: string; total: number }

export type CaTopProduitLine = {
  name: string
  ca: number
  qty: number
  magasin: string
  productId?: string | null
  categoryId: string | null
  categoryLabel: string | null
  /** Libellé UdV catalogue (`ref_sales_unit`), null si produit non lié. */
  salesUnitLabel: string | null
  /** Code UdV catalogue (ex. `kg`), null si produit non lié. */
  salesUnitCode: string | null
}

export type CaTopProduitsPayload = {
  available: boolean
  lines: CaTopProduitLine[]
  filterMagasins: string[]
  filterCategories: Array<{ id: string; label: string }>
  byCa: Array<{ name: string; ca: number; qty: number }>
  byQty: Array<{ name: string; ca: number; qty: number }>
}

export type CaResponse = {
  totalGlobal: number
  /** Somme des quantités vendues (UdV Kg) pour la date sélectionnée. */
  totalKgJour?: number
  /** Vrai si le CA du jour sélectionné atteint ou dépasse le record sur la période historique. */
  isRecordDay?: boolean
  /** Record battu (date + montant) lorsque `isRecordDay` et qu'un record antérieur existait. */
  previousRecordDay?: CaRecordRef | null
  /** Par code magasin : vrai si le CA du jour atteint ou dépasse le record du magasin. */
  isRecordDayByMag?: Record<string, boolean>
  /** Par code magasin : record battu lorsque `isRecordDayByMag[mag]`. */
  previousRecordDayByMag?: Record<string, CaRecordRef>
  magasins: Record<string, Record<string, number>>
  month?: {
    ym: string
    totalGlobal: number
    /** Somme des quantités vendues (UdV Kg) sur le mois calendaire. */
    totalKg?: number
    magasins: Record<string, number>
    panierMois?: Record<string, PanierMag>
    panierMoisGlobal?: PanierMag
  }
  panierJour?: Record<string, PanierMag>
  panierJourGlobal?: PanierMag
  /** Index = heure (0 = minuit), valeurs = nombre de paniers sur la date sélectionnée. */
  panierHeureByMag?: Record<string, number[]>
  compare?: { date: string; j1: { date: string; totalGlobal: number }; j7: { date: string; totalGlobal: number } }
  topProduits?: CaTopProduitsPayload
  error?: string
}

export type HistoriqueDayRow = {
  date: string
  totalGlobal: number
  nbPaniersGlobal: number
  magasins: Record<string, number>
  magasinsNbPaniers: Record<string, number>
}

export type HistoriquePayload =
  | { error: string }
  | {
      from: string
      to: string
      days: HistoriqueDayRow[]
    }

export type VentesAnalyseFilters = {
  from: string
  to: string
  magasinCodes?: string[]
  categoryIds: string[]
  supplierIds: string[]
  productNames: string[]
}

export type VentesAnalyseGroupBy = 'produit' | 'categorie' | 'fournisseur' | 'magasin'

export type VentesAnalyseLine = {
  date: string
  name: string
  productId: string | null
  ca: number
  qty: number
  magasin: string
  categoryId: string | null
  categoryLabel: string | null
  supplierId: string | null
  supplierLabel: string | null
}

export type VentesAnalyseRow = {
  label: string
  ca: number
  qty: number
}

export type VentesAnalyseDailyRow = {
  date: string
  total: number
}

export type VentesAnalyseResult = {
  from: string
  to: string
  lines: VentesAnalyseLine[]
  dailyCa: VentesAnalyseDailyRow[]
  rawLineCount: number
  /** CA total sur la période (magasins + dates), sans filtre catégorie / fournisseur / produit. */
  totalCaPeriod: number
  /** Part du CA filtré par rapport à totalCaPeriod (0–100), null si totalCaPeriod = 0. */
  caPercentOfPeriod: number | null
}
