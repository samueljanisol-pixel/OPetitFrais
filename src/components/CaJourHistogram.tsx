'use client'

import { useId, useMemo } from 'react'

export type CaJourPoint = {
  date: string
  total: number
}

export type CaJourMetric = 'ca' | 'qty' | 'benefit'

type Props = {
  points: CaJourPoint[]
  className?: string
  title?: string
  metric?: CaJourMetric
}

const VIEW_W = 640
const VIEW_H = 240
const PAD_L = 52
const PAD_R = 14
const PAD_T = 36
const PAD_B = 40

function shortDateLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(d)
}

/**
 * Histogramme CA journalier en SVG (même approche que PaniersHeureHistogram).
 */
export default function CaJourHistogram({ points, className, title, metric = 'ca' }: Props) {
  const capId = useId()
  const isMoney = metric === 'ca' || metric === 'benefit'
  const sorted = useMemo(
    () => [...points].sort((a, b) => a.date.localeCompare(b.date)),
    [points],
  )

  if (!sorted.length) return null

  const max = Math.max(1, ...sorted.map((p) => p.total))
  const total = sorted.reduce((acc, p) => acc + p.total, 0)
  const n = sorted.length
  const chartW = VIEW_W - PAD_L - PAD_R
  const chartH = VIEW_H - PAD_T - PAD_B
  const gap = Math.max(0.5, (chartW / n) * 0.06)
  const barW = Math.max(1, (chartW - gap * (n - 1)) / n)
  const labelEvery = n > 45 ? 7 : n > 31 ? 5 : n > 14 ? 3 : n > 7 ? 2 : 1

  const bars = sorted.map((p, i) => {
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
  const chartLabel =
    metric === 'ca' ? 'CA par jour' : metric === 'benefit' ? 'Bénéfice par jour' : 'Quantité par jour'
  const ariaTotal = isMoney ? `${formatValue(total)} DH` : formatValue(total)

  return (
    <figure className={className}>
      {title ? (
        <figcaption id={capId} className="mb-2 text-sm font-semibold text-slate-800">
          {title}
        </figcaption>
      ) : null}
      <div className="overflow-x-auto overflow-y-hidden rounded-xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white shadow-sm ring-1 ring-slate-100">
        <svg
          role="img"
          aria-labelledby={title ? capId : undefined}
          aria-label={
            title
              ? undefined
              : `Évolution ${metric === 'ca' ? 'du CA' : metric === 'benefit' ? 'du bénéfice' : 'des quantités'} sur ${n} jour(s), total ${ariaTotal}`
          }
          width="100%"
          height={VIEW_H}
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="xMidYMid meet"
          className="block min-w-[320px] w-full max-w-full text-emerald-600"
          xmlns="http://www.w3.org/2000/svg"
        >
          {!title ? (
            <title>{`${chartLabel} — ${n} jour(s), total ${ariaTotal}`}</title>
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
                  {formatValue(tv)}
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

          {bars.map(({ date, total: v, x, y, h, i }) => (
            <g key={date}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={Math.max(h, v > 0 ? 1.5 : 0)}
                rx={2}
                fill="currentColor"
                fillOpacity={v > 0 ? 0.88 : 0.12}
                className="text-emerald-600"
              >
                <title>{`${date} — ${formatValue(v)}${valueSuffix}`}</title>
              </rect>
              {i % labelEvery === 0 ? (
                <text
                  x={x + barW / 2}
                  y={VIEW_H - 10}
                  textAnchor="middle"
                  className="fill-slate-500"
                  style={{ fontSize: 9 }}
                >
                  {shortDateLabel(date)}
                </text>
              ) : null}
            </g>
          ))}

          <text
            x={VIEW_W / 2}
            y={16}
            textAnchor="middle"
            className="fill-slate-600"
            style={{ fontSize: 11, fontWeight: 600 }}
          >
            {chartLabel} — total {formatValue(total)}{valueSuffix}
          </text>
        </svg>
      </div>
    </figure>
  )
}
