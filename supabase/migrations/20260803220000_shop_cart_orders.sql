-- Paniers boutique : numéro interne, détail lignes et commentaires (retrouvable en backoffice).

create sequence if not exists public.shop_cart_number_seq start with 1001;

create table if not exists public.shop_cart (
  id uuid primary key default gen_random_uuid(),
  cart_number bigint not null default nextval('public.shop_cart_number_seq'),
  visitor_key uuid not null references public.shop_visitor (visitor_key) on delete cascade,
  lines jsonb not null default '[]'::jsonb,
  fulfillment_mode text check (fulfillment_mode is null or fulfillment_mode in ('pickup', 'home')),
  payment_method text check (payment_method is null or payment_method in ('cash', 'card')),
  order_comment text,
  status text not null default 'active' check (status in ('active', 'cleared', 'submitted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shop_cart_cart_number_unique unique (cart_number)
);

create index if not exists idx_shop_cart_status_updated
  on public.shop_cart (status, updated_at desc);

create index if not exists idx_shop_cart_visitor
  on public.shop_cart (visitor_key, updated_at desc);

create index if not exists idx_shop_cart_number
  on public.shop_cart (cart_number desc);

create or replace function public.shop_cart_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_shop_cart_updated on public.shop_cart;
create trigger trg_shop_cart_updated
  before update on public.shop_cart
  for each row
  execute function public.shop_cart_set_updated_at();

alter table public.shop_cart enable row level security;

drop policy if exists "read shop_cart (shop.read)" on public.shop_cart;
create policy "read shop_cart (shop.read)"
on public.shop_cart for select
to authenticated
using (public.current_role_has_permission('shop.read'));

comment on table public.shop_cart is 'Panier boutique enregistré côté serveur (numéro interne, lignes, commentaires).';
comment on column public.shop_cart.cart_number is 'Numéro interne affiché au client (WhatsApp, copie texte).';
comment on column public.shop_cart.lines is 'Lignes panier JSON (produit, qty, unité, commentaire ligne).';
