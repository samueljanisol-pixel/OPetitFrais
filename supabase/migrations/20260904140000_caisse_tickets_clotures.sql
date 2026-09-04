-- Export tickets / clôtures POS → Supabase + page backoffice /clotures

insert into public.permissions (key, description, module, sort_order) values
  ('ventes.write', 'Vérifier les clôtures de caisse', 'ventes', 36)
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.slug = 'administrateur'
  and p.key = 'ventes.write'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select distinct rp.role_id, p_new.id
from public.role_permissions rp
join public.permissions p_old on p_old.id = rp.permission_id and p_old.key = 'ventes.read'
cross join public.permissions p_new
where p_new.key = 'ventes.write'
on conflict do nothing;

insert into public.ref_status_label (domain, status_code, label, sort_order) values
  ('caisse_cloture', 'a_verifier', 'À vérifier', 10),
  ('caisse_cloture', 'verifiee', 'Vérifiée', 20)
on conflict (domain, status_code) do nothing;

create table if not exists public.caisse_ticket (
  id uuid primary key default gen_random_uuid(),
  ticket_ref text not null,
  ticket_number int not null default 0,
  magasin_code text not null,
  caisse_code text not null,
  sold_at timestamptz not null,
  total numeric(12, 2) not null,
  client_id text,
  client_name text,
  is_delivery boolean not null default false,
  cloture_ref text,
  caissier_id text,
  caissier_name text,
  lines jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint caisse_ticket_ref_trim check (length(trim(ticket_ref)) >= 3),
  constraint caisse_ticket_magasin_trim check (length(trim(magasin_code)) >= 1),
  constraint caisse_ticket_caisse_trim check (length(trim(caisse_code)) >= 1)
);

create unique index if not exists caisse_ticket_ref_unique
  on public.caisse_ticket (ticket_ref);

create index if not exists idx_caisse_ticket_cloture
  on public.caisse_ticket (cloture_ref);

create index if not exists idx_caisse_ticket_magasin_sold
  on public.caisse_ticket (magasin_code, sold_at desc);

create table if not exists public.caisse_ticket_payment (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.caisse_ticket (id) on delete cascade,
  mode text not null,
  label text not null default '',
  amount numeric(12, 2) not null,
  constraint caisse_ticket_payment_mode_trim check (length(trim(mode)) >= 1)
);

create index if not exists idx_caisse_ticket_payment_ticket
  on public.caisse_ticket_payment (ticket_id);

create table if not exists public.caisse_cloture (
  id uuid primary key default gen_random_uuid(),
  cloture_ref text not null,
  cloture_number int not null default 0,
  magasin_code text not null,
  caisse_code text not null,
  caissier_id text not null default '',
  caissier_name text not null default '',
  opened_at timestamptz not null,
  closed_at timestamptz not null,
  bills50 int not null default 0,
  bills20 int not null default 0,
  coins10 int not null default 0,
  drawer_total numeric(12, 2) not null default 0,
  sale_total numeric(12, 2) not null default 0,
  credit_sale_total numeric(12, 2) not null default 0,
  sale_count int not null default 0,
  average_basket numeric(12, 2) not null default 0,
  delivery_total numeric(12, 2) not null default 0,
  settlement_total numeric(12, 2) not null default 0,
  credit_settlement_total numeric(12, 2) not null default 0,
  payments jsonb not null default '[]'::jsonb,
  status text not null default 'a_verifier',
  verify_bills200 int,
  verify_bills100 int,
  verify_bills50 int,
  verify_bills20 int,
  verified_at timestamptz,
  verified_by uuid references public.profiles (user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint caisse_cloture_ref_trim check (length(trim(cloture_ref)) >= 3),
  constraint caisse_cloture_status_ok check (status in ('a_verifier', 'verifiee'))
);

create unique index if not exists caisse_cloture_ref_unique
  on public.caisse_cloture (cloture_ref);

create index if not exists idx_caisse_cloture_magasin_closed
  on public.caisse_cloture (magasin_code, caisse_code, closed_at desc);

create index if not exists idx_caisse_cloture_status
  on public.caisse_cloture (status, closed_at desc);

drop trigger if exists trg_caisse_ticket_updated on public.caisse_ticket;
create trigger trg_caisse_ticket_updated
  before update on public.caisse_ticket
  for each row execute function public.set_updated_at();

drop trigger if exists trg_caisse_cloture_updated on public.caisse_cloture;
create trigger trg_caisse_cloture_updated
  before update on public.caisse_cloture
  for each row execute function public.set_updated_at();

create or replace function public.caisse_pos_magasin_visible(p_magasin_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.current_user_is_administrateur()
    or exists (
      select 1
      from public.profiles p
      join public.roles r on r.id = p.role_id
      where p.user_id = auth.uid()
        and r.is_full_access
        and not exists (
          select 1 from public.profile_magasins pm where pm.user_id = auth.uid()
        )
    )
    or exists (
      select 1
      from public.profile_magasins pm
      join public.magasins m on m.id = pm.magasin_id
      where pm.user_id = auth.uid()
        and lpad(regexp_replace(trim(m.code), '\D', '', 'g'), 2, '0')
          = lpad(regexp_replace(trim(p_magasin_code), '\D', '', 'g'), 2, '0')
    );
$$;

grant execute on function public.caisse_pos_magasin_visible(text) to authenticated;

alter table public.caisse_ticket enable row level security;
alter table public.caisse_ticket_payment enable row level security;
alter table public.caisse_cloture enable row level security;

drop policy if exists "caisse_ticket select" on public.caisse_ticket;
create policy "caisse_ticket select"
  on public.caisse_ticket for select
  to authenticated
  using (
    (
      public.current_role_has_permission('ventes.read')
      or public.current_role_has_permission('ventes.write')
    )
    and public.caisse_pos_magasin_visible(magasin_code)
  );

drop policy if exists "caisse_ticket_payment select" on public.caisse_ticket_payment;
create policy "caisse_ticket_payment select"
  on public.caisse_ticket_payment for select
  to authenticated
  using (
    exists (
      select 1 from public.caisse_ticket t
      where t.id = ticket_id
    )
  );

drop policy if exists "caisse_cloture select" on public.caisse_cloture;
create policy "caisse_cloture select"
  on public.caisse_cloture for select
  to authenticated
  using (
    (
      public.current_role_has_permission('ventes.read')
      or public.current_role_has_permission('ventes.write')
    )
    and public.caisse_pos_magasin_visible(magasin_code)
  );

drop policy if exists "caisse_cloture update verify" on public.caisse_cloture;
create policy "caisse_cloture update verify"
  on public.caisse_cloture for update
  to authenticated
  using (
    public.current_role_has_permission('ventes.write')
    and public.caisse_pos_magasin_visible(magasin_code)
  )
  with check (
    public.current_role_has_permission('ventes.write')
    and public.caisse_pos_magasin_visible(magasin_code)
  );

grant select on public.caisse_ticket to authenticated;
grant select on public.caisse_ticket_payment to authenticated;
grant select, update on public.caisse_cloture to authenticated;
