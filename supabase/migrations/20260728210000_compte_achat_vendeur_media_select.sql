-- Lecture commentaire / photos vendeur depuis les comptes fournisseurs.

drop policy if exists "lot vendeur achat select" on public.commande_fournisseur_lot_vendeur_achat;
create policy "lot vendeur achat select"
  on public.commande_fournisseur_lot_vendeur_achat for select
  to authenticated
  using (
    public.current_role_has_permission('commandes_fournisseur.achat')
    or public.current_role_has_permission('commandes_fournisseur.comptes')
  );

drop policy if exists "lot vendeur photo select" on public.commande_fournisseur_lot_vendeur_photo;
create policy "lot vendeur photo select"
  on public.commande_fournisseur_lot_vendeur_photo for select
  to authenticated
  using (
    public.current_role_has_permission('commandes_fournisseur.achat')
    or public.current_role_has_permission('commandes_fournisseur.consolidation')
    or public.current_role_has_permission('commandes_fournisseur.comptes')
  );
