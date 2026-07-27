# Livraison & magasins (boutique)

Page publique `/livraison` sur le domaine boutique (`opetitfrais.ma`).

## Contenu

- Carte Leaflet (zone de livraison + marqueurs magasins `visible_vitrine`)
- Vérification GPS (géoloc navigateur) ou clic sur la carte → point-dans-polygone
- Fiche magasin de retrait + liste magasins (liens Google Maps)
- Contact boutique : Appeler / WhatsApp (`ref_app_setting.shop_contact_phone`)

## Données

- Migration `20260727170000_shop_delivery_zone.sql`
- Table `shop_delivery_zone` (GeoJSON actif)
- Colonnes publiques sur `magasins` (adresse, lat/lng, `google_maps_url`, `visible_vitrine`)
- Settings : `shop_contact_phone`, `shop_pickup_magasin_id`

## Admin

Paramètres → **Zone livraison** + fiches magasins (Administration).

## Fichiers

| Fichier | Rôle |
|---------|------|
| `page.tsx` | Server : charge payload, redirect hors shop |
| `LivraisonClient.tsx` | Carte, GPS, listes, contact |
| `src/lib/shop/load-shop-livraison.ts` | Chargement payload |
| `src/lib/shop/map/*` | Carte Leaflet (dynamic, no SSR) |
| `GET /api/shop/livraison` | API publique |
| `GET/PUT /api/admin/shop-delivery-zone` | Admin |
