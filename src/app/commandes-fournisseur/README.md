# Commandes fournisseur

## Date de livraison (Station, Marché)

Pour les fournisseurs **Marché** (`ref_supplier.code = marche`) et **Station** (fournisseur sans marchands / vendeurs), chaque commande magasin porte une **`date_livraison`** (type `date`).

| Étape | Comportement |
|---|---|
| **Nouvelle commande** | Champ date (défaut : **lendemain**) ; modifiable avant validation |
| **Récap saisie** | Affichage + bouton **Modifier** (fenêtre interne) ; modifiable tant que statut `en_saisie` ou `validee` (non intégrée) |
| **Constitution lot** | Refus si les commandes sélectionnées ont des dates de livraison différentes ; confirmation si **un seul magasin** (dialogue existant) |
| **Détail lot** | Affichage + bouton **Modifier** (fenêtre interne) ; modifiable en **brouillon**, prévalidation (admin) ou **prêt** (avant saisie achat réelle) ; propagée aux commandes incluses |

Migration : `20260814140000_commande_date_livraison.sql`.  
Backfill lots existants : `20260814150000_backfill_lot_date_livraison.sql` (lendemain calendaire de `created_at`, fuseau `Africa/Casablanca`).

## Hub d’accueil (`/commandes-fournisseur`)

Depuis l’accueil backoffice, le bouton **Commandes fournisseur** mène à `/commandes-fournisseur`.

| Permissions (espaces) | Comportement |
|---|---|
| **Aucune** des 3 (`saisie`, `consolidation`, `achat`) | Redirection `/access-refuse` |
| **Une seule** | Redirection directe vers l’espace autorisé (priorité : saisie → validation → achat) |
| **Deux ou plus** | Page hub avec un bouton par espace autorisé (Saisie, Validation, Achat) |

Les **comptes fournisseurs** (`commandes_fournisseur.comptes`) restent un accès séparé depuis l’accueil, pas depuis ce hub.

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

## Prévalidation et passage « prêt pour l’achat »

Cycle consolidation : **`brouillon`** → **`prevalidation`** (gestionnaire) → **`prete`** (administrateur) → **`achat_en_cours`** → **`terminee`**.

- **Gestionnaire** : en brouillon, le bouton **Soumettre en prévalidation** remplace l’ancien « Marquer prêt pour l’achat ». Le lot devient **lecture seule** pour le gestionnaire ; le **récap par vendeur** et les **exports PNG** sont visibles (sans WhatsApp ni photo achat).
- **Administrateur** (`roles.slug === administrateur`) : peut **modifier la consolidation** en prévalidation comme en brouillon (matrice, vendeurs, commentaires, ajout produit), puis **Marquer prêt pour l’achat** (`PATCH` `{ status: "prete" }`, fige les besoins et assigne les vendeurs). Peut aussi passer **directement** brouillon → prêt, ou **revenir en saisie** depuis la prévalidation (`PATCH` `{ status: "brouillon" }`, admin seul). **WhatsApp vendeur / chauffeur** et coche « déjà envoyé » : **administrateur uniquement** (lot prêt ou achat en cours).
- Migration : `20260731220000_lot_status_prevalidation.sql` (CHECK statut, libellé, RLS commentaires vendeur et sync magasin). Complément commentaires de ligne : `20260731223000_lot_prevalidation_line_comment_rls.sql`.

## Lot prêt — lecture seule et retour brouillon

Lorsque le lot est **prêt pour l’achat** (ou **achat en cours** sans saisie achat commencée), le commentaire du lot est affiché dans un encadré gris (comme les commentaires de commande en lecture seule). Un bouton permet, avec confirmation, de **repasser le lot en brouillon** (`PATCH` … `{ status: "brouillon" }`), ce qui efface `marque_prete_at` et réactive l’édition de la consolidation — **masqué / refusé** dès qu’une saisie achat a commencé (qté/prix/montant/marque sur les lignes ; flag `achatStarted` du GET). Le statut `achat_en_cours` seul (sans saisie) ne bloque plus le retour en saisie.

### Statut `achat_en_cours`

Cycle : `brouillon` → `prevalidation` → `prete` → **`achat_en_cours`** → `terminee`.  
Dès la première modification d’achat (lignes, frais, produit, clôture vendeur, photo…), le lot passe automatiquement en **Achat en cours** (migration `20260728200000_lot_status_achat_en_cours.sql`). La réouverture d’un lot terminé repasse en `achat_en_cours`.

### Récapitulatif par vendeur (lot prêt)

