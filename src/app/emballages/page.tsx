'use client'

import { useState } from 'react'
import { Box, Paper, Tab, Tabs, Typography } from '@mui/material'
import BackNavButton from '@/components/BackNavButton'
import { useSessionPermissions } from '@/lib/auth/useSessionPermissions'
import { useTranslations } from 'next-intl'
import EmballagesCatalogPanel from './EmballagesCatalogPanel'
import EmballagesTypesPanel from './EmballagesTypesPanel'
import EmballagesAchatsPanel from './EmballagesAchatsPanel'

type TabId = 'catalog' | 'types' | 'achats'

export default function EmballagesPage() {
  const t = useTranslations('backoffice.emballages')
  const { canWriteEmballages } = useSessionPermissions()
  const [tab, setTab] = useState<TabId>('catalog')
  const [err, setErr] = useState<string | null>(null)

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-rose-50 p-4 md:p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-2 flex flex-col gap-1">
          <BackNavButton href="/" size="small">
            {t('backHome')}
          </BackNavButton>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 600, color: '#0f172a' }}>
            {t('title')}
          </Typography>
          <Typography variant="body2" className="!text-slate-600">
            {t('subtitle')}
          </Typography>
        </div>

        {err ? (
          <Paper className="!mb-3 !border-rose-200 !bg-rose-50 !p-3">
            <Typography color="error">{err}</Typography>
          </Paper>
        ) : null}

        <Tabs
          value={tab}
          onChange={(_, v) => {
            setTab(v as TabId)
            setErr(null)
          }}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab value="catalog" label={t('tabs.catalog')} />
          <Tab value="types" label={t('tabs.types')} />
          <Tab value="achats" label={t('tabs.achats')} />
        </Tabs>

        {tab === 'catalog' ? (
          <Box>
            <EmballagesCatalogPanel canWrite={canWriteEmballages} onError={setErr} />
          </Box>
        ) : null}

        {tab === 'types' ? (
          <Box>
            <EmballagesTypesPanel canWrite={canWriteEmballages} onError={setErr} />
          </Box>
        ) : null}

        {tab === 'achats' ? (
          <Box>
            <EmballagesAchatsPanel canWrite={canWriteEmballages} onError={setErr} />
          </Box>
        ) : null}
      </div>
    </div>
  )
}
