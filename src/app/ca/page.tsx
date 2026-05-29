'use client'

import { useEffect, useMemo, useState } from 'react'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import { Button, FormControl, InputLabel, MenuItem, Select, Stack, TextField } from '@mui/material'
import type { SelectChangeEvent } from '@mui/material'
import AppLink from '@/components/AppLink'
import FireworksOverlay from '@/components/FireworksOverlay'
import PaniersHeureHistogram from '@/components/PaniersHeureHistogram'
import RecordCaBanner from '@/components/RecordCaBanner'
import SyncStatusFooter from '@/components/SyncStatusFooter'
import { fetchCaDashboardFromSupabase } from '@/lib/ca/fromSupabase'
import { computeTopProduitRankings } from '@/lib/ca/topProduits'
import type { CaResponse } from '@/lib/ca/types'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { useSessionPermissions } from '@/lib/auth/useSessionPermissions'

export default function CaDashboardPage() {
  const { session, loading: sessionLoading } = useSessionPermissions()
  const [data, setData] = useState<CaResponse | null>(null)
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]) // YYYY-MM-DD
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshNonce, setRefreshNonce] = useState(0)
  const [topMagFilter, setTopMagFilter] = useState('all')
  const [topCategoryFilter, setTopCategoryFilter] = useState('all')
  const maxIso = useMemo(() => new Date().toISOString().split('T')[0], [])

  /** Moyenne CA / jour pour le mois affiché : mois passés → jours calendaires ; mois en cours → jours écoulés (aujourd’hui). */
  const monthAvgPerDay = useMemo(() => {
    const month = data?.month
    if (!month) return null
    const tg =
      typeof month.totalGlobal === 'number' ? month.totalGlobal : Number(month.totalGlobal)
    if (!Number.isFinite(tg) || tg <= 0) return null
    const ym = month.ym
    if (typeof ym !== 'string' || !/^\d{4}-\d{2}$/.test(ym)) return null
    const [yy, mm] = ym.split('-').map((x: string) => Number(x))
    const daysInCalendarMonth = new Date(Date.UTC(yy, mm, 0)).getUTCDate()
    const curYm = maxIso.slice(0, 7)
    let denom = daysInCalendarMonth
    if (ym === curYm) {
      denom = Math.max(1, Number(maxIso.slice(8, 10)))
    } else if (ym < curYm) {
      denom = daysInCalendarMonth
    } else {
      denom = Math.max(1, daysInCalendarMonth)
    }
    return { value: tg / denom, daysUsed: denom }
  }, [data?.month, maxIso])
  const formatMAD = useMemo(() => {
    const nf = new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
    return (value: unknown) => {
      const n = typeof value === 'number' ? value : Number(value)
      if (!Number.isFinite(n)) return '—'
      return `${nf.format(n)} DH`
    }
  }, [])

  const formatCount = useMemo(
    () => (value: unknown) => {
      const n = typeof value === 'number' ? value : Number(value)
      if (!Number.isFinite(n)) return '—'
      return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n)
    },
    [],
  )

  const selectedDateLabel = useMemo(() => {
    const d = new Date(`${date}T00:00:00Z`)
    return new Intl.DateTimeFormat('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(d)
  }, [date])

  const monthLabel = useMemo(() => {
    const ym = data?.month?.ym
    if (typeof ym !== 'string' || !/^\d{4}-\d{2}$/.test(ym)) return ''
    const [yy, mm] = ym.split('-').map((x: string) => Number(x))
    const d = new Date(Date.UTC(yy, mm - 1, 1))
    return new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d)
  }, [data?.month?.ym])

  const caissierMagKey =
    session?.roleSlug === 'caissier'
      ? (session.magasins ?? [])
          .map((m) => m.code)
          .sort()
          .join(',')
      : ''

  useEffect(() => {
    if (sessionLoading) return
    let cancelled = false
    setLoading(true)
    setError(null)

    ;(async () => {
      try {
        const supabase = createSupabaseBrowserClient()
        const caOpts =
          session?.roleSlug === 'caissier'
            ? { magasinCodes: (session.magasins ?? []).map((m) => m.code) }
            : undefined
        const res = await fetchCaDashboardFromSupabase(supabase, date, caOpts)
        if (cancelled) return
        if ('error' in res) {
          setError(res.error)
          setData(null)
        } else {
          setData(res.data)
        }
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Erreur inconnue')
        setData(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [date, refreshNonce, sessionLoading, session?.roleSlug, caissierMagKey])

  useEffect(() => {
    setTopMagFilter('all')
    setTopCategoryFilter('all')
  }, [date])

  const topProduitsComputed = useMemo(() => {
    const tp = data?.topProduits
    if (!tp?.available || !tp.lines.length) return null
    return computeTopProduitRankings(
      tp.lines,
      topMagFilter,
      topCategoryFilter,
      tp.filterMagasins,
    )
  }, [data?.topProduits, topMagFilter, topCategoryFilter])

  const topPercentBase = useMemo(() => {
    if (!data) return 0
    if (topMagFilter !== 'all') {
      const magTotal = data.magasins[topMagFilter]?.total
      const n = typeof magTotal === 'number' ? magTotal : Number(magTotal)
      if (Number.isFinite(n) && n > 0) return n
    }
    if (topProduitsComputed?.filteredTotal && topProduitsComputed.filteredTotal > 0) {
      return topProduitsComputed.filteredTotal
    }
    return data.totalGlobal
  }, [data, topMagFilter, topProduitsComputed])

  /* Sans `&& !error` : après échec SSE, `data` reste null → on restait bloqués sur l’écran de chargement au lieu du message d’erreur. */
  if (loading || (!data && !error))
    return (
      <main className="min-h-[calc(100vh-0px)] flex items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-rose-50 px-6 py-16">
        <div className="w-full max-w-md rounded-2xl border border-emerald-100 bg-white/80 p-6 shadow-sm backdrop-blur">
          <div>
            <div className="text-sm font-medium text-emerald-900/80">O&apos;petit frais</div>
            <div className="text-lg font-semibold tracking-tight text-slate-900">
              Chiffre d&apos;affaires
            </div>
          </div>
          <div className="mt-6 h-2 w-full overflow-hidden rounded-full bg-emerald-100">
            <div className="h-full w-1/2 animate-pulse rounded-full bg-emerald-500/70" />
          </div>
          <div className="mt-3 text-sm text-slate-600">Chargement des données…</div>
        </div>
      </main>
    )

  const dataError =
    error ??
    (typeof data?.error === 'string'
      ? data.error
      : data && typeof data === 'object' && !data.magasins
        ? "Données invalides: 'magasins' manquant"
        : null)

  if (dataError) {
    return (
      <main className="min-h-[calc(100vh-0px)] flex items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-rose-50 px-6 py-16">
        <div className="w-full max-w-xl rounded-2xl border border-rose-200 bg-white/90 p-6 shadow-sm backdrop-blur">
          <div>
            <div className="text-sm font-medium text-slate-700">O&apos;petit frais</div>
            <div className="text-lg font-semibold tracking-tight text-slate-900">Impossible de charger</div>
          </div>
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
            {dataError}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700"
            >
              Recharger
            </button>
            <button
              type="button"
              onClick={() => setDate(new Date().toISOString().split('T')[0])}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              Revenir à aujourd&apos;hui
            </button>
          </div>
          <div className="mt-4 text-xs text-slate-600">
            Vérifie la connexion et les variables{' '}
            <span className="font-medium">NEXT_PUBLIC_SUPABASE_URL</span> /{' '}
            <span className="font-medium">NEXT_PUBLIC_SUPABASE_ANON_KEY</span>, ainsi que les politiques RLS pour un
            utilisateur connecté.
          </div>
        </div>
      </main>
    )
  }

  /* Après les gardes ci-dessus, `data` est toujours défini ; garde explicite pour TypeScript. */
  if (!data) return null

  const isoMinusDays = (iso: string, days: number) => {
    const [yy, mm, dd] = iso.split('-').map(x => Number(x))
    if (!yy || !mm || !dd) return iso
    const t = Date.UTC(yy, mm - 1, dd) - days * 24 * 60 * 60 * 1000
    const d = new Date(t)
    const y = d.getUTCFullYear()
    const m = String(d.getUTCMonth() + 1).padStart(2, '0')
    const day = String(d.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }

  const isoAddDays = (iso: string, days: number) => {
    const [yy, mm, dd] = iso.split('-').map(x => Number(x))
    if (!yy || !mm || !dd) return iso
    const t = Date.UTC(yy, mm - 1, dd) + days * 24 * 60 * 60 * 1000
    const d = new Date(t)
    const y = d.getUTCFullYear()
    const m = String(d.getUTCMonth() + 1).padStart(2, '0')
    const day = String(d.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }

  const goPrevDay = () => {
    setDate(prev => isoMinusDays(prev, 1))
  }

  const goNextDay = () => {
    setDate(prev => {
      const next = isoAddDays(prev, 1)
      return next > maxIso ? prev : next
    })
  }

  const outlinedNavButtonSx = {
    borderRadius: 3,
    textTransform: 'none',
    fontWeight: 600,
    bgcolor: 'rgba(255,255,255,0.85)',
  } as const

  const labelMagasin = (raw: string) => {
    const m = raw.match(/^M(\d+)$/i)
    if (!m) return raw
    return `Magasin ${Number(m[1])}`
  }

  const percentOfGlobal = (value: unknown) => {
    const n = typeof value === 'number' ? value : Number(value)
    const g = typeof data?.totalGlobal === 'number' ? data.totalGlobal : Number(data?.totalGlobal)
    if (!Number.isFinite(n) || !Number.isFinite(g) || g <= 0) return 0
    return Math.max(0, Math.min(100, (n / g) * 100))
  }

  const percentOfMonthGlobal = (value: unknown) => {
    const n = typeof value === 'number' ? value : Number(value)
    const g =
      typeof data?.month?.totalGlobal === 'number' ? data.month.totalGlobal : Number(data?.month?.totalGlobal)
    if (!Number.isFinite(n) || !Number.isFinite(g) || g <= 0) return 0
    return Math.max(0, Math.min(100, (n / g) * 100))
  }

  const formatPercent = (pct: number) =>
    `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(pct)}%`

  const topPercentOfBase = (value: unknown) => {
    const n = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(n) || !Number.isFinite(topPercentBase) || topPercentBase <= 0) return 0
    return Math.max(0, Math.min(100, (n / topPercentBase) * 100))
  }

  const compare = data?.compare
  const compareDelta = (current: number, prev: number) => {
    if (!Number.isFinite(current) || !Number.isFinite(prev) || prev === 0) return null
    return ((current - prev) / prev) * 100
  }

  const formatRecordDate = (iso: string) => {
    const d = new Date(`${iso}T00:00:00Z`)
    return new Intl.DateTimeFormat('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(d)
  }

  const month = data?.month

  const showFireworks =
    !!data.isRecordDay || Object.values(data.isRecordDayByMag ?? {}).some(Boolean)

  return (
    <>
      {showFireworks ? <FireworksOverlay active /> : null}
      <main className="min-h-[calc(100vh-0px)] bg-gradient-to-br from-emerald-50 via-white to-rose-50 px-6 py-10">
      <div className="mx-auto w-full max-w-5xl">
        <header className="flex w-full flex-col gap-5">
          <div className="w-full">
            <Button
              component={AppLink}
              href="/"
              color="inherit"
              size="small"
              startIcon={<ChevronLeftIcon fontSize="small" />}
              sx={{
                textTransform: 'none',
                mb: 1,
                pl: 0,
                minHeight: 36,
                fontWeight: 500,
              }}
            >
              Accueil
            </Button>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              Chiffre d&apos;affaires
            </h1>
            <div className="mt-3 text-2xl font-semibold capitalize tracking-tight text-slate-900 sm:text-3xl">
              {selectedDateLabel}
            </div>
          </div>

          <Stack
            direction="row"
            useFlexGap
            spacing={1}
            sx={{ flexWrap: 'wrap', alignItems: 'center' }}
          >
            <Button
              component={AppLink}
              href="/historique-ca"
              variant="contained"
              color="success"
              size="medium"
              sx={{ borderRadius: 3, textTransform: 'none', fontWeight: 600 }}
            >
              Historique
            </Button>
            <Button
              type="button"
              variant="outlined"
              color="success"
              size="medium"
              onClick={() => setRefreshNonce(n => n + 1)}
              sx={outlinedNavButtonSx}
            >
              Actualiser
            </Button>
            <Button
              type="button"
              variant="outlined"
              color="success"
              size="medium"
              onClick={goPrevDay}
              sx={outlinedNavButtonSx}
            >
              J-1
            </Button>
            <TextField
              label="Date"
              type="date"
              value={date}
              size="small"
              onChange={e => setDate(e.target.value)}
              slotProps={{
                htmlInput: { max: maxIso },
                inputLabel: { shrink: true },
              }}
              sx={{
                minWidth: 168,
                '& .MuiOutlinedInput-root': {
                  borderRadius: 3,
                  bgcolor: 'rgba(255,255,255,0.85)',
                },
              }}
            />
            <Button
              type="button"
              variant="outlined"
              color="success"
              size="medium"
              onClick={goNextDay}
              disabled={date >= maxIso}
              sx={outlinedNavButtonSx}
            >
              J+1
            </Button>
          </Stack>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-emerald-100 bg-white/80 px-5 py-4 shadow-sm backdrop-blur">
              <div className="text-xs font-medium uppercase tracking-wide text-emerald-700/80">
                Total global
              </div>
              <div className="mt-1 text-2xl font-semibold text-slate-900">
                {formatMAD(data.totalGlobal)}
              </div>
              {data.isRecordDay ? (
                <RecordCaBanner
                  previousRecord={data.previousRecordDay}
                  formatAmount={v => formatMAD(v)}
                  formatDate={formatRecordDate}
                />
              ) : null}
              {(() => {
                const g = data.panierJourGlobal
                if (!g || g.nbPaniers <= 0) return null
                return (
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-emerald-100 pt-3 text-sm text-slate-600">
                  <span>
                    Paniers :{' '}
                    <span className="font-semibold text-slate-800">
                      {formatCount(g.nbPaniers)}
                    </span>
                  </span>
                  <span>
                    Panier moyen :{' '}
                    <span className="font-semibold text-slate-800">
                      {g.panierMoyen != null ? formatMAD(g.panierMoyen) : '—'}
                    </span>
                  </span>
                </div>
                )
              })()}
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-rose-100">
                <div className="h-full w-full rounded-full bg-rose-500/70" />
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-slate-600">
                <span>100%</span>
                <span className="font-medium text-slate-700">Référence globale</span>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white/80 px-5 py-4 shadow-sm backdrop-blur">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-600">
                Total du mois {monthLabel ? `(${monthLabel})` : ''}
              </div>
              <div className="mt-1 text-2xl font-semibold text-slate-900">{formatMAD(month?.totalGlobal)}</div>
              {monthAvgPerDay != null ? (
                <div className="mt-2 text-sm text-slate-600">
                  Moyenne / jour :{' '}
                  <span className="font-semibold text-slate-800">{formatMAD(monthAvgPerDay.value)}</span>
                  <span className="text-slate-500"> ({monthAvgPerDay.daysUsed} jour(s))</span>
                </div>
              ) : null}
              {(() => {
                const g = month?.panierMoisGlobal
                if (!g || g.nbPaniers <= 0) return null
                return (
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-sm text-slate-600">
                  <span>
                    Paniers :{' '}
                    <span className="font-semibold text-slate-800">
                      {formatCount(g.nbPaniers)}
                    </span>
                  </span>
                  <span>
                    Panier moyen :{' '}
                    <span className="font-semibold text-slate-800">
                      {g.panierMoyen != null ? formatMAD(g.panierMoyen) : '—'}
                    </span>
                  </span>
                </div>
                )
              })()}
            </div>
          </div>
        </header>

        <section className="mt-6 grid gap-5 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm backdrop-blur">
            <div className="text-sm font-semibold text-slate-900">Comparaison</div>
            <div className="mt-1 text-sm text-slate-600">
              Écart du CA global vs J-1 et J-8 (pour la date sélectionnée).
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  J-1 ({compare?.j1?.date ?? '—'})
                </div>
                <div className="mt-1 text-base font-semibold text-slate-900">
                  {formatMAD(compare?.j1?.totalGlobal)}
                </div>
                {(() => {
                  const d = compareDelta(Number(data.totalGlobal), Number(compare?.j1?.totalGlobal))
                  if (d === null) return null
                  const positive = d >= 0
                  return (
                    <div className={`mt-2 text-sm font-semibold ${positive ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {positive ? '+' : ''}
                      {new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(d)}%
                    </div>
                  )
                })()}
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  J-8 ({compare?.j7?.date ?? '—'})
                </div>
                <div className="mt-1 text-base font-semibold text-slate-900">
                  {formatMAD(compare?.j7?.totalGlobal)}
                </div>
                {(() => {
                  const d = compareDelta(Number(data.totalGlobal), Number(compare?.j7?.totalGlobal))
                  if (d === null) return null
                  const positive = d >= 0
                  return (
                    <div className={`mt-2 text-sm font-semibold ${positive ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {positive ? '+' : ''}
                      {new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(d)}%
                    </div>
                  )
                })()}
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8 grid gap-5">
      {Object.entries(data.magasins).map(([mag, magTotals]) => (
            <article
              key={mag}
              className="rounded-2xl border border-emerald-100 bg-white/80 p-5 shadow-sm backdrop-blur"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">{labelMagasin(mag)}</h2>
                  <div className="mt-1 text-sm text-slate-600">Total jour</div>
                </div>
                <div className="rounded-xl bg-emerald-600 px-4 py-2 text-white shadow-sm">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-white/80">
                    Total magasin
                  </div>
                  <div className="text-lg font-semibold">{formatMAD(magTotals.total)}</div>
                </div>
              </div>

              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-rose-100">
                <div
                  className="h-full rounded-full bg-rose-500/70"
                  style={{ width: `${percentOfGlobal(magTotals.total)}%` }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-slate-600">
                <span>{formatPercent(percentOfGlobal(magTotals.total))} du global</span>
                <span className="font-medium text-slate-700">Part du CA global (jour)</span>
              </div>

              {data.isRecordDayByMag?.[mag] ? (
                <RecordCaBanner
                  variant="magasin"
                  previousRecord={data.previousRecordDayByMag?.[mag]}
                  formatAmount={v => formatMAD(v)}
                  formatDate={formatRecordDate}
                />
              ) : null}

              {(() => {
                const pj = data.panierJour?.[mag]
                if (!pj || (pj.nbPaniers <= 0 && pj.panierMoyen == null)) return null
                return (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4 shadow-sm">
                    <div className="text-xs font-medium uppercase tracking-wide text-emerald-800/80">
                      Paniers (jour)
                    </div>
                    <div className="mt-1 text-lg font-semibold text-slate-900">
                      {formatCount(pj.nbPaniers)}
                    </div>
                  </div>
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4 shadow-sm">
                    <div className="text-xs font-medium uppercase tracking-wide text-emerald-800/80">
                      Panier moyen (jour)
                    </div>
                    <div className="mt-1 text-lg font-semibold text-slate-900">
                      {pj.panierMoyen != null ? formatMAD(pj.panierMoyen) : '—'}
                    </div>
                  </div>
                </div>
                )
              })()}

              {(() => {
                const rawHeures = data.panierHeureByMag ?? {}
                const heuresBuckets =
                  rawHeures[mag]?.length
                    ? rawHeures[mag]
                    : Object.entries(rawHeures).find(
                        ([k]) => k.trim().toLowerCase() === mag.trim().toLowerCase(),
                      )?.[1]
                const nbMag = data.panierJour?.[mag]?.nbPaniers ?? 0
                if (heuresBuckets?.length)
                  return (
                    <div className="mt-5 w-full min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <PaniersHeureHistogram
                        buckets={heuresBuckets}
                        title={`${labelMagasin(mag)} — paniers / heure`}
                      />
                    </div>
                  )
                if (nbMag > 0)
                  return (
                    <div className="mt-5 rounded-xl border border-amber-100 bg-amber-50/80 p-4 text-sm text-amber-950">
                      <strong className="font-semibold">Répartition horaire indisponible</strong>
                      <p className="mt-1 text-amber-900/90">
                        Les paniers du jour sont en base ({formatCount(nbMag)}), mais aucune ligne dans{' '}
                        <span className="font-mono text-xs">ca_panier_hour</span> pour ce magasin. Les JSON
                        doivent contenir un tableau <span className="font-mono text-xs">panier_heure</span>{' '}
                        (nombres ou objets avec heure + quantité). Relance{' '}
                        <span className="font-mono text-xs">npm run sync:all</span> après correction du parseur
                        ou des fichiers source.
                      </p>
                    </div>
                  )
                return null
              })()}

              <div
                className={`mt-4 grid gap-3 ${(() => {
                  const pm = month?.panierMois?.[mag]
                  return pm != null && (pm.nbPaniers > 0 || pm.panierMoyen != null)
                })()
                  ? 'sm:grid-cols-2 lg:grid-cols-3'
                  : 'sm:grid-cols-2'}`}
              >
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Total mois magasin</div>
                  <div className="mt-1 text-base font-semibold text-slate-900">
                    {formatMAD(month?.magasins?.[mag])}
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-rose-100">
                    <div
                      className="h-full rounded-full bg-rose-500/60"
                      style={{ width: `${percentOfMonthGlobal(month?.magasins?.[mag])}%` }}
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-slate-600">
                    <span>{formatPercent(percentOfMonthGlobal(month?.magasins?.[mag]))}</span>
                    <span>du mois global</span>
                  </div>
                </div>
                {(() => {
                  const pm = month?.panierMois?.[mag]
                  if (!pm || (pm.nbPaniers <= 0 && pm.panierMoyen == null)) return null
                  return (
                  <>
                    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Paniers (mois)
                      </div>
                      <div className="mt-1 text-base font-semibold text-slate-900">
                        {formatCount(pm.nbPaniers)}
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Panier moyen (mois)
                      </div>
                      <div className="mt-1 text-base font-semibold text-slate-900">
                        {pm.panierMoyen != null ? formatMAD(pm.panierMoyen) : '—'}
                      </div>
                    </div>
                  </>
                  )
                })()}
              </div>
            </article>
          ))}
        </section>

        <section className="mt-10 rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm backdrop-blur">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">TOP 10 ventes produits</h2>
              <p className="mt-1 text-sm text-slate-600">
                Classements par chiffre d&apos;affaires et par quantité (sur la date sélectionnée).
              </p>
            </div>
            {data.topProduits?.available ? (
              <Stack direction="row" useFlexGap spacing={1} sx={{ flexWrap: 'wrap' }}>
                <FormControl size="small" sx={{ minWidth: 160 }}>
                  <InputLabel id="top-magasin-label">Magasin</InputLabel>
                  <Select
                    labelId="top-magasin-label"
                    label="Magasin"
                    value={topMagFilter}
                    onChange={(e: SelectChangeEvent) => setTopMagFilter(e.target.value)}
                    sx={{ bgcolor: 'rgba(255,255,255,0.85)', borderRadius: 2 }}
                  >
                    <MenuItem value="all">Tous les magasins</MenuItem>
                    {data.topProduits.filterMagasins.map(mag => (
                      <MenuItem key={mag} value={mag}>
                        {labelMagasin(mag)}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl size="small" sx={{ minWidth: 180 }}>
                  <InputLabel id="top-category-label">Catégorie</InputLabel>
                  <Select
                    labelId="top-category-label"
                    label="Catégorie"
                    value={topCategoryFilter}
                    onChange={(e: SelectChangeEvent) => setTopCategoryFilter(e.target.value)}
                    sx={{ bgcolor: 'rgba(255,255,255,0.85)', borderRadius: 2 }}
                  >
                    <MenuItem value="all">Toutes les catégories</MenuItem>
                    {data.topProduits.filterCategories.map(cat => (
                      <MenuItem key={cat.id} value={cat.id}>
                        {cat.label}
                      </MenuItem>
                    ))}
                    <MenuItem value="__none__">Sans catégorie</MenuItem>
                  </Select>
                </FormControl>
              </Stack>
            ) : null}
          </div>

          {!data?.topProduits?.available ? (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
              Aucune ligne produit pour cette date dans Supabase (<span className="font-medium">ca_product_day</span>
              ).
            </div>
          ) : !topProduitsComputed || (topProduitsComputed.byCa.length === 0 && topProduitsComputed.byQty.length === 0) ? (
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              Aucun produit pour ces filtres.
            </div>
          ) : (
            <div
              className={`mt-5 grid gap-5 ${topProduitsComputed.mode === 'pivot' ? '' : 'lg:grid-cols-2'}`}
            >
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-sm font-semibold text-slate-900">Par chiffre d&apos;affaires</div>
                <p className="mt-0.5 text-xs text-slate-500">
                  {topProduitsComputed.mode === 'pivot'
                    ? 'CA par magasin et total — % = part du CA global du jour.'
                    : '% = part du CA filtré (magasin / catégorie).'}
                </p>
                <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                      <tr>
                        <th className="px-3 py-2 text-left">Produit</th>
                        {topProduitsComputed.mode === 'pivot'
                          ? topProduitsComputed.magasins.map(mag => (
                              <th key={`ca-h-${mag}`} className="whitespace-nowrap px-3 py-2 text-right">
                                {labelMagasin(mag)}
                              </th>
                            ))
                          : null}
                        <th className="whitespace-nowrap px-3 py-2 text-right">
                          {topProduitsComputed.mode === 'pivot' ? 'Total' : 'CA'}
                        </th>
                        <th className="px-3 py-2 text-right">% jour</th>
                        {topProduitsComputed.mode === 'simple' ? (
                          <th className="px-3 py-2 text-right">Qté</th>
                        ) : null}
                      </tr>
                    </thead>
                    <tbody>
                      {topProduitsComputed.mode === 'pivot'
                        ? topProduitsComputed.byCa.map(r => (
                            <tr key={`ca-${r.name}`} className="border-t border-slate-100">
                              <td className="whitespace-nowrap px-3 py-2 text-slate-900">{r.name}</td>
                              {topProduitsComputed.magasins.map(mag => {
                                const v = r.byMag[mag]?.ca ?? 0
                                return (
                                  <td key={`ca-${r.name}-${mag}`} className="whitespace-nowrap px-3 py-2 text-right text-slate-700">
                                    {v > 0 ? formatMAD(v) : '—'}
                                  </td>
                                )
                              })}
                              <td className="whitespace-nowrap px-3 py-2 text-right font-semibold text-slate-900">
                                {formatMAD(r.totalCa)}
                              </td>
                              <td className="whitespace-nowrap px-3 py-2 text-right text-slate-700">
                                {formatPercent(topPercentOfBase(r.totalCa))}
                              </td>
                            </tr>
                          ))
                        : topProduitsComputed.byCa.map(r => (
                            <tr key={`ca-${r.name}`} className="border-t border-slate-100">
                              <td className="px-3 py-2 text-slate-900">{r.name}</td>
                              <td className="px-3 py-2 text-right font-semibold text-slate-900">{formatMAD(r.ca)}</td>
                              <td className="px-3 py-2 text-right text-slate-700">
                                {formatPercent(topPercentOfBase(r.ca))}
                              </td>
                              <td className="px-3 py-2 text-right text-slate-700">
                                {new Intl.NumberFormat('fr-FR').format(r.qty)}
                              </td>
                            </tr>
                          ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-sm font-semibold text-slate-900">Par quantité</div>
                <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                      <tr>
                        <th className="px-3 py-2 text-left">Produit</th>
                        {topProduitsComputed.mode === 'pivot'
                          ? topProduitsComputed.magasins.map(mag => (
                              <th key={`qty-h-${mag}`} className="whitespace-nowrap px-3 py-2 text-right">
                                {labelMagasin(mag)}
                              </th>
                            ))
                          : null}
                        <th className="whitespace-nowrap px-3 py-2 text-right">
                          {topProduitsComputed.mode === 'pivot' ? 'Total' : 'Qté'}
                        </th>
                        {topProduitsComputed.mode === 'simple' ? (
                          <th className="px-3 py-2 text-right">CA</th>
                        ) : null}
                      </tr>
                    </thead>
                    <tbody>
                      {topProduitsComputed.mode === 'pivot'
                        ? topProduitsComputed.byQty.map(r => (
                            <tr key={`qty-${r.name}`} className="border-t border-slate-100">
                              <td className="whitespace-nowrap px-3 py-2 text-slate-900">{r.name}</td>
                              {topProduitsComputed.magasins.map(mag => {
                                const v = r.byMag[mag]?.qty ?? 0
                                return (
                                  <td key={`qty-${r.name}-${mag}`} className="whitespace-nowrap px-3 py-2 text-right text-slate-700">
                                    {v > 0 ? new Intl.NumberFormat('fr-FR').format(v) : '—'}
                                  </td>
                                )
                              })}
                              <td className="whitespace-nowrap px-3 py-2 text-right font-semibold text-slate-900">
                                {new Intl.NumberFormat('fr-FR').format(r.totalQty)}
                              </td>
                            </tr>
                          ))
                        : topProduitsComputed.byQty.map(r => (
                            <tr key={`qty-${r.name}`} className="border-t border-slate-100">
                              <td className="px-3 py-2 text-slate-900">{r.name}</td>
                              <td className="px-3 py-2 text-right font-semibold text-slate-900">
                                {new Intl.NumberFormat('fr-FR').format(r.qty)}
                              </td>
                              <td className="px-3 py-2 text-right text-slate-700">{formatMAD(r.ca)}</td>
                            </tr>
                          ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </section>

        <SyncStatusFooter />
      </div>
    </main>
    </>
  )
}