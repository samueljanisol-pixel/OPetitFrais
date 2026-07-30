-- Postes caisse enregistrés (identifiant unique par machine, unicité caisse/magasin en prod)

create table if not exists public.caisse_postes (
  id uuid primary key,
  magasin_code text not null,
  caisse_num integer not null check (caisse_num > 0),
  is_test_magasin boolean not null default false,
  hostname text,
  app_version text,
  registered_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint caisse_postes_magasin_code_trim check (length(trim(magasin_code)) >= 1)
);

create index if not exists idx_caisse_postes_magasin on public.caisse_postes (magasin_code);

-- Un seul numéro de caisse par magasin (hors magasin test 0)
create unique index if not exists caisse_postes_magasin_caisse_unique
  on public.caisse_postes (magasin_code, caisse_num)
  where not is_test_magasin;

create or replace function public.caisse_postes_touch_last_seen()
returns trigger
language plpgsql
as $$
begin
  new.last_seen_at := now();
  return new;
end;
$$;

drop trigger if exists trg_caisse_postes_last_seen on public.caisse_postes;
create trigger trg_caisse_postes_last_seen
  before update on public.caisse_postes
  for each row
  execute function public.caisse_postes_touch_last_seen();

alter table public.caisse_postes enable row level security;

-- Accès réservé service role (API caisse token)
drop policy if exists "caisse_postes service role" on public.caisse_postes;
create policy "caisse_postes service role"
  on public.caisse_postes for all
  to service_role
  using (true)
  with check (true);
