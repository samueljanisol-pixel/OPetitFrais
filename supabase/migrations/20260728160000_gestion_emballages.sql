-- Gestion Emballages : référentiel matériaux, journal d'achats, lien produit.

insert into public.permissions (key, description, module, sort_order) values
  ('emballages.read', 'Consulter Gestion Emballages (référentiel et achats)', 'emballages', 57),
  ('emballages.write', 'Modifier Gestion Emballages (référentiel et achats)', 'emballages', 58)
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.slug = 'administrateur'
  and p.key in ('emballages.read', 'emballages.write')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select distinct rp.role_id, p_new.id
from public.role_permissions rp
join public.permissions p_old on p_old.id = rp.permission_id and p_old.key = 'parametres.write'
cross join public.permissions p_new
where p_new.key in ('emballages.read', 'emballages.write')
on conflict do nothing;

create table if not exists public.ref_emballage (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  type text not null,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ref_emballage_type_check check (
    type in ('sachet', 'barquette', 'bouteille', 'sac_vente')
  )
);

comment on table public.ref_emballage is
  'Référentiel des matériaux d''emballage (sachet, barquette, etc.).';

create unique index if not exists idx_ref_emballage_label_ci
  on public.ref_emballage (lower(trim(label)));

drop trigger if exists trg_ref_emballage_updated on public.ref_emballage;
create trigger trg_ref_emballage_updated
  before update on public.ref_emballage
  for each row execute function public.set_updated_at();

alter table public.ref_emballage enable row level security;

drop policy if exists "ref_emballage select" on public.ref_emballage;
create policy "ref_emballage select"
  on public.ref_emballage for select
  to authenticated
  using (
    public.current_role_has_permission('emballages.read')
    or public.current_role_has_permission('emballages.write')
    or public.current_role_has_permission('produits.read')
    or public.current_role_has_permission('produits.write')
  );

drop policy if exists "ref_emballage write" on public.ref_emballage;
create policy "ref_emballage write"
  on public.ref_emballage for all
  to authenticated
  using (public.current_role_has_permission('emballages.write'))
  with check (public.current_role_has_permission('emballages.write'));

grant select, insert, update, delete on public.ref_emballage to authenticated;

create table if not exists public.emballage_achat (
  id uuid primary key default gen_random_uuid(),
  emballage_id uuid not null references public.ref_emballage (id) on delete restrict,
  date_achat date not null,
  quantite numeric(14, 4) not null check (quantite > 0),
  prix_unitaire numeric(14, 2) not null check (prix_unitaire >= 0),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.emballage_achat is
  'Journal d''achats de matériaux d''emballage (sans suivi de stock).';

create index if not exists idx_emballage_achat_date
  on public.emballage_achat (date_achat desc);

create index if not exists idx_emballage_achat_emballage
  on public.emballage_achat (emballage_id);

drop trigger if exists trg_emballage_achat_updated on public.emballage_achat;
create trigger trg_emballage_achat_updated
  before update on public.emballage_achat
  for each row execute function public.set_updated_at();

alter table public.emballage_achat enable row level security;

drop policy if exists "emballage_achat select" on public.emballage_achat;
create policy "emballage_achat select"
  on public.emballage_achat for select
  to authenticated
  using (
    public.current_role_has_permission('emballages.read')
    or public.current_role_has_permission('emballages.write')
  );

drop policy if exists "emballage_achat write" on public.emballage_achat;
create policy "emballage_achat write"
  on public.emballage_achat for all
  to authenticated
  using (public.current_role_has_permission('emballages.write'))
  with check (public.current_role_has_permission('emballages.write'));

grant select, insert, update, delete on public.emballage_achat to authenticated;

alter table public.product
  add column if not exists emballage_id uuid references public.ref_emballage (id) on delete set null;

comment on column public.product.emballage_id is
  'Matériau d''emballage utilisé pour ce produit ; null = aucun.';

create index if not exists idx_product_emballage_id
  on public.product (emballage_id)
  where emballage_id is not null;
