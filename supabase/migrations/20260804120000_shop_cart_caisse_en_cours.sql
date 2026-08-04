-- Statuts caisse : en cours / en attente au POS

alter table public.shop_cart drop constraint if exists shop_cart_workflow_status_check;

alter table public.shop_cart
  add constraint shop_cart_workflow_status_check check (
    workflow_status is null or workflow_status in (
      'nouvelle',
      'a_valider',
      'a_preparer',
      'en_preparation',
      'a_passer_caisse',
      'en_cours_caisse',
      'en_attente_caisse',
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

comment on column public.shop_cart.workflow_status is
  'Workflow commande boutique. en_cours_caisse / en_attente_caisse = prise en charge POS.';

drop index if exists public.shop_cart_caisse_lock_idx;

create index if not exists shop_cart_caisse_lock_idx
  on public.shop_cart (magasin_id, workflow_status)
  where caisse_locked_at is not null
    and workflow_status in ('a_passer_caisse', 'en_cours_caisse', 'en_attente_caisse');
