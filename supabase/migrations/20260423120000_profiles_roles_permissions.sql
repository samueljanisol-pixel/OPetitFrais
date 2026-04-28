-- Rôles dynamiques, permissions, profils (1:1 avec auth.users pour accès données navigateur + RLS)

create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  description text,
  module text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  is_system boolean not null default false,
  is_full_access boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists roles_one_full_access
  on public.roles (is_full_access)
  where is_full_access = true;

create table if not exists public.role_permissions (
  role_id uuid not null references public.roles (id) on delete cascade,
  permission_id uuid not null references public.permissions (id) on delete cascade,
  primary key (role_id, permission_id)
);

create index if not exists idx_role_permissions_permission on public.role_permissions (permission_id);

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  login text,
  prenom text not null default '',
  nom text not null default '',
  role_id uuid not null references public.roles (id),
  store_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_login_len check (login is null or length(trim(login)) >= 2)
);

create unique index if not exists profiles_login_lower_unique
  on public.profiles (lower(login))
  where login is not null;

create or replace function public.profiles_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated on public.profiles;
create trigger trg_profiles_updated
  before update on public.profiles
  for each row
  execute function public.profiles_set_updated_at();

create or replace function public.profiles_block_self_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'update'
     and new.user_id = auth.uid()
     and new.role_id is distinct from old.role_id then
    raise exception 'Modification de rôle réservée à un administrateur';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_block_self_role on public.profiles;
create trigger trg_profiles_block_self_role
  before update on public.profiles
  for each row
  execute function public.profiles_block_self_role_change();

create or replace function public.roles_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_roles_updated on public.roles;
create trigger trg_roles_updated
  before update on public.roles
  for each row
  execute function public.roles_set_updated_at();

-- Seed permissions
insert into public.permissions (key, description, module, sort_order) values
  ('produits.read', 'Voir le catalogue produits', 'produits', 10),
  ('produits.write', 'Créer / modifier produits', 'produits', 20),
  ('ventes.read', 'Voir CA et historique', 'ventes', 30),
  ('parametres.read', 'Voir Paramètres (référentiels)', 'parametres', 40),
  ('parametres.write', 'Modifier Paramètres', 'parametres', 50),
  ('admin.utilisateurs', 'Gérer les utilisateurs', 'admin', 60),
  ('admin.roles', 'Gérer les rôles et permissions', 'admin', 70),
  ('sync.run', 'Lancer / voir synchronisations', 'sync', 80)
on conflict (key) do nothing;

-- Seed roles
insert into public.roles (slug, name, description, is_system, is_full_access) values
  ('administrateur', 'Administrateur', 'Accès total à l''application', true, true),
  ('gestionnaire', 'Gestionnaire', 'Exploitation courante', true, false),
  ('acheteur', 'Acheteur', 'Catalogue et paramètres', true, false),
  ('caissier', 'Caissier', 'Consultation catalogue', true, false)
on conflict (slug) do nothing;

-- Default permissions per role (not for full_access admin — bypass in app)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.slug = 'gestionnaire'
  and p.key in (
    'produits.read', 'produits.write', 'ventes.read',
    'parametres.read', 'parametres.write'
  )
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.slug = 'acheteur'
  and p.key in (
    'produits.read', 'produits.write',
    'parametres.read', 'parametres.write'
  )
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.slug = 'caissier'
  and p.key in ('produits.read')
on conflict do nothing;

-- Backfill profiles: tous les auth.users existants → administrateur
insert into public.profiles (user_id, login, prenom, nom, role_id)
select
  u.id,
  null,
  coalesce(u.raw_user_meta_data->>'prenom', ''),
  coalesce(u.raw_user_meta_data->>'nom', ''),
  (select id from public.roles where slug = 'administrateur' limit 1)
from auth.users u
where not exists (select 1 from public.profiles pr where pr.user_id = u.id)
on conflict (user_id) do nothing;

-- RLS
alter table public.permissions enable row level security;
alter table public.roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.profiles enable row level security;

-- Helper: profil lié au JWT courant
create or replace function public.current_profile()
returns public.profiles
language sql
stable
security definer
set search_path = public
as $$
  select * from public.profiles p where p.user_id = auth.uid() limit 1;
$$;