Sur `/commandes-fournisseur/validation/lots/[id]`, lorsque le statut est **`prevalidation`**, **`prete`** ou **`achat_en_cours`** (récap) :

1. **Matrice consolidation** en haut (lecture seule) : colonnes magasins en **codes MXX** (ex. M01).
2. **Export consolidation** (sous « Revenir en saisie ») : PNG de toute la commande — **par catégorie** et **par vendeur** (si le fournisseur a des marchands), plus **WhatsApp chauffeur**. Format **A4 paysage** : largeurs au texte, quantités centrées, zoom pour tenir sur la page. **Par catégorie** : une catégorie peut **s’étaler sur plusieurs colonnes** (libellé **répété**). **Par vendeur** : **un tableau vendeur n’est jamais coupé** (blocs entiers répartis sur les colonnes). Images **toujours en arabe**. Colonne **Total** absente s’il n’y a qu’**un seul magasin**. **Station** : un seul export (par catégorie). Migration `20260725230000_profiles_phone_chauffeur_setting.sql`.
3. **Récap groupé par vendeur** en dessous (`ValidationLotVendeurRecap`) :

- Colonnes magasins en **codes MXX** (ex. M01, M12) — pas le nom du magasin (`magasinCodeMx`).
- Tableau par vendeur : **Produit** (libellé selon locale d’export + **nom arabe** `product.name_ar` si renseigné), quantités par MXX, **Total** (uniquement s’il y a **plus d’un magasin**), **UdV / cond.** (avec « Soit … » si conditionnement). Si le fournisseur n’a **aucun marchand** (`vendeurs` vide, ex. **Station**), le groupe sans `vendeur_id` est intitulé avec le **nom du fournisseur** (plus « Sans vendeur »).
- **Date de commande** dans l’image exportée et dans le nom du fichier (`validated_at` ou `created_at` des commandes incluses ; plage si plusieurs jours). L’en-tête export **n’affiche plus** la ligne « Commande Fournisseur : … » (nom du vendeur ou magasin suffit).
- **Langue de l’image** : `preferred_locale` du vendeur (`fr` / `ar-MA`). **Fournisseur sans marchands** (Station) : pas de vendeur → l’export est **toujours en arabe** (même si l’UI est en français).
- **Commentaires** : `line_comment` dans la **cellule quantité** du magasin (bas à droite, souvent en arabe, `dir="rtl"`). Optionnel : **commentaire par vendeur** (table `commande_fournisseur_lot_vendeur_comment`, éditable en brouillon et quand le lot est prêt) affiché sous chaque groupe vendeur et en bas de l’image exportée. Police **Noto Sans Arabic** (ligatures) pour l’écran et l’export PNG.
- Bouton **Exporter en image** par vendeur : capture PNG (`html-to-image`, rendu navigateur + polices embarquées) puis **partage natif** (`navigator.share` avec fichier) sur mobile, sinon **téléchargement** du PNG — pour envoi WhatsApp, e-mail, SMS, etc. Nom de fichier du type `commande-2026-05-19-{fournisseur}-{vendeur}.png`. L’ordre des colonnes de l’image suit l’affichage (RTL en arabe) via `dir` / `style.direction` sur le nœud capturé — **pas** `sx.direction` (inversé par `stylis-plugin-rtl`).
- Bouton **Envoyer WhatsApp** (si le vendeur a un **téléphone** renseigné dans Paramètres → Vendeurs) : télécharge l’image en arrière-plan (nom unique horodaté à chaque clic, ex. `commande-2026-05-19-fournisseur-vendeur-1734567890123.png`) et ouvre directement la conversation `wa.me` du vendeur (comme le panier boutique). L’image est pré-capturée dans la langue du vendeur (Station : toujours arabe) ; le commentaire figure dans l’image, pas dans le message WhatsApp. Une **coche verte** apparaît à côté du bouton après le premier clic (enregistré en base par lot et vendeur, visible pour toute l’équipe). Migration `20260725220000_lot_vendeur_whatsapp_sent.sql` — colonne `whatsapp_sent_at` sur `commande_fournisseur_lot_vendeur_comment` ; `PATCH` `{ whatsappSent: { vendeurKey } }`. Après **retour en saisie**, toute modification du **tableau d’un vendeur** (qté magasin, changement de vendeur, suppression ou ajout de ligne) **efface la coche** pour ce vendeur (`lot-vendeur-whatsapp.ts`).
- **Photo commande → achat** : dès qu’un lot est **prêt**, la pré-capture PNG du récap vendeur (et chaque envoi WhatsApp) est enregistrée automatiquement dans les photos achat du vendeur (`POST …/validation/lots/[id]/vendeurs/[vendeurKey]/commande-photo`, bucket `achat-vendeur-photos`, fichier fixe `commande-whatsapp.png`). Visible ensuite dans le détail achat (icône appareil photo). **Non supprimable** (pas de bouton supprimer ; DELETE API refusé). RLS consolidation : `20260728193000_achat_vendeur_photos_consolidation.sql`.

