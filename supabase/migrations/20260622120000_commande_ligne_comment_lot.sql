-- Commentaire de ligne après intégration au lot (consolidation / achat).
-- Les policies « cfl update saisie » ne couvrent que cf.status = en_saisie.

drop policy if exists "cfl update line_comment consolidation" on public.commande_fournisseur_ligne;
create policy "cfl update line_comment consolidation"
  on public.commande_fournisseur_ligne for update
  to authenticated
  using (
    public.current_role_has_permission('commandes_fournisseur.consolidation')
    and exists (
      select 1
      from public.commande_fournisseur cf
      inner join public.commande_fournisseur_lot_inclusion i on i.commande_id = cf.id
      inner join public.commande_fournisseur_lot l on l.id = i.lot_id and l.status = 'brouillon'
      where cf.id = commande_fournisseur_ligne.commande_id
        and cf.status in ('validee', 'integree')
    )
  )
  with check (
    public.current_role_has_permission('commandes_fournisseur.consolidation')
    and exists (
      select 1
      from public.commande_fournisseur cf
      inner join public.commande_fournisseur_lot_inclusion i on i.commande_id = cf.id
      inner join public.commande_fournisseur_lot l on l.id = i.lot_id and l.status = 'brouillon'
      where cf.id = commande_fournisseur_ligne.commande_id
        and cf.status in ('validee', 'integree')
    )
  );

drop policy if exists "cfl update line_comment achat" on public.commande_fournisseur_ligne;
create policy "cfl update line_comment achat"
  on public.commande_fournisseur_ligne for update
  to authenticated
  using (
    public.current_role_has_permission('commandes_fournisseur.achat')
    and exists (
      select 1
      from public.commande_fournisseur cf
      inner join public.commande_fournisseur_lot_inclusion i on i.commande_id = cf.id
      inner join public.commande_fournisseur_lot l on l.id = i.lot_id and l.status = 'prete'
      where cf.id = commande_fournisseur_ligne.commande_id
        and cf.status in ('validee', 'integree')
    )
  )
  with check (
    public.current_role_has_permission('commandes_fournisseur.achat')
    and exists (
      select 1
      from public.commande_fournisseur cf
      inner join public.commande_fournisseur_lot_inclusion i on i.commande_id = cf.id
      inner join public.commande_fournisseur_lot l on l.id = i.lot_id and l.status = 'prete'
      where cf.id = commande_fournisseur_ligne.commande_id
        and cf.status in ('validee', 'integree')
    )
  );