create or replace function public.current_role_has_permission(p_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    join public.roles r on r.id = p.role_id
    where p.user_id = auth.uid()
      and (
        r.is_full_access
        or exists (
          select 1
          from public.role_permissions rp
          join public.permissions perm on perm.id = rp.permission_id
          where rp.role_id = r.id and perm.key = p_key
        )
      )
  );
$$;

-- Liste des clés de permission pour l’utilisateur JWT courant (middleware / UI)
create or replace function public.get_my_permission_keys()
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  keys text[];
  full_acc boolean;
begin
  if auth.uid() is null then
    return '{}';
  end if;
  if not exists (select 1 from public.profiles p where p.user_id = auth.uid()) then
    return (select coalesce(array_agg(key order by key), '{}') from public.permissions);
  end if;
  select r.is_full_access into full_acc
  from public.profiles p
  join public.roles r on r.id = p.role_id
  where p.user_id = auth.uid();
  if full_acc then
    return (select coalesce(array_agg(key order by key), '{}') from public.permissions);
  end if;
  select coalesce(array_agg(perm.key order by perm.key), '{}') into keys
  from public.profiles p
  join public.role_permissions rp on rp.role_id = p.role_id
  join public.permissions perm on perm.id = rp.permission_id
  where p.user_id = auth.uid();
  return coalesce(keys, '{}');
end;
$$;

grant execute on function public.get_my_permission_keys() to authenticated;

drop policy if exists "permissions read authenticated" on public.permissions;
create policy "permissions read authenticated"
  on public.permissions for select
  to authenticated
  using (public.current_role_has_permission('admin.roles'));

drop policy if exists "roles read authenticated" on public.roles;
create policy "roles read authenticated"
  on public.roles for select
  to authenticated
  using (true);

drop policy if exists "roles write admin" on public.roles;
create policy "roles write admin"
  on public.roles for all
  to authenticated
  using (public.current_role_has_permission('admin.roles'))
  with check (public.current_role_has_permission('admin.roles'));

drop policy if exists "role_permissions read authenticated" on public.role_permissions;
create policy "role_permissions read authenticated"
  on public.role_permissions for select
  to authenticated
  using (true);

drop policy if exists "role_permissions write admin" on public.role_permissions;
create policy "role_permissions write admin"
  on public.role_permissions for all
  to authenticated
  using (public.current_role_has_permission('admin.roles'))
  with check (public.current_role_has_permission('admin.roles'));

drop policy if exists "profiles read own" on public.profiles;
create policy "profiles read own"
  on public.profiles for select
  to authenticated
  using (user_id = auth.uid() or public.current_role_has_permission('admin.utilisateurs'));

drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own"
  on public.profiles for update
  to authenticated
  using (user_id = auth.uid() or public.current_role_has_permission('admin.utilisateurs'))
  with check (user_id = auth.uid() or public.current_role_has_permission('admin.utilisateurs'));

drop policy if exists "profiles insert admin" on public.profiles;
create policy "profiles insert admin"
  on public.profiles for insert
  to authenticated
  with check (public.current_role_has_permission('admin.utilisateurs'));

drop policy if exists "profiles delete admin" on public.profiles;
create policy "profiles delete admin"
  on public.profiles for delete
  to authenticated
  using (public.current_role_has_permission('admin.utilisateurs'));

-- Trigger: nouveau compte Auth → profil gestionnaire par défaut si pas de ligne (évite orphelins)
create or replace function public.on_auth_user_created_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rid uuid;
  n_users bigint;
begin
  if exists (select 1 from public.profiles where user_id = new.id) then
    return new;
  end if;
  select count(*) into n_users from auth.users;
  if n_users <= 1 then
    select id into rid from public.roles where slug = 'administrateur' limit 1;
  else
    select id into rid from public.roles where slug = 'gestionnaire' limit 1;
  end if;
  if rid is null then
    select id into rid from public.roles where slug = 'administrateur' limit 1;
  end if;
  insert into public.profiles (user_id, login, prenom, nom, role_id)
  values (
    new.id,
    null,
    coalesce(new.raw_user_meta_data->>'prenom', ''),
    coalesce(new.raw_user_meta_data->>'nom', ''),
    rid
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row
  execute function public.on_auth_user_created_profile();
