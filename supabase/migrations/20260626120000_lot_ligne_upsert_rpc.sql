-- Fusionne les doublons existants (même lot + produit + conditionnement) puis upsert atomique côté serveur.

do $$
declare
  v_null uuid := '00000000-0000-0000-0000-000000000000'::uuid;
begin
  -- Somme des qtés sur la ligne conservée (id min), suppression des autres.
  with grouped as (
    select
      lot_id,
      product_id,
      coalesce(product_packaging_id, v_null) as pack_key,
      (min(id::text))::uuid as keep_id,
      sum(coalesce(qte_achat, 0)) as total_qte
    from public.commande_fournisseur_lot_ligne
    group by lot_id, product_id, coalesce(product_packaging_id, v_null)
    having count(*) > 1
  ),
  updated as (
    update public.commande_fournisseur_lot_ligne ll
    set qte_achat = g.total_qte
    from grouped g
    where ll.id = g.keep_id
    returning g.lot_id, g.product_id, g.pack_key, g.keep_id
  )
  delete from public.commande_fournisseur_lot_ligne ll
  using grouped g
  where ll.lot_id = g.lot_id
    and ll.product_id = g.product_id
    and coalesce(ll.product_packaging_id, v_null) = g.pack_key
    and ll.id <> g.keep_id;
end;
$$;

create or replace function public.upsert_commande_fournisseur_lot_ligne(
  p_lot_id uuid,
  p_product_id uuid,
  p_product_packaging_id uuid,
  p_qte_achat numeric,
  p_vendeur_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_null uuid := '00000000-0000-0000-0000-000000000000'::uuid;
  v_packaging uuid := null;
begin
  if p_product_packaging_id is not null and p_product_packaging_id <> v_null then
    v_packaging := p_product_packaging_id;
  end if;

  perform pg_advisory_xact_lock(
    hashtext(
      p_lot_id::text || '|' || p_product_id::text || '|' || coalesce(v_packaging, v_null)::text
    )
  );

  insert into public.commande_fournisseur_lot_ligne (
    lot_id,
    product_id,
    product_packaging_id,
    qte_achat,
    vendeur_id
  )
  values (
    p_lot_id,
    p_product_id,
    v_packaging,
    coalesce(p_qte_achat, 0),
    p_vendeur_id
  )
  on conflict (
    lot_id,
    product_id,
    (coalesce(product_packaging_id, '00000000-0000-0000-0000-000000000000'::uuid))
  )
  do update set
    qte_achat = coalesce(commande_fournisseur_lot_ligne.qte_achat, 0)
      + coalesce(excluded.qte_achat, 0),
    vendeur_id = coalesce(
      commande_fournisseur_lot_ligne.vendeur_id,
      excluded.vendeur_id
    )
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.upsert_commande_fournisseur_lot_ligne(uuid, uuid, uuid, numeric, uuid) is
  'Insert ou cumule qte_achat pour (lot, produit, conditionnement) — aligné sur l’index unique coalesce(product_packaging_id).';

revoke all on function public.upsert_commande_fournisseur_lot_ligne(uuid, uuid, uuid, numeric, uuid) from public;
grant execute on function public.upsert_commande_fournisseur_lot_ligne(uuid, uuid, uuid, numeric, uuid) to service_role;
