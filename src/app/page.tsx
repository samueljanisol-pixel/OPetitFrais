'use client'

import Image from 'next/image'
import { useEffect, useMemo, useState } from 'react'
import { Button, Stack, TextField } from '@mui/material'
import AppLink from '@/components/AppLink'
import { useSyncStatus } from '@/lib/sync/useSyncStatus'

type PanierMag = { nbPaniers: number; panierMoyen: number | null }

type CaResponse = {
  totalGlobal: number
  magasins: Record<string, Record<string, number>>
  month?: {
    ym: string
    totalGlobal: number
    magasins: Record<string, number>
    panierMois?: Record<string, PanierMag>
    panierMoisGlobal?: PanierMag
  }
  panierJour?: Record<string, PanierMag>
  panierJourGlobal?: PanierMag
  compare?: { date: string; j1: { date: string; totalGlobal: number }; j7: { date: string; totalGlobal: number } }
  topProduits?: { available: boolean; byCa: Array<{ name: string; ca: number; qty: number }>; byQty: Array<{ name: string; ca: number; qty: number }> }
  error?: string
}

type ProgressEvent = { phase?: string; current?: number; total?: number }

export default function Home() {
  const [data, setData] = useState<CaResponse | null>(null)
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]) // YYYY-MM-DD
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ phase: string; current: number; total: number } | null>(null)
  const [refreshNonce, setRefreshNonce] = useState(0)
  const lastSync = useSyncStatus()
  const maxIso = useMemo(() => new Date().toISOString().split('T')[0], [])
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

  const lastSyncLabel = useMemo(() => {
    if (!lastSync?.finished_at) return null
    const d = new Date(lastSync.finished_at)
    const fmt = new Intl.DateTimeFormat('fr-FR', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
    return fmt.format(d)
  }, [lastSync?.finished_at])

  useEffect(() => {
    setLoading(true)
    setError(null)
    setProgress({ phase: 'Démarrage…', current: 0, total: 1 })

    /** Évite de traiter `error` après un `done` (fermeture TCP = erreur côté EventSource, reconnexion sinon). */
    let streamFinished = false

    const es = new EventSource(
      `/api/ca/stream?date=${encodeURIComponent(date)}&includeCompare=1&includeTop=1`,
    )

    const onProgress = (ev: MessageEvent<string>) => {
      try {
        const p = JSON.parse(ev.data) as ProgressEvent
        setProgress({
          phase: p.phase ?? 'Chargement…',
          current: typeof p.current === 'number' ? p.current : 0,
          total: typeof p.total === 'number' ? p.total : 1,
        })
      } catch {}
    }

    const onDone = (ev: MessageEvent<string>) => {
      streamFinished = true
      es.close()
      try {
        const json = JSON.parse(ev.data) as CaResponse
        setData(json)
      } catch {
        setError('Données invalides')
        setData(null)
      } finally {
        setLoading(false)
        setProgress(null)
      }
    }

    /** Même nom d’événement `error` pour erreur applicative SSE et pour coupure réseau — un seul handler. */
    const onStreamError = (ev: Event) => {
      if (streamFinished) return
      streamFinished = true
      es.close()
      const msg = ev as MessageEvent
      if (typeof msg.data === 'string' && msg.data.length > 0) {
        try {
          const json = JSON.parse(msg.data) as { error?: string }
          setError(json?.error ?? 'Erreur')
        } catch {
          setError('Erreur')
        }
      } else {
        setError('Connexion interrompue')
      }
      setLoading(false)
      setProgress(null)
    }

    es.addEventListener('progress', onProgress as EventListener)
    es.addEventListener('done', onDone as EventListener)
    es.addEventListener('error', onStreamError)

    return () => {
      streamFinished = true
      es.close()
    }
  }, [date, refreshNonce])

  /* Sans `&& !error` : après échec SSE, `data` reste null → on restait bloqués sur l’écran de chargement au lieu du message d’erreur. */
  if (loading || (!data && !error))
    return (
      <main className="min-h-[calc(100vh-0px)] flex items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-rose-50 px-6 py-16">
        <div className="w-full max-w-md rounded-2xl border border-emerald-100 bg-white/80 p-6 shadow-sm backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="relative h-12 w-24 overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-emerald-100">
              <Image
                src="/logo-opetitfrais.png"
                alt="O'petit frais"
                fill
                className="object-contain p-1"
                sizes="48px"
                priority
              />
            </div>
            <div>
              <div className="text-sm font-medium text-emerald-900/80">O&apos;petit frais</div>
              <div className="text-lg font-semibold tracking-tight text-slate-900">
                Chiffre d&apos;affaires
              </div>
            </div>
          </div>
          <div className="mt-6 h-2 w-full overflow-hidden rounded-full bg-emerald-100">
            <div className="h-full w-1/2 animate-pulse rounded-full bg-emerald-500/70" />
          </div>
          <div className="mt-3 text-sm text-slate-600">
            {progress?.phase ?? 'Chargement des données…'}
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-rose-100">
            <div
              className="h-full rounded-full bg-rose-500/70 transition-[width] duration-300"
              style={{
                width: `${Math.round(
                  ((progress?.current ?? 0) / Math.max(1, progress?.total ?? 1)) * 100,
                )}%`,
              }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-600">
            <span>
              {progress ? `${progress.current}/${progress.total}` : '—'}
            </span>
            <span>{progress ? `${Math.round((progress.current / Math.max(1, progress.total)) * 100)}%` : ''}</span>
          </div>
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
          <div className="flex items-center gap-3">
            <div className="relative h-12 w-24 overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-rose-200">
              <Image
                src="/logo-opetitfrais.png"
                alt="O'petit frais"
                fill
                className="object-contain p-1"
                sizes="48px"
                priority
              />
            </div>
            <div>
              <div className="text-sm font-medium text-slate-700">O&apos;petit frais</div>
              <div className="text-lg font-semibold tracking-tight text-slate-900">Impossible de charger</div>
            </div>
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
            Sur Vercel, vérifie les variables d&apos;environnement <span className="font-medium">FTP_HOST</span>,{' '}
            <span className="font-medium">FTP_USER</span>, <span className="font-medium">FTP_PASSWORD</span> et les logs
            de la fonction <span className="font-medium">/api/ca/stream</span>.
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

  const goPrevDay = () => {
    setDate(prev => isoMinusDays(prev, 1))
  }

  const labelMagasin = (raw: string) => {
    const m = raw.match(/^M(\d+)$/i)
    if (!m) return raw
    return `Magasin ${Number(m[1])}`
  }

  const labelCaisse = (raw: string) => {
    const m = raw.match(/^C(\d+)$/i)
    if (!m) return raw
    return `Caisse ${Number(m[1])}`
  }

  const sortedCaisseEntries = (caisses: Record<string, number>) => {
    const entries = Object.entries(caisses).filter(([k]) => k !== 'total') as Array<[string, number]>
    entries.sort(([a], [b]) => {
      const na = Number((a.match(/\d+/)?.[0] ?? ''))
      const nb = Number((b.match(/\d+/)?.[0] ?? ''))
      const aHas = Number.isFinite(na) && !Number.isNaN(na)
      const bHas = Number.isFinite(nb) && !Number.isNaN(nb)
      if (aHas && bHas) return na - nb
      if (aHas) return -1
      if (bHas) return 1
      return a.localeCompare(b, 'fr-FR')
    })
    return entries
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

  const compare = data?.compare
  const compareDelta = (current: number, prev: number) => {
    if (!Number.isFinite(current) || !Number.isFinite(prev) || prev === 0) return null
    return ((current - prev) / prev) * 100
  }

  const month = data?.month

  return (
    <main className="min-h-[calc(100vh-0px)] bg-gradient-to-br from-emerald-50 via-white to-rose-50 px-6 py-10">
      <div className="mx-auto w-full max-w-5xl">
        <header className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="relative h-20 w-30 overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-emerald-100">
              <Image
                src="/logo-opetitfrais.png"
                alt="O'petit frais"
                fill
                className="object-contain p-1.5"
                sizes="80px"
                priority
              />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
                Chiffre d&apos;affaires
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                Vue globale + détails par magasin et par caisse.
              </p>
              <div className="mt-3 text-2xl font-semibold capitalize tracking-tight text-slate-900 sm:text-3xl">
                {selectedDateLabel}
              </div>
              {lastSyncLabel ? (
                <div className="mt-2 text-sm text-slate-600">
                  Dernière synchro : <span className="font-semibold text-slate-800">{lastSyncLabel}</span>
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:items-end">
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
                onClick={goPrevDay}
                sx={{ borderRadius: 3, textTransform: 'none', fontWeight: 600, bgcolor: 'rgba(255,255,255,0.85)' }}
              >
                Jour précédent
              </Button>
              <Button
                type="button"
                variant="outlined"
                color="success"
                size="medium"
                onClick={() => setRefreshNonce(n => n + 1)}
                sx={{ borderRadius: 3, textTransform: 'none', fontWeight: 600, bgcolor: 'rgba(255,255,255,0.85)' }}
              >
                Actualiser
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
            </Stack>

            <div className="rounded-2xl border border-emerald-100 bg-white/80 px-5 py-4 shadow-sm backdrop-blur">
              <div className="text-xs font-medium uppercase tracking-wide text-emerald-700/80">
                Total global
              </div>
              <div className="mt-1 text-2xl font-semibold text-slate-900">
                {formatMAD(data.totalGlobal)}
              </div>
              {data.panierJourGlobal != null ? (
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-emerald-100 pt-3 text-sm text-slate-600">
                  <span>
                    Paniers :{' '}
                    <span className="font-semibold text-slate-800">
                      {formatCount(data.panierJourGlobal.nbPaniers)}
                    </span>
                  </span>
                  <span>
                    Panier moyen :{' '}
                    <span className="font-semibold text-slate-800">
                      {data.panierJourGlobal.panierMoyen != null
                        ? formatMAD(data.panierJourGlobal.panierMoyen)
                        : '—'}
                    </span>
                  </span>
                </div>
              ) : null}
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
              {month?.panierMoisGlobal != null ? (
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-sm text-slate-600">
                  <span>
                    Paniers :{' '}
                    <span className="font-semibold text-slate-800">
                      {formatCount(month.panierMoisGlobal.nbPaniers)}
                    </span>
                  </span>
                  <span>
                    Panier moyen :{' '}
                    <span className="font-semibold text-slate-800">
                      {month.panierMoisGlobal.panierMoyen != null
                        ? formatMAD(month.panierMoisGlobal.panierMoyen)
                        : '—'}
                    </span>
                  </span>
                </div>
              ) : null}
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
      {Object.entries(data.magasins).map(([mag, caisses]) => (
            <article
              key={mag}
              className="rounded-2xl border border-emerald-100 bg-white/80 p-5 shadow-sm backdrop-blur"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">{labelMagasin(mag)}</h2>
                  <div className="mt-1 text-sm text-slate-600">Détail des caisses</div>
                </div>
                <div className="rounded-xl bg-emerald-600 px-4 py-2 text-white shadow-sm">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-white/80">
                    Total magasin
                  </div>
                  <div className="text-lg font-semibold">{formatMAD(caisses.total)}</div>
                </div>
              </div>

              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-rose-100">
                <div
                  className="h-full rounded-full bg-rose-500/70"
                  style={{ width: `${percentOfGlobal(caisses.total)}%` }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-slate-600">
                <span>{formatPercent(percentOfGlobal(caisses.total))} du global</span>
                <span className="font-medium text-slate-700">Part du CA global (jour)</span>
              </div>

              {data.panierJour?.[mag] != null ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4 shadow-sm">
                    <div className="text-xs font-medium uppercase tracking-wide text-emerald-800/80">
                      Paniers (jour)
                    </div>
                    <div className="mt-1 text-lg font-semibold text-slate-900">
                      {formatCount(data.panierJour[mag].nbPaniers)}
                    </div>
                  </div>
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4 shadow-sm">
                    <div className="text-xs font-medium uppercase tracking-wide text-emerald-800/80">
                      Panier moyen (jour)
                    </div>
                    <div className="mt-1 text-lg font-semibold text-slate-900">
                      {data.panierJour[mag].panierMoyen != null
                        ? formatMAD(data.panierJour[mag].panierMoyen)
                        : '—'}
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {(() => {
                  const entries = sortedCaisseEntries(caisses)
                  const onlyOne = entries.length === 1
                  if (onlyOne) return null
                  return entries.map(([caisse, total]) => {
                  const pct = percentOfGlobal(total)
                  return (
                    <div
                      key={caisse}
                      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                    >
                      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        {labelCaisse(caisse)}
                      </div>
                      <div className="mt-1 text-base font-semibold text-slate-900">
                        {formatMAD(total)}
                      </div>
                      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-rose-100">
                        <div
                          className="h-full rounded-full bg-rose-500/60"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="mt-2 flex items-center justify-between text-xs text-slate-600">
                        <span>{formatPercent(pct)}</span>
                        <span>du global</span>
                      </div>
                    </div>
                  )
                  })
                })()}
              </div>

              <div
                className={`mt-4 grid gap-3 ${month?.panierMois?.[mag] != null ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-2'}`}
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
                {month?.panierMois?.[mag] != null ? (
                  <>
                    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Paniers (mois)
                      </div>
                      <div className="mt-1 text-base font-semibold text-slate-900">
                        {formatCount(month.panierMois[mag].nbPaniers)}
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Panier moyen (mois)
                      </div>
                      <div className="mt-1 text-base font-semibold text-slate-900">
                        {month.panierMois[mag].panierMoyen != null
                          ? formatMAD(month.panierMois[mag].panierMoyen)
                          : '—'}
                      </div>
                    </div>
                  </>
                ) : null}
              </div>
            </article>
          ))}
        </section>

        <section className="mt-10 rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm backdrop-blur">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">TOP 10 ventes produits</h2>
              <p className="mt-1 text-sm text-slate-600">
                Classements par chiffre d&apos;affaires et par quantité (sur la date sélectionnée).
              </p>
            </div>
          </div>

          {!data?.topProduits?.available ? (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
              Les détails “produits” ne sont pas disponibles dans les fichiers JSON actuels (je ne vois que
              `total_jour`). Si tu me donnes un exemple de fichier JSON (1 caisse, 1 jour), je peux adapter le parseur
              pour sortir le TOP 10.
            </div>
          ) : (
            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="text-sm font-semibold text-slate-900">Par chiffre d&apos;affaires</div>
                <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                      <tr>
                        <th className="px-3 py-2 text-left">Produit</th>
                        <th className="px-3 py-2 text-right">CA</th>
                        <th className="px-3 py-2 text-right">Qté</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.topProduits.byCa.map(r => (
                        <tr key={`ca-${r.name}`} className="border-t border-slate-100">
                          <td className="px-3 py-2 text-slate-900">{r.name}</td>
                          <td className="px-3 py-2 text-right font-semibold text-slate-900">{formatMAD(r.ca)}</td>
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
                <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                      <tr>
                        <th className="px-3 py-2 text-left">Produit</th>
                        <th className="px-3 py-2 text-right">Qté</th>
                        <th className="px-3 py-2 text-right">CA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.topProduits.byQty.map(r => (
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
      </div>
    </main>
  )
}