import type { SupabaseClient } from '@supabase/supabase-js'
import { insertProductPriceHistoryRow, pricingSnapshotChanged, type ProductPricingSnapshot } from '@/lib/products/priceHistory'
import type { RefRow, RefSubcategoryRow, RefVendeurRow } from '@/lib/products/types'
import { syncProductSuppliers } from '@/lib/products/product-supplier'
import type { SheetRowParsed } from './mapSheetRow'
import {
  ALL_SHEET_IMPORT_FIELDS,
  DEFAULT_SHEET_IMPORT_FIELDS,
  hasAnyImportField,
  type SheetImportFields,
} from './sheet-import-fields'

type Refs = {
  byUnitLabel: Map<string, string>
  byUnitCode: Map<string, string>
  byOrderUnitLabel: Map<string, string>
  byOrderUnitCode: Map<string, string>
  byPurchaseUnitLabel: Map<string, string>
  byPurchaseUnitCode: Map<string, string>
  byCatLabel: Map<string, string>
  byCatCode: Map<string, string>
  bySupLabel: Map<string, string>
  bySupCode: Map<string, string>
  byVendeurKey: Map<string, string>
  bySubcatKey: Map<string, string>
}

const norm = (s: string) => s.trim().toLowerCase()

function subcatKey(categoryId: string, label: string): string {
  return `${categoryId}\0${norm(label)}`
}

function vendeurKey(supplierId: string, label: string): string {
  return `${supplierId}\0${norm(label)}`
}

function buildRefs(
  units: RefRow[],
  orderUnits: RefRow[],
  purchaseUnits: RefRow[],
  cats: RefRow[],
  sups: RefRow[],
  vendeurs: RefVendeurRow[],
  subcats: RefSubcategoryRow[],
): Refs {
  const byUnitLabel = new Map<string, string>()
  const byUnitCode = new Map<string, string>()
  for (const u of units) {
    byUnitLabel.set(norm(u.label), u.id)
    byUnitCode.set(norm(u.code), u.id)
  }
  const byOrderUnitLabel = new Map<string, string>()
  const byOrderUnitCode = new Map<string, string>()
  for (const u of orderUnits) {
    byOrderUnitLabel.set(norm(u.label), u.id)
    byOrderUnitCode.set(norm(u.code), u.id)
  }
  const byPurchaseUnitLabel = new Map<string, string>()
  const byPurchaseUnitCode = new Map<string, string>()
  for (const u of purchaseUnits) {
    byPurchaseUnitLabel.set(norm(u.label), u.id)
    byPurchaseUnitCode.set(norm(u.code), u.id)
  }
  const byCatLabel = new Map<string, string>()
  const byCatCode = new Map<string, string>()
  for (const c of cats) {
    byCatLabel.set(norm(c.label), c.id)
    byCatCode.set(norm(c.code), c.id)
  }
  const bySupLabel = new Map<string, string>()
  const bySupCode = new Map<string, string>()
  for (const s of sups) {
    bySupLabel.set(norm(s.label), s.id)
    bySupCode.set(norm(s.code), s.id)
  }
  const byVendeurKey = new Map<string, string>()
  for (const v of vendeurs) {
    byVendeurKey.set(vendeurKey(v.supplier_id, v.label), v.id)
  }
  const bySubcatKey = new Map<string, string>()
  for (const sc of subcats) {
    bySubcatKey.set(subcatKey(sc.category_id, sc.label), sc.id)
  }
  return { byUnitLabel, byUnitCode, byOrderUnitLabel, byOrderUnitCode, byPurchaseUnitLabel, byPurchaseUnitCode, byCatLabel, byCatCode, bySupLabel, bySupCode, byVendeurKey, bySubcatKey }
}

function resolveId(maps: Map<string, string>[], raw: string): string | null {
  const n = norm(raw)
  for (const m of maps) {
    const id = m.get(n)
    if (id) return id
  }
  return null
}

const EXISTING_PRODUCT_SELECT =
  'id, code, name, price, margin, active, name_ar, sales_unit_id, order_unit_id, purchase_unit_id, category_id, subcategory_id, supplier_id, vendeur_id, cost_purchase, cost_manufacturing, cost_packaging'

