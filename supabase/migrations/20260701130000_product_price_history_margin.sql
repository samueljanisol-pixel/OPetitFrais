-- Historique tarifaire : marge et coûts complémentaires pour le calcul de bénéfice.

alter table public.product_price_history
  add column if not exists cost_manufacturing numeric(14,2),
  add column if not exists cost_packaging numeric(14,2),
  add column if not exists margin numeric(14,2);

-- Amorce des lignes existantes depuis l'état actuel du produit.
update public.product_price_history h
set
  cost_manufacturing = p.cost_manufacturing,
  cost_packaging = p.cost_packaging,
  margin = coalesce(
    p.margin,
    p.price - coalesce(p.cost_purchase, 0) - coalesce(p.cost_manufacturing, 0) - coalesce(p.cost_packaging, 0)
  )
from public.product p
where p.id = h.product_id
  and h.margin is null;
