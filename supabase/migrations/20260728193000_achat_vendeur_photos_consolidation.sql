-- Permettre à la consolidation d'enregistrer l'image commande (WhatsApp) dans les photos achat vendeur.

drop policy if exists "lot vendeur photo select" on public.commande_fournisseur_lot_vendeur_photo;
create policy "lot vendeur photo select"
  on public.commande_fournisseur_lot_vendeur_photo for select
  to authenticated
  using (
    public.current_role_has_permission('commandes_fournisseur.achat')
    or public.current_role_has_permission('commandes_fournisseur.consolidation')
  );

drop policy if exists "lot vendeur photo write" on public.commande_fournisseur_lot_vendeur_photo;
create policy "lot vendeur photo write"
  on public.commande_fournisseur_lot_vendeur_photo for all
  to authenticated
  using (
    public.current_role_has_permission('commandes_fournisseur.achat')
    and exists (
      select 1
      from public.commande_fournisseur_lot l
      where l.id = lot_id
        and l.status in ('prete', 'terminee')
    )
  )
  with check (
    public.current_role_has_permission('commandes_fournisseur.achat')
    and exists (
      select 1
      from public.commande_fournisseur_lot l
      where l.id = lot_id
        and l.status in ('prete', 'terminee')
    )
  );

drop policy if exists "lot vendeur photo insert consolidation" on public.commande_fournisseur_lot_vendeur_photo;
create policy "lot vendeur photo insert consolidation"
  on public.commande_fournisseur_lot_vendeur_photo for insert
  to authenticated
  with check (
    public.current_role_has_permission('commandes_fournisseur.consolidation')
    and exists (
      select 1
      from public.commande_fournisseur_lot l
      where l.id = lot_id
        and l.status = 'prete'
    )
  );

drop policy if exists "lot vendeur photo update consolidation" on public.commande_fournisseur_lot_vendeur_photo;
create policy "lot vendeur photo update consolidation"
  on public.commande_fournisseur_lot_vendeur_photo for update
  to authenticated
  using (
    public.current_role_has_permission('commandes_fournisseur.consolidation')
    and exists (
      select 1
      from public.commande_fournisseur_lot l
      where l.id = lot_id
        and l.status = 'prete'
    )
  )
  with check (
    public.current_role_has_permission('commandes_fournisseur.consolidation')
    and exists (
      select 1
      from public.commande_fournisseur_lot l
      where l.id = lot_id
        and l.status = 'prete'
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
    )
  )
  with check (
    bucket_id = 'achat-vendeur-photos'
    and (
      public.current_role_has_permission('commandes_fournisseur.achat')
      or public.current_role_has_permission('commandes_fournisseur.consolidation')
    )
  );
