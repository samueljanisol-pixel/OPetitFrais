import {
  ALL_PRODUCT_LIST_COLUMN_KEYS,
  DEFAULT_EDITABLE_PRODUCT_LIST_COLUMNS,
  DEFAULT_VISIBLE_PRODUCT_LIST_COLUMNS,
  FIXED_PRODUCT_LIST_COLUMNS,
  PRODUCT_LIST_COLUMN_BY_KEY,
  type ProductListColumnKey,
} from '@/lib/products/product-list-columns'

export const PRODUCT_LIST_COLUMNS_STORAGE_KEY = 'produits.list.columns'

export type ProductListColumnPreference = {
  visible: ProductListColumnKey[]
  order: ProductListColumnKey[]
  /** Colonnes modifiables inline (sous-ensemble des colonnes éditables du registre). */
  editable: ProductListColumnKey[]
}

function isColumnKey(value: unknown): value is ProductListColumnKey {
  return typeof value === 'string' && ALL_PRODUCT_LIST_COLUMN_KEYS.includes(value as ProductListColumnKey)
}

function filterRegistryEditable(keys: ProductListColumnKey[]): ProductListColumnKey[] {
  return keys.filter(key => PRODUCT_LIST_COLUMN_BY_KEY[key].editable)
}

export function normalizeProductListColumnPreference(raw: unknown): ProductListColumnPreference {
  const obj = raw != null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const visibleRaw = obj.visible
  const orderRaw = obj.order
  const editableRaw = obj.editable

  const visibleFromStorage = Array.isArray(visibleRaw)
    ? visibleRaw.filter(isColumnKey)
    : [...DEFAULT_VISIBLE_PRODUCT_LIST_COLUMNS]

  const visibleSet = new Set<ProductListColumnKey>(visibleFromStorage)
  for (const fixed of FIXED_PRODUCT_LIST_COLUMNS) {
    visibleSet.add(fixed)
  }

  const orderFromStorage = Array.isArray(orderRaw) ? orderRaw.filter(isColumnKey) : []
  const order: ProductListColumnKey[] = []
  for (const key of orderFromStorage) {
    if (!order.includes(key)) order.push(key)
  }
  for (const key of visibleSet) {
    if (!order.includes(key)) order.push(key)
  }
  for (const key of ALL_PRODUCT_LIST_COLUMN_KEYS) {
    if (!order.includes(key)) order.push(key)
  }

  const visible = order.filter(key => visibleSet.has(key))

  const editableFromStorage = Array.isArray(editableRaw)
    ? filterRegistryEditable(editableRaw.filter(isColumnKey))
    : [...DEFAULT_EDITABLE_PRODUCT_LIST_COLUMNS]
  const editableSet = new Set(editableFromStorage)
  const editable = filterRegistryEditable(
    ALL_PRODUCT_LIST_COLUMN_KEYS.filter(key => editableSet.has(key)),
  )

  if (visible.filter(k => k !== 'fiche').length === 0) {
    return defaultProductListColumnPreference()
  }

  return { visible, order, editable }
}

export function readProductListColumnPreference(): ProductListColumnPreference {
  if (typeof window === 'undefined') {
    return defaultProductListColumnPreference()
  }
  try {
    const raw = localStorage.getItem(PRODUCT_LIST_COLUMNS_STORAGE_KEY)
    if (raw == null) {
      return defaultProductListColumnPreference()
    }
    return normalizeProductListColumnPreference(JSON.parse(raw))
  } catch {
    return defaultProductListColumnPreference()
  }
}

export function writeProductListColumnPreference(pref: ProductListColumnPreference): void {
  if (typeof window === 'undefined') return
  const normalized = normalizeProductListColumnPreference(pref)
  localStorage.setItem(PRODUCT_LIST_COLUMNS_STORAGE_KEY, JSON.stringify(normalized))
}

export function defaultProductListColumnPreference(): ProductListColumnPreference {
  return {
    visible: [...DEFAULT_VISIBLE_PRODUCT_LIST_COLUMNS],
    order: [...DEFAULT_VISIBLE_PRODUCT_LIST_COLUMNS],
    editable: [...DEFAULT_EDITABLE_PRODUCT_LIST_COLUMNS],
  }
}

/** Colonnes visibles dans l’ordre d’affichage. */
export function resolveVisibleProductListColumns(pref: ProductListColumnPreference): ProductListColumnKey[] {
  const normalized = normalizeProductListColumnPreference(pref)
  return normalized.order.filter(key => normalized.visible.includes(key))
}

/** Colonne modifiable inline selon la préférence utilisateur et le registre. */
export function isProductListColumnEditable(
  pref: ProductListColumnPreference,
  key: ProductListColumnKey,
): boolean {
  if (!PRODUCT_LIST_COLUMN_BY_KEY[key].editable) return false
  const normalized = normalizeProductListColumnPreference(pref)
  return normalized.editable.includes(key)
}
