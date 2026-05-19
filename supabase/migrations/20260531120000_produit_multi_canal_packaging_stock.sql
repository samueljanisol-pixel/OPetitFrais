-- Multi-canal conditionnements : flags vente/achat, liaisons fournisseurs & marchands, overrides magasin, stock.

-- ---------------------------------------------------------------------------
-- A) Référentiel marchand (vendeur à l’achat)
-- ---------------------------------------------------------------------------
create table if not exists public.ref_marchand (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  label text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  constraint ref_marchand_code_unique unique (code)
);

create index if not exists ref_marchand_sort_order_idx on public.ref_marchand (sort_order);

alter table public.ref_marchand enable row level security;

drop policy if exists "all authenticated ref_marchand" on public.ref_marchand;
create policy "all authenticated ref_marchand"
  on public.ref_marchand for all to authenticated using (true) with check (true);

comment on table public.ref_marchand is 'Marchand = contrepartie côté achat / approvisionnement (distinct du fournisseur catalogue).';

-- ---------------------------------------------------------------------------
-- B) product_packaging : disponibilité vente / achat
-- ---------------------------------------------------------------------------
alter table public.product_packaging
  add column if not exists available_for_sale boolean not null default true;
alter table public.product_packaging
  add column if not exists available_for_purchase boolean not null default true;

comment on column public.product_packaging.available_for_sale is 'Éligible à la vente au détail (conditionnement offert au client).';
comment on column public.product_packaging.available_for_purchase is 'Éligible en commande fournisseur / achat (colis).';

-- Commande à l’unité (sans ligne product_packaging)
alter table public.product
  add column if not exists allow_unit_in_commande boolean not null default true;

comment on column public.product.allow_unit_in_commande is 'Si false, la saisie commande fournisseur n’autorise que les conditionnements éligibles.';

-- ---------------------------------------------------------------------------
-- C) Liaisons N–N
-- ---------------------------------------------------------------------------
create table if not exists public.product_packaging_supplier (
  product_packaging_id uuid not null references public.product_packaging (id) on delete cascade,
  supplier_id uuid not null references public.ref_supplier (id) on delete restrict,
  primary key (product_packaging_id, supplier_id)
);

create index if not exists product_packaging_supplier_supplier_id_idx
  on public.product_packaging_supplier (supplier_id);

create table if not exists public.product_packaging_marchand (
  product_packaging_id uuid not null references public.product_packaging (id) on delete cascade,
  marchand_id uuid not null references public.ref_marchand (id) on delete restrict,
  primary key (product_packaging_id, marchand_id)
);

create index if not exists product_packaging_marchand_marchand_id_idx
  on public.product_packaging_marchand (marchand_id);

create table if not exists public.product_packaging_magasin (
  product_packaging_id uuid not null references public.product_packaging (id) on delete cascade,
  magasin_id uuid not null references public.magasins (id) on delete cascade,
  sellable boolean not null default true,
  purchasable boolean not null default true,
  primary key (product_packaging_id, magasin_id)
);

create index if not exists product_packaging_magasin_magasin_id_idx
  on public.product_packaging_magasin (magasin_id);

comment on table public.product_packaging_magasin is
  'Override par magasin : si une ligne existe, sellable/purchasable remplacent les flags globaux du product_packaging pour ce magasin.';

alter table public.product_packaging_supplier enable row level security;
alter table public.product_packaging_marchand enable row level security;
alter table public.product_packaging_magasin enable row level security;

drop policy if exists "all authenticated product_packaging_supplier" on public.product_packaging_supplier;
create policy "all authenticated product_packaging_supplier"
  on public.product_packaging_supplier for all to authenticated using (true) with check (true);

drop policy if exists "all authenticated product_packaging_marchand" on public.product_packaging_marchand;
create policy "all authenticated product_packaging_marchand"
  on public.product_packaging_marchand for all to authenticated using (true) with check (true);

drop policy if exists "all authenticated product_packaging_magasin" on public.product_packaging_magasin;
create policy "all authenticated product_packaging_magasin"
  on public.product_packaging_magasin for all to authenticated using (true) with check (true);

-- Rétrocompat : rattacher le fournisseur produit à chaque ligne de colis existante
insert into public.product_packaging_supplier (product_packaging_id, supplier_id)
select pp.id, p.supplier_id
from public.product_packaging pp
join public.product p on p.id = pp.product_id
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- D) Stock (soldes + mouvements)
-- ---------------------------------------------------------------------------
create table if not exists public.stock_balance (
  magasin_id uuid not null references public.magasins (id) on delete cascade,
  product_id uuid not null references public.product (id) on delete cascade,
  quantity numeric(14, 4) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (magasin_id, product_id),
  constraint stock_balance_quantity_finite check (quantity = quantity)
);

create index if not exists stock_balance_product_id_idx on public.stock_balance (product_id);

create table if not exists public.stock_mouvement (
  id uuid primary key default gen_random_uuid(),
  magasin_id uuid not null references public.magasins (id) on delete cascade,
  product_id uuid not null references public.product (id) on delete restrict,
  quantity_delta numeric(14, 4) not null,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists stock_mouvement_magasin_created_idx
  on public.stock_mouvement (magasin_id, created_at desc);

alter table public.stock_balance enable row level security;
alter table public.stock_mouvement enable row level security;

drop policy if exists "all authenticated stock_balance" on public.stock_balance;
create policy "all authenticated stock_balance"
  on public.stock_balance for all to authenticated using (true) with check (true);

drop policy if exists "all authenticated stock_mouvement" on public.stock_mouvement;
create policy "all authenticated stock_mouvement"
  on public.stock_mouvement for all to authenticated using (true) with check (true);

create or replace function public.stock_mouvement_apply_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.stock_balance (magasin_id, product_id, quantity, updated_at)
  values (new.magasin_id, new.product_id, new.quantity_delta, now())
  on conflict (magasin_id, product_id) do update
    set quantity = public.stock_balance.quantity + excluded.quantity,
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_stock_mouvement_apply on public.stock_mouvement;
create trigger trg_stock_mouvement_apply
  after insert on public.stock_mouvement
  for each row
  execute function public.stock_mouvement_apply_balance();

comment on table public.stock_balance is 'Stock agrégé par magasin et produit (UdV catalogue = ref produit).';
comment on table public.stock_mouvement is 'Mouvement de stock ; mise à jour stock_balance par trigger.';
