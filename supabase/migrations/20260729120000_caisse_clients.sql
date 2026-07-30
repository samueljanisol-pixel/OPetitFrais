-- Clients caisse magasin (réseau commun, tous magasins)

create table if not exists public.caisse_client (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  telephone text,
  email text,
  notes text,
  actif boolean not null default true,
  sort_order int not null default 0,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint caisse_client_nom_trim check (length(trim(nom)) >= 1)
);

create index if not exists idx_caisse_client_actif_sort
  on public.caisse_client (actif, sort_order, nom);

create or replace function public.caisse_client_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_caisse_client_updated on public.caisse_client;
create trigger trg_caisse_client_updated
  before update on public.caisse_client
  for each row
  execute function public.caisse_client_set_updated_at();

-- Client système livraison (WinDev : « 1 - LIVRAISON »)
insert into public.caisse_client (nom, sort_order, is_system, actif)
select '1 - LIVRAISON', 0, true, true
where not exists (
  select 1 from public.caisse_client c where c.is_system = true and c.nom = '1 - LIVRAISON'
);

alter table public.caisse_client enable row level security;

-- Lecture : utilisateurs authentifiés (backoffice futur)
drop policy if exists "caisse_client select authenticated" on public.caisse_client;
create policy "caisse_client select authenticated"
  on public.caisse_client for select
  to authenticated
  using (true);

-- Écriture : réservée service role via API caisse (pas de policy write authenticated pour l'instant)
