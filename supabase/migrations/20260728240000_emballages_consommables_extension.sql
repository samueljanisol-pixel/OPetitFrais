-- Extension Emballages et Consommables : catégories, référence, fournisseur, vendeur achat, étiquette produit.

-- Catégories fixes
create table if not exists public.ref_emballage_categorie (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null,
  sort_order int not null default 0
);

comment on table public.ref_emballage_categorie is
  'Catégories fixes du référentiel emballages / consommables (emballages, étiquettes, consommable).';

insert into public.ref_emballage_categorie (code, label, sort_order)
values
  ('emballages', 'Emballages', 10),
  ('etiquettes', 'Étiquettes', 20),
  ('consommable', 'Consommable', 30)
on conflict (code) do nothing;

alter table public.ref_emballage_categorie enable row level security;

drop policy if exists "ref_emballage_categorie select" on public.ref_emballage_categorie;
create policy "ref_emballage_categorie select"
  on public.ref_emballage_categorie for select
  to authenticated
  using (
    public.current_role_has_permission('emballages.read')
    or public.current_role_has_permission('emballages.write')
    or public.current_role_has_permission('produits.read')
    or public.current_role_has_permission('produits.write')
  );

grant select on public.ref_emballage_categorie to authenticated;

-- Colonnes sur ref_emballage
alter table public.ref_emballage
  add column if not exists categorie_id uuid references public.ref_emballage_categorie (id) on delete restrict;

alter table public.ref_emballage
  add column if not exists reference text;

comment on column public.ref_emballage.categorie_id is
  'Catégorie de l''article (emballages, étiquettes, consommable).';
comment on column public.ref_emballage.reference is
  'Référence interne optionnelle (SKU / code article).';

-- Backfill catégorie emballages pour lignes existantes
update public.ref_emballage e
set categorie_id = c.id
from public.ref_emballage_categorie c
where e.categorie_id is null
  and c.code = 'emballages';

alter table public.ref_emballage
  alter column categorie_id set not null;

create index if not exists idx_ref_emballage_categorie_id
  on public.ref_emballage (categorie_id);

create unique index if not exists idx_ref_emballage_reference_categorie_ci
  on public.ref_emballage (categorie_id, lower(trim(reference)))
  where reference is not null and trim(reference) <> '';

-- type_id devient optionnel
alter table public.ref_emballage
  alter column type_id drop not null;

-- Fournisseur dédié
insert into public.ref_supplier (code, label, sort_order, commande_active)
select 'emballages_consommables', 'Emballages et Consommables', 90, false
where not exists (
  select 1 from public.ref_supplier where code = 'emballages_consommables'
);

-- Vendeur sur fiche achat
alter table public.emballage_achat_fiche
  add column if not exists vendeur_id uuid references public.ref_supplier_vendeur (id) on delete set null;

comment on column public.emballage_achat_fiche.vendeur_id is
  'Vendeur du fournisseur Emballages et Consommables (optionnel).';

create index if not exists idx_emballage_achat_fiche_vendeur_id
  on public.emballage_achat_fiche (vendeur_id)
  where vendeur_id is not null;

-- Étiquette sur produit
alter table public.product
  add column if not exists etiquette_id uuid references public.ref_emballage (id) on delete set null;

comment on column public.product.etiquette_id is
  'Étiquette utilisée pour ce produit (catégorie étiquettes) ; null = aucune.';

create index if not exists idx_product_etiquette_id
  on public.product (etiquette_id)
  where etiquette_id is not null;

-- Descriptions permissions
update public.permissions
set description = 'Consulter Emballages et Consommables (référentiel et achats)'
where key = 'emballages.read';

update public.permissions
set description = 'Modifier Emballages et Consommables (référentiel et achats)'
where key = 'emballages.write';
