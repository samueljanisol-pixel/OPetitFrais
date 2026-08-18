-- Codes catalogue (hors emballages / consommables) : max numérique + 1, sans padding.
-- Les produits miroir emballages gardent la séquence paddée (00000N).

create or replace function public.product_set_code()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  next_n bigint;
  packaging_category_id uuid;
begin
  if new.code is not null and btrim(new.code) <> '' then
    return new;
  end if;

  select id
    into packaging_category_id
  from public.ref_category
  where code = 'emballages_consommables'
  limit 1;

  if packaging_category_id is not null
     and new.category_id is not distinct from packaging_category_id then
    new.code := lpad((nextval('public.product_code_seq'))::text, 6, '0');
    return new;
  end if;

  select coalesce(max(p.code::bigint), 0) + 1
    into next_n
  from public.product p
  where p.code ~ '^[0-9]+$'
    and (
      packaging_category_id is null
      or p.category_id is distinct from packaging_category_id
    );

  new.code := next_n::text;
  return new;
end;
$$;

delete from public.product
where code = '000023'
  and lower(btrim(name)) = 'oeuf';

update public.product
set code = '330'
where code = '000022'
  and name = 'Courge rouge BIO';

update public.product
set code = '331'
where code = '000024'
  and name = 'Mangue Import';

update public.product
set code = '332'
where code = '000025'
  and name = 'JUJUBE';
