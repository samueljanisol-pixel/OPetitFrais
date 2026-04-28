-- Permettre la lecture des magasins pour consolidation / achat (embeds sur commande_fournisseur, lots, etc.) :
-- sans cela, un rôle n'ayant que commandes_fournisseur.consolidation (sans ligne profile_magasins par magasin)
-- peut sélectionner commande_fournisseur mais pas la relation magasins(), ce qui bloque l'API validation/pending.

drop policy if exists "magasins select" on public.magasins;
create policy "magasins select"
  on public.magasins for select
  to authenticated
  using (
    public.current_role_has_permission('admin.magasins')
    or public.current_role_has_permission('commandes_fournisseur.consolidation')
    or public.current_role_has_permission('commandes_fournisseur.achat')
    or exists (
      select 1
      from public.profile_magasins pm
      where pm.magasin_id = magasins.id
        and pm.user_id = auth.uid()
    )
  );

comment on policy "magasins select" on public.magasins is
  'Lecture : admin, rattachement profil-magasin, ou rôles commandes fournisseur multi-magasins (consolidation / achat).';
