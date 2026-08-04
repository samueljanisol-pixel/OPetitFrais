-- Lecture du lien ticket POS pour la fiche panier client (clients.read).

drop policy if exists "read shop_cart_pos_link clients.read" on public.shop_cart_pos_link;
create policy "read shop_cart_pos_link clients.read"
  on public.shop_cart_pos_link for select
  to authenticated
  using (public.current_role_has_permission('clients.read'));
