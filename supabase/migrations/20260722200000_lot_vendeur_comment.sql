-- Commentaire par vendeur (marchand) sur un lot consolidé — éditable en brouillon et prêt.

create table if not exists public.commande_fournisseur_lot_vendeur_comment (
  lot_id uuid not null references public.commande_fournisseur_lot (id) on delete cascade,
  vendeur_key text not null,
  commentaire text,
  updated_at timestamptz not null default now(),
  primary key (lot_id, vendeur_key)
);

create index if not exists idx_lot_vendeur_comment_lot
  on public.commande_fournisseur_lot_vendeur_comment (lot_id);

alter table public.commande_fournisseur_lot_vendeur_comment enable row level security;

drop policy if exists "lot vendeur comment select consolidation" on public.commande_fournisseur_lot_vendeur_comment;
create policy "lot vendeur comment select consolidation"
  on public.commande_fournisseur_lot_vendeur_comment for select
  to authenticated
  using (public.current_role_has_permission('commandes_fournisseur.consolidation'));

drop policy if exists "lot vendeur comment write consolidation" on public.commande_fournisseur_lot_vendeur_comment;
create policy "lot vendeur comment write consolidation"
  on public.commande_fournisseur_lot_vendeur_comment for all
  to authenticated
  using (
    public.current_role_has_permission('commandes_fournisseur.consolidation')
    and exists (
      select 1
      from public.commande_fournisseur_lot l
      where l.id = lot_id
        and l.status in ('brouillon', 'prete')
    )
  )
  with check (
    public.current_role_has_permission('commandes_fournisseur.consolidation')
    and exists (
      select 1
      from public.commande_fournisseur_lot l
      where l.id = lot_id
        and l.status in ('brouillon', 'prete')
    )
  );
