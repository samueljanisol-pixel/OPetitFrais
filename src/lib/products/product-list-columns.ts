import type { ProductRow, RefRow, RefSubcategoryRow, RefVendeurRow } from '@/lib/products/types'
import { productSalesNameFr } from '@/lib/products/product-display-name'

/** Colonnes configurables de la liste produits (hors case à cocher). */
export type ProductListColumnKey =
  | 'code'
  | 'name'
  | 'name_ar'
  | 'sales_name'
  | 'sales_name_ar'
  | 'price'
  | 'cost_purchase'
  | 'cost_manufacturing'
  | 'cost_packaging'
  | 'margin'
  | 'sales_unit_id'
  | 'order_unit_id'
  | 'purchase_unit_id'
  | 'category_id'
  | 'subcategory_id'
  | 'supplier_id'
  | 'vendeur_id'
  | 'active'
  | 'visible_vitrine'
  | 'allow_unit_in_commande'
  | 'shop_allow_sales_unit'
  | 'shop_order_units'
  | 'piece_weight_kg'
  | 'shop_favorite_unit_id'
  | 'emballage_id'
  | 'etiquette_id'
  | 'image_path'
  | 'fiche'

export type ProductListColumnGroup =
  | 'identification'
  | 'noms'
  | 'prix'
  | 'unites'
  | 'catalogue'
  | 'flags'
  | 'boutique'
  | 'autres'

export type ProductListCellKind =
  | 'readonly'
  | 'text'
  | 'number'
  | 'switch'
  | 'select'
  | 'image'
  | 'fiche'
  | 'shop_units'

export type ProductListFieldKey = Exclude<
  ProductListColumnKey,
  'fiche' | 'image_path' | 'code' | 'shop_order_units'
>

export type ProductListColumnDef = {
  key: ProductListColumnKey
  label: string
  group: ProductListColumnGroup
  sortable: boolean
  editable: boolean
  cellKind: ProductListCellKind
  /** Champ `product.*` associé (si applicable). */
  dbField?: keyof ProductRow
  /** Largeur minimale CSS approximative. */
  minWidth?: number
}

export const PRODUCT_LIST_COLUMN_GROUP_LABELS: Record<ProductListColumnGroup, string> = {
  identification: 'Identification',
  noms: 'Noms',
  prix: 'Prix et coûts',
  unites: 'Unités',
  catalogue: 'Catalogue',
  flags: 'Options',
  boutique: 'Boutique',
  autres: 'Autres',
}

