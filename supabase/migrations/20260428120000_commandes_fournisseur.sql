-- Commandes fournisseur : commandes magasin, lignes, lots consolidés, frais, permissions dédiées, RLS

-- Permissions
insert into public.permissions (key, description, module, sort_order) values
  ('commandes_fournisseur.saisie', 'Saisir les commandes fournisseur (magasin)', 'commandes_fournisseur', 90),
  ('commandes_fournisseur.consolidation', 'Consolider les commandes par fournisseur (lots)', 'commandes_fournisseur', 91),
  ('commandes_fournisseur.achat', 'Saisir achat et frais sur les lots', 'commandes_fournisseur', 92)
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.slug = 'caissier'
  and p.key = 'commandes_fournisseur.saisie'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.slug = 'gestionnaire'
  and p.key = 'commandes_fournisseur.consolidation'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.slug = 'acheteur'
  and p.key = 'commandes_fournisseur.achat'
on conflict do nothing;

-- Administrateur : toutes les permissions (full_access) via get_my_permission_keys

create table if not exists public.commande_fournisseur (
  id uuid primary key default gen_random_uuid(),
  magasin_id uuid not null references public.magasins (id) on delete restrict,
  supplier_id uuid not null references public.ref_supplier (id) on delete restrict,
  status text not null
    check (status in ('en_saisie', 'validee', 'integree')),
  commentaire text,
  lot_id uuid,
  created_by uuid references auth.users (id) on delete set null,
  validated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- FK lot après create table lot
create index if not exists idx_commande_fournisseur_magasin on public.commande_fournisseur (magasin_id);
create index if not exists idx_commande_fournisseur_supplier_status on public.commande_fournisseur (supplier_id, status);
create index if not exists idx_commande_fournisseur_lot on public.commande_fournisseur (lot_id) where lot_id is not null;

create table if not exists public.commande_fournisseur_ligne (
  id uuid primary key default gen_random_uuid(),
  commande_id uuid not null references public.commande_fournisseur (id) on delete cascade,
  product_id uuid not null references public.product (id) on delete restrict,
  product_packaging_id uuid references public.product_packaging (id) on delete set null,
  qte integer not null default 0
    check (qte >= 0),
  line_comment text,
  hors_fournisseur boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_cfl_commande on public.commande_fournisseur_ligne (commande_id);

create table if not exists public.commande_fournisseur_lot (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.ref_supplier (id) on delete restrict,
  status text not null
    check (status in ('brouillon', 'prete', 'terminee')),
  commentaire text,
  created_by uuid references auth.users (id) on delete set null,
  marque_prete_at timestamptz,
  marque_terminee_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_cflot_supplier_status on public.commande_fournisseur_lot (supplier_id, status);

alter table public.commande_fournisseur
  add constraint commande_fournisseur_lot_fk
  foreign key (lot_id) references public.commande_fournisseur_lot (id) on delete set null;

create table if not exists public.commande_fournisseur_lot_inclusion (
  lot_id uuid not null references public.commande_fournisseur_lot (id) on delete cascade,
  commande_id uuid not null references public.commande_fournisseur (id) on delete restrict,
  primary key (lot_id, commande_id)
);

create table if not exists public.commande_fournisseur_lot_ligne (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.commande_fournisseur_lot (id) on delete cascade,
  product_id uuid not null references public.product (id) on delete restrict,
  qte_achat integer
    check (qte_achat is null or qte_achat >= 0),
  prix_achat_unitaire numeric(14, 2)
    check (prix_achat_unitaire is null or prix_achat_unitaire >= 0),
  montant_ligne_achat numeric(14, 2)
    check (montant_ligne_achat is null or montant_ligne_achat >= 0),
  created_at timestamptz not null default now(),
  unique (lot_id, product_id)
);

create index if not exists idx_cfll_lot on public.commande_fournisseur_lot_ligne (lot_id);

create table if not exists public.commande_fournisseur_lot_ligne_magasin (
  lot_ligne_id uuid not null references public.commande_fournisseur_lot_ligne (id) on delete cascade,
  magasin_id uuid not null references public.magasins (id) on delete restrict,
  qte integer not null default 0
    check (qte >= 0),
  primary key (lot_ligne_id, magasin_id)
);

create table if not exists public.commande_fournisseur_lot_frais (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.commande_fournisseur_lot (id) on delete cascade,
  type_code text not null default 'autre',
  label text not null,
  montant numeric(14, 2) not null
    check (montant >= 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_cflf_lot on public.commande_fournisseur_lot_frais (lot_id);

-- Triggers updated_at
create or replace function public.commande_fournisseur_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_commande_fournisseur_updated on public.commande_fournisseur;
create trigger trg_commande_fournisseur_updated
  before update on public.commande_fournisseur
  for each row
  execute function public.commande_fournisseur_set_updated_at();

create or replace function public.commande_fournisseur_lot_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_commande_fournisseur_lot_updated on public.commande_fournisseur_lot;
create trigger trg_commande_fournisseur_lot_updated
  before update on public.commande_fournisseur_lot
  for each row
  execute function public.commande_fournisseur_lot_set_updated_at();

-- RLS
alter table public.commande_fournisseur enable row level security;
alter table public.commande_fournisseur_ligne enable row level security;
alter table public.commande_fournisseur_lot enable row level security;
alter table public.commande_fournisseur_lot_inclusion enable row level security;
alter table public.commande_fournisseur_lot_ligne enable row level security;
alter table public.commande_fournisseur_lot_ligne_magasin enable row level security;
alter table public.commande_fournisseur_lot_frais enable row level security;

-- commande_fournisseur
drop policy if exists "cf select" on public.commande_fournisseur;
create policy "cf select"
  on public.commande_fournisseur for select
  to authenticated
  using (
    public.current_role_has_permission('commandes_fournisseur.consolidation')
    or (
      public.current_role_has_permission('commandes_fournisseur.saisie')
      and exists (
        select 1
        from public.profile_magasins pm
        where pm.user_id = auth.uid()
          and pm.magasin_id = commande_fournisseur.magasin_id
      )
    )
  );

drop policy if exists "cf insert saisie" on public.commande_fournisseur;
create policy "cf insert saisie"
  on public.commande_fournisseur for insert
  to authenticated
  with check (
    public.current_role_has_permission('commandes_fournisseur.saisie')
    and exists (
      select 1
      from public.profile_magasins pm
      where pm.user_id = auth.uid()
        and pm.magasin_id = commande_fournisseur.magasin_id
    )
  );

drop policy if exists "cf update" on public.commande_fournisseur;
create policy "cf update"
  on public.commande_fournisseur for update
  to authenticated
  using (
    (
      public.current_role_has_permission('commandes_fournisseur.saisie')
      and commande_fournisseur.status in ('en_saisie', 'validee')
      and exists (
        select 1
        from public.profile_magasins pm
        where pm.user_id = auth.uid()
          and pm.magasin_id = commande_fournisseur.magasin_id
      )
    )
    or public.current_role_has_permission('commandes_fournisseur.consolidation')
  )
  with check (
    (
      public.current_role_has_permission('commandes_fournisseur.saisie')
      and commande_fournisseur.status in ('en_saisie', 'validee')
      and exists (
        select 1
        from public.profile_magasins pm
        where pm.user_id = auth.uid()
          and pm.magasin_id = commande_fournisseur.magasin_id
      )
    )
    or public.current_role_has_permission('commandes_fournisseur.consolidation')
  );

drop policy if exists "cf delete" on public.commande_fournisseur;
create policy "cf delete"
  on public.commande_fournisseur for delete
  to authenticated
  using (
    commande_fournisseur.status = 'en_saisie'
    and public.current_role_has_permission('commandes_fournisseur.saisie')
    and exists (
      select 1
      from public.profile_magasins pm
      where pm.user_id = auth.uid()
        and pm.magasin_id = commande_fournisseur.magasin_id
    )
  );

-- lignes : même périmètre que la commande parente (via sous-requêtes)
drop policy if exists "cfl select" on public.commande_fournisseur_ligne;
create policy "cfl select"
  on public.commande_fournisseur_ligne for select
  to authenticated
  using (
    exists (
      select 1
      from public.commande_fournisseur cf
      where cf.id = commande_fournisseur_ligne.commande_id
        and (
          public.current_role_has_permission('commandes_fournisseur.consolidation')
          or (
            public.current_role_has_permission('commandes_fournisseur.saisie')
            and exists (
              select 1
              from public.profile_magasins pm
              where pm.user_id = auth.uid()
                and pm.magasin_id = cf.magasin_id
            )
          )
        )
    )
  );

drop policy if exists "cfl write saisie" on public.commande_fournisseur_ligne;
create policy "cfl write saisie"
  on public.commande_fournisseur_ligne for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.commande_fournisseur cf
      where cf.id = commande_fournisseur_ligne.commande_id
        and cf.status = 'en_saisie'
        and public.current_role_has_permission('commandes_fournisseur.saisie')
        and exists (
          select 1
          from public.profile_magasins pm
          where pm.user_id = auth.uid()
            and pm.magasin_id = cf.magasin_id
        )
    )
  );

create policy "cfl update saisie"
  on public.commande_fournisseur_ligne for update
  to authenticated
  using (
    exists (
      select 1
      from public.commande_fournisseur cf
      where cf.id = commande_fournisseur_ligne.commande_id
        and cf.status = 'en_saisie'
        and public.current_role_has_permission('commandes_fournisseur.saisie')
        and exists (
          select 1
          from public.profile_magasins pm
          where pm.user_id = auth.uid()
            and pm.magasin_id = cf.magasin_id
        )
    )
  )
  with check (
    exists (
      select 1
      from public.commande_fournisseur cf
      where cf.id = commande_fournisseur_ligne.commande_id
        and cf.status = 'en_saisie'
        and public.current_role_has_permission('commandes_fournisseur.saisie')
        and exists (
          select 1
          from public.profile_magasins pm
          where pm.user_id = auth.uid()
            and pm.magasin_id = cf.magasin_id
        )
    )
  );

create policy "cfl delete saisie"
  on public.commande_fournisseur_ligne for delete
  to authenticated
  using (
    exists (
      select 1
      from public.commande_fournisseur cf
      where cf.id = commande_fournisseur_ligne.commande_id
        and cf.status = 'en_saisie'
        and public.current_role_has_permission('commandes_fournisseur.saisie')
        and exists (
          select 1
          from public.profile_magasins pm
          where pm.user_id = auth.uid()
            and pm.magasin_id = cf.magasin_id
        )
    )
  );

-- Lots
drop policy if exists "cflot all consolidation" on public.commande_fournisseur_lot;
create policy "cflot all consolidation"
  on public.commande_fournisseur_lot for all
  to authenticated
  using (public.current_role_has_permission('commandes_fournisseur.consolidation'))
  with check (public.current_role_has_permission('commandes_fournisseur.consolidation'));

drop policy if exists "cflot select achat" on public.commande_fournisseur_lot;
create policy "cflot select achat"
  on public.commande_fournisseur_lot for select
  to authenticated
  using (public.current_role_has_permission('commandes_fournisseur.achat'));

-- inclusion
drop policy if exists "cfloti all consolidation" on public.commande_fournisseur_lot_inclusion;
create policy "cfloti all consolidation"
  on public.commande_fournisseur_lot_inclusion for all
  to authenticated
  using (public.current_role_has_permission('commandes_fournisseur.consolidation'))
  with check (public.current_role_has_permission('commandes_fournisseur.consolidation'));

-- lot_ligne : gestion + achat (lecture / maj achat)
drop policy if exists "cfll select" on public.commande_fournisseur_lot_ligne;
create policy "cfll select"
  on public.commande_fournisseur_lot_ligne for select
  to authenticated
  using (
    public.current_role_has_permission('commandes_fournisseur.consolidation')
    or public.current_role_has_permission('commandes_fournisseur.achat')
  );

drop policy if exists "cfll write consolidation" on public.commande_fournisseur_lot_ligne;
create policy "cfll write consolidation"
  on public.commande_fournisseur_lot_ligne for all
  to authenticated
  using (public.current_role_has_permission('commandes_fournisseur.consolidation'))
  with check (public.current_role_has_permission('commandes_fournisseur.consolidation'));

drop policy if exists "cfll update achat" on public.commande_fournisseur_lot_ligne;
create policy "cfll update achat"
  on public.commande_fournisseur_lot_ligne for update
  to authenticated
  using (
    public.current_role_has_permission('commandes_fournisseur.achat')
    and exists (
      select 1
      from public.commande_fournisseur_lot l
      where l.id = commande_fournisseur_lot_ligne.lot_id
        and l.status in ('prete', 'terminee')
    )
  )
  with check (
    public.current_role_has_permission('commandes_fournisseur.achat')
  );

-- lot_ligne_magasin
drop policy if exists "cfllm select" on public.commande_fournisseur_lot_ligne_magasin;
create policy "cfllm select"
  on public.commande_fournisseur_lot_ligne_magasin for select
  to authenticated
  using (
    public.current_role_has_permission('commandes_fournisseur.consolidation')
    or public.current_role_has_permission('commandes_fournisseur.achat')
  );

drop policy if exists "cfllm write consolidation" on public.commande_fournisseur_lot_ligne_magasin;
create policy "cfllm write consolidation"
  on public.commande_fournisseur_lot_ligne_magasin for all
  to authenticated
  using (public.current_role_has_permission('commandes_fournisseur.consolidation'))
  with check (public.current_role_has_permission('commandes_fournisseur.consolidation'));

-- frais
drop policy if exists "cflf select" on public.commande_fournisseur_lot_frais;
create policy "cflf select"
  on public.commande_fournisseur_lot_frais for select
  to authenticated
  using (
    public.current_role_has_permission('commandes_fournisseur.consolidation')
    or public.current_role_has_permission('commandes_fournisseur.achat')
  );

drop policy if exists "cflf write consolidation" on public.commande_fournisseur_lot_frais;
create policy "cflf write consolidation"
  on public.commande_fournisseur_lot_frais for all
  to authenticated
  using (public.current_role_has_permission('commandes_fournisseur.consolidation'))
  with check (public.current_role_has_permission('commandes_fournisseur.consolidation'));

drop policy if exists "cflf write achat" on public.commande_fournisseur_lot_frais;
create policy "cflf write achat"
  on public.commande_fournisseur_lot_frais for insert
  to authenticated
  with check (
    public.current_role_has_permission('commandes_fournisseur.achat')
  );

create policy "cflf update achat"
  on public.commande_fournisseur_lot_frais for update
  to authenticated
  using (public.current_role_has_permission('commandes_fournisseur.achat'))
  with check (public.current_role_has_permission('commandes_fournisseur.achat'));

create policy "cflf delete achat"
  on public.commande_fournisseur_lot_frais for delete
  to authenticated
  using (public.current_role_has_permission('commandes_fournisseur.achat'));

comment on table public.commande_fournisseur is 'Commande fournisseur au niveau magasin (caissier).';
comment on table public.commande_fournisseur_lot is 'Lot consolidé multi-magasins (gestionnaire, puis achat).';
