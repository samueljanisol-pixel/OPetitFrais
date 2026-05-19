# Paramètres (référentiels)

## Vendeurs

Les **vendeurs** (`ref_supplier_vendeur`) sont rattachés à un **fournisseur**. Ils servent à la fois :

- à la configuration des **conditionnements produit** (cases « Vendeurs » dans les paramètres du colis) ;
- à l’**achat** (attribution des lignes de lot, frais, renommage selon les droits).

Un même libellé peut exister chez plusieurs fournisseurs (enregistrements distincts).

Migration : `20260619120000_unify_marchand_vendeur.sql` (fusion de l’ancien `ref_marchand`).
