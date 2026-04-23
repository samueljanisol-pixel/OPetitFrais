-- Produits sans ligne d’historique (import, création avant trigger) : amorce avec l’état actuel
insert into public.product_price_history (product_id, valid_from, price, cost_purchase)
select
  p.id,
  p.created_at,
  p.price,
  p.cost_purchase
from public.product p
where not exists (
  select 1
  from public.product_price_history h
  where h.product_id = p.id
);
