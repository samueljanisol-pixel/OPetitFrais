-- Clôture partielle par vendeur (achat) + photos + commentaire.

create table if not exists public.commande_fournisseur_lot_vendeur_achat (
  lot_id uuid not null references public.commande_fournisseur_lot (id) on delete cascade,
  vendeur_key text not null,
  vendeur_id uuid references public.ref_supplier_vendeur (id) on delete set null,
  status text not null default 'ouvert'
    check (status in ('ouvert', 'cloture')),
  marque_cloture_at timestamptz,
  commentaire text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (lot_id, vendeur_key)
);

create index if not exists idx_lot_vendeur_achat_lot
  on public.commande_fournisseur_lot_vendeur_achat (lot_id);

create index if not exists idx_lot_vendeur_achat_status
  on public.commande_fournisseur_lot_vendeur_achat (lot_id, status);

comment on table public.commande_fournisseur_lot_vendeur_achat is
  'État clôture / commentaire achat par vendeur (ou Station via vendeur_key).';

comment on column public.commande_fournisseur_lot_vendeur_achat.vendeur_key is
  'UUID vendeur ou clé station __supplier_sole__.';

alter table public.commande_fournisseur_lot_vendeur_achat enable row level security;

drop policy if exists "lot vendeur achat select" on public.commande_fournisseur_lot_vendeur_achat;
create policy "lot vendeur achat select"
  on public.commande_fournisseur_lot_vendeur_achat for select
  to authenticated
  using (public.current_role_has_permission('commandes_fournisseur.achat'));

drop policy if exists "lot vendeur achat write" on public.commande_fournisseur_lot_vendeur_achat;
create policy "lot vendeur achat write"
  on public.commande_fournisseur_lot_vendeur_achat for all
  to authenticated
  using (
    public.current_role_has_permission('commandes_fournisseur.achat')
    and exists (
      select 1
      from public.commande_fournisseur_lot l
      where l.id = lot_id
        and l.status in ('prete', 'terminee')
    )
  )
  with check (
    public.current_role_has_permission('commandes_fournisseur.achat')
    and exists (
      select 1
      from public.commande_fournisseur_lot l
      where l.id = lot_id
        and l.status in ('prete', 'terminee')
    )
  );

-- Photos par vendeur
create table if not exists public.commande_fournisseur_lot_vendeur_photo (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.commande_fournisseur_lot (id) on delete cascade,
  vendeur_key text not null,
  storage_path text not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

create index if not exists idx_lot_vendeur_photo_lot_key
  on public.commande_fournisseur_lot_vendeur_photo (lot_id, vendeur_key);

comment on table public.commande_fournisseur_lot_vendeur_photo is
  'Photos rattachées à un achat vendeur (lot + vendeur_key).';

alter table public.commande_fournisseur_lot_vendeur_photo enable row level security;

drop policy if exists "lot vendeur photo select" on public.commande_fournisseur_lot_vendeur_photo;
create policy "lot vendeur photo select"
  on public.commande_fournisseur_lot_vendeur_photo for select
  to authenticated
  using (public.current_role_has_permission('commandes_fournisseur.achat'));

drop policy if exists "lot vendeur photo write" on public.commande_fournisseur_lot_vendeur_photo;
create policy "lot vendeur photo write"
  on public.commande_fournisseur_lot_vendeur_photo for all
  to authenticated
  using (
    public.current_role_has_permission('commandes_fournisseur.achat')
    and exists (
      select 1
      from public.commande_fournisseur_lot l
      where l.id = lot_id
        and l.status in ('prete', 'terminee')
    )
  )
  with check (
    public.current_role_has_permission('commandes_fournisseur.achat')
    and exists (
      select 1
      from public.commande_fournisseur_lot l
      where l.id = lot_id
        and l.status in ('prete', 'terminee')
    )
  );

-- Storage bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'achat-vendeur-photos',
  'achat-vendeur-photos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

drop policy if exists "read achat-vendeur-photos" on storage.objects;
drop policy if exists "insert achat-vendeur-photos" on storage.objects;
drop policy if exists "update achat-vendeur-photos" on storage.objects;
drop policy if exists "delete achat-vendeur-photos" on storage.objects;

create policy "read achat-vendeur-photos"
  on storage.objects for select to authenticated
  using (bucket_id = 'achat-vendeur-photos');

create policy "insert achat-vendeur-photos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'achat-vendeur-photos'
    and public.current_role_has_permission('commandes_fournisseur.achat')
  );

create policy "update achat-vendeur-photos"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'achat-vendeur-photos'
    and public.current_role_has_permission('commandes_fournisseur.achat')
  )
  with check (
    bucket_id = 'achat-vendeur-photos'
    and public.current_role_has_permission('commandes_fournisseur.achat')
  );

create policy "delete achat-vendeur-photos"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'achat-vendeur-photos'
    and public.current_role_has_permission('commandes_fournisseur.achat')
  );
