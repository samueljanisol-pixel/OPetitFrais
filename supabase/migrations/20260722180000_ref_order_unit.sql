-- Unité de commande (UdC) — référentiel distinct de l’unité de vente (UdV).

create table if not exists public.ref_order_unit (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null,
  label_ar text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.ref_order_unit is
  'Unités de commande fournisseur (UdC), distinctes des unités de vente (UdV).';

comment on column public.ref_order_unit.label_ar is
  'Libellé arabe optionnel (affichage parcours commande).';

alter table public.product
  add column if not exists order_unit_id uuid references public.ref_order_unit (id) on delete set null;

create index if not exists idx_product_order_unit on public.product (order_unit_id);

comment on column public.product.order_unit_id is
  'Unité de commande fournisseur (UdC) ; peut différer de sales_unit_id (UdV).';

alter table public.ref_order_unit enable row level security;

drop policy if exists "all authenticated ref_order_unit" on public.ref_order_unit;
create policy "all authenticated ref_order_unit"
  on public.ref_order_unit for all to authenticated using (true) with check (true);

drop trigger if exists trg_ref_order_unit_code on public.ref_order_unit;
create trigger trg_ref_order_unit_code
  before insert on public.ref_order_unit
  for each row
  execute function public.ref_row_set_code();

-- Valeurs initiales courantes (code auto via trigger si absent)
insert into public.ref_order_unit (label, sort_order)
select v.label, v.sort_order
from (values
  ('Kg', 1),
  ('Pièce', 2),
  ('Litre', 3),
  ('Carton', 4)
) as v(label, sort_order)
where not exists (select 1 from public.ref_order_unit limit 1);
