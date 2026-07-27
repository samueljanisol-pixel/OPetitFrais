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

### Récapitulatif par vendeur (lot prêt)

Sur `/commandes-fournisseur/validation/lots/[id]`, lorsque le statut est **`prete`** :

1. **Matrice consolidation** en haut (lecture seule) : colonnes magasins en **codes MXX** (ex. M01).
2. **Export consolidation** (sous « Revenir en saisie ») : PNG de toute la commande — **par catégorie** et **par vendeur** (si le fournisseur a des marchands), plus **WhatsApp chauffeur**. Format **A4 paysage** : largeurs au texte, quantités centrées, scale dans un conteneur à **hauteur fixe** (évite le bas coupé), répartition multi-colonnes avec **libellé répété** (catégorie ou vendeur). Images **toujours en arabe**. **Station** : un seul export (par catégorie). Migration `20260725230000_profiles_phone_chauffeur_setting.sql`.
3. **Récap groupé par vendeur** en dessous (`ValidationLotVendeurRecap`) :

- Colonnes magasins en **codes MXX** (ex. M01, M12) — pas le nom du magasin (`magasinCodeMx`).
- Tableau par vendeur : **Produit** (libellé selon locale d’export + **nom arabe** `product.name_ar` si renseigné), quantités par MXX, **Total**, **UdV / cond.** (avec « Soit … » si conditionnement). Si le fournisseur n’a **aucun marchand** (`vendeurs` vide, ex. **Station**), le groupe sans `vendeur_id` est intitulé avec le **nom du fournisseur** (plus « Sans vendeur »).
- **Date de commande** dans l’image exportée et dans le nom du fichier (`validated_at` ou `created_at` des commandes incluses ; plage si plusieurs jours). L’en-tête export **n’affiche plus** la ligne « Commande Fournisseur : … » (nom du vendeur ou magasin suffit).
- **Langue de l’image** : `preferred_locale` du vendeur (`fr` / `ar-MA`). **Fournisseur sans marchands** (Station) : pas de vendeur → l’export est **toujours en arabe** (même si l’UI est en français).
- **Commentaires** : `line_comment` dans la **cellule quantité** du magasin (bas à droite, souvent en arabe, `dir="rtl"`). Optionnel : **commentaire par vendeur** (table `commande_fournisseur_lot_vendeur_comment`, éditable en brouillon et quand le lot est prêt) affiché sous chaque groupe vendeur et en bas de l’image exportée. Police **Noto Sans Arabic** (ligatures) pour l’écran et l’export PNG.
- Bouton **Exporter en image** par vendeur : capture PNG (`html-to-image`, rendu navigateur + polices embarquées) puis **partage natif** (`navigator.share` avec fichier) sur mobile, sinon **téléchargement** du PNG — pour envoi WhatsApp, e-mail, SMS, etc. Nom de fichier du type `commande-2026-05-19-{fournisseur}-{vendeur}.png`. L’ordre des colonnes de l’image suit l’affichage (RTL en arabe) via `dir` / `style.direction` sur le nœud capturé — **pas** `sx.direction` (inversé par `stylis-plugin-rtl`).
- Bouton **Envoyer WhatsApp** (si le vendeur a un **téléphone** renseigné dans Paramètres → Vendeurs) : télécharge l’image en arrière-plan (nom unique horodaté à chaque clic, ex. `commande-2026-05-19-fournisseur-vendeur-1734567890123.png`) et ouvre directement la conversation `wa.me` du vendeur (comme le panier boutique). L’image est pré-capturée dans la langue du vendeur (Station : toujours arabe) ; le commentaire figure dans l’image, pas dans le message WhatsApp. Une **coche verte** apparaît à côté du bouton après le premier clic (enregistré en base par lot et vendeur, visible pour toute l’équipe). Migration `20260725220000_lot_vendeur_whatsapp_sent.sql` — colonne `whatsapp_sent_at` sur `commande_fournisseur_lot_vendeur_comment` ; `PATCH` `{ whatsappSent: { vendeurKey } }`.

