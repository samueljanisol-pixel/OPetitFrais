export type PanierMag = { nbPaniers: number; panierMoyen: number | null }

export type CaResponse = {
  totalGlobal: number
  /** Vrai si le CA du jour sélectionné atteint ou dépasse le record sur la période historique. */
  isRecordDay?: boolean
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
  topProduits?: { available: boolean; byCa: Array<{ name: string; ca: number; qty: number }>; byQty: Array<{ name: string; ca: number; qty: number }> }
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
