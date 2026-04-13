-- Tables minimales pour stocker le CA et les produits
-- À exécuter dans Supabase (SQL Editor).

create table if not exists public.ca_day (
  date date not null,
  magasin text not null,
  total numeric not null default 0,
  inserted_at timestamptz not null default now(),
  primary key (date, magasin)
);

create table if not exists public.ca_month (
  ym text not null, -- "YYYY-MM"
  magasin text not null,
  total numeric not null default 0,
  inserted_at timestamptz not null default now(),
  primary key (ym, magasin)
);

create table if not exists public.ca_product_day (
  date date not null,
  article text not null,
  qty numeric not null default 0,
  total numeric not null default 0,
  inserted_at timestamptz not null default now(),
  primary key (date, article)
);

create table if not exists public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null check (status in ('success','error')),
  message text,
  last_synced_date date,
  processed_days int not null default 0
);

-- RLS
alter table public.ca_day enable row level security;
alter table public.ca_month enable row level security;
alter table public.ca_product_day enable row level security;
alter table public.sync_runs enable row level security;

-- Lecture: utilisateurs authentifiés
create policy "read ca_day (authenticated)"
on public.ca_day for select
to authenticated
using (true);

create policy "read ca_month (authenticated)"
on public.ca_month for select
to authenticated
using (true);

create policy "read ca_product_day (authenticated)"
on public.ca_product_day for select
to authenticated
using (true);

create policy "read sync_runs (authenticated)"
on public.sync_runs for select
to authenticated
using (true);

-- Écriture: désactivée côté client (on écrira via service role côté serveur)
-- (pas de policy insert/update/delete volontairement)

