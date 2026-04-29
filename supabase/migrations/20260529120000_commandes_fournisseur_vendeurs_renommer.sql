-- Renommage vendeurs fournisseur : permission dédiée + RLS (lecture achete ou renommage ; écriture label si renommage).

insert into public.permissions (key, description, module, sort_order)
values (
  'commandes_fournisseur.vendeurs_renommer',
  'Modifier le nom affiché des vendeurs fournisseur',
  'commandes_fournisseur',
  93
)
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.slug = 'acheteur'
  and p.key = 'commandes_fournisseur.vendeurs_renommer'
on conflict do nothing;

drop policy if exists "ref_supplier_vendeur all authenticated" on public.ref_supplier_vendeur;

drop policy if exists "ref_supplier_vendeur select achat ou renommer" on public.ref_supplier_vendeur;
create policy "ref_supplier_vendeur select achat ou renommer"
  on public.ref_supplier_vendeur for select
  to authenticated
  using (
    public.current_role_has_permission('commandes_fournisseur.achat')
    or public.current_role_has_permission('commandes_fournisseur.vendeurs_renommer')
  );

drop policy if exists "ref_supplier_vendeur insert achat" on public.ref_supplier_vendeur;
create policy "ref_supplier_vendeur insert achat"
  on public.ref_supplier_vendeur for insert
  to authenticated
  with check (public.current_role_has_permission('commandes_fournisseur.achat'));

drop policy if exists "ref_supplier_vendeur update renommer" on public.ref_supplier_vendeur;
create policy "ref_supplier_vendeur update renommer"
  on public.ref_supplier_vendeur for update
  to authenticated
  using (public.current_role_has_permission('commandes_fournisseur.vendeurs_renommer'))
  with check (public.current_role_has_permission('commandes_fournisseur.vendeurs_renommer'));