export const PRODUCT_LIST_COLUMNS: ProductListColumnDef[] = [
  { key: 'code', label: 'Code', group: 'identification', sortable: true, editable: false, cellKind: 'readonly', dbField: 'code', minWidth: 72 },
  { key: 'active', label: 'Actif', group: 'flags', sortable: true, editable: true, cellKind: 'switch', dbField: 'active', minWidth: 72 },
  { key: 'name', label: 'Nom logistique', group: 'noms', sortable: true, editable: true, cellKind: 'text', dbField: 'name', minWidth: 140 },
  { key: 'name_ar', label: 'Nom logistique (arabe)', group: 'noms', sortable: true, editable: true, cellKind: 'text', dbField: 'name_ar', minWidth: 120 },
  { key: 'sales_name', label: 'Nom vente', group: 'noms', sortable: true, editable: true, cellKind: 'text', dbField: 'sales_name', minWidth: 140 },
  { key: 'sales_name_ar', label: 'Nom vente (arabe)', group: 'noms', sortable: true, editable: true, cellKind: 'text', dbField: 'sales_name_ar', minWidth: 120 },
  { key: 'price', label: 'Prix (DH)', group: 'prix', sortable: true, editable: true, cellKind: 'number', dbField: 'price', minWidth: 100 },
  { key: 'cost_purchase', label: 'Prix achat', group: 'prix', sortable: true, editable: true, cellKind: 'number', dbField: 'cost_purchase', minWidth: 100 },
  { key: 'cost_manufacturing', label: 'Prix fabrication', group: 'prix', sortable: true, editable: true, cellKind: 'number', dbField: 'cost_manufacturing', minWidth: 110 },
  { key: 'cost_packaging', label: 'Prix emballage', group: 'prix', sortable: true, editable: true, cellKind: 'number', dbField: 'cost_packaging', minWidth: 110 },
  { key: 'margin', label: 'Marge (DH)', group: 'prix', sortable: true, editable: true, cellKind: 'number', dbField: 'margin', minWidth: 100 },
  { key: 'sales_unit_id', label: 'UdV', group: 'unites', sortable: true, editable: true, cellKind: 'select', dbField: 'sales_unit_id', minWidth: 100 },
  { key: 'order_unit_id', label: 'UdC', group: 'unites', sortable: true, editable: true, cellKind: 'select', dbField: 'order_unit_id', minWidth: 100 },
  { key: 'purchase_unit_id', label: 'UdA', group: 'unites', sortable: true, editable: true, cellKind: 'select', dbField: 'purchase_unit_id', minWidth: 100 },
  { key: 'category_id', label: 'Catégorie', group: 'catalogue', sortable: true, editable: true, cellKind: 'select', dbField: 'category_id', minWidth: 120 },
  { key: 'subcategory_id', label: 'Sous-catégorie', group: 'catalogue', sortable: true, editable: true, cellKind: 'select', dbField: 'subcategory_id', minWidth: 120 },
  { key: 'supplier_id', label: 'Fournisseur', group: 'catalogue', sortable: true, editable: true, cellKind: 'select', dbField: 'supplier_id', minWidth: 120 },
  { key: 'vendeur_id', label: 'Vendeur', group: 'catalogue', sortable: true, editable: true, cellKind: 'select', dbField: 'vendeur_id', minWidth: 120 },
  { key: 'visible_vitrine', label: 'Visible vitrine', group: 'flags', sortable: true, editable: true, cellKind: 'switch', dbField: 'visible_vitrine', minWidth: 88 },
  { key: 'allow_unit_in_commande', label: 'Saisie à l\'unité (cmd.)', group: 'flags', sortable: false, editable: true, cellKind: 'switch', dbField: 'allow_unit_in_commande', minWidth: 100 },
  { key: 'shop_allow_sales_unit', label: 'UdV boutique', group: 'boutique', sortable: true, editable: true, cellKind: 'switch', dbField: 'shop_allow_sales_unit', minWidth: 88 },
  { key: 'shop_order_units', label: 'Unités cmd. boutique', group: 'boutique', sortable: false, editable: true, cellKind: 'shop_units', minWidth: 180 },
  { key: 'piece_weight_kg', label: 'Poids pièce (kg)', group: 'boutique', sortable: true, editable: true, cellKind: 'number', dbField: 'piece_weight_kg', minWidth: 110 },
  { key: 'shop_favorite_unit_id', label: 'Favori boutique', group: 'boutique', sortable: true, editable: true, cellKind: 'select', dbField: 'shop_favorite_unit_id', minWidth: 120 },
  { key: 'emballage_id', label: 'Emballage utilisé', group: 'autres', sortable: true, editable: true, cellKind: 'select', dbField: 'emballage_id', minWidth: 120 },
  { key: 'etiquette_id', label: 'Étiquette', group: 'autres', sortable: true, editable: true, cellKind: 'select', dbField: 'etiquette_id', minWidth: 120 },
  { key: 'image_path', label: 'Photo', group: 'autres', sortable: false, editable: false, cellKind: 'image', dbField: 'image_path', minWidth: 56 },
  { key: 'fiche', label: 'Fiche', group: 'autres', sortable: false, editable: false, cellKind: 'fiche', minWidth: 72 },
]

export const PRODUCT_LIST_COLUMN_BY_KEY: Record<ProductListColumnKey, ProductListColumnDef> =
  Object.fromEntries(PRODUCT_LIST_COLUMNS.map(c => [c.key, c])) as Record<
    ProductListColumnKey,
    ProductListColumnDef
  >

/** Colonnes visibles par défaut (comportement historique de la liste). */
export const DEFAULT_VISIBLE_PRODUCT_LIST_COLUMNS: ProductListColumnKey[] = [
  'code',
  'active',
  'name',
  'price',
  'sales_unit_id',
  'supplier_id',
  'category_id',
  'fiche',
]