Le GET lot validation renvoie aussi `vendeurs` (`ref_supplier_vendeur` du fournisseur), `product.name_ar`, et les dates `created_at` / `validated_at` des commandes incluses.

## Matrice lot — groupement catégorie ou vendeur

Sur le détail lot validation, un **toggle** permet d’afficher la matrice **par catégorie** (défaut) ou **par vendeur** — en **brouillon** (tous) ou **prévalidation** (administrateur).

- **Prévalidation (gestionnaire) / lot prêt** : matrice **par catégorie** en lecture seule ; récap vendeur et exports en bas. **WhatsApp** et **photo achat** uniquement à partir de **`prete`**.

- **Par catégorie** : lignes triées comme au récap commande (`ref_category.sort_order`, libellé, nom produit) ; en-tête bandeau vert par famille (ex. Fruit, « Sans catégorie »).
- **Par vendeur** : en-tête par marchand (`vendeur_id` ou nom fournisseur si aucun vendeur) avec **champ commentaire vendeur** (sauvegarde au blur, statuts lot `brouillon`, `prevalidation` (admin), `prete`). Colonne **Vendeur** avec liste déroulante pour **attribuer ou changer** le marchand d’un produit (consolidation éditable : brouillon ou prévalidation admin) ; met à jour `commande_fournisseur_lot_ligne.vendeur_id` et le dernier vendeur sur la fiche produit. API : `PATCH` `{ status: "prevalidation" }` (gestionnaire) ; `PATCH` `{ status: "prete" }` (admin) ; `PATCH` `{ ligneUpdates: [{ lotLigneId, vendeur_id }] }` ; `PATCH` `{ vendeurCommentaire: { vendeurKey, commentaire } }` ; GET renvoie `vendeurCommentaires`.

Le GET renvoie **`categoryLabel`** par ligne pour le groupement catégorie.

### Internationalisation (détail lot validation)

L’écran `/commandes-fournisseur/validation/lots/[id]` utilise `next-intl` pour tous les libellés UI visibles (actions, dialogues, placeholders, états de chargement et textes d’aide) via les namespaces :

- `backoffice.commandes.validation.lotDetail`
- `backoffice.commandes.common`
- `backoffice.commandes.errors`
- `common`

Le composant client s’appuie aussi sur `useAppFormat()` (dates/nombres selon locale) et `useBackChevronIcon()` (icône de retour LTR/RTL).

**Matrice consolidation** (locale UI) : en-têtes de **catégorie** (`ref_category.label_ar` si `ar-MA`), **noms produit** (`name_ar`), libellés **UdV / cond.** et « Soit … » suivent la locale ; repli sur le français si le libellé arabe est absent.

### Colonne UdV / conditionnement (validation)

**En-têtes colonnes magasin** (matrice consolidation, tous statuts lot) : codes **MXX** (`magasinCodeMx`, ex. M01) — le nom complet du magasin reste utilisé pour l’accessibilité et les commentaires. Largeurs de colonnes **ajustées au texte** (`width: max-content`) ; quantités magasins et total **centrés** dans la cellule.

Comme au **récap saisie** : la colonne affiche l’**UdC** (`ref_order_unit`, repli UdV) à l’unité, ou le **libellé conditionnement** si colis ; **« Soit … »** en dessous si applicable.

- À la **création du lot**, `product_packaging_id` est repris de chaque ligne de commande (agrégation par produit **et** conditionnement).
- Pour les lots déjà créés sans cette FK, le **GET lot** complète depuis les lignes `commande_fournisseur_ligne` lorsqu’un seul conditionnement distinct existe pour le produit.
- Sous chaque **qté par magasin** (matrice) : ligne **« Soit … »** en petit lorsque la ligne est en conditionnement (comme le récap saisie).
- **Suppression d’une ligne produit** (lot brouillon) : dialogue de confirmation avant `PATCH` `removeLotLigneId`.

## Récap commande (`saisie/[id]/recap`)

