'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchHistoriqueFromSupabase } from '@/lib/ca/fromSupabase'
import type { HistoriqueDayRow, HistoriquePayload } from '@/lib/ca/types'
import { maybeAutoSyncIfStale } from '@/lib/sync/maybeAutoSyncIfStale'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import SyncStatusFooter from '@/components/SyncStatusFooter'

type DayRow = HistoriqueDayRow

type PeriodFilter = '2026' | '2025' | 'tous'

const labelMagasin = (raw: string) => {
  const m = raw.match(/^M(\d+)$/i)
  if (!m) return raw
  return `Magasin ${Number(m[1])}`
}

const isoToUtcDate = (iso: string) => new Date(`${iso}T00:00:00Z`)

const monthKey = (iso: string) => iso.slice(0, 7) // YYYY-MM

/** Borne basse de l’historique (inclus), au lieu du 1er janvier de l’année en cours. */
const HISTORIQUE_FROM_ISO = '2025-05-13'

export default function HistoriqueCA() {
  const [data, setData] = useState<HistoriquePayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loadHint, setLoadHint] = useState('Chargement…')
  const isFirstVisitRef = useRef(true)
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('2026')

  const todayIso = useMemo(() => new Date().toISOString().split('T')[0], [])

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

  useEffect(() => {
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

        setLoadHint('Chargement…')
        const supabase = createSupabaseBrowserClient()
        const res = await fetchHistoriqueFromSupabase(supabase, HISTORIQUE_FROM_ISO, todayIso)
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
  }, [todayIso])

  const computed = useMemo(() => {
    if (!data || 'error' in data) return null

    const days = filteredDays
    const totalGlobal = days.reduce((acc, d) => acc + (Number.isFinite(d.totalGlobal) ? d.totalGlobal : 0), 0)
    const avgPerDay = days.length ? totalGlobal / days.length : 0

    const months = new Map<
      string,
      {
        ym: string
        days: DayRow[]
        total: number
        avg: number
        maxDay?: string
        minDay?: string
      }
    >()

    for (const d of days) {
      const ym = monthKey(d.date)
      if (!months.has(ym)) months.set(ym, { ym, days: [], total: 0, avg: 0 })
      const m = months.get(ym)!
      m.days.push(d)
      m.total += d.totalGlobal
    }

    for (const m of months.values()) {
      m.days.sort((a, b) => a.date.localeCompare(b.date))
      m.avg = m.days.length ? m.total / m.days.length : 0
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

    const sortedDates = [...days].sort((a, b) => a.date.localeCompare(b.date))
    const from = sortedDates[0]?.date ?? null
    const to = sortedDates[sortedDates.length - 1]?.date ?? null

    return {
      days,
      totalGlobal,
      avgPerDay,
      avgPerMonth,
      monthList,
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

  if (loading) {
    return (
      <main className="min-h-[calc(100vh-0px)] flex items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-rose-50 px-6 py-16">
        <div className="w-full max-w-md rounded-2xl border border-emerald-100 bg-white/80 p-6 shadow-sm backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="relative h-10 w-10 overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-emerald-100">
              <Image src="/logo-opetitfrais.png" alt="O' Petit Frais" fill className="object-contain p-1" sizes="40px" priority />
            </div>
            <div>
              <div className="text-sm font-medium text-emerald-900/80">O&apos; Petit Frais</div>
              <div className="text-lg font-semibold tracking-tight text-slate-900">Historique CA</div>
            </div>
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
            <Link className="text-sm font-semibold text-emerald-700 hover:underline" href="/">
              Revenir au tableau de bord
            </Link>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-[calc(100vh-0px)] bg-gradient-to-br from-emerald-50 via-white to-rose-50 px-6 py-10">
      <div className="mx-auto w-full max-w-5xl">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="relative h-20 w-30 overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-emerald-100">
              <Image
                src="/logo-opetitfrais.png"
                alt="O' Petit Frais"
                fill
                className="object-contain p-1.5"
                sizes="80px"
                priority
              />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Historique chiffre d’affaires</h1>
              <div className="mt-2 flex flex-wrap gap-2 text-sm">
                <Link href="/" className="font-medium text-emerald-700 hover:underline">
                  Accueil
                </Link>
                <span className="text-slate-300">|</span>
                <Link href="/ca" className="font-medium text-emerald-700 hover:underline">
                  Statistique
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
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-emerald-100 bg-white/80 px-5 py-4 shadow-sm backdrop-blur">
              <div className="text-xs font-medium uppercase tracking-wide text-emerald-700/80">Total global</div>
              <div className="mt-1 text-2xl font-semibold text-slate-900">{formatMAD(computed.totalGlobal)}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/80 px-5 py-4 shadow-sm backdrop-blur">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-600">Moyenne / jour</div>
              <div className="mt-1 text-2xl font-semibold text-slate-900">{formatMAD(computed.avgPerDay)}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/80 px-5 py-4 shadow-sm backdrop-blur">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-600">Moyenne / mois</div>
              <div className="mt-1 text-2xl font-semibold text-slate-900">{formatMAD(computed.avgPerMonth)}</div>
              <div className="mt-1 text-[11px] text-slate-500">
                {computed.monthList.length} mois avec données
              </div>
            </div>
          </div>
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
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="rounded-xl bg-emerald-600 px-4 py-2 text-white shadow-sm">
                      <div className="text-[11px] font-medium uppercase tracking-wide text-white/80">Total mois</div>
                      <div className="text-lg font-semibold">{formatMAD(m.total)}</div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white px-4 py-2 shadow-sm">
                      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Moyenne / jour</div>
                      <div className="text-lg font-semibold text-slate-900">{formatMAD(m.avg)}</div>
                    </div>
                  </div>
                </div>
              </summary>

              <div className="mt-5 grid gap-3">
                {m.days.map(d => {
                  const isMax = m.maxDay && d.date === m.maxDay
                  const isMin = m.minDay && d.date === m.minDay
                  const amountClass = isMax ? 'text-emerald-700' : isMin ? 'text-rose-700' : 'text-slate-900'

                  const magasinsSorted = Object.entries(d.magasins).sort(([a], [b]) => a.localeCompare(b))
                  return (
                    <div key={d.date} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="text-sm font-semibold capitalize text-slate-900">{dayLabel(d.date)}</div>
                          <div className="mt-1 text-xs text-slate-500">{d.date}</div>
                        </div>
                        <div className={`text-lg font-semibold ${amountClass}`}>{formatMAD(d.totalGlobal)}</div>
                      </div>

                      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {magasinsSorted.map(([mag, v]) => (
                          <div key={`${d.date}-${mag}`} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                            <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                              {labelMagasin(mag)}
                            </div>
                            <div className="mt-0.5 text-sm font-semibold text-slate-900">{formatMAD(v)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </details>
          ))}
        </section>

        <div className="mt-8 text-sm">
          <Link className="font-semibold text-emerald-700 hover:underline" href="/">
            ← Retour au tableau de bord
          </Link>
        </div>

        <SyncStatusFooter />
      </div>
    </main>
  )
}

