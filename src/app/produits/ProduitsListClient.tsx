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
  TextField,
  Typography,
} from '@mui/material'
import ViewColumnOutlinedIcon from '@mui/icons-material/ViewColumnOutlined'
import BackNavButton from '@/components/BackNavButton'
import AppLink from '@/components/AppLink'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import type { RefRow, RefSubcategoryRow, RefVendeurRow } from '@/lib/products/types'
import { useRouter } from 'next/navigation'
import { SHEET_IMPORT_ENABLED, SheetImportBar } from '@/features/sheet-import'
import { PRODUCT_LIST_EXTENDED_SELECT } from '@/lib/products/product-supabase-select'
import { extractProductShopOrderUnitIds } from '@/lib/products/product-shop-order-unit'
import { useSessionPermissions } from '@/lib/auth/useSessionPermissions'
import { textIncludesFolded } from '@/lib/text/fold-for-search'
import {
  compareProductListRows,
  PRODUCT_LIST_COLUMN_BY_KEY,
  type ProductListColumnKey,
  type ProductListFieldKey,
  type ProductListRefs,
  type ProductListRow,
} from '@/lib/products/product-list-columns'
import {
  isProductListColumnEditable,
  readProductListColumnPreference,
  resolveVisibleProductListColumns,
  writeProductListColumnPreference,
  type ProductListColumnPreference,
} from '@/lib/products/product-list-column-preference'
import {
  commitProductField,
  commitProductFieldBulk,
  commitProductShopOrderUnits,
  isDraftDirty,
} from '@/lib/products/product-field-commit'
import ProductListCell from '@/app/produits/ProductListCell'
import ProductListColumnPicker from '@/app/produits/ProductListColumnPicker'
import ProductListBulkEditDialog from '@/app/produits/ProductListBulkEditDialog'

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

type SortDir = 'asc' | 'desc'
type ActiveFilter = 'active' | 'inactive' | 'all'
type DraftsState = Record<string, Partial<Record<ProductListColumnKey, string>>>

