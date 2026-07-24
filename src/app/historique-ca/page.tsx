'use client'

import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import { Button } from '@mui/material'
import Link from 'next/link'
import AppLink from '@/components/AppLink'
import BackNavButton from '@/components/BackNavButton'
import { useEffect, useMemo, useRef, useState } from 'react'
import { HISTORIQUE_FROM_ISO } from '@/lib/ca/constants'
import { fetchHistoriqueFromSupabase } from '@/lib/ca/fromSupabase'
import type { HistoriqueDayRow, HistoriquePayload } from '@/lib/ca/types'
import { maybeAutoSyncIfStale } from '@/lib/sync/maybeAutoSyncIfStale'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import SyncStatusFooter from '@/components/SyncStatusFooter'
import { useSessionPermissions } from '@/lib/auth/useSessionPermissions'

type DayRow = HistoriqueDayRow

type PeriodFilter = '2026' | '2025' | 'tous'

const labelMagasin = (raw: string) => {
  const m = raw.match(/^M(\d+)$/i)
  if (!m) return raw
  return `Magasin ${Number(m[1])}`
}

const isoToUtcDate = (iso: string) => new Date(`${iso}T00:00:00Z`)

const monthKey = (iso: string) => iso.slice(0, 7) // YYYY-MM

export default function HistoriqueCA() {
  const { session, loading: sessionLoading } = useSessionPermissions()
  const [data, setData] = useState<HistoriquePayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loadHint, setLoadHint] = useState('Chargement…')
  const isFirstVisitRef = useRef(true)
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('2026')

  const todayIso = useMemo(() => new Date().toISOString().split('T')[0], [])

  const scopedMagKey =
    session?.magasinsRestricted
      ? (session.magasins ?? [])
          .map((m) => m.code)
          .sort()
          .join(',')
      : ''

  const filteredDays = useMemo(() => {
    if (!data || 'error' in data) return []
    const days = data.days ?? []
    if (periodFilter === 'tous') return days
    return days.filter((d) => d.date.startsWith(periodFilter))
  }, [data, periodFilter])

  const formatMAD = useMemo(() => {
    const nf = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
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

  const formatPct = useMemo(() => {
    const nf = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    return (value: unknown) => {
      const n = typeof value === 'number' ? value : Number(value)
      if (!Number.isFinite(n)) return '—'
      return `${nf.format(n)} %`
    }
  }, [])

  const benefitPctOfCa = (benefit: number, ca: unknown) => {
    const n = typeof ca === 'number' ? ca : Number(ca)
    if (!Number.isFinite(benefit) || !Number.isFinite(n) || n <= 0) return null
    return (benefit / n) * 100
  }

  useEffect(() => {
    if (sessionLoading) return
    let cancelled = false
    setLoading(true)
    setError(null)

    ;(async () => {
      try {
        if (isFirstVisitRef.current) {
          isFirstVisitRef.current = false
          setLoadHint('Vérification synchronisation FTP (si > 15 min depuis la dernière)…')
          await maybeAutoSyncIfStale()
        }
        if (cancelled) return

        setLoadHint('Chargement CA et bénéfice estimé…')
        const supabase = createSupabaseBrowserClient()
        const caOpts =
          session?.magasinsRestricted
            ? { magasinCodes: (session.magasins ?? []).map((m) => m.code) }
            : undefined
        const res = await fetchHistoriqueFromSupabase(supabase, HISTORIQUE_FROM_ISO, todayIso, caOpts)
        if (cancelled) return
        if ('error' in res) {
          setError(res.error)
          setData({ error: res.error })
        } else {
          setData(res.data)
        }
      } catch (e) {
        if (cancelled) return
        const msg = e instanceof Error ? e.message : 'Erreur inconnue'
        setError(msg)
        setData({ error: msg })
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [todayIso, sessionLoading, session?.magasinsRestricted, scopedMagKey])

  const computed = useMemo(() => {
    if (!data || 'error' in data) return null

    const days = filteredDays
    const totalGlobal = days.reduce((acc, d) => acc + (Number.isFinite(d.totalGlobal) ? d.totalGlobal : 0), 0)
    const totalPaniers = days.reduce(
      (acc, d) => acc + (Number.isFinite(d.nbPaniersGlobal) ? d.nbPaniersGlobal : 0),
      0,
    )
    const totalBenefit = days.reduce(
      (acc, d) => acc + (Number.isFinite(d.totalBenefit) ? d.totalBenefit : 0),
      0,
    )
    const totalCaWithMargin = days.reduce(
      (acc, d) => acc + (Number.isFinite(d.caWithMargin) ? d.caWithMargin : 0),
      0,
    )
    const avgPerDay = days.length ? totalGlobal / days.length : 0
    const avgPaniersPerDay = days.length ? totalPaniers / days.length : 0
    const avgBenefitPerDay = days.length ? totalBenefit / days.length : 0

    const months = new Map<
      string,
      {
        ym: string
        days: DayRow[]
        total: number
        totalPaniers: number
        totalBenefit: number
        caWithMargin: number
        avg: number
        avgPaniers: number
        avgBenefit: number
        caByMag: Record<string, number>
        paniersByMag: Record<string, number>
        benefitByMag: Record<string, number>
        caWithMarginByMag: Record<string, number>
        maxDay?: string
        minDay?: string
      }
    >()

    for (const d of days) {
      const ym = monthKey(d.date)
      if (!months.has(ym)) {
        months.set(ym, {
          ym,
          days: [],
          total: 0,
          totalPaniers: 0,
          totalBenefit: 0,
          caWithMargin: 0,
          avg: 0,
          avgPaniers: 0,
          avgBenefit: 0,
          caByMag: {},
          paniersByMag: {},
          benefitByMag: {},
          caWithMarginByMag: {},
        })
      }
      const m = months.get(ym)!
      m.days.push(d)
      m.total += d.totalGlobal
      m.totalPaniers += Number.isFinite(d.nbPaniersGlobal) ? d.nbPaniersGlobal : 0
      m.totalBenefit += Number.isFinite(d.totalBenefit) ? d.totalBenefit : 0
      m.caWithMargin += Number.isFinite(d.caWithMargin) ? d.caWithMargin : 0
      for (const [mag, rawCa] of Object.entries(d.magasins)) {
        const ca = typeof rawCa === 'number' ? rawCa : Number(rawCa)
        if (!Number.isFinite(ca)) continue
        m.caByMag[mag] = (m.caByMag[mag] ?? 0) + ca
      }
      for (const [mag, rawNb] of Object.entries(d.magasinsNbPaniers)) {
        const nb = typeof rawNb === 'number' ? rawNb : Number(rawNb)
        if (!Number.isFinite(nb)) continue
        m.paniersByMag[mag] = (m.paniersByMag[mag] ?? 0) + nb
      }
      for (const [mag, rawBen] of Object.entries(d.magasinsBenefit ?? {})) {
        const ben = typeof rawBen === 'number' ? rawBen : Number(rawBen)
        if (!Number.isFinite(ben)) continue
        m.benefitByMag[mag] = (m.benefitByMag[mag] ?? 0) + ben
      }
      for (const [mag, rawCaM] of Object.entries(d.magasinsCaWithMargin ?? {})) {
        const caM = typeof rawCaM === 'number' ? rawCaM : Number(rawCaM)
        if (!Number.isFinite(caM)) continue
        m.caWithMarginByMag[mag] = (m.caWithMarginByMag[mag] ?? 0) + caM
      }
    }

    for (const m of months.values()) {
      m.days.sort((a, b) => a.date.localeCompare(b.date))
      m.avg = m.days.length ? m.total / m.days.length : 0
      m.avgPaniers = m.days.length ? m.totalPaniers / m.days.length : 0
      m.avgBenefit = m.days.length ? m.totalBenefit / m.days.length : 0
      if (m.days.length) {
        let max = m.days[0]
        let min = m.days[0]
        for (const d of m.days) {
          if (d.totalGlobal > max.totalGlobal) max = d
          if (d.totalGlobal < min.totalGlobal) min = d
        }
        m.maxDay = max.date
        m.minDay = min.date
      }
    }

    const monthList = Array.from(months.values()).sort((a, b) => b.ym.localeCompare(a.ym))
    const monthCount = monthList.length
    const avgPerMonth = monthCount > 0 ? totalGlobal / monthCount : 0
    const avgPaniersPerMonth = monthCount > 0 ? totalPaniers / monthCount : 0
    const avgBenefitPerMonth = monthCount > 0 ? totalBenefit / monthCount : 0

    const sortedDates = [...days].sort((a, b) => a.date.localeCompare(b.date))
    const from = sortedDates[0]?.date ?? null
    const to = sortedDates[sortedDates.length - 1]?.date ?? null

    let recordDay: { date: string; totalGlobal: number } | null = null
    for (const d of days) {
      if (!Number.isFinite(d.totalGlobal)) continue
      if (!recordDay || d.totalGlobal > recordDay.totalGlobal) {
        recordDay = { date: d.date, totalGlobal: d.totalGlobal }
      }
    }

    const recordByMag = new Map<string, { date: string; total: number }>()
    for (const d of days) {
      for (const [mag, rawTotal] of Object.entries(d.magasins)) {
        const total = typeof rawTotal === 'number' ? rawTotal : Number(rawTotal)
        if (!Number.isFinite(total)) continue
        const cur = recordByMag.get(mag)
        if (!cur || total > cur.total) {
          recordByMag.set(mag, { date: d.date, total })
        }
      }
    }
    const recordDaysByMagasin = Array.from(recordByMag.entries())
      .map(([mag, { date, total }]) => ({ mag, date, total }))
      .sort((a, b) => a.mag.localeCompare(b.mag))

    return {
      days,
      totalGlobal,
      totalPaniers,
      totalBenefit,
      totalCaWithMargin,
      avgPerDay,
      avgPaniersPerDay,
      avgBenefitPerDay,
      avgPerMonth,
      avgPaniersPerMonth,
      avgBenefitPerMonth,
      monthList,
      recordDay,
      recordDaysByMagasin,
      from,
      to,
      dataFrom: data.from,
      dataTo: data.to,
    }
  }, [data, filteredDays])

  const monthLabel = (ym: string) => {
    if (!/^\d{4}-\d{2}$/.test(ym)) return ym
    const [yy, mm] = ym.split('-').map(x => Number(x))
    const d = new Date(Date.UTC(yy, mm - 1, 1))
    return new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d)
  }

  const dayLabel = (iso: string) =>
    new Intl.DateTimeFormat('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(isoToUtcDate(iso))

  const shortDayLabel = (iso: string) =>
    new Intl.DateTimeFormat('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(isoToUtcDate(iso))

  if (loading) {
    return (
      <main className="min-h-[calc(100vh-0px)] flex items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-rose-50 px-6 py-16">
        <div className="w-full max-w-md rounded-2xl border border-emerald-100 bg-white/80 p-6 shadow-sm backdrop-blur">
          <div>
            <div className="text-sm font-medium text-emerald-900/80">O&apos; Petit Frais</div>
            <div className="text-lg font-semibold tracking-tight text-slate-900">Historique CA</div>
          </div>
          <div className="mt-6 h-2 w-full overflow-hidden rounded-full bg-emerald-100">
            <div className="h-full w-1/2 animate-pulse rounded-full bg-emerald-500/70" />
          </div>
          <div className="mt-3 text-sm text-slate-600">{loadHint}</div>
        </div>
      </main>
    )
  }

  const err =
    error ??
    (data && 'error' in data && typeof data.error === 'string' ? data.error : null) ??
    (!computed ? 'Données indisponibles' : null)

  if (err || !computed) {
    return (
      <main className="min-h-[calc(100vh-0px)] flex items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-rose-50 px-6 py-16">
        <div className="w-full max-w-xl rounded-2xl border border-rose-200 bg-white/90 p-6 shadow-sm backdrop-blur">
          <div className="text-lg font-semibold text-slate-900">Impossible de charger l’historique</div>
          <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">{err}</div>
          <div className="mt-3 text-xs text-slate-600">
            Vérifie <span className="font-medium">NEXT_PUBLIC_SUPABASE_URL</span>,{' '}
            <span className="font-medium">NEXT_PUBLIC_SUPABASE_ANON_KEY</span> et la session (RLS).
          </div>
          <div className="mt-4">
            <BackNavButton href="/" size="small" variant="outlined">
              Revenir au tableau de bord
            </BackNavButton>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-[calc(100vh-0px)] bg-gradient-to-br from-emerald-50 via-white to-rose-50 px-6 py-10">
      <div className="mx-auto w-full max-w-5xl">
        <header className="flex w-full flex-col gap-5">
          <div className="w-full min-w-0">
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
            <h1 className="w-full text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              Historique chiffre d’affaires
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <Link
                href="/ca"
                className="inline-flex min-h-10 items-center rounded-lg border-2 border-emerald-200 bg-white px-3 py-1.5 text-sm font-bold text-emerald-800 shadow-sm transition hover:border-emerald-400 hover:bg-emerald-50"
              >
                Statistique
              </Link>
              <Link
                href="/analyse-stats"
                className="inline-flex min-h-10 items-center rounded-lg border-2 border-emerald-200 bg-white px-3 py-1.5 text-sm font-bold text-emerald-800 shadow-sm transition hover:border-emerald-400 hover:bg-emerald-50"
              >
                Analyse Stats
              </Link>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              Données chargées : <span className="font-medium">{computed.dataFrom}</span> →{' '}
              <span className="font-medium">{computed.dataTo}</span>
            </p>
            <p className="mt-1 text-sm text-slate-600">
              Période affichée :{' '}
              {computed.from && computed.to ? (
                <>
                  <span className="font-medium">{computed.from}</span> → <span className="font-medium">{computed.to}</span>
                </>
              ) : (
                <span className="font-medium text-slate-500">aucun jour pour ce filtre</span>
              )}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Période</span>
              {(['2026', '2025', 'tous'] as const).map(key => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPeriodFilter(key)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                    periodFilter === key
                      ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm'
                      : 'border-slate-200 bg-white/90 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {key === 'tous' ? 'Tous' : key}
                </button>
              ))}
            </div>
          </div>

          <div className="grid w-full min-w-0 grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            <div className="min-w-0 rounded-2xl border border-emerald-100 bg-white/80 px-3 py-4 shadow-sm backdrop-blur sm:px-5">
              <div className="text-[10px] font-medium uppercase tracking-wide text-emerald-700/80 sm:text-xs">
                Total global
              </div>
              <div className="mt-1 break-words text-lg font-semibold text-slate-900 sm:text-2xl">
                {formatMAD(computed.totalGlobal)}
              </div>
            </div>
            <div className="min-w-0 rounded-2xl border border-slate-200 bg-white/80 px-3 py-4 shadow-sm backdrop-blur sm:px-5">
              <div className="text-[10px] font-medium uppercase tracking-wide text-slate-600 sm:text-xs">Moyenne / jour</div>
              <div className="mt-1 break-words text-lg font-semibold text-slate-900 sm:text-2xl">
                {formatMAD(computed.avgPerDay)}
              </div>
            </div>
            <div className="min-w-0 rounded-2xl border border-slate-200 bg-white/80 px-3 py-4 shadow-sm backdrop-blur sm:px-5">
              <div className="text-[10px] font-medium uppercase tracking-wide text-slate-600 sm:text-xs">Moyenne / mois</div>
              <div className="mt-1 break-words text-lg font-semibold text-slate-900 sm:text-2xl">
                {formatMAD(computed.avgPerMonth)}
              </div>
              <div className="mt-1 text-[10px] leading-tight text-slate-500 sm:text-[11px]">
                {computed.monthList.length} mois avec données
              </div>
            </div>
            <div className="min-w-0 rounded-2xl border border-amber-200 bg-amber-50/80 px-3 py-4 shadow-sm backdrop-blur sm:px-5">
              <div className="text-[10px] font-medium uppercase tracking-wide text-amber-800/80 sm:text-xs">Jour record</div>
              <div className="mt-1 break-words text-lg font-semibold text-slate-900 sm:text-2xl">
                {computed.recordDay ? formatMAD(computed.recordDay.totalGlobal) : '—'}
              </div>
              {computed.recordDay ? (
                <div className="mt-1 text-[10px] leading-tight capitalize text-slate-600 sm:text-[11px]">
                  {dayLabel(computed.recordDay.date)}
                </div>
              ) : null}
            </div>
            <div className="min-w-0 rounded-2xl border border-violet-100 bg-white/80 px-3 py-4 shadow-sm backdrop-blur sm:px-5">
              <div className="text-[10px] font-medium uppercase tracking-wide text-violet-700/80 sm:text-xs">
                Paniers total
              </div>
              <div className="mt-1 break-words text-lg font-semibold text-slate-900 sm:text-2xl">
                {formatCount(computed.totalPaniers)}
              </div>
            </div>
            <div className="min-w-0 rounded-2xl border border-violet-100 bg-white/80 px-3 py-4 shadow-sm backdrop-blur sm:px-5">
              <div className="text-[10px] font-medium uppercase tracking-wide text-violet-700/80 sm:text-xs">
                Moy. paniers / jour
              </div>
              <div className="mt-1 break-words text-lg font-semibold text-slate-900 sm:text-2xl">
                {formatCount(computed.avgPaniersPerDay)}
              </div>
            </div>
            <div className="min-w-0 rounded-2xl border border-violet-100 bg-white/80 px-3 py-4 shadow-sm backdrop-blur sm:px-5">
              <div className="text-[10px] font-medium uppercase tracking-wide text-violet-700/80 sm:text-xs">
                Moy. paniers / mois
              </div>
              <div className="mt-1 break-words text-lg font-semibold text-slate-900 sm:text-2xl">
                {formatCount(computed.avgPaniersPerMonth)}
              </div>
              <div className="mt-1 text-[10px] leading-tight text-slate-500 sm:text-[11px]">
                {computed.monthList.length} mois avec données
              </div>
            </div>
            <div className="min-w-0 rounded-2xl border border-teal-200 bg-teal-50/70 px-3 py-4 shadow-sm backdrop-blur sm:px-5">
              <div className="text-[10px] font-medium uppercase tracking-wide text-teal-800/80 sm:text-xs">
                Bénéfice estimé
              </div>
              <div className="mt-1 break-words text-lg font-semibold text-slate-900 sm:text-2xl">
                {formatMAD(computed.totalBenefit)}
              </div>
              {(() => {
                const pctTotal = benefitPctOfCa(computed.totalBenefit, computed.totalGlobal)
                const pctScoped = benefitPctOfCa(computed.totalBenefit, computed.totalCaWithMargin)
                if (pctTotal == null && pctScoped == null) return null
                return (
                  <div className="mt-1 text-[10px] leading-tight text-teal-900/80 sm:text-[11px]">
                    {pctTotal != null ? `${formatPct(pctTotal)} du CA` : null}
                    {pctTotal != null && pctScoped != null ? ' · ' : null}
                    {pctScoped != null ? `${formatPct(pctScoped)} du CA avec marge` : null}
                  </div>
                )
              })()}
            </div>
            <div className="min-w-0 rounded-2xl border border-teal-200 bg-white/80 px-3 py-4 shadow-sm backdrop-blur sm:px-5">
              <div className="text-[10px] font-medium uppercase tracking-wide text-teal-700/80 sm:text-xs">
                Moy. bénéfice / jour
              </div>
              <div className="mt-1 break-words text-lg font-semibold text-slate-900 sm:text-2xl">
                {formatMAD(computed.avgBenefitPerDay)}
              </div>
            </div>
            <div className="min-w-0 rounded-2xl border border-teal-200 bg-white/80 px-3 py-4 shadow-sm backdrop-blur sm:px-5">
              <div className="text-[10px] font-medium uppercase tracking-wide text-teal-700/80 sm:text-xs">
                Moy. bénéfice / mois
              </div>
              <div className="mt-1 break-words text-lg font-semibold text-slate-900 sm:text-2xl">
                {formatMAD(computed.avgBenefitPerMonth)}
              </div>
              <div className="mt-1 text-[10px] leading-tight text-slate-500 sm:text-[11px]">
                produits avec marge renseignée uniquement
              </div>
            </div>
          </div>

          {computed.recordDaysByMagasin.length > 0 ? (
            <div className="w-full min-w-0">
              <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                Jour record par magasin
              </div>
              <div className="mt-1.5 grid w-full min-w-0 grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
                {computed.recordDaysByMagasin.map(rec => (
                  <div
                    key={rec.mag}
                    className="min-w-0 rounded-lg border border-amber-200/70 bg-amber-50/50 px-2 py-1.5"
                  >
                    <div className="truncate text-[9px] font-medium uppercase tracking-wide text-amber-900/75">
                      {labelMagasin(rec.mag)}
                    </div>
                    <div className="mt-0.5 truncate text-xs font-semibold text-slate-900">
                      {formatMAD(rec.total)}
                    </div>
                    <div className="mt-0.5 truncate text-[9px] capitalize text-slate-500">
                      {shortDayLabel(rec.date)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </header>

        <section className="mt-8 grid gap-4">
          {computed.monthList.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white/80 p-6 text-center text-sm text-slate-600">
              Aucune donnée pour ce filtre de période.
            </div>
          ) : null}
          {computed.monthList.map(m => (
            <details
              key={m.ym}
              className="group rounded-2xl border border-emerald-100 bg-white/80 p-5 shadow-sm backdrop-blur open:bg-white"
            >
              <summary className="cursor-pointer list-none">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-lg font-semibold capitalize text-slate-900">{monthLabel(m.ym)}</div>
                    <div className="mt-1 text-sm text-slate-600">{m.days.length} jour(s)</div>
                  </div>
                  <div className="flex w-full min-w-0 flex-col gap-2 sm:max-w-2xl">
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                      <div className="rounded-xl bg-emerald-600 px-4 py-2 text-white shadow-sm">
                        <div className="text-[11px] font-medium uppercase tracking-wide text-white/80">Total mois</div>
                        <div className="text-lg font-semibold">{formatMAD(m.total)}</div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white px-4 py-2 shadow-sm">
                        <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                          Moyenne / jour
                        </div>
                        <div className="text-lg font-semibold text-slate-900">{formatMAD(m.avg)}</div>
                      </div>
                      <div className="rounded-xl border border-teal-200 bg-teal-50/80 px-4 py-2 shadow-sm">
                        <div className="text-[11px] font-medium uppercase tracking-wide text-teal-800/80">
                          Bénéfice estimé
                        </div>
                        <div className="text-lg font-semibold text-slate-900">{formatMAD(m.totalBenefit)}</div>
                        {(() => {
                          const pctTotal = benefitPctOfCa(m.totalBenefit, m.total)
                          const pctScoped = benefitPctOfCa(m.totalBenefit, m.caWithMargin)
                          if (pctTotal == null && pctScoped == null) {
                            return (
                              <div className="mt-0.5 text-[10px] text-teal-800/70">
                                produits avec marge uniquement
                              </div>
                            )
                          }
                          return (
                            <div className="mt-0.5 text-[10px] leading-tight text-teal-900/80">
                              {pctTotal != null ? `${formatPct(pctTotal)} du CA` : null}
                              {pctTotal != null && pctScoped != null ? ' · ' : null}
                              {pctScoped != null ? `${formatPct(pctScoped)} marge` : null}
                            </div>
                          )
                        })()}
                      </div>
                      <div className="rounded-xl border border-violet-200 bg-violet-50/80 px-4 py-2 shadow-sm">
                        <div className="text-[11px] font-medium uppercase tracking-wide text-violet-800/80">
                          Paniers (mois)
                        </div>
                        <div className="text-lg font-semibold text-slate-900">{formatCount(m.totalPaniers)}</div>
                      </div>
                      <div className="rounded-xl border border-violet-200 bg-white px-4 py-2 shadow-sm">
                        <div className="text-[11px] font-medium uppercase tracking-wide text-violet-700/80">
                          Moy. paniers / jour
                        </div>
                        <div className="text-lg font-semibold text-slate-900">{formatCount(m.avgPaniers)}</div>
                      </div>
                    </div>
                    {Object.keys(m.caByMag).length > 0 ? (
                      <div className="w-full min-w-0">
                        <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                          CA par magasin (mois)
                        </div>
                        <div className="mt-1.5 grid w-full min-w-0 grid-cols-2 gap-1.5 sm:grid-cols-3">
                          {Object.entries(m.caByMag)
                            .sort(([a], [b]) => a.localeCompare(b))
                            .map(([mag, totalCa]) => {
                              const avgMag = m.days.length ? totalCa / m.days.length : 0
                              const pctCa = m.total > 0 ? (totalCa / m.total) * 100 : null
                              const magBenefit = m.benefitByMag[mag] ?? 0
                              const magCaWithMargin = m.caWithMarginByMag[mag] ?? 0
                              const avgBenefit = m.days.length ? magBenefit / m.days.length : 0
                              const pctBenTotal = benefitPctOfCa(magBenefit, totalCa)
                              const pctBenScoped = benefitPctOfCa(magBenefit, magCaWithMargin)
                              return (
                                <div
                                  key={`${m.ym}-ca-${mag}`}
                                  className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5"
                                >
                                  <div className="truncate text-[9px] font-medium uppercase tracking-wide text-slate-600">
                                    {labelMagasin(mag)}
                                  </div>
                                  {pctCa != null ? (
                                    <div className="mt-0.5 truncate text-[10px] font-semibold text-emerald-800">
                                      {formatPct(pctCa)} <span className="font-normal text-emerald-700/80">du CA</span>
                                    </div>
                                  ) : null}
                                  <div className="mt-0.5 truncate text-xs font-semibold text-slate-900">
                                    {formatMAD(totalCa)}{' '}
                                    <span className="font-normal text-slate-500">total</span>
                                  </div>
                                  <div className="truncate text-[10px] text-slate-600">
                                    {formatMAD(avgMag)} <span className="text-slate-500">moy./jour</span>
                                  </div>
                                  <div className="mt-1 border-t border-slate-200/80 pt-1">
                                    <div className="truncate text-[9px] font-medium uppercase tracking-wide text-teal-800/80">
                                      Bénéfice estimé
                                    </div>
                                    <div className="mt-0.5 truncate text-xs font-semibold text-teal-950">
                                      {formatMAD(magBenefit)}
                                    </div>
                                    {pctBenTotal != null || pctBenScoped != null ? (
                                      <div className="truncate text-[10px] text-teal-900/80">
                                        {pctBenTotal != null ? `${formatPct(pctBenTotal)} du CA` : null}
                                        {pctBenTotal != null && pctBenScoped != null ? ' · ' : null}
                                        {pctBenScoped != null ? `${formatPct(pctBenScoped)} marge` : null}
                                      </div>
                                    ) : null}
                                    <div className="truncate text-[10px] text-teal-800/80">
                                      {formatMAD(avgBenefit)} <span className="text-teal-700/70">moy./jour</span>
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                        </div>
                      </div>
                    ) : null}
                    {Object.keys(m.paniersByMag).length > 0 ? (
                      <div className="w-full min-w-0">
                        <div className="text-[10px] font-medium uppercase tracking-wide text-violet-700/80">
                          Paniers par magasin (mois)
                        </div>
                        <div className="mt-1.5 grid w-full min-w-0 grid-cols-2 gap-1.5 sm:grid-cols-3">
                          {Object.entries(m.paniersByMag)
                            .sort(([a], [b]) => a.localeCompare(b))
                            .map(([mag, nb]) => {
                              const avgNb = m.days.length ? nb / m.days.length : 0
                              return (
                                <div
                                  key={`${m.ym}-pan-${mag}`}
                                  className="min-w-0 rounded-lg border border-violet-200/70 bg-violet-50/50 px-2 py-1.5"
                                >
                                  <div className="truncate text-[9px] font-medium uppercase tracking-wide text-violet-900/75">
                                    {labelMagasin(mag)}
                                  </div>
                                  <div className="mt-0.5 truncate text-xs font-semibold text-slate-900">
                                    {formatCount(nb)} <span className="font-normal text-slate-500">total</span>
                                  </div>
                                  <div className="truncate text-[10px] text-violet-800">
                                    {formatCount(avgNb)} <span className="text-violet-700/80">moy./jour</span>
                                  </div>
                                </div>
                              )
                            })}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </summary>

              <div className="mt-5 grid gap-3">
                {m.days.map(d => {
                  const isMax = m.maxDay && d.date === m.maxDay
                  const isMin = m.minDay && d.date === m.minDay
                  const amountClass = isMax ? 'text-emerald-700' : isMin ? 'text-rose-700' : 'text-slate-900'

                  const magKeys = new Set([
                    ...Object.keys(d.magasins),
                    ...Object.keys(d.magasinsNbPaniers),
                    ...Object.keys(d.magasinsBenefit ?? {}),
                  ])
                  const magasinsSorted = [...magKeys].sort((a, b) => a.localeCompare(b))
                  const dayNbPaniers = Number.isFinite(d.nbPaniersGlobal) ? d.nbPaniersGlobal : 0
                  const dayBenefit = Number.isFinite(d.totalBenefit) ? d.totalBenefit : 0
                  return (
                    <div key={d.date} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="text-sm font-semibold capitalize text-slate-900">{dayLabel(d.date)}</div>
                          <div className="mt-1 text-xs text-slate-500">{d.date}</div>
                        </div>
                        <div className="flex flex-col items-start gap-0.5 sm:items-end">
                          <div className={`text-lg font-semibold ${amountClass}`}>{formatMAD(d.totalGlobal)}</div>
                          {dayBenefit > 0 ? (
                            <div className="text-sm font-medium text-teal-800">
                              Bénéfice : {formatMAD(dayBenefit)}
                              {(() => {
                                const pct = benefitPctOfCa(dayBenefit, d.totalGlobal)
                                return pct != null ? (
                                  <span className="ml-1 text-xs font-normal text-teal-700/80">
                                    ({formatPct(pct)} du CA)
                                  </span>
                                ) : null
                              })()}
                            </div>
                          ) : null}
                          {dayNbPaniers > 0 ? (
                            <div className="text-sm font-medium text-violet-800">
                              {formatCount(dayNbPaniers)} panier{dayNbPaniers > 1 ? 's' : ''}
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {magasinsSorted.map(mag => {
                          const ca = d.magasins[mag]
                          const rawNb = d.magasinsNbPaniers[mag]
                          const nb =
                            typeof rawNb === 'number' ? rawNb : rawNb != null ? Number(rawNb) : undefined
                          const rawBen = d.magasinsBenefit?.[mag]
                          const ben =
                            typeof rawBen === 'number' ? rawBen : rawBen != null ? Number(rawBen) : undefined
                          const hasCa = ca != null && Number.isFinite(ca)
                          const hasNb = nb != null && Number.isFinite(nb) && nb > 0
                          const hasBen = ben != null && Number.isFinite(ben) && ben > 0
                          if (!hasCa && !hasNb && !hasBen) return null
                          return (
                            <div
                              key={`${d.date}-${mag}`}
                              className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2"
                            >
                              <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                                {labelMagasin(mag)}
                              </div>
                              {hasCa ? (
                                <div className="mt-0.5 text-sm font-semibold text-slate-900">{formatMAD(ca)}</div>
                              ) : null}
                              {hasBen ? (
                                <div className="mt-0.5 text-xs font-medium text-teal-800">
                                  Bénéfice : {formatMAD(ben)}
                                  {hasCa
                                    ? (() => {
                                        const pct = benefitPctOfCa(ben, ca)
                                        return pct != null ? (
                                          <span className="ml-1 font-normal text-teal-700/80">
                                            ({formatPct(pct)})
                                          </span>
                                        ) : null
                                      })()
                                    : null}
                                </div>
                              ) : null}
                              {hasNb ? (
                                <div className="mt-0.5 text-xs font-medium text-violet-800">
                                  {formatCount(nb)} panier{nb > 1 ? 's' : ''}
                                </div>
                              ) : null}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </details>
          ))}
        </section>

        <SyncStatusFooter />
      </div>
    </main>
  )
}

