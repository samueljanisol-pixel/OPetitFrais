-- Devise d'achat par vendeur : Dirham (défaut) ou Rial (1 DH = 20 Rial).
-- Les montants lot (prix_achat_unitaire, montant_ligne_achat) restent toujours en DH.

alter table public.ref_supplier_vendeur
  add column if not exists devise_achat text not null default 'dirham';

alter table public.ref_supplier_vendeur
  drop constraint if exists ref_supplier_vendeur_devise_achat_check;

alter table public.ref_supplier_vendeur
  add constraint ref_supplier_vendeur_devise_achat_check
  check (devise_achat in ('dirham', 'rial'));

comment on column public.ref_supplier_vendeur.devise_achat is
  'Devise de saisie achat pour ce vendeur : dirham ou rial (1 DH = 20 Rial). Stockage lot toujours en DH.';
