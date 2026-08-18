'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'

export type CaJourPoint = {
  date: string
  total: number
}

export type CaJourMetric = 'ca' | 'qty' | 'benefit'

export type CaJourGrain = 'day' | 'month'

type Props = {
  points: CaJourPoint[]
  className?: string
  title?: string
  metric?: CaJourMetric
  grain?: CaJourGrain
  /** Zoom par boutons. Défaut : activé pour le grain jour. */
  zoomable?: boolean
}

const VIEW_W = 640
const VIEW_H = 248
const PAD_R = 14
const PAD_T = 36
const PAD_B = 40
const PAD_L = 56
const MIN_ZOOM_SPAN = 3

type ZoomRange = { start: number; end: number }

function toUtcDate(iso: string): Date {
  const normalized = /^\d{4}-\d{2}$/.test(iso) ? `${iso}-01` : iso
  return new Date(`${normalized}T00:00:00Z`)
}

function shortDateLabel(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    toUtcDate(iso),
  )
}

function shortMonthLabel(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(
    toUtcDate(iso),
  )
}

function fullPeriodLabel(iso: string, grain: CaJourGrain): string {
  if (grain === 'month') {
    return new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
      toUtcDate(iso),
    )
  }
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(toUtcDate(iso))
}

function formatAxisTick(v: number, isMoney: boolean): string {
  if (!isMoney) {
    return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: v >= 100 ? 0 : 2 }).format(v)
  }
  if (v >= 1_000_000) {
    return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(v / 1_000_000)} M`
  }
  if (v >= 10_000) {
    return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(v / 1_000)} k`
  }
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(v)
}

function indexFromX(x: number, n: number, padL: number, chartW: number): number {
  if (n <= 0 || chartW <= 0) return 0
  const i = Math.floor(((x - padL) / chartW) * n)
  return Math.max(0, Math.min(n - 1, i))
}

function clampZoom(start: number, end: number, n: number): ZoomRange | null {
  const s = Math.max(0, Math.min(start, end))
  const e = Math.min(n - 1, Math.max(start, end))
  if (s <= 0 && e >= n - 1) return null
  return { start: s, end: Math.max(s, e) }
}

function smoothWindowSize(grain: CaJourGrain, n: number): number {
  if (n < 3) return n
  if (grain === 'month') return Math.min(3, n)
  if (n >= 90) return 14
  if (n >= 21) return 7
  if (n >= 8) return 5
  return 3
}

/** Moyenne mobile centrée (fenêtre réduite sur les bords). */
function centeredMovingAverage(values: number[], window: number): number[] {
  const w = Math.max(1, window)
  const half = Math.floor(w / 2)
  const out: number[] = []
  for (let i = 0; i < values.length; i++) {
    const from = Math.max(0, i - half)
    const to = Math.min(values.length - 1, i + half)
    let sum = 0
    for (let j = from; j <= to; j++) {
      sum += values[j] ?? 0
    }
    out.push(sum / (to - from + 1))
  }
  return out
}

/** Catmull-Rom → cubiques SVG, pour une courbe continue sans angles. */
function catmullRomPath(pts: Array<{ x: number; y: number }>): string {
  const first = pts[0]
  const second = pts[1]
  if (!first || !second) return ''
  if (pts.length === 2) return `M ${first.x} ${first.y} L ${second.x} ${second.y}`

  let d = `M ${first.x} ${first.y}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p1 = pts[i]
    const p2 = pts[i + 1]
    if (!p1 || !p2) continue
    const p0 = pts[i - 1] ?? p1
    const p3 = pts[i + 2] ?? p2
    const c1x = p1.x + (p2.x - p0.x) / 6
    const c1y = p1.y + (p2.y - p0.y) / 6
    const c2x = p2.x - (p3.x - p1.x) / 6
    const c2y = p2.y - (p3.y - p1.y) / 6
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`
  }
  return d
}

/**
 * Histogramme CA journalier ou mensuel en SVG (même approche que PaniersHeureHistogram).
 */
