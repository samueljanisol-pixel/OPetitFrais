'use client'

import type { ReactNode } from 'react'
import Button, { type ButtonProps } from '@mui/material/Button'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import AppLink from '@/components/AppLink'

type Props = {
  href: string
  children: ReactNode
  size?: ButtonProps['size']
  /**
   * - `text` (défaut) : retour discret, aligné avec le parcours commande (« Récapitulatif »).
   * - `outlined` / `contained` : accent vert (erreurs, cas particuliers).
   */
  variant?: 'text' | 'outlined' | 'contained'
}

/**
 * Lien de retour avec chevron à gauche (navigation arrière lisible).
 */
export default function BackNavButton({
  href,
  children,
  size = 'small',
  variant = 'text',
}: Props) {
  const isSubtle = variant === 'text'

  return (
    <Button
      component={AppLink}
      href={href}
      variant={variant}
      color={isSubtle ? 'inherit' : 'success'}
      size={size}
      startIcon={<ChevronLeftIcon fontSize="small" />}
      sx={
        isSubtle
          ? {
              textTransform: 'none',
              alignSelf: 'flex-start',
              pl: 0,
              minHeight: 36,
              fontWeight: 500,
              '& .MuiButton-startIcon': { mr: 0.5, ml: -0.25 },
            }
          : {
              textTransform: 'none',
              fontWeight: 700,
              letterSpacing: '0.01em',
              borderRadius: 2,
              boxShadow: variant === 'contained' ? 2 : 0,
              borderWidth: variant === 'outlined' ? 2 : undefined,
              py: 1,
              minHeight: 40,
              '& .MuiButton-startIcon': { mr: 0.75, ml: -0.25 },
            }
      }
    >
      {children}
    </Button>
  )
}
