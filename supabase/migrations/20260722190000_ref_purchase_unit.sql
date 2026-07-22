-- Unité d'achat (UdA) — référentiel distinct de l’UdV et de l’UdC.

create table if not exists public.ref_purchase_unit (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null,
  label_ar text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.ref_purchase_unit is
  'Unités d''achat fournisseur (UdA), distinctes des unités de vente (UdV) et de commande (UdC).';

comment on column public.ref_purchase_unit.label_ar is
  'Libellé arabe optionnel.';

alter table public.product
  add column if not exists purchase_unit_id uuid references public.ref_purchase_unit (id) on delete set null;

create index if not exists idx_product_purchase_unit on public.product (purchase_unit_id);

comment on column public.product.purchase_unit_id is
  'Unité d''achat fournisseur (UdA).';

alter table public.ref_purchase_unit enable row level security;

drop policy if exists "all authenticated ref_purchase_unit" on public.ref_purchase_unit;
create policy "all authenticated ref_purchase_unit"
  on public.ref_purchase_unit for all to authenticated using (true) with check (true);

drop trigger if exists trg_ref_purchase_unit_code on public.ref_purchase_unit;
create trigger trg_ref_purchase_unit_code
  before insert on public.ref_purchase_unit
  for each row
  execute function public.ref_row_set_code();

insert into public.ref_purchase_unit (label, sort_order)
select v.label, v.sort_order
from (values
  ('Kg', 1),
  ('Pièce', 2),
  ('Litre', 3),
  ('Carton', 4)
) as v(label, sort_order)
where not exists (select 1 from public.ref_purchase_unit limit 1);
