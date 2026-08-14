-- Date de livraison souhaitée (Station, Marché) — commande magasin et lot consolidé.

alter table public.commande_fournisseur
  add column if not exists date_livraison date;

alter table public.commande_fournisseur_lot
  add column if not exists date_livraison date;

comment on column public.commande_fournisseur.date_livraison is
  'Date de livraison souhaitée (fournisseurs Station et Marché).';

comment on column public.commande_fournisseur_lot.date_livraison is
  'Date de livraison du lot ; toutes les commandes incluses partagent cette date.';
