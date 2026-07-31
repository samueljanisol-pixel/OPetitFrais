import type { SupabaseClient } from '@supabase/supabase-js'
import {
  PRODUCT_LIST_COLUMN_BY_KEY,
  productListCellDisplayValue,
  productListShopOrderUnitIds,
  type ProductListFieldKey,
  type ProductListRefs,
  type ProductListRow,
} from '@/lib/products/product-list-columns'
import {
  insertProductPriceHistoryRow,
  pricingSnapshotChanged,
  type ProductPricingSnapshot,
} from '@/lib/products/priceHistory'
import { syncProductSuppliers } from '@/lib/products/product-supplier'
import { syncProductShopOrderUnits } from '@/lib/products/product-shop-order-unit'
import type { RefRow, RefSubcategoryRow, RefVendeurRow } from '@/lib/products/types'

const PRICING_FIELDS: ProductListFieldKey[] = [
  'price',
  'cost_purchase',
  'cost_manufacturing',
  'cost_packaging',
  'margin',
]

export function parseProductListNumberInput(raw: string): number | null {
  const s = raw.replace(/\s/g, '').replace(',', '.')
  if (s === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

export function numbersEqual(a: number | null | undefined, b: number | null | undefined): boolean {
  const av = a ?? null
  const bv = b ?? null
  if (av == null && bv == null) return true
  if (av == null || bv == null) return false
  return Math.abs(av - bv) <= 0.005
}

function pricingSnapshotFromRow(row: ProductListRow): ProductPricingSnapshot {
  return {
    price: row.price,
    cost_purchase: row.cost_purchase ?? null,
    cost_manufacturing: row.cost_manufacturing ?? null,
    cost_packaging: row.cost_packaging ?? null,
    margin: row.margin ?? null,
  }
}

function refRowById(rows: RefRow[], id: string | null | undefined): RefRow | null {
  if (!id) return null
  return rows.find(r => r.id === id) ?? null
}

function subcatRowById(rows: RefSubcategoryRow[], id: string | null | undefined): RefSubcategoryRow | null {
  if (!id) return null
  return rows.find(r => r.id === id) ?? null
}

function vendeurRowById(rows: RefVendeurRow[], id: string | null | undefined): RefVendeurRow | null {
  if (!id) return null
  return rows.find(r => r.id === id) ?? null
}

function emballageRowById(
  rows: ProductListRefs['emballages'],
  id: string | null | undefined,
): ProductListRefs['emballages'][number] | null {
  if (!id) return null
  return rows.find(r => r.id === id) ?? null
}

function etiquetteRowById(
  rows: ProductListRefs['etiquettes'],
  id: string | null | undefined,
): ProductListRefs['etiquettes'][number] | null {
  if (!id) return null
  return rows.find(r => r.id === id) ?? null
}

export function normalizeFieldValueForCommit(
  field: ProductListFieldKey,
  raw: unknown,
): { value: unknown; error?: string } {
  const def = PRODUCT_LIST_COLUMN_BY_KEY[field]
  if (def.cellKind === 'text') {
    const s = typeof raw === 'string' ? raw.trim() : String(raw ?? '').trim()
    if (field === 'name' && !s) return { value: null, error: 'Le nom logistique est obligatoire.' }
    if (field === 'sales_name' || field === 'name_ar' || field === 'sales_name_ar') {
      return { value: s.length > 0 ? s : null }
    }
    return { value: s }
  }
  if (def.cellKind === 'number') {
    if (raw === '' || raw == null) {
      if (field === 'price') return { value: null, error: 'Le prix est obligatoire.' }
      return { value: null }
    }
    const n = typeof raw === 'number' ? raw : parseProductListNumberInput(String(raw))
    if (n == null) return { value: null, error: 'Nombre invalide.' }
    if (field === 'price' && n < 0) return { value: null, error: 'Le prix doit être ≥ 0.' }
    if ((field === 'cost_purchase' || field === 'cost_manufacturing' || field === 'cost_packaging' || field === 'margin') && n < 0) {
      return { value: null, error: 'La valeur doit être ≥ 0.' }
    }
    if (field === 'piece_weight_kg' && !(n > 0)) {
      return { value: null, error: 'Le poids doit être > 0.' }
    }
    return { value: n }
  }
  if (def.cellKind === 'switch') {
    return { value: Boolean(raw) }
  }
  if (def.cellKind === 'select') {
    if (raw === '' || raw == null) {
      if (field === 'sales_unit_id' || field === 'category_id' || field === 'supplier_id') {
        return { value: null, error: 'Une valeur est obligatoire.' }
      }
      return { value: null }
    }
    const id = String(raw)
    return { value: id }
  }
  return { value: raw }
}

export function fieldValueEqualsRow(row: ProductListRow, field: ProductListFieldKey, value: unknown): boolean {
  const def = PRODUCT_LIST_COLUMN_BY_KEY[field]
  if (!def.dbField) return true
  const current = row[def.dbField]
  if (def.cellKind === 'number') {
    const next = value as number | null
    if (field === 'price') return numbersEqual(current as number, next ?? NaN)
    return numbersEqual(current as number | null, next)
  }
  if (def.cellKind === 'switch') {
    return Boolean(current) === Boolean(value)
  }
  if (def.cellKind === 'text') {
    const cur = current == null ? '' : String(current)
    const nxt = value == null ? '' : String(value)
    return cur === nxt
  }
  if (def.cellKind === 'select') {
    const cur = current == null || current === '' ? null : String(current)
    const nxt = value == null || value === '' ? null : String(value)
    return cur === nxt
  }
  return current === value
}

function applySideEffectsToPatch(
  row: ProductListRow,
  field: ProductListFieldKey,
  patch: Record<string, unknown>,
  refs: ProductListRefs,
): string | null {
  if (field === 'category_id' && typeof patch.category_id === 'string') {
    const subId = row.subcategory_id
    if (subId) {
      const ok = refs.subcategories.some(sc => sc.id === subId && sc.category_id === patch.category_id)
      if (!ok) patch.subcategory_id = null
    }
  }
  if (field === 'supplier_id' && typeof patch.supplier_id === 'string') {
    const vendeurId = (patch.vendeur_id as string | undefined) ?? row.vendeur_id ?? null
    if (vendeurId) {
      const vendeur = vendeurRowById(refs.vendeurs, vendeurId)
      if (!vendeur || vendeur.supplier_id !== patch.supplier_id) {
        patch.vendeur_id = null
      }
    }
  }
  if (field === 'vendeur_id' && patch.vendeur_id != null) {
    const vendeur = vendeurRowById(refs.vendeurs, String(patch.vendeur_id))
    const supplierId = row.supplier_id
    if (!vendeur || vendeur.supplier_id !== supplierId) {
      return 'Le vendeur doit appartenir au fournisseur du produit.'
    }
  }
  if (field === 'subcategory_id' && patch.subcategory_id != null) {
    const sub = subcatRowById(refs.subcategories, String(patch.subcategory_id))
    if (!sub || sub.category_id !== row.category_id) {
      return 'La sous-catégorie doit appartenir à la catégorie du produit.'
    }
  }
  if (field === 'shop_favorite_unit_id' && patch.shop_favorite_unit_id != null) {
    const favId = String(patch.shop_favorite_unit_id)
    const checked = productListShopOrderUnitIds(row)
    if (!checked.includes(favId)) {
      return 'Le favori doit être une unité vitrine cochée.'
    }
  }
  if (field === 'shop_favorite_unit_id' && (patch.shop_favorite_unit_id == null || patch.shop_favorite_unit_id === '')) {
    const allowUdv = row.shop_allow_sales_unit !== false
    const checked = productListShopOrderUnitIds(row)
    if (!allowUdv && checked.length === 0) {
      return 'Choisissez au moins l’UdV boutique ou une unité vitrine.'
    }
  }
  return null
}

function enrichRowFromPatch(row: ProductListRow, patch: Record<string, unknown>, refs: ProductListRefs): ProductListRow {
  const next: ProductListRow = { ...row, ...(patch as Partial<ProductListRow>) }
  if ('sales_unit_id' in patch) next.ref_sales_unit = refRowById(refs.salesUnits, patch.sales_unit_id as string)
  if ('order_unit_id' in patch) next.ref_order_unit = refRowById(refs.orderUnits, patch.order_unit_id as string | null)
  if ('purchase_unit_id' in patch) next.ref_purchase_unit = refRowById(refs.purchaseUnits, patch.purchase_unit_id as string | null)
  if ('category_id' in patch) next.ref_category = refRowById(refs.categories, patch.category_id as string)
  if ('subcategory_id' in patch) next.ref_subcategory = subcatRowById(refs.subcategories, patch.subcategory_id as string | null)
  if ('supplier_id' in patch) next.ref_supplier = refRowById(refs.suppliers, patch.supplier_id as string)
  if ('vendeur_id' in patch) next.ref_supplier_vendeur = vendeurRowById(refs.vendeurs, patch.vendeur_id as string | null)
  if ('shop_favorite_unit_id' in patch) {
    next.ref_shop_order_unit = refRowById(refs.shopOrderUnits, patch.shop_favorite_unit_id as string | null)
  }
  if ('emballage_id' in patch) next.ref_emballage = emballageRowById(refs.emballages, patch.emballage_id as string | null)
  if ('etiquette_id' in patch) next.ref_etiquette = etiquetteRowById(refs.etiquettes, patch.etiquette_id as string | null)
  return next
}

async function maybeInsertPriceHistory(
  supabase: SupabaseClient,
  prev: ProductListRow,
  next: ProductListRow,
): Promise<string | null> {
  const before = pricingSnapshotFromRow(prev)
  const after = pricingSnapshotFromRow(next)
  if (!pricingSnapshotChanged(before, after)) return null
  const { error } = await insertProductPriceHistoryRow(supabase, {
    product_id: next.id,
    ...after,
  })
  return error?.message ?? null
}

export type CommitProductFieldResult =
  | { ok: true; row: ProductListRow }
  | { ok: false; error: string }

export async function commitProductField(
  supabase: SupabaseClient,
  args: {
    row: ProductListRow
    field: ProductListFieldKey
    rawValue: unknown
    refs: ProductListRefs
  },
): Promise<CommitProductFieldResult> {
  const { row, field, rawValue, refs } = args
  const normalized = normalizeFieldValueForCommit(field, rawValue)
  if (normalized.error) return { ok: false, error: normalized.error }
  if (fieldValueEqualsRow(row, field, normalized.value)) {
    return { ok: true, row }
  }

  const def = PRODUCT_LIST_COLUMN_BY_KEY[field]
  if (!def.dbField) return { ok: false, error: 'Champ non modifiable.' }

  const patch: Record<string, unknown> = { [def.dbField]: normalized.value }
  const sideErr = applySideEffectsToPatch(row, field, patch, refs)
  if (sideErr) return { ok: false, error: sideErr }

  if (field === 'supplier_id' && typeof patch.supplier_id === 'string') {
    try {
      const primary = await syncProductSuppliers(supabase, row.id, [patch.supplier_id], refs.suppliers)
      if (!primary) return { ok: false, error: 'Fournisseur invalide.' }
      patch.supplier_id = primary
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Erreur fournisseur.' }
    }
  }

  const { error } = await supabase.from('product').update(patch as never).eq('id', row.id)
  if (error) return { ok: false, error: error.message }

  const updated = enrichRowFromPatch(row, patch, refs)

  if (PRICING_FIELDS.includes(field)) {
    const histErr = await maybeInsertPriceHistory(supabase, row, updated)
    if (histErr) return { ok: false, error: histErr }
  }

  return { ok: true, row: updated }
}

function shopOrderUnitIdsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const sa = [...a].sort()
  const sb = [...b].sort()
  return sa.every((id, i) => id === sb[i])
}

export async function commitProductShopOrderUnits(
  supabase: SupabaseClient,
  args: {
    row: ProductListRow
    unitIds: string[]
    refs: ProductListRefs
  },
): Promise<CommitProductFieldResult> {
  const { row, unitIds, refs } = args
  const unique = [...new Set(unitIds.filter(Boolean))]
  const current = productListShopOrderUnitIds(row)
  if (shopOrderUnitIdsEqual(current, unique)) {
    return { ok: true, row }
  }

  try {
    await syncProductShopOrderUnits(supabase, row.id, unique)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur unités boutique.' }
  }

  const patch: Record<string, unknown> = { shop_order_unit_ids: unique }
  const allowUdv = row.shop_allow_sales_unit !== false
  if (row.shop_favorite_unit_id && !unique.includes(row.shop_favorite_unit_id)) {
    patch.shop_favorite_unit_id = allowUdv ? null : (unique[0] ?? null)
    const { error } = await supabase
      .from('product')
      .update({ shop_favorite_unit_id: patch.shop_favorite_unit_id as string | null } as never)
      .eq('id', row.id)
    if (error) return { ok: false, error: error.message }
  }

  const updated = enrichRowFromPatch(row, patch, refs)
  return { ok: true, row: updated }
}

export type CommitProductFieldBulkResult =
  | { ok: true; rows: ProductListRow[] }
  | { ok: false; error: string }

export async function commitProductFieldBulk(
  supabase: SupabaseClient,
  args: {
    rows: ProductListRow[]
    field: ProductListFieldKey
    rawValue: unknown
    refs: ProductListRefs
  },
): Promise<CommitProductFieldBulkResult> {
  const { rows, field, rawValue, refs } = args
  if (rows.length === 0) return { ok: true, rows: [] }

  const normalized = normalizeFieldValueForCommit(field, rawValue)
  if (normalized.error) return { ok: false, error: normalized.error }

  const def = PRODUCT_LIST_COLUMN_BY_KEY[field]
  if (!def.dbField) return { ok: false, error: 'Champ non modifiable.' }

  const updatedRows: ProductListRow[] = []
  const idsToUpdate: string[] = []

  for (const row of rows) {
    if (fieldValueEqualsRow(row, field, normalized.value)) {
      updatedRows.push(row)
      continue
    }
    const patch: Record<string, unknown> = { [def.dbField]: normalized.value }
    const sideErr = applySideEffectsToPatch(row, field, patch, refs)
    if (sideErr) return { ok: false, error: sideErr }
    idsToUpdate.push(row.id)
    updatedRows.push(enrichRowFromPatch(row, patch, refs))
  }

  if (idsToUpdate.length === 0) return { ok: true, rows: updatedRows }

  const patch: Record<string, unknown> = { [def.dbField]: normalized.value }

  if (field === 'supplier_id' && typeof normalized.value === 'string') {
    for (const id of idsToUpdate) {
      try {
        await syncProductSuppliers(supabase, id, [normalized.value], refs.suppliers)
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : 'Erreur fournisseur.' }
      }
    }
  }

  if (field === 'category_id' && typeof normalized.value === 'string') {
    const incompatible = rows.filter(
      r =>
        idsToUpdate.includes(r.id) &&
        r.subcategory_id &&
        !refs.subcategories.some(sc => sc.id === r.subcategory_id && sc.category_id === normalized.value),
    )
    if (incompatible.length > 0) {
      const { error: subErr } = await supabase
        .from('product')
        .update({ subcategory_id: null } as never)
        .in(
          'id',
          incompatible.map(r => r.id),
        )
      if (subErr) return { ok: false, error: subErr.message }
    }
  }

  if (field === 'supplier_id' && typeof normalized.value === 'string') {
    const invalidVendeurIds = rows
      .filter(r => idsToUpdate.includes(r.id) && r.vendeur_id)
      .filter(r => {
        const v = vendeurRowById(refs.vendeurs, r.vendeur_id)
        return !v || v.supplier_id !== normalized.value
      })
      .map(r => r.id)
    if (invalidVendeurIds.length > 0) {
      const { error: vErr } = await supabase
        .from('product')
        .update({ vendeur_id: null } as never)
        .in('id', invalidVendeurIds)
      if (vErr) return { ok: false, error: vErr.message }
    }
  }

  const { error } = await supabase.from('product').update(patch as never).in('id', idsToUpdate)
  if (error) return { ok: false, error: error.message }

  if (PRICING_FIELDS.includes(field)) {
    for (const prev of rows) {
      if (!idsToUpdate.includes(prev.id)) continue
      const next = updatedRows.find(r => r.id === prev.id)
      if (!next) continue
      const histErr = await maybeInsertPriceHistory(supabase, prev, next)
      if (histErr) return { ok: false, error: histErr }
    }
  }

  const byId = new Map(updatedRows.map(r => [r.id, r]))
  return {
    ok: true,
    rows: rows.map(r => byId.get(r.id) ?? r),
  }
}

export function isDraftDirty(row: ProductListRow, field: ProductListFieldKey, draft: string | undefined): boolean {
  if (draft === undefined) return false
  const def = PRODUCT_LIST_COLUMN_BY_KEY[field]
  if (def.cellKind === 'number') {
    const n = parseProductListNumberInput(draft)
    if (n == null && draft.trim() !== '') return true
    if (field === 'price' && (n == null || n < 0)) return true
    const current = row[def.dbField!]
    if (field === 'price') return !numbersEqual(current as number, n ?? NaN)
    return !numbersEqual(current as number | null, n)
  }
  if (def.cellKind === 'text') {
    const normalized = normalizeFieldValueForCommit(field, draft)
    return !fieldValueEqualsRow(row, field, normalized.value)
  }
  return false
}

export function displayValueForDraft(row: ProductListRow, field: ProductListFieldKey, draft?: string): string {
  if (draft !== undefined) return draft
  return productListCellDisplayValue(row, field)
}
