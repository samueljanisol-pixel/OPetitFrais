-- Statistiques boutique publique : visites, visiteurs actifs, paniers en cours.

insert into public.permissions (key, description, module, sort_order) values
  ('shop.read', 'Consulter les statistiques boutique (visites, paniers)', 'shop', 36)
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.slug = 'gestionnaire'
  and p.key = 'shop.read'
on conflict do nothing;

create table if not exists public.shop_visitor (
  visitor_key uuid primary key,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists idx_shop_visitor_last_seen
  on public.shop_visitor (last_seen_at desc);

create table if not exists public.shop_visit_day (
  visitor_key uuid not null references public.shop_visitor (visitor_key) on delete cascade,
  visit_date date not null,
  created_at timestamptz not null default now(),
  primary key (visitor_key, visit_date)
);

create index if not exists idx_shop_visit_day_date
  on public.shop_visit_day (visit_date desc);

create table if not exists public.shop_cart_state (
  visitor_key uuid primary key references public.shop_visitor (visitor_key) on delete cascade,
  line_count int not null default 0 check (line_count >= 0),
  total_amount numeric(14, 2) not null default 0 check (total_amount >= 0),
  updated_at timestamptz not null default now()
);

create index if not exists idx_shop_cart_state_active
  on public.shop_cart_state (updated_at desc)
  where line_count > 0;

create or replace function public.shop_cart_state_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_shop_cart_state_updated on public.shop_cart_state;
create trigger trg_shop_cart_state_updated
  before update on public.shop_cart_state
  for each row
  execute function public.shop_cart_state_set_updated_at();

alter table public.shop_visitor enable row level security;
alter table public.shop_visit_day enable row level security;
alter table public.shop_cart_state enable row level security;

comment on table public.shop_visitor is 'Visiteur boutique anonyme (clé UUID côté navigateur).';
comment on table public.shop_visit_day is 'Une visite = un visiteur unique par jour (fuseau Africa/Casablanca).';
comment on table public.shop_cart_state is 'Dernier état panier synchronisé depuis la boutique.';
