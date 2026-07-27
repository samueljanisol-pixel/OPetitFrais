-- UdA manquante : Kg si UdV = Kg, Pièce si UdV = Unité / Unité(s).

update public.product p
set purchase_unit_id = pu.id
from public.ref_sales_unit su
join public.ref_purchase_unit pu
  on lower(trim(pu.label)) = 'kg'
where p.purchase_unit_id is null
  and p.sales_unit_id = su.id
  and (
    lower(trim(su.code)) = 'kg'
    or lower(trim(su.label)) in ('kg', 'kilogramme', 'kilogrammes')
  );

update public.product p
set purchase_unit_id = pu.id
from public.ref_sales_unit su
join public.ref_purchase_unit pu
  on lower(trim(pu.label)) in ('pièce', 'piece')
where p.purchase_unit_id is null
  and p.sales_unit_id = su.id
  and (
    lower(trim(su.code)) in ('unite', 'unité', 'unites', 'unités')
    or lower(trim(su.label)) ~* '^unit[eé]s?(\s*\(s\))?$'
  );
