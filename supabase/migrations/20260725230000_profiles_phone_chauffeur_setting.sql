-- Téléphone utilisateur (WhatsApp) + réglage chauffeur commandes fournisseur.

alter table public.profiles
  add column if not exists phone text;

comment on column public.profiles.phone is
  'Téléphone WhatsApp (format international sans +, ex. 212612345678).';

create table if not exists public.ref_app_setting (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);

comment on table public.ref_app_setting is
  'Paramètres applicatifs clé/valeur (ex. chauffeur_user_id = UUID profiles.user_id).';

alter table public.ref_app_setting enable row level security;

drop policy if exists "ref_app_setting select" on public.ref_app_setting;
create policy "ref_app_setting select"
  on public.ref_app_setting for select
  to authenticated
  using (
    public.current_role_has_permission('parametres.read')
    or public.current_role_has_permission('parametres.write')
    or public.current_role_has_permission('commandes_fournisseur.consolidation')
  );

drop policy if exists "ref_app_setting write parametres" on public.ref_app_setting;
create policy "ref_app_setting write parametres"
  on public.ref_app_setting for all
  to authenticated
  using (public.current_role_has_permission('parametres.write'))
  with check (public.current_role_has_permission('parametres.write'));