Sur chaque ligne : **−10 / −1 / −0,5** et **+0,5 / +1 / +10** (demi-pas en dessous des grands pas) autour du champ qté ; grille fixe **−1 | qté (4,25 rem) | unité (2,25 rem réservée) | +1** au récap — champs qté alignés verticalement ; libellé **conditionnement** (`condTitre`) au-dessus des boutons ± ; **« Soit … »** en 2ᵉ rangée sous la qté (`col-span-2`, une seule ligne). L’unité dans **« Soit … »** est l’**UdV du conditionnement** (`product_packaging.ref_sales_unit`, ex. Kg), ou **« unité » / « unités »** lorsque l’UdV du colis est **Unité** (ex. « Soit 15 unités » pour 1 colis de 15 pièces). Les **puces** : seul le **mode sélectionné** est plein (vert, bord clair, ombre, texte gras) ; les autres restent en contour, avec la qté déjà saisie dans une **pastille blanche** (chiffre noir) sur les modes non actifs.

**Commande validée ou intégrée** : bouton **Exporter en image** (même format que le récap validation lot, un PNG par vendeur) — voir `saisie/[id]/recap/README.md`. L’affichage liste de la page n’est pas modifié.

### Internationalisation UI (saisie / parcours / listes)

Les écrans suivants utilisent `next-intl` (sans texte FR codé en dur dans les composants) :

- `/commandes-fournisseur/saisie/nouvelle`
- `/commandes-fournisseur/saisie/[id]/parcours`
- `/commandes-fournisseur/validation`
- `/commandes-fournisseur/achat`

Namespaces utilisés : `backoffice.commandes.saisie.nouvelle`, `backoffice.commandes.saisie.magasinStrip`, `backoffice.commandes.parcours`, `backoffice.commandes.validation.index`, `backoffice.commandes.achat.list`, `backoffice.commandes.components.ligneCommentaireSaisieControls`, `backoffice.commandes.quantityPanel`, `backoffice.commandes.common`, `backoffice.commandes.errors`, `common`.

Conventions appliquées comme sur les autres écrans :

- `useBackChevronIcon()` pour les boutons retour.
- `useAppFormat()` pour les dates/nombres affichés.
- séparateurs de commentaires magasin via clé de traduction (`storeCommentSeparator`) dans les composants d’affichage.

### Plusieurs conditionnements pour un même produit

Une commande peut contenir **plusieurs lignes** pour le même `product_id` si les `product_packaging_id` diffèrent (ou une ligne à l’unité et une ou plusieurs lignes en colis).

- **Récap** : « Ajouter un produit » ne bloque plus tout le produit ; le dialogue **préremplit** les quantités déjà en commande pour chaque conditionnement et permet de les **modifier** (bouton « Enregistrer » si le produit est déjà présent).
- **Parcours** : chaque conditionnement (et l’unité) garde sa quantité ; changer de bouton ne réinitialise pas les autres ; à l’enregistrement, toutes les clés avec qté &gt; 0 sont envoyées.
- **API** `PUT …/commandes/[id]/lignes` : rejet 400 si deux lignes actives partagent le même couple produit / conditionnement.

### Création de lot (consolidation)

Sur `/commandes-fournisseur/validation`, le bouton **Constituer un lot** applique :

- **Même fournisseur** : refus côté client (message d’erreur) et côté serveur (`createValidationLot` — « Toutes les commandes doivent être du même fournisseur »). Dès qu’une commande est cochée, les autres fournisseurs sont **grisés** (cases désactivées) avec un rappel « Sélection limitée au fournisseur … ».
- **Un seul magasin** : dialogue de confirmation avant création (le lot ne regroupera qu’un magasin).

La liste des lots sur la même page est scindée en **Lots en saisie** (`brouillon`), **Lots en cours** (`prevalidation`, `prete`, `achat_en_cours`) et **Lots terminés** (`terminee`). La section **Lots en cours** propose des filtres par **fournisseur** et par **statut**. La section **Lots terminés** propose les mêmes filtres, affiche **10 lots** à la fois, avec un bouton **Afficher 10 de plus** pour la pagination côté client.

À la création, chaque ligne de commande est agrégée par **(produit, conditionnement)** via la fonction SQL `upsert_commande_fournisseur_lot_ligne` (migrations `20260626120000` + correctif `20260626130000_lot_ligne_upsert_rpc_on_conflict.sql`). Les quantités par magasin (`commande_fournisseur_lot_ligne_magasin.qte`) sont copiées depuis `commande_fournisseur_ligne.qte` des commandes incluses, en retrouvant la ligne lot avec la **même clé unique** (produit + conditionnement + vendeur) que l’insertion. Un lot déjà créé sans répartition magasin est recalé au chargement tant qu’il est en `brouillon` ou `prevalidation`. **Exécuter le correctif dans Supabase SQL Editor** si la constitution de lot échoue encore sur l’index unique.

