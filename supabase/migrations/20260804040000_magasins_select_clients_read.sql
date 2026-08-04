-- Lecture magasins pour affichage panier client (embed shop_cart_pos_link → magasins).

drop policy if exists "magasins select" on public.magasins;
create policy "magasins select"
  on public.magasins for select
  to authenticated
  using (
    public.current_role_has_permission('admin.magasins')
    or public.current_role_has_permission('commandes_fournisseur.consolidation')
    or public.current_role_has_permission('commandes_fournisseur.achat')
    or public.current_role_has_permission('clients.read')
    or public.current_role_has_permission('commandes_client.read')
    or exists (
      select 1
      from public.profile_magasins pm
      where pm.magasin_id = magasins.id
        and pm.user_id = auth.uid()
    )
  );

comment on policy "magasins select" on public.magasins is
  'Lecture : admin, profil-magasin, commandes fournisseur, clients, commandes client boutique.';
