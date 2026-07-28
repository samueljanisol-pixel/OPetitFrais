-- Achats emballages : fiches (ouvert / clôturé) + lignes.

create table if not exists public.emballage_achat_fiche (
  id uuid primary key default gen_random_uuid(),
  date_achat date not null default (current_date),
  statut text not null default 'ouvert',
  note text,
  cloture_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint emballage_achat_fiche_statut_check check (statut in ('ouvert', 'cloture'))
);

comment on table public.emballage_achat_fiche is
  'Bon d''achat emballages : ouvert pour saisie des lignes, clôturé une fois validé.';

create index if not exists idx_emballage_achat_fiche_date
  on public.emballage_achat_fiche (date_achat desc, created_at desc);

create index if not exists idx_emballage_achat_fiche_statut
  on public.emballage_achat_fiche (statut);

drop trigger if exists trg_emballage_achat_fiche_updated on public.emballage_achat_fiche;
create trigger trg_emballage_achat_fiche_updated
  before update on public.emballage_achat_fiche
  for each row execute function public.set_updated_at();

alter table public.emballage_achat_fiche enable row level security;

drop policy if exists "emballage_achat_fiche select" on public.emballage_achat_fiche;
create policy "emballage_achat_fiche select"
  on public.emballage_achat_fiche for select
  to authenticated
  using (
    public.current_role_has_permission('emballages.read')
    or public.current_role_has_permission('emballages.write')
  );

drop policy if exists "emballage_achat_fiche write" on public.emballage_achat_fiche;
create policy "emballage_achat_fiche write"
  on public.emballage_achat_fiche for all
  to authenticated
  using (public.current_role_has_permission('emballages.write'))
  with check (public.current_role_has_permission('emballages.write'));

grant select, insert, update, delete on public.emballage_achat_fiche to authenticated;

create table if not exists public.emballage_achat_ligne (
  id uuid primary key default gen_random_uuid(),
  fiche_id uuid not null references public.emballage_achat_fiche (id) on delete cascade,
  emballage_id uuid not null references public.ref_emballage (id) on delete restrict,
  quantite numeric(14, 4) not null check (quantite > 0),
  prix_unitaire numeric(14, 2) not null check (prix_unitaire >= 0),
  note text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.emballage_achat_ligne is
  'Ligne d''un bon d''achat emballages.';

create index if not exists idx_emballage_achat_ligne_fiche
  on public.emballage_achat_ligne (fiche_id);

create index if not exists idx_emballage_achat_ligne_emballage
  on public.emballage_achat_ligne (emballage_id);

drop trigger if exists trg_emballage_achat_ligne_updated on public.emballage_achat_ligne;
create trigger trg_emballage_achat_ligne_updated
  before update on public.emballage_achat_ligne
  for each row execute function public.set_updated_at();

alter table public.emballage_achat_ligne enable row level security;

drop policy if exists "emballage_achat_ligne select" on public.emballage_achat_ligne;
create policy "emballage_achat_ligne select"
  on public.emballage_achat_ligne for select
  to authenticated
  using (
    public.current_role_has_permission('emballages.read')
    or public.current_role_has_permission('emballages.write')
  );

drop policy if exists "emballage_achat_ligne write" on public.emballage_achat_ligne;
create policy "emballage_achat_ligne write"
  on public.emballage_achat_ligne for all
  to authenticated
  using (public.current_role_has_permission('emballages.write'))
  with check (public.current_role_has_permission('emballages.write'));

grant select, insert, update, delete on public.emballage_achat_ligne to authenticated;

-- Migration des anciennes lignes journal (emballage_achat) si la table existe encore.
do $$
declare
  r record;
  fid uuid;
begin
  if to_regclass('public.emballage_achat') is null then
    return;
  end if;

  for r in
    select id, emballage_id, date_achat, quantite, prix_unitaire, note, created_at, updated_at
    from public.emballage_achat
    order by date_achat, created_at
  loop
    insert into public.emballage_achat_fiche (date_achat, statut, note, cloture_at, created_at, updated_at)
    values (r.date_achat, 'cloture', null, r.created_at, r.created_at, r.updated_at)
    returning id into fid;

    insert into public.emballage_achat_ligne (
      fiche_id, emballage_id, quantite, prix_unitaire, note, sort_order, created_at, updated_at
    )
    values (fid, r.emballage_id, r.quantite, r.prix_unitaire, r.note, 1, r.created_at, r.updated_at);
  end loop;

  drop table public.emballage_achat;
end $$;
