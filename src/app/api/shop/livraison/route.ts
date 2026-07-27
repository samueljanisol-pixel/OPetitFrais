import { NextResponse } from "next/server";
import { loadShopLivraisonPayload } from "@/lib/shop/load-shop-livraison";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export async function GET() {
  let service;
  try {
    service = createSupabaseServiceRoleClient();
  } catch {
    return NextResponse.json({ error: "Service role non configurée" }, { status: 500 });
  }

  try {
    const payload = await loadShopLivraisonPayload(service);
    return NextResponse.json(payload);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
