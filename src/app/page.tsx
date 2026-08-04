import { headers } from 'next/headers'
import { isShopHost } from '@/lib/shop/hosts'
import { buildHomePageMetadata } from '@/lib/shop/shop-metadata'
import BackofficeHome from '@/app/BackofficeHome'
import ShopOrderPage from '@/app/shop/ShopOrderPage'

export async function generateMetadata() {
  return buildHomePageMetadata()
}

export default async function HomePage() {
  const host = (await headers()).get('host')
  if (isShopHost(host)) {
    return <ShopOrderPage />
  }
  return <BackofficeHome />
}
