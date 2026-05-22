# Parcours produits (saisie commande)

Route : `/commandes-fournisseur/saisie/[id]/parcours`

## Fiche produit

- Bouton **Fiche produit** (visible si permission `produits.read` ou `produits.write`) → `/produits/[productId]?returnTo=…/parcours?productId=…`.
- Brouillon parcours en **sessionStorage** : quantités et routes de tous les produits + index courant ; fusionné au rechargement (priorité au brouillon sur les lignes non encore enregistrées en base).
- Retour fiche produit : même produit (`?productId=`), quantités des autres produits conservées.
- Après **Terminer**, le brouillon session est effacé.
