-- Rôle « administrateur » : accès saisie commandes fournisseur sur tout magasin (sans exiger profile_magasins)

create or replace function public.current_user_is_administrateur()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    join public.roles r on r.id = p.role_id
    where p.user_id = auth.uid()
      and r.slug = 'administrateur'
  );
$$;

grant execute on function public.current_user_is_administrateur() to authenticated;

-- commande_fournisseur
drop policy if exists "cf select" on public.commande_fournisseur;
create policy "cf select"
  on public.commande_fournisseur for select
  to authenticated
  using (
    public.current_role_has_permission('commandes_fournisseur.consolidation')
    or (
      public.current_role_has_permission('commandes_fournisseur.saisie')
      and (
        exists (
          select 1
          from public.profile_magasins pm
          where pm.user_id = auth.uid()
            and pm.magasin_id = commande_fournisseur.magasin_id
        )
        or public.current_user_is_administrateur()
      )
    )
  );

drop policy if exists "cf insert saisie" on public.commande_fournisseur;
create policy "cf insert saisie"
  on public.commande_fournisseur for insert
  to authenticated
  with check (
    public.current_role_has_permission('commandes_fournisseur.saisie')
    and (
      exists (
        select 1
        from public.profile_magasins pm
        where pm.user_id = auth.uid()
          and pm.magasin_id = commande_fournisseur.magasin_id
      )
      or public.current_user_is_administrateur()
    )
  );

drop policy if exists "cf update" on public.commande_fournisseur;
create policy "cf update"
  on public.commande_fournisseur for update
  to authenticated
  using (
    (
      public.current_role_has_permission('commandes_fournisseur.saisie')
      and commande_fournisseur.status in ('en_saisie', 'validee')
      and (
        exists (
          select 1
          from public.profile_magasins pm
          where pm.user_id = auth.uid()
            and pm.magasin_id = commande_fournisseur.magasin_id
        )
        or public.current_user_is_administrateur()
      )
    )
    or public.current_role_has_permission('commandes_fournisseur.consolidation')
  )
  with check (
    (
      public.current_role_has_permission('commandes_fournisseur.saisie')
      and commande_fournisseur.status in ('en_saisie', 'validee')
      and (
        exists (
          select 1
          from public.profile_magasins pm
          where pm.user_id = auth.uid()
            and pm.magasin_id = commande_fournisseur.magasin_id
        )
        or public.current_user_is_administrateur()
      )
    )
    or public.current_role_has_permission('commandes_fournisseur.consolidation')
  );

drop policy if exists "cf delete" on public.commande_fournisseur;
create policy "cf delete"
  on public.commande_fournisseur for delete
  to authenticated
  using (
    commande_fournisseur.status = 'en_saisie'
    and public.current_role_has_permission('commandes_fournisseur.saisie')
    and (
      exists (
        select 1
        from public.profile_magasins pm
        where pm.user_id = auth.uid()
          and pm.magasin_id = commande_fournisseur.magasin_id
      )
      or public.current_user_is_administrateur()
    )
  );

-- lignes
drop policy if exists "cfl select" on public.commande_fournisseur_ligne;
create policy "cfl select"
  on public.commande_fournisseur_ligne for select
  to authenticated
  using (
    exists (
      select 1
      from public.commande_fournisseur cf
      where cf.id = commande_fournisseur_ligne.commande_id
        and (
          public.current_role_has_permission('commandes_fournisseur.consolidation')
          or (
            public.current_role_has_permission('commandes_fournisseur.saisie')
            and (
              exists (
                select 1
                from public.profile_magasins pm
                where pm.user_id = auth.uid()
                  and pm.magasin_id = cf.magasin_id
              )
              or public.current_user_is_administrateur()
            )
          )
        )
    )
  );

drop policy if exists "cfl write saisie" on public.commande_fournisseur_ligne;
create policy "cfl write saisie"
  on public.commande_fournisseur_ligne for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.commande_fournisseur cf
      where cf.id = commande_fournisseur_ligne.commande_id
        and cf.status = 'en_saisie'
        and public.current_role_has_permission('commandes_fournisseur.saisie')
        and (
          exists (
            select 1
            from public.profile_magasins pm
            where pm.user_id = auth.uid()
              and pm.magasin_id = cf.magasin_id
          )
          or public.current_user_is_administrateur()
        )
    )
  );

drop policy if exists "cfl update saisie" on public.commande_fournisseur_ligne;
create policy "cfl update saisie"
  on public.commande_fournisseur_ligne for update
  to authenticated
  using (
    exists (
      select 1
      from public.commande_fournisseur cf
      where cf.id = commande_fournisseur_ligne.commande_id
        and cf.status = 'en_saisie'
        and public.current_role_has_permission('commandes_fournisseur.saisie')
        and (
          exists (
            select 1
            from public.profile_magasins pm
            where pm.user_id = auth.uid()
              and pm.magasin_id = cf.magasin_id
          )
          or public.current_user_is_administrateur()
        )
    )
  )
  with check (
    exists (
      select 1
      from public.commande_fournisseur cf
      where cf.id = commande_fournisseur_ligne.commande_id
        and cf.status = 'en_saisie'
        and public.current_role_has_permission('commandes_fournisseur.saisie')
        and (
          exists (
            select 1
            from public.profile_magasins pm
            where pm.user_id = auth.uid()
              and pm.magasin_id = cf.magasin_id
          )
          or public.current_user_is_administrateur()
        )
    )
  );

drop policy if exists "cfl delete saisie" on public.commande_fournisseur_ligne;
create policy "cfl delete saisie"
  on public.commande_fournisseur_ligne for delete
  to authenticated
  using (
    exists (
      select 1
      from public.commande_fournisseur cf
      where cf.id = commande_fournisseur_ligne.commande_id
        and cf.status = 'en_saisie'
        and public.current_role_has_permission('commandes_fournisseur.saisie')
        and (
          exists (
            select 1
            from public.profile_magasins pm
            where pm.user_id = auth.uid()
              and pm.magasin_id = cf.magasin_id
          )
          or public.current_user_is_administrateur()
        )
    )
  );

comment on function public.current_user_is_administrateur() is
  'Vrai si le profil courant a le rôle système « administrateur » (slug).';
