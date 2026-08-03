-- Photos justificatives des paiements fournisseurs

create table if not exists public.fournisseur_paiement_photo (
  id uuid primary key default gen_random_uuid(),
  paiement_id uuid not null references public.fournisseur_paiement (id) on delete cascade,
  storage_path text not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

create index if not exists idx_fpp_paiement
  on public.fournisseur_paiement_photo (paiement_id);

comment on table public.fournisseur_paiement_photo is
  'Photos justificatives (reçu, virement, etc.) rattachées à un paiement fournisseur.';

alter table public.fournisseur_paiement_photo enable row level security;

drop policy if exists "fpp select comptes" on public.fournisseur_paiement_photo;
create policy "fpp select comptes"
  on public.fournisseur_paiement_photo for select
  to authenticated
  using (public.current_role_has_permission('commandes_fournisseur.comptes'));

drop policy if exists "fpp write comptes" on public.fournisseur_paiement_photo;
create policy "fpp write comptes"
  on public.fournisseur_paiement_photo for all
  to authenticated
  using (public.current_role_has_permission('commandes_fournisseur.comptes'))
  with check (public.current_role_has_permission('commandes_fournisseur.comptes'));

-- Storage bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'paiement-photos',
  'paiement-photos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

drop policy if exists "read paiement-photos" on storage.objects;
drop policy if exists "insert paiement-photos" on storage.objects;
drop policy if exists "update paiement-photos" on storage.objects;
drop policy if exists "delete paiement-photos" on storage.objects;

create policy "read paiement-photos"
  on storage.objects for select to authenticated
  using (bucket_id = 'paiement-photos');

create policy "insert paiement-photos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'paiement-photos'
    and public.current_role_has_permission('commandes_fournisseur.comptes')
  );

create policy "update paiement-photos"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'paiement-photos'
    and public.current_role_has_permission('commandes_fournisseur.comptes')
  )
  with check (
    bucket_id = 'paiement-photos'
    and public.current_role_has_permission('commandes_fournisseur.comptes')
  );

create policy "delete paiement-photos"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'paiement-photos'
    and public.current_role_has_permission('commandes_fournisseur.comptes')
  );
