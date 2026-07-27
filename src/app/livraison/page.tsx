import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isShopHost, shopPublicUrl } from "@/lib/shop/hosts";
import { loadShopLivraisonPayload } from "@/lib/shop/load-shop-livraison";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import LivraisonClient from "@/app/livraison/LivraisonClient";

export default async function LivraisonPage() {
  const host = (await headers()).get("host");
  if (!isShopHost(host)) {
    redirect(shopPublicUrl("/livraison"));
  }

  let initial;
  try {
    const service = createSupabaseServiceRoleClient();
    initial = await loadShopLivraisonPayload(service);
  } catch {
    initial = {
      zone: null,
      magasins: [],
      contactPhone: null,
      pickupMagasin: null,
    };
  }

  return <LivraisonClient initial={initial} />;
}
