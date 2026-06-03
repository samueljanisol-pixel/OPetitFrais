'use client'

import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Box,
  Button,
  Checkbox,
  FormControl,
  InputLabel,
  ListItemText,
  MenuItem,
  OutlinedInput,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import type { SelectChangeEvent } from '@mui/material'
import AppLink from '@/components/AppLink'
import BackNavButton from '@/components/BackNavButton'
import CaJourHistogram from '@/components/CaJourHistogram'
import SyncStatusFooter from '@/components/SyncStatusFooter'
import VentesProductChipsFilter from '@/components/VentesProductChipsFilter'
import {
  buildDailySeriesFromLines,
  fetchVentesAnalyse,
  fillDailyRange,
  groupAnalyseLines,
  SANS_CATEGORIE,
  SANS_FOURNISSEUR,
} from '@/lib/ca/analyseVentes'
import { HISTORIQUE_FROM_ISO } from '@/lib/ca/constants'
import type { VentesAnalyseGroupBy, VentesAnalyseResult, VentesAnalyseRow } from '@/lib/ca/types'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { useSessionPermissions } from '@/lib/auth/useSessionPermissions'
import type { SessionMagasin } from '@/lib/auth/session-types'

type RefOpt = { id: string; label: string }
type SortKey = 'ca' | 'qty'

const GROUP_OPTIONS: { value: VentesAnalyseGroupBy; label: string }[] = [
  { value: 'produit', label: 'Produit' },
  { value: 'categorie', label: 'Catégorie' },
  { value: 'fournisseur', label: 'Fournisseur' },
  { value: 'magasin', label: 'Magasin' },
]

function firstDayOfMonthIso(isoToday: string): string {
  return `${isoToday.slice(0, 7)}-01`
}

function labelMagasin(raw: string, magasins: SessionMagasin[]): string {
  const hit = magasins.find((m) => m.code === raw)
  if (hit) return `${hit.nom} (${hit.code})`
  const m = raw.match(/^M(\d+)$/i)
  if (m) return `Magasin ${Number(m[1])}`
  return raw
}

function resolveMagasinCodesForQuery(
  selected: string[],
  available: SessionMagasin[],
): string[] | undefined {
  if (available.length === 0) return [];
  if (selected.length === 0 || selected.length >= available.length) return undefined;
  return selected;
}

function percentOfPart(part: number, whole: number): number | null {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return null;
  return (part / whole) * 100;
}

