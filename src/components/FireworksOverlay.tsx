'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type Particle = {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  color: string
  size: number
}

type Rocket = {
  x: number
  y: number
  vy: number
  targetY: number
  color: string
}

const COLORS = ['#f59e0b', '#ec4899', '#10b981', '#3b82f6', '#f97316', '#8b5cf6', '#eab308']

type FireworksOverlayProps = {
  active: boolean
}

/** Feux d'artifice légers en canvas, non bloquants (pointer-events-none). */
export default function FireworksOverlay({ active }: FireworksOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!active || !mounted) return

    const canvas = canvasRef.current
    if (!canvas) return

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reducedMotion) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    let rockets: Rocket[] = []
    let particles: Particle[] = []
    let frame = 0
    let cancelled = false

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    const launchRocket = () => {
      if (cancelled) return
      const x = Math.random() * canvas.width
      const targetY = canvas.height * (0.1 + Math.random() * 0.45)
      rockets.push({
        x,
        y: canvas.height + 8,
        vy: -(8 + Math.random() * 5),
        targetY,
        color: COLORS[Math.floor(Math.random() * COLORS.length)] ?? '#f59e0b',
      })
    }

    const explode = (x: number, y: number, color: string) => {
      const count = 44 + Math.floor(Math.random() * 28)
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.35
        const speed = 2.2 + Math.random() * 4.5
        const maxLife = 60 + Math.random() * 50
        particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: maxLife,
          maxLife,
          color,
          size: 2 + Math.random() * 2.5,
        })
      }
    }

    const drawParticle = (p: Particle) => {
      const alpha = Math.max(0, p.life / p.maxLife)
      const radius = p.size * (0.5 + alpha * 0.8)
      ctx.globalAlpha = alpha
      ctx.beginPath()
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2)
      ctx.fillStyle = p.color
      ctx.fill()
      ctx.globalAlpha = alpha * 0.35
      ctx.beginPath()
      ctx.arc(p.x, p.y, radius * 2.2, 0, Math.PI * 2)
      ctx.fillStyle = p.color
      ctx.fill()
      ctx.globalAlpha = 1
    }

    const tick = () => {
      if (cancelled) return
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      frame++

      if (frame < 420 && frame % 24 === 0) launchRocket()
      if (frame > 420 && frame % 90 === 0) launchRocket()

      rockets = rockets.filter(r => {
        r.y += r.vy
        ctx.beginPath()
        ctx.arc(r.x, r.y, 3, 0, Math.PI * 2)
        ctx.fillStyle = r.color
        ctx.fill()

        ctx.beginPath()
        ctx.moveTo(r.x, r.y)
        ctx.lineTo(r.x, r.y + 18)
        ctx.strokeStyle = `${r.color}aa`
        ctx.lineWidth = 2.5
        ctx.stroke()

        if (r.y <= r.targetY) {
          explode(r.x, r.y, r.color)
          return false
        }
        return true
      })

      particles = particles.filter(p => {
        p.x += p.vx
        p.y += p.vy
        p.vy += 0.07
        p.vx *= 0.985
        p.life -= 1
        drawParticle(p)
        return p.life > 0
      })

      raf = requestAnimationFrame(tick)
    }

    for (let i = 0; i < 8; i++) {
      window.setTimeout(() => launchRocket(), i * 160)
    }
    tick()

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [active, mounted])

  if (!active || !mounted) return null

  return createPortal(
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-20"
      aria-hidden
    />,
    document.body,
  )
}
