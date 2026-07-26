'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Box,
  Button,
  Checkbox,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Switch,
  TextField,
  Typography,
} from '@mui/material'

/** Sélection stable avec nouveau Set pour le rendu React. */
function toggleIds(ids: string[], selected: Set<string>, mode: 'add' | 'remove') {
  const next = new Set(selected)
  for (const id of ids) {
    if (mode === 'add') next.add(id)
    else next.delete(id)
  }
  return next
}

const BULK_PROMPT = '__bulk_prompt__' as const
import BackNavButton from '@/components/BackNavButton'
import AppLink from '@/components/AppLink'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import type { ProductWithRefs, RefRow } from '@/lib/products/types'
import { useRouter } from 'next/navigation'
import { SHEET_IMPORT_ENABLED, SheetImportBar } from '@/features/sheet-import'
import { muiSlotPropsDecimalKeypad } from '@/lib/mui/numericTextFieldProps'
import { insertProductPriceHistoryRow } from '@/lib/products/priceHistory'
import { PRODUCT_LIST_SELECT } from '@/lib/products/product-supabase-select'
import { useSessionPermissions } from '@/lib/auth/useSessionPermissions'
import { productSalesNameFr } from '@/lib/products/product-display-name'
import { textIncludesFolded } from '@/lib/text/fold-for-search'

type Row = ProductWithRefs

type SortKey = 'code' | 'name' | 'price'
type SortDir = 'asc' | 'desc'

