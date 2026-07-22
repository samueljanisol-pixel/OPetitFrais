# Parcours produits (saisie commande)

Route : `/commandes-fournisseur/saisie/[id]/parcours`

## Mise en page

- Barre **Précédent / Suivant / Terminer** fixée en bas de l’écran (sous l’en-tête app).
- **Navigation par catégories** : bandeau horizontal de puces (toutes les catégories du parcours) sous l’en-tête ; clic → saut au premier produit de la catégorie ; la catégorie courante est mise en évidence.
- Zone produit (photo, quantités) **défilable** si le contenu dépasse la hauteur disponible.
- Emplacement photo **toujours réservé** (`h-36`, max `6rem`) : sans image, zone vide — le libellé et les quantités ne remontent pas.
- Nom arabe (`name_ar`) : slot réservé sous le titre FR (`ProductArabicSubtitle` + `reserveSpace`) même si vide.
- Ligne **« Soit … »** (conditionnement) : hauteur réservée même absente (à l’unité ou colis sans conversion).
- **Croix rouge** à droite du champ qté (position absolue) si qté &gt; 0 : remise à zéro ; le champ reste **centré** entre les ±.
- **À l’unité** : libellé **UdC** (`ref_order_unit`, repli UdV si absent) **centré sous** la rangée ±, comme le libellé colis en conditionnement.

## Fiche produit

- Bouton **Fiche produit** (visible si permission `produits.read` ou `produits.write`) → `/produits/[productId]?returnTo=…/parcours?productId=…`.
- Sur la fiche : avec `returnTo` + `commandes_fournisseur.saisie`, gestion des **conditionnements** (ajout / paramètres / retrait) même sans `produits.write`.
- Brouillon parcours en **sessionStorage** : quantités et routes de tous les produits + index courant ; fusionné au rechargement (priorité au brouillon sur les lignes non encore enregistrées en base).
- Retour fiche produit : même produit (`?productId=`), quantités des autres produits conservées.
- Après **Terminer**, le brouillon session est effacé.

## Conditionnements affichés

Liste via `GET /api/commandes-fournisseur/parcours-produits` puis `applyCommandeProductPackagingFilter` : colis **non archivés** (`archived_at` null), **achetables** pour le magasin, **liés au fournisseur de la commande** (`ref_conditionnement.supplier_id` ou `product_packaging_supplier`). Sans colis éligible : saisie **à l’unité** (UdC) si `allow_unit_in_commande`.
