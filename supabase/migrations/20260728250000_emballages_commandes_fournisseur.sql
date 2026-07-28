-- Emballages et consommables : commandes via flux fournisseur (produit miroir).

-- Activer le fournisseur en saisie magasin
update public.ref_supplier
set commande_active = true
where code = 'emballages_consommables';

-- Lien ref_emballage → product miroir
alter table public.ref_emballage
  add column if not exists product_id uuid references public.product (id) on delete set null;

comment on column public.ref_emballage.product_id is
  'Produit catalogue miroir pour commandes fournisseur ; géré par sync automatique.';

create unique index if not exists idx_ref_emballage_product_id
  on public.ref_emballage (product_id)
  where product_id is not null;

-- Catégorie produit dédiée
insert into public.ref_category (code, label, sort_order)
values ('emballages_consommables', 'Emballages et consommables', 95)
on conflict (code) do nothing;

-- Sous-catégories miroir des catégories emballage
insert into public.ref_subcategory (category_id, code, label, sort_order)
select c.id, 'emb_' || ec.code, ec.label, ec.sort_order
from public.ref_category c
cross join public.ref_emballage_categorie ec
where c.code = 'emballages_consommables'
  and not exists (
    select 1
    from public.ref_subcategory sc
    where sc.category_id = c.id
      and sc.label = ec.label
  );

-- Backfill produits miroirs pour articles existants
do $$
declare
  v_supplier_id uuid;
  v_category_id uuid;
  v_sales_unit_id uuid;
  r record;
  v_subcategory_id uuid;
  v_product_id uuid;
  v_code text;
begin
  select id into v_supplier_id
  from public.ref_supplier
  where code = 'emballages_consommables'
  limit 1;

  select id into v_category_id
  from public.ref_category
  where code = 'emballages_consommables'
  limit 1;

  select id into v_sales_unit_id
  from public.ref_sales_unit
  where code = 'unite'
  limit 1;

  if v_supplier_id is null or v_category_id is null or v_sales_unit_id is null then
    raise exception 'Prérequis manquants pour backfill emballages (fournisseur, catégorie ou UdV)';
  end if;

  for r in
    select
      e.id,
      e.label,
      e.reference,
      e.active,
      ec.code as categorie_code,
      ec.label as categorie_label
    from public.ref_emballage e
    join public.ref_emballage_categorie ec on ec.id = e.categorie_id
    where e.product_id is null
  loop
    select sc.id into v_subcategory_id
    from public.ref_subcategory sc
    where sc.category_id = v_category_id
      and sc.label = r.categorie_label
    limit 1;

    v_code := null;
    if r.reference is not null and trim(r.reference) <> '' then
      if not exists (
        select 1 from public.product p where lower(trim(p.code)) = lower(trim(r.reference))
      ) then
        v_code := trim(r.reference);
      end if;
    end if;

    insert into public.product (
      code,
      name,
      price,
      sales_unit_id,
      category_id,
      subcategory_id,
      supplier_id,
      active,
      visible_vitrine,
      allow_unit_in_commande
    )
    values (
      v_code,
      r.label,
      0,
      v_sales_unit_id,
      v_category_id,
      v_subcategory_id,
      v_supplier_id,
      r.active,
      false,
      true
    )
    returning id into v_product_id;

    insert into public.product_supplier (product_id, supplier_id)
    values (v_product_id, v_supplier_id)
    on conflict do nothing;

    update public.ref_emballage
    set product_id = v_product_id
    where id = r.id;
  end loop;
end $$;

update public.permissions
set description = 'Consulter Emballages et Consommables (référentiel et commandes)'
where key = 'emballages.read';

update public.permissions
set description = 'Modifier Emballages et Consommables (référentiel et commandes)'
where key = 'emballages.write';
