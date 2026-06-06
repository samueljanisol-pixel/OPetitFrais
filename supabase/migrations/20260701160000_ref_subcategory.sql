-- Sous-catégories rattachées à une catégorie ; produit optionnellement lié.

create table if not exists public.ref_subcategory (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.ref_category (id) on delete cascade,
  code text not null,
  label text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  constraint ref_subcategory_category_label_unique unique (category_id, label)
);

create index if not exists idx_ref_subcategory_category on public.ref_subcategory (category_id);

drop trigger if exists trg_ref_subcategory_code on public.ref_subcategory;
create trigger trg_ref_subcategory_code
  before insert on public.ref_subcategory
  for each row
  execute function public.ref_row_set_code();

alter table public.product
  add column if not exists subcategory_id uuid references public.ref_subcategory (id) on delete set null;

create index if not exists idx_product_subcategory on public.product (subcategory_id);

alter table public.ref_subcategory enable row level security;

drop policy if exists "all authenticated ref_subcategory" on public.ref_subcategory;
create policy "all authenticated ref_subcategory"
  on public.ref_subcategory for all to authenticated using (true) with check (true);

comment on table public.ref_subcategory is
  'Sous-catégories catalogue ; une catégorie regroupe plusieurs sous-catégories (libellé unique par catégorie).';

comment on column public.product.subcategory_id is
  'Sous-catégorie optionnelle ; doit appartenir à product.category_id (cohérence applicative).';
