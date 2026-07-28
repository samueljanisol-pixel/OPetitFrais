-- Backfill product.vendeur_id depuis le dernier lot de chaque fournisseur :
-- pour chaque produit présent sur ce lot avec un vendeur_id de ligne,
-- enregistre ce vendeur sur la fiche produit (s’il appartient au même fournisseur).

with latest_lot as (
  select distinct on (l.supplier_id)
    l.id as lot_id,
    l.supplier_id
  from public.commande_fournisseur_lot l
  order by l.supplier_id, l.updated_at desc, l.created_at desc, l.id desc
),
line_vendeurs as (
  select distinct on (ll.product_id)
    ll.product_id,
    ll.vendeur_id,
    lot.supplier_id
  from public.commande_fournisseur_lot_ligne ll
  inner join latest_lot lot on lot.lot_id = ll.lot_id
  inner join public.ref_supplier_vendeur v
    on v.id = ll.vendeur_id
   and v.supplier_id = lot.supplier_id
  where ll.vendeur_id is not null
  order by ll.product_id, ll.id
)
update public.product p
set vendeur_id = lv.vendeur_id
from line_vendeurs lv
where p.id = lv.product_id
  and p.supplier_id = lv.supplier_id
  and p.vendeur_id is distinct from lv.vendeur_id;
