# Récap commande (`saisie/[id]/recap`)

## Affichage

- **En saisie** : liste mobile par catégorie avec saisie quantité (±, commentaire).
- **Validée ou intégrée** : tableau **Produit | Quantité | UdV / cond.** (aligné sur l’export image), regroupé par catégorie.

## Export image (commande validée ou intégrée)

Lorsque le statut n’est plus **en saisie** (`validee`, `integree`), un bloc **Export image** apparaît au-dessus de la liste :

- Un bouton **Exporter en image** par vendeur : en-tête **nom du magasin** + **Commande Fournisseur : {fournisseur}**, date puis **par {utilisateur}** (créateur de la commande), tableau produit / **Quantité** / UdV/cond.
- Le tableau d’export est **hors écran** ; la page affiche le même format colonnes en lecture seule.
- Partage natif mobile ou téléchargement (`html2canvas`, `export-element-png.ts`).

Données : GET `/api/commandes-fournisseur/commandes/[id]` (`vendeurs`, `vendeur_id` par ligne, `validated_at` pour la date du fichier).
