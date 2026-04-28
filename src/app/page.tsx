'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { Button, Fab, Paper, Stack, Tooltip } from '@mui/material'
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined'
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined'
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined'
import SettingsIcon from '@mui/icons-material/Settings'
import AppLink from '@/components/AppLink'
import { useSessionPermissions } from '@/lib/auth/useSessionPermissions'
import { clearSessionSnapshot } from '@/lib/auth/session-display-cache'

export default function HomePage() {
  const router = useRouter()
  const { loading, can, canReadVentes, canReadParametres } = useSessionPermissions()
  const canCommandesFournisseur =
    can('commandes_fournisseur.saisie') ||
    can('commandes_fournisseur.consolidation') ||
    can('commandes_fournisseur.achat')

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    clearSessionSnapshot()
    router.replace('/login')
    router.refresh()
  }

  if (loading) {
    return (
      <main className="min-h-[calc(100vh-0px)] flex items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-rose-50 px-6 py-16">
        <p className="text-slate-600">Chargement…</p>
      </main>
    )
  }

  return (
    <main className="relative min-h-[calc(100vh-0px)] bg-gradient-to-br from-emerald-50 via-white to-rose-50 px-6 py-16">
      <div className="mx-auto flex w-full max-w-md flex-col items-center">
        <div className="mb-8 flex w-full justify-center px-2">
          <AppLink
            href="/"
            className="block w-full max-w-[min(26rem,calc(100vw-3rem))] rounded-3xl bg-white p-5 shadow-sm ring-1 ring-emerald-100 transition hover:ring-emerald-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500"
            aria-label="O&apos; Petit Frais — accueil"
          >
            <Image
              src="/logo-opetitfrais.png"
              alt=""
              width={400}
              height={150}
              className="h-auto w-full object-contain"
              sizes="(max-width: 640px) min(320px, 90vw), 416px"
              priority
            />
          </AppLink>
        </div>
        <Paper
          elevation={0}
          className="w-full"
          sx={{
            p: 1.5,
            borderRadius: 3,
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: 'rgba(255,255,255,0.92)',
            boxShadow: '0 1px 3px rgba(15, 118, 110, 0.08)',
          }}
        >
          <Stack spacing={1.25}>
            {can('produits.read') ? (
              <Button
                component={AppLink}
                href="/produits"
                variant="contained"
                color="success"
                size="large"
                fullWidth
                startIcon={<Inventory2OutlinedIcon sx={{ fontSize: 28 }} />}
                sx={{
                  borderRadius: 2,
                  textTransform: 'none',
                  fontWeight: 600,
                  py: 1.25,
                  px: 2,
                  justifyContent: 'flex-start',
                  gap: 1.25,
                  '& .MuiButton-startIcon': { mr: 0.5, ml: 0 },
                }}
              >
                Produits
              </Button>
            ) : null}
            {canReadVentes ? (
              <Button
                component={AppLink}
                href="/ca"
                variant="contained"
                color="success"
                size="large"
                fullWidth
                startIcon={<AssessmentOutlinedIcon sx={{ fontSize: 28 }} />}
                sx={{
                  borderRadius: 2,
                  textTransform: 'none',
                  fontWeight: 600,
                  py: 1.25,
                  px: 2,
                  justifyContent: 'flex-start',
                  gap: 1.25,
                  '& .MuiButton-startIcon': { mr: 0.5, ml: 0 },
                }}
              >
                Statistique
              </Button>
            ) : null}
            {canCommandesFournisseur ? (
              <Button
                component={AppLink}
                href="/commandes-fournisseur"
                variant="contained"
                color="success"
                size="large"
                fullWidth
                startIcon={<LocalShippingOutlinedIcon sx={{ fontSize: 28 }} />}
                sx={{
                  borderRadius: 2,
                  textTransform: 'none',
                  fontWeight: 600,
                  py: 1.25,
                  px: 2,
                  justifyContent: 'flex-start',
                  gap: 1.25,
                  '& .MuiButton-startIcon': { mr: 0.5, ml: 0 },
                }}
              >
                Commandes fournisseur
              </Button>
            ) : null}
          </Stack>
        </Paper>
        <Button
          type="button"
          onClick={() => void logout()}
          className="!mt-8"
          sx={{ textTransform: 'none', color: 'text.secondary' }}
        >
          Déconnexion
        </Button>
      </div>

      {canReadParametres ? (
        <Tooltip title="Paramètres">
          <Fab
            component={AppLink}
            href="/referentiel"
            color="success"
            aria-label="Paramètres"
            sx={{
              position: 'fixed',
              right: 24,
              bottom: 24,
              zIndex: 10,
            }}
          >
            <SettingsIcon />
          </Fab>
        </Tooltip>
      ) : null}
    </main>
  )
}
