-- Comptes par vendeur : paiement rattaché au vendeur ; suppression frais_generaux

alter table public.fournisseur_paiement
  add column if not exists vendeur_id uuid references public.ref_supplier_vendeur (id) on delete restrict;

create index if not exists idx_fp_vendeur on public.fournisseur_paiement (vendeur_id);

comment on column public.fournisseur_paiement.vendeur_id is
  'Compte vendeur Marché ; null = paiement compte Station (supplier_id).';

-- Supprimer achats frais_generaux non payés
delete from public.fournisseur_compte_achat fca
where fca.kind = 'frais_generaux'
  and not exists (
    select 1 from public.fournisseur_paiement_achat fpa where fpa.achat_id = fca.id
  );
