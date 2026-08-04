# Commandes client boutique (backoffice)

Workflow opérationnel des commandes soumises depuis la boutique en ligne (`shop_cart`), **en parallèle** de la gestion financière `/clients`.

## Accès

| Route | Permission | Rôle |
|-------|------------|------|
| `/commandes-client` | `commandes_client.read` | Liste + filtres par statut |
| `/commandes-client/[id]` | `commandes_client.read` | Détail, **rattachement client**, **édition lignes** (avant validation), validation, annulation |
| `/commandes-client/preparation` | `commandes_client.prepare` | Liste commandes à préparer (progression par ligne) |
| `/commandes-client/preparation/[id]` | `commandes_client.prepare` | Vue commande puis préparation active (vert/rouge), commentaire, fin → `a_passer_caisse` |
| `/commandes-client/livraison` | `commandes_client.deliver` | Recherche / liste → dialogue commande ; transitions via **Démarrer la livraison** (`a_livrer` → `en_livraison`) et **Confirmer livraison** dans le dialogue uniquement |
| `/commandes-client/retrait` | `commandes_client.deliver` | Retrait comptoir |

Lien accueil backoffice : **Commandes client** ; raccourcis **Préparation commandes** et **Livraison commandes** (permission `commandes_client.deliver`).

## Machine à états (`workflow_status`)

```
nouvelle → a_valider → a_preparer → en_preparation → a_passer_caisse
  → en_cours_caisse ⇄ en_attente_caisse
  → (livraison|retrait) → terminee
                              ↘ annulee (motif obligatoire, avant / pendant caisse)
```

### Caisse POS

| Statut | Signification |
|--------|----------------|
| `a_passer_caisse` | Prête à être prise au poste |
| `en_cours_caisse` | Ouverte sur une caisse (absente de la liste « à passer ») |
| `en_attente_caisse` | Panier / commande mis en attente au POS |

- Prise en caisse → `en_cours_caisse` + verrou poste.
- Mise en attente → `en_attente_caisse`.
- Suppression du panier lié → retour `a_passer_caisse`.
- Encaissement final (lien POS) → `a_livrer` / `a_retirer`.
- Ticket commande imprimé : lignes du **panier caisse réel** (pas la check-list préparation).

### Préparation (`en_preparation`)

1. Liste `/commandes-client/preparation` : commandes `a_preparer` ou `en_preparation`.
2. Ouverture commande `a_preparer` : vue lecture seule (comme fiche commande) + bouton **Préparer la commande**.
3. Passage `en_preparation` : validation ligne par ligne — appui court = disponible (vert), appui long = rupture (rouge), appui sur ligne cochée = décocher.
4. Commentaire préparateur optionnel (`preparation_comment`).
5. **Terminer** : toutes les lignes doivent être vertes ou rouges ; sinon dialogue de confirmation → lignes restantes marquées en rupture → `a_passer_caisse`.

- **`montant_total`** : estimation backoffice (lignes boutique).
- **Total caisse réel** : `shop_cart_pos_link.total` après passage caisse POS — **affiché partout à la place de l'estimation** dès que le lien POS existe (liste commandes, livraison, retrait, préparation).
- **`payment_status = paid`** : client informé à la livraison/retrait, pas de dialogue paiement.

## Magasin

Chaque commande est rattachée à un **`magasin_id`** (obligatoire avant validation). Les listes sont filtrées selon les magasins liés à l'utilisateur.

## Verrou caisse

Une commande au POS (`a_passer_caisse` / `en_cours_caisse` / `en_attente_caisse`) ne peut être ouverte que sur **un poste** à la fois (`caisse_locked_at`). Expiration : **30 minutes**.

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
| `/scan` | POST | deliver — recherche `{ query }` (ticket ou n° panier), `lookupOnly: true` par défaut côté UI |
| `/[id]/start-delivery` | POST | deliver — `a_livrer` → `en_livraison` |
| `/[id]/confirm-delivery` | POST | deliver |
| `/[id]/confirm-pickup` | POST | deliver |
| `/[id]/collect-cash` | POST | deliver (backoffice, sans ticket POS) |

API caisse (token `CAISSE_TICKET_TOKEN`) : voir [`../api/caisse/README.md`](../api/caisse/README.md) et routes `commandes-boutique/*` (`preparation`, `preparation-ticket`, `link`, `a-encaisser`, `collect-payment`).

La caisse POS peut aussi gérer la **préparation papier** : listes `a_preparer` / `en_preparation`, impression check-list par catégorie, transitions `start` / `back` / `finish`.

## Schéma

Migration : `supabase/migrations/20260803240000_shop_cart_workflow.sql`, `20260804000000_shop_cart_en_preparation.sql`, `20260804120000_shop_cart_caisse_en_cours.sql`

- Colonnes `shop_cart` : `magasin_id`, `workflow_status` (incl. `en_preparation`), `preparation_comment`, timestamps workflow, annulation, verrou caisse
- Tables : `shop_cart_pos_link`, `shop_cart_workflow_log`
- Permissions : `commandes_client.read|validate|prepare|deliver`
- Rôle `chauffeur`

## Tests caisse (magasin M00)

Migration `20260804010000_magasin_test_m00.sql` : site **M00** (*Magasin test*).

1. À la **validation** d’une commande (`a_valider` → `a_preparer`), choisir le magasin **M00** (pas M01/M02).
2. Terminer la **préparation** → statut `a_passer_caisse`.
3. Sur la caisse Electron : **magasin 0** → menu **Commandes boutique** (liste élargie en mode test).
4. Les tickets générés sont en **M00** : exclus de la sync CA FTP et des statistiques magasin réels.

Constante code : `TEST_COMMANDE_CLIENT_MAGASIN_CODE` dans `src/lib/commandes-client/default-magasin.ts`.

## Sync avec `/clients`

- Soumission boutique → `workflow_status = nouvelle`
- Rattachement principal : **`/commandes-client/[id]`** → `PATCH /api/commandes-client/[id]/link-client` (`commandes_client.validate`)
- Secours financier : **`/clients`** → `PATCH /api/clients/paniers/[id]/link` (`clients.write`)
- Après rattachement d'une commande **nouvelle** → statut **`a_valider`**
