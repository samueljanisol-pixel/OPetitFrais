-- Catalogue produit : lire / créer des vendeurs fournisseur sans passer par Paramètres ou achat.

drop policy if exists "ref_supplier_vendeur select" on public.ref_supplier_vendeur;
create policy "ref_supplier_vendeur select"
  on public.ref_supplier_vendeur for select
  to authenticated
  using (
    public.current_role_has_permission('commandes_fournisseur.achat')
    or public.current_role_has_permission('commandes_fournisseur.vendeurs_renommer')
    or public.current_role_has_permission('parametres.read')
    or public.current_role_has_permission('parametres.write')
    or public.current_role_has_permission('produits.read')
    or public.current_role_has_permission('produits.write')
  );

drop policy if exists "ref_supplier_vendeur insert achat" on public.ref_supplier_vendeur;
create policy "ref_supplier_vendeur insert achat"
  on public.ref_supplier_vendeur for insert
  to authenticated
  with check (
    public.current_role_has_permission('commandes_fournisseur.achat')
    or public.current_role_has_permission('parametres.write')
    or public.current_role_has_permission('produits.write')
  );
