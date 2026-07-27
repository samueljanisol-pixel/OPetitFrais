-- Charges fixes par magasin (ou générales) pour le bénéfice net estimé des stats CA.

create table if not exists public.magasin_charge (
  id uuid primary key default gen_random_uuid(),
  magasin_id uuid null references public.magasins (id) on delete cascade,
  label text not null,
  quantite numeric not null check (quantite > 0),
  prix numeric not null check (prix >= 0),
  periodicite text not null check (periodicite in ('jour', 'mois')),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.magasin_charge is
  'Charges magasins / générales (libellé, qté, prix, périodicité jour|mois). magasin_id null = charge générale.';

comment on column public.magasin_charge.magasin_id is
  'Magasin concerné ; null = charge générale (totaux globaux uniquement).';

create index if not exists idx_magasin_charge_magasin_id
  on public.magasin_charge (magasin_id);

drop trigger if exists trg_magasin_charge_updated on public.magasin_charge;
create trigger trg_magasin_charge_updated
  before update on public.magasin_charge
  for each row execute function public.set_updated_at();

alter table public.magasin_charge enable row level security;

drop policy if exists "magasin_charge select" on public.magasin_charge;
create policy "magasin_charge select"
  on public.magasin_charge for select
  to authenticated
  using (
    public.current_role_has_permission('parametres.read')
    or public.current_role_has_permission('parametres.write')
    or public.current_role_has_permission('ventes.read')
  );

drop policy if exists "magasin_charge write parametres" on public.magasin_charge;
create policy "magasin_charge write parametres"
  on public.magasin_charge for all
  to authenticated
  using (public.current_role_has_permission('parametres.write'))
  with check (public.current_role_has_permission('parametres.write'));

grant select, insert, update, delete on public.magasin_charge to authenticated;