Le GET lot validation renvoie aussi `vendeurs` (`ref_supplier_vendeur` du fournisseur), `product.name_ar`, et les dates `created_at` / `validated_at` des commandes incluses.

## Matrice lot — groupement catégorie ou vendeur

Sur le détail lot validation, un **toggle** permet d’afficher la matrice **par catégorie** (défaut) ou **par vendeur** — **uniquement en statut brouillon**.

- **Lot prêt** : matrice **toujours par catégorie** ; vendeurs, commentaires et export en bas (`ValidationLotVendeurRecap`).

- **Par catégorie** : lignes triées comme au récap commande (`ref_category.sort_order`, libellé, nom produit) ; en-tête bandeau vert par famille (ex. Fruit, « Sans catégorie »).
- **Par vendeur** : en-tête par marchand (`vendeur_id` ou nom fournisseur si aucun vendeur) avec **champ commentaire vendeur** (sauvegarde au blur, statuts lot `brouillon` ou `prete`). API : `PATCH` `{ vendeurCommentaire: { vendeurKey, commentaire } }` ; GET renvoie `vendeurCommentaires`.

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

À la création, chaque ligne de commande est agrégée par **(produit, conditionnement)** via la fonction SQL `upsert_commande_fournisseur_lot_ligne` (migrations `20260626120000` + correctif `20260626130000_lot_ligne_upsert_rpc_on_conflict.sql`). **Exécuter le correctif dans Supabase SQL Editor** si la constitution de lot échoue encore sur l’index unique.

Ajout manuel au lot (brouillon / achat) : refus uniquement si le **même conditionnement** est déjà présent.

### Conditionnements et fournisseur de la commande

Pour une commande du fournisseur **F**, les colis affichés (parcours, récap, recherche produit) sont **uniquement** :

- les colis dont le **conditionnement réf.** (`ref_conditionnement.supplier_id`) ou une liaison **`product_packaging_supplier`** cible **F** ;
- plus la saisie **à l’unité** (UdC) si le produit l’autorise (`allow_unit_in_commande`) ;
- les colis **archivés** sur la fiche produit (`archived_at` renseigné) sont **exclus** (filtre `filterActivePackaging` ; le select API inclut `archived_at`).

Le **parcours** et la **recherche produit** incluent aussi les produits liés via **`product_supplier`** (fournisseurs secondaires). Migration `20260702160000_product_supplier.sql`.

### Commentaire par ligne (`line_comment`)

- Champ **`commande_fournisseur_ligne.line_comment`** (texte libre).
- En saisie (récap) : pastille à droite sous les quantités + icône commentaire → dialogue (Enregistrer / Supprimer) → `PUT …/commandes/[id]/lignes` (`lineComment`).
- **Consolidation** (matrice magasins) : bouton commentaire **sur chaque colonne magasin** du lot (même cellule vide) ; la ligne commande est créée à l’enregistrement du commentaire si besoin (`commandeId` + `productId`). **Achat** : bouton selon lignes existantes. Sauvegarde `PATCH …/commentaire-ligne` (`ligneId` ou `commandeId` + `productId`). RLS : `20260622120000_commande_ligne_comment_lot.sql`, insert sync `20260623120000_commande_ligne_lot_magasin_sync.sql`.

## Vendeur produit → achat

Si **`product.vendeur_id`** est renseigné (fiche produit, même fournisseur) :

- À la **création du lot** (consolidation) et à l’**ajout d’un produit** (validation / achat), la ligne lot reçoit ce `vendeur_id`.
- Au passage **brouillon → prêt**, les lignes encore sans vendeur sont complétées depuis le produit.
- En **achat**, le produit apparaît directement dans le tableau du vendeur (repli UI sur `product.vendeur_id` si la ligne n’a pas encore été persistée).

## Quantités (saisie, validation, achat)

Les quantités stockées en base sont en **`numeric(14,2)`** (au plus **2 décimales** côté UI) pour les lignes de commande, la répartition par magasin sur un lot, et les champs `qte_achat` / `qte_besoin_fige` des lignes de lot. Voir la migration `supabase/migrations/20260530143000_commande_quantites_decimal.sql`.

