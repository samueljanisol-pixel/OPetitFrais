-- Gestion Charges : permissions, catégories éditables, feuilles mensuelles réelles.
-- Estimation récurrente (magasin_charge) conserve ; droits étendus à charges.*.

insert into public.permissions (key, description, module, sort_order) values
  ('charges.read', 'Consulter Gestion Charges (estimation et feuilles)', 'charges', 55),
  ('charges.write', 'Modifier Gestion Charges (estimation, catégories, feuilles)', 'charges', 56)
on conflict (key) do nothing;

-- Administrateur (full access) : catalogue des permissions pour l’UI rôles
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.slug = 'administrateur'
  and p.key in ('charges.read', 'charges.write')
on conflict do nothing;

-- Tout rôle ayant déjà parametres.write reçoit charges.write (+ read)
insert into public.role_permissions (role_id, permission_id)
select distinct rp.role_id, p_new.id
from public.role_permissions rp
join public.permissions p_old on p_old.id = rp.permission_id and p_old.key = 'parametres.write'
cross join public.permissions p_new
where p_new.key in ('charges.read', 'charges.write')
on conflict do nothing;

-- Catégories de charges (éditables)
create table if not exists public.ref_charge_categorie (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.ref_charge_categorie is
  'Catégories de charges (salaires, loyer, etc.) — référentiel éditable.';

create unique index if not exists idx_ref_charge_categorie_label_ci
  on public.ref_charge_categorie (lower(trim(label)));

drop trigger if exists trg_ref_charge_categorie_updated on public.ref_charge_categorie;
create trigger trg_ref_charge_categorie_updated
  before update on public.ref_charge_categorie
  for each row execute function public.set_updated_at();

alter table public.ref_charge_categorie enable row level security;

drop policy if exists "ref_charge_categorie select" on public.ref_charge_categorie;
create policy "ref_charge_categorie select"
  on public.ref_charge_categorie for select
  to authenticated
  using (
    public.current_role_has_permission('charges.read')
    or public.current_role_has_permission('charges.write')
    or public.current_role_has_permission('ventes.read')
  );

drop policy if exists "ref_charge_categorie write" on public.ref_charge_categorie;
create policy "ref_charge_categorie write"
  on public.ref_charge_categorie for all
  to authenticated
  using (public.current_role_has_permission('charges.write'))
  with check (public.current_role_has_permission('charges.write'));

grant select, insert, update, delete on public.ref_charge_categorie to authenticated;

insert into public.ref_charge_categorie (label, sort_order)
select v.label, v.sort_order
from (values
  ('Salaires', 10),
  ('Loyer', 20),
  ('Abonnement', 30),
  ('Consommable', 40)
) as v(label, sort_order)
where not exists (select 1 from public.ref_charge_categorie limit 1);

-- Feuille mensuelle de charges réelles
create table if not exists public.magasin_charge_feuille (
  id uuid primary key default gen_random_uuid(),
  ym text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint magasin_charge_feuille_ym_format check (ym ~ '^\d{4}-\d{2}$')
);

comment on table public.magasin_charge_feuille is
  'Feuille de charges réelles pour un mois calendaire (ym = YYYY-MM).';

create unique index if not exists idx_magasin_charge_feuille_ym
  on public.magasin_charge_feuille (ym);

drop trigger if exists trg_magasin_charge_feuille_updated on public.magasin_charge_feuille;
create trigger trg_magasin_charge_feuille_updated
  before update on public.magasin_charge_feuille
  for each row execute function public.set_updated_at();

alter table public.magasin_charge_feuille enable row level security;

drop policy if exists "magasin_charge_feuille select" on public.magasin_charge_feuille;
create policy "magasin_charge_feuille select"
  on public.magasin_charge_feuille for select
  to authenticated
  using (
    public.current_role_has_permission('charges.read')
    or public.current_role_has_permission('charges.write')
    or public.current_role_has_permission('ventes.read')
  );

drop policy if exists "magasin_charge_feuille write" on public.magasin_charge_feuille;
create policy "magasin_charge_feuille write"
  on public.magasin_charge_feuille for all
  to authenticated
  using (public.current_role_has_permission('charges.write'))
  with check (public.current_role_has_permission('charges.write'));

grant select, insert, update, delete on public.magasin_charge_feuille to authenticated;

-- Lignes de feuille
create table if not exists public.magasin_charge_feuille_ligne (
  id uuid primary key default gen_random_uuid(),
  feuille_id uuid not null references public.magasin_charge_feuille (id) on delete cascade,
  categorie_id uuid not null references public.ref_charge_categorie (id) on delete restrict,
  magasin_id uuid null references public.magasins (id) on delete cascade,
  label text not null,
  quantite numeric not null check (quantite > 0),
  prix numeric not null check (prix >= 0),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.magasin_charge_feuille_ligne is
  'Ligne de charge réelle : catégorie, magasin (null = général), libellé, qté, prix.';

create index if not exists idx_magasin_charge_feuille_ligne_feuille
  on public.magasin_charge_feuille_ligne (feuille_id);

create index if not exists idx_magasin_charge_feuille_ligne_categorie
  on public.magasin_charge_feuille_ligne (categorie_id);

create index if not exists idx_magasin_charge_feuille_ligne_magasin
  on public.magasin_charge_feuille_ligne (magasin_id);

drop trigger if exists trg_magasin_charge_feuille_ligne_updated on public.magasin_charge_feuille_ligne;
create trigger trg_magasin_charge_feuille_ligne_updated
  before update on public.magasin_charge_feuille_ligne
  for each row execute function public.set_updated_at();

alter table public.magasin_charge_feuille_ligne enable row level security;

drop policy if exists "magasin_charge_feuille_ligne select" on public.magasin_charge_feuille_ligne;
create policy "magasin_charge_feuille_ligne select"
  on public.magasin_charge_feuille_ligne for select
  to authenticated
  using (
    public.current_role_has_permission('charges.read')
    or public.current_role_has_permission('charges.write')
    or public.current_role_has_permission('ventes.read')
  );

drop policy if exists "magasin_charge_feuille_ligne write" on public.magasin_charge_feuille_ligne;
create policy "magasin_charge_feuille_ligne write"
  on public.magasin_charge_feuille_ligne for all
  to authenticated
  using (public.current_role_has_permission('charges.write'))
  with check (public.current_role_has_permission('charges.write'));

grant select, insert, update, delete on public.magasin_charge_feuille_ligne to authenticated;

-- Estimation : RLS élargi charges.* ; write = charges.write
drop policy if exists "magasin_charge select" on public.magasin_charge;
create policy "magasin_charge select"
  on public.magasin_charge for select
  to authenticated
  using (
    public.current_role_has_permission('charges.read')
    or public.current_role_has_permission('charges.write')
    or public.current_role_has_permission('parametres.read')
    or public.current_role_has_permission('parametres.write')
    or public.current_role_has_permission('ventes.read')
  );

drop policy if exists "magasin_charge write parametres" on public.magasin_charge;
create policy "magasin_charge write charges"
  on public.magasin_charge for all
  to authenticated
  using (public.current_role_has_permission('charges.write'))
  with check (public.current_role_has_permission('charges.write'));
