-- Réouverture lot achat : terminee → prete (permission commandes_fournisseur.achat).

drop policy if exists "cflot update achat reopen" on public.commande_fournisseur_lot;

create policy "cflot update achat reopen"
  on public.commande_fournisseur_lot for update
  to authenticated
  using (
    public.current_role_has_permission('commandes_fournisseur.achat')
    and commande_fournisseur_lot.status = 'terminee'
  )
  with check (
    public.current_role_has_permission('commandes_fournisseur.achat')
    and commande_fournisseur_lot.status = 'prete'
  );
