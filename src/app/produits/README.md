# Catalogue produits

## Fiche produit (`ProductFormClient`)

- **Fournisseur** puis **Vendeur** (liste filtrée sur le fournisseur du produit, option « Aucun »).
- Le vendeur est enregistré sur `product.vendeur_id` (migration `20260621120000_product_vendeur_id.sql`).
- Changer de fournisseur réinitialise le vendeur s’il n’appartient plus au nouveau fournisseur.

Les vendeurs se créent dans **Paramètres → Vendeurs**. Les liaisons par conditionnement restent dans **Paramètres du conditionnement** (`product_packaging_vendeur`).
