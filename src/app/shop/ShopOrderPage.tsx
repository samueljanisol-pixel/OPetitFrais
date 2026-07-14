import { getLocale, getTranslations } from 'next-intl/server'
import { normalizeLocale } from '@/i18n/config'
import { loadShopCatalog } from '@/lib/shop/load-shop-catalog'
import ShopOrderClient from '@/app/shop/ShopOrderClient'

export default async function ShopOrderPage() {
  const locale = normalizeLocale(await getLocale())
  const t = await getTranslations('shop')
  const { groups, error } = await loadShopCatalog(locale, t('uncategorized'))

  return <ShopOrderClient initialGroups={groups} catalogError={error} />
}
