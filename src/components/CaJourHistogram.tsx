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
  /** Zoom par glisser / boutons / molette. Défaut : activé pour le grain jour. */
  zoomable?: boolean
}

const VIEW_W = 640
const VIEW_H = 248
const PAD_R = 14
const PAD_T = 36
const PAD_B = 40
const PAD_L = 56
const DRAG_PX = 8
const MIN_ZOOM_SPAN = 3

type ZoomRange = { start: number; end: number }

type DragState = {
  pointerId: number
  clientX0: number
  clientY0: number
  svgX0: number
  svgX1: number
  moved: boolean
  aborted: boolean
}

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
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const layoutRef = useRef({ padL: PAD_L, chartW: VIEW_W - PAD_L - PAD_R, svgW: VIEW_W, nVis: 0 })

  const isMoney = metric === 'ca' || metric === 'benefit'
  const sorted = useMemo(
    () => [...points].sort((a, b) => a.date.localeCompare(b.date)),
    [points],
  )
  const pointsKey = `${sorted[0]?.date ?? ''}:${sorted[sorted.length - 1]?.date ?? ''}:${sorted.length}`

  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [hoveredDate, setHoveredDate] = useState<string | null>(null)
  const [zoom, setZoom] = useState<ZoomRange | null>(null)
  const [brush, setBrush] = useState<{ x0: number; x1: number } | null>(null)

  const nAll = sorted.length
  const zoomEnabled = (zoomable ?? grain === 'day') && nAll > MIN_ZOOM_SPAN

  useEffect(() => {
    setSelectedDate(null)
    setHoveredDate(null)
    setZoom(null)
    setBrush(null)
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
  layoutRef.current = { padL: PAD_L, chartW, svgW, nVis: n }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setBrush(null)
      dragRef.current = null
      if (selectedDate) {
        setSelectedDate(null)
        return
      }
      setZoom(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedDate])

  useEffect(() => {
    if (!zoomEnabled) return
    const el = wrapRef.current
    if (!el) return

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const svg = svgRef.current
      if (!svg || nAll === 0) return
      const rect = svg.getBoundingClientRect()
      if (rect.width <= 0) return
      const svgX = ((e.clientX - rect.left) / rect.width) * layoutRef.current.svgW
      const visIdx = indexFromX(svgX, layoutRef.current.nVis, layoutRef.current.padL, layoutRef.current.chartW)
      const absIdx = visibleStart + visIdx
      const span = visibleEnd - visibleStart + 1
      const nextSpan =
        e.deltaY < 0
          ? Math.max(MIN_ZOOM_SPAN, Math.floor(span * 0.7))
          : Math.min(nAll, Math.ceil(span / 0.7))
      if (nextSpan >= nAll) {
        setZoom(null)
        return
      }
      const ratio = span <= 1 ? 0.5 : visIdx / Math.max(1, span - 1)
      let s = Math.round(absIdx - ratio * (nextSpan - 1))
      let end = s + nextSpan - 1
      if (s < 0) {
        end -= s
        s = 0
      }
      if (end > nAll - 1) {
        s -= end - (nAll - 1)
        end = nAll - 1
      }
      setZoom(clampZoom(Math.max(0, s), end, nAll))
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomEnabled, nAll, visibleStart, visibleEnd])

  if (!sorted.length) return null

  const max = Math.max(1, ...visible.map((p) => p.total))
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

  const handlePointerDown = (e: React.PointerEvent<SVGRectElement>) => {
    if (e.button !== 0) return
    const x = svgXFromClient(e.clientX)
    dragRef.current = {
      pointerId: e.pointerId,
      clientX0: e.clientX,
      clientY0: e.clientY,
      svgX0: x,
      svgX1: x,
      moved: false,
      aborted: false,
    }
  }

  const handlePointerMove = (e: React.PointerEvent<SVGRectElement>) => {
    const drag = dragRef.current
    const x = svgXFromClient(e.clientX)
    if (!drag || drag.pointerId !== e.pointerId) {
      const i = indexFromX(x, n, PAD_L, chartW)
      setHoveredDate(visible[i]?.date ?? null)
      return
    }
    if (drag.aborted) return
    const dx = Math.abs(e.clientX - drag.clientX0)
    const dy = Math.abs(e.clientY - drag.clientY0)
    if (!drag.moved) {
      if (dy > dx && dy > DRAG_PX) {
        drag.aborted = true
        setBrush(null)
        return
      }
      if (dx < DRAG_PX) {
        const i = indexFromX(x, n, PAD_L, chartW)
        setHoveredDate(visible[i]?.date ?? null)
        return
      }
      if (!zoomEnabled) return
      drag.moved = true
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
    }
    drag.svgX1 = x
    setBrush({ x0: drag.svgX0, x1: x })
  }

  const handlePointerUp = (e: React.PointerEvent<SVGRectElement>) => {
    const drag = dragRef.current
    dragRef.current = null
    setBrush(null)
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId)
      }
    } catch {
      /* ignore */
    }
    if (!drag || drag.pointerId !== e.pointerId || drag.aborted) return
    if (drag.moved && zoomEnabled) {
      const x0 = Math.min(drag.svgX0, drag.svgX1)
      const x1 = Math.max(drag.svgX0, drag.svgX1)
      const i0 = indexFromX(x0, n, PAD_L, chartW)
      const i1 = indexFromX(x1, n, PAD_L, chartW)
      setZoom(clampZoom(visibleStart + i0, visibleStart + i1, nAll))
      return
    }
    const i = indexFromX(drag.svgX0, n, PAD_L, chartW)
    const date = visible[i]?.date
    if (!date) return
    setSelectedDate((prev) => (prev === date ? null : date))
  }

  const handlePointerLeave = () => {
    if (dragRef.current) return
    setHoveredDate(null)
  }

  const brushX = brush
    ? Math.max(PAD_L, Math.min(brush.x0, brush.x1, PAD_L + chartW))
    : 0
  const brushW = brush
    ? Math.min(PAD_L + chartW, Math.max(brush.x0, brush.x1)) - brushX
    : 0

  return (
    <figure className={className}>
      {title ? (
        <figcaption id={capId} className="mb-2 text-sm font-semibold text-slate-800">
          {title}
        </figcaption>
      ) : null}

      {zoomEnabled ? (
        <div className="mb-2 flex flex-wrap items-center gap-2">
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
        </div>
      ) : null}

      <div
        ref={wrapRef}
        className="overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white shadow-sm ring-1 ring-slate-100"
      >
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
                  fillOpacity={v > 0 ? (isSelected || isHovered ? 1 : 0.88) : 0.12}
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

          {brush && brushW > 0 ? (
            <rect
              x={brushX}
              y={PAD_T}
              width={brushW}
              height={chartH}
              fill="#059669"
              fillOpacity={0.16}
              stroke="#047857"
              strokeWidth={1}
              pointerEvents="none"
            />
          ) : null}

          <rect
            x={PAD_L}
            y={PAD_T}
            width={chartW}
            height={chartH}
            fill="transparent"
            className={zoomEnabled ? 'cursor-crosshair' : 'cursor-pointer'}
            style={{ touchAction: 'pan-y' }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
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
          {zoomEnabled ? ' · glissez horizontalement ou utilisez la molette pour zoomer' : ''}.
        </p>
      )}
    </figure>
  )
}
