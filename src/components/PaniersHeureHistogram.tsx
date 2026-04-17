'use client'

import { useId } from 'react'

type Props = {
  buckets: number[]
  className?: string
  /** Affiché au-dessus du tracé (ex. nom du magasin). */
  title?: string
}

const VIEW_W = 520
const VIEW_H = 220
const PAD_L = 44
const PAD_R = 14
const PAD_T = 36
const PAD_B = 34

/**
 * Histogramme paniers / heure en SVG (rendu type graphique exportable, net à toute taille).
 */
export default function PaniersHeureHistogram({ buckets, className, title }: Props) {
  const capId = useId()
  if (!buckets.length) return null

  const max = Math.max(1, ...buckets)
  const total = buckets.reduce((a, b) => a + b, 0)
  const n = buckets.length
  const chartW = VIEW_W - PAD_L - PAD_R
  const chartH = VIEW_H - PAD_T - PAD_B
  const gap = Math.max(0.5, chartW / n * 0.08)
  const barW = Math.max(1, (chartW - gap * (n - 1)) / n)
  const labelEvery = n > 18 ? 2 : n > 14 ? 2 : 1

  const bars = buckets.map((v, i) => {
    const h = (v / max) * chartH
    const x = PAD_L + i * (barW + gap)
    const y = PAD_T + chartH - h
    return { v, x, y, h, i }
  })

  const yTicks = 4
  const tickVals = Array.from({ length: yTicks + 1 }, (_, i) =>
    Math.round((max * i) / yTicks),
  )

  return (
    <figure className={className}>
      {title ? (
        <figcaption id={capId} className="mb-2 text-sm font-semibold text-slate-800">
          {title}
        </figcaption>
      ) : null}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white shadow-sm ring-1 ring-slate-100">
        <svg
          role="img"
          aria-labelledby={title ? capId : undefined}
          aria-label={
            title
              ? undefined
              : `Histogramme des paniers par heure, ${n} tranches, total ${total} paniers`
          }
          width="100%"
          height={VIEW_H}
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="xMidYMid meet"
          className="block w-full max-w-full text-emerald-600"
          xmlns="http://www.w3.org/2000/svg"
        >
          {!title ? <title>Histogramme — paniers par heure ({total} paniers)</title> : null}

          {/* Grille horizontale */}
          {tickVals.map((tv, ti) => {
            const y = PAD_T + chartH - (tv / max) * chartH
            return (
              <g key={`grid-${ti}`}>
                <line
                  x1={PAD_L}
                  y1={y}
                  x2={PAD_L + chartW}
                  y2={y}
                  stroke="#e2e8f0"
                  strokeWidth={1}
                />
                <text
                  x={PAD_L - 8}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-slate-400"
                  style={{ fontSize: 10 }}
                >
                  {tv}
                </text>
              </g>
            )
          })}

          {/* Axe X */}
          <line
            x1={PAD_L}
            y1={PAD_T + chartH}
            x2={PAD_L + chartW}
            y2={PAD_T + chartH}
            stroke="#94a3b8"
            strokeWidth={1.5}
          />

          {/* Barres */}
          {bars.map(({ v, x, y, h, i }) => (
            <g key={i}>
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
                <title>{`${i}h — ${v} panier(s)`}</title>
              </rect>
              {i % labelEvery === 0 ? (
                <text
                  x={x + barW / 2}
                  y={VIEW_H - 10}
                  textAnchor="middle"
                  className="fill-slate-500"
                  style={{ fontSize: 9 }}
                >
                  {i}h
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
            Paniers par heure — total {total}
          </text>
        </svg>
      </div>
    </figure>
  )
}
