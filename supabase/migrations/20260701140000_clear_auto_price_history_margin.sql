-- Supprime les marges auto-calculées (prix − coûts) jamais saisies explicitement.
-- Conserve les marges réellement différentes de la formule (saisie manuelle, import Sheet, marge rétroactive).

update public.product_price_history h
set margin = null
where h.margin is not null
  and abs(
    h.margin - (
      h.price
      - coalesce(h.cost_purchase, 0)
      - coalesce(h.cost_manufacturing, 0)
      - coalesce(h.cost_packaging, 0)
    )
  ) <= 0.005;

update public.product p
set margin = null
where p.margin is not null
  and abs(
    p.margin - (
      p.price
      - coalesce(p.cost_purchase, 0)
      - coalesce(p.cost_manufacturing, 0)
      - coalesce(p.cost_packaging, 0)
    )
  ) <= 0.005;
