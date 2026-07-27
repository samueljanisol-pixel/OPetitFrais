import { getLocale, getTranslations } from 'next-intl/server'
import { normalizeLocale } from '@/i18n/config'
import { loadShopCatalog } from '@/lib/shop/load-shop-catalog'
import { loadShopLivraisonPayload } from '@/lib/shop/load-shop-livraison'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/server'
import ShopOrderClient from '@/app/shop/ShopOrderClient'

export default async function ShopOrderPage() {
  const locale = normalizeLocale(await getLocale())
  const t = await getTranslations('shop')
  const { groups, error } = await loadShopCatalog(locale, t('uncategorized'))

  let pickupMagasinName: string | null = null
  try {
    const service = createSupabaseServiceRoleClient()
    const livraison = await loadShopLivraisonPayload(service)
    pickupMagasinName = livraison.pickupMagasin?.nom ?? null
  } catch {
    pickupMagasinName = null
  }

  return (
    <ShopOrderClient
      initialGroups={groups}
      catalogError={error}
      pickupMagasinName={pickupMagasinName}
    />
  )
}
