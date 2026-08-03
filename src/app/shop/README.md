# Boutique commande — opetitfrais.ma

Page publique de commande pour les clients particuliers. Accessible sur le domaine boutique (`opetitfrais.ma`) ; le backoffice reste sur `opetitfrais.janisol.ma`.

## Fonctionnement

1. Catalogue produits **actifs** et **visible vitrine** (`active = true`, `visible_vitrine = true`), groupés par catégorie puis sous-catégorie. L’ordre des catégories suit `ref_category.sort_order` (réglable dans Paramètres → Catégories). Barre catégories sticky : chips centrés ; pastille compteur panier **en superposition** (coin supérieur droit), sans modifier la taille du chip.
2. **Numéro de panier interne** : chaque panier reçoit un numéro séquentiel (`shop_cart.cart_number`, affiché `#1001`…) synchronisé via `POST /api/shop/cart/sync`. Repris dans le texte copié et le message WhatsApp. Vider le panier (avec confirmation) clôt le panier en base (`status = cleared`) et le prochain ajout crée un **nouveau numéro**.
3. Le client ajoute des produits au panier :
   - Options = **UdV** (si autorisée) + **unités de commande vitrine** cochées sur le produit (même sans poids pièce ; dans ce cas pas d’estimation « ~X kg / pièce » ni « soit ~X kg »).
   - Favori produit pré-sélectionné sur la carte.
   - **Une seule unité par produit** dans le panier : changement Kg ↔ Botte via le **poids de référence** (`piece_weight_kg` × `piece_qty`). La masse kg est mémorisée (`canonicalKg`) : ex. 2,5 Kg → 3 Botte (~1 kg/botte) → retour Kg = **2,5 Kg**.
   - **Kg** (UdV) : pas de 0,5 kg ; autres unités : pas de 1.
   - Prix catalogue affiché **au kg** (UdV) sur la carte ; poids pièce avec `~` ; total panier / WhatsApp estimés (`piece_qty × poids × prix/kg`).
4. Panier stocké en **localStorage** (`opf-shop-cart-v2`) et **synchronisé serveur** (`shop_cart`) — commentaire produit via **`ShopCommentDialog`** + bulle **`ShopLineCommentBubble`** (vignette et panier) ; commentaire commande **inline** dans le drawer. Les lignes dont le produit n’est plus **actif** ou **visible vitrine** sont retirées **uniquement des paniers en cours** (`status = active`, non soumis) : localStorage, sync API, trigger Postgres sur `product`. **Les commandes envoyées** (`status = submitted`) **conservent toutes leurs lignes**, y compris si le produit est désactivé ensuite.
5. Export : copier la liste texte ou ouvrir WhatsApp (numéro panier + mode livraison + **paiement** + lignes avec commentaires + total + commentaire commande). Au **premier export**, le panier est **soumis** côté serveur (`action = submit` → `status = submitted`, `payment_status = unpaid`) pour le rattachement client en backoffice ([`/clients`](../clients/README.md)).
6. Page **`/livraison`** : carte (zone + magasins), vérif GPS / pin, contact boutique (appel / WhatsApp). API `GET /api/shop/livraison`.
7. **Statistiques anonymes** : heartbeat vers `POST /api/shop/analytics/heartbeat` (visiteur UUID en localStorage). Consultation backoffice : [`/boutique/stats`](../boutique/stats/README.md) (permission `shop.read`).

## Fichiers

| Fichier | Rôle |
|---------|------|
| `ShopOrderPage.tsx` | Server : catalogue + nom magasin retrait |
| `ShopOrderClient.tsx` | Client : slogan, grille, panier, sync serveur |
| `ShopFulfillmentSelector.tsx` | Choix retrait / livraison (drawer panier) |
| `ShopShell.tsx` | Header boutique (logo, langue, panier) |
| `ShopProductCard.tsx` | Carte produit : quantité + **unité de vente** sélectionnée, boutons +/- centrés |
| `ShopPaymentSelector.tsx` | Choix paiement Espèce / Carte Bancaire (panier) |
| `ShopCartPanel.tsx` | Drawer panier + export ; commentaires via dialogue |
| `ShopLineCommentBubble.tsx` | Bulle commentaire produit (vignette + panier) |
| `ShopCommentDialog.tsx` | Fenêtre commentaire produit (`FormDialog`) |
| `../livraison/` | Page carte zone / magasins / contact |
| `src/lib/shop/*` | Hosts, catalogue, panier, livraison, format export, analytics |
| `src/lib/shop/cart-prune.ts` | Retrait lignes panier (produit inactif / hors vitrine) |
| `src/lib/shop/cart-sync-*.ts` | Sync panier → `shop_cart` |
| `src/app/api/shop/cart/sync/route.ts` | API création / mise à jour / clôture / **soumission** panier |
| `src/app/page.tsx` | Route `/` selon le domaine (shop vs backoffice) |
| `src/proxy.ts` | Host boutique ; redirect `/livraison` hors shop → domaine boutique |

## Variables d'environnement

| Variable | Exemple | Usage |
|----------|---------|-------|
| `SHOP_HOSTS` | `opetitfrais.ma,www.opetitfrais.ma` | Domaines boutique |
| `NEXT_PUBLIC_SHOP_HOSTS` | (idem, optionnel client) | Détection host côté client si besoin |
| `BACKOFFICE_HOST` | `opetitfrais.janisol.ma` | Redirect chemins staff |
| `NEXT_PUBLIC_SHOP_WHATSAPP_PHONE` | `212612345678` | Lien WhatsApp (sans +) |

## Déploiement Vercel

Un seul projet Vercel, **deux domaines** :

- `opetitfrais.ma` → boutique à `/`
- `opetitfrais.janisol.ma` → backoffice (auth Supabase)

Variables d'env communes. Cron existant (`vercel.json`) inchangé.

## Développement local

### Lien rapide (sans fichier `hosts`)

En dev, la boutique client est aussi accessible sur :

- **http://localhost:3000/shop** — catalogue + panier
- **http://localhost:3000/shop/livraison** — zone de livraison

Le backoffice reste sur **http://localhost:3000** (accueil staff, auth requise).  
`http://localhost:3000/livraison` redirige vers `/shop/livraison` en dev.

Routes `/shop/*` désactivées en production (`404`).

### Domaines locaux (comme en prod)

Ajouter dans `C:\Windows\System32\drivers\etc\hosts` :

```text
127.0.0.1 opetitfrais.ma
127.0.0.1 opetitfrais.janisol.ma
```

Puis **redémarrer** `npm run dev` :

- `http://opetitfrais.ma:3000` → boutique
- `http://opetitfrais.janisol.ma:3000` → backoffice
- `http://localhost:3000/shop` → boutique (aperçu dev, sans `hosts`)

**Next.js 16** : l'accès via `opetitfrais.ma` en dev exige `allowedDevOrigins` dans [`next.config.ts`](../../../next.config.ts). Sans cela, le JS client est bloqué (boutons inactifs, erreur WebSocket `webpack-hmr`).

## i18n

Namespace `shop.*` dans `src/messages/fr.json` et `ar-MA.json`. Noms produits et catégories via champs DB (`sales_name_ar`, `label_ar`).

## Contrôle catalogue (backoffice)

Dans **Produits → fiche produit**, cocher **Visible vitrine** pour afficher le produit sur `opetitfrais.ma`. Configurer les **unités de commande boutique** (poids pièce, UdV / unités vitrine, favori). Voir aussi [`../produits/README.md`](../produits/README.md) et Paramètres → **Unités commande vitrine**.
