-- Workflow commandes client boutique : statuts, magasin, verrou caisse, lien POS, journal

insert into public.permissions (key, description, module, sort_order) values
  ('commandes_client.read', 'Consulter les commandes client boutique', 'commandes_client', 39),
  ('commandes_client.validate', 'Valider et éditer les commandes client boutique', 'commandes_client', 40),
  ('commandes_client.prepare', 'Préparer les commandes client boutique', 'commandes_client', 41),
  ('commandes_client.deliver', 'Livrer / retirer les commandes client boutique', 'commandes_client', 42)
on conflict (key) do nothing;

-- Rôle chauffeur (commandes client livraison)
insert into public.roles (slug, name, description, is_system, is_full_access)
values ('chauffeur', 'Chauffeur', 'Livraison commandes client boutique', true, false)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  is_system = excluded.is_system;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.slug = 'chauffeur'
  and p.key in ('commandes_client.read', 'commandes_client.deliver')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.slug in ('gestionnaire', 'acheteur')
  and p.key like 'commandes_client.%'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.slug = 'caissier'
  and p.key in (
    'commandes_client.read',
    'commandes_client.prepare',
    'commandes_client.deliver'
  )
on conflict do nothing;

-- Extension shop_cart
alter table public.shop_cart
  add column if not exists magasin_id uuid references public.magasins (id) on delete set null,
  add column if not exists workflow_status text check (
    workflow_status is null or workflow_status in (
      'nouvelle',
      'a_valider',
      'a_preparer',
      'a_passer_caisse',
      'a_livrer',
      'a_retirer',
      'en_livraison',
      'livre_paye',
      'livre_espece_a_encaisser',
      'livre_non_paye',
      'retire_paye',
      'retire_espece_a_encaisser',
      'retire_compte_client',
      'annulee'
    )
  ),
  add column if not exists validated_at timestamptz,
  add column if not exists validated_by uuid references auth.users (id) on delete set null,
  add column if not exists prepared_at timestamptz,
  add column if not exists prepared_by uuid references auth.users (id) on delete set null,
  add column if not exists delivery_started_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists delivered_by uuid references auth.users (id) on delete set null,
  add column if not exists confirmed_payment_method text check (
    confirmed_payment_method is null or confirmed_payment_method in ('cash', 'card', 'credit', 'none')
  ),
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references auth.users (id) on delete set null,
  add column if not exists cancel_reason text,
  add column if not exists caisse_locked_at timestamptz,
  add column if not exists caisse_lock_magasin_code text,
  add column if not exists caisse_lock_caisse_code text;

create index if not exists idx_shop_cart_workflow_magasin
  on public.shop_cart (magasin_id, workflow_status, submitted_at desc nulls last)
  where status = 'submitted';

create index if not exists idx_shop_cart_caisse_lock
  on public.shop_cart (magasin_id, workflow_status)
  where caisse_locked_at is not null and workflow_status = 'a_passer_caisse';

comment on column public.shop_cart.workflow_status is
  'Statut opérationnel commande boutique (distinct de status active/cleared/submitted).';
comment on column public.shop_cart.magasin_id is
  'Magasin de traitement (préparation, caisse, livraison).';

-- Lien ticket POS
create table if not exists public.shop_cart_pos_link (
  id uuid primary key default gen_random_uuid(),
  shop_cart_id uuid not null references public.shop_cart (id) on delete cascade,
  magasin_id uuid not null references public.magasins (id) on delete restrict,
  caisse_code text not null,
  ticket_number integer not null check (ticket_number > 0),
  ticket_ref text not null,
  total numeric(14, 2) not null check (total >= 0),
  linked_at timestamptz not null default now(),
  constraint shop_cart_pos_link_cart_unique unique (shop_cart_id),
  constraint shop_cart_pos_link_ticket_ref_unique unique (ticket_ref)
);

create index if not exists idx_shop_cart_pos_link_ticket_ref
  on public.shop_cart_pos_link (ticket_ref);

comment on table public.shop_cart_pos_link is
  'Lien commande boutique ↔ ticket caisse (barcode MxxCxxTxxx).';

-- Journal workflow
create table if not exists public.shop_cart_workflow_log (
  id uuid primary key default gen_random_uuid(),
  shop_cart_id uuid not null references public.shop_cart (id) on delete cascade,
  created_at timestamptz not null default now(),
  from_status text,
  to_status text,
  action text not null,
  actor_user_id uuid references auth.users (id) on delete set null,
  comment text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_shop_cart_workflow_log_cart
  on public.shop_cart_workflow_log (shop_cart_id, created_at desc);

comment on table public.shop_cart_workflow_log is
  'Historique append-only des transitions et actions sur commandes boutique.';

alter table public.shop_cart_pos_link enable row level security;
alter table public.shop_cart_workflow_log enable row level security;

-- shop_cart : étendre policies commandes_client
drop policy if exists "read shop_cart commandes_client.read" on public.shop_cart;
create policy "read shop_cart commandes_client.read"
  on public.shop_cart for select
  to authenticated
  using (
    public.current_role_has_permission('commandes_client.read')
    or public.current_role_has_permission('commandes_client.validate')
    or public.current_role_has_permission('commandes_client.prepare')
    or public.current_role_has_permission('commandes_client.deliver')
  );

drop policy if exists "write shop_cart commandes_client.validate" on public.shop_cart;
create policy "write shop_cart commandes_client.validate"
  on public.shop_cart for update
  to authenticated
  using (
    public.current_role_has_permission('commandes_client.validate')
    or public.current_role_has_permission('commandes_client.prepare')
    or public.current_role_has_permission('commandes_client.deliver')
  )
  with check (
    public.current_role_has_permission('commandes_client.validate')
    or public.current_role_has_permission('commandes_client.prepare')
    or public.current_role_has_permission('commandes_client.deliver')
  );

drop policy if exists "read shop_cart_pos_link commandes_client" on public.shop_cart_pos_link;
create policy "read shop_cart_pos_link commandes_client"
  on public.shop_cart_pos_link for select
  to authenticated
  using (public.current_role_has_permission('commandes_client.read'));

drop policy if exists "read shop_cart_workflow_log commandes_client" on public.shop_cart_workflow_log;
create policy "read shop_cart_workflow_log commandes_client"
  on public.shop_cart_workflow_log for select
  to authenticated
  using (public.current_role_has_permission('commandes_client.read'));

drop policy if exists "write shop_cart_workflow_log commandes_client" on public.shop_cart_workflow_log;
create policy "write shop_cart_workflow_log commandes_client"
  on public.shop_cart_workflow_log for insert
  to authenticated
  with check (
    public.current_role_has_permission('commandes_client.validate')
    or public.current_role_has_permission('commandes_client.prepare')
    or public.current_role_has_permission('commandes_client.deliver')
  );

-- Backfill paniers soumis existants
update public.shop_cart
set workflow_status = case
  when client_id is not null then 'a_valider'
  else 'nouvelle'
end
where status = 'submitted'
  and workflow_status is null;
