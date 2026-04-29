# Commandes fournisseur

## Commentaires — lot vs commandes (consolidation)

Sur l’écran **détail d’un lot** (`/commandes-fournisseur/validation/lots/[id]`), les données suivent :

- **`commande_fournisseur_lot.commentaire`** : commentaire **général du lot**, affiché et édité dans le bloc « Commentaire du lot ».
- **`commande_fournisseur.commentaire`** : pour chaque **commande incluse**, commentaire métier attaché à la commande (bloc « Commandes incluses »).

Les deux sont exposés dans le GET du lot (relation `commande_fournisseur_lot_inclusion` → `commande_fournisseur`).

### Règles d’édition

Tant que le lot est au statut **brouillon**, la consolidation permet de modifier ces commentaires depuis la même page :

- Sauvegarde du **commentaire du lot** : `PATCH` sur `/api/commandes-fournisseur/validation/lots/[id]` avec `{ lotCommentaire: string | null }` (chaîne vide côté UI envoyée comme `null` après trim côté API).
- Sauvegarde d’un **commentaire de commande** : `PATCH` sur `/api/commandes-fournisseur/commandes/[id]` avec `{ commentaire }` (tel que défini dans la route existante).

Lorsque le lot **n’est plus en brouillon**, les zones correspondantes passent en **lecture seule**.

### Synthèse des commentaires dans le commentaire du lot

Le bouton **Préremplir depuis les commandes** agrège uniquement les commandes ayant un commentaire non vide (après trim), au format multi-lignes :

`{libellé magasin} : {commentaire}`

Si le **commentaire du lot** est déjà rempli, un dialogue permet de **Ajouter sous le texte** (séparation par double saut de ligne) ou de **Remplacer** tout le bloc par la synthèse.

## Lot prêt — lecture seule et retour brouillon

Lorsque le lot est **prêt pour l’achat**, le commentaire du lot est affiché dans un encadré gris (comme les commentaires de commande en lecture seule). Un bouton permet, avec confirmation, de **repasser le lot en brouillon** (`PATCH` sur `/api/commandes-fournisseur/validation/lots/[id]` avec `{ status: "brouillon" }`), ce qui efface `marque_prete_at` et réactive l’édition de la consolidation.

## Matrice lot — groupement par catégorie

Les lignes produit du lot sont **triées comme au récap commande** (`ref_category.sort_order`, libellé, nom produit) et le GET renvoie **`categoryLabel`** par ligne. Dans la matrice, une **ligne d’en-tête** par groupe (fond vert léger, comme le récap) sépare les familles (ex. Fruit, « Sans catégorie » si besoin).

## Achat (lots prêts → clôture)

- **Liste** : `/commandes-fournisseur/achat` — appelle `GET /api/commandes-fournisseur/achat/lots` (filtre préparés ou tous).
- **Détail lot** : `/commandes-fournisseur/achat/lots/[id]` — tableau « sans vendeur » (sélection + attribution groupe), puis **un tableau par vendeur** ; totaux par vendeur (DH), frais généraux éditables (libellé / montant), bloc **Synthèse** (produits + frais). **Sauvegarde automatique** (debounce) via `PATCH /api/commandes-fournisseur/achat/lots/[id]` (`ligneUpdates` et facultatif `fraisUpserts`, `fraisDeleteIds`). Clôture avec `status: "terminee"` ; si `409` + `NEED_CONFIRM_ZERO_QTY`, dialogue de confirmation puis `confirmZeroQtyLines: true`.
- **Vendeurs fournisseur** :
  - `GET/POST /api/commandes-fournisseur/achat/suppliers/[supplierId]/vendeurs` (liste / création, permission achete).
  - `PATCH /api/commandes-fournisseur/achat/suppliers/[supplierId]/vendeurs/[vendeurId]` avec `{ label }` : renommage réservé à la permission **`commandes_fournisseur.vendeurs_renommer`** (cohérence RLS dans la migration SQL associée).

Sur **détail lot achat**, un bouton « crayon » à côté du titre du vendeur permet le renommage lorsque cette permission est accordée.
