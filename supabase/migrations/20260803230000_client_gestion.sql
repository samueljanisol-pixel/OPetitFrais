-- Gestion clients backoffice : paniers boutique, paiements, permissions

insert into public.permissions (key, description, module, sort_order) values
  ('clients.read', 'Consulter les clients et comptes paniers boutique', 'clients', 37),
  ('clients.write', 'Gérer les clients, rattacher paniers et paiements', 'clients', 38)
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.slug in ('gestionnaire', 'acheteur')
  and p.key in ('clients.read', 'clients.write')
on conflict do nothing;

-- Modes de paiement client (Carte, Chèque)
insert into public.ref_payment_method (label, sort_order)
select v.label, v.sort_order
from (values
  ('Carte bancaire', 4),
  ('Chèque', 5)
) as v(label, sort_order)
where not exists (
  select 1 from public.ref_payment_method m where m.label = v.label
);

-- Extension caisse_client
alter table public.caisse_client
  add column if not exists auth_user_id uuid references auth.users (id) on delete set null;

comment on column public.caisse_client.auth_user_id is
  'Compte auth boutique (futur) — liaison panier automatique.';

drop policy if exists "caisse_client select authenticated" on public.caisse_client;
drop policy if exists "caisse_client select clients.read" on public.caisse_client;
create policy "caisse_client select clients.read"
  on public.caisse_client for select
  to authenticated
  using (
    public.current_role_has_permission('clients.read')
    or public.current_role_has_permission('clients.write')
  );

drop policy if exists "caisse_client write clients.write" on public.caisse_client;
create policy "caisse_client write clients.write"
  on public.caisse_client for insert
  to authenticated
  with check (public.current_role_has_permission('clients.write'));

drop policy if exists "caisse_client update clients.write" on public.caisse_client;
create policy "caisse_client update clients.write"
  on public.caisse_client for update
  to authenticated
  using (public.current_role_has_permission('clients.write'))
  with check (public.current_role_has_permission('clients.write'));

-- Extension shop_cart (paniers boutique / commandes)
alter table public.shop_cart
  add column if not exists client_id uuid references public.caisse_client (id) on delete set null,
  add column if not exists submitted_at timestamptz,
  add column if not exists montant_total numeric(14, 2) check (montant_total is null or montant_total >= 0),
  add column if not exists payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid', 'paid'));

create index if not exists idx_shop_cart_client
  on public.shop_cart (client_id, submitted_at desc nulls last)
  where client_id is not null;

create index if not exists idx_shop_cart_unlinked_submitted
  on public.shop_cart (submitted_at desc nulls last)
  where status = 'submitted' and client_id is null;

create index if not exists idx_shop_cart_client_unpaid
  on public.shop_cart (client_id, payment_status)
  where status = 'submitted' and payment_status = 'unpaid';

comment on column public.shop_cart.client_id is
  'Client rattaché manuellement en backoffice.';
comment on column public.shop_cart.payment_status is
  'Règlement backoffice du panier soumis (unpaid | paid).';

-- Paiements clients (paniers boutique)
create table if not exists public.client_paiement (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.caisse_client (id) on delete restrict,
  payment_method_id uuid not null references public.ref_payment_method (id) on delete restrict,
  date_paiement date not null,
  commentaire text,
  montant numeric(14, 2) not null check (montant > 0),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_client_paiement_client_date
  on public.client_paiement (client_id, date_paiement desc);

comment on table public.client_paiement is
  'Paiements backoffice sur compte client (paniers boutique).';

create table if not exists public.client_paiement_panier (
  paiement_id uuid not null references public.client_paiement (id) on delete cascade,
  shop_cart_id uuid not null references public.shop_cart (id) on delete restrict,
  primary key (paiement_id, shop_cart_id),
  unique (shop_cart_id)
);

comment on table public.client_paiement_panier is
  'Lien paiement ↔ panier boutique ; un panier ne peut être payé qu''une fois.';

alter table public.client_paiement enable row level security;
alter table public.client_paiement_panier enable row level security;

drop policy if exists "client_paiement select clients.read" on public.client_paiement;
create policy "client_paiement select clients.read"
  on public.client_paiement for select
  to authenticated
  using (public.current_role_has_permission('clients.read'));

drop policy if exists "client_paiement write clients.write" on public.client_paiement;
create policy "client_paiement write clients.write"
  on public.client_paiement for all
  to authenticated
  using (public.current_role_has_permission('clients.write'))
  with check (public.current_role_has_permission('clients.write'));

drop policy if exists "client_paiement_panier select clients.read" on public.client_paiement_panier;
create policy "client_paiement_panier select clients.read"
  on public.client_paiement_panier for select
  to authenticated
  using (public.current_role_has_permission('clients.read'));

drop policy if exists "client_paiement_panier write clients.write" on public.client_paiement_panier;
create policy "client_paiement_panier write clients.write"
  on public.client_paiement_panier for all
  to authenticated
  using (public.current_role_has_permission('clients.write'))
  with check (public.current_role_has_permission('clients.write'));

-- shop_cart : lecture/écriture backoffice clients
drop policy if exists "read shop_cart (shop.read)" on public.shop_cart;
drop policy if exists "read shop_cart clients.read" on public.shop_cart;
create policy "read shop_cart clients.read"
  on public.shop_cart for select
  to authenticated
  using (
    public.current_role_has_permission('clients.read')
    or public.current_role_has_permission('shop.read')
  );

drop policy if exists "write shop_cart clients.write" on public.shop_cart;
create policy "write shop_cart clients.write"
  on public.shop_cart for update
  to authenticated
  using (public.current_role_has_permission('clients.write'))
  with check (public.current_role_has_permission('clients.write'));
