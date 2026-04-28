-- Magasins, caisses, liaison profils ; permission admin.magasins (réservée administrateur en app)

insert into public.permissions (key, description, module, sort_order) values
  ('admin.magasins', 'Gérer magasins, caisses et rattachements caissiers', 'admin', 65)
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.slug = 'administrateur'
  and p.key = 'admin.magasins'
on conflict do nothing;

create table if not exists public.magasins (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  nom text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint magasins_code_trim check (length(trim(code)) >= 1),
  constraint magasins_nom_trim check (length(trim(nom)) >= 1)
);

create unique index if not exists magasins_code_lower_unique on public.magasins (lower(trim(code)));

create table if not exists public.caisses (
  id uuid primary key default gen_random_uuid(),
  magasin_id uuid not null references public.magasins (id) on delete cascade,
  code text,
  nom text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint caisses_nom_trim check (length(trim(nom)) >= 1)
);

create index if not exists idx_caisses_magasin_id on public.caisses (magasin_id);

create table if not exists public.profile_magasins (
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  magasin_id uuid not null references public.magasins (id) on delete cascade,
  primary key (user_id, magasin_id)
);

create index if not exists idx_profile_magasins_magasin on public.profile_magasins (magasin_id);

create or replace function public.magasins_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_magasins_updated on public.magasins;
create trigger trg_magasins_updated
  before update on public.magasins
  for each row
  execute function public.magasins_set_updated_at();

drop trigger if exists trg_caisses_updated on public.caisses;
create trigger trg_caisses_updated
  before update on public.caisses
  for each row
  execute function public.magasins_set_updated_at();

-- Migrer profiles.store_code → profile_magasins
insert into public.magasins (code, nom, sort_order)
select distinct trim(p.store_code), trim(p.store_code), 0
from public.profiles p
where p.store_code is not null
  and length(trim(p.store_code)) > 0
  and not exists (
    select 1 from public.magasins m where lower(trim(m.code)) = lower(trim(p.store_code))
  );

insert into public.profile_magasins (user_id, magasin_id)
select p.user_id, m.id
from public.profiles p
join public.magasins m on lower(trim(m.code)) = lower(trim(p.store_code))
where p.store_code is not null
  and length(trim(p.store_code)) > 0
on conflict do nothing;

alter table public.profiles drop column if exists store_code;

alter table public.magasins enable row level security;
alter table public.caisses enable row level security;
alter table public.profile_magasins enable row level security;

drop policy if exists "magasins select" on public.magasins;
create policy "magasins select"
  on public.magasins for select
  to authenticated
  using (
    public.current_role_has_permission('admin.magasins')
    or exists (
      select 1 from public.profile_magasins pm
      where pm.magasin_id = magasins.id
        and pm.user_id = auth.uid()
    )
  );

drop policy if exists "magasins write admin" on public.magasins;
create policy "magasins write admin"
  on public.magasins for all
  to authenticated
  using (public.current_role_has_permission('admin.magasins'))
  with check (public.current_role_has_permission('admin.magasins'));

drop policy if exists "caisses select" on public.caisses;
create policy "caisses select"
  on public.caisses for select
  to authenticated
  using (
    public.current_role_has_permission('admin.magasins')
    or exists (
      select 1 from public.profile_magasins pm
      where pm.magasin_id = caisses.magasin_id
        and pm.user_id = auth.uid()
    )
  );

drop policy if exists "caisses write admin" on public.caisses;
create policy "caisses write admin"
  on public.caisses for all
  to authenticated
  using (public.current_role_has_permission('admin.magasins'))
  with check (public.current_role_has_permission('admin.magasins'));

drop policy if exists "profile_magasins select" on public.profile_magasins;
create policy "profile_magasins select"
  on public.profile_magasins for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.current_role_has_permission('admin.magasins')
  );

drop policy if exists "profile_magasins write admin" on public.profile_magasins;
create policy "profile_magasins write admin"
  on public.profile_magasins for all
  to authenticated
  using (public.current_role_has_permission('admin.magasins'))
  with check (public.current_role_has_permission('admin.magasins'));
