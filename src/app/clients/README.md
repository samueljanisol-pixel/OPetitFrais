# Gestion clients (backoffice)

Phase 1 : comptes clients et **paniers boutique** (pas de sync POS).

## Accès

- Route : `/clients`
- Permissions : `clients.read` (consultation), `clients.write` (CRUD, rattachement, paiements)
- Lien accueil backoffice : **Gestion clients**

## Règle métier

Un **panier boutique en ligne** (`shop_cart`) n'est **pas** une vente. C'est une commande soumise (WhatsApp / copie) qui reste dans `shop_cart`, même une fois payée (`payment_status = paid`).

## Flux

1. **Boutique** — le visiteur soumet son panier (export WhatsApp ou copie) → `status = submitted`, `client_id = null`
2. **Backoffice** — rattachement manuel du panier à un client (`/clients` ou fiche client)
3. **Backoffice** — sélection des paniers impayés → paiement (modes hors crédit, comme fournisseurs)

## Pages

| Route | Rôle |
|-------|------|
| `/clients` | Liste clients + paniers non rattachés |
| `/clients/[id]` | Compte client : paniers, paiements |
| `/clients/[id]/paniers/[cartId]` | Détail panier client : **panier caisse encaissé** (ticket POS + lignes) si lié ; sinon panier boutique. Magasin et caisse POS affichés si encaissé. Bouton « Voir la commande d'origine » si encaissé. |

## API

| Route | Méthode | Permission |
|-------|---------|------------|
| `/api/clients` | GET / POST | read / write |
| `/api/clients/[id]` | GET / PATCH | read / write |
| `/api/clients/paiements` | POST | write |
| `/api/clients/paniers/[cartId]` | GET | read |
| `/api/clients/paniers/[cartId]/link` | PATCH | write |
| `/api/clients/paniers-boutique` | GET | read |

## Schéma (migration `20260803230000_client_gestion.sql`)

- Extension `shop_cart` : `client_id`, `submitted_at`, `montant_total`, `payment_status`
- `client_paiement` + `client_paiement_panier` (1 panier = max 1 paiement backoffice)
- Extension `caisse_client` : `auth_user_id` (futur compte boutique)

## Phase ultérieure (hors scope)

- Ventes caisse POS (`client_vente`), sync Electron, crédit magasin

## Workflow commandes boutique

Le suivi opérationnel (validation, préparation, caisse, livraison) se fait dans **`/commandes-client`** — voir [`../commandes-client/README.md`](../commandes-client/README.md).

Le rattachement panier → client (`PATCH /api/clients/paniers/[id]/link`) passe le panier en `workflow_status = a_valider` s'il était `nouvelle`.
