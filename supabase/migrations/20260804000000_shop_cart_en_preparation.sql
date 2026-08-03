-- Étape « en préparation » + commentaire préparateur

alter table public.shop_cart
  add column if not exists preparation_comment text;

comment on column public.shop_cart.preparation_comment is
  'Commentaire du préparateur (ruptures, substitutions, etc.).';

alter table public.shop_cart drop constraint if exists shop_cart_workflow_status_check;

alter table public.shop_cart
  add constraint shop_cart_workflow_status_check check (
    workflow_status is null or workflow_status in (
      'nouvelle',
      'a_valider',
      'a_preparer',
      'en_preparation',
      'a_passer_caisse',
      'a_livrer',
      'a_retirer',
      'en_livraison',
      'livre_paye',
      'livre_espece_a_encaisser',
      'livre_non_paye',
      'retire_paye',
      'retire_espece_a_encaisser',
      'retire_compte_client',
      'annulee'
    )
  );
