'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { Button, Fab, Stack, Tooltip, Typography } from '@mui/material'
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
        <div className="relative mb-5 flex w-full justify-center px-2">
          <div className="relative h-32 w-full max-w-[16.5rem] overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-emerald-100 sm:h-36 sm:max-w-[18rem]">
            <Image
              src="/logo-opetitfrais.png"
              alt="O&apos; Petit Frais — accueil"
              fill
              className="object-contain p-1.5 sm:p-2"
              sizes="(max-width: 640px) min(264px, 90vw), 288px"
              priority
            />
          </div>
        </div>
        <Typography variant="body2" className="!mt-2 !text-slate-600" align="center" component="h1">
          Choisissez une section
        </Typography>
        <Stack className="!mt-8 w-full" spacing={1.5}>
          {can('produits.read') ? (
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
          ) : null}
          {canReadVentes ? (
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
          ) : null}
          {canCommandesFournisseur ? (
            <Button
              component={AppLink}
              href="/commandes-fournisseur"
              variant="outlined"
              color="success"
              size="large"
              fullWidth
              sx={{ borderRadius: 3, textTransform: 'none', fontWeight: 600, py: 1.5, bgcolor: 'rgba(255,255,255,0.9)' }}
            >
              Commandes fournisseur
            </Button>
          ) : null}
        </Stack>
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
