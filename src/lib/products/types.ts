/** Lignes telles que renvoyées par Supabase (snake_case). */

export type RefRow = {
  id: string
  code: string
  label: string
  sort_order: number
  created_at?: string
}

export type RefConditionnementRow = RefRow & {
  height_mm: number | null
  width_mm: number | null
  depth_mm: number | null
  supplier_id: string | null
  ref_supplier?: RefRow | null
}

/** Vendeur / marchand achat, rattaché à un fournisseur. */
export type RefVendeurRow = {
  id: string
  supplier_id: string
  label: string
  sort_order: number
  created_at?: string
  ref_supplier?: RefRow | RefRow[] | null
}

export type ProductRow = {
  id: string
  code: string
  name: string
  price: number
  sales_unit_id: string
  category_id: string
  supplier_id: string
  /** Vendeur achat par défaut (réf. fournisseur produit). */
  vendeur_id?: string | null
  name_ar: string | null
  cost_purchase: number | null
  cost_manufacturing: number | null
  cost_packaging: number | null
  margin: number | null
  image_path: string | null
  active: boolean
  visible_vitrine: boolean
  /** Commande fournisseur : autoriser la saisie à l’unité (sans colis). Défaut true si absent (legacy). */
  allow_unit_in_commande?: boolean
  created_at: string
  updated_at: string
}

export type ProductPackagingMagasinRow = {
  product_packaging_id: string
  magasin_id: string
  sellable: boolean
  purchasable: boolean
}

export type ProductPackagingRow = {
  id: string
  product_id: string
  conditionnement_id: string
  quantity: number
  sales_unit_id: string
  created_at: string
  available_for_sale?: boolean
  available_for_purchase?: boolean
  product_packaging_magasin?: ProductPackagingMagasinRow[] | ProductPackagingMagasinRow | null
}

export type ProductPriceHistoryRow = {
  id: string
  product_id: string
  valid_from: string
  price: number
  cost_purchase: number | null
  created_at: string
}

export type ProductWithRefs = ProductRow & {
  ref_sales_unit: RefRow | null
  ref_category: RefRow | null
  ref_supplier: RefRow | null
}
