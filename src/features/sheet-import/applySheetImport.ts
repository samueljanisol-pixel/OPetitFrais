import type { SupabaseClient } from '@supabase/supabase-js'
import type { RefRow } from '@/lib/products/types'
import type { SheetRowParsed } from './mapSheetRow'

type Refs = {
  byUnitLabel: Map<string, string>
  byUnitCode: Map<string, string>
  byCatLabel: Map<string, string>
  byCatCode: Map<string, string>
  bySupLabel: Map<string, string>
  bySupCode: Map<string, string>
}

const norm = (s: string) => s.trim().toLowerCase()

function buildRefs(
  units: RefRow[],
  cats: RefRow[],
  sups: RefRow[],
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
  return { byUnitLabel, byUnitCode, byCatLabel, byCatCode, bySupLabel, bySupCode }
}

function resolveId(maps: Map<string, string>[], raw: string): string | null {
  const n = norm(raw)
  for (const m of maps) {
    const id = m.get(n)
    if (id) return id
  }
  return null
}

export type SheetImportResult = {
  created: number
  updated: number
  errors: string[]
}

/**
 * N’applique que les champs de l’export : actif, code, nom, prix, udv, catégorie, fournisseur, arabe.
 * Correspondance par `code` produit, sinon par `nom` (insensible à la casse) si le code feuille est vide.
 */
export async function applySheetImport(
  supabase: SupabaseClient,
  parsed: SheetRowParsed[],
): Promise<SheetImportResult> {
  const errors: string[] = []
  const [{ data: units }, { data: cats }, { data: sups }, { data: products }] = await Promise.all([
    supabase.from('ref_sales_unit').select('*'),
    supabase.from('ref_category').select('*'),
    supabase.from('ref_supplier').select('*'),
    supabase.from('product').select('id, code, name'),
  ])
  if (!units?.length || !cats?.length || !sups?.length) {
    return { created: 0, updated: 0, errors: ['Référentiels (UdV / catégorie / fournisseur) introuvables.'] }
  }
  const refs = buildRefs(
    units as RefRow[],
    cats as RefRow[],
    sups as RefRow[],
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

  for (const row of parsed) {
    const salesUnitId = resolveId([refs.byUnitLabel, refs.byUnitCode], row.udv)
    const categoryId = resolveId([refs.byCatLabel, refs.byCatCode], row.categorie)
    const supplierId = resolveId([refs.bySupLabel, refs.bySupCode], row.fournisseur)
    if (!salesUnitId) {
      errors.push(`« ${row.nom} » : UdV « ${row.udv} » introuvable en base.`)
      continue
    }
    if (!categoryId) {
      errors.push(`« ${row.nom} » : catégorie « ${row.categorie} » introuvable.`)
      continue
    }
    if (!supplierId) {
      errors.push(`« ${row.nom} » : fournisseur « ${row.fournisseur} » introuvable.`)
      continue
    }

    const base = {
      name: row.nom,
      price: row.prix,
      sales_unit_id: salesUnitId,
      category_id: categoryId,
      supplier_id: supplierId,
      name_ar: row.arabe,
      active: row.actif,
    }

    const codeNorm = row.code ? norm(row.code) : ''
    const id =
      (codeNorm && byCode.get(codeNorm)) || (!codeNorm && byName.get(norm(row.nom))) || null

    if (id) {
      const { error: e0 } = await supabase
        .from('product')
        .update(
          {
            ...base,
            name_ar: row.arabe,
          } as never,
        )
        .eq('id', id)
      if (e0) errors.push(`Mise à jour « ${row.nom} » : ${e0.message}`)
      else updated += 1
    } else {
      const insert: Record<string, unknown> = {
        ...base,
        margin: null,
        cost_purchase: null,
        cost_manufacturing: null,
        cost_packaging: null,
        image_path: null,
      }
      if (row.code && row.code.trim()) {
        insert.code = row.code.trim()
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
          if (ins.code) byCode.set(norm(String(ins.code)), String(ins.id))
          if (ins.name) byName.set(norm(String(ins.name)), String(ins.id))
        }
      }
    }
  }

  return { created, updated, errors }
}
