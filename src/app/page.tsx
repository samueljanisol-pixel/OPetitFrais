'use client'

import Image from 'next/image'
import { Button, Stack, Typography } from '@mui/material'
import AppLink from '@/components/AppLink'

export default function HomePage() {
  return (
    <main className="min-h-[calc(100vh-0px)] bg-gradient-to-br from-emerald-50 via-white to-rose-50 px-6 py-16">
      <div className="mx-auto flex w-full max-w-md flex-col items-center">
        <div className="relative mb-6 h-24 w-48 overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-emerald-100">
          <Image
            src="/logo-opetitfrais.png"
            alt="O&apos; Petit Frais"
            fill
            className="object-contain p-2"
            sizes="192px"
            priority
          />
        </div>
        <Typography variant="h4" className="!font-semibold !tracking-tight !text-slate-900" component="h1">
          O&apos; Petit Frais
        </Typography>
        <Typography variant="body2" className="!mt-2 !text-slate-600" align="center">
          Choisissez une section
        </Typography>
        <Stack className="!mt-8 w-full" spacing={1.5}>
          <Button
            component={AppLink}
            href="/produits"
            variant="contained"
            color="success"
            size="large"
            fullWidth
            sx={{ borderRadius: 3, textTransform: 'none', fontWeight: 600, py: 1.5 }}
          >
            Produits
          </Button>
          <Button
            component={AppLink}
            href="/ca"
            variant="outlined"
            color="success"
            size="large"
            fullWidth
            sx={{ borderRadius: 3, textTransform: 'none', fontWeight: 600, py: 1.5, bgcolor: 'rgba(255,255,255,0.9)' }}
          >
            Statistique
          </Button>
          <Button
            component={AppLink}
            href="/referentiel"
            variant="outlined"
            color="success"
            size="large"
            fullWidth
            sx={{ borderRadius: 3, textTransform: 'none', fontWeight: 600, py: 1.5, bgcolor: 'rgba(255,255,255,0.9)' }}
          >
            Référentiel
          </Button>
        </Stack>
      </div>
    </main>
  )
}
