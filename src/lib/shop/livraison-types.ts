/** Clés `ref_app_setting` pour la boutique publique. */

export const SHOP_CONTACT_PHONE_SETTING_KEY = "shop_contact_phone";
export const SHOP_PICKUP_MAGASIN_ID_SETTING_KEY = "shop_pickup_magasin_id";

export type ShopFulfillmentMode = "pickup" | "home";

export type ShopPublicMagasin = {
  id: string;
  code: string;
  nom: string;
  adresse: string | null;
  ville: string | null;
  lat: number | null;
  lng: number | null;
  google_maps_url: string | null;
};

export type ShopDeliveryZonePublic = {
  id: string;
  label: string;
  geojson: GeoJsonPolygon | GeoJsonMultiPolygon;
};

export type GeoJsonPolygon = {
  type: "Polygon";
  coordinates: number[][][];
};

export type GeoJsonMultiPolygon = {
  type: "MultiPolygon";
  coordinates: number[][][][];
};

export type ShopLivraisonPayload = {
  zone: ShopDeliveryZonePublic | null;
  magasins: ShopPublicMagasin[];
  contactPhone: string | null;
  pickupMagasin: ShopPublicMagasin | null;
};
