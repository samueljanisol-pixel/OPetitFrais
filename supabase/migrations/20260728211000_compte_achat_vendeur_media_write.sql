-- Écriture commentaire / photos vendeur depuis les comptes fournisseurs.

drop policy if exists "lot vendeur achat write comptes" on public.commande_fournisseur_lot_vendeur_achat;
create policy "lot vendeur achat write comptes"
  on public.commande_fournisseur_lot_vendeur_achat for all
  to authenticated
  using (
    public.current_role_has_permission('commandes_fournisseur.comptes')
    and exists (
      select 1
      from public.commande_fournisseur_lot l
      where l.id = lot_id
        and l.status in ('prete', 'achat_en_cours', 'terminee')
    )
  )
  with check (
    public.current_role_has_permission('commandes_fournisseur.comptes')
    and exists (
      select 1
      from public.commande_fournisseur_lot l
      where l.id = lot_id
        and l.status in ('prete', 'achat_en_cours', 'terminee')
    )
  );

drop policy if exists "lot vendeur photo write comptes" on public.commande_fournisseur_lot_vendeur_photo;
create policy "lot vendeur photo write comptes"
  on public.commande_fournisseur_lot_vendeur_photo for all
  to authenticated
  using (
    public.current_role_has_permission('commandes_fournisseur.comptes')
    and exists (
      select 1
      from public.commande_fournisseur_lot l
      where l.id = lot_id
        and l.status in ('prete', 'achat_en_cours', 'terminee')
    )
  )
  with check (
    public.current_role_has_permission('commandes_fournisseur.comptes')
    and exists (
      select 1
      from public.commande_fournisseur_lot l
      where l.id = lot_id
        and l.status in ('prete', 'achat_en_cours', 'terminee')
    )
  );

drop policy if exists "insert achat-vendeur-photos" on storage.objects;
create policy "insert achat-vendeur-photos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'achat-vendeur-photos'
    and (
      public.current_role_has_permission('commandes_fournisseur.achat')
      or public.current_role_has_permission('commandes_fournisseur.consolidation')
      or public.current_role_has_permission('commandes_fournisseur.comptes')
    )
  );

drop policy if exists "update achat-vendeur-photos" on storage.objects;
create policy "update achat-vendeur-photos"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'achat-vendeur-photos'
    and (
      public.current_role_has_permission('commandes_fournisseur.achat')
      or public.current_role_has_permission('commandes_fournisseur.consolidation')
      or public.current_role_has_permission('commandes_fournisseur.comptes')
    )
  )
  with check (
    bucket_id = 'achat-vendeur-photos'
    and (
      public.current_role_has_permission('commandes_fournisseur.achat')
      or public.current_role_has_permission('commandes_fournisseur.consolidation')
      or public.current_role_has_permission('commandes_fournisseur.comptes')
    )
  );

drop policy if exists "delete achat-vendeur-photos" on storage.objects;
create policy "delete achat-vendeur-photos"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'achat-vendeur-photos'
    and (
      public.current_role_has_permission('commandes_fournisseur.achat')
      or public.current_role_has_permission('commandes_fournisseur.comptes')
    )
  );
