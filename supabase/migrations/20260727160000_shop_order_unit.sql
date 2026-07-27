-- Unités de commande vitrine (boutique) — distinctes UdV / UdC / colis fournisseur.

create table if not exists public.ref_shop_order_unit (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null,
  label_ar text,
  piece_qty numeric(14, 4) not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  constraint ref_shop_order_unit_piece_qty_positive check (piece_qty > 0)
);

comment on table public.ref_shop_order_unit is
  'Unités de commande vitrine (boutique) : libellé + quantité de pièces (ex. 0.25 = 1/4, 6 = lot de 6).';

comment on column public.ref_shop_order_unit.piece_qty is
  'Nombre de pièces représenté par une unité de commande vitrine.';

comment on column public.ref_shop_order_unit.label_ar is
  'Libellé arabe optionnel (boutique RTL).';

alter table public.ref_shop_order_unit enable row level security;

drop policy if exists "all authenticated ref_shop_order_unit" on public.ref_shop_order_unit;
create policy "all authenticated ref_shop_order_unit"
  on public.ref_shop_order_unit for all to authenticated using (true) with check (true);

drop trigger if exists trg_ref_shop_order_unit_code on public.ref_shop_order_unit;
create trigger trg_ref_shop_order_unit_code
  before insert on public.ref_shop_order_unit
  for each row
  execute function public.ref_row_set_code();

create table if not exists public.product_shop_order_unit (
  product_id uuid not null references public.product (id) on delete cascade,
  shop_order_unit_id uuid not null references public.ref_shop_order_unit (id) on delete restrict,
  primary key (product_id, shop_order_unit_id)
);

create index if not exists product_shop_order_unit_unit_id_idx
  on public.product_shop_order_unit (shop_order_unit_id);

comment on table public.product_shop_order_unit is
  'Unités de commande vitrine accordées à un produit (hors UdV).';

alter table public.product_shop_order_unit enable row level security;

drop policy if exists "all authenticated product_shop_order_unit" on public.product_shop_order_unit;
create policy "all authenticated product_shop_order_unit"
  on public.product_shop_order_unit for all to authenticated using (true) with check (true);

alter table public.product
  add column if not exists piece_weight_kg numeric(14, 4);

alter table public.product
  add column if not exists shop_allow_sales_unit boolean not null default true;

alter table public.product
  add column if not exists shop_favorite_unit_id uuid references public.ref_shop_order_unit (id) on delete set null;

create index if not exists idx_product_shop_favorite_unit
  on public.product (shop_favorite_unit_id);

comment on column public.product.piece_weight_kg is
  'Poids moyen d’une pièce (kg) pour convertir les unités vitrine en prix estimé.';

comment on column public.product.shop_allow_sales_unit is
  'Si true, l’UdV est proposée comme option de commande sur la boutique.';

comment on column public.product.shop_favorite_unit_id is
  'Unité vitrine favorite sur la boutique ; null = favori = UdV.';

alter table public.product
  drop constraint if exists product_piece_weight_kg_positive;

alter table public.product
  add constraint product_piece_weight_kg_positive
  check (piece_weight_kg is null or piece_weight_kg > 0);

-- Seed exemples (code auto via trigger)
insert into public.ref_shop_order_unit (label, label_ar, piece_qty, sort_order)
select v.label, v.label_ar, v.piece_qty, v.sort_order
from (values
  ('1/4 pièce', 'ربع حبة', 0.25::numeric, 1),
  ('1/2 pièce', 'نصف حبة', 0.5::numeric, 2),
  ('1 pièce', 'حبة', 1::numeric, 3),
  ('Lot de 6', 'علبة 6', 6::numeric, 4)
) as v(label, label_ar, piece_qty, sort_order)
where not exists (select 1 from public.ref_shop_order_unit limit 1);