export default function ProduitsListClient() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), [])
  const router = useRouter()
  const { canWriteProducts } = useSessionPermissions()
  const [rows, setRows] = useState<ProductListRow[]>([])
  const [refs, setRefs] = useState<ProductListRefs>({
    categories: [],
    subcategories: [],
    suppliers: [],
    vendeurs: [],
    salesUnits: [],
    orderUnits: [],
    purchaseUnits: [],
    shopOrderUnits: [],
    emballages: [],
    etiquettes: [],
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [qName, setQName] = useState('')
  const [catId, setCatId] = useState<string>('')
  const [suppId, setSuppId] = useState<string>('')
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('all')
  const [drafts, setDrafts] = useState<DraftsState>({})
  const [sortKey, setSortKey] = useState<ProductListColumnKey>('sales_name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkMenuNonce, setBulkMenuNonce] = useState(0)
  const [cellBusyKey, setCellBusyKey] = useState<string | null>(null)
  const [columnPref, setColumnPref] = useState<ProductListColumnPreference>(() =>
    readProductListColumnPreference(),
  )
  const [columnPickerOpen, setColumnPickerOpen] = useState(false)
  const [bulkEditOpen, setBulkEditOpen] = useState(false)

  const visibleColumns = useMemo(
    () => resolveVisibleProductListColumns(columnPref),
    [columnPref],
  )

  const load = useCallback(async () => {
    setError(null)
    setLoading(true)
    setDrafts({})
    const { data, error: e1 } = await supabase.from('product').select(PRODUCT_LIST_EXTENDED_SELECT)
    if (e1) {
      setError(e1.message)
      setRows([])
      setLoading(false)
      return
    }
    setRows(
      ((data as Record<string, unknown>[]) ?? []).map(raw => {
        const emballageRef = raw.emballage_ref ?? raw.ref_emballage
        const etiquetteRef = raw.etiquette_ref
        const shopUnitsRaw = raw.product_shop_order_unit
        const {
          emballage_ref: _e,
          etiquette_ref: _t,
          ref_emballage: _r,
          product_shop_order_unit: _psou,
          ...rest
        } = raw
        return {
          ...(rest as ProductListRow),
          shop_order_unit_ids: extractProductShopOrderUnitIds(shopUnitsRaw),
          ref_emballage: (Array.isArray(emballageRef) ? emballageRef[0] : emballageRef) as ProductListRow['ref_emballage'],
          ref_etiquette: (Array.isArray(etiquetteRef) ? etiquetteRef[0] : etiquetteRef) as ProductListRow['ref_etiquette'],
        }
      }),
    )
    setSelectedIds(new Set())

    const [
      catsRes,
      subcatsRes,
      supsRes,
      vendeursRes,
      unitsRes,
      orderUnitsRes,
      purchaseUnitsRes,
      shopUnitsRes,
      embRes,
      etqRes,
    ] = await Promise.all([
      supabase.from('ref_category').select('*').order('sort_order'),
      supabase.from('ref_subcategory').select('*').order('sort_order'),
      supabase.from('ref_supplier').select('*').order('sort_order'),
      supabase.from('ref_supplier_vendeur').select('id, supplier_id, label, sort_order').order('sort_order').order('label'),
      supabase.from('ref_sales_unit').select('*').order('sort_order'),
      supabase.from('ref_order_unit').select('*').order('sort_order'),
      supabase.from('ref_purchase_unit').select('*').order('sort_order'),
      supabase.from('ref_shop_order_unit').select('*').order('sort_order'),
      fetch('/api/emballages?categorie=emballages', { credentials: 'include' }),
      fetch('/api/emballages?categorie=etiquettes', { credentials: 'include' }),
    ])

    const embJson = (await embRes.json().catch(() => ({}))) as { emballages?: ProductListRefs['emballages'] }
    const etqJson = (await etqRes.json().catch(() => ({}))) as { emballages?: ProductListRefs['etiquettes'] }

    setRefs({
      categories: (catsRes.data as RefRow[]) ?? [],
      subcategories: (subcatsRes.data as RefSubcategoryRow[]) ?? [],
      suppliers: (supsRes.data as RefRow[]) ?? [],
      vendeurs: (vendeursRes.data as RefVendeurRow[]) ?? [],
      salesUnits: (unitsRes.data as RefRow[]) ?? [],
      orderUnits: (orderUnitsRes.data as RefRow[]) ?? [],
      purchaseUnits: (purchaseUnitsRes.data as RefRow[]) ?? [],
      shopOrderUnits: (shopUnitsRes.data as RefRow[]) ?? [],
      emballages: embJson.emballages ?? [],
      etiquettes: etqJson.emballages ?? [],
    })
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
    list.sort((a, b) => compareProductListRows(a, b, sortKey, sortDir))
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

  const selectedRows = useMemo(
    () => rows.filter(r => selectedIds.has(r.id)),
    [rows, selectedIds],
  )

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

  const clearDraftForRow = (productId: string, field?: ProductListColumnKey) => {
    setDrafts(prev => {
      if (!field) {
        const next = { ...prev }
        delete next[productId]
        return next
      }
      const rowDrafts = { ...prev[productId] }
      delete rowDrafts[field]
      const next = { ...prev }
      if (Object.keys(rowDrafts).length === 0) delete next[productId]
      else next[productId] = rowDrafts
      return next
    })
  }

  const setDraft = (productId: string, field: ProductListColumnKey, value: string) => {
    setDrafts(prev => ({
      ...prev,
      [productId]: { ...prev[productId], [field]: value },
    }))
  }

  const isRowDirty = (row: ProductListRow) => {
    const rowDrafts = drafts[row.id]
    if (!rowDrafts) return false
    for (const [key, draft] of Object.entries(rowDrafts)) {
      if (isDraftDirty(row, key as ProductListFieldKey, draft)) return true
    }
    return false
  }

  const applyRowUpdate = (updated: ProductListRow) => {
    setRows(prev => prev.map(r => (r.id === updated.id ? updated : r)))
    clearDraftForRow(updated.id)
  }

  const commitField = async (row: ProductListRow, field: ProductListFieldKey, rawValue: unknown) => {
    if (!canWriteProducts) return
    const busyKey = `${row.id}:${field}`
    setCellBusyKey(busyKey)
    setError(null)
    const result = await commitProductField(supabase, { row, field, rawValue, refs })
    setCellBusyKey(null)
    if (!result.ok) {
      setError(result.error)
      return
    }
    applyRowUpdate(result.row)
  }

  const commitShopOrderUnits = async (row: ProductListRow, unitIds: string[]) => {
    if (!canWriteProducts) return
    const busyKey = `${row.id}:shop_order_units`
    setCellBusyKey(busyKey)
    setError(null)
    const result = await commitProductShopOrderUnits(supabase, { row, unitIds, refs })
    setCellBusyKey(null)
    if (!result.ok) {
      setError(result.error)
      return
    }
    applyRowUpdate(result.row)
  }

  const handleTextNumberCommit = async (row: ProductListRow, field: ProductListFieldKey) => {
    const draft = drafts[row.id]?.[field]
    const raw = draft !== undefined ? draft : undefined
    if (raw === undefined) return
    await commitField(row, field, raw)
  }

  const runBulkAction = async (action: string) => {
    if (!canWriteProducts || !action || selectedIds.size === 0) return
    const active = action === 'activate'
    if (action !== 'activate' && action !== 'deactivate') return
    setBulkBusy(true)
    setError(null)
    const result = await commitProductFieldBulk(supabase, {
      rows: selectedRows,
      field: 'active',
      rawValue: active,
      refs,
    })
    setBulkBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    const byId = new Map(result.rows.map(r => [r.id, r]))
    setRows(prev => prev.map(r => byId.get(r.id) ?? r))
    setSelectedIds(new Set())
    setBulkMenuNonce(n => n + 1)
  }

  const handleBulkEditApply = async (field: ProductListFieldKey, rawValue: unknown) => {
    if (!canWriteProducts || selectedIds.size === 0) return
    setBulkBusy(true)
    setError(null)
    const result = await commitProductFieldBulk(supabase, {
      rows: selectedRows,
      field,
      rawValue,
      refs,
    })
    setBulkBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    const byId = new Map(result.rows.map(r => [r.id, r]))
    setRows(prev => prev.map(r => byId.get(r.id) ?? r))
    setSelectedIds(new Set())
    setBulkEditOpen(false)
    setBulkMenuNonce(n => n + 1)
  }

  const toggleSort = (key: ProductListColumnKey) => {
    const def = PRODUCT_LIST_COLUMN_BY_KEY[key]
    if (!def.sortable) return
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const handleColumnPrefSave = (pref: ProductListColumnPreference) => {
    writeProductListColumnPreference(pref)
    setColumnPref(pref)
    setColumnPickerOpen(false)
  }

  if (loading)
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-rose-50 p-6">
        <p className="text-slate-600">Chargement des produits…</p>
      </div>
    )

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-rose-50 p-4 md:p-8">
      <div className="mx-auto max-w-[96rem]">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <BackNavButton href="/" size="small">
              Accueil
            </BackNavButton>
            <Typography variant="h4" component="h1" sx={{ fontWeight: 600, color: '#0f172a' }}>
              Produits
            </Typography>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outlined"
              startIcon={<ViewColumnOutlinedIcon />}
              onClick={() => setColumnPickerOpen(true)}
              sx={{ borderRadius: 2, textTransform: 'none' }}
            >
              Colonnes
            </Button>
            {canWriteProducts ? (
              <>
                <Button component={AppLink} href="/produits/photo" variant="outlined" color="primary" sx={{ borderRadius: 2, textTransform: 'none' }}>
                  Photos terrain
                </Button>
                <Button component={AppLink} href="/produits/nouveau" variant="contained" color="success" sx={{ borderRadius: 2, textTransform: 'none' }}>
                  Nouveau produit
                </Button>
              </>
            ) : null}
          </div>
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
            <Select value={catId} label="Catégorie" onChange={e => setCatId(e.target.value as string)}>
              <MenuItem value="">Toutes</MenuItem>
              {refs.categories.map(c => (
                <MenuItem key={c.id} value={c.id}>
                  {c.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Fournisseur</InputLabel>
            <Select value={suppId} label="Fournisseur" onChange={e => setSuppId(e.target.value as string)}>
              <MenuItem value="">Tous</MenuItem>
              {refs.suppliers.map(s => (
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
                {visibleColumns.map(colKey => {
                  const def = PRODUCT_LIST_COLUMN_BY_KEY[colKey]
                  return (
                    <th
                      key={colKey}
                      className="px-3 py-2"
                      style={{ minWidth: def.minWidth }}
                    >
                      {def.sortable ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(colKey)}
                          className={`inline-flex items-center gap-0.5 hover:text-emerald-800 ${
                            colKey === 'sales_name' ? 'font-semibold text-slate-600' : 'text-slate-800'
                          }`}
                          title={`Trier par ${def.label}`}
                        >
                          {def.label}
                          {sortKey === colKey ? (sortDir === 'asc' ? ' ↑' : ' ↓') : null}
                        </button>
                      ) : (
                        def.label
                      )}
                    </th>
                  )
                })}
                <th className="w-9 px-0.5 py-2" scope="col" aria-label="Annuler les modifications" />
              </tr>
            </thead>
            <tbody>
              {sortedFiltered.map(r => {
                const dirty = isRowDirty(r)
                return (
                  <tr
                    key={r.id}
                    className={`border-b border-slate-100 cursor-pointer ${
                      dirty ? 'bg-amber-100/90 hover:bg-amber-100' : 'hover:bg-emerald-50/40'
                    }`}
                    onClick={ev => {
                      const t = ev.target as HTMLElement
                      if (t.closest('input,button,a,[role="checkbox"],[role="switch"],select,.MuiSelect-select')) return
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
                    {visibleColumns.map(colKey => {
                      const def = PRODUCT_LIST_COLUMN_BY_KEY[colKey]
                      const columnEditable = isProductListColumnEditable(columnPref, colKey)
                      const field =
                        def.editable && columnEditable && colKey !== 'shop_order_units'
                          ? (colKey as ProductListFieldKey)
                          : null
                      const busy = columnEditable && cellBusyKey === `${r.id}:${colKey}`
                      return (
                        <td
                          key={colKey}
                          className="px-3 py-1.5 align-middle"
                          onClick={e => {
                            if (
                              columnEditable ||
                              def.cellKind === 'fiche' ||
                              def.cellKind === 'image' ||
                              def.cellKind === 'shop_units'
                            ) {
                              e.stopPropagation()
                            }
                          }}
                        >
                          <ProductListCell
                            columnKey={colKey}
                            row={r}
                            supabase={supabase}
                            refs={refs}
                            canWrite={canWriteProducts && columnEditable}
                            disabled={busy || bulkBusy}
                            draft={field ? drafts[r.id]?.[colKey] : undefined}
                            onDraftChange={
                              field && (def.cellKind === 'text' || def.cellKind === 'number')
                                ? v => setDraft(r.id, colKey, v)
                                : undefined
                            }
                            onCommitTextNumber={
                              field && (def.cellKind === 'text' || def.cellKind === 'number')
                                ? () => void handleTextNumberCommit(r, field)
                                : undefined
                            }
                            onCommitSwitch={
                              field && def.cellKind === 'switch'
                                ? v => void commitField(r, field, v)
                                : undefined
                            }
                            onCommitSelect={
                              field && def.cellKind === 'select'
                                ? v => void commitField(r, field, v)
                                : undefined
                            }
                            onCommitShopUnits={
                              columnEditable && def.cellKind === 'shop_units'
                                ? ids => void commitShopOrderUnits(r, ids)
                                : undefined
                            }
                          />
                        </td>
                      )
                    })}
                    <td className="w-9 px-0.5 py-1.5 text-center align-middle" onClick={e => e.stopPropagation()}>
                      {dirty && canWriteProducts ? (
                        <Button
                          type="button"
                          size="small"
                          variant="outlined"
                          color="warning"
                          title="Annuler les modifications locales"
                          onClick={e => {
                            e.stopPropagation()
                            clearDraftForRow(r.id)
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
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outlined"
                  disabled={bulkBusy || selectedIds.size === 0}
                  onClick={() => setBulkEditOpen(true)}
                  sx={{ textTransform: 'none' }}
                >
                  Modifier la sélection…
                </Button>
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
                      if (v === 'activate' || v === 'deactivate') void runBulkAction(v)
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
              </div>
            ) : null}
          </div>
        ) : null}

        {sortedFiltered.length === 0 ? (
          <p className="mt-4 text-slate-600 text-sm">Aucun produit. Créez-en un ou ajustez les filtres.</p>
        ) : null}
        <p className="mt-2 text-xs text-slate-500">
          Astuce : bouton Colonnes pour choisir les champs affichés. Cliquez sur un en-tête triable pour ordonner la
          liste. Modifiez une cellule puis validez (Entrée ou clic ailleurs) ; la ligne s’affiche en orange, bouton ↺
          pour annuler. Sélectionnez des lignes pour une modification groupée.
        </p>
      </div>

      <ProductListColumnPicker
        open={columnPickerOpen}
        preference={columnPref}
        onClose={() => setColumnPickerOpen(false)}
        onSave={handleColumnPrefSave}
      />

      <ProductListBulkEditDialog
        open={bulkEditOpen}
        selectedCount={selectedIds.size}
        sampleRow={selectedRows[0] ?? null}
        refs={refs}
        busy={bulkBusy}
        onClose={() => setBulkEditOpen(false)}
        onApply={(field, raw) => void handleBulkEditApply(field, raw)}
      />
    </div>
  )
}
