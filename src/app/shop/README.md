# Boutique commande — opetitfrais.ma

Page publique de commande pour les clients particuliers. Accessible sur le domaine boutique (`opetitfrais.ma`) ; le backoffice reste sur `opetitfrais.janisol.ma`.

## Fonctionnement

1. Catalogue produits **actifs** et **visible vitrine** (`active = true`, `visible_vitrine = true`), groupés par catégorie puis sous-catégorie.
2. Le client ajoute des produits au panier :
   - **Kg** : pas de 0,5 kg (500 g)
   - **Unité** : pas de 1
3. Panier stocké **uniquement en cache navigateur** (`localStorage`, clé `opf-shop-cart-v1`) — aucune base de données, aucune identification.
4. Export : copier la liste texte ou ouvrir WhatsApp avec le message pré-rempli.

## Fichiers

| Fichier | Rôle |
|---------|------|
| `ShopOrderPage.tsx` | Server : charge le catalogue (service role) |
| `ShopOrderClient.tsx` | Client : grille, panier, catégories |
| `ShopShell.tsx` | Header boutique (logo, langue, panier) |
| `ShopProductCard.tsx` | Carte produit avec +/- |
| `ShopCartPanel.tsx` | Drawer panier + export |
| `src/lib/shop/*` | Hosts, catalogue, panier, format export |
| `src/app/page.tsx` | Route `/` selon le domaine (shop vs backoffice) |
| `src/proxy.ts` | Host boutique public ; redirect chemins backoffice |

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

Ajouter dans `C:\Windows\System32\drivers\etc\hosts` :

```text
127.0.0.1 opetitfrais.ma
127.0.0.1 opetitfrais.janisol.ma
```

Puis :

- `http://opetitfrais.ma:3000` → boutique
- `http://opetitfrais.janisol.ma:3000` → backoffice

## i18n

Namespace `shop.*` dans `src/messages/fr.json` et `ar-MA.json`. Noms produits et catégories via champs DB (`sales_name_ar`, `label_ar`).

## Contrôle catalogue (backoffice)

Dans **Produits → fiche produit**, cocher **Visible vitrine** pour afficher le produit sur `opetitfrais.ma`. Voir aussi [`../produits/README.md`](../produits/README.md).