export default function CaJourHistogram({
  points,
  className,
  title,
  metric = 'ca',
  grain = 'day',
  zoomable,
}: Props) {
  const capId = useId()
  const svgRef = useRef<SVGSVGElement | null>(null)

  const isMoney = metric === 'ca' || metric === 'benefit'
  const sorted = useMemo(
    () => [...points].sort((a, b) => a.date.localeCompare(b.date)),
    [points],
  )
  const pointsKey = `${sorted[0]?.date ?? ''}:${sorted[sorted.length - 1]?.date ?? ''}:${sorted.length}`

  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [hoveredDate, setHoveredDate] = useState<string | null>(null)
  const [zoom, setZoom] = useState<ZoomRange | null>(null)

  const nAll = sorted.length
  const zoomEnabled = (zoomable ?? grain === 'day') && nAll > MIN_ZOOM_SPAN

  useEffect(() => {
    setSelectedDate(null)
    setHoveredDate(null)
    setZoom(null)
  }, [pointsKey])

  const visibleStart = zoom ? Math.max(0, Math.min(zoom.start, Math.max(0, nAll - 1))) : 0
  const visibleEnd = zoom
    ? Math.max(visibleStart, Math.min(zoom.end, Math.max(0, nAll - 1)))
    : Math.max(0, nAll - 1)
  const visible = nAll > 0 ? sorted.slice(visibleStart, visibleEnd + 1) : []
  const visFrom = visible[0]
  const visTo = visible[visible.length - 1]
  const n = visible.length

  const chartW = VIEW_W - PAD_L - PAD_R
  const svgW = VIEW_W
  const chartH = VIEW_H - PAD_T - PAD_B

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (selectedDate) {
        setSelectedDate(null)
        return
      }
      setZoom(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedDate])

  if (!sorted.length) return null

  const windowSize = smoothWindowSize(grain, nAll)
  const smoothedAll = centeredMovingAverage(
    sorted.map((p) => p.total),
    windowSize,
  )
  const smoothedVisible = smoothedAll.slice(visibleStart, visibleEnd + 1)
  const max = Math.max(1, ...visible.map((p) => p.total), ...smoothedVisible)
  const totalVisible = visible.reduce((acc, p) => acc + p.total, 0)
  const totalAll = sorted.reduce((acc, p) => acc + p.total, 0)
  const gap = Math.max(0.5, (chartW / n) * (grain === 'month' ? 0.12 : 0.06))
  const barW = Math.max(1, (chartW - gap * (n - 1)) / n)
  const labelEvery =
    grain === 'month'
      ? n > 18
        ? 2
        : 1
      : n > 45
        ? 7
        : n > 31
          ? 5
          : n > 14
            ? 3
            : n > 7
              ? 2
              : 1

  const bars = visible.map((p, i) => {
    const h = (p.total / max) * chartH
    const x = PAD_L + i * (barW + gap)
    const y = PAD_T + chartH - h
    return { ...p, x, y, h, i }
  })

  const smoothPts = bars.map((b, i) => {
    const sm = smoothedVisible[i] ?? 0
    const rawY = PAD_T + chartH - (sm / max) * chartH
    const y = Math.min(PAD_T + chartH, Math.max(PAD_T, rawY))
    return { x: b.x + barW / 2, y }
  })
  const smoothPath = n >= 2 ? catmullRomPath(smoothPts) : ''
  const windowLabel = grain === 'month' ? `${windowSize} mois` : `${windowSize} j`

  const yTicks = 4
  const tickVals = Array.from({ length: yTicks + 1 }, (_, i) => Math.round((max * i) / yTicks))

  const formatValue = (v: number) =>
    isMoney
      ? new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(v)
      : new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(v)

  const valueSuffix = isMoney ? ' DH' : ''
  const periodCountLabel = grain === 'month' ? `${n} mois` : `${n} jour(s)`
  const chartLabel =
    grain === 'month'
      ? metric === 'ca'
        ? 'CA par mois'
        : metric === 'benefit'
          ? 'Bénéfice par mois'
          : 'Quantité par mois'
      : metric === 'ca'
        ? 'CA par jour'
        : metric === 'benefit'
          ? 'Bénéfice par jour'
          : 'Quantité par jour'
  const ariaTotal = isMoney ? `${formatValue(totalAll)} DH` : formatValue(totalAll)
  const metricPhrase =
    metric === 'ca' ? 'du CA' : metric === 'benefit' ? 'du bénéfice' : 'des quantités'

  const activeDate = selectedDate ?? hoveredDate
  const activePoint = activeDate ? sorted.find((p) => p.date === activeDate) : undefined
  const activeSmooth =
    activeDate != null
      ? smoothedAll[sorted.findIndex((p) => p.date === activeDate)]
      : undefined
  const zoomed = zoom != null

  const svgXFromClient = (clientX: number) => {
    const svg = svgRef.current
    if (!svg) return 0
    const rect = svg.getBoundingClientRect()
    if (rect.width <= 0) return 0
    return ((clientX - rect.left) / rect.width) * svgW
  }

  const applyZoomAround = (centerIdx: number, nextSpan: number) => {
    if (nextSpan >= nAll) {
      setZoom(null)
      return
    }
    const half = Math.floor(nextSpan / 2)
    let s = centerIdx - half
    let e = s + nextSpan - 1
    if (s < 0) {
      e -= s
      s = 0
    }
    if (e > nAll - 1) {
      s -= e - (nAll - 1)
      e = nAll - 1
    }
    setZoom(clampZoom(Math.max(0, s), e, nAll))
  }

  const zoomCenterIdx = (() => {
    if (selectedDate) {
      const idx = sorted.findIndex((p) => p.date === selectedDate)
      if (idx >= 0) return idx
    }
    return Math.floor((visibleStart + visibleEnd) / 2)
  })()

  const span = visibleEnd - visibleStart + 1

  const handleClick = (e: React.MouseEvent<SVGRectElement>) => {
    const x = svgXFromClient(e.clientX)
    const i = indexFromX(x, n, PAD_L, chartW)
    const date = visible[i]?.date
    if (!date) return
    setSelectedDate((prev) => (prev === date ? null : date))
  }

  const handlePointerMove = (e: React.PointerEvent<SVGRectElement>) => {
    if (e.pointerType === 'touch') return
    const x = svgXFromClient(e.clientX)
    const i = indexFromX(x, n, PAD_L, chartW)
    setHoveredDate(visible[i]?.date ?? null)
  }

  const handlePointerLeave = () => {
    setHoveredDate(null)
  }

  return (
    <figure className={className}>
      {title ? (
        <figcaption id={capId} className="mb-2 text-sm font-semibold text-slate-800">
          {title}
        </figcaption>
      ) : null}

      {(zoomEnabled || smoothPath) ? (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {zoomEnabled ? (
            <>
              <button
                type="button"
                onClick={() => applyZoomAround(zoomCenterIdx, Math.min(nAll, Math.ceil(span / 0.7)))}
                disabled={!zoomed && span >= nAll}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Zoom −
              </button>
              <button
                type="button"
                onClick={() => applyZoomAround(zoomCenterIdx, Math.max(MIN_ZOOM_SPAN, Math.floor(span * 0.5)))}
                disabled={span <= MIN_ZOOM_SPAN}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Zoom +
              </button>
              <button
                type="button"
                onClick={() => setZoom(null)}
                disabled={!zoomed}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Tout afficher
              </button>
              {zoomed && visFrom && visTo ? (
                <span className="text-xs text-slate-500">
                  {shortDateLabel(visFrom.date)} → {shortDateLabel(visTo.date)}
                </span>
              ) : null}
            </>
          ) : null}
          {smoothPath ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
              <span className="h-[2px] w-5 rounded-full bg-amber-600" aria-hidden />
              Tendance (moy. {windowLabel})
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white shadow-sm ring-1 ring-slate-100">
        <svg
          ref={svgRef}
          role="img"
          aria-labelledby={title ? capId : undefined}
          aria-label={
            title
              ? undefined
              : `Évolution ${metricPhrase} sur ${periodCountLabel}, total ${ariaTotal}`
          }
          width="100%"
          height={VIEW_H}
          viewBox={`0 0 ${svgW} ${VIEW_H}`}
          preserveAspectRatio="xMidYMid meet"
          className="block w-full max-w-full text-emerald-600"
          xmlns="http://www.w3.org/2000/svg"
        >
          {!title ? (
            <title>{`${chartLabel} — ${periodCountLabel}, total ${ariaTotal}`}</title>
          ) : null}

          {tickVals.map((tv, ti) => {
            const y = PAD_T + chartH - (tv / max) * chartH
            return (
              <g key={`grid-${ti}`}>
                <line x1={PAD_L} y1={y} x2={PAD_L + chartW} y2={y} stroke="#e2e8f0" strokeWidth={1} />
                <text
                  x={PAD_L - 8}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-slate-400"
                  style={{ fontSize: 10 }}
                >
                  {formatAxisTick(tv, isMoney)}
                </text>
              </g>
            )
          })}

          <line
            x1={PAD_L}
            y1={PAD_T + chartH}
            x2={PAD_L + chartW}
            y2={PAD_T + chartH}
            stroke="#94a3b8"
            strokeWidth={1.5}
          />

          {bars.map(({ date, total: v, x, y, h, i }) => {
            const isSelected = date === selectedDate
            const isHovered = date === hoveredDate && !isSelected
            return (
              <g key={date}>
                <rect
                  x={x}
                  y={y}
                  width={barW}
                  height={Math.max(h, v > 0 ? 1.5 : 0)}
                  rx={grain === 'month' ? 3 : 2}
                  fill={isSelected ? '#047857' : isHovered ? '#059669' : 'currentColor'}
                  fillOpacity={v > 0 ? (isSelected || isHovered ? 1 : 0.62) : 0.12}
                  className="text-emerald-600"
                />
                {isSelected && barW >= 22 ? (
                  <text
                    x={x + barW / 2}
                    y={Math.max(PAD_T + 10, y - 4)}
                    textAnchor="middle"
                    className="fill-emerald-900"
                    style={{ fontSize: 9, fontWeight: 700 }}
                  >
                    {formatValue(v)}
                  </text>
                ) : null}
                {i % labelEvery === 0 ? (
                  <text
                    x={x + barW / 2}
                    y={VIEW_H - 10}
                    textAnchor="middle"
                    className="fill-slate-500"
                    style={{ fontSize: 9 }}
                  >
                    {grain === 'month' ? shortMonthLabel(date) : shortDateLabel(date)}
                  </text>
                ) : null}
              </g>
            )
          })}

          {smoothPath ? (
            <path
              d={smoothPath}
              fill="none"
              stroke="#d97706"
              strokeWidth={2.25}
              strokeLinecap="round"
              strokeLinejoin="round"
              pointerEvents="none"
            />
          ) : null}

          <rect
            x={PAD_L}
            y={PAD_T}
            width={chartW}
            height={chartH}
            fill="transparent"
            className="cursor-pointer"
            style={{ touchAction: 'manipulation' }}
            onClick={handleClick}
            onPointerMove={handlePointerMove}
            onPointerLeave={handlePointerLeave}
          />

          <text
            x={svgW / 2}
            y={16}
            textAnchor="middle"
            className="fill-slate-600"
            style={{ fontSize: 11, fontWeight: 600 }}
          >
            {chartLabel} — {zoomed ? 'sélection ' : 'total '}
            {formatValue(zoomed ? totalVisible : totalAll)}
            {valueSuffix}
          </text>
        </svg>
      </div>

      {activePoint ? (
        <div
          className={`mt-3 flex flex-wrap items-end justify-between gap-2 rounded-xl border px-3 py-2.5 ${
            selectedDate
              ? 'border-emerald-300 bg-emerald-50/90'
              : 'border-slate-200 bg-slate-50/80'
          }`}
          role="status"
        >
          <div className="min-w-0">
            <div className="text-[11px] font-medium uppercase tracking-wide text-emerald-800/80">
              {selectedDate
                ? grain === 'month'
                  ? 'Mois sélectionné'
                  : 'Jour sélectionné'
                : 'Aperçu'}
            </div>
            <div className="text-sm font-semibold capitalize text-slate-900">
              {fullPeriodLabel(activePoint.date, grain)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-lg font-semibold tabular-nums text-emerald-950">
              {formatValue(activePoint.total)}
              {valueSuffix}
            </div>
            {activeSmooth != null && Number.isFinite(activeSmooth) ? (
              <div className="text-[11px] font-medium text-amber-800">
                Tendance : {formatValue(activeSmooth)}
                {valueSuffix}
              </div>
            ) : null}
            {selectedDate ? (
              <button
                type="button"
                onClick={() => setSelectedDate(null)}
                className="text-[11px] font-medium text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline"
              >
                Fermer
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="mt-2 text-xs text-slate-500">
          Cliquez une barre pour afficher la valeur
          {zoomEnabled ? ' · utilisez Zoom + / − pour agrandir une période' : ''}.
        </p>
      )}
    </figure>
  )
}
