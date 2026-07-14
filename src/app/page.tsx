import { headers } from 'next/headers'
import { isShopHost } from '@/lib/shop/hosts'
import BackofficeHome from '@/app/BackofficeHome'
import ShopOrderPage from '@/app/shop/ShopOrderPage'

export default async function HomePage() {
  const host = (await headers()).get('host')
  if (isShopHost(host)) {
    return <ShopOrderPage />
  }
  return <BackofficeHome />
}
