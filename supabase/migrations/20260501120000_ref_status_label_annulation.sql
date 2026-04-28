-- Libellés de statuts (paramètres administrateur) + commande « annulee » + RLS mise à jour

-- ---------------------------------------------------------------------------
-- ref_status_label : libellés par domaine métier / code stable de statut
-- ---------------------------------------------------------------------------

create table if not exists public.ref_status_label (
  id uuid primary key default gen_random_uuid(),
  domain text not null,
  status_code text not null,
  label text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ref_status_label_domain_code_unique unique (domain, status_code)
);

comment on table public.ref_status_label is
  'Libellés affichables des statuts par domaine (commandes fournisseur, lots, futures factures/BC).';

create index if not exists idx_ref_status_label_domain_sort
  on public.ref_status_label (domain, sort_order, status_code);

alter table public.ref_status_label enable row level security;

drop policy if exists "ref_status_label select authenticated" on public.ref_status_label;
create policy "ref_status_label select authenticated"
  on public.ref_status_label for select
  to authenticated
  using (true);

drop policy if exists "ref_status_label insert admin" on public.ref_status_label;
create policy "ref_status_label insert admin"
  on public.ref_status_label for insert
  to authenticated
  with check (public.current_user_is_administrateur());

drop policy if exists "ref_status_label update admin" on public.ref_status_label;
create policy "ref_status_label update admin"
  on public.ref_status_label for update
  to authenticated
  using (public.current_user_is_administrateur())
  with check (public.current_user_is_administrateur());

drop policy if exists "ref_status_label delete admin" on public.ref_status_label;
create policy "ref_status_label delete admin"
  on public.ref_status_label for delete
  to authenticated
  using (public.current_user_is_administrateur());

grant select on public.ref_status_label to authenticated;

-- Seed (idempotent)
insert into public.ref_status_label (domain, status_code, label, sort_order) values
  ('commande_fournisseur', 'en_saisie', 'En saisie', 10),
  ('commande_fournisseur', 'validee', 'Validée', 20),
  ('commande_fournisseur', 'integree', 'Intégrée', 30),
  ('commande_fournisseur', 'annulee', 'Annulée', 40),
  ('commande_fournisseur_lot', 'brouillon', 'Brouillon', 10),
  ('commande_fournisseur_lot', 'prete', 'Prête', 20),
  ('commande_fournisseur_lot', 'terminee', 'Terminée', 30)
on conflict (domain, status_code) do update set
  label = excluded.label,
  sort_order = excluded.sort_order,
  updated_at = now();

drop trigger if exists trg_ref_status_label_updated on public.ref_status_label;
create trigger trg_ref_status_label_updated
  before update on public.ref_status_label
  for each row execute function public.commande_fournisseur_set_updated_at();

-- ---------------------------------------------------------------------------
-- commande_fournisseur : statut « annulee » + traçabilité annulation
-- ---------------------------------------------------------------------------

alter table public.commande_fournisseur drop constraint if exists commande_fournisseur_status_check;
alter table public.commande_fournisseur add constraint commande_fournisseur_status_check
  check (status in ('en_saisie', 'validee', 'integree', 'annulee'));

alter table public.commande_fournisseur add column if not exists cancelled_at timestamptz null;
alter table public.commande_fournisseur add column if not exists cancelled_by uuid null references auth.users (id) on delete set null;

comment on column public.commande_fournisseur.cancelled_at is
  'Renseigné lors du passage au statut annulee.';
comment on column public.commande_fournisseur.cancelled_by is
  'Utilisateur ayant demandé l’annulation.';

drop policy if exists "cf update" on public.commande_fournisseur;
create policy "cf update"
  on public.commande_fournisseur for update
  to authenticated
  using (
    (
      public.current_role_has_permission('commandes_fournisseur.saisie')
      and commande_fournisseur.status in ('en_saisie', 'validee')
      and (
        exists (
          select 1
          from public.profile_magasins pm
          where pm.user_id = auth.uid()
            and pm.magasin_id = commande_fournisseur.magasin_id
        )
        or public.current_user_is_administrateur()
      )
    )
    or public.current_role_has_permission('commandes_fournisseur.consolidation')
  )
  with check (
    (
      public.current_role_has_permission('commandes_fournisseur.saisie')
      and (
        exists (
          select 1
          from public.profile_magasins pm
          where pm.user_id = auth.uid()
            and pm.magasin_id = commande_fournisseur.magasin_id
        )
        or public.current_user_is_administrateur()
      )
      and commande_fournisseur.status in ('en_saisie', 'validee', 'annulee')
    )
    or public.current_role_has_permission('commandes_fournisseur.consolidation')
  );
