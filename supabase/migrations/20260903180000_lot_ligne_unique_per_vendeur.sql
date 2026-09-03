-- Même produit + conditionnement autorisés sur plusieurs vendeurs d'un lot (achat Marché).
-- Remplace l'unicité (lot, produit, cond.) par (lot, produit, cond., vendeur).

drop index if exists public.commande_fournisseur_lot_ligne_lot_product_pack_uniq;

create unique index commande_fournisseur_lot_ligne_lot_product_pack_vendeur_uniq
  on public.commande_fournisseur_lot_ligne (
    lot_id,
    product_id,
    coalesce(product_packaging_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(vendeur_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

comment on index public.commande_fournisseur_lot_ligne_lot_product_pack_vendeur_uniq is
  'Une ligne de lot par couple (produit, conditionnement, vendeur) ; packaging/vendeur null → UUID nul coalescé.';

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
  v_vendeur uuid := null;
begin
  if p_product_packaging_id is not null and p_product_packaging_id <> v_null then
    v_packaging := p_product_packaging_id;
  end if;
  if p_vendeur_id is not null and p_vendeur_id <> v_null then
    v_vendeur := p_vendeur_id;
  end if;

  perform pg_advisory_xact_lock(
    hashtext(
      p_lot_id::text || '|' || p_product_id::text || '|' || coalesce(v_packaging, v_null)::text
        || '|' || coalesce(v_vendeur, v_null)::text
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
    v_vendeur
  )
  on conflict (
    lot_id,
    product_id,
    (coalesce(product_packaging_id, '00000000-0000-0000-0000-000000000000'::uuid)),
    (coalesce(vendeur_id, '00000000-0000-0000-0000-000000000000'::uuid))
  )
  do update set
    qte_achat = coalesce(commande_fournisseur_lot_ligne.qte_achat, 0)
      + coalesce(excluded.qte_achat, 0)
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.upsert_commande_fournisseur_lot_ligne(uuid, uuid, uuid, numeric, uuid) is
  'Insert ou cumule qte_achat pour (lot, produit, conditionnement, vendeur).';
