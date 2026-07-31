import { notFound } from "next/navigation";
import LivraisonClient from "@/app/livraison/LivraisonClient";
import { loadShopLivraisonPayload } from "@/lib/shop/load-shop-livraison";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

/** Livraison boutique en local : http://localhost:3000/shop/livraison (dev uniquement). */
export default async function ShopLocalLivraisonPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
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
