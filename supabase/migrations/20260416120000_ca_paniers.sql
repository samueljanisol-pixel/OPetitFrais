-- Paniers : colonnes + répartition horaire (à exécuter sur une base déjà provisionnée)

alter table public.ca_day add column if not exists nb_paniers numeric not null default 0;
alter table public.ca_month add column if not exists nb_paniers numeric not null default 0;

create table if not exists public.ca_panier_hour (
  date date not null,
  magasin text not null,
  hour smallint not null,
  nb numeric not null default 0,
  inserted_at timestamptz not null default now(),
  primary key (date, magasin, hour),
  constraint ca_panier_hour_hour_range check (hour >= 0 and hour < 48)
);

alter table public.ca_panier_hour enable row level security;

drop policy if exists "read ca_panier_hour (authenticated)" on public.ca_panier_hour;
create policy "read ca_panier_hour (authenticated)"
on public.ca_panier_hour for select
to authenticated
using (true);
