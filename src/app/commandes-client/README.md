# Commandes client boutique (backoffice)

Workflow opérationnel des commandes soumises depuis la boutique en ligne (`shop_cart`), **en parallèle** de la gestion financière `/clients`.

## Accès

| Route | Permission | Rôle |
|-------|------------|------|
| `/commandes-client` | `commandes_client.read` | Liste + filtres par statut |
| `/commandes-client/[id]` | `commandes_client.read` | Détail, **rattachement client**, **édition lignes** (avant validation), validation, annulation |
| `/commandes-client/preparation` | `commandes_client.prepare` | Liste commandes à préparer (progression par ligne) |
| `/commandes-client/preparation/[id]` | `commandes_client.prepare` | Vue commande puis préparation active (vert/rouge), commentaire, fin → `a_passer_caisse` |
| `/commandes-client/livraison` | `commandes_client.deliver` | Scan ticket + confirmation livraison |
| `/commandes-client/retrait` | `commandes_client.deliver` | Retrait comptoir |

Lien accueil backoffice : **Commandes client**.

## Machine à états (`workflow_status`)

```
nouvelle → a_valider → a_preparer → en_preparation → a_passer_caisse → (livraison|retrait) → terminee
                              ↘ annulee (motif obligatoire, avant caisse)
```

### Préparation (`en_preparation`)

1. Liste `/commandes-client/preparation` : commandes `a_preparer` ou `en_preparation`.
2. Ouverture commande `a_preparer` : vue lecture seule (comme fiche commande) + bouton **Préparer la commande**.
3. Passage `en_preparation` : validation ligne par ligne — appui court = disponible (vert), appui long = rupture (rouge), appui sur ligne cochée = décocher.
4. Commentaire préparateur optionnel (`preparation_comment`).
5. **Terminer** : toutes les lignes doivent être vertes ou rouges ; sinon dialogue de confirmation → lignes restantes marquées en rupture → `a_passer_caisse`.

- **`montant_total`** : estimation backoffice (lignes boutique).
- **Total caisse réel** : `shop_cart_pos_link.total` après passage caisse POS.
- **`payment_status = paid`** : client informé à la livraison/retrait, pas de dialogue paiement.

## Magasin

Chaque commande est rattachée à un **`magasin_id`** (obligatoire avant validation). Les listes sont filtrées selon les magasins liés à l'utilisateur.

## Verrou caisse

Une commande `a_passer_caisse` ne peut être ouverte que sur **un poste** à la fois (`caisse_locked_at`, `caisse_locked_by`). Expiration : **30 minutes**.

## Journal

Table append-only **`shop_cart_workflow_log`** : transitions, annulations, lien ticket POS, confirmations livraison/retrait.

## API

Préfixe `/api/commandes-client` :

| Route | Méthode | Permission |
|-------|---------|------------|
| `/` | GET | read |
| `/[id]` | GET, PATCH | read / validate |
| `/shop-catalog` | GET | validate (catalogue vitrine pour ajout produit) |
| `/[id]/log` | GET | read |
| `/[id]/link-client` | PATCH | validate |
| `/[id]/validate` | POST | validate |
| `/[id]/cancel` | POST | validate |
| `/[id]/start-preparation` | POST | prepare |
| `/[id]/lines/[lineKey]/prepared` | PATCH | prepare (statut ligne : available / unavailable / unchecked) |
| `/[id]/finish-preparation` | POST | prepare |
| `/scan` | POST | deliver |
| `/[id]/confirm-delivery` | POST | deliver |
| `/[id]/confirm-pickup` | POST | deliver |
| `/[id]/collect-cash` | POST | deliver |

API caisse (token `CAISSE_TICKET_TOKEN`) : `/api/caisse/commandes-boutique/*` — voir [`../api/caisse/README.md`](../api/caisse/README.md).

## Schéma

Migration : `supabase/migrations/20260803240000_shop_cart_workflow.sql`, `20260804000000_shop_cart_en_preparation.sql`

- Colonnes `shop_cart` : `magasin_id`, `workflow_status` (incl. `en_preparation`), `preparation_comment`, timestamps workflow, annulation, verrou caisse
- Tables : `shop_cart_pos_link`, `shop_cart_workflow_log`
- Permissions : `commandes_client.read|validate|prepare|deliver`
- Rôle `chauffeur`

## Sync avec `/clients`

- Soumission boutique → `workflow_status = nouvelle`
- Rattachement principal : **`/commandes-client/[id]`** → `PATCH /api/commandes-client/[id]/link-client` (`commandes_client.validate`)
- Secours financier : **`/clients`** → `PATCH /api/clients/paniers/[id]/link` (`clients.write`)
- Après rattachement d'une commande **nouvelle** → statut **`a_valider`**
