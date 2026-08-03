-- Gestion des salariés par magasin

insert into public.permissions (key, description, module, sort_order) values
  ('salaries.read', 'Consulter les salariés et plannings', 'salaries', 60),
  ('salaries.write', 'Gérer les salariés (fiches, documents, paiements, planning)', 'salaries', 61)
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.slug = 'administrateur'
  and p.key in ('salaries.read', 'salaries.write')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.slug = 'gestionnaire'
  and p.key in ('salaries.read', 'salaries.write')
on conflict do nothing;

-- Accès magasin (aligné sur userHasMagasin côté API)
create or replace function public.current_user_can_access_magasin(p_magasin_id uuid)
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
    )
    or exists (
      select 1
      from public.profile_magasins pm
      where pm.user_id = auth.uid()
        and pm.magasin_id = p_magasin_id
    );
$$;

grant execute on function public.current_user_can_access_magasin(uuid) to authenticated;

-- Table principale
create table if not exists public.salarie (
  id uuid primary key default gen_random_uuid(),
  magasin_id uuid not null references public.magasins (id) on delete restrict,
  nom text,
  prenom text not null,
  date_arrivee date not null,
  date_depart date,
  notes text,
  profile_id uuid references public.profiles (user_id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint salarie_date_depart_after_arrivee check (
    date_depart is null or date_depart >= date_arrivee
  )
);

create index if not exists idx_salarie_magasin_nom
  on public.salarie (magasin_id, nom, prenom);

create index if not exists idx_salarie_magasin_actif
  on public.salarie (magasin_id)
  where date_depart is null;

comment on table public.salarie is
  'Salariés rattachés à un magasin (RH magasin, distinct des comptes utilisateurs app).';

-- Documents
create table if not exists public.salarie_document (
  id uuid primary key default gen_random_uuid(),
  salarie_id uuid not null references public.salarie (id) on delete cascade,
  label text not null,
  storage_path text not null,
  mime_type text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_salarie_document_salarie
  on public.salarie_document (salarie_id);

comment on table public.salarie_document is
  'Documents salarié (contrat, CIN, etc.) avec nom affiché personnalisé.';

-- Paiements et avances
create table if not exists public.salarie_paiement (
  id uuid primary key default gen_random_uuid(),
  salarie_id uuid not null references public.salarie (id) on delete cascade,
  kind text not null check (kind in ('salaire', 'avance')),
  montant numeric(14, 2) not null check (montant > 0),
  date_paiement date not null,
  payment_method_id uuid references public.ref_payment_method (id) on delete set null,
  commentaire text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_salarie_paiement_salarie_date
  on public.salarie_paiement (salarie_id, date_paiement desc);

comment on table public.salarie_paiement is
  'Paiements de salaire et avances sur salaire.';

-- Événements (maladie, congés)
create table if not exists public.salarie_evenement (
  id uuid primary key default gen_random_uuid(),
  salarie_id uuid not null references public.salarie (id) on delete cascade,
  kind text not null check (kind in ('malade', 'conge', 'autre')),
  date_debut date not null,
  date_fin date not null,
  commentaire text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint salarie_evenement_dates check (date_fin >= date_debut)
);

create index if not exists idx_salarie_evenement_salarie
  on public.salarie_evenement (salarie_id, date_debut desc);

-- Horaires récurrents (modèle par défaut)
create table if not exists public.salarie_horaire (
  id uuid primary key default gen_random_uuid(),
  salarie_id uuid not null references public.salarie (id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  is_repos boolean not null default false,
  heure_debut time,
  heure_fin time,
  constraint salarie_horaire_unique_day unique (salarie_id, day_of_week),
  constraint salarie_horaire_repos_heures check (
    (is_repos = true and heure_debut is null and heure_fin is null)
    or (is_repos = false and heure_debut is not null and heure_fin is not null and heure_fin > heure_debut)
  )
);

comment on column public.salarie_horaire.day_of_week is '0=lundi … 6=dimanche (ISO).';

-- Planning hebdomadaire (surcharges)
create table if not exists public.salarie_planning_shift (
  id uuid primary key default gen_random_uuid(),
  salarie_id uuid not null references public.salarie (id) on delete cascade,
  semaine date not null,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  kind text not null check (kind in ('travail', 'repos', 'malade', 'conge')),
  heure_debut time,
  heure_fin time,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint salarie_planning_shift_unique unique (salarie_id, semaine, day_of_week),
  constraint salarie_planning_shift_heures check (
    kind in ('repos', 'malade', 'conge')
    or (heure_debut is not null and heure_fin is not null and heure_fin > heure_debut)
  )
);

create index if not exists idx_salarie_planning_shift_lookup
  on public.salarie_planning_shift (semaine, salarie_id);

comment on column public.salarie_planning_shift.semaine is 'Lundi de la semaine ISO (YYYY-MM-DD).';

create or replace function public.salarie_magasin_access(p_salarie_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.salarie s
    where s.id = p_salarie_id
      and public.current_user_can_access_magasin(s.magasin_id)
  );
$$;

grant execute on function public.salarie_magasin_access(uuid) to authenticated;

-- Trigger updated_at salarie
drop trigger if exists trg_salarie_updated_at on public.salarie;
create trigger trg_salarie_updated_at
  before update on public.salarie
  for each row
  execute function public.set_updated_at();

-- RLS
alter table public.salarie enable row level security;
alter table public.salarie_document enable row level security;
alter table public.salarie_paiement enable row level security;
alter table public.salarie_evenement enable row level security;
alter table public.salarie_horaire enable row level security;
alter table public.salarie_planning_shift enable row level security;

-- salarie
drop policy if exists "salarie select" on public.salarie;
create policy "salarie select"
  on public.salarie for select
  to authenticated
  using (
    public.current_role_has_permission('salaries.read')
    and public.current_user_can_access_magasin(magasin_id)
  );

drop policy if exists "salarie write" on public.salarie;
create policy "salarie write"
  on public.salarie for all
  to authenticated
  using (
    public.current_role_has_permission('salaries.write')
    and public.current_user_can_access_magasin(magasin_id)
  )
  with check (
    public.current_role_has_permission('salaries.write')
    and public.current_user_can_access_magasin(magasin_id)
  );

-- Helper policy pattern for child tables
drop policy if exists "salarie_document select" on public.salarie_document;
create policy "salarie_document select"
  on public.salarie_document for select
  to authenticated
  using (
    public.current_role_has_permission('salaries.read')
    and public.salarie_magasin_access(salarie_id)
  );

drop policy if exists "salarie_document write" on public.salarie_document;
create policy "salarie_document write"
  on public.salarie_document for all
  to authenticated
  using (
    public.current_role_has_permission('salaries.write')
    and public.salarie_magasin_access(salarie_id)
  )
  with check (
    public.current_role_has_permission('salaries.write')
    and public.salarie_magasin_access(salarie_id)
  );

drop policy if exists "salarie_paiement select" on public.salarie_paiement;
create policy "salarie_paiement select"
  on public.salarie_paiement for select
  to authenticated
  using (
    public.current_role_has_permission('salaries.read')
    and public.salarie_magasin_access(salarie_id)
  );

drop policy if exists "salarie_paiement write" on public.salarie_paiement;
create policy "salarie_paiement write"
  on public.salarie_paiement for all
  to authenticated
  using (
    public.current_role_has_permission('salaries.write')
    and public.salarie_magasin_access(salarie_id)
  )
  with check (
    public.current_role_has_permission('salaries.write')
    and public.salarie_magasin_access(salarie_id)
  );

drop policy if exists "salarie_evenement select" on public.salarie_evenement;
create policy "salarie_evenement select"
  on public.salarie_evenement for select
  to authenticated
  using (
    public.current_role_has_permission('salaries.read')
    and public.salarie_magasin_access(salarie_id)
  );

drop policy if exists "salarie_evenement write" on public.salarie_evenement;
create policy "salarie_evenement write"
  on public.salarie_evenement for all
  to authenticated
  using (
    public.current_role_has_permission('salaries.write')
    and public.salarie_magasin_access(salarie_id)
  )
  with check (
    public.current_role_has_permission('salaries.write')
    and public.salarie_magasin_access(salarie_id)
  );

drop policy if exists "salarie_horaire select" on public.salarie_horaire;
create policy "salarie_horaire select"
  on public.salarie_horaire for select
  to authenticated
  using (
    public.current_role_has_permission('salaries.read')
    and public.salarie_magasin_access(salarie_id)
  );

drop policy if exists "salarie_horaire write" on public.salarie_horaire;
create policy "salarie_horaire write"
  on public.salarie_horaire for all
  to authenticated
  using (
    public.current_role_has_permission('salaries.write')
    and public.salarie_magasin_access(salarie_id)
  )
  with check (
    public.current_role_has_permission('salaries.write')
    and public.salarie_magasin_access(salarie_id)
  );

drop policy if exists "salarie_planning_shift select" on public.salarie_planning_shift;
create policy "salarie_planning_shift select"
  on public.salarie_planning_shift for select
  to authenticated
  using (
    public.current_role_has_permission('salaries.read')
    and public.salarie_magasin_access(salarie_id)
  );

drop policy if exists "salarie_planning_shift write" on public.salarie_planning_shift;
create policy "salarie_planning_shift write"
  on public.salarie_planning_shift for all
  to authenticated
  using (
    public.current_role_has_permission('salaries.write')
    and public.salarie_magasin_access(salarie_id)
  )
  with check (
    public.current_role_has_permission('salaries.write')
    and public.salarie_magasin_access(salarie_id)
  );

-- Storage bucket documents salariés
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'salaries-documents',
  'salaries-documents',
  true,
  10485760,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'application/pdf'
  ]
)
on conflict (id) do nothing;

drop policy if exists "read salaries-documents" on storage.objects;
drop policy if exists "insert salaries-documents" on storage.objects;
drop policy if exists "update salaries-documents" on storage.objects;
drop policy if exists "delete salaries-documents" on storage.objects;

create policy "read salaries-documents"
  on storage.objects for select to authenticated
  using (bucket_id = 'salaries-documents');

create policy "insert salaries-documents"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'salaries-documents'
    and public.current_role_has_permission('salaries.write')
  );

create policy "update salaries-documents"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'salaries-documents'
    and public.current_role_has_permission('salaries.write')
  )
  with check (
    bucket_id = 'salaries-documents'
    and public.current_role_has_permission('salaries.write')
  );

create policy "delete salaries-documents"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'salaries-documents'
    and public.current_role_has_permission('salaries.write')
  );
