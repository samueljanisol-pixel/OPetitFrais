-- Types d'emballage éditables (référentiel).

create table if not exists public.ref_emballage_type (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.ref_emballage_type is
  'Types de matériaux d''emballage (sachet, barquette, etc.) — référentiel éditable.';

create unique index if not exists idx_ref_emballage_type_label_ci
  on public.ref_emballage_type (lower(trim(label)));

drop trigger if exists trg_ref_emballage_type_updated on public.ref_emballage_type;
create trigger trg_ref_emballage_type_updated
  before update on public.ref_emballage_type
  for each row execute function public.set_updated_at();

alter table public.ref_emballage_type enable row level security;

drop policy if exists "ref_emballage_type select" on public.ref_emballage_type;
create policy "ref_emballage_type select"
  on public.ref_emballage_type for select
  to authenticated
  using (
    public.current_role_has_permission('emballages.read')
    or public.current_role_has_permission('emballages.write')
    or public.current_role_has_permission('produits.read')
    or public.current_role_has_permission('produits.write')
  );

drop policy if exists "ref_emballage_type write" on public.ref_emballage_type;
create policy "ref_emballage_type write"
  on public.ref_emballage_type for all
  to authenticated
  using (public.current_role_has_permission('emballages.write'))
  with check (public.current_role_has_permission('emballages.write'));

grant select, insert, update, delete on public.ref_emballage_type to authenticated;

insert into public.ref_emballage_type (label, sort_order)
select v.label, v.sort_order
from (values
  ('Sachet', 10),
  ('Barquette', 20),
  ('Bouteille', 30),
  ('Sac de vente', 40)
) as v(label, sort_order)
where not exists (select 1 from public.ref_emballage_type limit 1);

alter table public.ref_emballage
  add column if not exists type_id uuid references public.ref_emballage_type (id) on delete restrict;

-- Remplissage depuis l'ancienne colonne texte `type`.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ref_emballage'
      and column_name = 'type'
  ) then
    update public.ref_emballage e
    set type_id = t.id
    from public.ref_emballage_type t
    where e.type_id is null
      and (
        (e.type = 'sachet' and lower(trim(t.label)) = lower('Sachet'))
        or (e.type = 'barquette' and lower(trim(t.label)) = lower('Barquette'))
        or (e.type = 'bouteille' and lower(trim(t.label)) = lower('Bouteille'))
        or (e.type = 'sac_vente' and lower(trim(t.label)) = lower('Sac de vente'))
      );

    update public.ref_emballage
    set type_id = (select id from public.ref_emballage_type order by sort_order limit 1)
    where type_id is null;

    alter table public.ref_emballage drop constraint if exists ref_emballage_type_check;
    alter table public.ref_emballage drop column type;
  end if;
end $$;

alter table public.ref_emballage
  alter column type_id set not null;

create index if not exists idx_ref_emballage_type_id
  on public.ref_emballage (type_id);