export const ALL_PRODUCT_LIST_COLUMN_KEYS = PRODUCT_LIST_COLUMNS.map(c => c.key)

/** Colonnes non masquables dans le picker. */
export const FIXED_PRODUCT_LIST_COLUMNS: ProductListColumnKey[] = ['fiche']

export const EDITABLE_PRODUCT_LIST_FIELD_KEYS: ProductListFieldKey[] = PRODUCT_LIST_COLUMNS.filter(
  c => c.editable && c.key !== 'fiche' && c.key !== 'image_path' && c.key !== 'code' && c.key !== 'shop_order_units',
).map(c => c.key as ProductListFieldKey)

/** Colonnes éditables par défaut dans la liste (toutes celles qui le peuvent, sauf nom logistique). */
export const DEFAULT_EDITABLE_PRODUCT_LIST_COLUMNS: ProductListColumnKey[] = PRODUCT_LIST_COLUMNS.filter(
  c => c.editable && c.key !== 'name',
).map(c => c.key)

export type ProductListRow = ProductRow & {
  /** Unités vitrine cochées (`product_shop_order_unit`). */
  shop_order_unit_ids?: string[]
  ref_sales_unit: RefRow | null
  ref_order_unit: RefRow | null
  ref_purchase_unit: RefRow | null
  ref_category: RefRow | null
  ref_subcategory: RefSubcategoryRow | RefRow | null
  ref_supplier: RefRow | null
  ref_supplier_vendeur: RefVendeurRow | RefVendeurRow[] | null
  ref_emballage: { id: string; label: string; ref_emballage_type?: { label?: string } | null } | null
  ref_etiquette: { id: string; label: string; reference?: string | null } | null
  ref_shop_order_unit: RefRow | null
}

export type ProductListRefs = {
  categories: RefRow[]
  subcategories: RefSubcategoryRow[]
  suppliers: RefRow[]
  vendeurs: RefVendeurRow[]
  salesUnits: RefRow[]
  orderUnits: RefRow[]
  purchaseUnits: RefRow[]
  shopOrderUnits: RefRow[]
  emballages: Array<{ id: string; label: string; type_id?: string | null; ref_emballage_type?: { label?: string } | null }>
  etiquettes: Array<{ id: string; label: string; reference?: string | null }>
}

function codeToNum(code: string): number {
  const n = Number.parseInt(String(code).replace(/\D/g, ''), 10)
  return Number.isFinite(n) ? n : 0
}

function refLabel(ref: RefRow | RefSubcategoryRow | null | undefined): string {
  return ref?.label ?? '—'
}

function normalizeVendeurRef(
  ref: RefVendeurRow | RefVendeurRow[] | null | undefined,
): RefVendeurRow | null {
  if (ref == null) return null
  return Array.isArray(ref) ? (ref[0] ?? null) : ref
}

export function productListShopOrderUnitIds(row: ProductListRow): string[] {
  return row.shop_order_unit_ids ?? []
}

export function shopOrderUnitLabels(
  unitIds: string[],
  shopOrderUnits: RefRow[],
): string[] {
  const byId = new Map(shopOrderUnits.map(u => [u.id, u.label]))
  return unitIds.map(id => byId.get(id) ?? id)
}

