-- L’insert côté trigger ne suffit pas toujours (RLS, migrations non appliquées, etc.) :
-- l’app enregistre l’historique via la politique `authenticated` sur `product_price_history`.
-- On retire le trigger pour éviter un doublon quand l’app insère déjà.
drop trigger if exists trg_product_price_history on public.product;
