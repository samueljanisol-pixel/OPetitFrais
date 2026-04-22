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
}

export type ProductRow = {
  id: string
  code: string
  name: string
  price: number
  sales_unit_id: string
  category_id: string
  supplier_id: string
  name_ar: string | null
  cost_purchase: number | null
  cost_manufacturing: number | null
  cost_packaging: number | null
  margin: number | null
  image_path: string | null
  active: boolean
  visible_vitrine: boolean
  created_at: string
  updated_at: string
}

export type ProductPackagingRow = {
  id: string
  product_id: string
  conditionnement_id: string
  quantity: number
  sales_unit_id: string
  created_at: string
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