const WRITE_CONCURRENCY = 25
const INSERT_CHUNK_SIZE = 50
const HISTORY_CHUNK_SIZE = 100
const REF_INSERT_CHUNK_SIZE = 50

type ExistingProduct = {
  id: string
  code: string
  name: string
  price: number
  margin: number | null
  active: boolean
  name_ar: string | null
  sales_unit_id: string
  order_unit_id: string | null
  purchase_unit_id: string | null
  category_id: string
  subcategory_id: string | null
  supplier_id: string
  vendeur_id: string | null
  cost_purchase: number | null
  cost_manufacturing: number | null
  cost_packaging: number | null
}

type VendeurNeed = { supplierId: string; label: string }
type SubcatNeed = { categoryId: string; label: string }

type PlannedUpdate = {
  row: SheetRowParsed
  productId: string
  filteredPatch: Record<string, unknown>
  historyRow: ({ product_id: string } & ProductPricingSnapshot) | null
}

type PlannedCreate = {
  row: SheetRowParsed
  insert: Record<string, unknown>
  historyRow: { product_id: string } & ProductPricingSnapshot
  supplierId: string | null
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return []
  const results = new Array<R>(items.length)
  let nextIndex = 0
  async function worker() {
    while (true) {
      const i = nextIndex
      nextIndex += 1
      if (i >= items.length) break
      results[i] = await fn(items[i]!, i)
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  )
  return results
}

function normalizeNullableText(value: unknown): string | null {
  if (value == null) return null
  const trimmed = String(value).trim()
  return trimmed.length > 0 ? trimmed : null
}

function normalizeNullableUuid(value: unknown): string | null {
  if (value == null) return null
  const trimmed = String(value).trim()
  return trimmed.length > 0 ? trimmed : null
}

function normalizeNumber(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function patchValueEqualsExisting(field: string, existing: ExistingProduct, next: unknown): boolean {
  switch (field) {
    case 'name':
    case 'code':
      return normalizeNullableText(existing[field as keyof ExistingProduct]) === normalizeNullableText(next)
    case 'name_ar':
      return normalizeNullableText(existing.name_ar) === normalizeNullableText(next)
    case 'price':
      return normalizeNumber(existing.price) === normalizeNumber(next)
    case 'margin':
      return normalizeNumber(existing.margin) === normalizeNumber(next)
    case 'active':
      return Boolean(existing.active) === Boolean(next)
    case 'sales_unit_id':
    case 'category_id':
    case 'supplier_id':
      return String(existing[field as keyof ExistingProduct] ?? '') === String(next ?? '')
    case 'order_unit_id':
    case 'purchase_unit_id':
    case 'subcategory_id':
    case 'vendeur_id':
      return normalizeNullableUuid(existing[field as keyof ExistingProduct]) === normalizeNullableUuid(next)
    default:
      return existing[field as keyof ExistingProduct] === next
  }
}

/** Ne conserve que les champs dont la valeur diffère du produit en base. */
function filterPatchToChanged(
  patch: Record<string, unknown>,
  existing: ExistingProduct,
): Record<string, unknown> {
  const filtered: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(patch)) {
    if (!patchValueEqualsExisting(key, existing, value)) {
      filtered[key] = value
    }
  }
  return filtered
}

function pricingFromRow(row: Record<string, unknown>): ProductPricingSnapshot {
  return {
    price: Number(row.price) || 0,
    cost_purchase: (row.cost_purchase as number | null) ?? null,
    cost_manufacturing: (row.cost_manufacturing as number | null) ?? null,
    cost_packaging: (row.cost_packaging as number | null) ?? null,
    margin: (row.margin as number | null) ?? null,
  }
}

export type SheetImportResult = {
  created: number
  updated: number
  skipped: number
  errors: string[]
}

export type SheetImportProgress = {
  phase: 'prepare' | 'rows'
  current: number
  total: number
}

export type SheetImportProgressCallback = (progress: SheetImportProgress) => void

function buildProductPatch(
  row: SheetRowParsed,
  fields: SheetImportFields,
  refs: Refs,
): { patch: Record<string, unknown>; errors: string[] } {
  const errors: string[] = []
  const patch: Record<string, unknown> = {}

  if (fields.nom) {
    patch.name = row.nom
  }
  if (fields.prix) {
    patch.price = row.prix
  }
  if (fields.marge) {
    patch.margin = row.marge
  }
  if (fields.actif) {
    patch.active = row.actif
  }
  if (fields.arabe) {
    patch.name_ar = row.arabe
  }
  if (fields.code && row.code.trim()) {
    patch.code = row.code.trim()
  }
  if (fields.udv) {
    const salesUnitId = resolveId([refs.byUnitLabel, refs.byUnitCode], row.udv)
    if (!salesUnitId) {
      errors.push(`« ${row.nom} » : UdV « ${row.udv} » introuvable en base.`)
    } else {
      patch.sales_unit_id = salesUnitId
    }
  }
  if (fields.udc) {
    if (!row.udc.trim()) {
      patch.order_unit_id = null
    } else {
      const orderUnitId = resolveId([refs.byOrderUnitLabel, refs.byOrderUnitCode], row.udc)
      if (!orderUnitId) {
        errors.push(`« ${row.nom} » : UdC « ${row.udc} » introuvable en base.`)
      } else {
        patch.order_unit_id = orderUnitId
      }
    }
  }
  if (fields.uda) {
    if (!row.uda.trim()) {
      patch.purchase_unit_id = null
    } else {
      const purchaseUnitId = resolveId([refs.byPurchaseUnitLabel, refs.byPurchaseUnitCode], row.uda)
      if (!purchaseUnitId) {
        errors.push(`« ${row.nom} » : UdA « ${row.uda} » introuvable en base.`)
      } else {
        patch.purchase_unit_id = purchaseUnitId
      }
    }
  }
  if (fields.categorie) {
    const categoryId = resolveId([refs.byCatLabel, refs.byCatCode], row.categorie)
    if (!categoryId) {
      errors.push(`« ${row.nom} » : catégorie « ${row.categorie} » introuvable.`)
    } else {
      patch.category_id = categoryId
    }
  }
  if (fields.fournisseur) {
    const supplierId = resolveId([refs.bySupLabel, refs.bySupCode], row.fournisseur)
    if (!supplierId) {
      errors.push(`« ${row.nom} » : fournisseur « ${row.fournisseur} » introuvable.`)
    } else {
      patch.supplier_id = supplierId
    }
  }

  return { patch, errors }
}

async function findOrCreateVendeur(
  supabase: SupabaseClient,
  supplierId: string,
  label: string,
  refs: Refs,
): Promise<string | { error: string }> {
  const trimmed = label.trim()
  const key = vendeurKey(supplierId, trimmed)
  const existing = refs.byVendeurKey.get(key)
  if (existing) return existing

  const { data, error } = await supabase
    .from('ref_supplier_vendeur')
    .insert({ supplier_id: supplierId, label: trimmed, sort_order: 0 } as never)
    .select('id, supplier_id, label')
    .single()
  if (error) {
    const { data: retry } = await supabase
      .from('ref_supplier_vendeur')
      .select('id, supplier_id, label')
      .eq('supplier_id', supplierId)
      .ilike('label', trimmed)
      .maybeSingle()
    if (retry) {
      const row = retry as RefVendeurRow
      refs.byVendeurKey.set(vendeurKey(row.supplier_id, row.label), row.id)
      return row.id
    }
    return { error: error.message }
  }
  const inserted = data as RefVendeurRow
  refs.byVendeurKey.set(vendeurKey(inserted.supplier_id, inserted.label), inserted.id)
  return inserted.id
}

function resolveCategoryIdForRowSync(
  productId: string | null,
  patch: Record<string, unknown>,
  row: SheetRowParsed,
  fields: SheetImportFields,
  refs: Refs,
  byId: Map<string, ExistingProduct>,
): string | null {
  const fromPatch = patch.category_id
  if (typeof fromPatch === 'string' && fromPatch.length > 0) return fromPatch
  if (fields.categorie) {
    return resolveId([refs.byCatLabel, refs.byCatCode], row.categorie)
  }
  if (productId) {
    return byId.get(productId)?.category_id ?? null
  }
  return resolveId([refs.byCatLabel, refs.byCatCode], row.categorie)
}

function applyMarchandToPatchSync(
  row: SheetRowParsed,
  fields: SheetImportFields,
  refs: Refs,
  patch: Record<string, unknown>,
  fallbackSupplierId: string | null,
): string[] {
  const errors: string[] = []
  if (!fields.marchand) return errors

  if (!row.marchand.trim()) {
    patch.vendeur_id = null
    return errors
  }

  const supplierId =
    (typeof patch.supplier_id === 'string' && patch.supplier_id.length > 0
      ? patch.supplier_id
      : null) ??
    fallbackSupplierId ??
    resolveId([refs.bySupLabel, refs.bySupCode], row.fournisseur)
  if (!supplierId) {
    errors.push(`« ${row.nom} » : marchand « ${row.marchand} » sans fournisseur valide.`)
    return errors
  }

  const vendeurId = refs.byVendeurKey.get(vendeurKey(supplierId, row.marchand.trim()))
  if (!vendeurId) {
    errors.push(`« ${row.nom} » : marchand « ${row.marchand} » introuvable en base.`)
    return errors
  }
  patch.vendeur_id = vendeurId
  return errors
}

function applySubcategoryToPatchSync(
  row: SheetRowParsed,
  fields: SheetImportFields,
  refs: Refs,
  patch: Record<string, unknown>,
  categoryId: string | null,
): string[] {
  const errors: string[] = []
  if (!fields.sousCategorie) return errors

  if (!row.sousCategorie.trim()) {
    patch.subcategory_id = null
    return errors
  }

  if (!categoryId) {
    errors.push(`« ${row.nom} » : sous-catégorie « ${row.sousCategorie} » sans catégorie connue.`)
    return errors
  }

  const subcategoryId = refs.bySubcatKey.get(subcatKey(categoryId, row.sousCategorie.trim()))
  if (!subcategoryId) {
    errors.push(`« ${row.nom} » : sous-catégorie « ${row.sousCategorie} » introuvable en base.`)
    return errors
  }
  patch.subcategory_id = subcategoryId
  return errors
}

function collectMarchandNeed(
  row: SheetRowParsed,
  fields: SheetImportFields,
  patch: Record<string, unknown>,
  fallbackSupplierId: string | null,
  refs: Refs,
  out: Map<string, VendeurNeed>,
): void {
  if (!fields.marchand || !row.marchand.trim()) return
  const supplierId =
    (typeof patch.supplier_id === 'string' && patch.supplier_id.length > 0
      ? patch.supplier_id
      : null) ??
    fallbackSupplierId ??
    resolveId([refs.bySupLabel, refs.bySupCode], row.fournisseur)
  if (!supplierId) return
  const label = row.marchand.trim()
  const key = vendeurKey(supplierId, label)
  if (!refs.byVendeurKey.has(key)) {
    out.set(key, { supplierId, label })
  }
}

function collectSubcatNeed(
  row: SheetRowParsed,
  fields: SheetImportFields,
  categoryId: string | null,
  refs: Refs,
  out: Map<string, SubcatNeed>,
): void {
  if (!fields.sousCategorie || !row.sousCategorie.trim() || !categoryId) return
  const label = row.sousCategorie.trim()
  const key = subcatKey(categoryId, label)
  if (!refs.bySubcatKey.has(key)) {
    out.set(key, { categoryId, label })
  }
}

async function ensureVendeurs(
  supabase: SupabaseClient,
  needs: Map<string, VendeurNeed>,
  refs: Refs,
): Promise<void> {
  const rows = [...needs.values()]
  if (rows.length === 0) return

  for (const batch of chunkArray(rows, REF_INSERT_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from('ref_supplier_vendeur')
      .insert(batch.map((v) => ({ supplier_id: v.supplierId, label: v.label, sort_order: 0 })) as never)
      .select('id, supplier_id, label')
    if (error) {
      await mapPool(batch, 10, async (v) => {
        await findOrCreateVendeur(supabase, v.supplierId, v.label, refs)
      })
      continue
    }
    for (const row of (data ?? []) as RefVendeurRow[]) {
      refs.byVendeurKey.set(vendeurKey(row.supplier_id, row.label), row.id)
    }
  }
}

async function ensureSubcategories(
  supabase: SupabaseClient,
  needs: Map<string, SubcatNeed>,
  refs: Refs,
): Promise<void> {
  const rows = [...needs.values()]
  if (rows.length === 0) return

  for (const batch of chunkArray(rows, REF_INSERT_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from('ref_subcategory')
      .insert(batch.map((s) => ({ category_id: s.categoryId, label: s.label })) as never)
      .select('id, category_id, label')
    if (error) {
      await mapPool(batch, 10, async (s) => {
        await findOrCreateSubcategory(supabase, s.categoryId, s.label, refs)
      })
      continue
    }
    for (const row of (data ?? []) as RefSubcategoryRow[]) {
      refs.bySubcatKey.set(subcatKey(row.category_id, row.label), row.id)
    }
  }
}

async function batchInsertPriceHistory(
  supabase: SupabaseClient,
  rows: Array<{ product_id: string } & ProductPricingSnapshot>,
  errors: string[],
  labelByProductId: Map<string, string>,
): Promise<void> {
  if (rows.length === 0) return
  for (const batch of chunkArray(rows, HISTORY_CHUNK_SIZE)) {
    const { error } = await supabase.from('product_price_history').insert(
      batch.map((row) => ({
        product_id: row.product_id,
        price: row.price,
        cost_purchase: row.cost_purchase,
        cost_manufacturing: row.cost_manufacturing,
        cost_packaging: row.cost_packaging,
        margin:
          row.margin != null && Number.isFinite(Number(row.margin)) ? Number(row.margin) : null,
      })) as never,
    )
    if (error) {
      for (const row of batch) {
        const { error: rowErr } = await insertProductPriceHistoryRow(supabase, row)
        if (rowErr) {
          errors.push(
            `Historique « ${labelByProductId.get(row.product_id) ?? row.product_id} » : ${rowErr.message}`,
          )
        }
      }
    }
  }
}

async function batchSyncProductSuppliers(
  supabase: SupabaseClient,
  links: Array<{ productId: string; supplierId: string }>,
  errors: string[],
  labelByProductId: Map<string, string>,
): Promise<void> {
  if (links.length === 0) return
  const productIds = [...new Set(links.map((l) => l.productId))]
  const { error: delErr } = await supabase.from('product_supplier').delete().in('product_id', productIds)
  if (delErr) {
    errors.push(`Fournisseurs (lot) : ${delErr.message}`)
    return
  }
  for (const batch of chunkArray(links, INSERT_CHUNK_SIZE)) {
    const { error: insErr } = await supabase.from('product_supplier').insert(
      batch.map(({ productId, supplierId }) => ({
        product_id: productId,
        supplier_id: supplierId,
      })) as never,
    )
    if (insErr) {
      for (const link of batch) {
        try {
          await syncProductSuppliers(supabase, link.productId, [link.supplierId], [])
        } catch (syncErr) {
          errors.push(
            `Fournisseurs « ${labelByProductId.get(link.productId) ?? link.productId} » : ${
              syncErr instanceof Error ? syncErr.message : String(syncErr)
            }`,
          )
        }
      }
    }
  }
}

async function findOrCreateSubcategory(
  supabase: SupabaseClient,
  categoryId: string,
  label: string,
  refs: Refs,
): Promise<string | { error: string }> {
  const trimmed = label.trim()
  const key = subcatKey(categoryId, trimmed)
  const existing = refs.bySubcatKey.get(key)
  if (existing) return existing

  const { data, error } = await supabase
    .from('ref_subcategory')
    .insert({ category_id: categoryId, label: trimmed } as never)
    .select('id, category_id, label')
    .single()
  if (error) return { error: error.message }
  const inserted = data as RefSubcategoryRow
  refs.bySubcatKey.set(subcatKey(inserted.category_id, inserted.label), inserted.id)
  return inserted.id
}

/**
 * N’applique que les champs cochés pour les produits existants, et uniquement si la valeur
 * diffère de celle en base. Les nouveaux produits sont toujours créés avec toutes les colonnes.
 * Correspondance par `code` produit, sinon par `nom` (insensible à la casse) si le code feuille est vide.
 */
export async function applySheetImport(
  supabase: SupabaseClient,
  parsed: SheetRowParsed[],
  fields: SheetImportFields = DEFAULT_SHEET_IMPORT_FIELDS,
  onProgress?: SheetImportProgressCallback,
): Promise<SheetImportResult> {
  onProgress?.({ phase: 'prepare', current: 0, total: parsed.length })
  const errors: string[] = []
  const updateExisting = hasAnyImportField(fields)
  const [{ data: units }, { data: orderUnits }, { data: purchaseUnits }, { data: cats }, { data: sups }, { data: vendeurs }, { data: subcats }, { data: products }] =
    await Promise.all([
      supabase.from('ref_sales_unit').select('*'),
      supabase.from('ref_order_unit').select('*'),
      supabase.from('ref_purchase_unit').select('*'),
      supabase.from('ref_category').select('*'),
      supabase.from('ref_supplier').select('*'),
      supabase.from('ref_supplier_vendeur').select('id, supplier_id, label, sort_order'),
      supabase.from('ref_subcategory').select('id, category_id, label, code, sort_order'),
      supabase.from('product').select(EXISTING_PRODUCT_SELECT),
    ])
  if (!units?.length || !cats?.length || !sups?.length) {
    return { created: 0, updated: 0, skipped: 0, errors: ['Référentiels (UdV / catégorie / fournisseur) introuvables.'] }
  }
  const refs = buildRefs(
    units as RefRow[],
    (orderUnits as RefRow[]) ?? [],
    (purchaseUnits as RefRow[]) ?? [],
    cats as RefRow[],
    sups as RefRow[],
    (vendeurs as RefVendeurRow[]) ?? [],
    (subcats as RefSubcategoryRow[]) ?? [],
  )
  const byCode = new Map<string, string>()
  const byName = new Map<string, string>()
  const byId = new Map<string, ExistingProduct>()
  for (const p of products ?? []) {
    const row = p as ExistingProduct
    byId.set(row.id, row)
    if (row.code) byCode.set(norm(row.code), row.id)
    if (row.name) byName.set(norm(row.name), row.id)
  }

  const vendeurNeeds = new Map<string, VendeurNeed>()
  const subcatNeeds = new Map<string, SubcatNeed>()
  type PendingUpdatePlan = {
    kind: 'pending-update'
    row: SheetRowParsed
    productId: string
    patch: Record<string, unknown>
    categoryId: string | null
    existing: ExistingProduct
  }
  type PendingCreatePlan = {
    kind: 'pending-create'
    row: SheetRowParsed
    fullPatch: Record<string, unknown>
    createCategoryId: string | null
  }
  type RowPlan =
    | { kind: 'skip' }
    | { kind: 'error'; messages: string[] }
    | PendingUpdatePlan
    | PendingCreatePlan

  const rowPlans: RowPlan[] = []

  for (let rowIndex = 0; rowIndex < parsed.length; rowIndex += 1) {
    const row = parsed[rowIndex]!
    if (rowIndex % 100 === 0) {
      onProgress?.({ phase: 'prepare', current: rowIndex, total: parsed.length })
    }

    const codeNorm = row.code ? norm(row.code) : ''
    const productId =
      (codeNorm && byCode.get(codeNorm)) || (!codeNorm && byName.get(norm(row.nom))) || null

    if (productId) {
      if (!updateExisting) {
        rowPlans.push({ kind: 'skip' })
        continue
      }
      const existing = byId.get(productId)
      if (!existing) {
        rowPlans.push({ kind: 'error', messages: [`« ${row.nom} » : produit introuvable en base.`] })
        continue
      }

      const { patch, errors: patchErrors } = buildProductPatch(row, fields, refs)
      if (patchErrors.length > 0) {
        rowPlans.push({ kind: 'error', messages: patchErrors })
        continue
      }

      const categoryId = resolveCategoryIdForRowSync(productId, patch, row, fields, refs, byId)
      collectSubcatNeed(row, fields, categoryId, refs, subcatNeeds)
      collectMarchandNeed(row, fields, patch, existing.supplier_id, refs, vendeurNeeds)

      rowPlans.push({ kind: 'pending-update', row, productId, patch, categoryId, existing })
      continue
    }

    const { patch: fullPatch, errors: createErrors } = buildProductPatch(row, ALL_SHEET_IMPORT_FIELDS, refs)
    if (createErrors.length > 0) {
      rowPlans.push({ kind: 'error', messages: createErrors })
      continue
    }
    const createCategoryId = resolveCategoryIdForRowSync(null, fullPatch, row, ALL_SHEET_IMPORT_FIELDS, refs, byId)
    collectSubcatNeed(row, ALL_SHEET_IMPORT_FIELDS, createCategoryId, refs, subcatNeeds)
    collectMarchandNeed(row, ALL_SHEET_IMPORT_FIELDS, fullPatch, null, refs, vendeurNeeds)
    rowPlans.push({ kind: 'pending-create', row, fullPatch, createCategoryId })
  }

  onProgress?.({ phase: 'prepare', current: parsed.length, total: parsed.length })
  await ensureVendeurs(supabase, vendeurNeeds, refs)
  await ensureSubcategories(supabase, subcatNeeds, refs)

  const plannedUpdates: PlannedUpdate[] = []
  const plannedCreates: PlannedCreate[] = []
  let skipped = 0

  for (const entry of rowPlans) {
    if (entry.kind === 'skip') {
      skipped += 1
      continue
    }
    if (entry.kind === 'error') {
      errors.push(...entry.messages)
      continue
    }
    if (entry.kind === 'pending-update') {
      const pending = entry
      const subErrors = applySubcategoryToPatchSync(
        pending.row,
        fields,
        refs,
        pending.patch,
        pending.categoryId,
      )
      if (subErrors.length > 0) {
        errors.push(...subErrors)
        continue
      }
      const marchandErrors = applyMarchandToPatchSync(
        pending.row,
        fields,
        refs,
        pending.patch,
        pending.existing.supplier_id,
      )
      if (marchandErrors.length > 0) {
        errors.push(...marchandErrors)
        continue
      }

      const filteredPatch = filterPatchToChanged(pending.patch, pending.existing)
      if (Object.keys(filteredPatch).length === 0) {
        skipped += 1
        continue
      }

      const merged = { ...pending.existing, ...filteredPatch } as ExistingProduct
      const before = pricingFromRow(pending.existing as unknown as Record<string, unknown>)
      const after = pricingFromRow(merged as unknown as Record<string, unknown>)
      const historyRow =
        ('price' in filteredPatch || 'margin' in filteredPatch) && pricingSnapshotChanged(before, after)
          ? { product_id: pending.productId, ...after }
          : null

      plannedUpdates.push({
        row: pending.row,
        productId: pending.productId,
        filteredPatch,
        historyRow,
      })
      continue
    }

    if (entry.kind !== 'pending-create') {
      continue
    }
    const pending = entry
    const subErrors = applySubcategoryToPatchSync(
      pending.row,
      ALL_SHEET_IMPORT_FIELDS,
      refs,
      pending.fullPatch,
      pending.createCategoryId,
    )
    if (subErrors.length > 0) {
      errors.push(...subErrors)
      continue
    }
    const marchandErrors = applyMarchandToPatchSync(
      pending.row,
      ALL_SHEET_IMPORT_FIELDS,
      refs,
      pending.fullPatch,
      null,
    )
    if (marchandErrors.length > 0) {
      errors.push(...marchandErrors)
      continue
    }

    const insert: Record<string, unknown> = {
      ...pending.fullPatch,
      cost_purchase: null,
      cost_manufacturing: null,
      cost_packaging: null,
      image_path: null,
    }
    if (!('margin' in insert)) {
      insert.margin = pending.row.marge
    }
    const supplierId = typeof insert.supplier_id === 'string' ? insert.supplier_id : null
    plannedCreates.push({
      row: pending.row,
      insert,
      historyRow: {
        product_id: '',
        price: pending.row.prix,
        cost_purchase: null,
        cost_manufacturing: null,
        cost_packaging: null,
        margin: pending.row.marge,
      },
      supplierId,
    })
  }

  const labelByProductId = new Map<string, string>()
  for (const [id, product] of byId) {
    labelByProductId.set(id, product.name)
  }

  let updated = 0
  const updateResults = await mapPool(plannedUpdates, WRITE_CONCURRENCY, async (plan, index) => {
    onProgress?.({ phase: 'rows', current: index + 1, total: plannedUpdates.length + plannedCreates.length })
    const { error } = await supabase
      .from('product')
      .update(plan.filteredPatch as never)
      .eq('id', plan.productId)
    if (error) {
      return { ok: false as const, message: `Mise à jour « ${plan.row.nom} » : ${error.message}` }
    }
    const existing = byId.get(plan.productId)
    if (existing) {
      byId.set(plan.productId, { ...existing, ...plan.filteredPatch } as ExistingProduct)
    }
    labelByProductId.set(plan.productId, plan.row.nom)
    return { ok: true as const, plan }
  })
  for (const result of updateResults) {
    if (!result.ok) {
      errors.push(result.message)
      continue
    }
    updated += 1
  }

  let created = 0
  const supplierLinks: Array<{ productId: string; supplierId: string }> = []
  const historyRows: Array<{ product_id: string } & ProductPricingSnapshot> = []

  for (const result of updateResults) {
    if (!result.ok) continue
    if ('supplier_id' in result.plan.filteredPatch && typeof result.plan.filteredPatch.supplier_id === 'string') {
      supplierLinks.push({
        productId: result.plan.productId,
        supplierId: result.plan.filteredPatch.supplier_id,
      })
    }
    if (result.plan.historyRow) {
      historyRows.push(result.plan.historyRow)
    }
  }

  let createProgress = plannedUpdates.length
  for (const batch of chunkArray(plannedCreates, INSERT_CHUNK_SIZE)) {
    createProgress += batch.length
    onProgress?.({
      phase: 'rows',
      current: Math.min(createProgress, plannedUpdates.length + plannedCreates.length),
      total: plannedUpdates.length + plannedCreates.length,
    })

    const { data, error } = await supabase
      .from('product')
      .insert(batch.map((plan) => plan.insert) as never)
      .select('id, code, name')

    if (error) {
      for (const plan of batch) {
        const { data: ins, error: insErr } = await supabase
          .from('product')
          .insert(plan.insert as never)
          .select('id, code, name')
          .single()
        if (insErr) {
          errors.push(`Création « ${plan.row.nom} » : ${insErr.message}`)
          continue
        }
        created += 1
        const newProductId = (ins as { id: string }).id
        labelByProductId.set(newProductId, plan.row.nom)
        historyRows.push({ ...plan.historyRow, product_id: newProductId })
        if (plan.supplierId) {
          supplierLinks.push({ productId: newProductId, supplierId: plan.supplierId })
        }
        const code = (ins as { code?: string }).code
        const name = (ins as { name?: string }).name
        if (code) byCode.set(norm(String(code)), newProductId)
        if (name) byName.set(norm(String(name)), newProductId)
      }
      continue
    }

    for (let i = 0; i < batch.length; i += 1) {
      const plan = batch[i]!
      const ins = (data ?? [])[i] as { id: string; code?: string; name?: string } | undefined
      if (!ins?.id) {
        errors.push(`Création « ${plan.row.nom} » : identifiant manquant après insertion.`)
        continue
      }
      created += 1
      labelByProductId.set(ins.id, plan.row.nom)
      historyRows.push({ ...plan.historyRow, product_id: ins.id })
      if (plan.supplierId) {
        supplierLinks.push({ productId: ins.id, supplierId: plan.supplierId })
      }
      if (ins.code) byCode.set(norm(String(ins.code)), ins.id)
      if (ins.name) byName.set(norm(String(ins.name)), ins.id)
    }
  }

  await batchSyncProductSuppliers(supabase, supplierLinks, errors, labelByProductId)
  await batchInsertPriceHistory(supabase, historyRows, errors, labelByProductId)

  return { created, updated, skipped, errors }
}