## Achat (lots prêts → clôture)

- **Liste** : `/commandes-fournisseur/achat` — appelle `GET /api/commandes-fournisseur/achat/lots` (filtre préparés ou tous).
- **Détail lot** : `/commandes-fournisseur/achat/lots/[id]` — tableau « sans vendeur » (sélection + attribution groupe), puis **un tableau par vendeur** ; totaux par vendeur (DH), frais généraux (tableau lecture + dialogue isolé `AchatFraisDialog` ; **PATCH à la validation** / suppression, liste serveur remplacée sans fusion locale pour éviter les doublons). **Sauvegarde automatique** (debounce) des **lignes produit** (`lignesOnly`). Clôture avec `status: "terminee"` ; si `409` + `NEED_CONFIRM_ZERO_QTY`, dialogue puis `confirmZeroQtyLines: true`. Lot **terminé** : boutons **Modifier** (`PATCH` `{ status: "prete" }`, montants conservés) et **Imprimer le rapport PDF** (`GET …/achat/lots/[id]/pdf`, A4). Le PDF est aussi disponible tant que le lot est prêt. Pas d’affichage des commentaires magasin (MXX) en achat. Noms produit : français (+ arabe si UI arabe).
- **API PDF** : `GET /api/commandes-fournisseur/achat/lots/[id]/pdf` — permission `commandes_fournisseur.achat` ; données via `achat-lot-report-data.ts`, rendu pdfkit `achat-lot-report-pdf.ts` (sections vendeurs, frais, totaux).
- **Réouverture** : RLS `cflot update achat reopen` (`20260727130000_achat_lot_reopen.sql`) — `terminee` → `prete` avec permission achat.
- **Fournisseur sans marchands** (ex. **Station**, aucun `ref_supplier_vendeur`) : le fournisseur est le **vendeur unique** — saisie qté/prix directement sur les lignes même sans `vendeur_id` ; pas d’écran d’attribution ; la clôture **n’exige pas** de vendeur sur chaque ligne.
- **Colonnes détail achat** : **UdC**, **Qté Acheté**, **UdA**, **Prix achat**, **Total** (saisie via `AchatLignePricingFields` : état local pendant la frappe, commit + calcul croisé **au blur** pour éviter les ralentissements). Pas d’affichage des commentaires magasin (MXX) en achat. Les noms arabes produit ne s’affichent que si l’UI est en arabe.
- **UdA produit** : si `purchase_unit_id` est vide, backfill SQL (`20260727120000_backfill_product_purchase_unit.sql`) — **Kg** quand l’UdV est Kg, **Pièce** quand l’UdV est Unité / Unité(s).
- **Vendeurs fournisseur** :
  - `GET/POST /api/commandes-fournisseur/achat/suppliers/[supplierId]/vendeurs` (liste / création avec `label`, `phone`, `preferred_locale`, `devise_achat`, permission achat).
  - `PATCH /api/commandes-fournisseur/achat/suppliers/[supplierId]/vendeurs/[vendeurId]` : modification complète réservée à **`commandes_fournisseur.vendeurs_renommer`**.
  - **Devise achat** (`dirham` | `rial`) : en Rial, saisie PU/total en Rial avec « Soit XX DH » (1 DH = 20 Rial) ; persistance `prix_achat_unitaire` / `montant_ligne_achat` **toujours en DH** ; total vendeur affiché en Rial + équivalent DH.

Sur **détail lot achat**, « Nouveau vendeur » et le crayon ouvrent un **FormDialog** (libellé, téléphone, langue, devise) comme en Paramètres.

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

## Notifications (validation magasin)

Lorsqu'une commande passe au statut **`validee`** (validation depuis le récap saisie magasin, `PATCH /api/commandes-fournisseur/commandes/[id]`), une notification est créée pour les utilisateurs ayant la permission **`commandes_fournisseur.consolidation`** et le type activé dans leurs préférences.

- **Contenu** : magasin + fournisseur
- **Lien** : `/commandes-fournisseur/validation`
- **Documentation** : [`/notifications/README.md`](../notifications/README.md)

