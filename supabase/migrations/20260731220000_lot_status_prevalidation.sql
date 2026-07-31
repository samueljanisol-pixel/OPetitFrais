-- Étape intermédiaire : prévalidation (gestionnaire) → prête pour l'achat (administrateur).

alter table public.commande_fournisseur_lot
  drop constraint if exists commande_fournisseur_lot_status_check;

alter table public.commande_fournisseur_lot
  add constraint commande_fournisseur_lot_status_check
  check (status in ('brouillon', 'prevalidation', 'prete', 'achat_en_cours', 'terminee'));

insert into public.ref_status_label (domain, status_code, label, sort_order)
values ('commande_fournisseur_lot', 'prevalidation', 'Prévalidation', 15)
on conflict (domain, status_code) do update
set label = excluded.label,
    sort_order = excluded.sort_order;

-- Commentaires vendeur : édition consolidation en prévalidation (admin).
drop policy if exists "lot vendeur comment write consolidation" on public.commande_fournisseur_lot_vendeur_comment;
create policy "lot vendeur comment write consolidation"
  on public.commande_fournisseur_lot_vendeur_comment for all
  to authenticated
  using (
    public.current_role_has_permission('commandes_fournisseur.consolidation')
    and exists (
      select 1
      from public.commande_fournisseur_lot l
      where l.id = lot_id
        and l.status in ('brouillon', 'prevalidation', 'prete', 'achat_en_cours')
    )
  )
  with check (
    public.current_role_has_permission('commandes_fournisseur.consolidation')
    and exists (
      select 1
      from public.commande_fournisseur_lot l
      where l.id = lot_id
        and l.status in ('brouillon', 'prevalidation', 'prete', 'achat_en_cours')
    )
  );

-- Sync lignes commande depuis lot : prévalidation (révision admin).
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
      inner join public.commande_fournisseur_lot l on l.id = i.lot_id
        and l.status in ('brouillon', 'prevalidation')
      where cf.id = commande_fournisseur_ligne.commande_id
        and cf.status in ('validee', 'integree')
    )
  );
