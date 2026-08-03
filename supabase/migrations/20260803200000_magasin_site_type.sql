-- Types de site : magasin (vente / CA), cuisine, autre (RH, périmètre utilisateur, etc.)

alter table public.magasins
  add column if not exists type text not null default 'magasin';

alter table public.magasins
  drop constraint if exists magasins_type_check;

alter table public.magasins
  add constraint magasins_type_check check (type in ('magasin', 'cuisine', 'autre'));

alter table public.magasins
  drop constraint if exists magasins_vitrine_magasin_only;

alter table public.magasins
  add constraint magasins_vitrine_magasin_only check (
    type = 'magasin' or visible_vitrine = false
  );

comment on column public.magasins.type is
  'Type de site : magasin (vente, CA, caisses, vitrine), cuisine (production), autre.';

create index if not exists idx_magasins_type_sort on public.magasins (type, sort_order, nom);
