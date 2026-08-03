-- Salariés : accès à tous les sites (magasin, cuisine, autre) pour les rôles RH

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
    )
    or (
      (
        public.current_role_has_permission('salaries.read')
        or public.current_role_has_permission('salaries.write')
      )
      and exists (
        select 1 from public.magasins m where m.id = p_magasin_id
      )
    );
$$;

comment on function public.current_user_can_access_magasin(uuid) is
  'Périmètre site : profile_magasins, admin / accès total, ou tout site si permission salariés.';
