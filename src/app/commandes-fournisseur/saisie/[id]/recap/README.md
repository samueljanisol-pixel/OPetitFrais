# Récap commande (`saisie/[id]/recap`)

## Affichage

- **En-tête liste** : nombre de lignes produit (`backoffice.status.productCount`, ex. « 12 produits ») au-dessus des en-têtes de catégorie.
- **Catégories** : bandeau pleine largeur, texte centré et plus grand (fond vert léger).
- **En saisie** : liste mobile par catégorie avec saisie quantité (±), boutons commentaire et suppression sur la **même ligne** que la qté ; pastille commentaire en dessous si renseignée. **Nom produit** : français seul en locale `fr`, arabe seul en locale `ar-MA` (repli sur le nom FR si `name_ar` absent). **Unité** (UdC ou conditionnement) en petit **sous** le champ quantité ; ligne « Soit … » en dessous si colis.
- **Validée ou intégrée** : tableau **Produit | Quantité | UdV / cond.** (aligné sur l’export image), regroupé par catégorie.

## Export image (commande validée ou intégrée)

Lorsque le statut n’est plus **en saisie** (`validee`, `integree`), un bloc **Export image** apparaît au-dessus de la liste :

- Un bouton **Exporter en image** : en-tête **nom du magasin**, date puis **par {utilisateur}** (créateur de la commande), **un seul tableau** avec tous les produits (pas de découpage par vendeur marché), colonnes produit / **Quantité** / UdV/cond.
- Toute l’image suit la **locale UI** (`fr` / `ar-MA`) : en-têtes, date, « par … », commentaire, RTL si arabe.
- Les libellés **conditionnement** et **unité de vente** dans l’image suivent la locale UI (arabe si `ar-MA` et `label_ar` renseigné).
- **Noms produits** dans l’image : même logique que le récap (un seul nom selon locale, police Arial/Helvetica ou Noto Sans Arabic, `body2` medium).
- Le tableau d’export est **hors écran** ; la page affiche le même format colonnes en lecture seule.
- L’image inclut le **nombre de lignes produit** (ex. « 12 produits ») au-dessus du tableau, comme sur la page.
- Partage natif mobile ou téléchargement (`html-to-image`, `export-element-png.ts`).

Données : GET `/api/commandes-fournisseur/commandes/[id]` (`validated_at` pour la date du fichier).
