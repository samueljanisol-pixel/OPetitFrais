# Récap commande (`saisie/[id]/recap`)

## Affichage

- **En-tête liste** : nombre de lignes produit (`backoffice.status.productCount`, ex. « 12 produits ») au-dessus des en-têtes de catégorie.
- **En saisie** : liste mobile par catégorie avec saisie quantité (±, commentaire).
- **Validée ou intégrée** : tableau **Produit | Quantité | UdV / cond.** (aligné sur l’export image), regroupé par catégorie.

## Export image (commande validée ou intégrée)

Lorsque le statut n’est plus **en saisie** (`validee`, `integree`), un bloc **Export image** apparaît au-dessus de la liste :

- Un bouton **Exporter en image** : en-tête **nom du magasin** + **Commande Fournisseur : {fournisseur}**, date puis **par {utilisateur}** (créateur de la commande), **un seul tableau** avec tous les produits (pas de découpage par vendeur marché), colonnes produit / **Quantité** / UdV/cond.
- Les libellés **conditionnement** et **unité de vente** dans l’image suivent la locale UI (arabe si `ar-MA` et `label_ar` renseigné).
- Le tableau d’export est **hors écran** ; la page affiche le même format colonnes en lecture seule.
- L’image inclut le **nombre de lignes produit** (ex. « 12 produits ») au-dessus du tableau, comme sur la page.
- Partage natif mobile ou téléchargement (`html2canvas`, `export-element-png.ts`).

Données : GET `/api/commandes-fournisseur/commandes/[id]` (`validated_at` pour la date du fichier).
