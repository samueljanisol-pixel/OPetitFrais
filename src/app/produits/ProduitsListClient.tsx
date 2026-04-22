'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Box,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
} from '@mui/material'
import AppLink from '@/components/AppLink'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import type { ProductWithRefs, RefRow } from '@/lib/products/types'
import { useRouter } from 'next/navigation'
import { SHEET_IMPORT_ENABLED, SheetImportBar } from '@/features/sheet-import'
import { muiSlotPropsDecimalKeypad } from '@/lib/mui/numericTextFieldProps'

type Row = ProductWithRefs

type SortKey = 'code' | 'name' | 'price'
type SortDir = 'asc' | 'desc'

function codeToNum(code: string): number {
  const n = Number.parseInt(String(code).replace(/\D/g, ''), 10)
  return Number.isFinite(n) ? n : 0
}

function parsePriceInput(raw: string): number | null {
  const s = raw.replace(/\s/g, '').replace(',', '.')
  if (s === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function priceDiffers(a: number, b: number) {
  return Math.abs(a - b) > 0.005
}

export default function ProduitsListClient() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), [])
  const router = useRouter()
  const [rows, setRows] = useState<Row[]>([])
  const [categories, setCategories] = useState<RefRow[]>([])
  const [suppliers, setSuppliers] = useState<RefRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [qName, setQName] = useState('')
  const [catId, setCatId] = useState<string>('')
  const [suppId, setSuppId] = useState<string>('')
  const [editing, setEditing] = useState<Record<string, string>>({})
  const [sortKey, setSortKey] = useState<SortKey>('code')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const load = useCallback(async () => {
    setError(null)
    setLoading(true)
    setEditing({})
    const { data, error: e1 } = await supabase
      .from('product')
      .select('*, ref_sales_unit(*), ref_category(*), ref_supplier(*)')
    if (e1) {
      setError(e1.message)
      setRows([])
      setLoading(false)
      return
    }
    setRows((data as Row[]) ?? [])

    const { data: cats } = await supabase.from('ref_category').select('*').order('sort_order')
    const { data: sups } = await supabase.from('ref_supplier').select('*').order('sort_order')
    setCategories((cats as RefRow[]) ?? [])
    setSuppliers((sups as RefRow[]) ?? [])
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (catId && r.category_id !== catId) return false
      if (suppId && r.supplier_id !== suppId) return false
      if (qName.trim()) {
        const t = qName.trim().toLowerCase()
        if (!r.name.toLowerCase().includes(t)) return false
      }
      return true
    })
  }, [rows, catId, suppId, qName])

  const sortedFiltered = useMemo(() => {
    const list = [...filtered]
    const m = sortDir === 'asc' ? 1 : -1
    list.sort((a, b) => {
      if (sortKey === 'code') return (codeToNum(a.code) - codeToNum(b.code)) * m
      if (sortKey === 'name') return a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }) * m
      return (a.price - b.price) * m
    })
    return list
  }, [filtered, sortKey, sortDir])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const isPriceRowDirty = (r: Row) => {
    const override = editing[r.id]
    if (override === undefined) return false
    const n = parsePriceInput(override)
    if (n == null) return true
    if (n < 0) return true
    return priceDiffers(n, r.price)
  }

  const revertPriceLocal = (id: string) => {
    setEditing(s => {
      const c = { ...s }
      delete c[id]
      return c
    })
  }

  const onPriceCommit = async (r: Row, raw: string) => {
    const n = Number(raw.replace(',', '.'))
    if (!Number.isFinite(n) || n < 0) {
      setEditing(s => {
        const c = { ...s }
        delete c[r.id]
        return c
      })
      return
    }
    if (n === r.price) {
      setEditing(s => {
        const c = { ...s }
        delete c[r.id]
        return c
      })
      return
    }
    const { error: e2 } = await supabase.from('product').update({ price: n }).eq('id', r.id)
    if (e2) {
      setError(e2.message)
      return
    }
    setRows(prev => prev.map(p => (p.id === r.id ? { ...p, price: n } : p)))
    setEditing(s => {
      const c = { ...s }
      delete c[r.id]
      return c
    })
  }

  if (loading)
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-rose-50 p-6">
        <p className="text-slate-600">Chargement des produits…</p>
      </div>
    )

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-rose-50 p-4 md:p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <Typography variant="h4" className="!font-semibold !text-slate-900" component="h1">
              Produits
            </Typography>
            <Button component={AppLink} href="/" size="small" sx={{ mt: 0.5, textTransform: 'none' }}>
              Accueil
            </Button>
          </div>
          <Button component={AppLink} href="/produits/nouveau" variant="contained" color="success" sx={{ borderRadius: 2, textTransform: 'none' }}>
            Nouveau produit
          </Button>
        </div>

        {SHEET_IMPORT_ENABLED ? <SheetImportBar onDone={() => void load()} /> : null}

        {error ? (
          <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>
        ) : null}

        <div className="mb-2 flex flex-col flex-wrap gap-2 sm:flex-row">
          <TextField
            size="small"
            label="Recherche (nom)"
            value={qName}
            onChange={e => setQName(e.target.value)}
            sx={{ minWidth: 200 }}
          />
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Catégorie</InputLabel>
            <Select
              value={catId}
              label="Catégorie"
              onChange={e => setCatId(e.target.value as string)}
            >
              <MenuItem value="">Toutes</MenuItem>
              {categories.map(c => (
                <MenuItem key={c.id} value={c.id}>
                  {c.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Fournisseur</InputLabel>
            <Select
              value={suppId}
              label="Fournisseur"
              onChange={e => setSuppId(e.target.value as string)}
            >
              <MenuItem value="">Tous</MenuItem>
              {suppliers.map(s => (
                <MenuItem key={s.id} value={s.id}>
                  {s.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </div>

        <Box sx={{ overflow: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper' }}>
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-600">
                <th className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => toggleSort('code')}
                    className="inline-flex items-center gap-0.5 font-semibold text-slate-600 hover:text-emerald-800"
                    title="Trier par code (numérique)"
                  >
                    Code
                    {sortKey === 'code' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : null}
                  </button>
                </th>
                <th className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => toggleSort('name')}
                    className="inline-flex items-center gap-0.5 font-semibold text-slate-600 hover:text-emerald-800"
                    title="Trier par nom"
                  >
                    Nom
                    {sortKey === 'name' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : null}
                  </button>
                </th>
                <th className="px-3 py-2 w-32">
                  <button
                    type="button"
                    onClick={() => toggleSort('price')}
                    className="inline-flex items-center gap-0.5 font-semibold text-slate-600 hover:text-emerald-800"
                    title="Trier par prix"
                  >
                    Prix (DH)
                    {sortKey === 'price' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : null}
                  </button>
                </th>
                <th className="w-9 px-0.5 py-2" scope="col" aria-label="Réinitialiser le prix" />
                <th className="px-3 py-2">UdV</th>
                <th className="px-3 py-2">Catégorie</th>
                <th className="px-3 py-2">Fournisseur</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {sortedFiltered.map(r => {
                const priceVal = editing[r.id] != null ? editing[r.id]! : String(r.price)
                const dirty = isPriceRowDirty(r)
                return (
                  <tr
                    key={r.id}
                    className={`border-b border-slate-100 cursor-pointer ${
                      dirty ? 'bg-amber-100/90 hover:bg-amber-100' : 'hover:bg-emerald-50/40'
                    }`}
                    onClick={ev => {
                      const t = ev.target as HTMLElement
                      if (t.closest('input,button,a')) return
                      router.push(`/produits/${r.id}`)
                    }}
                  >
                    <td className="px-3 py-2 font-mono text-slate-800">{r.code}</td>
                    <td className="px-3 py-2 text-slate-900">{r.name}</td>
                    <td className="px-3 py-1.5 align-middle" onClick={e => e.stopPropagation()}>
                      <TextField
                        size="small"
                        type="text"
                        value={priceVal}
                        onChange={e => setEditing(s => ({ ...s, [r.id]: e.target.value }))}
                        onBlur={() => onPriceCommit(r, editing[r.id] ?? String(r.price))}
                        onKeyDown={e => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                        }}
                        sx={{ width: 100, '& .MuiInputBase-input': { fontSize: 14 } }}
                        slotProps={muiSlotPropsDecimalKeypad}
                      />
                    </td>
                    <td className="w-9 px-0.5 py-1.5 text-center align-middle" onClick={e => e.stopPropagation()}>
                      {dirty ? (
                        <Button
                          type="button"
                          size="small"
                          variant="outlined"
                          color="warning"
                          title="Revenir au prix enregistré"
                          onClick={e => {
                            e.stopPropagation()
                            revertPriceLocal(r.id)
                          }}
                          sx={{
                            minWidth: 32,
                            width: 32,
                            height: 40,
                            p: 0,
                            fontSize: 16,
                            lineHeight: 1,
                            textTransform: 'none',
                          }}
                        >
                          ↺
                        </Button>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-slate-700">{(r.ref_sales_unit as RefRow | null)?.label ?? '—'}</td>
                    <td className="px-3 py-2 text-slate-700">{(r.ref_category as RefRow | null)?.label ?? '—'}</td>
                    <td className="px-3 py-2 text-slate-700">{(r.ref_supplier as RefRow | null)?.label ?? '—'}</td>
                    <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                      <Button size="small" href={`/produits/${r.id}`} component={AppLink} sx={{ textTransform: 'none' }}>
                        Fiche
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Box>

        {sortedFiltered.length === 0 ? (
          <p className="mt-4 text-slate-600 text-sm">Aucun produit. Créez-en un ou ajustez les filtres.</p>
        ) : null}
        <p className="mt-2 text-xs text-slate-500">
          Astuce : cliquez sur Code, Nom ou Prix pour trier. Modifiez le prix puis validez (Entrée ou clic ailleurs) ; la ligne
          s’affiche en orange, bouton ↺ pour annuler le changement.
        </p>
      </div>
    </div>
  )
}
