# Statistiques boutique

Page backoffice : `/boutique/stats` (permission `shop.read`).

Lien **Ouvrir le site** dans l’en-tête : ouvre la boutique publique (`shopPublicUrl()` → `https://opetitfrais.ma/`) dans un nouvel onglet.

## Métriques

| Indicateur | Définition |
|------------|------------|
| **Visites aujourd'hui** | Nombre de visiteurs uniques ayant ouvert la boutique aujourd'hui (fuseau `Africa/Casablanca`). |
| **Visiteurs actifs** | Visiteurs avec activité dans les **15** dernières minutes (`SHOP_ACTIVE_VISITOR_MINUTES`). |
| **Paniers en cours** | Paniers avec au moins une ligne, synchronisés dans les **30** dernières minutes (`SHOP_ACTIVE_CART_MINUTES`). |

## Collecte côté boutique

La boutique publique envoie un **heartbeat** anonyme :

- `POST /api/shop/analytics/heartbeat`
- Clé visiteur UUID stockée en `localStorage` (`opf-shop-visitor-v1`)
- Déclenché au chargement, toutes les 60 s, et à chaque changement de panier

## API backoffice

- `GET /api/shop/analytics/dashboard?days=30` — nécessite `shop.read`

## Base de données

Migration : `supabase/migrations/20260715120000_shop_analytics.sql`

- `shop_visitor` — dernier passage
- `shop_visit_day` — une ligne par visiteur et par jour
- `shop_cart_state` — dernier état panier (lignes + montant)

RLS activé sans politique publique : accès serveur via **service role** uniquement.

## Graphique

Histogramme SVG des visites par jour (30 derniers jours). Clic sur une barre pour afficher la valeur ; zoom par glisser / boutons / molette.

## Permission

- Clé : `shop.read`
- Rôle `gestionnaire` : accordée par la migration