Ajout manuel au lot (brouillon / validation) : refus si le **même conditionnement** est déjà présent. En **achat**, un dialogue propose d'**ajouter quand même** pour affecter le produit à **un autre vendeur** (unicité par vendeur, migration `20260903180000`).

### Conditionnements et fournisseur de la commande

Pour une commande du fournisseur **F**, les colis affichés (parcours, récap, recherche produit) sont **uniquement** :

- les colis dont le **conditionnement réf.** (`ref_conditionnement.supplier_id`) ou une liaison **`product_packaging_supplier`** cible **F** ;
- plus la saisie **à l’unité** (UdC) si le produit l’autorise (`allow_unit_in_commande`) ;
- les colis **archivés** sur la fiche produit (`archived_at` renseigné) sont **exclus** (filtre `filterActivePackaging` ; le select API inclut `archived_at`).

Le **parcours** et la **recherche produit** incluent aussi les produits liés via **`product_supplier`** (fournisseurs secondaires). Migration `20260702160000_product_supplier.sql`.

### Fournisseur Emballages et Consommables

Fournisseur seed `ref_supplier.code = emballages_consommables` (`commande_active = true`, migration `20260728250000_emballages_commandes_fournisseur.sql`).

- Articles gérés dans `/emballages` ; chaque `ref_emballage` a un **produit miroir** synchronisé (`allow_unit_in_commande = true`, pas de colis obligatoire).
- Parcours, validation, achat et comptes vendeur : **même flux** que les autres fournisseurs (pattern Marché — vendeurs en Paramètres).
- Pré-sélection du fournisseur : `/commandes-fournisseur/saisie/nouvelle?supplier=emballages_consommables` (lien **Commander** depuis le catalogue emballages).

### Commentaire par ligne (`line_comment`)

- Champ **`commande_fournisseur_ligne.line_comment`** (texte libre).
- En saisie (récap) : pastille à droite sous les quantités + icône commentaire → dialogue (Enregistrer / Supprimer) → `PUT …/commandes/[id]/lignes` (`lineComment`).
- **Consolidation** (matrice magasins) : bouton commentaire **sur chaque colonne magasin** du lot (même cellule vide) ; la ligne commande est créée à l’enregistrement du commentaire si besoin (`commandeId` + `productId`). **Achat** : bouton selon lignes existantes. Sauvegarde `PATCH …/commentaire-ligne` (`ligneId` ou `commandeId` + `productId`). RLS : `20260622120000_commande_ligne_comment_lot.sql`, insert sync `20260623120000_commande_ligne_lot_magasin_sync.sql`.

## Vendeur produit → achat

Si **`product.vendeur_id`** est renseigné (fiche produit) et que le marchand appartient au **fournisseur du lot** :

- À la **création du lot** (consolidation) et à l’**ajout d’un produit** (validation / achat), la ligne lot reçoit ce `vendeur_id` — **même si le fournisseur principal** (`product.supplier_id`) **est un autre** (produit commandable via `product_supplier`, ex. Marché en fournisseur secondaire).
- Au passage **brouillon → prêt**, les lignes encore sans vendeur sont complétées depuis le produit.
- En **achat**, le produit apparaît directement dans le tableau du vendeur (repli UI sur `product.vendeur_id` si la ligne n’a pas encore été persistée).
- Si l’on **attribue / change le vendeur** d’une ligne en achat (`PATCH` `ligneUpdates[].vendeur_id`), `product.vendeur_id` est mis à jour avec ce vendeur (dernier vendeur connu ; ne se vide pas si on retire le vendeur de la ligne).
- Backfill one-shot : migration `20260728220000_backfill_product_vendeur_from_latest_lot.sql` — pour chaque fournisseur, propage les `vendeur_id` des lignes du **lot le plus récent** vers `product.vendeur_id`.

## Quantités (saisie, validation, achat)

Les quantités stockées en base sont en **`numeric(14,2)`** (au plus **2 décimales** côté UI) pour les lignes de commande, la répartition par magasin sur un lot, et les champs `qte_achat` / `qte_besoin_fige` des lignes de lot. Voir la migration `supabase/migrations/20260530143000_commande_quantites_decimal.sql`.

## Achat (lots prêts → clôture)

