-- Ligne commande créée depuis la matrice lot (consolidation) pour commentaire / cohérence magasin.

drop policy if exists "cfl insert lot magasin sync consolidation" on public.commande_fournisseur_ligne;
create policy "cfl insert lot magasin sync consolidation"
  on public.commande_fournisseur_ligne for insert
  to authenticated
  with check (
    public.current_role_has_permission('commandes_fournisseur.consolidation')
    and qte >= 0
    and exists (
      select 1
      from public.commande_fournisseur cf
      inner join public.commande_fournisseur_lot_inclusion i on i.commande_id = cf.id
      inner join public.commande_fournisseur_lot l on l.id = i.lot_id and l.status = 'brouillon'
      where cf.id = commande_fournisseur_ligne.commande_id
        and cf.status in ('validee', 'integree')
    )
  );
