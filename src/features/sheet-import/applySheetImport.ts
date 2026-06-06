import type { SupabaseClient } from '@supabase/supabase-js'
import { insertProductPriceHistoryRow, pricingSnapshotChanged, type ProductPricingSnapshot } from '@/lib/products/priceHistory'
import type { RefRow, RefSubcategoryRow } from '@/lib/products/types'
import type { SheetRowParsed } from './mapSheetRow'
import {
  DEFAULT_SHEET_IMPORT_FIELDS,
  hasAnyImportField,
  type SheetImportFields,
} from './sheet-import-fields'

type Refs = {
  byUnitLabel: Map<string, string>
  byUnitCode: Map<string, string>
  byCatLabel: Map<string, string>
  byCatCode: Map<string, string>
  bySupLabel: Map<string, string>
  bySupCode: Map<string, string>
  bySubcatKey: Map<string, string>
}

const norm = (s: string) => s.trim().toLowerCase()

function subcatKey(categoryId: string, label: string): string {
  return `${categoryId}\0${norm(label)}`
}

function buildRefs(
  units: RefRow[],
  cats: RefRow[],
  sups: RefRow[],
  subcats: RefSubcategoryRow[],
): Refs {
  const byUnitLabel = new Map<string, string>()
  const byUnitCode = new Map<string, string>()
  for (const u of units) {
    byUnitLabel.set(norm(u.label), u.id)
    byUnitCode.set(norm(u.code), u.id)
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
  const bySubcatKey = new Map<string, string>()
  for (const sc of subcats) {
    bySubcatKey.set(subcatKey(sc.category_id, sc.label), sc.id)
  }
  return { byUnitLabel, byUnitCode, byCatLabel, byCatCode, bySupLabel, bySupCode, bySubcatKey }
}

function resolveId(maps: Map<string, string>[], raw: string): string | null {
  const n = norm(raw)
  for (const m of maps) {
    const id = m.get(n)
    if (id) return id
  }
  return null
}

const PRICING_SELECT = 'price, cost_purchase, cost_manufacturing, cost_packaging, margin'

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

async function applySubcategoryToPatch(
  supabase: SupabaseClient,
  row: SheetRowParsed,
  fields: SheetImportFields,
  refs: Refs,
  patch: Record<string, unknown>,
  categoryId: string | null,
): Promise<string[]> {
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

  const resolved = await findOrCreateSubcategory(supabase, categoryId, row.sousCategorie, refs)
  if (typeof resolved === 'object' && 'error' in resolved) {
    errors.push(`« ${row.nom} » : sous-catégorie « ${row.sousCategorie} » : ${resolved.error}`)
    return errors
  }
  patch.subcategory_id = resolved
  return errors
}

async function resolveCategoryIdForRow(
  supabase: SupabaseClient,
  productId: string | null,
  patch: Record<string, unknown>,
  row: SheetRowParsed,
  fields: SheetImportFields,
  refs: Refs,
): Promise<string | null> {
  const fromPatch = patch.category_id
  if (typeof fromPatch === 'string' && fromPatch.length > 0) return fromPatch
  if (fields.categorie) {
    return resolveId([refs.byCatLabel, refs.byCatCode], row.categorie)
  }
  if (productId) {
    const { data } = await supabase.from('product').select('category_id').eq('id', productId).single()
    const cid = data?.category_id
    return typeof cid === 'string' && cid.length > 0 ? cid : null
  }
  return resolveId([refs.byCatLabel, refs.byCatCode], row.categorie)
}

/**
 * N’applique que les champs cochés pour les produits existants.
 * Les nouveaux produits sont toujours créés avec toutes les colonnes de la feuille.
 * Correspondance par `code` produit, sinon par `nom` (insensible à la casse) si le code feuille est vide.
 */
export async function applySheetImport(
  supabase: SupabaseClient,
  parsed: SheetRowParsed[],
  fields: SheetImportFields = DEFAULT_SHEET_IMPORT_FIELDS,
): Promise<SheetImportResult> {
  const errors: string[] = []
  if (!hasAnyImportField(fields)) {
    return { created: 0, updated: 0, skipped: 0, errors: ['Aucun champ sélectionné pour l’import.'] }
  }
  const [{ data: units }, { data: cats }, { data: sups }, { data: subcats }, { data: products }] =
    await Promise.all([
      supabase.from('ref_sales_unit').select('*'),
      supabase.from('ref_category').select('*'),
      supabase.from('ref_supplier').select('*'),
      supabase.from('ref_subcategory').select('id, category_id, label, code, sort_order'),
      supabase.from('product').select('id, code, name'),
    ])
  if (!units?.length || !cats?.length || !sups?.length) {
    return { created: 0, updated: 0, skipped: 0, errors: ['Référentiels (UdV / catégorie / fournisseur) introuvables.'] }
  }
  const refs = buildRefs(
    units as RefRow[],
    cats as RefRow[],
    sups as RefRow[],
    (subcats as RefSubcategoryRow[]) ?? [],
  )
  const byCode = new Map<string, string>()
  const byName = new Map<string, string>()
  for (const p of products ?? []) {
    const c = p.code
    if (c) byCode.set(norm(c), p.id)
    if (p.name) byName.set(norm(p.name as string), p.id)
  }

  let created = 0
  let updated = 0
  let skipped = 0

  for (const row of parsed) {
    const { patch, errors: patchErrors } = buildProductPatch(row, fields, refs)
    if (patchErrors.length > 0) {
      errors.push(...patchErrors)
      continue
    }

    const codeNorm = row.code ? norm(row.code) : ''
    const id =
      (codeNorm && byCode.get(codeNorm)) || (!codeNorm && byName.get(norm(row.nom))) || null

    const categoryId = await resolveCategoryIdForRow(supabase, id, patch, row, fields, refs)
    const subErrors = await applySubcategoryToPatch(supabase, row, fields, refs, patch, categoryId)
    if (subErrors.length > 0) {
      errors.push(...subErrors)
      continue
    }

    if (id) {
      if (Object.keys(patch).length === 0) {
        skipped += 1
        continue
      }
      const pricingFieldsChanged = fields.prix || fields.marge
      const { data: before } = pricingFieldsChanged
        ? await supabase.from('product').select(PRICING_SELECT).eq('id', id).single()
        : { data: null }
      const { data: upd, error: e0 } = await supabase
        .from('product')
        .update(patch as never)
        .eq('id', id)
        .select(PRICING_SELECT)
        .single()
      if (e0) errors.push(`Mise à jour « ${row.nom} » : ${e0.message}`)
      else {
        updated += 1
        if (pricingFieldsChanged && upd) {
          const snap = pricingFromRow(upd as Record<string, unknown>)
          const bef = before ? pricingFromRow(before as Record<string, unknown>) : null
          if (pricingSnapshotChanged(bef, snap)) {
            const { error: hErr } = await insertProductPriceHistoryRow(supabase, {
              product_id: id,
              ...snap,
            })
            if (hErr) errors.push(`Historique « ${row.nom} » : ${hErr.message}`)
          }
        }
      }
    } else {
      const { patch: fullPatch, errors: createErrors } = buildProductPatch(
        row,
        DEFAULT_SHEET_IMPORT_FIELDS,
        refs,
      )
      if (createErrors.length > 0) {
        errors.push(...createErrors)
        continue
      }
      const createCategoryId = await resolveCategoryIdForRow(
        supabase,
        null,
        fullPatch,
        row,
        DEFAULT_SHEET_IMPORT_FIELDS,
        refs,
      )
      const createSubErrors = await applySubcategoryToPatch(
        supabase,
        row,
        DEFAULT_SHEET_IMPORT_FIELDS,
        refs,
        fullPatch,
        createCategoryId,
      )
      if (createSubErrors.length > 0) {
        errors.push(...createSubErrors)
        continue
      }
      const insert: Record<string, unknown> = {
        ...fullPatch,
        cost_purchase: null,
        cost_manufacturing: null,
        cost_packaging: null,
        image_path: null,
      }
      if (!('margin' in insert)) {
        insert.margin = row.marge
      }
      const { data: ins, error: e1 } = await supabase
        .from('product')
        .insert(insert as never)
        .select('id, code, name')
        .single()
      if (e1) errors.push(`Création « ${row.nom} » : ${e1.message}`)
      else {
        created += 1
        if (ins?.id) {
          const { error: hIns } = await insertProductPriceHistoryRow(supabase, {
            product_id: (ins as { id: string }).id,
            price: row.prix,
            cost_purchase: null,
            cost_manufacturing: null,
            cost_packaging: null,
            margin: row.marge,
          })
          if (hIns) errors.push(`Historique « ${row.nom} » : ${hIns.message}`)
          if (ins.code) byCode.set(norm(String(ins.code)), String(ins.id))
          if (ins.name) byName.set(norm(String(ins.name)), String(ins.id))
        }
      }
    }
  }

  return { created, updated, skipped, errors }
}
