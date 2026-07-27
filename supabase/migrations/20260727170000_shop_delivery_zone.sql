-- Zone de livraison vitrine + adresses magasins publiques + réglages contact / retrait.

alter table public.magasins
  add column if not exists adresse text,
  add column if not exists ville text,
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists google_maps_url text,
  add column if not exists visible_vitrine boolean not null default false;

comment on column public.magasins.adresse is 'Adresse publique (vitrine /livraison).';
comment on column public.magasins.ville is 'Ville affichée vitrine.';
comment on column public.magasins.lat is 'Latitude WGS84 pour marqueur carte.';
comment on column public.magasins.lng is 'Longitude WGS84 pour marqueur carte.';
comment on column public.magasins.google_maps_url is 'Lien Google Maps (fiche magasin).';
comment on column public.magasins.visible_vitrine is 'Afficher ce magasin sur la carte boutique /livraison.';

alter table public.magasins
  drop constraint if exists magasins_lat_lng_pair;
alter table public.magasins
  add constraint magasins_lat_lng_pair
  check (
    (lat is null and lng is null)
    or (
      lat is not null and lng is not null
      and lat between -90 and 90
      and lng between -180 and 180
    )
  );

create table if not exists public.shop_delivery_zone (
  id uuid primary key default gen_random_uuid(),
  label text not null default 'Zone de livraison',
  geojson jsonb not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shop_delivery_zone_label_trim check (length(trim(label)) >= 1),
  constraint shop_delivery_zone_geojson_object check (jsonb_typeof(geojson) = 'object')
);

comment on table public.shop_delivery_zone is
  'Polygone(s) de zone de livraison boutique (GeoJSON Polygon ou MultiPolygon).';

create unique index if not exists shop_delivery_zone_one_active
  on public.shop_delivery_zone ((active))
  where active = true;

alter table public.shop_delivery_zone enable row level security;

drop policy if exists "shop_delivery_zone select admin" on public.shop_delivery_zone;
create policy "shop_delivery_zone select admin"
  on public.shop_delivery_zone for select
  to authenticated
  using (
    public.current_role_has_permission('admin.magasins')
    or public.current_role_has_permission('parametres.read')
    or public.current_role_has_permission('parametres.write')
  );

drop policy if exists "shop_delivery_zone write admin" on public.shop_delivery_zone;
create policy "shop_delivery_zone write admin"
  on public.shop_delivery_zone for all
  to authenticated
  using (
    public.current_role_has_permission('admin.magasins')
    or public.current_role_has_permission('parametres.write')
  )
  with check (
    public.current_role_has_permission('admin.magasins')
    or public.current_role_has_permission('parametres.write')
  );

-- Clés documentées (valeurs saisies en Paramètres) :
-- shop_contact_phone : numéro international sans +
-- shop_pickup_magasin_id : UUID magasins (retrait boutique)
comment on table public.ref_app_setting is
  'Paramètres applicatifs clé/valeur (chauffeur_user_id, shop_contact_phone, shop_pickup_magasin_id, …).';
