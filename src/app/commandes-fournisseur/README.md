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

## Récap commande (`saisie/[id]/recap`)

Sur chaque ligne : grille fixe **−1 | qté (4,25 rem) | unité (2,25 rem réservée) | +1** — champs qté alignés verticalement ; libellé **conditionnement** (`condTitre`) au-dessus des boutons ± ; **« Soit … »** en 2ᵉ rangée sous la qté (`col-span-2`, une seule ligne).

### Commentaire par ligne (`line_comment`)

- Champ **`commande_fournisseur_ligne.line_comment`** (texte libre).
- En saisie (récap) : pastille à droite sous les quantités + icône commentaire → dialogue (Enregistrer / Supprimer) → `PUT …/commandes/[id]/lignes` (`lineComment`).
- **Consolidation** (matrice magasins) et **achat** : même pastille + bouton **sous la cellule quantité** (par magasin en consolidation) ; sauvegarde via `PATCH /api/commandes-fournisseur/lots/[id]/commentaire-ligne` (`ligneId`, `lineComment`). RLS dédiée : migration `20260622120000_commande_ligne_comment_lot.sql` (commandes `validee` / `integree` dans un lot brouillon ou prêt).

## Vendeur produit → achat

Si **`product.vendeur_id`** est renseigné (fiche produit, même fournisseur) :

- À la **création du lot** (consolidation) et à l’**ajout d’un produit** (validation / achat), la ligne lot reçoit ce `vendeur_id`.
- Au passage **brouillon → prêt**, les lignes encore sans vendeur sont complétées depuis le produit.
- En **achat**, le produit apparaît directement dans le tableau du vendeur (repli UI sur `product.vendeur_id` si la ligne n’a pas encore été persistée).

## Quantités (saisie, validation, achat)

Les quantités stockées en base sont en **`numeric(14,2)`** (au plus **2 décimales** côté UI) pour les lignes de commande, la répartition par magasin sur un lot, et les champs `qte_achat` / `qte_besoin_fige` des lignes de lot. Voir la migration `supabase/migrations/20260530143000_commande_quantites_decimal.sql`.

## Achat (lots prêts → clôture)

- **Liste** : `/commandes-fournisseur/achat` — appelle `GET /api/commandes-fournisseur/achat/lots` (filtre préparés ou tous).
- **Détail lot** : `/commandes-fournisseur/achat/lots/[id]` — tableau « sans vendeur » (sélection + attribution groupe), puis **un tableau par vendeur** ; totaux par vendeur (DH), frais généraux éditables (libellé / montant, montant saisi en numérique max 2 décimales). **Sauvegarde automatique** (debounce) des **lignes produit** via `PATCH` (`ligneUpdates` seul, sans toucher aux frais en cours de saisie) ; les **frais** au **blur** des champs, à la **suppression** d’une ligne, ou avec la **clôture** ; le `PATCH` qui modifie les frais renvoie `frais` (globaux) pour éviter un GET redondant. Requêtes **enfilées** (pas de doubles inserts). Clôture avec `status: "terminee"` ; si `409` + `NEED_CONFIRM_ZERO_QTY`, dialogue puis `confirmZeroQtyLines: true`. Sous chaque produit : **`saisieComments`** (commentaires `line_comment` des commandes du lot, par magasin).
- **Vendeurs fournisseur** :
  - `GET/POST /api/commandes-fournisseur/achat/suppliers/[supplierId]/vendeurs` (liste / création, permission achete).
  - `PATCH /api/commandes-fournisseur/achat/suppliers/[supplierId]/vendeurs/[vendeurId]` avec `{ label }` : renommage réservé à la permission **`commandes_fournisseur.vendeurs_renommer`** (cohérence RLS dans la migration SQL associée).

Sur **détail lot achat**, un bouton « crayon » à côté du titre du vendeur permet le renommage lorsque cette permission est accordée.