export default function AnalyseStatsPage() {
  const { session, loading: sessionLoading } = useSessionPermissions()
  const todayIso = useMemo(() => new Date().toISOString().split('T')[0], [])

  const [from, setFrom] = useState(() => firstDayOfMonthIso(new Date().toISOString().split('T')[0]))
  const [to, setTo] = useState(todayIso)
  const [selectedMagasinCodes, setSelectedMagasinCodes] = useState<string[]>([])
  const [categoryIds, setCategoryIds] = useState<string[]>([])
  const [supplierIds, setSupplierIds] = useState<string[]>([])
  const [productNames, setProductNames] = useState<string[]>([])
  const [groupBy, setGroupBy] = useState<VentesAnalyseGroupBy>('produit')
  const [sortKey, setSortKey] = useState<SortKey>('ca')

  const [categories, setCategories] = useState<RefOpt[]>([])
  const [suppliers, setSuppliers] = useState<RefOpt[]>([])
  const [refsLoading, setRefsLoading] = useState(true)

  const [result, setResult] = useState<VentesAnalyseResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasRun, setHasRun] = useState(false)

  const isCaissier = session?.roleSlug === 'caissier'
  const availableMagasins = session?.magasins ?? []

  useEffect(() => {
    if (sessionLoading) return
    let cancelled = false
    setRefsLoading(true)
    ;(async () => {
      try {
        const supabase = createSupabaseBrowserClient()
        const [{ data: cats }, { data: sups }] = await Promise.all([
          supabase.from('ref_category').select('id, label').order('sort_order').order('label'),
          supabase.from('ref_supplier').select('id, label').order('sort_order').order('label'),
        ])
        if (cancelled) return
        setCategories(
          (cats ?? [])
            .map((c) => ({ id: String(c.id), label: String(c.label ?? '—') }))
            .filter((c) => c.id),
        )
        setSuppliers(
          (sups ?? [])
            .map((s) => ({ id: String(s.id), label: String(s.label ?? '—') }))
            .filter((s) => s.id),
        )
      } finally {
        if (!cancelled) setRefsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [sessionLoading])

  useEffect(() => {
    if (sessionLoading || isCaissier) return
    setSelectedMagasinCodes((prev) =>
      prev.length === 0 ? availableMagasins.map((m) => m.code) : prev,
    )
  }, [sessionLoading, isCaissier, availableMagasins])

  const formatMAD = useMemo(() => {
    const nf = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    return (value: unknown) => {
      const n = typeof value === 'number' ? value : Number(value)
      if (!Number.isFinite(n)) return '—'
      return `${nf.format(n)} DH`
    }
  }, [])

  const formatPercent = useMemo(
    () => (value: number | null) => {
      if (value == null || !Number.isFinite(value)) return '—'
      return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(value) + ' %'
    },
    [],
  )

  const formatQty = useMemo(
    () => (value: unknown) => {
      const n = typeof value === 'number' ? value : Number(value)
      if (!Number.isFinite(n)) return '—'
      return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(n)
    },
    [],
  )

  const runAnalyse = useCallback(async () => {
    if (from > to) {
      setError('La date de début doit être antérieure ou égale à la date de fin.')
      return
    }
    setLoading(true)
    setError(null)
    setHasRun(true)

    try {
      const supabase = createSupabaseBrowserClient()
      const magasinCodes = isCaissier
        ? availableMagasins.map((m) => m.code)
        : resolveMagasinCodesForQuery(selectedMagasinCodes, availableMagasins)

      const res = await fetchVentesAnalyse(supabase, {
        from,
        to,
        magasinCodes,
        categoryIds,
        supplierIds,
        productNames,
      })

      if ('error' in res) {
        setError(res.error)
        setResult(null)
      } else {
        setResult(res.data)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
      setResult(null)
    } finally {
      setLoading(false)
    }
  }, [
    from,
    to,
    isCaissier,
    availableMagasins,
    selectedMagasinCodes,
    categoryIds,
    supplierIds,
    productNames,
  ])

  const tableRows: VentesAnalyseRow[] = useMemo(() => {
    if (!result) return []
    const grouped = groupAnalyseLines(result.lines, groupBy)
    return [...grouped].sort((a, b) => {
      const va = sortKey === 'ca' ? a.ca : a.qty
      const vb = sortKey === 'ca' ? b.ca : b.qty
      return vb - va || a.label.localeCompare(b.label, 'fr')
    })
  }, [result, groupBy, sortKey])

  const dailyChartPoints = useMemo(() => {
    if (!result) return []
    if (sortKey === 'ca') {
      return result.dailyCa
    }
    return fillDailyRange(result.from, result.to, buildDailySeriesFromLines(result.lines, 'qty'))
  }, [result, sortKey])

  /** Catégorie / fournisseur / produit : sans eux, % filtre = % période (colonne inutile). */
  const hasScopedProductFilters = useMemo(
    () => categoryIds.length > 0 || supplierIds.length > 0 || productNames.length > 0,
    [categoryIds, supplierIds, productNames],
  )

  const kpis = useMemo(() => {
    if (!result) return null
    const totalCa = result.lines.reduce((acc, l) => acc + l.ca, 0)
    const daysInRange = result.dailyCa.length
    const daysWithCa = result.dailyCa.filter((d) => d.total > 0).length
    const avgCaPerDay = daysWithCa > 0 ? totalCa / daysWithCa : 0
    return {
      totalCa,
      daysInRange,
      daysWithCa,
      avgCaPerDay,
      rowCount: tableRows.length,
      caPercentOfPeriod: result.caPercentOfPeriod,
      totalCaPeriod: result.totalCaPeriod,
    }
  }, [result, tableRows.length])

  const handleMagasinChange = (e: SelectChangeEvent<string[]>) => {
    const v = e.target.value
    setSelectedMagasinCodes(typeof v === 'string' ? v.split(',') : v)
  }

  const handleCategoryChange = (e: SelectChangeEvent<string[]>) => {
    const v = e.target.value
    setCategoryIds(typeof v === 'string' ? v.split(',') : v)
  }

  const handleSupplierChange = (e: SelectChangeEvent<string[]>) => {
    const v = e.target.value
    setSupplierIds(typeof v === 'string' ? v.split(',') : v)
  }

  if (sessionLoading || refsLoading) {
    return (
      <main className="min-h-[calc(100vh-0px)] flex items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-rose-50 px-6 py-16">
        <p className="text-slate-600">Chargement…</p>
      </main>
    )
  }

  return (
    <main className="min-h-[calc(100vh-0px)] bg-gradient-to-br from-emerald-50 via-white to-rose-50 px-6 py-10">
      <div className="mx-auto w-full max-w-6xl">
        <header className="mb-8">
          <Button
            component={AppLink}
            href="/"
            color="inherit"
            size="small"
            startIcon={<ChevronLeftIcon fontSize="small" />}
            sx={{ textTransform: 'none', mb: 1, pl: 0, minHeight: 36, fontWeight: 500 }}
          >
            Accueil
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Analyse Stats</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <Link
              href="/ca"
              className="inline-flex min-h-10 items-center rounded-lg border-2 border-emerald-200 bg-white px-3 py-1.5 text-sm font-bold text-emerald-800 shadow-sm transition hover:border-emerald-400 hover:bg-emerald-50"
            >
              Statistique
            </Link>
            <Link
              href="/historique-ca"
              className="inline-flex min-h-10 items-center rounded-lg border-2 border-emerald-200 bg-white px-3 py-1.5 text-sm font-bold text-emerald-800 shadow-sm transition hover:border-emerald-400 hover:bg-emerald-50"
            >
              Historique
            </Link>
          </div>
          <p className="mt-2 text-sm text-slate-600">
            Analyse des ventes produit sur une période, avec filtres magasin, catégorie, fournisseur et produits.
          </p>
        </header>

        <Paper elevation={0} sx={{ p: 2.5, mb: 3, borderRadius: 3, border: 1, borderColor: 'divider' }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
            Filtres
          </Typography>
          <Stack spacing={2}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="Du"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                slotProps={{ htmlInput: { min: HISTORIQUE_FROM_ISO, max: to } }}
                size="small"
                fullWidth
              />
              <TextField
                label="Au"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                slotProps={{ htmlInput: { min: from, max: todayIso } }}
                size="small"
                fullWidth
              />
            </Stack>

            {availableMagasins.length > 0 ? (
              <FormControl size="small" fullWidth disabled={isCaissier}>
                <InputLabel>Magasins</InputLabel>
                <Select
                  multiple
                  label="Magasins"
                  value={isCaissier ? availableMagasins.map((m) => m.code) : selectedMagasinCodes}
                  onChange={handleMagasinChange}
                  input={<OutlinedInput label="Magasins" />}
                  renderValue={(selected) => {
                    const codes = selected as string[]
                    if (codes.length === 0 || codes.length === availableMagasins.length) {
                      return 'Tous les magasins'
                    }
                    return codes.map((c) => labelMagasin(c, availableMagasins)).join(', ')
                  }}
                >
                  {availableMagasins.map((m) => (
                    <MenuItem key={m.id} value={m.code}>
                      <Checkbox checked={selectedMagasinCodes.includes(m.code)} />
                      <ListItemText primary={`${m.nom} (${m.code})`} />
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            ) : null}

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <FormControl size="small" fullWidth>
                <InputLabel>Catégories</InputLabel>
                <Select
                  multiple
                  label="Catégories"
                  value={categoryIds}
                  onChange={handleCategoryChange}
                  input={<OutlinedInput label="Catégories" />}
                  renderValue={(selected) => {
                    const ids = selected as string[]
                    if (ids.length === 0) return 'Toutes'
                    return ids
                      .map((id) => {
                        if (id === SANS_CATEGORIE) return 'Sans catégorie'
                        return categories.find((c) => c.id === id)?.label ?? id
                      })
                      .join(', ')
                  }}
                >
                  <MenuItem value={SANS_CATEGORIE}>
                    <Checkbox checked={categoryIds.includes(SANS_CATEGORIE)} />
                    <ListItemText primary="Sans catégorie" />
                  </MenuItem>
                  {categories.map((c) => (
                    <MenuItem key={c.id} value={c.id}>
                      <Checkbox checked={categoryIds.includes(c.id)} />
                      <ListItemText primary={c.label} />
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl size="small" fullWidth>
                <InputLabel>Fournisseurs</InputLabel>
                <Select
                  multiple
                  label="Fournisseurs"
                  value={supplierIds}
                  onChange={handleSupplierChange}
                  input={<OutlinedInput label="Fournisseurs" />}
                  renderValue={(selected) => {
                    const ids = selected as string[]
                    if (ids.length === 0) return 'Tous'
                    return ids
                      .map((id) => {
                        if (id === SANS_FOURNISSEUR) return 'Sans fournisseur'
                        return suppliers.find((s) => s.id === id)?.label ?? id
                      })
                      .join(', ')
                  }}
                >
                  <MenuItem value={SANS_FOURNISSEUR}>
                    <Checkbox checked={supplierIds.includes(SANS_FOURNISSEUR)} />
                    <ListItemText primary="Sans fournisseur" />
                  </MenuItem>
                  {suppliers.map((s) => (
                    <MenuItem key={s.id} value={s.id}>
                      <Checkbox checked={supplierIds.includes(s.id)} />
                      <ListItemText primary={s.label} />
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>

            <VentesProductChipsFilter value={productNames} onChange={setProductNames} />

            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
                Regroupement
              </Typography>
              <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                {GROUP_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setGroupBy(opt.value)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                      groupBy === opt.value
                        ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm'
                        : 'border-slate-200 bg-white/90 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </Stack>
            </Box>

            <Button
              variant="contained"
              color="success"
              onClick={() => void runAnalyse()}
              disabled={loading}
              sx={{ alignSelf: 'flex-start', textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
            >
              {loading ? 'Analyse en cours…' : 'Analyser'}
            </Button>
          </Stack>
        </Paper>

        {error ? (
          <Paper sx={{ p: 2, mb: 3, borderRadius: 2, bgcolor: 'rose.50', border: 1, borderColor: 'rose.200' }}>
            <Typography color="error">{error}</Typography>
          </Paper>
        ) : null}

        {hasRun && !loading && result && kpis ? (
          <>
            <Paper
              elevation={0}
              sx={{
                px: 2.5,
                py: 1.5,
                mb: 3,
                borderRadius: 3,
                border: 1,
                borderColor: 'divider',
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: 1.5,
              }}
            >
              <Typography variant="subtitle2" sx={{ fontWeight: 600, flex: 1, minWidth: 120 }}>
                Affichage
              </Typography>
              <Stack direction="row" spacing={1}>
                <Button
                  size="small"
                  variant={sortKey === 'ca' ? 'contained' : 'outlined'}
                  color="success"
                  onClick={() => setSortKey('ca')}
                  sx={{ textTransform: 'none', fontWeight: 600 }}
                >
                  Tri CA
                </Button>
                <Button
                  size="small"
                  variant={sortKey === 'qty' ? 'contained' : 'outlined'}
                  color="success"
                  onClick={() => setSortKey('qty')}
                  sx={{ textTransform: 'none', fontWeight: 600 }}
                >
                  Tri qté
                </Button>
              </Stack>
            </Paper>

            <div className="mb-6 grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3">
              <div className="min-w-0 rounded-2xl border border-emerald-100 bg-white/80 px-3 py-4 shadow-sm backdrop-blur sm:px-5">
                <div className="text-[10px] font-medium uppercase tracking-wide text-emerald-700/80 sm:text-xs">
                  CA total (filtres)
                </div>
                <div className="mt-1 break-words text-lg font-semibold text-slate-900 sm:text-2xl">
                  {formatMAD(kpis.totalCa)}
                </div>
                <div className="mt-1 text-[10px] text-slate-600 sm:text-[11px]">
                  {kpis.caPercentOfPeriod != null ? (
                    <>
                      <span className="font-semibold text-emerald-800">
                        {formatPercent(kpis.caPercentOfPeriod)}
                      </span>
                      {' du CA période '}
                      <span className="font-medium">({formatMAD(kpis.totalCaPeriod)})</span>
                    </>
                  ) : (
                    '— % du CA période'
                  )}
                </div>
              </div>
              <div className="min-w-0 rounded-2xl border border-slate-200 bg-white/80 px-3 py-4 shadow-sm backdrop-blur sm:px-5">
                <div className="text-[10px] font-medium uppercase tracking-wide text-slate-600 sm:text-xs">
                  Moyenne CA / jour
                </div>
                <div className="mt-1 break-words text-lg font-semibold text-slate-900 sm:text-2xl">
                  {formatMAD(kpis.avgCaPerDay)}
                </div>
                <div className="mt-1 text-[10px] text-slate-500 sm:text-[11px]">
                  {kpis.daysWithCa} jour(s) avec CA sur {kpis.daysInRange}
                </div>
              </div>
              <div className="min-w-0 rounded-2xl border border-slate-200 bg-white/80 px-3 py-4 shadow-sm backdrop-blur sm:px-5">
                <div className="text-[10px] font-medium uppercase tracking-wide text-slate-600 sm:text-xs">
                  Lignes affichées
                </div>
                <div className="mt-1 break-words text-lg font-semibold text-slate-900 sm:text-2xl">{kpis.rowCount}</div>
              </div>
            </div>

            {dailyChartPoints.length > 0 ? (
              <Paper elevation={0} sx={{ p: 2.5, mb: 3, borderRadius: 3, border: 1, borderColor: 'divider' }}>
                <CaJourHistogram
                  points={dailyChartPoints}
                  metric={sortKey}
                  title={
                    sortKey === 'ca'
                      ? 'Évolution du CA journalier (filtres)'
                      : 'Évolution des quantités journalières (filtres)'
                  }
                />
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                  KPIs, graphique et tableau reflètent les filtres actifs (magasins, catégories, fournisseurs,
                  produits).
                </Typography>
              </Paper>
            ) : null}

            <Paper elevation={0} sx={{ borderRadius: 3, border: 1, borderColor: 'divider', overflow: 'hidden' }}>
              <Box sx={{ px: 2.5, py: 2 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  Résultats — {GROUP_OPTIONS.find((g) => g.value === groupBy)?.label}
                </Typography>
              </Box>
              {tableRows.length === 0 ? (
                <Box sx={{ p: 3, textAlign: 'center' }}>
                  <Typography color="text.secondary">Aucune vente pour ces filtres sur la période.</Typography>
                </Box>
              ) : (
                <Box sx={{ overflowX: 'auto' }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>
                          {GROUP_OPTIONS.find((g) => g.value === groupBy)?.label ?? 'Libellé'}
                        </TableCell>
                        <TableCell align="right">CA</TableCell>
                        {sortKey === 'ca' ? (
                          <>
                            {hasScopedProductFilters ? (
                              <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                                % filtre
                              </TableCell>
                            ) : null}
                            <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                              % période
                            </TableCell>
                          </>
                        ) : null}
                        <TableCell align="right">Quantité</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {tableRows.map((row) => (
                        <TableRow key={row.label}>
                          <TableCell>
                            {groupBy === 'magasin' ? labelMagasin(row.label, availableMagasins) : row.label}
                          </TableCell>
                          <TableCell align="right">{formatMAD(row.ca)}</TableCell>
                          {sortKey === 'ca' && kpis ? (
                            <>
                              {hasScopedProductFilters ? (
                                <TableCell align="right">
                                  {formatPercent(percentOfPart(row.ca, kpis.totalCa))}
                                </TableCell>
                              ) : null}
                              <TableCell align="right">
                                {formatPercent(percentOfPart(row.ca, kpis.totalCaPeriod))}
                              </TableCell>
                            </>
                          ) : null}
                          <TableCell align="right">{formatQty(row.qty)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Box>
              )}
            </Paper>
          </>
        ) : null}

        {hasRun && !loading && !result && !error ? (
          <Typography color="text.secondary">Aucune donnée disponible.</Typography>
        ) : null}

        <Box sx={{ mt: 4 }}>
          <BackNavButton href="/ca" size="small" variant="outlined">
            Retour Statistique
          </BackNavButton>
        </Box>

        <SyncStatusFooter />
      </div>
    </main>
  )
}
