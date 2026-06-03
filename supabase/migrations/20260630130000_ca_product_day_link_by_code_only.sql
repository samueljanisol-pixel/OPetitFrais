-- Lien ventes ↔ catalogue : uniquement par product.code (pas par nom)

comment on column public.ca_product_day.product_id is
  'Produit catalogue ; rapprochement par code produit (JSON caisse ou article = code).';

-- Réaligner les liaisons existantes (supprime les matchs par nom)
update public.ca_product_day
set product_id = null;

update public.ca_product_day cpd
set product_id = p.id
from public.product p
where lower(trim(p.code)) = lower(trim(cpd.article))
   or (
     regexp_replace(trim(cpd.article), '[^0-9]', '', 'g') ~ '^\d+$'
     and p.code = lpad(regexp_replace(trim(cpd.article), '[^0-9]', '', 'g'), 6, '0')
   );