/** Filtre « Actif » : par défaut « Tous » (sans filtre) ; options Actifs / Inactifs. */
type ActiveFilter = 'active' | 'inactive' | 'all'

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
  const { canWriteProducts } = useSessionPermissions()
  const [rows, setRows] = useState<Row[]>([])
  const [categories, setCategories] = useState<RefRow[]>([])
  const [suppliers, setSuppliers] = useState<RefRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [qName, setQName] = useState('')
  const [catId, setCatId] = useState<string>('')
  const [suppId, setSuppId] = useState<string>('')
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('all')
  const [editing, setEditing] = useState<Record<string, string>>({})
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkMenuNonce, setBulkMenuNonce] = useState(0)
  const [activeToggleBusyId, setActiveToggleBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    setLoading(true)
    setEditing({})
    const { data, error: e1 } = await supabase
      .from('product')
      .select(PRODUCT_LIST_SELECT)
    if (e1) {
      setError(e1.message)
      setRows([])
      setLoading(false)
      return
    }
    setRows((data as Row[]) ?? [])
    setSelectedIds(new Set())

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
      if (activeFilter === 'active' && !r.active) return false
      if (activeFilter === 'inactive' && r.active) return false
      if (catId && r.category_id !== catId) return false
      if (suppId && r.supplier_id !== suppId) return false
      if (qName.trim()) {
        const q = qName.trim()
        const nameMatch = textIncludesFolded(r.name, q)
        const arMatch = r.name_ar ? textIncludesFolded(r.name_ar, q) : false
        const salesMatch = r.sales_name ? textIncludesFolded(r.sales_name, q) : false
        const salesArMatch = r.sales_name_ar ? textIncludesFolded(r.sales_name_ar, q) : false
        if (!nameMatch && !arMatch && !salesMatch && !salesArMatch) return false
      }
      return true
    })
  }, [rows, activeFilter, catId, suppId, qName])

  const sortedFiltered = useMemo(() => {
    const list = [...filtered]
    const m = sortDir === 'asc' ? 1 : -1
    list.sort((a, b) => {
      if (sortKey === 'code') return (codeToNum(a.code) - codeToNum(b.code)) * m
      if (sortKey === 'name') {
        return productSalesNameFr(a).localeCompare(productSalesNameFr(b), 'fr', { sensitivity: 'base' }) * m
      }
      return (a.price - b.price) * m
    })
    return list
  }, [filtered, sortKey, sortDir])

  const visibleIds = useMemo(() => sortedFiltered.map(r => r.id), [sortedFiltered])

  const headerSelectState = useMemo(() => {
    const n = visibleIds.length
    if (n === 0) return { checked: false, indeterminate: false }
    let c = 0
    for (const id of visibleIds) {
      if (selectedIds.has(id)) c++
    }
    return { checked: c === n, indeterminate: c > 0 && c < n }
  }, [visibleIds, selectedIds])

  const selectedInViewCount = useMemo(() => {
    let n = 0
    for (const r of sortedFiltered) {
      if (selectedIds.has(r.id)) n++
    }
    return n
  }, [sortedFiltered, selectedIds])

  const selectedHiddenCount = selectedIds.size - selectedInViewCount

  const toggleSelectRow = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAllVisible = () => {
    const ids = visibleIds
    if (ids.length === 0) return
    const allOn = ids.every(id => selectedIds.has(id))
    setSelectedIds(prev => toggleIds(ids, prev, allOn ? 'remove' : 'add'))
  }

  const runBulkAction = async (action: string) => {
    if (!canWriteProducts || !action || selectedIds.size === 0) return
    const ids = [...selectedIds]
    const active = action === 'activate'
    if (action !== 'activate' && action !== 'deactivate') return
    setBulkBusy(true)
    setError(null)
    const { error: e0 } = await supabase.from('product').update({ active }).in('id', ids)
    setBulkBusy(false)
    if (e0) {
      setError(e0.message)
      return
    }
    setRows(prev => prev.map(r => (ids.includes(r.id) ? { ...r, active } : r)))
    setSelectedIds(new Set())
    setBulkMenuNonce(n => n + 1)
  }

  const toggleActive = async (r: Row, active: boolean) => {
    if (!canWriteProducts || activeToggleBusyId != null || r.active === active) return
    setActiveToggleBusyId(r.id)
    setError(null)
    const { error: e0 } = await supabase.from('product').update({ active }).eq('id', r.id)
    setActiveToggleBusyId(null)
    if (e0) {
      setError(e0.message)
      return
    }
    setRows(prev => prev.map(p => (p.id === r.id ? { ...p, active } : p)))
  }

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
    if (!canWriteProducts) return
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
    const { error: hErr } = await insertProductPriceHistoryRow(supabase, {
      product_id: r.id,
      price: n,
      cost_purchase: r.cost_purchase ?? null,
      cost_manufacturing: r.cost_manufacturing ?? null,
      cost_packaging: r.cost_packaging ?? null,
      margin: r.margin ?? null,
    })
    if (hErr) {
      setError(hErr.message)
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
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <BackNavButton href="/" size="small">
              Accueil
            </BackNavButton>
            <Typography variant="h4" component="h1" sx={{ fontWeight: 600, color: '#0f172a' }}>
              Produits
            </Typography>
          </div>
          {canWriteProducts ? (
            <div className="flex flex-wrap gap-2">
              <Button component={AppLink} href="/produits/photo" variant="outlined" color="primary" sx={{ borderRadius: 2, textTransform: 'none' }}>
                Photos terrain
              </Button>
              <Button component={AppLink} href="/produits/nouveau" variant="contained" color="success" sx={{ borderRadius: 2, textTransform: 'none' }}>
                Nouveau produit
              </Button>
            </div>
          ) : null}
        </div>

        {SHEET_IMPORT_ENABLED ? (
          <SheetImportBar onDone={() => void load()} canWriteProducts={canWriteProducts} />
        ) : null}

        {error ? (
          <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>
        ) : null}

        <div className="mb-2 flex flex-col flex-wrap gap-2 sm:flex-row">
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel id="produits-filter-actif-label">Actif</InputLabel>
            <Select
              labelId="produits-filter-actif-label"
              label="Actif"
              value={activeFilter}
              onChange={e => setActiveFilter(e.target.value as ActiveFilter)}
            >
              <MenuItem value="active">Actifs</MenuItem>
              <MenuItem value="inactive">Inactifs</MenuItem>
              <MenuItem value="all">Tous</MenuItem>
            </Select>
          </FormControl>
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
          <table className="w-full min-w-[780px] text-sm text-slate-900">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-100 text-left text-xs font-semibold uppercase text-slate-800">
                <th className="w-11 px-2 py-2">
                  {canWriteProducts ? (
                    <Checkbox
                      size="small"
                      checked={headerSelectState.checked}
                      indeterminate={headerSelectState.indeterminate}
                      onChange={() => toggleSelectAllVisible()}
                      slotProps={{ input: { 'aria-label': 'Sélectionner toutes les lignes affichées' } }}
                      sx={{ p: 0.5 }}
                    />
                  ) : null}
                </th>
                <th className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => toggleSort('code')}
                    className="inline-flex items-center gap-0.5 text-slate-800 hover:text-emerald-800"
                    title="Trier par code (numérique)"
                  >
                    Code
                    {sortKey === 'code' ? (sortDir === 'asc' ? ' ↑' : ' ↓') : null}
                  </button>
                </th>
                <th className="px-3 py-2 w-20">Actif</th>
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
                    className="inline-flex items-center gap-0.5 text-slate-800 hover:text-emerald-800"
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
                      if (t.closest('input,button,a,[role="checkbox"],[role="switch"]')) return
                      router.push(`/produits/${r.id}`)
                    }}
                  >
                    <td className="px-2 py-1.5 align-middle" onClick={e => e.stopPropagation()}>
                      {canWriteProducts ? (
                        <Checkbox
                          size="small"
                          checked={selectedIds.has(r.id)}
                          onChange={() => toggleSelectRow(r.id)}
                          slotProps={{ input: { 'aria-label': `Sélectionner ${r.name}` } }}
                          sx={{ p: 0.5 }}
                        />
                      ) : null}
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-800">{r.code}</td>
                    <td className="px-3 py-1.5 align-middle" onClick={e => e.stopPropagation()}>
                      <Switch
                        size="small"
                        color="success"
                        checked={r.active}
                        disabled={!canWriteProducts || activeToggleBusyId === r.id || bulkBusy}
                        onChange={(_, checked) => void toggleActive(r, checked)}
                        slotProps={{ input: { 'aria-label': `Actif — ${productSalesNameFr(r)}` } }}
                      />
                    </td>
                    <td className="px-3 py-2 text-slate-900">{productSalesNameFr(r)}</td>
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
                        disabled={!canWriteProducts}
                        sx={{ width: 100, '& .MuiInputBase-input': { fontSize: 14 } }}
                        slotProps={muiSlotPropsDecimalKeypad}
                      />
                    </td>
                    <td className="w-9 px-0.5 py-1.5 text-center align-middle" onClick={e => e.stopPropagation()}>
                      {dirty && canWriteProducts ? (
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
                    <td className="px-3 py-2 text-slate-900">{(r.ref_sales_unit as RefRow | null)?.label ?? '—'}</td>
                    <td className="px-3 py-2 text-slate-900">{(r.ref_category as RefRow | null)?.label ?? '—'}</td>
                    <td className="px-3 py-2 text-slate-900">{(r.ref_supplier as RefRow | null)?.label ?? '—'}</td>
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

        {sortedFiltered.length > 0 ? (
          <div className="mt-3 flex flex-col gap-3 border-t border-slate-200 pt-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="text-sm leading-relaxed text-slate-800">
              <span className="font-semibold text-slate-900">{sortedFiltered.length}</span> produit
              {sortedFiltered.length > 1 ? 's' : ''} affiché{sortedFiltered.length > 1 ? 's' : ''}
              {rows.length !== sortedFiltered.length ? (
                <>
                  {' '}
                  <span className="text-slate-500">·</span> {rows.length} au total catalogue
                </>
              ) : null}
              <br className="sm:hidden" aria-hidden />
              <span className="font-semibold text-emerald-800">
                {' '}
                <span className="font-normal text-slate-500">·</span> {selectedIds.size} sélectionné
                {selectedIds.size > 1 ? 's' : ''}
              </span>
              {selectedHiddenCount > 0 ? (
                <span className="text-slate-600">
                  {' '}
                  ({selectedInViewCount} dans cette liste, +{selectedHiddenCount} hors filtres actuels)
                </span>
              ) : null}
            </div>
            {canWriteProducts ? (
              <FormControl size="small" sx={{ minWidth: 260 }} aria-label="Actions groupées sur la sélection">
                <Select
                  key={bulkMenuNonce}
                  variant="outlined"
                  defaultValue={BULK_PROMPT}
                  disabled={bulkBusy || selectedIds.size === 0}
                  displayEmpty
                  renderValue={selected => {
                    const s = String(selected)
                    if (bulkBusy || s === 'activate' || s === 'deactivate') {
                      return <span className="text-slate-700">Traitement…</span>
                    }
                    if (selectedIds.size === 0) {
                      return <span className="text-slate-500">Sélectionnez des lignes</span>
                    }
                    return <span className="font-semibold text-slate-800">Actions groupées</span>
                  }}
                  onChange={e => {
                    const v = e.target.value as string
                    if (v === 'activate' || v === 'deactivate') void runBulkAction(v as 'activate' | 'deactivate')
                  }}
                  sx={{
                    bgcolor: 'background.paper',
                    '& .MuiSelect-select': { py: 1.25 },
                  }}
                >
                  <MenuItem value={BULK_PROMPT} sx={{ display: 'none' }} aria-hidden tabIndex={-1}>
                    —
                  </MenuItem>
                  <MenuItem value="activate">Activer</MenuItem>
                  <MenuItem value="deactivate">Désactiver</MenuItem>
                </Select>
              </FormControl>
            ) : null}
          </div>
        ) : null}

        {sortedFiltered.length === 0 ? (
          <p className="mt-4 text-slate-600 text-sm">Aucun produit. Créez-en un ou ajustez les filtres.</p>
        ) : null}
        <p className="mt-2 text-xs text-slate-500">
          Astuce : cliquez sur Code, Nom ou Prix pour trier. Le switch Actif active ou désactive le produit tout de suite.
          Modifiez le prix puis validez (Entrée ou clic ailleurs) ; la ligne s’affiche en orange, bouton ↺ pour annuler le
          changement.
        </p>
      </div>
    </div>
  )
}
