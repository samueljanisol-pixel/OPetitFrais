import {
  SHOP_CONTACT_PHONE_SETTING_KEY,
  SHOP_PICKUP_MAGASIN_ID_SETTING_KEY,
  type ShopLivraisonPayload,
  type ShopPublicMagasin,
} from "@/lib/shop/livraison-types";
import { isValidDeliveryGeoJson } from "@/lib/shop/point-in-polygon";
import type { SupabaseClient } from "@supabase/supabase-js";

function toPublicMagasin(row: {
  id: string;
  code: string;
  nom: string;
  adresse: string | null;
  ville: string | null;
  lat: number | null;
  lng: number | null;
  google_maps_url: string | null;
}): ShopPublicMagasin {
  return {
    id: row.id,
    code: row.code,
    nom: row.nom,
    adresse: row.adresse,
    ville: row.ville,
    lat: row.lat != null ? Number(row.lat) : null,
    lng: row.lng != null ? Number(row.lng) : null,
    google_maps_url: row.google_maps_url,
  };
}

export async function loadShopLivraisonPayload(
  service: SupabaseClient,
): Promise<ShopLivraisonPayload> {
  const [zoneRes, magasinsRes, contactRes, pickupRes] = await Promise.all([
    service
      .from("shop_delivery_zone")
      .select("id, label, geojson")
      .eq("active", true)
      .maybeSingle(),
    service
      .from("magasins")
      .select("id, code, nom, adresse, ville, lat, lng, google_maps_url")
      .eq("visible_vitrine", true)
      .order("sort_order", { ascending: true })
      .order("nom", { ascending: true }),
    service
      .from("ref_app_setting")
      .select("value")
      .eq("key", SHOP_CONTACT_PHONE_SETTING_KEY)
      .maybeSingle(),
    service
      .from("ref_app_setting")
      .select("value")
      .eq("key", SHOP_PICKUP_MAGASIN_ID_SETTING_KEY)
      .maybeSingle(),
  ]);

  const magasins = ((magasinsRes.data ?? []) as Array<{
    id: string;
    code: string;
    nom: string;
    adresse: string | null;
    ville: string | null;
    lat: number | null;
    lng: number | null;
    google_maps_url: string | null;
  }>).map(toPublicMagasin);

  let zone: ShopLivraisonPayload["zone"] = null;
  const zoneRow = zoneRes.data as { id: string; label: string; geojson: unknown } | null;
  if (zoneRow && isValidDeliveryGeoJson(zoneRow.geojson)) {
    zone = { id: zoneRow.id, label: zoneRow.label, geojson: zoneRow.geojson };
  }

  const contactRaw =
    typeof contactRes.data?.value === "string" ? contactRes.data.value.trim() : "";
  const contactPhone = contactRaw.replace(/\D/g, "").length >= 8 ? contactRaw.replace(/\D/g, "") : null;

  const pickupId =
    typeof pickupRes.data?.value === "string" ? pickupRes.data.value.trim() : "";
  let pickupMagasin: ShopPublicMagasin | null = null;
  if (pickupId) {
    const fromList = magasins.find((m) => m.id === pickupId) ?? null;
    if (fromList) {
      pickupMagasin = fromList;
    } else {
      const { data: row } = await service
        .from("magasins")
        .select("id, code, nom, adresse, ville, lat, lng, google_maps_url")
        .eq("id", pickupId)
        .maybeSingle();
      if (row) pickupMagasin = toPublicMagasin(row);
    }
  }

  return { zone, magasins, contactPhone, pickupMagasin };
}