/** Valeur textuelle affichée (lecture seule ou draft initial). */
export function productListCellDisplayValue(row: ProductListRow, key: ProductListColumnKey): string {
  switch (key) {
    case 'code':
      return row.code
    case 'name':
      return row.name
    case 'name_ar':
      return row.name_ar ?? ''
    case 'sales_name':
      return row.sales_name ?? productSalesNameFr(row)
    case 'sales_name_ar':
      return row.sales_name_ar ?? row.name_ar ?? ''
    case 'price':
      return String(row.price)
    case 'cost_purchase':
      return row.cost_purchase != null ? String(row.cost_purchase) : ''
    case 'cost_manufacturing':
      return row.cost_manufacturing != null ? String(row.cost_manufacturing) : ''
    case 'cost_packaging':
      return row.cost_packaging != null ? String(row.cost_packaging) : ''
    case 'margin':
      return row.margin != null ? String(row.margin) : ''
    case 'sales_unit_id':
      return refLabel(row.ref_sales_unit)
    case 'order_unit_id':
      return refLabel(row.ref_order_unit)
    case 'purchase_unit_id':
      return refLabel(row.ref_purchase_unit)
    case 'category_id':
      return refLabel(row.ref_category)
    case 'subcategory_id':
      return refLabel(row.ref_subcategory)
    case 'supplier_id':
      return refLabel(row.ref_supplier)
    case 'vendeur_id':
      return normalizeVendeurRef(row.ref_supplier_vendeur)?.label ?? '—'
    case 'shop_order_units': {
      const ids = productListShopOrderUnitIds(row)
      return ids.length > 0 ? ids.join(',') : ''
    }
    case 'shop_favorite_unit_id':
      if (row.shop_favorite_unit_id == null) {
        return row.shop_allow_sales_unit !== false ? 'UdV' : '—'
      }
      return refLabel(row.ref_shop_order_unit)
    case 'emballage_id':
      return row.ref_emballage?.label ?? '—'
    case 'etiquette_id':
      return row.ref_etiquette?.label ?? '—'
    case 'piece_weight_kg':
      return row.piece_weight_kg != null ? String(row.piece_weight_kg) : ''
    case 'active':
    case 'visible_vitrine':
    case 'allow_unit_in_commande':
    case 'shop_allow_sales_unit':
      return String(row[key])
    case 'image_path':
      return row.image_path ?? ''
    case 'fiche':
      return ''
    default:
      return ''
  }
}

/** Valeur brute (id / bool / number) pour tri et commit select. */
export function productListCellRawValue(row: ProductListRow, key: ProductListColumnKey): string | number | boolean | null {
  const def = PRODUCT_LIST_COLUMN_BY_KEY[key]
  if (!def.dbField) {
    if (key === 'sales_name') return productSalesNameFr(row)
    return null
  }
  const v = row[def.dbField]
  if (v === undefined) return null
  return v as string | number | boolean | null
}

export function compareProductListRows(
  a: ProductListRow,
  b: ProductListRow,
  key: ProductListColumnKey,
  dir: 'asc' | 'desc',
): number {
  const m = dir === 'asc' ? 1 : -1
  if (key === 'code') return (codeToNum(a.code) - codeToNum(b.code)) * m
  if (key === 'sales_name') {
    return productSalesNameFr(a).localeCompare(productSalesNameFr(b), 'fr', { sensitivity: 'base' }) * m
  }
  if (key === 'shop_order_units') {
    const av = productListShopOrderUnitIds(a).slice().sort().join(',')
    const bv = productListShopOrderUnitIds(b).slice().sort().join(',')
    return av.localeCompare(bv, 'fr', { sensitivity: 'base' }) * m
  }
  const def = PRODUCT_LIST_COLUMN_BY_KEY[key]
  if (def.cellKind === 'number') {
    const av = Number(productListCellRawValue(a, key) ?? NaN)
    const bv = Number(productListCellRawValue(b, key) ?? NaN)
    const aOk = Number.isFinite(av)
    const bOk = Number.isFinite(bv)
    if (!aOk && !bOk) return 0
    if (!aOk) return 1 * m
    if (!bOk) return -1 * m
    return (av - bv) * m
  }
  if (def.cellKind === 'switch') {
    const av = Boolean(productListCellRawValue(a, key))
    const bv = Boolean(productListCellRawValue(b, key))
    return (Number(av) - Number(bv)) * m
  }
  if (def.cellKind === 'select') {
    return productListCellDisplayValue(a, key).localeCompare(productListCellDisplayValue(b, key), 'fr', {
      sensitivity: 'base',
    }) * m
  }
  const av = productListCellDisplayValue(a, key)
  const bv = productListCellDisplayValue(b, key)
  return av.localeCompare(bv, 'fr', { sensitivity: 'base' }) * m
}

export function productListColumnsByGroup(): Array<{ group: ProductListColumnGroup; columns: ProductListColumnDef[] }> {
  const groups = Object.keys(PRODUCT_LIST_COLUMN_GROUP_LABELS) as ProductListColumnGroup[]
  return groups.map(group => ({
    group,
    columns: PRODUCT_LIST_COLUMNS.filter(c => c.group === group && c.key !== 'fiche'),
  }))
}
