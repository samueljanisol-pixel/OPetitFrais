'use client'

import type { ReactNode } from 'react'
import Button, { type ButtonProps } from '@mui/material/Button'
import AppLink from '@/components/AppLink'

function ArrowBackIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className="shrink-0"
    >
      <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
    </svg>
  )
}

type Props = {
  href: string
  children: ReactNode
  size?: ButtonProps['size']
  /** Même esprit partout : bouton rempli vert pour se détacher du fond. */
  variant?: 'contained' | 'outlined'
}

/**
 * Lien de retour avec flèche à gauche, libellé lisible (accueil, liste, etc.).
 */
export default function BackNavButton({ href, children, size = 'medium', variant = 'contained' }: Props) {
  return (
    <Button
      component={AppLink}
      href={href}
      variant={variant}
      color="success"
      size={size}
      startIcon={<ArrowBackIcon />}
      sx={{
        textTransform: 'none',
        fontWeight: 700,
        letterSpacing: '0.01em',
        borderRadius: 2,
        boxShadow: variant === 'contained' ? 2 : 0,
        borderWidth: variant === 'outlined' ? 2 : 0,
        px: { xs: 1.5, sm: 2 },
        py: 1,
        minHeight: 40,
        '& .MuiButton-startIcon': { mr: 0.75, ml: -0.25 },
      }}
    >
      {children}
    </Button>
  )
}