- **Liste** : `/commandes-fournisseur/achat` — appelle `GET /api/commandes-fournisseur/achat/lots` (filtre **À traiter** = prêts + achat en cours, ou **Terminés**). Filtre **fournisseur**, nom fournisseur en **gras coloré** (palette partagée `supplier-color.ts`), dates **Créée :** / **Livraison :** ; pour les lots terminés, date de clôture en suffixe.
- **Détail lot** : `/commandes-fournisseur/achat/lots/[id]` — tableau « sans vendeur » **uniquement s’il y a des lignes** (sélection + attribution groupe ; vendeurs **clôturés et payés** exclus de la liste ; vendeur **clôturé non payé** : affectation autorisée avec **réouverture automatique** ; **suppression ligne** uniquement dans le tableau « sans vendeur » (colonne dédiée, dialogue de confirmation, `PATCH` `removeLotLigneId`), sinon masqué (boutons Ajouter / Nouveau vendeur conservés en édition) ; puis **un tableau par vendeur** ; totaux par vendeur (DH), frais généraux (tableau lecture + dialogue isolé `AchatFraisDialog` ; **PATCH à la validation** / suppression, liste serveur remplacée sans fusion locale pour éviter les doublons). **Sauvegarde automatique** (debounce) des **lignes produit** (`lignesOnly`) : PU + montant lus aussi depuis les saisies locales **avant blur** ; **flush à la sortie** (`pagehide` / onglet caché / démontage) ; **préservation des brouillons dirty** lors d’un reload (ex. ajout produit); **erreurs** affichées en **dialogue modal** (clôture, sauvegarde, etc.). **Clôture par vendeur** (voir ci-dessous) puis clôture **lot** globale (`status: "terminee"`) quand tous les vendeurs concernés sont déjà clôturés — dialogue **Clôturer quand même (qté → 0)** si quantités manquantes (vendeur ou lot entier). À la clôture lot, produits fournisseur actifs+vitrine non commandés → file **Actualisation produit** (désactivation) ; si `409` + `VENDEURS_OUVERTS`, message listant les vendeurs encore ouverts ; Lot **terminé** : boutons **Modifier** (`PATCH` `{ status: "prete" }`, montants conservés) et **Imprimer le rapport PDF** (`GET …/achat/lots/[id]/pdf`, A4). Le PDF est aussi disponible tant que le lot est prêt. Pas d’affichage des commentaires magasin (MXX) en achat. Noms produit : français (+ arabe si UI arabe).
- **Clôture partielle par vendeur** (migration `20260728190000_lot_vendeur_achat.sql`) :
  - Tables `commande_fournisseur_lot_vendeur_achat` (status `ouvert`|`cloture`, commentaire) et `commande_fournisseur_lot_vendeur_photo` ; bucket Storage `achat-vendeur-photos`.
  - API : `POST …/vendeurs/[vendeurKey]` `{ action: "cloturer"|"rouvrir" }` ; `PATCH` `{ commentaire }` ; `GET/POST/DELETE …/photos`.
  - Clôture vendeur : validations quantité / PU ; qté **0** = pas acheté (sans confirmation) ; si quantité **non saisie**, dialogue avec option **Clôturer quand même (qté → 0)** ; maj `product.cost_purchase` (lignes > 0) ; file **Actualisation produit** — **prix** si prix actuel ≠ proposé, sinon **à activer** si inactif (`/produits/actualisation`) ; upsert `fournisseur_compte_achat` **sans les lignes à qté 0** — **le lot reste éditable** (frais et autres vendeurs). Zone UI verte + lignes verrouillées ; « Rouvrir » si l’achat n’est pas payé.
  - Commentaire / photos : icônes en en-tête de bloc (`AchatVendeurCommentDialog`, `AchatVendeurPhotosDialog` — caméra + galerie). Icône photos en **vert** seulement s’il existe au moins une photo **hors** image commande WhatsApp. À la clôture sans photo métier : dialogue « Retour » / « Clôturer quand même ».
  - `GET` lot renvoie `vendeursAchat` : `{ status, commentaire, photos[], comptePaye, comptePayeLe }` par `vendeur_key` (uuid ou `__supplier_sole__`). En UI, sous le total vendeur : **Payé le …** si `comptePaye`.
- **API PDF** : `GET /api/commandes-fournisseur/achat/lots/[id]/pdf` — permission `commandes_fournisseur.achat` ; données via `achat-lot-report-data.ts`, rendu pdfkit `achat-lot-report-pdf.ts` (sections vendeurs, frais, totaux).
- **Réouverture** : RLS `cflot update achat reopen` (`20260727130000_achat_lot_reopen.sql`) — `terminee` → `prete` avec permission achat.
- **Fournisseur sans marchands** (ex. **Station**, aucun `ref_supplier_vendeur`) : le fournisseur est le **vendeur unique** — saisie qté/prix directement sur les lignes même sans `vendeur_id` ; pas d’écran d’attribution ; clôture vendeur via clé `__supplier_sole__` ; la clôture lot **n’exige pas** de vendeur sur chaque ligne.
- **Colonnes détail achat** : **UdC**, **Qté Acheté**, **UdA**, **Prix achat**, **Total** (saisie via `AchatLignePricingFields` : état local pendant la frappe ; **pending ref** + autosave pendant la frappe, commit React + calcul croisé **au blur** ; flush démontage / `pagehide`). **Qté vide** (`null`) = pas encore saisie ; **Qté 0** = pas acheté (affiche « 0 », PU/total à 0, clôture sans confirmation ; **exclu du compte fournisseur**). Au passage **prêt**, `qte_achat` / PU / montant sont remis à `null`. Pas d’affichage des commentaires magasin (MXX) en achat. Les noms arabes produit ne s’affichent que si l’UI est en arabe.
- **UdA produit** : si `purchase_unit_id` est vide, backfill SQL (`20260727120000_backfill_product_purchase_unit.sql`) — **Kg** quand l’UdV est Kg, **Pièce** quand l’UdV est Unité / Unité(s).
- **Vendeurs fournisseur** :
  - `GET/POST /api/commandes-fournisseur/achat/suppliers/[supplierId]/vendeurs` (liste / création avec `label`, `phone`, `preferred_locale`, `devise_achat`, permission achat).
  - `PATCH /api/commandes-fournisseur/achat/suppliers/[supplierId]/vendeurs/[vendeurId]` : modification complète réservée à **`commandes_fournisseur.vendeurs_renommer`**.
  - **Devise achat** (`dirham` | `rial`) : en Rial, saisie PU/total en Rial avec « Soit XX DH » (1 DH = 20 Rial) ; persistance `prix_achat_unitaire` / `montant_ligne_achat` **toujours en DH** ; total vendeur affiché en Rial + équivalent DH.

Sur **détail lot achat**, « Nouveau vendeur » ouvre un **FormDialog** (libellé, téléphone, langue, devise) comme en Paramètres. La modification d’un vendeur existant se fait dans **Paramètres → Vendeurs**.

## Script Excel — vendeur par produit

Le fichier `Unité de commande.xlsx` (blocs par vendeur marché) alimente aussi `product.vendeur_id` :

```bash
npx tsx scripts/apply-vendeur-from-excel.ts "chemin/Unité de commande.xlsx"
```

Le parseur (`scripts/parse-order-units-excel.py`) lit le nom vendeur en en-tête de chaque bloc (ligne « Français ») et associe chaque code produit au vendeur `ref_supplier_vendeur` du fournisseur **Marché** (correspondance par libellé).

### Internationalisation UI (achat détail)


## Impression ticket caisse WinDev

Ne pas utiliser le PDF en caisse. Formats recommandés :

```
GET /api/caisse/commande-ticket?magasin={code}&token=…&format=txt
GET /api/caisse/commande-ticket?magasin={code}&token=…&format=json
```

- **txt** : texte brut → impression directe imprimante ticket  
- **json** : données → état d’impression WinDev natif  

Doc : [`/api/caisse/README.md`](../api/caisse/README.md).

## Statuts (chips)

Les libellés de statut commande / lot s’affichent via `CommandeFournisseurStatusChip` (`src/components/commandes-fournisseur/CommandeFournisseurStatusChip.tsx`) :

- **Commande** : en saisie (warning), validée (info), intégrée (primary), annulée (error)
- **Lot** : brouillon (warning), prévalidation (info), prêt (success), achat en cours (info), terminé (primary)

Les listes **saisie** (commandes), **validation** (lots) et **achat** (lots) partagent le même design de ligne : `ListItemButton` bordé, fournisseur à gauche, **chip statut** à droite, date (et infos secondaires) en dessous.

## Notifications (validation magasin)

Lorsqu'une commande passe au statut **`validee`** (validation depuis le récap saisie magasin, `PATCH /api/commandes-fournisseur/commandes/[id]`), une notification est créée pour les utilisateurs ayant la permission **`commandes_fournisseur.consolidation`** et le type activé dans leurs préférences.

- **Contenu** : magasin + fournisseur
- **Lien** : `/commandes-fournisseur/validation`
- **Documentation** : [`/notifications/README.md`](../notifications/README.md)

## Script admin — purge commandes / lots / achats

`scripts/purge-commandes-fournisseur.ts` (service role) : dry-run par défaut, `--execute` pour appliquer.

Conserve des commandes ciblées (préfixes `created_at` UTC dans le script) et **leurs lots liés** (`lot_id` / inclusions). Supprime les autres commandes (CASCADE lignes) et les autres lots (CASCADE lignes d’achat, frais, commentaires vendeur, inclusions).

## Comptes fournisseurs (`/commandes-fournisseur/comptes`)

Permission **`commandes_fournisseur.comptes`**. Accès depuis le **menu principal** (accueil backoffice), pas depuis le hub Commandes fournisseur.

### Comptes

| Entité | Compte | Route détail |
|---|---|---|
| **Vendeur Marché** | 1 compte par vendeur | `/comptes/v/[vendeurId]` |
| **Station** (sans vendeurs) | 1 compte par fournisseur | `/comptes/s/[supplierId]` |

Le fournisseur Marché parent **n’a pas** de compte : seuls ses vendeurs apparaissent dans la liste.

### Génération des achats comptables

À la **clôture d’un vendeur** (`POST …/vendeurs/[vendeurKey]` action `cloturer`), un **`fournisseur_compte_achat`** est upserté pour ce vendeur (ou Station) — **uniquement les lignes avec qté > 0** (`computeLotCompteBreakdown`). **`date_cloture`** reprend la **date de livraison du lot** (`commande_fournisseur_lot.date_livraison`, midi), pas l’horodatage d’enregistrement. À la **clôture globale du lot** (`PATCH` → `status: terminee`), tous les vendeurs concernés doivent déjà être clôturés ; un sync idempotent recalcule éventuellement les montants restants.

| Type | Achats générés |
|---|---|
| **Station** | 1 achat = **produits uniquement** (frais exclus des comptes) |
| **Marché** | 1 achat par vendeur = **produits de ce vendeur** |

Les **frais généraux** ne sont **pas** gérés dans les comptes pour l’instant.

### Détail d’un achat

`/commandes-fournisseur/comptes/achats/[achatId]` — montant, lignes produits (**Produit**, **Qté**, **UdA**, **Prix à l’unité**, **Montant**), **commentaire** et **photos** (édition depuis la page : crayon / « Gérer les photos » ; photo commande WhatsApp non supprimable). Lien vers le lot achat (pas de PDF depuis cette page).  
API : `GET/PATCH …/comptes/achats/[achatId]`, `POST/DELETE …/photos`. RLS : `20260728210000_…` (lecture) + `20260728211000_compte_achat_vendeur_media_write.sql` (écriture).

### Paiements

- Un paiement est rattaché au **compte vendeur** (`vendeur_id`) ou **compte station** (`supplier_id`, `vendeur_id` null).
- Sélection de plusieurs achats **impayés** (orange) du même compte → mode de paiement, date, commentaire.
- Achats payés en **vert** ; totaux : total, payé, reste à payer.
- **Photos justificatives** (reçu, virement…) : ajoutables à la création du paiement ou ensuite via « Photos » dans l’historique. Stockage bucket `paiement-photos`, table `fournisseur_paiement_photo`. API : `GET/POST/DELETE /api/commandes-fournisseur/comptes/paiements/[paiementId]/photos`.
- **Récapitulatif image** : PNG généré à la volée (`html-to-image`) avec compte, montant, mode, achats réglés. API : `GET /api/commandes-fournisseur/comptes/paiements/[paiementId]/recap`. Boutons « Télécharger récap » et « Envoyer WhatsApp » (télécharge l’image puis ouvre `wa.me` du vendeur — numéro `ref_supplier_vendeur.phone`). À la création : « Enregistrer & Envoyer » si le vendeur a un numéro WhatsApp configuré.

### Réouverture lot

Autorisée même si un ou plusieurs vendeurs ont un achat comptable **déjà payé** : le lot repasse en `achat_en_cours` ; seuls les comptes **impayés** sont supprimés (les payés restent en comptabilité). Les vendeurs clôturés et payés restent verrouillés en UI.

### Backfill / recalcul

`POST /api/commandes-fournisseur/comptes/backfill` — recalcule tous les lots `terminee` (produits seuls) ; `date_cloture` = date de livraison du lot.

Migrations : `20260728120000_fournisseur_comptes.sql`, `20260728140000_comptes_par_vendeur.sql`, `20260901140000_compte_achat_date_livraison.sql`.

