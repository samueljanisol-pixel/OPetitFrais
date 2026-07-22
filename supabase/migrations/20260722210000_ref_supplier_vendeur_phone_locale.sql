-- Téléphone WhatsApp et langue d'export commande par vendeur marché.

alter table public.ref_supplier_vendeur
  add column if not exists phone text,
  add column if not exists preferred_locale text not null default 'fr';

alter table public.ref_supplier_vendeur
  drop constraint if exists ref_supplier_vendeur_preferred_locale_check;

alter table public.ref_supplier_vendeur
  add constraint ref_supplier_vendeur_preferred_locale_check
  check (preferred_locale in ('fr', 'ar-MA'));

comment on column public.ref_supplier_vendeur.phone is
  'Numéro mobile / WhatsApp du vendeur (chiffres, ex. 212612345678).';

comment on column public.ref_supplier_vendeur.preferred_locale is
  'Langue de l''export image commande vendeur : fr ou ar-MA.';
