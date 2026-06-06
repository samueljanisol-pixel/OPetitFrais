-- Journal cuisine Frigo : entrees (production) et sorties (invendus / poubelle).

insert into public.permissions (key, description, module, sort_order) values
  ('cuisine.saisie', 'Saisir entrees et sorties cuisine (jour courant)', 'cuisine', 90),
  ('cuisine.historique', 'Consulter historique et totaux cuisine', 'cuisine', 95)
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.slug = 'gestionnaire'
  and p.key in ('cuisine.saisie', 'cuisine.historique')
on conflict do nothing;

create table if not exists public.cuisine_journal_entry (
  id uuid primary key default gen_random_uuid(),
  journal_date date not null,
  entry_type text not null
    check (entry_type in ('entree', 'sortie')),
  product_id uuid not null references public.product (id) on delete restrict,
  quantity numeric(14, 3) not null
    check (quantity > 0),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_cuisine_journal_date_type_created
  on public.cuisine_journal_entry (journal_date, entry_type, created_at desc);

create index if not exists idx_cuisine_journal_product_date_type
  on public.cuisine_journal_entry (product_id, journal_date, entry_type);

create or replace function public.cuisine_journal_today_date()
returns date
language sql
stable
as $$
  select (timezone('Africa/Casablanca', now()))::date;
$$;

create or replace function public.cuisine_journal_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_cuisine_journal_updated on public.cuisine_journal_entry;
create trigger trg_cuisine_journal_updated
  before update on public.cuisine_journal_entry
  for each row
  execute function public.cuisine_journal_set_updated_at();

alter table public.cuisine_journal_entry enable row level security;

drop policy if exists "cuisine journal select saisie today" on public.cuisine_journal_entry;
create policy "cuisine journal select saisie today"
  on public.cuisine_journal_entry for select to authenticated
  using (
    public.current_role_has_permission('cuisine.historique')
    or (
      public.current_role_has_permission('cuisine.saisie')
      and journal_date = public.cuisine_journal_today_date()
    )
  );

drop policy if exists "cuisine journal insert saisie today" on public.cuisine_journal_entry;
create policy "cuisine journal insert saisie today"
  on public.cuisine_journal_entry for insert to authenticated
  with check (
    public.current_role_has_permission('cuisine.saisie')
    and journal_date = public.cuisine_journal_today_date()
    and entry_type in ('entree', 'sortie')
  );

drop policy if exists "cuisine journal update saisie today" on public.cuisine_journal_entry;
create policy "cuisine journal update saisie today"
  on public.cuisine_journal_entry for update to authenticated
  using (
    public.current_role_has_permission('cuisine.saisie')
    and journal_date = public.cuisine_journal_today_date()
  )
  with check (
    public.current_role_has_permission('cuisine.saisie')
    and journal_date = public.cuisine_journal_today_date()
    and entry_type in ('entree', 'sortie')
    and quantity > 0
  );

drop policy if exists "cuisine journal delete saisie today" on public.cuisine_journal_entry;
create policy "cuisine journal delete saisie today"
  on public.cuisine_journal_entry for delete to authenticated
  using (
    public.current_role_has_permission('cuisine.saisie')
    and journal_date = public.cuisine_journal_today_date()
  );

comment on table public.cuisine_journal_entry is
  'Journal quotidien cuisine (Frigo) : entrees production et sorties invendus/poubelle.';

comment on column public.cuisine_journal_entry.entry_type is
  'entree = ajout au frigo ; sortie = retrait (invendu, poubelle).';