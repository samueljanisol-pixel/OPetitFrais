-- Remise à zéro de toutes les marges (produits + historique) avant réimport Sheet.
-- NULL = non renseigné (pas une marge métier à 0 DH).

update public.product
set margin = null
where margin is not null;

update public.product_price_history
set margin = null
where margin is not null;
