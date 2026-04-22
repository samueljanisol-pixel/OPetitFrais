-- Catalogue produits, référentiels, historique de prix, conditionnements, Storage

create sequence if not exists public.product_code_seq;

create table if not exists public.ref_sales_unit (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.ref_category (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.ref_supplier (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.ref_conditionnement (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null,
  height_mm numeric(12,2),
  width_mm numeric(12,2),
  depth_mm numeric(12,2),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- `code` rempli par trigger si absent (insert JSON sans clé `code` → null → trigger)
create table if not exists public.product (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  price numeric(14,2) not null default 0,
  sales_unit_id uuid not null references public.ref_sales_unit (id),
  category_id uuid not null references public.ref_category (id),
  supplier_id uuid not null references public.ref_supplier (id),
  name_ar text,
  cost_purchase numeric(14,2),
  cost_manufacturing numeric(14,2),
  cost_packaging numeric(14,2),
  margin numeric(14,2),
  image_path text,
  active boolean not null default true,
  visible_vitrine boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_price_non_negative check (price >= 0)
);

create or replace function public.product_set_code()
returns trigger
language plpgsql
as $$
begin
  if new.code is null or btrim(new.code) = '' then
    new.code := lpad((nextval('public.product_code_seq'))::text, 6, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_product_set_code on public.product;
create trigger trg_product_set_code
  before insert on public.product
  for each row
  execute function public.product_set_code();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_product_updated on public.product;
create trigger trg_product_updated
  before update on public.product
  for each row
  execute function public.set_updated_at();

create table if not exists public.product_price_history (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.product (id) on delete cascade,
  valid_from timestamptz not null default now(),
  price numeric(14,2) not null,
  cost_purchase numeric(14,2),
  created_at timestamptz not null default now()
);

create or replace function public.product_price_history_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'insert' then
    insert into public.product_price_history (product_id, valid_from, price, cost_purchase)
    values (new.id, now(), new.price, new.cost_purchase);
  elsif tg_op = 'update' and (
    old.price is distinct from new.price
    or old.cost_purchase is distinct from new.cost_purchase
  ) then
    insert into public.product_price_history (product_id, valid_from, price, cost_purchase)
    values (new.id, now(), new.price, new.cost_purchase);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_product_price_history on public.product;
create trigger trg_product_price_history
  after insert or update on public.product
  for each row
  execute function public.product_price_history_fn();

create table if not exists public.product_packaging (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.product (id) on delete cascade,
  conditionnement_id uuid not null references public.ref_conditionnement (id),
  quantity numeric(14,4) not null,
  sales_unit_id uuid not null references public.ref_sales_unit (id),
  created_at timestamptz not null default now(),
  unique (product_id, conditionnement_id, sales_unit_id),
  constraint product_packaging_qty_positive check (quantity > 0)
);

create index if not exists idx_product_category on public.product (category_id);
create index if not exists idx_product_supplier on public.product (supplier_id);
create index if not exists idx_price_hist_product on public.product_price_history (product_id, valid_from desc);
create index if not exists idx_packaging_product on public.product_packaging (product_id);
create index if not exists idx_product_active_vitrine on public.product (active, visible_vitrine);

alter table public.ref_sales_unit enable row level security;
alter table public.ref_category enable row level security;
alter table public.ref_supplier enable row level security;
alter table public.ref_conditionnement enable row level security;
alter table public.product enable row level security;
alter table public.product_price_history enable row level security;
alter table public.product_packaging enable row level security;

drop policy if exists "all authenticated ref_sales_unit" on public.ref_sales_unit;
create policy "all authenticated ref_sales_unit"
  on public.ref_sales_unit for all to authenticated using (true) with check (true);

drop policy if exists "all authenticated ref_category" on public.ref_category;
create policy "all authenticated ref_category"
  on public.ref_category for all to authenticated using (true) with check (true);

drop policy if exists "all authenticated ref_supplier" on public.ref_supplier;
create policy "all authenticated ref_supplier"
  on public.ref_supplier for all to authenticated using (true) with check (true);

drop policy if exists "all authenticated ref_conditionnement" on public.ref_conditionnement;
create policy "all authenticated ref_conditionnement"
  on public.ref_conditionnement for all to authenticated using (true) with check (true);

drop policy if exists "all authenticated product" on public.product;
create policy "all authenticated product"
  on public.product for all to authenticated using (true) with check (true);

drop policy if exists "all authenticated product_price_history" on public.product_price_history;
create policy "all authenticated product_price_history"
  on public.product_price_history for all to authenticated using (true) with check (true);

drop policy if exists "all authenticated product_packaging" on public.product_packaging;
create policy "all authenticated product_packaging"
  on public.product_packaging for all to authenticated using (true) with check (true);

-- Seed
insert into public.ref_sales_unit (code, label, sort_order) values
  ('kg', 'Kg', 0),
  ('unite', 'Unité', 1)
on conflict (code) do nothing;

insert into public.ref_category (code, label, sort_order) values
  ('fruit', 'Fruit', 0),
  ('legume', 'Légume', 1),
  ('frigo', 'Frigo', 2),
  ('epice', 'Epice', 3),
  ('herbes', 'Herbes', 4),
  ('divers', 'Divers', 5)
on conflict (code) do nothing;

insert into public.ref_supplier (code, label, sort_order) values
  ('janisol', 'JANISOL', 0),
  ('marche', 'Marché', 1),
  ('magasin', 'Magasin', 2),
  ('epicerie', 'Epicerie', 3)
on conflict (code) do nothing;

-- Prochain `nextval` = 1 → premier code **000001** (`is_called = false`). La valeur 0 est interdite pour setval.
select setval('public.product_code_seq', 1, false);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-photos',
  'product-photos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "read product-photos" on storage.objects;
drop policy if exists "insert product-photos" on storage.objects;
drop policy if exists "update product-photos" on storage.objects;
drop policy if exists "delete product-photos" on storage.objects;

create policy "read product-photos"
  on storage.objects for select
  to authenticated, anon
  using (bucket_id = 'product-photos');

create policy "insert product-photos"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'product-photos');

create policy "update product-photos"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'product-photos')
  with check (bucket_id = 'product-photos');

create policy "delete product-photos"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'product-photos');
