/** Lignes telles que renvoyées par Supabase (snake_case). */

export type RefRow = {
  id: string
  code: string
  label: string
  /** Libellé arabe optionnel (catégories, sous-catégories, conditionnements). */
  label_ar?: string | null
  sort_order: number
  created_at?: string
}

/** Fournisseur catalogue (`ref_supplier`). */
export type RefSupplierRow = RefRow & {
  /** Commandes magasin autorisées pour ce fournisseur. */
  commande_active: boolean
}

/** Sous-catégorie catalogue, rattachée à une catégorie. */
export type RefSubcategoryRow = RefRow & {
  category_id: string
  ref_category?: RefRow | RefRow[] | null
}

export type RefConditionnementRow = RefRow & {
  height_mm: number | null
  width_mm: number | null
  depth_mm: number | null
  supplier_id: string | null
  /** Libellé arabe optionnel. */
  label_ar?: string | null
  ref_supplier?: RefRow | null
}

/** Vendeur / marchand achat, rattaché à un fournisseur. */
export type RefVendeurRow = {
  id: string
  supplier_id: string
  label: string
  sort_order: number
  phone?: string | null
  preferred_locale?: string | null
  /** Devise de saisie achat : `dirham` (défaut) ou `rial` (1 DH = 20 Rial). */
  devise_achat?: string | null
  created_at?: string
  ref_supplier?: RefRow | RefRow[] | null
}

export type ProductRow = {
  id: string
  code: string
  name: string
  price: number
  sales_unit_id: string
  /** Unité de commande fournisseur (UdC). */
  order_unit_id?: string | null
  /** Unité d'achat fournisseur (UdA). */
  purchase_unit_id?: string | null
  category_id: string
  /** Sous-catégorie optionnelle (doit correspondre à category_id). */
  subcategory_id?: string | null
  supplier_id: string
  /** Vendeur achat par défaut (réf. fournisseur produit). */
  vendeur_id?: string | null
  name_ar: string | null
  /** Nom affiché client (français) ; repli sur `name` si absent. */
  sales_name?: string | null
  /** Nom affiché client (arabe) ; repli sur `name_ar` si absent. */
  sales_name_ar?: string | null
  cost_purchase: number | null
  cost_manufacturing: number | null
  cost_packaging: number | null
  margin: number | null
  image_path: string | null
  active: boolean
  visible_vitrine: boolean
  /** Commande fournisseur : autoriser la saisie à l’unité (sans colis). Défaut true si absent (legacy). */
  allow_unit_in_commande?: boolean
  /** Poids moyen d’une pièce (kg) pour les unités de commande vitrine. */
  piece_weight_kg?: number | null
  /** Si true, l’UdV est proposée sur la boutique. */
  shop_allow_sales_unit?: boolean
  /** Favori boutique : id `ref_shop_order_unit` ; null = favori = UdV. */
  shop_favorite_unit_id?: string | null
  /** Matériau d'emballage utilisé ; null = aucun. */
  emballage_id?: string | null
  /** Étiquette utilisée ; null = aucune. */
  etiquette_id?: string | null
  created_at: string
  updated_at: string
}

/** Unité de commande vitrine (référentiel Paramètres). */
export type RefShopOrderUnitRow = {
  id: string
  code: string
  label: string
  label_ar?: string | null
  piece_qty: number
  sort_order: number
  created_at?: string
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
  /** Nom affiché (prioritaire sur ref_conditionnement.label). */
  nom?: string | null
  /** Nom affiché arabe (prioritaire sur ref_conditionnement.label_ar). */
  nom_ar?: string | null
  created_at: string
  /** Archivage logique : masqué du catalogue, conservé pour l’historique. */
  archived_at?: string | null
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
  cost_manufacturing: number | null
  cost_packaging: number | null
  margin: number | null
  created_at: string
}

export type ProductWithRefs = ProductRow & {
  ref_sales_unit: RefRow | null
  ref_order_unit: RefRow | null
  ref_purchase_unit: RefRow | null
  ref_category: RefRow | null
  ref_subcategory: RefSubcategoryRow | RefRow | null
  ref_supplier: RefRow | null
}
