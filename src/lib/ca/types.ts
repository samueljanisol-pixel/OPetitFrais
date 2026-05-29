export type PanierMag = { nbPaniers: number; panierMoyen: number | null }

export type CaRecordRef = { date: string; total: number }

export type CaTopProduitLine = {
  name: string
  ca: number
  qty: number
  magasin: string
  categoryId: string | null
  categoryLabel: string | null
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
  magasins: Record<string, number>
}

export type HistoriquePayload =
  | { error: string }
  | {
      from: string
      to: string
      days: HistoriqueDayRow[]
    }
